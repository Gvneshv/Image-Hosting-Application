# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.0.0] - 2026-06-24

### Added

- **Login lockout** - five consecutive failed login attempts within a rolling 30-minute window lock the account for 30 minutes; subsequent attempts return HTTP 429 with a plain-English message including the unlock time
- `LoginAttempts` table - records every failed login with `user_id`, `ip_address`, and `attempted_at` (timezone-aware UTC); used for windowed lockout queries
- `is_blocked`, `last_login`, `registered_ip` columns on the `User` model - `is_blocked` enables permanent admin-controlled bans independent of the rolling lockout
- Alembic migrations `a1b2c3d4e5f6` (schema) and `b2c3d4e5f6a1` (timezone fix on `attempted_at`) covering all new columns and the `LoginAttempts` table
- `FIRST_ADMIN_EMAIL` environment variable - the account matching this email is automatically granted `is_admin = True` at registration time, so the first deployment never requires a manual DB promotion; subsequent registrations with the same email (after deletion) regain admin status automatically
- **Admin panel** - full CRUD, moderation, and statistics dashboard at `/admin.html`, served directly by Nginx (the backend `/admin/` prefix is blocked by proxy at the Nginx level)
  - User table: email, registration date, last login, registered IP, image count, blocked/locked-out status badges
  - Per-user actions: block / unblock, clear login lockout, delete user and all their images
  - Image table: preview thumbnail, filename, uploader email, size, upload date, per-row delete
  - Site statistics: total users, total images, total storage used, users registered in the last 7 days, uploads in the last 7 days
- `routes_admin.py` - admin-only API routes under `/admin` prefix, all guarded by `require_admin` dependency:
  - `GET /admin/users` - paginated user list with aggregate counts
  - `GET /admin/users/{user_id}` - single user detail
  - `DELETE /admin/users/{user_id}` - delete user and their images (with disk cleanup)
  - `POST /admin/users/{user_id}/block` - set `is_blocked = True`
  - `POST /admin/users/{user_id}/unblock` - set `is_blocked = False`
  - `POST /admin/users/{user_id}/clear-lockout` - delete all `LoginAttempts` rows for the user
  - `GET /admin/images` - paginated image list across all users
  - `DELETE /admin/images/{filename}` - delete any image regardless of owner
  - `GET /admin/stats` - aggregate site statistics
- Admin icon in the header of `upload.html` and `viewer.html` - revealed only when `GET /auth/me` returns `is_admin: true`; links to `/admin.html`
- `admin.html`, `admin.css`, `admin.js` - vanilla JS admin panel; uses the same Bearer-auth pattern as the rest of the frontend
- Custom `404.html` page served by Nginx for all unmatched routes
- Lockout visibility in the admin user table - `is_locked_out` badge displayed; "Clear Lockout" button is disabled (greyed out) when the user has no active lockout, preventing no-op clicks
- Login lockout feedback on the landing page - HTTP 429 from the login endpoint triggers a modal displaying the lockout reason and unlock time (`index.html` / `index.js`)
- Lockout helpers in `crud.py`: `record_failed_attempt`, `count_recent_failed_attempts`, `clear_failed_attempts`, `is_user_locked_out`

### Changed

- `routes_auth.py` login flow now calls lockout helpers on every failed attempt and rejects blocked or locked-out users before verifying the password, preventing timing-based enumeration
- `GET /auth/me` response now includes `is_admin` - lets any authenticated frontend page decide whether to reveal admin controls without an extra round trip
- Personal gallery (`GET /upload`) remains scoped to the calling user's own images even for admins - admins use the dedicated admin panel to browse all images; this preserves a clean separation between personal and moderation views
- Nginx config updated: `/admin/` location block is proxied to `404` (backend never sees admin API calls routed via the proxy path), keeping the admin API reachable only under `/admin` as a direct API prefix
- Project structure updated: `routes_admin.py`, `admin.html`, `admin.css`, `admin.js`, `404.html` added to the tree

### Fixed

- `attempted_at` column stored timestamps without timezone info; migration `b2c3d4e5f6a1` corrects the column type to `TIMESTAMP WITH TIME ZONE` so lockout window calculations are correct across DST boundaries and non-UTC deployments
- `modal.js` was inadvertently included in `admin.html`, causing the page overlay to be unclickable; removed
- `viewer.html` back-to-gallery link was broken after the tab refactor; restored to `/upload.html#images`
- `tabs.js` script tag removed from `viewer.html` where it was loaded but unused

### Security

- Blocked users (`is_blocked = True`) are rejected at login with HTTP 403 before any password check, preventing timing attacks that could confirm account existence
- Locked-out users receive HTTP 429 with a `Retry-After` header indicating the unlock time
- Admin routes are protected by a dedicated `require_admin` FastAPI dependency that raises HTTP 403 for non-admin authenticated users and HTTP 401 for unauthenticated requests
- The `/admin/` URL path is blocked at the Nginx layer; only the `/admin` API prefix is reachable through the proxy, so the admin panel HTML is served as a static file and never accidentally reverse-proxied to the backend
- `FIRST_ADMIN_EMAIL` is intentional by design: on a fresh deployment the database is empty, so there is no other way to grant admin access without shell access to the container. The env var removes that manual step and is documented so operators know to set it before first startup. The bootstrapped admin can then manage all other accounts through the panel.

---

## [2.0.0] - 2026-06-10

### Added

- **User authentication system** - JWT-based login/register flow with `python-jose` and `pwdlib[argon2]` for password hashing
- `POST /auth/register` - create a new user account (email + password)
- `POST /auth/login` - verify credentials via `OAuth2PasswordRequestForm` and receive a signed JWT
- `GET /auth/me` - return the authenticated user's public profile (email, member since)
- `POST /auth/change-password` - re-verify current password then update to a new one
- `DELETE /auth/account` - permanently delete the caller's account and all their uploaded images, with disk cleanup and orphan fallback via the nightly scheduler
- `User` ORM model (`Users` table) with `id`, `email`, `hashed_password`, `is_admin`, `created_at` columns
- `is_admin` flag on `User` - admins bypass ownership filters and can view or delete any image across all accounts
- `_scoped_user_id()` helper in `routes_upload.py` - centralises the admin vs. regular-user ownership filter so every route stays one clean line
- `get_current_user` FastAPI dependency - extracts and verifies the Bearer token, loads the `User` ORM instance, and raises 401 on any invalid or expired token
- `auth_utils.py` - `create_access_token`, `verify_password`, `hash_password`, `get_current_user`
- `account.html` - account management page: My Info section (email, member since) and Change Password section
- `account.css` - two-column sidebar + content layout for `account.html`; responsive down to 360 px
- Account icon in the header of `upload.html` - shows the user's initials (fetched from `GET /auth/me`), links to `account.html`
- Alembic migration adding the `Users` table and `user_id` foreign key to `Images`
- Auth-related Pydantic schemas: `UserRegister`, `UserOut`, `Token`, `ChangePasswordRequest`
- `routes_auth.py` registered in `main.py` under the `/auth` prefix
- CORS middleware configured with `allow_credentials=True` to support `Authorization: Bearer` headers from the browser

### Changed

- All image endpoints (`GET /upload`, `POST /upload/`, `DELETE /upload/{filename}`, `GET /file_info/{filename}`, `GET /all_images`) now require a valid Bearer token
- `Images` table gains a non-nullable `user_id` foreign key (`ondelete="CASCADE"`) - every image is now owned by a user
- `upload.js` converted to a top-level `async` IIFE so `await fetch(...)` calls work correctly
- `upload.js` account icon now fetches the user's email from `GET /auth/me` (token `sub` is a user ID, not an email)
- `upload.js` `loadImages()` moved to outer scope and passed into `initUploader` so it can be called after a successful upload
- `upload.js` `loadImages()` is now called after every successful upload so the gallery refreshes immediately
- `tabs.js` reads `window.location.hash` on load and programmatically clicks the matching tab - enables `#images` deep-links from `viewer.js`
- `viewer.js` back button and post-delete redirect changed to `/upload.html#images`
- `GET /view/{filename}` - removed `CurrentUser` dependency; the HTML page is now public and auth is enforced client-side by `viewer.js` (which checks `localStorage` and redirects to the login page if no token is found; all subsequent API calls from the page are still Bearer-protected)
- Password hashing library replaced: `passlib` → `pwdlib[argon2]`
- Login endpoint changed from a custom Pydantic model to `OAuth2PasswordRequestForm` (fixes 422 errors from Swagger UI and standard OAuth2 clients)

### Fixed

- `routes_auth.py` - `verify_password()` was not called during login; any password was accepted
- `routes_auth.py` - login endpoint used a plain Pydantic body model instead of `OAuth2PasswordRequestForm`, causing 422 errors
- `routes_auth.py` - stale log reference `credentials.email` corrected to `credentials.username` (the field name on `OAuth2PasswordRequestForm`)
- `routes_upload.py` - `get_images` had `current_user = CurrentUser` (missing colon); FastAPI never injected the user dependency, so all users could see all images
- `upload.js` - outer IIFE was not `async`; `await fetch(...)` was a syntax error
- `upload.js` - `loadImages` referenced inner variables after being moved to outer scope; fixed by returning it from `initImagesTab` and passing it to `initUploader`
- Header layout shift on tablets and mobile (`upload.css`, `viewer.css`) - media query `width`/`max-width` overrides on `.header-container` fought the base `left: 0; right: 0` span, shrinking the container and pushing the account icon off-screen
- `account.css` - mobile sidebar used `flex-direction: row; flex-wrap: wrap`, causing nav buttons and danger-zone buttons to collide on narrow screens

### Security

- Plain-text passwords are never stored, logged, or returned in any response
- JWT tokens contain only `user_id` (not email or other PII); `sub` claim is used as the standard subject field
- Login returns identical error messages for "user not found" and "wrong password" to prevent account enumeration
- `DELETE /auth/account` requires the full authenticated session; the JWT is effectively invalidated after deletion since the user row no longer exists
- `change-password` requires the caller to re-supply their current password, preventing a stolen token from silently locking out the real owner
- Non-admin users receive 404 (not 403) when attempting to access or delete another user's image, to avoid leaking the existence of other accounts

---

## [1.0.2] - 2025-04-03

### Added

- Initial release
- FastAPI backend with image upload, listing, deletion, and metadata endpoints
- PostgreSQL database with `Images` table; schema managed by Alembic
- Vanilla JS frontend: upload form with drag-and-drop, image gallery with sorting and pagination, lightbox viewer with zoom/pan/fullscreen and keyboard navigation
- Per-IP upload rate limiting via SlowAPI (10 uploads per minute)
- File validation: extension allowlist, MIME type check, Pillow deep content inspection
- Jinja2-rendered individual image viewer page (`/view/{filename}`) with full metadata panel
- Nginx reverse proxy serving the frontend SPA and proxying API requests to Uvicorn
- PgBouncer connection pooler (session mode) between the backend and PostgreSQL
- Docker Compose orchestration for all five services: backend, database, pgbouncer, nginx, backup
- Automated daily database backups via `pg_dump` + cron; retains the last 7 backups
- Nightly orphan cleanup scheduler (APScheduler via FastAPI lifespan) - removes stale DB records and unreferenced files on disk
- Per-request UUID injection middleware (`RequestIDMiddleware`) for log correlation
- Structured, levelled logging to console and rotating file via a dedicated `logging_config.py`
- Health check endpoint (`GET /health`) verifying database connectivity and images directory
- Makefile with `up`, `down`, `restart`, `logs`, `shell`, `revision`, `upgrade`, `downgrade` targets
- `.gitattributes` enforcing LF line endings to prevent `CRLF` breakage on Windows clones

[3.0.0]: https://github.com/Gvneshv/Image-Hosting-Application/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/Gvneshv/Image-Hosting-Application/compare/v1.0.0...v2.0.0
[1.0.2]: https://github.com/Gvneshv/Image-Hosting-Application/releases/tag/v1.0.2