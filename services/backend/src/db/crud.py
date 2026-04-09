"""
CRUD helpers for the ``User`` and ``Image`` models.
 
All functions accept an active ``Session`` as their first argument and do
**not** manage transactions themselves — callers are responsible for
committing or rolling back as needed (except where a commit is the
natural conclusion of the operation, e.g. ``create_image``).
 
Access control philosophy
--------------------------
- Regular users can only read, create, and delete **their own** images.
  Every image query therefore accepts an optional ``user_id`` parameter.
- Admin users can act on **any** image regardless of ownership.
  The admin check happens in the route layer (``routes_upload.py``), not here:
  routes simply omit ``user_id`` when the caller is an admin, which removes
  the ownership filter and exposes all rows.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from db.models import Image, User


# ---------------------------------------------------------------------------
# User CRUD
# ---------------------------------------------------------------------------

def get_user_by_email(db: Session, email: str) -> User | None:
    """Look up a user by their email address.
 
    Used during login to find the account to verify the password against,
    and during registration to check the email is not already taken.
 
    Args:
        db: Active database session.
        email: The email address to search for (case-sensitive).
 
    Returns:
        User | None: The matching ORM instance, or ``None`` if not found.
    """
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: int) -> User | None:
    """
    Look up a user by their primary key.
 
    Used by the JWT authentication dependency (``get_current_user``) after
    the token has been decoded and the user ID extracted.
 
    Args:
        db: Active database session.
        user_id: The integer primary key of the user.
 
    Returns:
        User | None: The matching ORM instance, or ``None`` if not found.
    """
    return db.query(User).filter(User.id == user_id).first()


def create_user(db: Session, email: str, password_hash: str) -> User:
    """
    Insert a new user record and return the persisted instance.
 
    The password must be hashed **before** calling this function.
    Plain-text passwords must never reach the database layer.
 
    New accounts are always created with ``is_admin=False``.
    Admin privileges are granted manually (directly in the DB or via a
    one-time setup script) — never through the public registration endpoint.
 
    Args:
        db: Active database session.
        email: Unique email address for the new account.
        hashed_password: Bcrypt hash of the user's chosen password.
 
    Returns:
        User: The newly created and refreshed ORM instance.
    """
    db_user = User(email=email, hashed_password=password_hash, is_admin=False)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


# ---------------------------------------------------------------------------
# Image CRUD
# ---------------------------------------------------------------------------


def create_image(
    db: Session,
    filename: str,
    original_name: str,
    size: int,
    unique_name: str,
    filepath: str,
    mimetype: str,
    upload_time: datetime,
    user_id: int,
) -> Image:
    """Insert a new image record and return the persisted instance.

    Args:
        db: Active database session.
        filename: Stored filename (same as ``unique_name`` in current implementation).
        original_name: Original filename without extension, sanitised.
        size: File size in bytes.
        unique_name: UUID-suffixed filename used as the unique identifier.
        filepath: Absolute path to the file on disk.
        mimetype: MIME type reported by the HTTP client (e.g. ``image/jpeg``).
        upload_time: UTC-aware datetime of the upload.
        user_id: Primary key of the user who is uploading this image.

    Returns:
        Image: The newly created and refreshed ORM instance.
    """
    db_image = Image(
        filename=filename,
        original_name=original_name,
        size=size,
        unique_name=unique_name,
        filepath=filepath,
        mimetype=mimetype,
        upload_time=upload_time,
        user_id=user_id, # Tie the image to its owner
    )
    db.add(db_image)
    db.commit()
    db.refresh(db_image)
    return db_image


def delete_image(db: Session, unique_name: str, user_id: int | None = None) -> bool:
    """Delete an image record by its unique name.

    When ``user_id`` is provided, the delete is scoped to that user's images
    only — a user cannot delete an image they don't own.
    When ``user_id`` is ``None`` (admin callers), ownership is not checked
    and any image can be deleted.

    Args:
        db: Active database session.
        unique_name: The ``unique_name`` of the image to delete.
        user_id: If provided, only delete if this user owns the image.
                 Pass ``None`` to skip the ownership check (admin use).

    Returns:
        bool: ``True`` if a record was found and deleted, ``False`` otherwise.
    """
    query = db.query(Image).filter(Image.unique_name == unique_name)

    # Scope to owner unless the caller is an admin (user_id=None)
    if user_id is not None:
        query = query.filter(Image.user_id == user_id)

    image = query.first()
    if image:
        db.delete(image)
        db.commit()
        return True
    return False


def get_image(db: Session, unique_name: str, user_id: int | None = None) -> Image | None:
    """Fetch a single image by its unique name.

    When ``user_id`` is provided, the query is scoped to that user's images.
    When ``user_id`` is ``None`` (admin callers), any image can be fetched.

    Args:
        db: Active database session.
        unique_name: The ``unique_name`` of the image to retrieve.
        user_id: If provided, only fetch if this user owns the image.
                 Pass ``None`` to skip the ownership check (admin use).

    Returns:
        Image | None: The ORM instance, or ``None`` if not found.
    """
    query = db.query(Image).filter(Image.unique_name == unique_name)

    # Scope to owner unless the caller is an admin (user_id=None)
    if user_id is not None:
        query = query.filter(Image.user_id == user_id)

    return query.first()


def get_images_paginated(
    db: Session,
    skip: int = 0,
    limit: int = 6,
    sort_by: str = "upload_time",
    sort_order: str = "desc",
    user_id: int | None = None,
) -> list[Image]:
    """Return a sorted, paginated slice of images.

    When ``user_id`` is provided, only images belonging to that user are
    returned. When ``user_id`` is ``None`` (admin callers), all images
    across all users are returned.

    Args:
        db: Active database session.
        skip: Number of rows to skip (offset), used for pagination.
        limit: Maximum number of rows to return.
        sort_by: Column name to sort on — ``"filename"``, ``"upload_time"``, or ``"size"``.
        sort_order: ``"asc"`` for ascending or ``"desc"`` for descending.
        user_id: If provided, only return images owned by this user.
                 Pass ``None`` to skip the ownership filter (admin use).

    Returns:
        list[Image]: ORM instances for the requested page.
    """
    query = db.query(Image)

    # Scope to owner unless the caller is an admin (user_id=None)
    if user_id is not None:
        query = query.filter(Image.user_id == user_id)

    # Map the sort_by string to the actual ORM column
    column_map = {
        "filename": Image.filename,
        "upload_time": Image.upload_time,
        "size": Image.size,
    }
    order_col = column_map.get(sort_by, Image.upload_time)

    query = query.order_by(order_col.desc() if sort_order == "desc" else order_col.asc())
    return query.offset(skip).limit(limit).all()


def count_images(db: Session, user_id: int | None = None) -> int:
    """Return the total number of image records in the database.

    When ``user_id`` is provided, only that user's images are counted
    (used for pagination on the gallery page).
    When ``user_id`` is ``None`` (admin callers), all images are counted.

    Args:
        db: Active database session.
        user_id: If provided, only count images owned by this user.
                 Pass ``None`` to skip the ownership filter (admin use).

    Returns:
        int: Total row count of the Images table.
    """
    query = db.query(Image)

    # Scope to owner unless the caller is an admin (user_id=None)
    if user_id is not None:
        query = query.filter(Image.user_id == user_id)

    return query.count()
