# Deployment

## Docker Compose (recommended)
```bash
cp .env.example .env
# Required: APP_PASSWORD, CRON_SECRET, APP_SECRET_KEY (openssl rand -hex 32), POSTGRES_PASSWORD
# Optional: LLM_*, GITHUB_TOKEN, APP_PORT, DAILY_JOB_CRON
docker compose up -d --build
docker compose ps
curl -fsS http://localhost:3000/api/health
```
Services:
- `db`: `postgres:16-alpine` with a named volume `pgdata`.
- `app`: multi-stage build that ships the Next.js standalone server as a non-root user, with a `HEALTHCHECK` on `/api/health`. On start it applies migrations (guarded by an advisory lock) and the idempotent seed.
- `cron`: plain Alpine image running busybox `crond`, which POSTs `/api/jobs/daily` with `CRON_SECRET` on `DAILY_JOB_CRON` (UTC). It installs no packages.

### Reverse proxy
Point your proxy at `app:3000` (or `localhost:${APP_PORT}`) and terminate TLS there. Example for Caddy:
```
daily.example.com {
  reverse_proxy localhost:3000
}
```
The app's rate limiting reads the client IP from `X-Forwarded-For`, which your proxy should set.

### Upgrade
```bash
git pull && docker compose up -d --build   # migrations run automatically
```
Take a backup first ([backup.md](backup.md)).

## Without Docker
```bash
npm ci && npm run build
cp -r .next/static .next/standalone/.next/static && cp -r drizzle .next/standalone/drizzle
cd .next/standalone && node server.js     # with env vars exported
```
Schedule the daily job with the host's cron:
```
0 6 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/jobs/daily
```

## Production checklist
- [ ] `APP_PASSWORD`, `CRON_SECRET` and `APP_SECRET_KEY` set to strong random values
- [ ] `ALLOW_PRIVATE_FETCH=false`
- [ ] `curl /api/health` returns `{"status":"ok"}`
- [ ] Settings → Sources: run a fetch and check for errors
- [ ] Settings → AI provider: tokens/cost appear after Analyze Now (if an LLM is configured)
- [ ] `docker compose logs cron` shows the schedule
- [ ] Backups scheduled
