#!/bin/sh
set -e

# ---------------------------
# Ensure directories exist (Docker volumes handle permissions)
# ---------------------------
mkdir -p /usr/src/app/images /usr/src/app/logs

# ---------------------------
# Wait for PgBouncer to be ready before proceeding
# ---------------------------
./scripts/wait-for-db.sh pgbouncer:6432

echo "Database is ready. Running Alembic migrations..."

# Run Alembic migrations (Poetry manages the env; virtualenvs.create is false
# so this resolves to the system Python where deps are installed)
poetry run alembic upgrade head

echo "Starting FastAPI server..."

# BACKEND_WORKERS is set in .env (default: 1 if not provided).
# Note: multiple workers each maintain their own connection pool, so
# PgBouncer is especially important when BACKEND_WORKERS > 1.
exec uvicorn main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers "${BACKEND_WORKERS:-1}"
