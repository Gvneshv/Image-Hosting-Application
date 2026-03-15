"""
Background scheduler for orphaned-file cleanup.

Defines a single APScheduler ``BackgroundScheduler`` instance and the
``cleanup_orphan_files`` job that runs once per day at midnight.

The scheduler is intentionally **not** started here at import time.
``main.py`` starts and stops it via the FastAPI lifespan context so that
the lifecycle is tied to the application process rather than to module
import order.
"""

import os
import logging

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from db.database import SessionLocal
from db.models import Image
from settings.config import config

logger = logging.getLogger(__name__)


def cleanup_orphan_files() -> None:
    """Remove files and DB records that have become orphaned.

    An "orphan on disk" is a file in the images directory that has no
    corresponding database row.  An "orphan in DB" is a row whose file
    no longer exists on disk.  Both kinds are cleaned up in a single run.
    """
    try:
        db: Session = SessionLocal()
    except Exception as e:
        logger.error(f"Failed to create database session for cleanup: {e}")
        return

    try:
        # All unique names currently tracked in the database
        db_files = {img.unique_name for img in db.query(Image).all()}

        if not config.IMAGES_DIR.exists():
            logger.warning(f"Image directory does not exist: {config.IMAGES_DIR}")
            return

        # All files currently present on disk
        disk_files = set(os.listdir(config.IMAGES_DIR))

        # 1. Delete files on disk that have no DB record
        orphans_on_disk = disk_files - db_files
        for filename in orphans_on_disk:
            full_path = config.IMAGES_DIR / filename
            try:
                os.remove(full_path)
                logger.info(f"Scheduled cleanup: deleted orphaned file '{filename}' from disk.")
            except Exception as e:
                logger.error(f"Scheduled cleanup: failed to delete '{filename}' from disk: {e}")

        # 2. Delete DB rows whose file no longer exists on disk
        orphans_in_db = db_files - disk_files
        for filename in orphans_in_db:
            try:
                image = db.query(Image).filter(Image.unique_name == filename).first()
                if image:
                    db.delete(image)
                    logger.info(f"Scheduled cleanup: deleted orphaned DB entry for '{filename}'.")
            except Exception as e:
                logger.error(f"Scheduled cleanup: failed to delete DB entry for '{filename}': {e}")
                db.rollback()  # Roll back only this deletion so others can proceed

        db.commit()
        logger.info(
            f"Scheduled cleanup complete — "
            f"disk orphans removed: {len(orphans_on_disk)}, "
            f"DB orphans removed: {len(orphans_in_db)}."
        )

    except Exception as e:
        logger.error(f"Cleanup job failed: {e}")
        db.rollback()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Scheduler instance
# ---------------------------------------------------------------------------
# The scheduler is configured here but NOT started.
# main.py starts it inside the FastAPI lifespan context.
# ---------------------------------------------------------------------------
scheduler = BackgroundScheduler()
scheduler.add_job(cleanup_orphan_files, "cron", hour=0, minute=0, second=0)
