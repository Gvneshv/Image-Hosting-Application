"""The application configuration module.
 
This module defines the AppConfig class, which loads application settings from
environment variables using Pydantic. It supports configurable paths for image
storage, logging, allowed file formats, file size limits, and JWT authentication.
 
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

            SECRET_KEY (str): A long, random string used to sign and verify JWT tokens.
                            Treat this like a password — keep it secret, never commit it.
                            Generate a safe value with:
                                python -c "import secrets; print(secrets.token_hex(32))"
                            Must be set in the ``.env`` file.
            ACCESS_TOKEN_EXPIRE_MINUTES (int): How many minutes a login token stays valid.
                                           After this time the user must log in again.
                                           Default is 10 080 minutes (= 7 days), which
                                           is comfortable for a personal app. Lower this
                                           (e.g. to 60) if you want tighter security.
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

    # --- JWT authentication configuration ---
 
    # The secret key used to sign JWT tokens. Anyone who knows this value can
    # forge tokens, so it must be kept private and never hardcoded in source.
    # Set it in services/backend/.env as:  SECRET_KEY=<your-generated-value>
    SECRET_KEY: str

    # HS256 (HMAC-SHA256) is the standard algorithm for signing JWTs.
    # It is a symmetric algorithm — the same key signs and verifies tokens.
    # This value is a constant and does not need to be in .env.
    ALGORITHM: str = "HS256"

    # How long a token is valid after the user logs in.
    # 10 080 minutes = 7 days. Adjust in .env if needed.
    # Example: ACCESS_TOKEN_EXPIRE_MINUTES=60  (1 hour, tighter security)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10_080

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra='ignore'
    )

# The global application config instance
config = AppConfig()

# Ensure required folders exist so the app never crashes on a missing directory.
for folder in [config.IMAGES_DIR, config.LOGS_DIR]:
    folder.mkdir(parents=True, exist_ok=True)