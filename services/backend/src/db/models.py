"""
SQLAlchemy ORM models.
 
Defines two models:
- ``User``  — registered accounts; each user owns their own images.
- ``Image`` — a single uploaded image, linked to its owner via ``user_id``.
 
Relationships
-------------
One ``User`` → many ``Image`` rows (one-to-many).
Each ``Image`` has a ``user_id`` foreign key that points back to ``Users.id``.
Deleting a user cascades and deletes all of their images automatically
(handled at the DB level via ``ondelete="CASCADE"``).
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
        hashed_password (str): Bcrypt hash of the user's password.
                                The plain-text password is NEVER stored.
        is_admin (bool): Whether this user has administrator privileges.
                         Admins can view and delete any user's images.
                         Regular users can only access their own.
        created_at (datetime): UTC timestamp when the account was created.
        images (list[Image]): All images that belong to this user.
                              Populated automatically by SQLAlchemy via the
                              relationship; not a real DB column.
    """

    __tablename__ = "Users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    # False by default — admin status is granted manually in the DB or via
    # a one-time setup script, never through the registration endpoint.
    is_admin = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # SQLAlchemy relationship — lets write ``user.images`` in Python code
    # to get all images owned by this user without writing a manual JOIN.
    # ``back_populates`` keeps both sides of the relationship in sync:
    # setting image.owner will also update user.images and vice-versa.
    images = relationship("Image", back_populates="owner", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        """
        Serialise the instance to a plain dictionary (safe for API responses).
 
        The ``hashed_password`` field is intentionally excluded — it must
        never leave the server in any response.
 
        Returns:
            dict: Public user fields only.
        """
        return {
            "id": self.id,
            "email": self.email,
            "is_admin": self.is_admin,
            "created_at": self.created_at.isoformat() if self.created_at else None,
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
        user_id (int): Foreign key → ``Users.id``.
                       Identifies the user who uploaded this image.
                       ``ondelete="CASCADE"`` means if the user is deleted,
                       all their images are deleted from the DB automatically.
        owner (User): The ``User`` object this image belongs to.
                      Populated automatically by SQLAlchemy; not a real DB column.
    """

    __tablename__ = "Images"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    original_name = Column(String)
    size = Column(Integer)
    unique_name = Column(String, unique=True)
    filepath = Column(String)
    mimetype = Column(String)
    # server_default ensures the column is populated even if upload_time is
    # omitted at the DB level; the application always sets it explicitly.
    upload_time = Column(DateTime, server_default=func.now())

    # --- NEW: ownership link ---
    # nullable=False means every image MUST belong to a user.
    # ondelete="CASCADE" is the PostgreSQL-level safety net: even if
    # SQLAlchemy's cascade is somehow bypassed, the DB itself will clean up.
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
