# 🖼️ Image Hosting Application

A self-hosted, full-featured image hosting web application built with **FastAPI** and vanilla **JavaScript**. Upload, manage, and share images through a clean browser interface - with user accounts, JWT authentication, per-user image isolation, a full admin panel, dark/light theme switching, and English/Ukrainian localisation - all running in Docker with production-grade infrastructure.

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

This application provides a complete self-hosted image hosting solution with user accounts. Users register with an email and password, log in to receive a JWT, and can upload, manage, and share their own images. All images are user-scoped - regular users can only see and manage their own; admin users get access to a dedicated admin panel for site-wide moderation. Images are stored on disk and tracked in a PostgreSQL database. The frontend is a responsive, single-page-style interface with tab switching, sorting, pagination, a lightbox viewer, and full keyboard navigation - all without page reloads. Login abuse is mitigated by a rolling lockout: five consecutive failed attempts within 15 minutes lock the account for 15 minutes. The entire stack runs in Docker containers with Nginx as a reverse proxy, PgBouncer for connection pooling, automated database backups, and structured logging throughout. Every page supports a dark/light theme toggle and a switchable English/Ukrainian interface - both preferences are persisted across sessions.

---

## Features

### Authentication & Accounts

![Register demo](https://github.com/Gvneshv/Image-Hosting-Application/releases/download/v3.0.0/registration.gif)
![Login demo](https://github.com/Gvneshv/Image-Hosting-Application/releases/download/v3.0.0/login.gif)

- Register with an email and password; passwords are hashed with Argon2 and never stored in plain text
- Log in to receive a signed JWT; all protected API calls require a valid `Authorization: Bearer` header
- Account page shows email and registration date
- Change password at any time - requires re-verification of the current password
- Delete account - permanently removes the account and all associated images
- Admin flag (`is_admin`) - admins get access to the admin panel and can view or delete any user's images; regular users are strictly scoped to their own
- **Login lockout** - five consecutive failed attempts within 30 minutes lock the account for 30 minutes; the UI displays the reason and exact unlock time

### Upload

![Upload demo](https://github.com/Gvneshv/Image-Hosting-Application/releases/download/v3.0.0/image_upload.gif)
![Drag and drop demo](https://github.com/Gvneshv/Image-Hosting-Application/releases/download/v3.0.0/dragging.gif)

- Upload images via browser file picker, drag-and-drop, or REST API
- Per-IP rate limiting to prevent abuse (10 uploads per minute)
- File size and extension validation on both client and server
- Deep content inspection - verifies that uploads are genuine images, not files disguised with an image extension (via Pillow)
- Instant URL copy on the upload page after a successful upload
- Gallery refreshes automatically after every upload - no reload needed

### Image Library

![Sorting demo](https://github.com/Gvneshv/Image-Hosting-Application/releases/download/v3.0.0/sort.gif)
![Pagination demo](https://github.com/Gvneshv/Image-Hosting-Application/releases/download/v3.0.0/pagination_copy.gif)
![Delete from gallery demo](https://github.com/Gvneshv/Image-Hosting-Application/releases/download/v3.0.0/gallery_copy_delete.gif)

- Toggle between the upload form and image library without a page reload
- Sort images by upload time, file size, or filename in ascending or descending order
- Pagination with a configurable number of images per page (3 / 6 / 9)
- Each image card shows a preview with buttons to copy its URL or delete it
- Deletion uses a custom confirmation dialog; the library refreshes instantly after deletion
- Open any image in the same tab or a new tab directly from the library

### Image Viewer

![Lightbox and fullscreen demo](https://github.com/Gvneshv/Image-Hosting-Application/releases/download/v3.0.0/viewer_lightbox_fs_mode.gif)
![Viewer actions demo](https://github.com/Gvneshv/Image-Hosting-Application/releases/download/v3.0.0/viewer_copy_download_delete.gif)

- Individual image pages display full metadata: filename, original name, unique name, size, type, and upload date
- Buttons to download the image, copy its URL, or delete it
- Lightbox overlay mode and full-screen mode with zoom in/out (mouse wheel) and pan (drag)
- Double-click resets zoom and position
- Navigate between images using on-screen arrow buttons, thumbnail previews of the previous/next image, or keyboard shortcuts (`←` / `→` to navigate, `Esc` to close)
- Close the overlay by clicking the darkened area outside the image

### Admin Panel

![Block and clear lockout demo](https://github.com/Gvneshv/Image-Hosting-Application/releases/download/v3.0.0/admin_panel_block_and_lockout.gif)
![Delete user demo](https://github.com/Gvneshv/Image-Hosting-Application/releases/download/v3.0.0/admin_panel_delete_user.gif)
![Add user and grant admin demo](https://github.com/Gvneshv/Image-Hosting-Application/releases/download/v3.0.0/admin_panel_add_user.gif)

- Dedicated admin dashboard at `/admin.html`, accessible only to users with `is_admin = True`
- Admin icon revealed in the header of the upload and viewer pages after login (`GET /auth/me` returns `is_admin`)
- **User management** - paginated user table showing email, registration date, last login, registered IP, image count, and blocked / locked-out status badges
- Per-user actions: block / unblock account, clear login lockout, grant / revoke admin, create new user, delete user and all their images
- **Image management** - per-user image browser with thumbnail preview and per-image delete
- **Site statistics** - total users, total images, total storage used, admin count, blocked user count
- Self-action guards - admins cannot block, demote, or delete their own account via the panel (prevents accidental self-lockout)
- The `/admin.html` page is served as a static file by Nginx; the `/admin/` proxy path is blocked at the Nginx layer so the backend admin API is never accidentally exposed through an unintended route

### Theme & Language

- **Dark / light theme toggle** on every page - preference saved in `localStorage` and applied before first paint to prevent flash
- Respects the OS-level `prefers-color-scheme` preference when no manual choice has been made
- **English / Ukrainian language toggle** on every page - preference saved in `localStorage`
- All UI strings, error messages, confirmation dialogs, and server-returned messages are translated
- Custom 404 page with correct styles at any URL depth, full theme and language support

### Infrastructure & Reliability

- Fully containerised with Docker (backend, database, backup, PgBouncer, Nginx)
- Database schema managed and migrated automatically on startup with Alembic
- Scheduled database backups via cron (daily at 02:00, retains last 7 backups)
- Orphaned file cleanup - removes stale records from the database and orphaned files from disk (daily at midnight via APScheduler, started via FastAPI lifespan)
- Health checks on backend, database, and PgBouncer containers during startup
- Nginx reverse proxy handles all incoming traffic including Swagger UI (`/docs`)
- PgBouncer manages and pools PostgreSQL connections (session mode)
- Structured, levelled logging to console and file via a dedicated logging configuration
- All configuration managed through a single `.env` file
- Full Swagger UI available at `/docs`
- Responsive design - works on desktops, tablets, and phones
- Non-root user inside the backend container for security

---

## Tech Stack

| Layer                  | Technology                                             |
| ---------------------- | ------------------------------------------------------ |
| **Backend**            | Python 3.12, FastAPI, SQLAlchemy, Alembic, Pydantic v2 |
| **Frontend**           | Vanilla JavaScript (ES6+), HTML5, CSS3                 |
| **Database**           | PostgreSQL 17                                          |
| **Connection Pooling** | PgBouncer 1.24                                         |
| **Reverse Proxy**      | Nginx (stable-alpine)                                  |
| **Containerisation**   | Docker, Docker Compose                                 |
| **Package Management** | Poetry                                                 |
| **Templating**         | Jinja2                                                 |
| **Authentication**     | JWT (`python-jose`), Argon2 (`pwdlib[argon2]`)         |
| **Image Validation**   | Pillow                                                 |
| **Rate Limiting**      | SlowAPI                                                |
| **Scheduling**         | APScheduler                                            |
| **Logging**            | Python `logging` (structured, levelled)                |
| **Migrations**         | Alembic                                                |
| **Backups**            | Bash + cron                                            |

---

## Project Structure

```
Project/
├── logs/
│   └── pgbouncer/
│       └── pgbouncer.log               # PgBouncer connection logs
├── services/
│   ├── backend/
│   │   ├── backup/                     # Backup files written here (gitignored)
│   │   ├── src/
│   │   │   ├── api/
│   │   │   │   ├── routes_admin.py     # Admin endpoints: user/image CRUD, block, lockout, stats
│   │   │   │   ├── routes_auth.py      # Auth endpoints: register, login, me, change-password, delete account
│   │   │   │   └── routes_upload.py    # Image endpoints: upload, list, delete, metadata, viewer, health
│   │   │   ├── db/
│   │   │   │   ├── cleanup_scheduler.py    # Orphaned file & record cleanup
│   │   │   │   ├── crud.py                 # Database CRUD operations (incl. lockout helpers)
│   │   │   │   ├── database.py             # DB engine & session setup
│   │   │   │   └── models.py               # SQLAlchemy ORM models (User, Image, LoginAttempts)
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
│   │   │   │   ├── admin.py                # Pydantic schemas for admin endpoints
│   │   │   │   └── upload.py               # Pydantic schemas: images, auth, tokens
│   │   │   ├── scripts/
│   │   │   │   ├── entrypoint.sh           # Container startup script
│   │   │   │   └── wait-for-db.sh          # PgBouncer readiness probe
│   │   │   ├── settings/
│   │   │   │   ├── config.py               # App settings loaded from .env
│   │   │   │   └── logging_config.py       # Logging setup
│   │   │   ├── utils/
│   │   │   │   ├── auth_utils.py           # JWT creation, password hashing, get_current_user dependency
│   │   │   │   └── rate_limiter.py         # Per-IP rate limiter (SlowAPI)
│   │   │   ├── alembic.ini                 # Alembic configuration
│   │   │   ├── poetry.lock
│   │   │   ├── pyproject.toml
│   │   │   └── main.py                     # FastAPI app entry point, middleware, routers, static mounts
│   │   ├── Dockerfile
│   │   └── .env                            # All environment variables (never commit)
│   ├── backup/
│   │   ├── backup.sh                       # pg_dump script with 7-backup retention
│   │   ├── crontab                         # Runs backup.sh daily at 02:00
│   │   └── Dockerfile
│   ├── frontend/
│   │   ├── base_images/                    # Static SVG illustrations & icons
│   │   ├── css/
│   │   │   ├── 404.css                     # Custom 404 page styles
│   │   │   ├── admin.css                   # Admin panel layout and component styles
│   │   │   ├── auth.css                    # Shared styles for auth/account/admin pages
│   │   │   ├── account.css                 # Account page layout (sidebar + content)
│   │   │   ├── index.css                   # Landing page styles
│   │   │   ├── theme.css                   # Design token layer: light/dark palettes
│   │   │   ├── upload.css                  # Upload & library page styles
│   │   │   └── viewer.css                  # Image viewer & lightbox styles
│   │   ├── js/
│   │   │   ├── account.js                  # Account page: info display, password change, logout, delete account
│   │   │   ├── admin.js                    # Admin panel: users, images, stats, moderation actions
│   │   │   ├── index.js                    # Login page logic (incl. lockout modal)
│   │   │   ├── lang.js                     # i18n engine: EN/UK string catalog, toggle, langchange event
│   │   │   ├── modal.js                    # Custom confirmation/alert dialogs
│   │   │   ├── tabs.js                     # Tab switching without reload; hash-based deep-link support
│   │   │   ├── theme.js                    # Dark/light theme toggle; moon/sun SVG; OS preference sync
│   │   │   ├── upload.js                   # Upload form, drag-and-drop, gallery, account/admin icons
│   │   │   └── viewer.js                   # Image detail page, lightbox, fullscreen, keyboard nav
│   │   ├── templates/
│   │   │   └── viewer.html                 # Jinja2 individual image page
│   │   ├── 404.html                        # Custom not-found page served by Nginx
│   │   ├── account.html                    # Account management page
│   │   ├── admin.html                      # Admin panel (admin-only)
│   │   ├── index.html                      # Login page
│   │   ├── register.html                   # Registration page
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
├── CHANGELOG.md                            # Version history
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

Open `services/backend/.env` and replace all placeholder values before proceeding. See [Environment Variables](#environment-variables) for the full reference. Pay particular attention to the `DATABASE_URL` note - it must be written as a literal string.

**3. Create the PgBouncer log directory**

```bash
mkdir -p logs/pgbouncer
```

**4. Build and start all containers**

```bash
make up
```

Or directly:

```bash
docker compose up --build -d
```

The database schema is created and migrated automatically on startup via Alembic. The cleanup scheduler starts automatically as part of the FastAPI application lifespan.

**5. Access the application**

| Service            | URL                     |
| ------------------ | ----------------------- |
| Application        | `http://localhost`      |
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

Then open `http://192.168.x.x` on any device connected to the same Wi-Fi network. No extra configuration is needed - Nginx is already listening on `0.0.0.0:80`.

---

## Usage

### Registering and Logging In

Navigate to `http://localhost`. Enter your email and a password of at least 8 characters to create an account. After registering, log in with the same credentials to be taken to your gallery.

### Uploading Images

From the upload interface you can upload an image by:

- Clicking the upload area and selecting a file
- Dragging and dropping an image onto the upload zone
- Using the REST API directly (see [API Documentation](#api-documentation))

Once uploaded, the image URL is displayed and can be copied instantly. The gallery tab refreshes automatically.

### Managing Your Library

Click the **Images** tab to switch to your image gallery. From there you can:

- **Sort** images by upload time, size, or filename (toggle ascending/descending)
- **Paginate** through images and choose how many appear per page
- **Copy** an image URL directly from its gallery card
- **Delete** an image - a confirmation dialog will appear; the gallery refreshes automatically
- **Open** an image in the same tab or a new tab via the buttons on each card

### Viewing an Image

The individual image page shows full metadata and provides buttons to download, copy the URL, or delete the image. You can also enter:

- **Lightbox mode** - overlay with zoom (mouse wheel), pan (drag), and double-click to reset
- **Full-screen mode** - browser-native fullscreen of the overlay

Navigate between your images using on-screen controls, thumbnail previews, or keyboard shortcuts (`←` / `→` to navigate, `Esc` to close).

### Managing Your Account

Click the account icon in the top-right corner to reach the account page. From there you can:

- View your email address and registration date
- Change your password (requires your current password)
- Log out
- Permanently delete your account and all your images

### Theme and Language

Every page has two toggle buttons in the top-left corner:

- **Theme toggle** - switches between light and dark mode. Your choice is saved and applied immediately on the next visit without any flash.
- **Language toggle** - switches between English (EN) and Ukrainian (UA). All interface text, error messages, and dialogs switch instantly.

### Admin Access

The first admin account is bootstrapped automatically via the `FIRST_ADMIN_EMAIL` environment variable. The account that registers with that email address receives `is_admin = True` at registration time - no manual database work needed. See [Environment Variables](#environment-variables) for details.

Once logged in as an admin, a shield icon appears in the header. Clicking it opens the admin panel at `/admin.html`, where you can manage users, images, and view site statistics.

If you need to grant admin access to an additional account after the first deployment, use the shell:

```bash
make shell
```

Then inside the container:

```python
from db.database import SessionLocal
from db.models import User
db = SessionLocal()
user = db.query(User).filter(User.email == "your@email.com").first()
user.is_admin = True
db.commit()
db.close()
```

---

## API Documentation

Interactive Swagger documentation is available at **`http://localhost/docs`** when the application is running.

### Endpoints

#### Public (no token required)

| Method | Endpoint           | Description                          |
| ------ | ------------------ | ------------------------------------ |
| `GET`  | `/`                | Welcome / liveness ping              |
| `GET`  | `/health`          | Health check (database + filesystem) |
| `GET`  | `/view/{filename}` | Render the Jinja2 image viewer page  |
| `POST` | `/auth/register`   | Create a new user account            |
| `POST` | `/auth/login`      | Verify credentials and receive a JWT |

#### Protected (Bearer token required)

| Method   | Endpoint                | Description                                       |
| -------- | ----------------------- | ------------------------------------------------- |
| `GET`    | `/auth/me`              | Return the authenticated user's public profile    |
| `POST`   | `/auth/change-password` | Change the authenticated user's password          |
| `DELETE` | `/auth/account`         | Permanently delete the account and all its images |
| `GET`    | `/upload`               | Paginated, sorted image list (own images only)    |
| `POST`   | `/upload/`              | Upload an image (rate-limited: 10/min per IP)     |
| `DELETE` | `/upload/{filename}`    | Delete an image by unique name                    |
| `GET`    | `/file_info/{filename}` | Metadata for a single image                       |
| `GET`    | `/all_images`           | Full image list for the viewer slideshow          |

#### Admin only (Bearer token + `is_admin = True` required)

| Method   | Endpoint                         | Description                                                    |
| -------- | -------------------------------- | -------------------------------------------------------------- |
| `GET`    | `/admin/stats`                   | Site statistics (users, images, storage, blocked/admin counts) |
| `GET`    | `/admin/users`                   | Paginated list of all users with aggregate counts              |
| `POST`   | `/admin/users`                   | Create a new user account                                      |
| `GET`    | `/admin/users/{user_id}`         | Single user detail                                             |
| `PATCH`  | `/admin/users/{user_id}/admin`   | Grant or revoke admin privileges                               |
| `PATCH`  | `/admin/users/{user_id}/block`   | Block or unblock a user account                                |
| `DELETE` | `/admin/users/{user_id}`         | Delete a user and all their images                             |
| `DELETE` | `/admin/users/{user_id}/lockout` | Clear login lockout for a user                                 |
| `GET`    | `/admin/users/{user_id}/images`  | Paginated image list for a specific user                       |
| `DELETE` | `/admin/images/{filename}`       | Delete any image regardless of owner                           |

- **Allowed extensions:** `.jpg`, `.jpeg`, `.png`, `.gif`
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/gif`
- **Max file size:** 5 MB (configurable via `config.py`)
- **Rate limit:** 10 uploads per minute per IP

### Authentication

All protected endpoints require an `Authorization: Bearer <token>` header. Obtain a token via `POST /auth/login`. Tokens are signed JWTs and contain only the user's internal ID - no PII is encoded in the token payload.

### Example: Register and log in

```bash
# Register
curl -X POST http://localhost/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "yourpassword"}'

# Log in - returns {"access_token": "...", "token_type": "bearer"}
curl -X POST http://localhost/auth/login \
  -d "username=you@example.com&password=yourpassword"
```

### Example: Upload an image

```bash
curl -X POST http://localhost/upload/ \
  -H "Authorization: Bearer <your_token>" \
  -F "file=@/path/to/image.jpg"
```

### Example: List your images

```bash
curl "http://localhost/upload?sort_by=upload_time&sort_order=desc&page=1&per_page=6" \
  -H "Authorization: Bearer <your_token>"
```

---

## Environment Variables

All configuration lives in `services/backend/.env`. This file is never committed to version control.

> **Important:** `pydantic-settings` does not interpolate `${VAR}` syntax in `.env` files. `DATABASE_URL` must be written as a fully resolved literal string - do not use variable references inside it.

| Variable                      | Description                                                         | Example                                                       |
| ----------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `POSTGRES_DB`                 | PostgreSQL database name                                            | `appdb`                                                       |
| `POSTGRES_USER`               | PostgreSQL username                                                 | `appuser`                                                     |
| `POSTGRES_PASSWORD`           | PostgreSQL password                                                 | `changeme`                                                    |
| `POSTGRES_HOST`               | PostgreSQL hostname (Docker service name)                           | `db`                                                          |
| `POSTGRES_PORT`               | PostgreSQL port                                                     | `5432`                                                        |
| `DATABASE_URL`                | Full SQLAlchemy connection URL - write literally                    | `postgresql+psycopg2://appuser:changeme@pgbouncer:6432/appdb` |
| `SECRET_KEY`                  | Secret used to sign JWTs - use a long random string                 | `openssl rand -hex 32`                                        |
| `ALGORITHM`                   | JWT signing algorithm                                               | `HS256`                                                       |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT lifetime in minutes                                             | `60`                                                          |
| `FIRST_ADMIN_EMAIL`           | Email that receives `is_admin = True` automatically on registration | `admin@example.com`                                           |
| `BACKEND_WORKERS`             | Number of Uvicorn worker processes                                  | `1`                                                           |
| `WEB_SERVER_START_PORT`       | Uvicorn listening port                                              | `8000`                                                        |
| `MAX_LOGIN_ATTEMPTS`          | Failed attempts before lockout                                      | `5`                                                           |
| `LOCKOUT_WINDOW_MINUTES`      | Rolling window for counting failed attempts                         | `30`                                                          |
| `LOCKOUT_DURATION_MINUTES`    | How long the account stays locked                                   | `30`                                                          |

### A note on `FIRST_ADMIN_EMAIL`

Set this to the email address you will register with on first startup. That account will receive `is_admin = True` automatically - no shell access or manual SQL needed. If that account is later deleted and re-registered with the same email, admin status is restored automatically.

This is intentional by design: on a fresh deployment the database is empty, so there is no other way to bootstrap an admin without container shell access. Once the admin account exists, additional admins can be granted access through the admin panel or via the shell snippet in [Admin Access](#admin-access).

### A note on `BACKEND_WORKERS`

`1` is the correct value for this stack. Uvicorn is async and handles concurrent requests efficiently with a single worker. Setting this higher would cause the APScheduler cleanup job to run once per worker simultaneously. To safely use multiple workers, move the scheduler to a dedicated container or cron job first.

### A note on `SECRET_KEY`

Generate a strong secret before deploying:

```bash
openssl rand -hex 32
```

Never reuse a key across environments and never commit it to version control. Rotating the key invalidates all active sessions.

---

## Makefile

All commands are run from the project root.

| Command                     | Description                                            |
| --------------------------- | ------------------------------------------------------ |
| `make up`                   | Build images and start all containers in detached mode |
| `make down`                 | Stop and remove containers (volumes are preserved)     |
| `make restart`              | Restart all containers without rebuilding              |
| `make logs`                 | Tail backend logs (Ctrl-C to exit)                     |
| `make shell`                | Open an interactive shell inside the backend container |
| `make revision m="message"` | Generate a new Alembic migration                       |
| `make upgrade`              | Apply all pending Alembic migrations                   |
| `make downgrade`            | Roll back the most recent Alembic migration            |

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

Then run `docker compose up` again. The exact GUIDs in the URLs may differ on your machine - run `netsh http show urlacl | findstr :80` to see what is reserved.

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

If you see `relation "Images" does not exist`, Alembic ran but found no migration scripts in `migrations/versions/` - this happens if the versions folder was empty when the image was built.

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

If PgBouncer or the backend connects with `some_user` / `some_pass` instead of your real credentials, the `.env` file was not saved before starting the containers. Open `services/backend/.env`, verify your values are present, save the file, then run:

```bash
docker compose down -v
docker compose up --build
```

The `-v` flag is required to wipe the Postgres volume, which was initialised with the wrong credentials.

---

### Login returns 422 Unprocessable Entity

The login endpoint uses the standard OAuth2 `application/x-www-form-urlencoded` format. If you are calling it via cURL or a custom client, make sure you are sending form data - not JSON:

```bash
# Correct
curl -X POST http://localhost/auth/login \
  -d "username=you@example.com&password=yourpassword"

# Wrong - will return 422
curl -X POST http://localhost/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "you@example.com", "password": "yourpassword"}'
```

---

## Contributing

Contributions are welcome. Please follow these steps:

1. **Fork** the repository and create a feature branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes.** Follow the existing code style - type hints on all functions, docstrings on public methods, and structured log messages throughout.

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