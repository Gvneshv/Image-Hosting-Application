"""
Pydantic schemas for image upload request/response validation.

``ImageBase`` — shared fields present on every image-related payload.
``ImageUploadResponse`` — returned after a successful upload (adds ``url``).
``ImageInfo`` — full metadata including MIME type and upload time (e.g. for
    the image detail page).
"""

from datetime import datetime

from pydantic import BaseModel


class ImageBase(BaseModel):
    """Fields shared by all image-related schemas."""

    filename: str
    original_name: str
    size: int
    unique_name: str
    filepath: str


class ImageUploadResponse(ImageBase):
    """Response body returned after a successful image upload.

    Extends ``ImageBase`` with a ``url`` field that clients can use
    immediately to display or share the uploaded image.
    """

    url: str


class ImageInfo(ImageBase):
    """Full image metadata, including MIME type and upload timestamp.

    Used by endpoints that return detailed information about a stored image.
    ``from_attributes = True`` enables construction directly from SQLAlchemy
    ORM instances.
    """

    mimetype: str
    upload_time: datetime

    model_config = {"from_attributes": True}  # Pydantic v2 style (replaces inner Config class)
