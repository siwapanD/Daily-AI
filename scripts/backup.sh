#!/usr/bin/env sh
# Usage: scripts/backup.sh [output_dir]   (default ./backups)
# Uses the compose "db" service when running; falls back to local pg_dump with $DATABASE_URL.
set -eu
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/dailyai-$(date +%Y%m%d-%H%M%S).sql.gz"
if docker compose ps --status running db >/dev/null 2>&1 && [ -n "$(docker compose ps -q db 2>/dev/null)" ]; then
  docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' | gzip > "$FILE"
else
  : "${DATABASE_URL:?DATABASE_URL must be set when not using docker compose}"
  pg_dump "$DATABASE_URL" --clean --if-exists --no-owner | gzip > "$FILE"
fi
echo "Backup written: $FILE"
# Keep the 14 most recent backups.
ls -1t "$OUT_DIR"/dailyai-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
