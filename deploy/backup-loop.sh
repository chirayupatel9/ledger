#!/bin/sh
# Scheduled PostgreSQL backups with retention, run by the compose "backup" service.
# Each dump is verified with pg_restore --list before it replaces nothing; only scheduled-*.dump files are pruned,
# so manual backups from deploy/backup.mjs are never deleted.
set -eu
umask 077
hours=${BACKUP_INTERVAL_HOURS:-24}
keep=${BACKUP_KEEP:-14}
if [ "${1:-}" = check ]; then
  find /backups -maxdepth 1 -name 'scheduled-*.dump' -mmin -$((hours * 60 + 120)) | grep -q .
  exit
fi
while :; do
  stamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
  partial="/backups/.scheduled-$stamp.partial"
  if pg_dump -Fc -f "$partial" && pg_restore --list "$partial" >/dev/null; then
    mv "$partial" "/backups/scheduled-$stamp.dump"
    echo "Backup saved: scheduled-$stamp.dump"
    ls -1t /backups/scheduled-*.dump | tail -n +$((keep + 1)) | while read -r old; do rm -f -- "$old"; done
  else
    rm -f "$partial"
    echo "Backup failed; retrying next cycle" >&2
  fi
  sleep $((hours * 3600))
done
