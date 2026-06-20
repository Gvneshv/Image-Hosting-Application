"""
Admin API routes.
 
All endpoints in this router require:
  1. A valid JWT (``get_current_user`` dependency).
  2. The authenticated user to have ``is_admin=True`` (``require_admin`` dependency).
 
Any non-admin request is rejected with 403 Forbidden before the route body runs.
 
Endpoints
---------
GET    /admin/stats                         - application-wide statistics
GET    /admin/users                         - paginated user list with image counts
POST   /admin/users                         - create a new user account
GET    /admin/users/{user_id}               - single user detail + image count
PATCH  /admin/users/{user_id}/block         - block or unblock an account
PATCH  /admin/users/{user_id}/admin         - grant or revoke admin privileges
DELETE /admin/users/{user_id}               - delete account + all images
DELETE /admin/users/{user_id}/lockout       - clear login lockout for a user
GET    /admin/users/{user_id}/images        - paginated images for a specific user
DELETE /admin/images/{filename}             - delete any image regardless of owner
 
This router is registered in ``main.py`` with no additional prefix
(the ``/admin`` prefix is part of each route path so it appears clearly in Swagger and in Nginx access logs).
"""

import logging
import os
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from db import crud
from db.database import get_db
from db.models import User
from schemas.upload import UserOut
from schemas.admin import (
    AdminCreateUser,
    AdminSetBlocked,
    AdminSetAdmin,
    AdminUserDetail,
    AdminStatsOut,
)
from settings.config import config
from utils.auth_utils import get_current_user, hash_password

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Admin"])


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    FastAPI dependency - raises 403 if the caller is not an admin.
 
    Injected into every admin route via ``Depends(require_admin)``.
    The ``get_current_user`` dependency runs first (JWT verification + DB lookup), so by the time this runs the user is guaranteed to exist.
 
    Args:
        current_user: Authenticated user injected by ``get_current_user``.
 
    Returns:
        User: The authenticated admin user.
 
    Raises:
        HTTPException 403: The caller exists but is not an admin.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required."
        )

    return current_user


# Shorthand type aliases used in route signatures
DbSession = Annotated[Session, Depends(get_db)]
AdminUser = Annotated[User, Depends(require_admin)]

# Reusable query param aliases for pagination
PageNumber = Annotated[int, Query(ge=1)]
PerPageNumber = Annotated[int, Query(ge=1, le=100)]


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@router.get(
    "/admin/stats",
    response_model=AdminStatsOut,
    summary="Application-wide statistics",
)
def get_stats(db: DbSession, _admin: AdminUser) -> AdminStatsOut:
    """
    Return aggregate statistics for the admin dashboard.
 
    Args:
        db: Database session.
        _admin: Admin guard - ensures only admins can call this.
 
    Returns:
        AdminStatsOut: Total users, images, disk usage, blocked/admin counts.
    """
    stats = crud.admin_get_stats(db)
    return AdminStatsOut(**stats)


# ---------------------------------------------------------------------------
# User list & creation
# ---------------------------------------------------------------------------

@router.get(
    "/admin/users",
    summary="Paginated user list with image counts",
)
def list_users(
    db: DbSession,
    _admin: AdminUser,
    page: PageNumber = 1,
    per_page: PerPageNumber = 20,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> dict:
    """
    Return a paginated list of all users, optionally filtered by email.
 
    Each user entry includes their image count, computed in-database so that large user lists don't require loading image rows into Python.
 
    Args:
        db: Database session.
        _admin: Admin guard.
        page: Page number (1-based).
        per_page: Users per page (1–100).
        search: Optional case-insensitive substring filter on email.
 
    Returns:
        dict: ``users``, ``total``, ``page``, ``per_page``, ``pages``.
    """
    import math

    skip = (page - 1) * per_page
    users, total = crud.admin_list_users(db, skip=skip, limit=per_page, search=search)

    # Attach image count to each user dict without extra per-user queries - count_images uses a single filtered COUNT per call,
    # which is acceptable for admin-panel workloads (low frequency, small user bases).
    user_rows = []
    for user in users:
        row = user.to_dict()
        row["image_count"] = crud.count_images(db, user_id=user.id)
        user_rows.append(row)
    
    return {
        "users": user_rows,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": math.ceil(total / per_page) if total else 1,
    }


@router.post(
    "/admin/users",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new user account (admin)",
)
def create_user(
    data: AdminCreateUser,
    db: DbSession,
    _admin: AdminUser
) -> UserOut:
    """
    Create a new user account on behalf of an admin.
 
    Unlike the public ``POST /auth/register`` endpoint, this route allows the admin to set ``is_admin`` directly.
    The ``registered_ip`` is left None since the account is created by the admin, not by the user themselves.
 
    Args:
        data: Request body - email, password, optional is_admin flag.
        db: Database session.
        _admin: Admin guard.
 
    Returns:
        UserOut: The newly created user's public information.
 
    Raises:
        HTTPException 400: Email is already in use.
    """
    if crud.get_user_by_email(db, email=data.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists."
        )
    
    new_user = crud.create_user(
        db,
        email=data.email,
        password_hash=hash_password(data.password),
        is_admin=data.is_admin,
        registered_ip=None,
    )
    logger.info(
        "Admin created user: new id=%s, email=%s, is_admin=%s",
        new_user.id,
        new_user.email,
        new_user.is_admin,
    )
    return new_user


# ---------------------------------------------------------------------------
# Single user detail
# ---------------------------------------------------------------------------

@router.get(
    "/admin/users/{user_id}",
    summary="Single user detail + image count",
)
def get_user(user_id: int, db: DbSession, _admin: AdminUser) -> dict:
    """
    Return full details for a single user, including their image count.
 
    Args:
        user_id: Primary key of the target user.
        db: Database session.
        _admin: Admin guard.
 
    Returns:
        dict: User fields plus ``image_count``.
 
    Raises:
        HTTPException 404: No user with this ID exists.
    """
    user = crud.admin_get_user(db, user_id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )
    
    row = user.to_dict()
    row["image_count"] = crud.count_images(db, user_id=user_id)
    return row


# ---------------------------------------------------------------------------
# Block / unblock
# ---------------------------------------------------------------------------

@router.patch(
    "/admin/users/{user_id}/block",
    summary="Block or unblock a user account",
)
def set_blocked(
    user_id: int,
    data: AdminSetBlocked,
    db: DbSession,
    admin: AdminUser,
) -> dict:
    """
    Set or clear the ``is_blocked`` flag on a user account.
 
    A blocked user cannot log in.
    Blocking is independent of the automatic login-attempt lockout - a manual admin block survives lockout resets.
 
    Admins cannot block themselves to prevent accidental self-lockout.
 
    Args:
        user_id: Primary key of the target user.
        data: Request body with ``blocked`` (bool).
        db: Database session.
        admin: Admin guard (also used for self-block check).
 
    Returns:
        dict: Updated user fields.
 
    Raises:
        HTTPException 400: Admin attempted to block themselves.
        HTTPException 404: No user with this ID exists.
    """
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot block their own account.",
        )
    
    user = crud.admin_set_blocked(db, user_id=user_id, blocked=data.blocked)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )
    
    action = "blocked" if data.blocked else "unblocked"
    logger.info("Admin id=%s %s user id=%s.", admin.id, action, user_id)
    return user.to_dict()


# ---------------------------------------------------------------------------
# Grant / revoke admin
# ---------------------------------------------------------------------------

@router.patch(
    "/admin/users/{user_id}/admin",
    summary="Grant or revoke admin privileges",
)
def set_admin(
    user_id: int,
    data: AdminSetAdmin,
    db: DbSession,
    admin: AdminUser,
) -> dict:
    """
    Grant or revoke the ``is_admin`` flag for a user.
 
    Admins cannot revoke their own admin status to prevent accidental self-demotion leaving the system without any admin.
 
    Args:
        user_id: Primary key of the target user.
        data: Request body with ``is_admin`` (bool).
        db: Database session.
        admin: Admin guard (also used for self-demotion check).
 
    Returns:
        dict: Updated user fields.
 
    Raises:
        HTTPException 400: Admin attempted to revoke their own admin status.
        HTTPException 404: No user with this ID exists.
    """
    if user_id == admin.id and not data.is_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot revoke their own admin privileges.",
        )
    
    user = crud.admin_set_admin(db, user_id=user_id, is_admin=data.is_admin)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )
    
    action = "granted admin to" if data.is_admin else "revoked admin from"
    logger.info("Admin id=%s %s user id=%s.", admin.id, action, user_id)
    return user.to_dict()


# ---------------------------------------------------------------------------
# Delete user
# ---------------------------------------------------------------------------

@router.delete(
    "/admin/users/{user_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a user account and all their images",
)
def delete_user(
    user_id: int,
    db: DbSession,
    admin: AdminUser
) -> dict:
    """
    Permanently delete a user account and all their uploaded images.
 
    Follows the same two-phase pattern as ``DELETE /auth/account``:
      1. DB deletion (returns filenames to remove from disk).
      2. Disk cleanup (errors are logged but do not fail the request - the nightly orphan-cleanup scheduler will catch any leftovers).
 
    Admins cannot delete their own account via this endpoint to prevent accidental self-deletion.
    Use ``DELETE /auth/account`` for that.
 
    Args:
        user_id: Primary key of the user to delete.
        db: Database session.
        admin: Admin guard (also used for self-deletion check).
 
    Returns:
        dict: Confirmation message including the number of images removed.
 
    Raises:
        HTTPException 400: Admin attempted to delete their own account.
        HTTPException 404: No user with this ID exists.
    """
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Administrators cannot delete their own account via the admin panel. "
                "Use the account settings page instead."
            ),
        )
    
    target = crud.admin_get_user(db, user_id=user_id)
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )
    
    filenames = crud.delete_user(db, user_id=user_id)

    for unique_name in filenames:
        full_path = config.IMAGES_DIR / unique_name
        try:
            if full_path.is_file():
                os.remove(full_path)
        except Exception as e:
            logger.error(
                "Failed to delete file '%s' from disk while deleting user id=%s: %s. "
                "Cleanup scheduler will remove it.",
                unique_name,
                user_id,
                e,
            )

    logger.info(
        "Admin id=%s deleted user id=%s (email=%s), %d images removed.",
        admin.id,
        user_id,
        target.email,
        len(filenames),
    )
    return {"message": f"User '{target.email}' and {len(filenames)} image(s) have been permanently deleted."}


# ---------------------------------------------------------------------------
# Unlock login attempts
# ---------------------------------------------------------------------------

@router.delete(
    "/admin/users/{user_id}/lockout",
    status_code=status.HTTP_200_OK,
    summary="Clear the login lockout for a user",
)
def clear_lockout(
    user_id: int,
    db: DbSession,
    admin: AdminUser
) -> dict:
    """
    Mark all unresolved login attempts for a user as resolved.
 
    This unblocks the user immediately without waiting for the lockout window to expire.
    The attempt records are not deleted - they remain in the audit trail with ``is_resolved=True``.
 
    Args:
        user_id: Primary key of the target user.
        db: Database session.
        admin: Admin guard.
 
    Returns:
        dict: Confirmation message including how many records were resolved.
 
    Raises:
        HTTPException 404: No user with this ID exists.
    """
    user = crud.admin_get_user(db, user_id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )
    
    cleared = crud.clear_failed_attempts(db, email=user.email)
    logger.info(
        "Admin id=%s cleared %d lockout attempt(s) for user id=%s (email=%s).",
        admin.id,
        cleared,
        user_id,
        user.email,
    )
    return {"message": f"Lockout cleared. {cleared} attempt record(s) resolved for '{user.email}'."}


# ---------------------------------------------------------------------------
# Per-user image management
# ---------------------------------------------------------------------------

@router.get(
    "/admin/users/{user_id}/images",
    summary="Paginated list of images for a user",
)
def get_user_images(
    user_id: int,
    db: DbSession,
    _admin: AdminUser,
    page: PageNumber = 1,
    per_page: PerPageNumber = 12,
    sort_by: Annotated[str, Query()] = "upload_time",
    sort_order: Annotated[str, Query()] = "desc",
) -> dict:
    """
    Return a paginated, sorted list of images belonging to a specific user.
 
    Used by the admin panel's per-user image browser.
 
    Args:
        user_id: Primary key of the target user.
        db: Database session.
        _admin: Admin guard.
        page: Page number (1-based).
        per_page: Images per page (1–100).
        sort_by: Column to sort on - ``filename``, ``upload_time``, or ``size``.
        sort_order: ``asc`` or ``desc``.
 
    Returns:
        dict: Images for the requested page plus pagination metadata.
 
    Raises:
        HTTPException 400: Invalid sort parameters.
        HTTPException 404: No user with this ID exists.
    """
    import math

    if sort_by not in {"filename", "upload_time", "size"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid sort_by value."
        )
    if sort_order not in {"asc", "desc"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid sort_order value."
        )

    if not crud.admin_get_user(db, user_id=user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )
    
    skip = (page - 1) * per_page
    images = crud.get_images_paginated(
        db, skip=skip, limit=per_page,
        sort_by=sort_by, sort_order=sort_order,
        user_id=user_id, # Scoped to this user - intentional, not _scoped_user_id
    )
    total = crud.count_images(db, user_id=user_id)

    return {
        "images": [img.to_dict() for img in images],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": math.ceil(total / per_page) if total else 1,
    }


@router.delete(
    "/admin/images/{filename}",
    status_code=status.HTTP_200_OK,
    summary="Delete any image regardless of owner",
)
def delete_any_image(
    filename: str,
    db: DbSession,
    admin: AdminUser
) -> dict:
    """
    Delete an image from disk and the database, bypassing ownership checks.
 
    This is the admin equivalent of ``DELETE /upload/{filename}``.
    Ownership is not checked - admins can delete any image.
 
    Args:
        filename: The ``unique_name`` of the image to delete.
        db: Database session.
        admin: Admin guard.
 
    Returns:
        dict: Confirmation message.
 
    Raises:
        HTTPException 400: Unsupported file extension.
        HTTPException 404: Image not found in DB or on disk.
        HTTPException 500: Unexpected deletion error.
    """
    ext = os.path.splitext(filename)[1].lower()
    if ext not in config.SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format."
        )
    
    # Check DB first so we can return 404 if the record doesn't exist, even when the file is also missing from disk.
    image = crud.get_image(db, unique_name=filename, user_id=None) # user_id=None: bypasses ownership check
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found.")

    full_path = config.IMAGES_DIR / filename
    try:
        if full_path.is_file():
            os.remove(full_path)
    except Exception as e:
        logger.error("Failed to delete file '%s' from disk: %s", filename, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete file from disk.")

    crud.delete_image(db, unique_name=filename, user_id=None) # user_id=None: bypasses ownership check
    logger.info("Admin id=%s deleted image '%s' (owner user_id=%s).", admin.id, filename, image.user_id)
    return {"message": f"Image '{filename}' has been permanently deleted."}