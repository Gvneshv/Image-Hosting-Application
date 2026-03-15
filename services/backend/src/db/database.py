"""
Database engine and session configuration.

Creates the SQLAlchemy engine using the ``DATABASE_URL`` environment variable
and exports:

- ``engine``      — the configured connection pool
- ``SessionLocal`` — a session factory for creating DB sessions
- ``Base``        — the declarative base class that all ORM models inherit from
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import QueuePool

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError(
        "DATABASE_URL environment variable is not set. "
        "Please configure it in your .env file."
    )

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=5,        # Persistent connections kept open
    max_overflow=10,    # Extra connections allowed beyond pool_size under load
    pool_timeout=30,    # Seconds to wait for a free connection before raising
    pool_recycle=3600,  # Recycle connections after 1 h to prevent stale connections
    pool_pre_ping=True, # Test each connection before use (handles dropped connections)
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
