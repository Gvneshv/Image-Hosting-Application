"""The application configuration module.
 
All settings are loaded from environment variables (via the ``.env`` file) using Pydantic Settings. 
The single ``config`` instance at the bottom of this module is imported everywhere else - nothing reads ``os.environ`` directly.
 
Side effects:
    - Reads and parses the ``.env`` file during import.
    - Creates ``IMAGES_DIR`` and ``LOGS_DIR`` on disk if they do not exist.
"""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # This should be /usr/src/app

class AppConfig(BaseSettings):
    """The application settings loaded from environment variables.

        Attributes:
            ALLOWED_ORIGINS (list[str]): IPs, domains allowed to access the API
            ALLOWED_MIMETYPES (set[str]): Content-Type headers allowed
            SUPPORTED_FORMATS (set[str]): A set of allowed file extensions.
            MAX_SIZE (int): Maximum allowed size of uploaded files in bytes (default 5 MB).

            IMAGES_DIR (Path): The directory path where uploaded images are stored.
            LOGS_DIR (Path): The directory path where log files are saved.
            FRONTEND_DIR: (Path): The directory path where frontend files are located.
            FRONTEND_TEMPLATES_DIR: (Path): The directory where HTML templates are located.

            WEB_SERVER_WORKERS (int): The number of worker processes to run for the HTTP server.
                Keep at 1 unless the APScheduler cleanup job is moved to a separate container - multiple workers would run the scheduler simultaneously and create duplicate cleanup runs.
            WEB_SERVER_START_PORT (int): The starting port number for worker processes.

            SECRET_KEY (str): Long random string used to sign JWTs. Treat like a password - never hardcode, never commit. Generate with: ``openssl rand -hex 32``
            ALGORITHM (str): JWT signing algorithm. HS256 (HMAC-SHA256) is standard.
            ACCESS_TOKEN_EXPIRE_MINUTES (int): How many minutes a login token stays valid.
                After this time the user must log in again. Default is 10 080 minutes (= 7 days), which is comfortable for a personal app.
                Lower this (e.g. to 60) if you want tighter security.
            
            FIRST_ADMIN_EMAIL (str | None): If set, the first registration with this exact email address automatically receives ``is_admin=True``.
                Useful for fresh deployments so the admin does not need to touch the DB manually. Has no effect after that account already exists.
                Leave unset (or empty) if you prefer to grant admin manually.
 
            MAX_LOGIN_ATTEMPTS (int): Number of consecutive failed logins before the account is locked out. Default: 5.
            LOCKOUT_WINDOW_MINUTES (int): Rolling window (in minutes) over which failed attempts are counted. Attempts older than this are ignored.
                Default: 15 minutes.
            LOCKOUT_DURATION_MINUTES (int): How long the lockout lasts once triggered. Default: 15 minutes. An admin can also clear it early via the admin panel.

    """
    # ---------------------------------------------------------------------------
    # CORS configuration
    # ---------------------------------------------------------------------------
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:80",
        "http://localhost:8000"
    ]

    # ---------------------------------------------------------------------------
    # File upload configuration
    # ---------------------------------------------------------------------------
    MAX_SIZE: int = 5 * 1024 * 1024 # 5MB
    SUPPORTED_FORMATS: set[str] = {'.jpg', '.jpeg', '.png', '.gif'}
    ALLOWED_MIMETYPES: set[str] = {
        'image/jpeg',
        'image/png',
        'image/gif'
    }

    # ---------------------------------------------------------------------------
    # Path configuration
    # ---------------------------------------------------------------------------
    IMAGES_DIR: Path = BASE_DIR / "images"
    LOGS_DIR: Path = BASE_DIR / "logs"
    FRONTEND_DIR: Path = BASE_DIR / "frontend"
    FRONTEND_TEMPLATES_DIR: Path = FRONTEND_DIR / "templates"

    # ---------------------------------------------------------------------------
    # Server configuration
    # ---------------------------------------------------------------------------
    WEB_SERVER_WORKERS: int = 1
    WEB_SERVER_START_PORT: int = 8000

    # ---------------------------------------------------------------------------
    # JWT authentication configuration
    # ---------------------------------------------------------------------------
 
    # The secret key used to sign JWT tokens. Anyone who knows this value can forge tokens, so it must be kept private and never hardcoded in source.
    # Set it in services/backend/.env as:  SECRET_KEY=<your-generated-value>
    SECRET_KEY: str

    # HS256 (HMAC-SHA256) is the standard algorithm for signing JWTs. It is a symmetric algorithm - the same key signs and verifies tokens.
    # This value is a constant and does not need to be in .env.
    ALGORITHM: str = "HS256"

    # How long a token is valid after the user logs in. 10 080 minutes = 7 days. Adjust in .env if needed.
    # Example: ACCESS_TOKEN_EXPIRE_MINUTES=60  (1 hour, tighter security)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10_080

    # ---------------------------------------------------------------------------
    # First-admin promotion
    # ---------------------------------------------------------------------------
 
    # Optional. If set, the first registration using this email automatically gets is_admin=True. Has no effect if that email is already registered.
    # Leave unset or set to an empty string to disable automatic promotion.
    FIRST_ADMIN_EMAIL: str | None = None

    # ---------------------------------------------------------------------------
    # Login lockout
    # ---------------------------------------------------------------------------
 
    # Maximum number of consecutive failed logins before lockout is triggered.
    MAX_LOGIN_ATTEMPTS: int = 5
 
    # Rolling window in minutes over which failed attempts are counted.
    # Attempts older than this are not considered for the lockout check.
    LOCKOUT_WINDOW_MINUTES: int = 15
 
    # Duration of the lockout in minutes once triggered.
    # Admin can clear it early via the admin panel.
    LOCKOUT_DURATION_MINUTES: int = 15


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