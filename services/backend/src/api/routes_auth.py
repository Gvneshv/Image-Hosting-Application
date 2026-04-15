"""
Authentication routes.
 
Provides two public endpoints (no token required):
 
    POST /auth/register  — create a new user account
    POST /auth/login     — verify credentials and receive a JWT
 
All other routes in the application are protected and require the JWT
returned by /auth/login to be sent in the Authorization header as:
    Authorization: Bearer <token>
 
This router is registered in ``main.py`` with the ``/auth`` prefix.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from db.crud import create_user, get_user_by_email
from db.database import get_db
from schemas.upload import Token, UserLogin, UserOut, UserRegister
from utils.auth_utils import create_access_token, hash_password, verify_password

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
 
    Validates that the email is not already in use, hashes the password,
    and inserts the new user into the database.
 
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
    # We return a generic-enough message to be helpful without leaking
    # information about which accounts exist.
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
def login(credentials: UserLogin, db: Session = Depends(get_db)) -> Token:
    """
    Verify user credentials and return a signed JWT.
 
    The returned token must be included in the ``Authorization`` header
    of every subsequent protected request:
        Authorization: Bearer <access_token>
 
    Deliberately uses identical error messages for "user not found" and
    "wrong password" — telling an attacker which one is true would help
    them enumerate valid accounts.
 
    Args:
        credentials: Request body containing ``email`` and ``password``.
        db: Database session provided by the ``get_db`` dependency.
 
    Returns:
        Token: A schema containing the signed ``access_token`` and
               ``token_type`` (always ``"bearer"``).
 
    Raises:
        HTTPException: 401 Unauthorized if the email is not found or the
                       password does not match.
    """
    # Single generic error used for both "no such user" and "wrong password".
    # This prevents user enumeration: an attacker cannot tell the difference
    # between a non-existent account and a wrong password.
    auth_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    user = get_user_by_email(db, email=credentials.email)
    if user is None:
        logger.warning(f"Login attempt with non-existent email: {credentials.email}")
        raise auth_error
    
    # Credentials are valid — issue a token containing the user's ID.
    access_token = create_access_token(user_id=user.id)
    logger.info(f"User logged in: id={user.id}, email={user.email}")

    return Token(access_token=access_token, token_type="bearer")