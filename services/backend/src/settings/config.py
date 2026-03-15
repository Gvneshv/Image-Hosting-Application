"""The application configuration module.

This module defines the AppConfig class, which loads application settings from
environment variables using Pydantic. It supports configurable paths for image
storage, logging, allowed file formats, and file size limits.

Side effects:
    - Reads and parses environment variables from the `.env` file during import.
"""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # This should be /usr/src/app

class AppConfig(BaseSettings):
    """The application settings loaded from environment variables.

        Attributes:
            ALLOWED_ORIGINS (list[str]): IPs, domains allowed to access the API
            ALLOWED_MIMETYPES (dict): Content-Type headers allowed
            IMAGES_DIR (Path): The directory path where uploaded images are stored.
            WEB_SERVER_WORKERS (int): The number of worker processes to run for the HTTP server.
            WEB_SERVER_START_PORT (int): The starting port number for worker processes.
            LOGS_DIR (Path): The directory path where log files are saved.
            FRONTEND_DIR: (Path): The directory path where frontend files are located.
            FRONTEND_TEMPLATES_DIR: (Path): The directory where HTML templates are located.
            MAX_SIZE (int): Maximum allowed size of uploaded files (in bytes).
            SUPPORTED_FORMATS (set[str]): A set of allowed file extensions.
    """
    # CORS configuration
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:80",
        "http://localhost:8000"
    ]

    # File upload configuration
    MAX_SIZE: int = 5 * 1024 * 1024 # 5MB
    SUPPORTED_FORMATS: set[str] = {'.jpg', '.jpeg', '.png', '.gif'}
    ALLOWED_MIMETYPES: set[str] = {
        'image/jpeg',
        'image/png',
        'image/gif'
    }

    # Path configuration
    IMAGES_DIR: Path = BASE_DIR / "images"
    LOGS_DIR: Path = BASE_DIR / "logs"
    FRONTEND_DIR: Path = BASE_DIR / "frontend"
    FRONTEND_TEMPLATES_DIR: Path = FRONTEND_DIR / "templates"

    # Server configuration
    WEB_SERVER_WORKERS: int = 1
    WEB_SERVER_START_PORT: int = 8000

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra='ignore'
    )

# The global application config instance
config = AppConfig()

# Ensure folders exist (avoid container errors)
for folder in [config.IMAGES_DIR, config.LOGS_DIR]:
    folder.mkdir(parents=True, exist_ok=True)