# Backup & Restore

## Backup
```bash
scripts/backup.sh            # → ./backups/dailyai-YYYYMMDD-HHMMSS.sql.gz (keeps the 14 newest)
scripts/backup.sh /mnt/backups
```
The script uses `docker compose exec db pg_dump` when the Compose `db` service is running, and otherwise local `pg_dump "$DATABASE_URL"`.

To back up daily from the host's crontab:
```
30 5 * * * cd /opt/Daily-AI && scripts/backup.sh >> /var/log/dailyai-backup.log 2>&1
```
Copy backups off the server (S3, rsync, …). Back up `.env` separately and securely: without the same `APP_SECRET_KEY`, encrypted secrets in the DB can't be decrypted.

## Restore (destructive)
```bash
scripts/restore.sh backups/dailyai-20261007-053000.sql.gz   # asks you to type "restore"
```
The dump is created with `--clean --if-exists`, so restoring replaces the existing tables. Restart the app afterwards: `docker compose restart app`.

## Exports
Knowledge items, experiments, digests and playbook versions can each be exported as Markdown from the UI or the API. These exports are portable but don't replace database backups.
