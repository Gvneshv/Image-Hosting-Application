# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [4.0.0] - 2026-06-28

### Added

- **Dark / light theme toggle** on every page - circular icon button in the header; moon icon in light mode, sun icon in dark mode; switches between themes on click
- `css/theme.css` - centralised design-token layer defining all colour decisions as CSS custom properties (`--color-bg`, `--color-accent`, `--color-danger`, etc.) for both light and dark palettes; no hardcoded colours remain in any other CSS file
- Anti-flash inline script in every HTML page `<head>` - reads `localStorage` and sets `data-theme` on `<html>` before the first CSS paint, preventing the white flash on dark-mode page loads
- `js/theme.js` - theme toggle logic; SVG moon/sun icons injected at runtime; OS-level `prefers-color-scheme` respected as a fallback when no manual choice has been made; choice persisted in `localStorage`
- **English / Ukrainian language toggle** on every page - circular `EN` / `UA` button beside the theme toggle; switches the entire interface instantly
- `js/lang.js` - complete i18n engine: `STRINGS` catalog with `en` and `uk` keys covering every user-visible string across all pages; `t(key, vars)` helper with `{token}` substitution; `applyLang()` walks all `[data-i18n]` elements; dispatches a `langchange` event for JS modules to re-render injected strings; choice persisted in `localStorage`
- `data-i18n` attributes on all static HTML strings across all seven pages
- Ukrainian translations for all UI strings, error messages, confirmation dialogs, and server-returned messages; server-generated strings (lockout message, user/image delete confirmations, self-action guard errors) are pattern-matched and translated client-side
- `css/404.css` - dedicated styles for the custom 404 page; wobble animation on the broken-image SVG; `prefers-reduced-motion` respected
- Custom 404 page with correct styles at any URL depth (absolute asset paths), full theme and language support
- `register.html` and `register.js` - standalone registration page split from `index.html` for cleaner separation of concerns

### Changed

- All CSS files fully tokenised - every colour value replaced with a `var(--color-*)` reference; no hardcoded hex values remain
- `css/auth.css` - `.theme-toggle` and `.lang-toggle` button styles added; `.theme-toggle--fixed` and `.lang-toggle--fixed` positioning modifiers for pages without a header bar
- `css/upload.css` - `.theme-toggle` and `.lang-toggle` styles added to match the circular icon button design; header subtitle changed from fixed-pixel width with `text-align: right` to `max-width` with `text-align: center` so longer translated strings wrap centrally; tab bar changed from `display: inline; width: 160px` to `display: flex; gap: 24px; white-space: nowrap` so Ukrainian tab labels stay on one row; URL copy button changed from fixed `width: 59px` to `min-width + flex` so longer translated labels fit without overflowing
- `css/viewer.css` - `.theme-toggle` and `.lang-toggle` styles added (viewer has its own CSS isolated from upload.css)
- All HTML pages updated: anti-flash script, `theme.css` link, `theme.js` and `lang.js` script tags (in correct load order: `theme.js` → `lang.js` → page script), theme/lang toggle buttons
- `js/upload.js` - all hardcoded English strings replaced with `window.t()` calls; per-page/sort controls and pagination rebuilt on `langchange` to display translated labels; controls/pagination rendered via dedicated `buildControls()` and `renderPagination()` functions for clean re-render on language switch
- `js/viewer.js` - all hardcoded English strings replaced with `window.t()` calls; copy-button label re-synced on `langchange`
- `js/account.js` - all hardcoded English strings replaced with `window.t()` calls; button labels re-synced on `langchange`
- `js/admin.js` - all hardcoded English strings replaced with `window.t()` calls; `translateServerMessage()` helper pattern-matches known server-returned English strings and returns translated versions; locked-out status badge now correctly shown using `is_locked_out` field from the API response; image delete confirm uses `t()` instead of a hardcoded string
- `js/index.js` - validation error messages and button loading state use `window.t()`; lockout modal body extracts the minute count from the server's `detail` string and reformats it with the translatable `index.locked.timed` key
- `js/register.js` - all validation errors and button states use `window.t()`
- Script load order fixed in all HTML files - `lang.js` must execute before any page script so `window.t()` is defined when the page JS runs; previously all page scripts were listed before `lang.js`, causing a `TypeError` that silently killed every IIFE on load
- `nginx.conf` - `error_page 404 /404.html` scoped to the static-file `location /` block only, so API `location` blocks continue returning FastAPI's own JSON 404 bodies; `location = /404.html { internal; }` added so the page is served but not directly browsable

### Fixed

- Admin icon not showing on `upload.html` for admin users - `authFetch` was defined after `revealAdminIconIfAdmin` called it; fixed by hoisting `authFetch` to the top of the IIFE
- Images tab not loading and drag-and-drop not working on `upload.html` - `initImagesTab()` was called at the bottom of the IIFE but the function was never defined; rewrote `upload.js` with both `initImagesTab` and `initUploader` as proper named functions
- Theme toggle button rendered as a raw browser-default `<button>` (90s look) - `.theme-toggle` had no CSS definition in `upload.css` or `viewer.css`; styles added
- Lang toggle button similarly had no CSS definition; styles added to all relevant CSS files
- Select dropdowns (per-page, sort-by, order) invisible in dark mode - `background-color: var(--color-bg)` was set but `color` was not, so text remained black on a dark background; `color: var(--color-text)` added
- `404.html` showed unstyled HTML for deep paths like `/s/something` - asset `href` and `src` attributes were relative, resolving incorrectly at non-root URL depths; changed all to absolute paths (`/css/`, `/js/`, `/base_images/`)
- `is_locked_out` field returned by the admin API was ignored in the rendered user table and detail modal; now displayed as an amber "Locked Out" badge alongside the existing blocked/active badges

### Security

- Theme and language preferences stored in `localStorage` only - no server-side tracking, no cookies
- `lang.js` escapes no HTML (uses `textContent`, not `innerHTML`) except for the one string containing `\n`, where only `\n` → `<br>` substitution is applied; no user input ever reaches `innerHTML`

---

## [3.0.0] - 2026-06-24

### Added

- **Login lockout** - five consecutive failed login attempts within a rolling 30-minute window lock the account for 30 minutes; subsequent attempts return HTTP 429 with a plain-English message including the unlock time
- `LoginAttempts` table - records every failed login with `user_id`, `ip_address`, and `attempted_at` (timezone-aware UTC); used for windowed lockout queries
- `is_blocked`, `last_login`, `registered_ip` columns on the `User` model - `is_blocked` enables permanent admin-controlled bans independent of the rolling lockout
- Alembic migrations `a1b2c3d4e5f6` (schema) and `b2c3d4e5f6a1` (timezone fix on `attempted_at`) covering all new columns and the `LoginAttempts` table
- `FIRST_ADMIN_EMAIL` environment variable - the account matching this email is automatically granted `is_admin = True` at registration time, so the first deployment never requires a manual DB promotion; subsequent registrations with the same email (after deletion) regain admin status automatically
- **Admin panel** - full CRUD, moderation, and statistics dashboard at `/admin.html`, accessible only to users with `is_admin = True`
  - User table: email, registration date, last login, registered IP, image count, blocked/locked-out status badges
  - Per-user actions: block / unblock, grant / revoke admin, clear login lockout, create user, delete user and all their images
  - Per-user image browser: thumbnail preview, filename, size, upload date, per-image delete
  - Site statistics: total users, total images, total storage used, admin count, blocked user count
- `routes_admin.py` - admin-only API routes under `/admin` prefix, all guarded by `require_admin` dependency
- Admin icon in the header of `upload.html` and `viewer.html` - revealed only when `GET /auth/me` returns `is_admin: true`; links to `/admin.html`
- `admin.html`, `admin.css`, `admin.js` - vanilla JS admin panel using the same Bearer-auth pattern as the rest of the frontend
- Custom `404.html` page served by Nginx for all unmatched routes
- Login lockout feedback on the login page - HTTP 429 triggers a modal displaying the lockout reason and unlock time
- Lockout helpers in `crud.py`: `record_failed_attempt`, `count_recent_failed_attempts`, `clear_failed_attempts`, `is_locked_out`

### Changed

- `routes_auth.py` login flow now calls lockout helpers on every failed attempt and rejects blocked or locked-out users before verifying the password, preventing timing-based enumeration
- `GET /auth/me` response now includes `is_admin` - lets any authenticated frontend page decide whether to reveal admin controls without an extra round trip
- Personal gallery (`GET /upload`) remains scoped to the calling user's own images even for admins - admins use the dedicated admin panel to browse all images
- Nginx config updated with `/admin/` proxy block and scoped `error_page 404` handling
- Project structure updated: `routes_admin.py`, `admin.html`, `admin.css`, `admin.js`, `404.html` added

### Fixed

- `attempted_at` column stored timestamps without timezone info; migration `b2c3d4e5f6a1` corrects the column type to `TIMESTAMP WITH TIME ZONE` so lockout window calculations are correct across DST boundaries and non-UTC deployments
- `viewer.html` back-to-gallery link was broken after the tab refactor; restored to `/upload.html#images`
- `tabs.js` script tag removed from `viewer.html` where it was loaded but unused

### Security

- Blocked users (`is_blocked = True`) are rejected at login with HTTP 403 before any password check, preventing timing attacks that could confirm account existence
- Locked-out users receive HTTP 429 with a `Retry-After` header indicating the unlock time
- Admin routes are protected by a dedicated `require_admin` FastAPI dependency that raises HTTP 403 for non-admin authenticated users and HTTP 401 for unauthenticated requests
- Self-action guards - admins cannot block, demote, or delete their own account via the admin panel endpoints
- `FIRST_ADMIN_EMAIL` is intentional by design: on a fresh deployment the database is empty, so there is no other way to grant admin access without shell access to the container

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
- `_scoped_user_id()` helper in `routes_upload.py` - centralises the admin vs. regular-user ownership filter
- `get_current_user` FastAPI dependency - extracts and verifies the Bearer token, loads the `User` ORM instance, and raises 401 on any invalid or expired token
- `auth_utils.py` - `create_access_token`, `verify_password`, `hash_password`, `get_current_user`
- `account.html` - account management page: My Info section (email, member since) and Change Password section
- `account.css` - two-column sidebar + content layout for `account.html`; responsive down to 360 px
- Account icon in the header of `upload.html` - shows the user's initials, links to `account.html`
- Alembic migration adding the `Users` table and `user_id` foreign key to `Images`
- Auth-related Pydantic schemas: `UserRegister`, `UserOut`, `Token`, `ChangePasswordRequest`
- `routes_auth.py` registered in `main.py` under the `/auth` prefix
- CORS middleware configured with `allow_credentials=True` to support `Authorization: Bearer` headers from the browser

### Changed

- All image endpoints now require a valid Bearer token
- `Images` table gains a non-nullable `user_id` foreign key (`ondelete="CASCADE"`) - every image is now owned by a user
- `upload.js` converted to a top-level `async` IIFE so `await fetch(...)` calls work correctly
- `tabs.js` reads `window.location.hash` on load and programmatically clicks the matching tab - enables `#images` deep-links from `viewer.js`
- `viewer.js` back button and post-delete redirect changed to `/upload.html#images`
- Password hashing library replaced: `passlib` → `pwdlib[argon2]`
- Login endpoint changed from a custom Pydantic model to `OAuth2PasswordRequestForm`

### Fixed

- `routes_auth.py` - `verify_password()` was not called during login; any password was accepted
- `routes_auth.py` - login endpoint used a plain Pydantic body model instead of `OAuth2PasswordRequestForm`, causing 422 errors
- `routes_upload.py` - `get_images` had a missing colon on the `current_user` dependency; FastAPI never injected the user, so all users could see all images
- `upload.js` - outer IIFE was not `async`; `await fetch(...)` was a syntax error
- Header layout shift on tablets and mobile - media query overrides on `.header-container` fought the base `left: 0; right: 0` span

### Security

- Plain-text passwords are never stored, logged, or returned in any response
- JWT tokens contain only `user_id` (not email or other PII)
- Login returns identical error messages for "user not found" and "wrong password" to prevent account enumeration
- `DELETE /auth/account` requires the full authenticated session
- `change-password` requires the caller to re-supply their current password
- Non-admin users receive 404 (not 403) when attempting to access another user's image, to avoid leaking account existence

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
- Nginx reverse proxy serving the frontend and proxying API requests to Uvicorn
- PgBouncer connection pooler (session mode) between the backend and PostgreSQL
- Docker Compose orchestration for all five services: backend, database, pgbouncer, nginx, backup
- Automated daily database backups via `pg_dump` + cron; retains the last 7 backups
- Nightly orphan cleanup scheduler (APScheduler via FastAPI lifespan)
- Per-request UUID injection middleware (`RequestIDMiddleware`) for log correlation
- Structured, levelled logging to console and rotating file via a dedicated `logging_config.py`
- Health check endpoint (`GET /health`) verifying database connectivity and images directory
- Makefile with `up`, `down`, `restart`, `logs`, `shell`, `revision`, `upgrade`, `downgrade` targets
- `.gitattributes` enforcing LF line endings to prevent `CRLF` breakage on Windows clones

[4.0.0]: https://github.com/Gvneshv/Image-Hosting-Application/compare/v3.0.0...v4.0.0
[3.0.0]: https://github.com/Gvneshv/Image-Hosting-Application/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/Gvneshv/Image-Hosting-Application/compare/v1.0.0...v2.0.0
[1.0.2]: https://github.com/Gvneshv/Image-Hosting-Application/releases/tag/v1.0.2
