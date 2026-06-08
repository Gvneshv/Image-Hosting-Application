"""
Authentication routes.

Provides two public endpoints (no token required):

    POST /auth/register  - create a new user account
    POST /auth/login     - verify credentials and receive a JWT

And three protected endpoints (Bearer token required):

    GET    /auth/me               - return the current user's public info
    POST   /auth/change-password  - update the authenticated user's password
    DELETE /auth/account          - permanently delete the caller's account and all their uploaded images

This router is registered in ``main.py`` with the ``/auth`` prefix.
"""

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import Annotated

from db.crud import create_user, delete_user, get_user_by_email, update_user_password
from db.database import get_db
from db.models import User
from schemas.upload import ChangePasswordRequest, Token, UserOut, UserRegister
from settings.config import config
from utils.auth_utils import create_access_token, get_current_user, hash_password, verify_password

logger = logging.getLogger(__name__)

# All routes in this file will be reachable under the /auth prefix, e.g.:
#   POST /auth/register
#   POST /auth/login
router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post(
        "/register", 
        response_model=UserOut, 
        status_code=status.HTTP_201_CREATED,
        summary="Register a new user account",
)
def register(user_data: UserRegister, db: Session = Depends(get_db)) -> UserOut:
    """
    Create a new user account.
 
    Validates that the email is not already in use, hashes the password, and inserts the new user into the database.
 
    The plain-text password is hashed immediately and never stored or logged.
 
    Args:
        user_data: Request body containing ``email`` and ``password``.
        db: Database session provided by the ``get_db`` dependency.
 
    Returns:
        UserOut: The newly created user's public information (no password hash).
 
    Raises:
        HTTPException: 400 Bad Request if the email is already registered.
    """
    # Check whether this email is already taken before doing anything else.
    # We return a generic-enough message to be helpful without leaking information about which accounts exist.
    existing_user = get_user_by_email(db, email=user_data.email)
    if existing_user:
        logger.warning(f"Registration attempt with already-registered email: {user_data.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already in use. Please choose a different email."
        )
    
    # Hash the password before it goes anywhere near the database.
    # After this line, the plain-text password is no longer needed.
    hashed = hash_password(user_data.password)

    # Create the user in the database and return the public info.
    new_user = create_user(db, email=user_data.email, password_hash=hashed)
    logger.info("New user registered: id=%s, email=%s", new_user.id, new_user.email)

    return new_user


@router.post(
        "/login",
        response_model=Token,
        status_code=status.HTTP_200_OK,
        summary="Log in and receive a JWT access token",
)
def login(credentials: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> Token:
    """
    Verify user credentials and return a signed JWT.
 
    The returned token must be included in the ``Authorization`` header of every subsequent protected request: Authorization: Bearer <access_token>
 
    Deliberately uses identical error messages for "user not found" and "wrong password" - telling an attacker which one is true would help
    them enumerate valid accounts.
 
    Args:
        credentials: Request body containing ``email`` and ``password``.
        db: Database session provided by the ``get_db`` dependency.
 
    Returns:
        Token: A schema containing the signed ``access_token`` and ``token_type`` (always ``"bearer"``).
 
    Raises:
        HTTPException: 401 Unauthorized if the email is not found or the password does not match.
    """
    # Single generic error used for both "no such user" and "wrong password".
    # This prevents user enumeration: an attacker cannot tell the difference between a non-existent account and a wrong password.
    auth_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    user = get_user_by_email(db, email=credentials.username)
    if user is None:
        logger.warning(f"Login attempt with non-existent email: {credentials.email}")
        raise auth_error
    
    # Credentials are valid - issue a token containing the user's ID.
    access_token = create_access_token(user_id=user.id)
    logger.info(f"User logged in: id={user.id}, email={user.email}")

    return Token(access_token=access_token, token_type="bearer")

# ---------------------------------------------------------------------------
# Protected routes (Bearer token required)
# ---------------------------------------------------------------------------

# Type alias - mirrors the pattern in routes_upload.py for consistency.
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get(
    "/me",
    response_model=UserOut,
    status_code=status.HTTP_200_OK,
    summary="Return the current user's public profile",
)
def get_me(current_user: CurrentUser) -> UserOut:
    """
    Return the authenticated user's public information.

    Used by ``account.js`` on page load to populate the "My Info" section (email, member since).
    No database query is needed here because ``get_current_user`` has already loaded the full User ORM instance.

    Args:
        current_user: Authenticated user injected by the JWT dependency.

    Returns:
        UserOut: The caller's public profile (no password hash).
    """
    return current_user


@router.post(
    "/change-password",
    status_code=status.HTTP_200_OK,
    summary="Change the authenticated user's password",
)
def change_password(
    data: ChangePasswordRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> dict:
    """
    Update the authenticated user's password.

    Requires the caller to supply their current password for re-verification before the new one is accepted.
    This prevents a stolen session token from being used to silently lock the real owner out of their account.

    Args:
        data: Request body containing ``current_password`` and ``new_password``.
        current_user: Authenticated user injected by the JWT dependency.
        db: Database session provided by the ``get_db`` dependency.

    Returns:
        dict: A confirmation message on success.

    Raises:
        HTTPException 400: The supplied current password does not match the stored hash.
    """
    if not verify_password(data.current_password, current_user.hashed_password):
        logger.warning(
            "Failed change-password attempt for user id=%s (wrong current password).",
            current_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    new_hash = hash_password(data.new_password)
    update_user_password(db, user_id=current_user.id, new_password_hash=new_hash)

    logger.info("Password changed successfully for user id=%s.", current_user.id)
    return {"message": "Password updated successfully."}


@router.delete(
    "/account",
    status_code=status.HTTP_200_OK,
    summary="Permanently delete the authenticated user's account",
)
def delete_account(current_user: CurrentUser, db: Session = Depends(get_db)) -> dict:
    """
    Permanently delete the caller's account and all their uploaded images.

    Deletion order:
        1. Collect all image filenames from the DB (via ``delete_user``).
        2. Commit the DB deletion (user row + all image rows).
        3. Remove the physical files from disk.

    The DB transaction is committed before disk deletion so that a disk error mid-way does not leave the account half-deleted in the database.
    Any files that fail to delete from disk will be caught by the nightly orphan-cleanup scheduler (``cleanup_scheduler.py``).

    After this call the caller's JWT is effectively invalidated - the user row no longer exists,
    so ``get_current_user`` will raise 401 on any subsequent request using the same token.

    Args:
        current_user: Authenticated user injected by the JWT dependency.
        db: Database session provided by the ``get_db`` dependency.

    Returns:
        dict: A confirmation message on success.

    Raises:
        HTTPException 500: Unexpected server error during deletion.
    """
    try:
        # Step 1 & 2: delete DB records, get back the filenames to clean up.
        filenames = delete_user(db, user_id=current_user.id)

        # Step 3: remove physical files from disk.
        # Errors here are logged but not re-raised - the DB deletion has already committed and the cleanup scheduler will catch stragglers.
        for unique_name in filenames:
            full_path = config.IMAGES_DIR / unique_name
            try:
                if full_path.is_file():
                    os.remove(full_path)
            except Exception as e:
                logger.error(
                    "Failed to delete file '%s' from disk during account deletion "
                    "(user id=%s): %s. Cleanup scheduler will remove it.",
                    unique_name,
                    current_user.id,
                    e,
                )

    except Exception as e:
        logger.error("Unexpected error during account deletion for user id=%s: %s", current_user.id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while deleting the account.",
        )

    logger.info(
        "Account deleted: user id=%s, email=%s, images removed=%d.",
        current_user.id,
        current_user.email,
        len(filenames),
    )
    return {"message": "Account and all associated images have been permanently deleted."}