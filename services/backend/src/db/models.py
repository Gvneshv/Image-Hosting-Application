"""
SQLAlchemy ORM models.
 
Defines two models:
- ``User``  - registered accounts; each user owns their own images.
- ``Image`` - a single uploaded image, linked to its owner via ``user_id``.
- ``LoginAttempt`` - tracks failed login attempts per email for lockout enforcement.
 
Relationships
-------------
One ``User`` -> many ``Image`` rows (one-to-many).
Each ``Image`` has a ``user_id`` foreign key that points back to ``Users.id``.
Deleting a user cascades and deletes all of their images automatically (handled at the DB level via ``ondelete="CASCADE"``).

LoginAttempt rows are intentionally not linked to ``Users.id`` via a FK so that attempts against non-existent accounts can still be recorded,
preventing a bypass where attackers use unregistered emails to avoid tracking.
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from db.database import Base

class User(Base):
    """
    Represents a registered user account.
 
    Attributes:
        id (int): Auto-incrementing primary key.
        email (str): Unique email address used to log in.
        hashed_password (str): Argon2id hash of the user's password. The plain-text password is NEVER stored.
        is_admin (bool): Whether this user has administrator privileges. Admins can view and delete any user's images. Regular users can only access their own.
        is_blocked (bool): Whether an admin has manually blocked this account. Blocked users cannot log in regardless of lockout state.
            Distinct from the automatic login-attempt lockout so that an admin block survives lockout resets.
        created_at (datetime): UTC timestamp when the account was created.
        last_login (datetime | None): UTC timestamp of the most recent successful login. ``None`` until the user has logged in once.
        registered_ip (str | None): IP address from which the account was created. Nullable for accounts that existed before this column was added.
        images (list[Image]): All images that belong to this user. Populated automatically by SQLAlchemy via the relationship; not a real DB column.
    """

    __tablename__ = "Users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    # False by default - admin status is granted manually in the DB or via a one-time setup script, never through the registration endpoint.
    is_admin = Column(Boolean, default=False, nullable=False)

    # Admin-controlled manual block. Set/cleared only by an admin via /admin routes.
    is_blocked = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # Updated on every successful login by routes_auth.login()
    last_login = Column(DateTime, nullable=True)

    # Captured from the request at registration time. Nullable for backward compatibility with rows created before this column existed.
    registered_ip = Column(String, nullable=True)

    # SQLAlchemy relationship - lets write ``user.images`` in Python code to get all images owned by this user without writing a manual JOIN.
    # ``back_populates`` keeps both sides of the relationship in sync: setting image.owner will also update user.images and vice-versa.
    images = relationship("Image", back_populates="owner", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        """
        Serialise the instance to a plain dictionary (safe for API responses).
 
        The ``hashed_password`` field is intentionally excluded - it must
        never leave the server in any response.
 
        Returns:
            dict: Public user fields only.
        """
        return {
            "id": self.id,
            "email": self.email,
            "is_admin": self.is_admin,
            "is_blocked": self.is_blocked,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "registered_ip": self.registered_ip,
        }


class Image(Base):
    """Represents a single uploaded image.
 
    Attributes:
        id (int): Auto-incrementing primary key.
        filename (str): Stored filename (UUID-suffixed, same as ``unique_name``).
        original_name (str): Sanitised original filename without extension.
        size (int): File size in bytes.
        unique_name (str): UUID-suffixed filename; used as the public identifier.
        filepath (str): Absolute path to the file on disk inside the container.
        mimetype (str): MIME type as reported by the HTTP client.
        upload_time (datetime): UTC datetime the file was uploaded.
        user_id (int): Foreign key -> ``Users.id``. Identifies the user who uploaded this image.
            ``ondelete="CASCADE"`` means if the user is deleted, all their images are deleted from the DB automatically.
        owner (User): The ``User`` object this image belongs to. Populated automatically by SQLAlchemy; not a real DB column.
    """

    __tablename__ = "Images"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    original_name = Column(String)
    size = Column(Integer)
    unique_name = Column(String, unique=True)
    filepath = Column(String)
    mimetype = Column(String)
    # server_default ensures the column is populated even if upload_time is omitted at the DB level; the application always sets it explicitly.
    upload_time = Column(DateTime, server_default=func.now())

    # --- ownership link ---
    # nullable=False means every image MUST belong to a user. 
    # ondelete="CASCADE" is the PostgreSQL-level safety net: even if SQLAlchemy's cascade is somehow bypassed, the DB itself will clean up.
    user_id = Column(
        Integer, 
        ForeignKey("Users.id", ondelete="CASCADE"), 
        nullable=False,
        index=True,
    )

    # The other side of the User.images relationship.
    owner = relationship("User", back_populates="images")


    def to_dict(self) -> dict:
        """Serialise the instance to a plain dictionary.

        Returns:
            dict: All fields with ``upload_time`` ISO-formatted (or ``None``).
            ``user_id`` is included so the API can return ownership info.
        """
        return {
            "id": self.id,
            "filename": self.filename,
            "original_name": self.original_name,
            "size": self.size,
            "unique_name": self.unique_name,
            "filepath": self.filepath,
            "mimetype": self.mimetype,
            "upload_time": self.upload_time.isoformat() if self.upload_time else None,
            "user_id": self.user_id,
        }


class LoginAttempt(Base):
    """
    Records each failed login attempt for a given email address.
 
    Used to enforce the login lockout policy: after ``MAX_LOGIN_ATTEMPTS`` consecutive failures within ``LOCKOUT_WINDOW_MINUTES``,
    all further login attempts for that email are rejected for ``LOCKOUT_DURATION_MINUTES``.
 
    Design decisions:
    - No FK to ``Users.id`` - attempts against non-existent accounts are also tracked, preventing a bypass where an attacker uses unregistered emails.
    - ``is_resolved`` lets admins clear a lockout from the admin panel without deleting the audit trail.
        The nightly cleanup scheduler prunes rows older than ``LOCKOUT_WINDOW_MINUTES`` to keep the table lean.
 
    Attributes:
        id (int): Auto-incrementing primary key.
        email (str): The email used in the attempt. Indexed for fast per-email queries.
        ip_address (str | None): Client IP at the time of the attempt.
        attempted_at (datetime): UTC timestamp of the attempt, stored as TIMESTAMP WITH TIME ZONE (+00 offset visible when reading the table directly in psql).
        is_resolved (bool): True once an admin has cleared this entry, or once the lockout window has naturally expired and the cleanup scheduler has marked/pruned it.
    """

    __tablename__ = "LoginAttempts"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True, nullable=False)
    ip_address = Column(String, nullable=True)
    attempted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Flipped to True by the admin panel (unlock) or by the cleanup scheduler.
    is_resolved = Column(Boolean, default=False, nullable=False)