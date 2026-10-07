#!/bin/sh
# Cron container (plain alpine, busybox crond + wget, no packages needed): calls POST /api/jobs/daily on schedule DAILY_JOB_CRON (default 06:00) using CRON_SECRET.
set -eu
: "${CRON_SECRET:?CRON_SECRET is required}"
SCHEDULE="${DAILY_JOB_CRON:-0 6 * * *}"
TARGET="${APP_INTERNAL_URL:-http://app:3000}/api/jobs/daily"
cat > /usr/local/bin/daily-ai-job <<SCRIPT
#!/bin/sh
echo "\$(date -Iseconds) running daily job"
wget -q -O- -T 900 --header "Authorization: Bearer ${CRON_SECRET}" --post-data "" "${TARGET}" || echo "\$(date -Iseconds) daily job FAILED"
echo
SCRIPT
chmod 700 /usr/local/bin/daily-ai-job
echo "${SCHEDULE} /usr/local/bin/daily-ai-job >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "DAILY AI cron scheduled: '${SCHEDULE}' -> ${TARGET} (container time is UTC)"
exec crond -f -l 8
