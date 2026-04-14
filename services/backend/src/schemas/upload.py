"""
Pydantic schemas for request/response validation.
 
Image schemas
-------------
``ImageBase``           — shared fields present on every image-related payload.
``ImageUploadResponse`` — returned after a successful upload (adds ``url``).
``ImageInfo``           — full metadata including MIME type and upload time.
 
Authentication schemas
----------------------
``UserRegister``  — request body for ``POST /auth/register``.
``UserLogin``     — request body for ``POST /auth/login``.
``Token``         — response body returned after a successful login.
``TokenData``     — internal schema used when decoding a JWT (not sent to clients).
``UserOut``       — safe user info returned in responses (no password hash ever).
"""

from datetime import datetime

from pydantic import BaseModel, EmailStr


# ---------------------------------------------------------------------------
# Image schemas (unchanged)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Authentication schemas (new)
# ---------------------------------------------------------------------------


class UserRegister(BaseModel):
    """
    Request body for ``POST /auth/register``.
 
    Pydantic's ``EmailStr`` type validates that the value looks like a real
    email address (e.g. has an @ sign and a domain). It raises a 422 error
    automatically if the format is wrong — no manual checking needed.
 
    Attributes:
        email (EmailStr): The email address the user wants to register with.
        password (str): Plain-text password chosen by the user.
                        It is hashed immediately upon receipt and never stored
                        or logged as plain text anywhere in the system.
    """

    email: EmailStr
    password: str


class UserLogin(BaseModel):
    """
    Request body for ``POST /auth/login``.
 
    Identical fields to ``UserRegister`` — kept as a separate class so the
    two endpoints can evolve independently in the future (e.g. adding a
    CAPTCHA field to registration without touching login).
 
    Attributes:
        email (EmailStr): The user's registered email address.
        password (str): The plain-text password to verify against the stored hash.
    """

    email: EmailStr
    password: str


class Token(BaseModel):
    """
    Response body returned by ``POST /auth/login`` on success.
 
    The client receives this token and must include it in the ``Authorization``
    header of every subsequent protected request, formatted as:
        Authorization: Bearer <access_token>
 
    Attributes:
        access_token (str): The signed JWT string.
        token_type (str): Always ``"bearer"`` — part of the OAuth2 standard
                          that JWT-based auth follows.
    """

    access_token: str
    token_type: str = "bearer"  # Default value since it's always "bearer"


class TokenData(BaseModel):
    """
    Internal schema used when a JWT is decoded server-side.
 
    This schema is never sent to or received from the client. It represents
    the data extracted from the token's payload after successful verification.
 
    Attributes:
        user_id (int | None): The user's primary key, extracted from the
                              token's ``sub`` (subject) claim. ``None`` if
                              the token payload was missing or malformed.
    """

    user_id: int | None = None  # Default to None if the field is missing


class UserOut(BaseModel):
    """
    Safe user information returned in API responses.
 
    This schema is the only user-related object that ever leaves the server.
    The ``hashed_password`` field from the ORM model is deliberately absent —
    it must never appear in any response under any circumstance.
 
    ``from_attributes = True`` allows construction directly from a SQLAlchemy
    ``User`` ORM instance without manually mapping fields.
 
    Attributes:
        id (int): The user's primary key.
        email (str): The user's email address.
        is_admin (bool): Whether the user has administrator privileges.
        created_at (datetime): When the account was created.
    """

    id: int
    email: str
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}  # Pydantic v2 style (replaces inner Config class)