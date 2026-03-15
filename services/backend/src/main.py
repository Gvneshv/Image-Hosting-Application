"""
Application entry point.

Initialises the FastAPI application with a lifespan context that starts and
gracefully stops the background cleanup scheduler.  Also registers:
  - CORS middleware
  - Request-ID injection middleware
  - SlowAPI rate-limit exception handler
  - The main API router
  - Static mounts for uploaded images and the frontend SPA
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from api.routes_upload import router
from db import cleanup_scheduler          # Import so the lifespan can control it
from settings.config import config
from settings.logging_config import setup_logging
from middleware.request_id import RequestIDMiddleware
from utils.rate_limiter import limiter

setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background jobs on startup and shut them down on exit."""
    logger.info("Starting background cleanup scheduler...")
    cleanup_scheduler.scheduler.start()
    yield
    logger.info("Shutting down background cleanup scheduler...")
    cleanup_scheduler.scheduler.shutdown(wait=False)


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    # allow_credentials=True,  # Enable if cookies / HTTP auth are needed
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

app.add_middleware(RequestIDMiddleware)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# API routes
app.include_router(router)

# Serve uploaded images at /images/<filename>
app.mount("/images", StaticFiles(directory=config.IMAGES_DIR), name="images")

# Serve the frontend SPA (must be last — catches all remaining paths)
app.mount("/", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
