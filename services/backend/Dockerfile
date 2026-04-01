FROM python:3.12.3-slim

# ---------------------------
# Install system dependencies
# ---------------------------
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    postgresql-client \
    curl \
    netcat-openbsd \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------
# Set working directory
# ---------------------------
WORKDIR /usr/src/app

# ---------------------------
# Set PYTHONPATH so imports work inside src
# ---------------------------
ENV PYTHONPATH=/usr/src/app/src

# ---------------------------
# Install Poetry
# ---------------------------
RUN pip install --no-cache-dir poetry

# ---------------------------
# Copy dependency descriptors
# ---------------------------
COPY services/backend/src/pyproject.toml services/backend/src/poetry.lock* /usr/src/app/

# ---------------------------
# Install dependencies (system Python)
# ---------------------------
RUN poetry config virtualenvs.create false \
    && poetry install --no-root --no-interaction --no-ansi

# ---------------------------
# Copy backend source code
# ---------------------------
COPY services/backend/src/ /usr/src/app/src/

# ---------------------------
# Copy frontend files (outside src)
# ---------------------------
COPY services/frontend ./frontend

# ---------------------------
# Ensure Alembic config and migrations are included
# ---------------------------
COPY services/backend/src/alembic.ini /usr/src/app/alembic.ini
COPY services/backend/src/migrations/ /usr/src/app/migrations/

# ---------------------------
# Copy scripts and make them executable
# ---------------------------
COPY services/backend/src/scripts /usr/src/app/scripts
RUN chmod +x /usr/src/app/scripts/*.sh

# ---------------------------
# Create folders and set ownership dynamically
# ---------------------------
RUN mkdir -p /usr/src/app/images /usr/src/app/logs

# ---------------------------
# Create non-root user
# ---------------------------
RUN useradd -m -u 1000 appuser

# ---------------------------
# Give appuser ownership of the directories it needs to write to
# ---------------------------
RUN chown -R appuser:appuser /usr/src/app/images /usr/src/app/logs /usr/src/app/migrations

# ---------------------------
# Now switch to the non-root user
# ---------------------------
USER appuser

# ---------------------------
# Expose Uvicorn port
# ---------------------------
EXPOSE 8000

# ---------------------------
# Entrypoint
# ---------------------------
ENTRYPOINT ["/usr/src/app/scripts/entrypoint.sh"]