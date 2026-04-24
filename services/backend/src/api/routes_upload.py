"""
API routes for image upload, retrieval, and management.
 
All routes except ``GET /``, ``GET /health``, and ``GET /view/{filename}``
require a valid JWT in the Authorization header:
    Authorization: Bearer <token>
 
Access control
--------------
- Regular users can only see, upload, and delete **their own** images.
- Admin users can see and delete **any** image regardless of ownership.
  The admin check is done inline in each route: if the caller is an admin,
  ``user_id=None`` is passed to CRUD functions, which removes the ownership
  filter and exposes all rows.
 
Endpoints
---------
GET    /                        — welcome / basic liveness ping (public)
GET    /upload                  — paginated image list (auth required)
POST   /upload/                 — upload a new image (auth required, rate-limited)
DELETE /upload/{filename}       — delete an image (auth required, ownership enforced)
GET    /file_info/{filename}    — metadata for a single image (auth required)
GET    /all_images              — full image list for the viewer slideshow (auth required)
GET    /view/{filename}         — render the Jinja2 image-viewer page (auth required)
GET    /health                  — extended health check: DB + filesystem (public)
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
from db.database import get_db
from db.models import User
from handlers.upload import save_uploaded_image
from schemas.upload import ImageUploadResponse, ImageInfo
from settings.config import config
from utils.auth_utils import get_current_user
from utils.rate_limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter()
templates = Jinja2Templates(directory=config.FRONTEND_TEMPLATES_DIR)


# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------
 
# DbSession injects a database session automatically into any route that
# declares it as a parameter. FastAPI calls get_db(), yields the session,
# passes it to the route, and closes it when the response is done.

DbSession = Annotated[Session, Depends(get_db)]

# CurrentUser injects the authenticated User ORM object into protected routes.
# FastAPI extracts the Bearer token from the Authorization header, verifies it,
# and loads the matching user from the database — all before the route runs.
# If the token is missing, expired, or invalid a 401 is raised automatically.
CurrentUser = Annotated[User, Depends(get_current_user)]

PageNumber = Annotated[int, Query(ge=1)]
PerPageNumber = Annotated[int, Query(ge=1, le=100)]


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _scoped_user_id(user: User) -> int | None:
    """
    Return ``None`` for admins (no ownership filter) or the user's ID for regular users.
 
    Admins can access all images; regular users are scoped to their own.
    Centralising this logic here keeps every route one clean line instead of
    repeating the same ``if user.is_admin`` check everywhere.
 
    Args:
        user: The currently authenticated User ORM instance.
 
    Returns:
        int | None: ``None`` if the user is an admin, otherwise their ``id``.
    """
    return None if user.is_admin else user.id


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/")
def root():
    """
    Welcome endpoint — also serves as a basic liveness ping.
 
    Public — no authentication required.
    """
    logger.info("Root endpoint hit.")
    return {"message": "Welcome to the Image Hosting Server v2.0"}


@router.get("/upload", response_model=dict)
def get_images(
    db: DbSession,
    current_user = CurrentUser,
    page: PageNumber = 1,
    per_page: PerPageNumber = 6,
    sort_by: Annotated[str, Query()] = "upload_time",
    sort_order: Annotated[str, Query()] = "desc",
):
    """
    Return a paginated, sorted list of images visible to the caller.
 
    Regular users see only their own images.
    Admin users see all images across all accounts.
 
    Args:
        db: Database session.
        current_user: Authenticated user injected by the JWT dependency.
        page: Page number (1-based).
        per_page: Number of images per page (1–100).
        sort_by: Column to sort on — ``filename``, ``upload_time``, or ``size``.
        sort_order: Sort direction — ``asc`` or ``desc``.
 
    Returns:
        dict: Images for the requested page plus pagination metadata.
 
    Raises:
        HTTPException 400: Invalid ``sort_by`` or ``sort_order`` value.
        HTTPException 404: No images found for this user.
    """
    # Manual validation — avoids 422 errors that can occur with regex in Query()
    if sort_by not in {"filename", "upload_time", "size"}:
        raise HTTPException(status_code=400, detail="Invalid sort_by value.")
    if sort_order not in {"desc", "asc"}:
        raise HTTPException(status_code=400, detail="Invalid sort_order value.")

    uid = _scoped_user_id(current_user)
    skip = (page - 1) * per_page

    images = crud.get_images_paginated(db, skip=skip, limit=per_page, sort_by=sort_by, sort_order=sort_order, user_id=uid)
    total = crud.count_images(db, user_id=uid)

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
    current_user: CurrentUser,
    file: Annotated[UploadFile, "image file"] = File(...),
):
    """
    Upload and store an image file, linked to the authenticated user.
 
    Validates the Content-Length header before reading the body, then
    delegates full validation (extension, MIME type, Pillow verification)
    and storage to ``handlers.upload.save_uploaded_image``.
 
    The new image is automatically associated with the calling user's account.
 
    Rate-limited to 10 uploads per minute per IP address.
 
    Args:
        request: Incoming HTTP request (used for request ID logging and rate limiting).
        db: Database session.
        current_user: Authenticated user injected by the JWT dependency.
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

        # user_id ties this image to the uploading user's account.
        crud.create_image(
            db,
            filename=file.filename,
            original_name=result["original_name"],
            size=result["size"],
            unique_name=result["unique_name"],
            filepath=result["filepath"],
            mimetype=file.content_type,
            upload_time=datetime.now(timezone.utc),
            user_id=current_user.id,
        )
        logger.info(
            "[%s] User id=%s uploaded '%s' successfully.",
            request.state.request_id,
            current_user.id,
            result["filename"],
        )
        return ImageUploadResponse(**result)

    except HTTPException as e:
        logger.error(f"[{request.state.request_id}] Upload rejected: {e.detail}")
        raise
    except Exception as e:
        logger.error(f"[{request.state.request_id}] Unexpected upload error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during upload.")


@router.delete("/upload/{filename}")
def delete_file(filename: str, db: DbSession, current_user: CurrentUser):
    """
    Delete an image from disk and the database.
 
    Regular users can only delete their own images. Admins can delete any image.
    If a regular user attempts to delete an image that isn't theirs, the CRUD
    layer returns ``False`` (ownership filter finds nothing) and a 404 is raised
    — indistinguishable from a genuinely missing file, to avoid leaking info.
 
    Args:
        filename: The unique filename of the image to delete.
        db: Database session.
        current_user: Authenticated user injected by the JWT dependency.
 
    Returns:
        dict: Confirmation message.
 
    Raises:
        HTTPException 400: File extension is not supported.
        HTTPException 404: File does not exist on disk or user does not own it.
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

        deleted = crud.delete_image(db, unique_name=filename, user_id=_scoped_user_id(current_user))
        if not deleted:
            logger.warning(f"DB record for '{filename}' not found during delete (user id = {current_user.id}).")

    except PermissionError:
        logger.error(f"Permission denied when deleting: {filename}")
        raise HTTPException(status_code=500, detail="Permission denied.")
    except Exception as e:
        logger.error(f"Unexpected error during delete of '{filename}': {e}")
        raise HTTPException(status_code=500, detail=str(e))

    logger.info(f"User id = {current_user.id} deleted file: {filename}")
    return {"message": f"File '{filename}' has been deleted from disk and DB."}


@router.get("/file_info/{filename}")
async def get_file_info(filename: str, db: DbSession, current_user: CurrentUser):
    """
    Return metadata for a single image.
 
    Regular users can only retrieve info for their own images.
    Admins can retrieve info for any image.
 
    Args:
        filename: Unique filename of the image.
        db: Database session.
        current_user: Authenticated user injected by the JWT dependency.
 
    Returns:
        dict: Metadata fields (filename, size, type, upload date, URL, etc.).
 
    Raises:
        JSONResponse 404: Image not found in DB, not on disk, or not owned by caller.
    """
    image = crud.get_image(db, unique_name=filename, user_id=_scoped_user_id(current_user))
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
def get_all_images(db: DbSession, current_user: CurrentUser):
    """
    Return all images visible to the caller, ordered by upload time.
 
    Used by the viewer slideshow. Regular users see only their own images;
    admins see everything. Limited to 1000 images.
 
    Args:
        db: Database session.
        current_user: Authenticated user injected by the JWT dependency.
 
    Returns:
        dict: ``{"images": [...]}`` — full list of image dicts.
    """
    images = crud.get_images_paginated(db, skip=0, limit=1000, sort_by="upload_time", sort_order="asc", user_id=_scoped_user_id(current_user))
    return {"images": [img.to_dict() for img in images]}


@router.get("/view/{filename}", response_class=HTMLResponse)
async def view_file(request: Request, filename: str, _: CurrentUser):
    """
    Render the server-side image viewer page via Jinja2.
 
    Requires authentication — unauthenticated requests receive a 401 before
    the template is rendered. The frontend JS in ``viewer.js`` detects the 401
    and redirects to the login page.
 
    Args:
        request: Incoming HTTP request (required by Jinja2Templates).
        filename: Unique filename extracted from the URL path.
        current_user: Authenticated user injected by the JWT dependency.
 
    Returns:
        HTMLResponse: Rendered ``viewer.html`` template.
    """
    return templates.TemplateResponse(
        "viewer.html",
        {"request": request, "filename": filename},
    )


@router.get("/health")
def health(db: DbSession):
    """
    Extended health check: verifies the database connection and images directory.
 
    Public — no authentication required. Docker Compose calls this endpoint
    during startup to decide when the backend container is ready.
 
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
