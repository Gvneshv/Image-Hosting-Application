#!/bin/sh
set -e

# Load environment variables from the read-only mount provided by docker-compose
. /env/.env

# Timestamp used to make each backup filename unique
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Backup directory — must match the volume mount in docker-compose.yml:
#   ./services/backend/backup:/backup
BACKUP_DIR="/backup"
mkdir -p "$BACKUP_DIR"

# Dump the entire database to a plain SQL file
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  > "$BACKUP_DIR/db_backup_$TIMESTAMP.sql"

echo "Backup created: $BACKUP_DIR/db_backup_$TIMESTAMP.sql"

# Retention policy: keep the 7 most recent backups and delete any older ones
find "$BACKUP_DIR" -maxdepth 1 -type f -name "db_backup_*.sql" \
  -printf "%T@ %p\n" | sort -nr | tail -n +8 | cut -d' ' -f2- | xargs -r rm --

echo "Old backups cleaned up; retaining the 7 most recent."
