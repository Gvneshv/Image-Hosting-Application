"""
Centralised logging configuration for the application.

Both the console handler and the file handler use INFO as the minimum level
(set via ``basicConfig``).  Noisy third-party loggers (``httpx``,
``uvicorn.access``) are silenced to WARNING so they do not clutter the output.

The log file is written to ``<LOGS_DIR>/app.log`` as defined in the
application config.
"""

import logging

from settings.config import config


def setup_logging() -> None:
    """Configure the root logger for the entire application.

    Sets up two handlers:
    - **StreamHandler** (console) — INFO and above.
    - **FileHandler**  (``logs/app.log``) — INFO and above.

    Should be called once, at application startup, before any other module
    creates a logger.
    """
    log_file = config.LOGS_DIR / "app.log"

    # Ensure the log directory exists before attaching the FileHandler
    log_file.parent.mkdir(parents=True, exist_ok=True)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[
            logging.StreamHandler(),                             # Console output
            logging.FileHandler(log_file, encoding="utf-8"),    # Persistent file output
        ],
    )

    # Silence noisy libraries that would otherwise flood the logs
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
