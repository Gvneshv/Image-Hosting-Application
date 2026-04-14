"""
Authentication utilities.
 
This module is the single source of truth for everything auth-related:
 
- Password hashing and verification (bcrypt via ``passlib``)
- JWT token creation and decoding (via ``python-jose``)
- The ``get_current_user`` FastAPI dependency, which every protected route
  uses to identify the caller
 
How the flow works (plain English)
------------------------------------
1. User registers → their password is hashed by ``hash_password()`` and the
   hash is saved to the DB. The plain-text password is discarded immediately.
 
2. User logs in → ``verify_password()`` compares what they typed against the
   stored hash. If it matches, ``create_access_token()`` returns a signed JWT
   containing the user's ID.
 
3. User makes any protected request → they include the JWT in the
   ``Authorization: Bearer <token>`` header. The ``get_current_user``
   dependency intercepts the request, calls ``decode_access_token()`` to
   verify and unpack the token, then loads the user from the DB and returns
   them to the route. If anything is wrong (missing, expired, tampered), a
   401 Unauthorized error is raised automatically.
"""

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from db.crud import get_user_by_id
from db.database import get_db
from db.models import User
from schemas.upload import TokenData
from settings.config import config

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------
 
# CryptContext wraps passlib and lets us swap algorithms later without
# changing call sites. "bcrypt" is the industry standard for passwords:
# it is intentionally slow, making brute-force attacks expensive.
# ``deprecated="auto"`` means old hashes (if we ever change algorithm) are
# automatically recognised and flagged for re-hashing on next login.
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain_password: str) -> str:
    """
    Hash a plain-text password with bcrypt.
 
    This function should be called exactly once per password: at registration
    (or password change). The resulting hash is what gets stored in the DB.
    The plain-text password must be discarded after this call.
 
    Args:
        plain_password: The raw password string provided by the user.
 
    Returns:
        str: A bcrypt hash string (e.g. ``$2b$12$...``).
             Safe to store in the database.
    """
    return _pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Check a plain-text password against a stored bcrypt hash.
 
    Used during login. bcrypt re-hashes the plain password with the same
    salt that is embedded in the stored hash, then compares results.
    The comparison is timing-safe (constant-time) to prevent timing attacks.
 
    Args:
        plain_password: The raw password string typed by the user at login.
        hashed_password: The bcrypt hash stored in the ``Users`` table.
 
    Returns:
        bool: ``True`` if the password matches the hash, ``False`` otherwise.
    """
    return _pwd_context.verify(plain_password, hashed_password)


# ---------------------------------------------------------------------------
# JWT tokens
# ---------------------------------------------------------------------------
 
# OAuth2PasswordBearer tells FastAPI where to look for the token in incoming
# requests. ``tokenUrl`` is informational (used by Swagger UI to know where
# the login endpoint is). The actual extraction happens automatically:
# FastAPI reads the ``Authorization: Bearer <token>`` header for us.
_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def create_access_token(user_id: int) -> str:
    """
    Create a signed JWT for the given user.
 
    The token embeds the user's ID in its ``sub`` (subject) claim and an
    ``exp`` (expiry) claim. Both are standard JWT fields. The token is signed
    with ``config.SECRET_KEY`` using the HS256 algorithm, so any tampering
    (e.g. changing the user ID inside the token) will be detected when the
    signature is verified.
 
    Think of a JWT like a sealed envelope: anyone can read what's written on
    the outside, but the wax seal proves it came from us and hasn't been
    opened.
 
    Args:
        user_id: The primary key of the user this token is issued for.
 
    Returns:
        str: A compact, URL-safe JWT string (three base64 segments joined by dots).
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)

    # The payload (also called "claims") is a plain dict that gets encoded
    # into the token. ``sub`` is the standard claim for "who this token is
    # about". We store the user_id as a string — JWT sub is always a string.
    payload = {
        "sub": str(user_id), 
        "exp": expire
    }

    return jwt.encode(payload, config.SECRET_KEY, algorithm=config.ALGORITHM)


def decode_access_token(token: str) -> TokenData:
    """
    Decode and verify a JWT, returning the embedded user ID.
 
    This function is the verification step: it checks the signature (was this
    token really signed by us?), checks the expiry (is it still valid?), and
    extracts the ``sub`` claim (whose token is this?).
 
    It does NOT hit the database. Database lookup happens in
    ``get_current_user`` after this function confirms the token is valid.
 
    Args:
        token: The raw JWT string from the ``Authorization`` header.
 
    Returns:
        TokenData: A schema containing the extracted ``user_id``.
 
    Raises:
        HTTPException: 401 Unauthorized if the token is missing, expired,
                       has been tampered with, or is otherwise invalid.
    """
    # We define the exception once so we can reuse it in multiple failure
    # branches below without repeating the same arguments.
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        # WWW-Authenticate header is required by the OAuth2 / Bearer spec.
        # It tells the client what kind of auth is expected.
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=[config.ALGORITHM])

        # Extract the subject claim (stored as a string)
        user_id_str: str | None = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        
        return TokenData(user_id=int(user_id_str))
    
    except JWTError:
        # JWTError covers: invalid signature, expired token, malformed token.
        # We intentionally surface the same generic error for all of these —
        # telling an attacker *why* their token was rejected is unnecessary.
        raise credentials_exception


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

def get_current_user(db: Session = Depends(get_db), token: str = Depends(_oauth2_scheme)) -> User:
    """
    FastAPI dependency that resolves the current authenticated user.
 
    This function is injected into every protected route via
    ``Depends(get_current_user)``. FastAPI calls it automatically before the
    route handler runs, passing in the extracted token and a DB session.
 
    The chain is:
        Request arrives
            → FastAPI extracts Bearer token from the Authorization header
            → ``decode_access_token`` verifies the JWT and gets the user_id
            → ``get_user_by_id`` loads the User from the database
            → The User object is passed into the route as ``current_user``
 
    If any step fails (bad token, expired token, user deleted), a 401 is
    raised and the route handler never executes.
 
    Args:
        token: JWT string automatically extracted from the Authorization header
               by FastAPI's ``OAuth2PasswordBearer`` scheme.
        db: Database session provided by the ``get_db`` dependency.
 
    Returns:
        User: The authenticated and database-verified User ORM instance.
 
    Raises:
        HTTPException: 401 if the token is invalid or the user no longer exists.
    """
    token_data = decode_access_token(token)

    user = get_user_by_id(db, user_id=token_data.user_id)

    if user is None:
        # The token was valid but the user has been deleted since it was issued.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="User account not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user