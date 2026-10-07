#!/usr/bin/env sh
# Usage: scripts/restore.sh backups/dailyai-YYYYMMDD-HHMMSS.sql.gz
# DESTRUCTIVE: replaces the current database contents with the backup.
set -eu
FILE="${1:?usage: scripts/restore.sh <backup.sql.gz>}"
[ -f "$FILE" ] || { echo "No such file: $FILE"; exit 1; }
printf "This will OVERWRITE the database with %s. Type 'restore' to continue: " "$FILE"
read -r answer
[ "$answer" = "restore" ] || { echo "Aborted."; exit 1; }
if [ -n "$(docker compose ps -q db 2>/dev/null)" ]; then
  gunzip -c "$FILE" | docker compose exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
else
  : "${DATABASE_URL:?DATABASE_URL must be set when not using docker compose}"
  gunzip -c "$FILE" | psql -q -v ON_ERROR_STOP=1 "$DATABASE_URL"
fi
echo "Restore complete."
