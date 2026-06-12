"""
Pydantic schemas for admin API request/response validation.
 
These schemas are used exclusively by ``routes_admin.py``.
They are kept in a separate file from ``schemas/upload.py`` to avoid that module growing to cover unrelated concerns.
"""

from pydantic import BaseModel, EmailStr


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class AdminCreateUser(BaseModel):
    """
    Request body for ``POST /admin/users``.
 
    Extends the public registration schema with an explicit ``is_admin`` flag so admins can create other admins directly.
 
    Attributes:
        email: Unique email for the new account.
        password: Plain-text password - hashed immediately in the route.
        is_admin: Whether the new account should have admin privileges. Defaults to False (create a regular user).
    """

    email: EmailStr
    password: str
    is_admin: bool = False


class AdminSetBlocked(BaseModel):
    """
    Request body for ``PATCH /admin/users/{user_id}/block``.
 
    Attributes:
        blocked: True to block the account, False to unblock it.
    """

    blocked: bool


class AdminSetAdmin(BaseModel):
    """
    Request body for ``PATCH /admin/users/{user_id}/admin``.
 
    Attributes:
        is_admin: True to grant admin privileges, False to revoke them.
    """

    is_admin: bool


# ---------------------------------------------------------------------------
# Response bodies
# ---------------------------------------------------------------------------

class AdminUserDetail(BaseModel):
    """
    Extended user info returned by admin user-detail endpoints.
 
    Extends the public ``UserOut`` schema with fields that are only meaningful in an admin context (``registered_ip``, ``image_count``).
 
    ``from_attributes = True`` allows construction directly from a SQLAlchemy ``User`` ORM instance.
 
    Attributes:
        id: Primary key.
        email: User's email address.
        is_admin: Whether the user has admin privileges.
        is_blocked: Whether the account is manually blocked.
        created_at: Registration timestamp.
        last_login: Most recent successful login timestamp, or None.
        registered_ip: IP address used at registration, or None.
        image_count: Total number of images owned by this user.
    """

    id: int
    email: str
    is_admin: bool
    is_blocked: bool
    created_at: str
    last_login: str | None = None
    registered_ip: str | None = None
    image_count: int = 0


class AdminStatsOut(BaseModel):
    """
    Response body for ``GET /admin/stats``.
 
    Attributes:
        total_users: Total number of registered accounts.
        total_images: Total number of uploaded images across all users.
        total_size_bytes: Combined size of all uploaded images in bytes.
        blocked_users: Number of accounts currently blocked by an admin.
        admin_users: Number of accounts with ``is_admin=True``.
    """

    total_users: int
    total_images: int
    total_size_bytes: int
    blocked_users: int
    admin_users: int