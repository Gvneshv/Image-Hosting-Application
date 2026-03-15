"""
Files upload validation, sanitization & storage logic
"""

import os
import shutil
from typing import cast
from pathlib import Path
from fastapi import UploadFile, HTTPException
from uuid import uuid4
from PIL import Image, UnidentifiedImageError
import re

from settings.config import config
from interfaces.protocols import SupportsWrite

def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent path traversal and invalid characters.

    Args:
        filename: The filename of the image to sanitize.

    Returns:
        filename: Fully sanitized filename.
    """

    # Get just the filename without path
    filename = Path(filename).name

    # Remove any character that aren't alphanumeric, dash, underscore, or dot
    filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)

    # Prevent files starting with dots
    if filename.startswith('.'):
        filename = 'file' + filename

    return filename

def save_uploaded_image(file: UploadFile) -> dict:
    """
    Check file extension, size, and save uploaded image

    Args:
        file: Uploaded file.

    Returns:
        dict: File metadata and URL to be unpacked into a Pydantic model.
    """

    # Sanitize the filename or get the default one
    filename = sanitize_filename(file.filename if file.filename else "uploaded_file")

    # Extension lowercase
    ext = os.path.splitext(filename)[1].lower()

    # Check the file's Content-Type
    if file.content_type not in config.ALLOWED_MIMETYPES:
        raise HTTPException(status_code=400, detail=f"Invalid content type: {file.content_type}")

    # Check supported format
    if ext not in config.SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format. Allowed: {', '.join(config.SUPPORTED_FORMATS)}"
        )

    # Check max size
    size = file.size
    if size > config.MAX_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds max allowed {config.MAX_SIZE} bytes."
        )

    # Verify image
    file.file.seek(0) # Start from the beginning
    try:
        image = Image.open(file.file)
        image.verify()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format. Allowed: {', '.join(config.SUPPORTED_FORMATS)}"
        )
    file.file.seek(0) # Seek back to start for saving

    # Ensure the directory exists
    os.makedirs(config.IMAGES_DIR, exist_ok=True)

    # Generate unique filename
    original_name = os.path.splitext(filename)[0].lower()
    unique_name = f"{original_name}_{uuid4().hex}{ext}"
    file_path = config.IMAGES_DIR / unique_name  # Path object usage

    # Save file to disk
    with open(file_path, "wb") as buffer:
        file.file.seek(0)
        shutil.copyfileobj(file.file, cast(SupportsWrite, buffer))

    # Return metadata
    return {
        "filename": unique_name,
        "original_name": original_name,
        "size": size,
        "unique_name": unique_name,
        "filepath": str(file_path),  # convert Path to string
        "url": f"/images/{unique_name}"
    }