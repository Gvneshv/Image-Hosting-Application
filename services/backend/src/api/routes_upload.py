"""
API routes for image upload, retrieval, and management.

Endpoints
---------
GET  /              — welcome / basic health ping
GET  /upload        — paginated image list with sorting
POST /upload/       — upload a new image (rate-limited)
DELETE /upload/{filename} — delete an image by unique name
GET  /file_info/{filename} — metadata for a single image
GET  /all_images    — full image list for the viewer slideshow
GET  /view/{filename} — render the Jinja2 image-viewer page
GET  /health        — extended health check (DB + filesystem)
"""

import math
import logging
import os
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.responses import HTMLResponse

from db import crud
from db.database import SessionLocal
from handlers.upload import save_uploaded_image
from schemas.upload import ImageUploadResponse, ImageInfo
from settings.config import config
from utils.rate_limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter()
templates = Jinja2Templates(directory=config.FRONTEND_TEMPLATES_DIR)


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------

def get_db():
    """Yield a database session and ensure it is closed after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------

DbSession = Annotated[Session, Depends(get_db)]
PageNumber = Annotated[int, Query(ge=1)]
PerPageNumber = Annotated[int, Query(ge=1, le=100)]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/")
def root():
    """Welcome endpoint — also serves as a basic liveness ping."""
    logger.info("Root endpoint hit.")
    return {"message": "Welcome to the Image Hosting Server v2.0"}


@router.get("/upload", response_model=dict)
def get_images(
    db: DbSession,
    page: PageNumber = 1,
    per_page: PerPageNumber = 6,
    sort_by: Annotated[str, Query()] = "upload_time",
    sort_order: Annotated[str, Query()] = "desc",
):
    """Return a paginated, sorted list of uploaded images.

    Args:
        page: Page number (1-based).
        per_page: Number of images per page (1–100).
        sort_by: Column to sort on — ``filename``, ``upload_time``, or ``size``.
        sort_order: Sort direction — ``asc`` or ``desc``.

    Returns:
        dict: Images for the requested page plus pagination metadata.

    Raises:
        HTTPException 400: Invalid ``sort_by`` or ``sort_order`` value.
        HTTPException 404: No images found at all.
    """
    # Manual validation — avoids 422 errors that can occur with regex in Query()
    if sort_by not in {"filename", "upload_time", "size"}:
        raise HTTPException(status_code=400, detail="Invalid sort_by value.")
    if sort_order not in {"desc", "asc"}:
        raise HTTPException(status_code=400, detail="Invalid sort_order value.")

    skip = (page - 1) * per_page
    images = crud.get_images_paginated(db, skip=skip, limit=per_page, sort_by=sort_by, sort_order=sort_order)
    total = crud.count_images(db)

    if not images:
        raise HTTPException(status_code=404, detail="No images found.")

    return {
        "images": [img.to_dict() for img in images],
        "page": page,
        "per_page": per_page,
        "sort_by": sort_by,
        "sort_order": sort_order,
        "total": total,
        "pages": math.ceil(total / per_page),
    }


@router.post("/upload/", status_code=201, response_model=ImageUploadResponse)
@limiter.limit("10/minute")
async def upload_file(
    request: Request,
    db: DbSession,
    file: Annotated[UploadFile, "image file"] = File(...),
):
    """Upload and store an image file.

    Validates the Content-Length header before reading the body, then
    delegates full validation (extension, MIME type, Pillow verification)
    and storage to ``handlers.upload.save_uploaded_image``.

    Rate-limited to 10 uploads per minute per IP address.

    Args:
        request: Incoming HTTP request (used for request ID logging and rate limiting).
        db: Database session.
        file: Uploaded file.

    Returns:
        ImageUploadResponse: Metadata and URL of the saved image.

    Raises:
        HTTPException 413: Content-Length exceeds the configured maximum.
        HTTPException 400: File fails validation (type, size, or content check).
        HTTPException 500: Unexpected server error.
    """
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > config.MAX_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {config.MAX_SIZE} bytes.",
        )

    try:
        result = save_uploaded_image(file)

        crud.create_image(
            db,
            filename=file.filename,
            original_name=result["original_name"],
            size=result["size"],
            unique_name=result["unique_name"],
            filepath=result["filepath"],
            mimetype=file.content_type,
            upload_time=datetime.now(timezone.utc),
        )
        logger.info(f"[{request.state.request_id}] File '{result['filename']}' uploaded successfully.")
        return ImageUploadResponse(**result)

    except HTTPException as e:
        logger.error(f"[{request.state.request_id}] Upload rejected: {e.detail}")
        raise
    except Exception as e:
        logger.error(f"[{request.state.request_id}] Unexpected upload error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during upload.")


@router.delete("/upload/{filename}")
def delete_file(filename: str, db: DbSession):
    """Delete an image from disk and the database.

    Args:
        filename: The unique filename of the image to delete.
        db: Database session.

    Returns:
        dict: Confirmation message.

    Raises:
        HTTPException 400: File extension is not supported.
        HTTPException 404: File does not exist on disk.
        HTTPException 500: Permission error or unexpected failure.
    """
    ext = os.path.splitext(filename)[1].lower()
    if ext not in config.SUPPORTED_FORMATS:
        logger.warning(f"Attempt to delete unsupported file format: {filename}")
        raise HTTPException(status_code=400, detail="Unsupported file format.")

    full_path = config.IMAGES_DIR / filename
    if not full_path.is_file():
        logger.warning(f"Delete requested for non-existent file: {filename}")
        raise HTTPException(status_code=404, detail="File not found.")

    try:
        os.remove(full_path)

        deleted = crud.delete_image(db, unique_name=filename)
        if not deleted:
            logger.warning(f"DB record for '{filename}' not found during delete.")

    except PermissionError:
        logger.error(f"Permission denied when deleting: {filename}")
        raise HTTPException(status_code=500, detail="Permission denied.")
    except Exception as e:
        logger.error(f"Unexpected error during delete of '{filename}': {e}")
        raise HTTPException(status_code=500, detail=str(e))

    logger.info(f"Deleted file and DB record: {filename}")
    return {"message": f"File '{filename}' has been deleted from disk and DB."}


@router.get("/file_info/{filename}")
async def get_file_info(filename: str, db: DbSession):
    """Return metadata for a single image.

    Used by the viewer page to populate the info panel.

    Args:
        filename: Unique filename of the image.
        db: Database session.

    Returns:
        dict: Metadata fields (filename, size, type, upload date, URL, etc.).

    Raises:
        JSONResponse 404: Image not found in DB or on disk.
    """
    image = crud.get_image(db, unique_name=filename)
    if not image:
        return JSONResponse({"error": "File was not found in the database."}, status_code=404)

    filepath = config.IMAGES_DIR / filename
    if not filepath.exists():
        return JSONResponse({"error": "File was not found on disk."}, status_code=404)

    return {
        "filename": image.filename,
        "original_name": image.original_name,
        "unique_name": image.unique_name,
        "filepath": image.filepath,
        "size": image.size,
        "type": os.path.splitext(filename)[1].upper(),
        "upload_date": image.upload_time.isoformat(),
        "url": f"/images/{image.unique_name}",
    }


@router.get("/all_images")
def get_all_images(db: DbSession):
    """Return all images ordered by upload time, used by the viewer slideshow.

    Limited to 1000 images. Increase the limit if the library grows beyond that.

    Args:
        db: Database session.

    Returns:
        dict: ``{"images": [...]}`` — full list of image dicts.
    """
    images = crud.get_images_paginated(db, skip=0, limit=1000, sort_by="upload_time", sort_order="asc")
    return {"images": [img.to_dict() for img in images]}


@router.get("/view/{filename}", response_class=HTMLResponse)
async def view_file(request: Request, filename: str):
    """Render the server-side image viewer page via Jinja2.

    Args:
        request: Incoming HTTP request (required by Jinja2Templates).
        filename: Unique filename extracted from the URL path.

    Returns:
        HTMLResponse: Rendered ``viewer.html`` template.
    """
    return templates.TemplateResponse(
        "viewer.html",
        {"request": request, "filename": filename},
    )


@router.get("/health")
def health(db: DbSession):
    """Extended health check: verifies the database connection and images directory.

    Used by Docker Compose ``healthcheck`` to determine container readiness.

    Returns:
        dict: Overall status (``"ok"`` or ``"degraded"``), plus individual
              component statuses for the database and images directory.
    """
    try:
        db.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        db_status = "unhealthy"

    return {
        "status": "ok" if db_status == "healthy" else "degraded",
        "database": db_status,
        "images_dir": "exists" if config.IMAGES_DIR.exists() else "missing",
    }
