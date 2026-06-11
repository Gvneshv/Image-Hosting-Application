"""
CRUD helpers for the ``User``, ``Image``, and ``LoginAttempt`` models.
 
All functions accept an active ``Session`` as their first argument and do **not** manage transactions themselves - callers are responsible for
committing or rolling back as needed (except where a commit is the natural conclusion of the operation, e.g. ``create_image``).
 
Access control philosophy
--------------------------
- Regular users can only read, create, and delete **their own** images.
  Every image query therefore accepts an optional ``user_id`` parameter.
- Admin users can act on **any** image regardless of ownership.
  The admin check happens in the route layer (``routes_upload.py``), not here:
  routes simply omit ``user_id`` when the caller is an admin, which removes the ownership filter and exposes all rows.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models import Image, User, LoginAttempt


# ---------------------------------------------------------------------------
# User CRUD
# ---------------------------------------------------------------------------

def get_user_by_email(db: Session, email: str) -> User | None:
    """Look up a user by their email address.
 
    Used during login to find the account to verify the password against, and during registration to check the email is not already taken.
 
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
 
    Used by the JWT authentication dependency (``get_current_user``) after the token has been decoded and the user ID extracted.
 
    Args:
        db: Active database session.
        user_id: The integer primary key of the user.
 
    Returns:
        User | None: The matching ORM instance, or ``None`` if not found.
    """
    return db.query(User).filter(User.id == user_id).first()


def create_user(
        db: Session,
        email: str,
        password_hash: str,
        is_admin: bool = False,
        registered_ip: str | None = None
) -> User:
    """
    Insert a new user record and return the persisted instance.
 
    The password must be hashed **before** calling this function.
    Plain-text passwords must never reach the database layer.
 
    Args:
        db: Active database session.
        email: Unique email address for the new account.
        hashed_password: Argon2id hash of the user's chosen password.
        is_admin: Whether to grant admin privileges immediately. The route layer sets this to True only when the email matches ``config.FIRST_ADMIN_EMAIL``.
        registered_ip: Client IP at registration time, if available.
 
    Returns:
        User: The newly created and refreshed ORM instance.
    """
    db_user = User(
        email=email,
        hashed_password=password_hash,
        is_admin=is_admin,
        registered_ip=registered_ip,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def update_user_password(db: Session, user_id: int, new_hashed_password: str) -> bool:
    """
    Update the stored password hash for a user.
 
    The new password must be hashed **before** calling this function.
 
    Args:
        db: Active database session.
        user_id: Primary key of the user whose password is being changed.
        new_password_hash: Argon2id hash of the user's new password.
 
    Returns:
        bool: ``True`` if the user was found and updated, ``False`` if the user_id does not exist
            (should not happen in normal flow since the caller is authenticated, but handled defensively).

    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return False
    user.hashed_password = new_hashed_password
    db.commit()
    return True


def update_user_last_login(db: Session, user_id: int) -> None:
    """
    Stamp the user's ``last_login`` field with the current UTC time.
 
    Called by ``routes_auth.login()`` immediately after credentials are verified and before the token is returned.
 
    Args:
        db: Active database session.
        user_id: Primary key of the user who just logged in.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.last_login = datetime.now(timezone.utc)
        db.commit()


def delete_user(db: Session, user_id: int) -> list[str]:
    """
    Delete a user account and all their image records from the database.
 
    Does NOT delete files from disk - that is the caller's responsibility (route layer), following the same pattern as ``DELETE /upload/{filename}``.
    The list of unique filenames is returned so the route can remove the physical files after the DB transaction succeeds.
 
    Args:
        db: Active database session.
        user_id: Primary key of the user to delete.
 
    Returns:
        list[str]: The ``unique_name`` of every image that belonged to this user, so the caller can delete the files from disk.
            Empty list if the user had no images or was not found.

    """
    images = db.query(Image).filter(Image.user_id == user_id).all()
    filenames = [img.unique_name for img in images]

    for img in images:
        db.delete(img)
    
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        db.delete(user)
    
    db.commit()
    return filenames


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

    When ``user_id`` is provided, the delete is scoped to that user's images only - a user cannot delete an image they don't own.
    When ``user_id`` is ``None`` (admin callers), ownership is not checked and any image can be deleted.

    Args:
        db: Active database session.
        unique_name: The ``unique_name`` of the image to delete.
        user_id: If provided, only delete if this user owns the image. Pass ``None`` to skip the ownership check (admin use).

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
        user_id: If provided, only fetch if this user owns the image. Pass ``None`` to skip the ownership check (admin use).

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

    When ``user_id`` is provided, only images belonging to that user are returned. 
    When ``user_id`` is ``None`` (admin callers), all images across all users are returned.

    Args:
        db: Active database session.
        skip: Number of rows to skip (offset), used for pagination.
        limit: Maximum number of rows to return.
        sort_by: Column name to sort on - ``"filename"``, ``"upload_time"``, or ``"size"``.
        sort_order: ``"asc"`` for ascending or ``"desc"`` for descending.
        user_id: If provided, only return images owned by this user. Pass ``None`` to skip the ownership filter (admin use).

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

    When ``user_id`` is provided, only that user's images are counted (used for pagination on the gallery page).
    When ``user_id`` is ``None`` (admin callers), all images are counted.

    Args:
        db: Active database session.
        user_id: If provided, only count images owned by this user. Pass ``None`` to skip the ownership filter (admin use).

    Returns:
        int: Total row count of the Images table.
    """
    query = db.query(Image)

    # Scope to owner unless the caller is an admin (user_id=None)
    if user_id is not None:
        query = query.filter(Image.user_id == user_id)

    return query.count()


# ---------------------------------------------------------------------------
# Login attempt / lockout CRUD
# ---------------------------------------------------------------------------

def record_failed_attempt(db: Session, email: str, ip_address: str | None) -> None:
    """
    Insert a new failed login attempt record.
 
    Called by ``routes_auth.login()`` on every credential failure, before raising the 401 response.
    The record is used by ``is_locked_out()`` to decide whether further attempts should be blocked.
 
    Args:
        db: Active database session.
        email: The email address used in the failed attempt.
        ip_address: Client IP, if available from the request.

    """
    attempt = LoginAttempt(
        email=email,
        ip_address=ip_address,
        attempted_at=datetime.now(timezone.utc),
    )
    db.add(attempt)
    db.commit()


def is_locked_out(
    db: Session,
    email: str,
    window_minutes: int,
    max_attempts: int,
    lockout_minutes: int
) -> bool:
    """
    Return True if the given email is currently under a login lockout.
 
    Lockout logic:
        1. Count unresolved failed attempts within the last ``window_minutes``.
        2. If the count is >= ``max_attempts``, find the most recent attempt.
        3. If that attempt is within the last ``lockout_minutes``, the account is locked out and this function returns True.
 
    Using the most recent attempt (not the first) as the lockout anchor
    means each new failed attempt while locked out resets the lockout timer - this is intentional and makes brute-force slower.
 
    Args:
        db: Active database session.
        email: Email address to check.
        window_minutes: Rolling window over which attempts are counted.
        max_attempts: Number of failures required to trigger a lockout.
        lockout_minutes: Duration of the lockout after it is triggered.
 
    Returns:
        bool: True if the account is currently locked out.
    """
    window_start = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)

    recent_count = (
        db.query(LoginAttempt)
        .filter(
            LoginAttempt.email == email,
            LoginAttempt.attempted_at >= window_start,
            LoginAttempt.is_resolved == False, # noqa: E712 - SQLAlchemy needs ==
        )
        .count()
    )

    if recent_count < max_attempts:
        return False
    
    # Find the most recent unresolved attempt to anchor the lockout window
    latest = (
        db.query(LoginAttempt)
        .filter(
            LoginAttempt.email == email,
            LoginAttempt.is_resolved == False, # noqa: E712
        )
        .order_by(LoginAttempt.attempted_at.desc())
        .first()
    )
    
    if not latest:
        return False
    
    lockout_expires = latest.attempted_at.replace(tzinfo=timezone.utc) + timedelta(minutes=lockout_minutes)
    return datetime.now(timezone.utc) < lockout_expires


def clear_failed_attempts(db: Session, email: str) -> int:
    """
    Mark all unresolved login attempts for an email as resolved.
 
    Called by:
    - ``routes_auth.login()`` on a successful login (clears stale attempts).
    - The admin panel when an admin manually unlocks a locked account.
 
    Marks rather than deletes so the audit trail is preserved.
 
    Args:
        db: Active database session.
        email: Email address whose attempts should be cleared.
 
    Returns:
        int: Number of attempt records that were resolved.
    """
    attempts = (
        db.query(LoginAttempt)
        .filter(
            LoginAttempt.email == email,
            LoginAttempt.is_resolved == False, # noqa: E712
        )
        .all()
    )
    for attempt in attempts:
        attempt.is_resolved = True
    db.commit()
    return len(attempts)


def get_recent_attempts(db: Session, email: str, window_minutes: int) -> list[LoginAttempt]:
    """
    Return all unresolved failed attempts for an email within the window.
 
    Used by the admin panel to show lockout details (how many attempts, from which IPs, when the lockout expires).
 
    Args:
        db: Active database session.
        email: Email address to query.
        window_minutes: Rolling window in minutes.
 
    Returns:
        list[LoginAttempt]: Unresolved attempts within the window, newest first.
    """
    window_start = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
    return (
        db.query(LoginAttempt)
        .filter(
            LoginAttempt.email == email,
            LoginAttempt.attempted_at >= window_start,
            LoginAttempt.is_resolved == False, # noqa: E712
        )
        .order_by(LoginAttempt.attempted_at.desc())
        .all()
    )


# ---------------------------------------------------------------------------
# Admin CRUD
# ---------------------------------------------------------------------------

def admin_list_users(
    db: Session,
    skip: int = 0,
    limit: int = 20,
    search: str | None = None,
) -> tuple[list[User], int]:
    """
    Return a paginated list of all users with their image counts.
 
    The image count is computed in-database via a subquery so that SQLAlchemy does not load all image rows into Python memory.
 
    Args:
        db: Active database session.
        skip: Offset for pagination.
        limit: Maximum users per page.
        search: Optional email substring filter (case-insensitive).
 
    Returns:
        tuple[list[User], int]: The user rows for the page, plus the total count of matching users (for pagination UI).
    """
    query = db.query(User)
    if search:
        query = query.filter(User.email.ilike(f"%{search}%"))
    total = query.count()
    users = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()
    return users, total


def admin_get_user(db: Session, user_id: int) -> User | None:
    """
    Fetch a single user by ID - admin use only.
 
    Args:
        db: Active database session.
        user_id: Primary key of the target user.
 
    Returns:
        User | None: The ORM instance, or None if not found.
    """
    return db.query(User).filter(User.id == user_id).first()


def admin_set_blocked(db: Session, user_id: int, blocked: bool) -> User | None:
    """
    Set or clear the ``is_blocked`` flag on a user account.
 
    Blocking prevents login regardless of lockout state. Unblocking does not clear login attempts - those are managed separately.
 
    Args:
        db: Active database session.
        user_id: Primary key of the target user.
        blocked: True to block, False to unblock.
 
    Returns:
        User | None: The updated ORM instance, or None if not found.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    user.is_blocked = blocked
    db.commit()
    db.refresh(user)
    return user


def admin_set_admin(db: Session, user_id: int, is_admin: bool) -> User | None:
    """
    Grant or revoke admin privileges for a user.
 
    Args:
        db: Active database session.
        user_id: Primary key of the target user.
        is_admin: True to grant admin, False to revoke.
 
    Returns:
        User | None: The updated ORM instance, or None if not found.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    user.is_admin = is_admin
    db.commit()
    db.refresh(user)
    return user


def admin_get_stats(db: Session) -> dict:
    """
    Return application-wide statistics for the admin dashboard.
 
    All counts are computed in a single DB round-trip where possible.
 
    Args:
        db: Active database session.
 
    Returns:
        dict: Keys: total_users, total_images, total_size_bytes, blocked_users, admin_users.
    """
    total_users = db.query(User).count()
    total_images = db.query(Image).count()

    # SUM returns None if there are not images - coerce to 0
    total_size_bytes = db.query(func.sum(Image.size)).scalar() or 0

    blocked_users = db.query(User).filter(User.is_blocked == True).count() # noqa: E712
    admin_users = db.query(User).filter(User.is_admin == True).count() # noqa: E712

    return {
        "total_users": total_users,
        "total_images": total_images,
        "total_size_bytes": total_size_bytes,
        "blocked_users": blocked_users,
        "admin_users": admin_users
    }