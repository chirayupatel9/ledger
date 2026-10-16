#!/bin/sh
# Scheduled PostgreSQL backups with retention, run by the compose "backup" service.
# Wakes hourly: dumps when the newest scheduled dump is older than BACKUP_INTERVAL_HOURS, verifies it with
# pg_restore --list, then copies every dump not yet on the backup drive (OFFSITE_DIR) and verifies each copy.
# Only scheduled-*.dump files are pruned, so manual backups from deploy/backup.mjs are never deleted.
set -eu
umask 077
hours=${BACKUP_INTERVAL_HOURS:-24}
keep=${BACKUP_KEEP:-14}
drive=${OFFSITE_DIR:-}
drive_keep=${OFFSITE_KEEP:-60}
fresh() { find "$1" -maxdepth 1 -name 'scheduled-*.dump' -mmin -$((hours * 60 + 120)) | grep -q .; }
prune() { ls -1t "$1"/scheduled-*.dump 2>/dev/null | tail -n +$(($2 + 1)) | while read -r old; do rm -f -- "$old"; done; }

if [ "${1:-}" = check ]; then
  fresh /backups || { echo "No local backup in the last $hours hours"; exit 1; }
  [ -z "$drive" ] || fresh "$drive" || { echo "No copy on the backup drive in the last $hours hours"; exit 1; }
  exit 0
fi

dump() {
  stamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
  partial="/backups/.scheduled-$stamp.partial"
  if pg_dump -Fc -f "$partial" && pg_restore --list "$partial" >/dev/null; then
    mv "$partial" "/backups/scheduled-$stamp.dump"
    echo "Backup saved: scheduled-$stamp.dump"
    prune /backups "$keep"
  else
    rm -f "$partial"
    echo "Backup failed; retrying next hour" >&2
  fi
}

copy_to_drive() {
  [ -n "$drive" ] || return 0
  # An unplugged drive leaves an empty mount point on the system disk. Never create the folder here:
  # a copy there would look like a second copy while sitting on the same disk as the database.
  if [ ! -d "$drive" ] || [ ! -w "$drive" ]; then
    echo "Backup drive folder $drive is missing or read-only. Is the drive plugged in and mounted? Not copying." >&2
    return 0
  fi
  for file in /backups/*.dump; do
    [ -f "$file" ] || continue
    name=${file##*/}
    [ -f "$drive/$name" ] && continue
    partial="$drive/.$name.partial"
    if cp "$file" "$partial" && sync "$partial" && cmp -s "$file" "$partial" && pg_restore --list "$partial" >/dev/null; then
      mv "$partial" "$drive/$name"
      echo "Copied to backup drive: $name"
    else
      rm -f "$partial"
      echo "Copy of $name to the backup drive failed; retrying next hour" >&2
    fi
  done
  prune "$drive" "$drive_keep"
}

while :; do
  fresh /backups || dump
  copy_to_drive
  sleep 3600
done
