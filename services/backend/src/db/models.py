"""
SQLAlchemy ORM models.

Currently, defines a single model, ``Image``, which maps to the ``Images``
table in PostgreSQL.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, func

from db.database import Base


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

    def to_dict(self) -> dict:
        """Serialise the instance to a plain dictionary.

        Returns:
            dict: All fields with ``upload_time`` ISO-formatted (or ``None``).
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
        }
