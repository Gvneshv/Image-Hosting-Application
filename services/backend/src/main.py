"""
Application entry point.
 
Initialises the FastAPI application with a lifespan context that starts and
gracefully stops the background cleanup scheduler. Also registers:
  - CORS middleware (with ``allow_credentials=True`` for JWT Bearer auth)
  - Request-ID injection middleware
  - SlowAPI rate-limit exception handler
  - The image upload/management router (``/``, ``/upload``, etc.)
  - The authentication router (``/auth/register``, ``/auth/login``)
  - Static mounts for uploaded images and the frontend SPA
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from api.routes_auth import router as auth_router
from api.routes_upload import router as upload_router
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
    # allow_credentials must be True when the frontend sends an
    # Authorization header with a Bearer token. Without this, the browser
    # blocks the request during the CORS preflight check.
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

app.add_middleware(RequestIDMiddleware)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- Routers ---
 
# Authentication routes: /auth/register, /auth/login
# Registered first so they are always reachable, even if something below
# fails to initialise. These endpoints are the entry point to the entire app.
app.include_router(auth_router)

# Image management routes: /upload, /file_info, /all_images, /view, /health
app.include_router(upload_router)

# --- Static mounts ---

# Serve uploaded images at /images/<filename>
app.mount("/images", StaticFiles(directory=config.IMAGES_DIR), name="images")

# Serve the frontend SPA (must be last — catches all remaining paths)
# Any URL not matched by a router or earlier mount falls through to here,
# which lets the browser load the correct HTML file directly.
app.mount("/", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
