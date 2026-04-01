# 🖼️ Image Hosting Application

A self-hosted, full-featured image hosting web application built with **FastAPI** and vanilla **JavaScript**. Upload, manage, and share images through a clean browser interface, drag-and-drop, or directly via API — all running in Docker with production-grade infrastructure.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Environment Variables](#environment-variables)
- [Makefile](#makefile)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Overview

This application provides a complete self-hosted image hosting solution. Images are uploaded to a FastAPI backend, stored on disk, and tracked in a PostgreSQL database. The frontend is a responsive, single-page-style interface with tab switching, sorting, pagination, a lightbox viewer, and full keyboard navigation — all without page reloads. The entire stack runs in Docker containers and is production-ready with Nginx as a reverse proxy, PgBouncer for connection pooling, automated database backups, and structured logging throughout.

---

## Features

### Upload

![Upload demo](https://github.com/gxneshx/Image_Hosting_Project_2.0/releases/download/v1.0.0/image_upload.gif)
![Drag and drop demo](https://github.com/gxneshx/Image_Hosting_Project_2.0/releases/download/v1.0.0/dragging.gif)

- Upload images via browser file picker, drag-and-drop, or REST API
- Per-IP rate limiting to prevent abuse (10 uploads per minute)
- File size and extension validation on both client and server
- Deep content inspection — verifies that uploads are genuine images, not files disguised with an image extension (via Pillow)
- Instant URL copy on the upload page after a successful upload

### Image Library

![Sorting demo](https://github.com/gxneshx/Image_Hosting_Project_2.0/releases/download/v1.0.0/sort.gif)
![Pagination demo](https://github.com/gxneshx/Image_Hosting_Project_2.0/releases/download/v1.0.0/pagination_copy.gif)
![Delete from gallery demo](https://github.com/gxneshx/Image_Hosting_Project_2.0/releases/download/v1.0.0/gallery_copy_delete.gif)

- Toggle between the upload form and image library without a page reload
- Library updates in real time without reloading when images are added or deleted
- Sort images by upload time, file size, or filename in ascending or descending order
- Pagination with a configurable number of images per page (3 / 6 / 9)
- Each image cell shows a preview with buttons to copy its URL or delete it
- Deletion uses a custom confirmation dialog; the library refreshes instantly after deletion
- Open any image in the same tab or a new tab directly from the library

### Image Viewer

![Lightbox and fullscreen demo](https://github.com/gxneshx/Image_Hosting_Project_2.0/releases/download/v1.0.0/viewer_lightbox_fs_mode.gif)
![Viewer actions demo](https://github.com/gxneshx/Image_Hosting_Project_2.0/releases/download/v1.0.0/viewer_copy_download_delete.gif)

- Individual image pages display full metadata: filename, original name, unique name, size, type, and upload date
- Individual image pages are server-rendered with Jinja2 Templates
- Buttons to download the image, copy its URL, or delete it
- Lightbox overlay mode and full-screen mode with zoom in/out (mouse wheel) and pan (drag)
- Double-click resets zoom and position
- Navigate between images using on-screen arrow buttons, thumbnail previews of the previous/next image at the bottom of the screen, or keyboard shortcuts (`←` / `→` to navigate, `Esc` to close)
- Close the overlay by clicking the darkened area outside the image

### Infrastructure & Reliability
- Fully containerized with Docker (backend, database, backup, PgBouncer, Nginx)
- Database schema managed and migrated automatically on startup with Alembic
- Scheduled database backups via cron (daily at 02:00, retains last 7 backups)
- Orphaned file cleanup — removes stale records from the database and orphaned files from disk (daily at midnight via APScheduler, started via FastAPI lifespan)
- Health checks on backend, database, and PgBouncer containers during startup
- Nginx reverse proxy handles all incoming traffic including Swagger UI (`/docs`)
- PgBouncer manages and pools PostgreSQL connections (session mode)
- Structured, leveled logging to console and file via a dedicated logging configuration
- All configuration managed through a single `.env` file
- Full Swagger UI available at `/docs`
- Responsive design — works on desktops, tablets, and phones
- Non-root user inside the backend container for security

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.12, FastAPI, SQLAlchemy, Alembic, Pydantic v2 |
| **Frontend** | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| **Database** | PostgreSQL 17 |
| **Connection Pooling** | PgBouncer 1.24 |
| **Reverse Proxy** | Nginx (stable-alpine) |
| **Containerization** | Docker, Docker Compose |
| **Package Management** | Poetry |
| **Templating** | Jinja2 |
| **Image Validation** | Pillow |
| **Rate Limiting** | SlowAPI |
| **Scheduling** | APScheduler |
| **Logging** | Python `logging` (structured, leveled) |
| **Migrations** | Alembic |
| **Backups** | Bash + cron |

---

## Project Structure

```
Project/
├── logs/
│   └── pgbouncer/
│       └── pgbouncer.log           # PgBouncer connection logs
├── services/
│   ├── backend/
│   │   ├── backup/                 # Backup files written here (gitignored)
│   │   ├── src/
│   │   │   ├── api/
│   │   │   │   └── routes_upload.py        # All API route definitions
│   │   │   ├── db/
│   │   │   │   ├── cleanup_scheduler.py    # Orphaned file & record cleanup
│   │   │   │   ├── crud.py                 # Database CRUD operations
│   │   │   │   ├── database.py             # DB engine & session setup
│   │   │   │   └── models.py               # SQLAlchemy ORM models
│   │   │   ├── handlers/
│   │   │   │   └── upload.py               # Upload validation & storage logic
│   │   │   ├── interfaces/
│   │   │   │   └── protocols.py            # Structural subtyping protocols
│   │   │   ├── middleware/
│   │   │   │   └── request_id.py           # Per-request UUID injection
│   │   │   ├── migrations/
│   │   │   │   ├── versions/               # Alembic migration scripts
│   │   │   │   ├── env.py                  # Alembic environment config
│   │   │   │   └── script.py.mako          # Migration script template
│   │   │   ├── schemas/
│   │   │   │   └── upload.py               # Pydantic request/response schemas
│   │   │   ├── scripts/
│   │   │   │   ├── entrypoint.sh           # Container startup script
│   │   │   │   └── wait-for-db.sh          # PgBouncer readiness probe
│   │   │   ├── settings/
│   │   │   │   ├── config.py               # App settings loaded from .env
│   │   │   │   └── logging_config.py       # Logging setup
│   │   │   ├── utils/
│   │   │   │   └── rate_limiter.py         # Per-IP rate limiter (SlowAPI)
│   │   │   ├── alembic.ini                 # Alembic configuration
│   │   │   ├── poetry.lock
│   │   │   ├── pyproject.toml
│   │   │   └── main.py                     # FastAPI app entry point & lifespan
│   │   ├── Dockerfile
│   │   └── .env                            # All environment variables (never commit)
│   ├── backup/
│   │   ├── backup.sh                       # pg_dump script with 7-backup retention
│   │   ├── crontab                         # Runs backup.sh daily at 02:00
│   │   └── Dockerfile
│   ├── frontend/
│   │   ├── base_images/                    # Static SVG illustrations & icons
│   │   ├── css/
│   │   │   ├── index.css                   # Landing page styles
│   │   │   ├── upload.css                  # Upload & library page styles
│   │   │   └── viewer.css                  # Image viewer & lightbox styles
│   │   ├── js/
│   │   │   ├── index.js                    # Landing page logic
│   │   │   ├── modal.js                    # Custom confirmation/alert dialogs
│   │   │   ├── tabs.js                     # Tab switching without reload
│   │   │   ├── upload.js                   # Upload form, drag-and-drop, library
│   │   │   └── viewer.js                   # Lightbox, fullscreen, keyboard nav
│   │   ├── templates/
│   │   │   └── viewer.html                 # Jinja2 individual image page
│   │   ├── index.html                      # Landing page
│   │   └── upload.html                     # Upload + library page
│   ├── nginx/
│   │   └── nginx.conf                      # Reverse proxy config with gzip
│   └── pgbouncer/
│       ├── Dockerfile                      # Installs envsubst, runs entrypoint
│       ├── entrypoint.sh                   # Resolves template at container startup
│       └── pgbouncer.ini.template          # PgBouncer config with ${VAR} placeholders
├── .dockerignore
├── .gitattributes
├── .gitignore
├── docker-compose.yml                      # Multi-container orchestration
├── Makefile                                # Convenience commands
└── README.md
```

---

## Installation

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- Git

### Steps

**1. Clone the repository**

```bash
git clone <your-repository-url>
cd Project
```

**2. Configure environment variables**

Copy the example file and fill in your values:

```bash
cp services/backend/.env.example services/backend/.env
```

Open `services/backend/.env` and replace all placeholder values before proceeding. See [Environment Variables](#environment-variables) for the full reference. Pay particular attention to the `DATABASE_URL` note — it must be written as a literal string.

**3. Create the PgBouncer log directory**

```bash
mkdir -p logs/pgbouncer
```

**4. Build and start all containers (requires Make build tool to be installed)**

```bash
make up
```

Or directly:

```bash
docker compose up --build -d
```

The database schema is created and migrated automatically on startup via Alembic. The cleanup scheduler starts automatically as part of the FastAPI application lifespan.

**5. Access the application**

| Service | URL |
|---|---|
| Application | `http://localhost` |
| API Docs (Swagger) | `http://localhost/docs` |

> **Note:** If startup fails and you need to start fresh, run `docker compose down -v` before trying again. The `-v` flag removes named volumes and forces PostgreSQL to reinitialise cleanly.

### Testing on a phone or another device

Find your machine's local IP address:

```bash
# macOS / Linux
ipconfig getifaddr en0

# Windows
ipconfig   # look for IPv4 Address under your Wi-Fi adapter
```

Then open `http://192.168.x.x` on any device connected to the same Wi-Fi network. No extra configuration is needed — Nginx is already listening on `0.0.0.0:80`.

---

## Usage

### Uploading Images

Navigate to `http://localhost`. Click the button on the landing page to reach the upload interface. You can upload an image by:

- Clicking the upload area and selecting a file
- Dragging and dropping an image onto the upload zone
- Using the REST API directly (see [API Documentation](#api-documentation))

Once uploaded, the image URL is displayed and can be copied instantly.

### Managing Your Library

Click the **Images** tab to switch to the image gallery without reloading the page. From there you can:

- **Sort** images by upload time, size, or filename (toggle ascending/descending)
- **Paginate** through images and choose how many appear per page
- **Copy** an image URL directly from its library card
- **Delete** an image — a confirmation dialog will appear; the library refreshes automatically
- **Open** an image in the same tab or a new tab via the buttons on each card

### Viewing an Image

The individual image page shows full metadata and provides buttons to download, copy the URL, or delete the image. You can also enter:

- **Lightbox mode** — overlay with zoom (mouse wheel), pan (drag), and double-click to reset
- **Full-screen mode** — browser-native fullscreen of the overlay

Navigate between images using on-screen controls, thumbnail previews at the bottom of the screen, or keyboard shortcuts (`←` / `→` to navigate, `Esc` to close).

---

## API Documentation

Interactive Swagger documentation is available at **`http://localhost/docs`** when the application is running.

### Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Welcome / liveness ping |
| `GET` | `/upload` | Paginated image list with sorting |
| `POST` | `/upload/` | Upload an image (rate-limited: 10/min per IP) |
| `DELETE` | `/upload/{filename}` | Delete an image by unique name |
| `GET` | `/file_info/{filename}` | Metadata for a single image |
| `GET` | `/all_images` | Full image list for the viewer slideshow |
| `GET` | `/view/{filename}` | Render the Jinja2 image viewer page |
| `GET` | `/health` | Health check (database + filesystem) |

### Upload Constraints

- **Allowed extensions:** `.jpg`, `.jpeg`, `.png`, `.gif`
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/gif`
- **Max file size:** 5 MB (configurable via `config.py`)
- **Rate limit:** 10 uploads per minute per IP

### Example: Upload via cURL

```bash
curl -X POST http://localhost/upload/ \
  -F "file=@/path/to/your/image.jpg"
```

### Example: List Images

```bash
curl "http://localhost/upload?sort_by=upload_time&sort_order=desc&page=1&per_page=6"
```

---

## Environment Variables

All configuration lives in `services/backend/.env`. This file is never committed to version control.

> **Important:** `pydantic-settings` does not interpolate `${VAR}` syntax in `.env` files. `DATABASE_URL` must be written as a fully resolved literal string — do not use variable references inside it.

| Variable | Description | Example |
|---|---|---|
| `POSTGRES_DB` | PostgreSQL database name | `appdb` |
| `POSTGRES_USER` | PostgreSQL username | `appuser` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `changeme` |
| `POSTGRES_HOST` | PostgreSQL hostname (Docker service name) | `db` |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |
| `DATABASE_URL` | Full SQLAlchemy connection URL — write literally | `postgresql+psycopg2://appuser:changeme@pgbouncer:6432/appdb` |
| `BACKEND_WORKERS` | Number of Uvicorn worker processes | `1` |
| `WEB_SERVER_START_PORT` | Uvicorn listening port | `8000` |

### A note on `BACKEND_WORKERS`

`1` is the correct value for this stack. Uvicorn is async and handles concurrent requests efficiently with a single worker. Setting this higher would cause the APScheduler cleanup job to run once per worker simultaneously. To safely use multiple workers, move the scheduler to a dedicated container or cron job first.

---

## Makefile

All commands are run from the project root.

| Command | Description |
|---|---|
| `make up` | Build images and start all containers in detached mode |
| `make down` | Stop and remove containers (volumes are preserved) |
| `make restart` | Restart all containers without rebuilding |
| `make logs` | Tail backend logs (Ctrl-C to exit) |
| `make shell` | Open an interactive shell inside the backend container |
| `make revision m="message"` | Generate a new Alembic migration |
| `make upgrade` | Apply all pending Alembic migrations |
| `make downgrade` | Roll back the most recent Alembic migration |

---

## Troubleshooting

### Port 80 already in use (Windows)

If you see `bind: An attempt was made to access a socket in a way forbidden by its access permissions`, Windows has port 80 reserved. The most common cause is IIS (Internet Information Services).

Stop IIS and disable it:

```powershell
Stop-Service W3SVC
Set-Service W3SVC -StartupType Disabled
```

If that alone does not free the port, release the HTTP.sys reservations as Administrator:

```powershell
netsh http delete urlacl url=http://+:80/Temporary_Listen_Addresses/
netsh http delete urlacl url=http://+:80/0131501b-d67f-491b-9a40-c4bf27bcb4d4/
netsh http delete urlacl url=http://+:80/116B50EB-ECE2-41ac-8429-9F9E963361B7/
```

Then run `docker compose up` again. The exact GUIDs in the URLs may differ on your machine — run `netsh http show urlacl | findstr :80` to see what is reserved.

---

### Shell scripts fail with "no such file or directory" (Windows)

If a container fails immediately with `exec /entrypoint.sh: no such file or directory` despite the file existing, the script has Windows-style `CRLF` line endings. Linux cannot parse the shebang line (`#!/bin/sh\r`) and refuses to execute the file.

The project's `.gitattributes` file prevents this by forcing LF line endings on checkout. If you cloned before this file was present, or used an editor that overwrote the line endings, fix it by re-cloning or running:

```bash
git config core.autocrlf false
git rm --cached -r .
git reset --hard
```

Alternatively, convert the affected file manually:

```powershell
(Get-Content entrypoint.sh -Raw) -replace "`r`n", "`n" | Set-Content entrypoint.sh -NoNewline
```

---

### Database table does not exist after first startup

If you see `relation "Images" does not exist`, Alembic ran but found no migration scripts in `migrations/versions/` — this happens if the versions folder was empty when the image was built.

Generate and apply the initial migration:

```powershell
docker exec -it fastapi-backend poetry run alembic revision --autogenerate -m "initial"
docker exec -it fastapi-backend poetry run alembic upgrade head
```

Then copy the generated file to your host and commit it so it is included in future builds:

```powershell
docker cp fastapi-backend:/usr/src/app/migrations/versions/. ./services/backend/src/migrations/versions/
```

---

### Containers start with placeholder credentials

If PgBouncer or the backend connects with `some_user` / `some_pass` instead of your real credentials, the `.env` file was not saved before starting the containers. Open `services/backend/.env`, verify your values are present, save the file (`Ctrl+S` in VSCode — autosave is off by default), then run:

```bash
docker compose down -v
docker compose up --build
```

The `-v` flag is required to wipe the Postgres volume, which was initialised with the wrong credentials.

---

## Contributing

Contributions are welcome. Please follow these steps:

1. **Fork** the repository and create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes.** Follow the existing code style — type hints on all functions, docstrings on public methods, and structured log messages throughout.

3. **Commit** with a clear, descriptive message:
   ```bash
   git commit -m "feat: add support for AVIF image format"
   ```

4. **Push** and open a **Pull Request** against `main`. Describe what you changed and why.

### Code Style Guidelines

- Python: follow [PEP 8](https://peps.python.org/pep-0008/), use type hints, keep functions focused
- JavaScript: ES6+ with clear variable names; avoid third-party dependencies unless necessary
- All new API endpoints must be documented and visible in Swagger
- Environment-specific values go in `.env`, never hardcoded

---

## License

This project is licensed under the [MIT License](LICENSE).
