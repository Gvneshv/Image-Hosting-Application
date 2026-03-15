"""
CRUD helpers for the Image model.

All functions accept an active ``Session`` as their first argument and do
**not** manage transactions themselves — callers are responsible for
committing or rolling back as needed (except where a commit is the
natural conclusion of the operation, e.g. ``create_image``).
"""

from datetime import datetime

from sqlalchemy.orm import Session

from db.models import Image


def create_image(
    db: Session,
    filename: str,
    original_name: str,
    size: int,
    unique_name: str,
    filepath: str,
    mimetype: str,
    upload_time: datetime,
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
    )
    db.add(db_image)
    db.commit()
    db.refresh(db_image)
    return db_image


def delete_image(db: Session, unique_name: str) -> bool:
    """Delete an image record by its unique name.

    Args:
        db: Active database session.
        unique_name: The ``unique_name`` of the image to delete.

    Returns:
        bool: ``True`` if a record was found and deleted, ``False`` otherwise.
    """
    image = db.query(Image).filter(Image.unique_name == unique_name).first()
    if image:
        db.delete(image)
        db.commit()
        return True
    return False


def get_image(db: Session, unique_name: str) -> Image | None:
    """Fetch a single image by its unique name.

    Args:
        db: Active database session.
        unique_name: The ``unique_name`` of the image to retrieve.

    Returns:
        Image | None: The ORM instance, or ``None`` if not found.
    """
    return db.query(Image).filter(Image.unique_name == unique_name).first()


def get_images_paginated(
    db: Session,
    skip: int = 0,
    limit: int = 6,
    sort_by: str = "upload_time",
    sort_order: str = "desc",
) -> list[Image]:
    """Return a sorted, paginated slice of images.

    Args:
        db: Active database session.
        skip: Number of rows to skip (offset), used for pagination.
        limit: Maximum number of rows to return.
        sort_by: Column name to sort on — ``"filename"``, ``"upload_time"``, or ``"size"``.
        sort_order: ``"asc"`` for ascending or ``"desc"`` for descending.

    Returns:
        list[Image]: ORM instances for the requested page.
    """
    query = db.query(Image)

    # Map the sort_by string to the actual ORM column
    column_map = {
        "filename": Image.filename,
        "upload_time": Image.upload_time,
        "size": Image.size,
    }
    order_col = column_map.get(sort_by, Image.upload_time)

    query = query.order_by(order_col.desc() if sort_order == "desc" else order_col.asc())
    return query.offset(skip).limit(limit).all()


def count_images(db: Session) -> int:
    """Return the total number of image records in the database.

    Args:
        db: Active database session.

    Returns:
        int: Total row count of the Images table.
    """
    return db.query(Image).count()
