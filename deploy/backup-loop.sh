#!/bin/sh
# Scheduled PostgreSQL backups with retention, run by the compose "backup" service.
# Wakes hourly: dumps when the newest scheduled dump is older than BACKUP_INTERVAL_HOURS, verifies it with
# pg_restore --list, then copies every dump not yet on the backup drive (OFFSITE_DIR) and verifies each copy.
# With OFFSITE_KEY_FILE, drive copies are encrypted (GnuPG, AES-256) as *.dump.gpg and plain copies are replaced.
# Only scheduled-* files are pruned, so manual backups from deploy/backup.mjs are never deleted.
set -eu
umask 077
hours=${BACKUP_INTERVAL_HOURS:-24}
local_dir=${BACKUP_DIR:-/backups}
keep=${BACKUP_KEEP:-14}
drive=${OFFSITE_DIR:-}
drive_keep=${OFFSITE_KEEP:-60}
key=${OFFSITE_KEY_FILE:-}
ext=.dump
[ -z "$key" ] || ext=.dump.gpg
export GNUPGHOME=/tmp/gnupg HOME=/tmp
mkdir -p -m 700 "$GNUPGHOME"
schedule_minutes=$((hours * 60))
health_minutes=$((schedule_minutes + 120))
# The grace period is only for health checks, never for deciding when a dump is due.
fresh() { [ -d "$1" ] && find "$1" -maxdepth 1 -type f -name "scheduled-*$2" -mmin -"$3" | grep -q .; }
prune() { ls -1t "$1"/scheduled-*"$2" 2>/dev/null | tail -n +$(($3 + 1)) | while read -r old; do rm -f -- "$old"; done; }
gpg_batch() { gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$key" "$@"; }

if [ "${1:-}" = check ]; then
  fresh "$local_dir" .dump "$health_minutes" || { echo "No local backup in the last $((hours + 2)) hours"; exit 1; }
  [ -z "$drive" ] || fresh "$drive" "$ext" "$health_minutes" || { echo "No copy on the backup drive in the last $((hours + 2)) hours"; exit 1; }
  exit 0
fi

dump() {
  stamp=$(date +%Y-%m-%dT%H-%M-%S%z)  # Indian Standard Time, e.g. 2026-10-21T02-30-00+0530
  partial="$local_dir/.scheduled-$stamp.partial"
  if pg_dump -Fc -f "$partial" && pg_restore --list "$partial" >/dev/null; then
    mv "$partial" "$local_dir/scheduled-$stamp.dump"
    echo "Backup saved: scheduled-$stamp.dump"
    prune "$local_dir" .dump "$keep"
  else
    rm -f "$partial"
    echo "Backup failed; retrying next hour" >&2
  fi
}

# Writes $1 to the drive as $2 (encrypted when a key is set) and proves the copy restores to identical bytes.
# pg_restore --list stops reading early, so gpg's broken-pipe complaint there is expected and silenced.
store() {
  partial="$drive/.${2##*/}.partial"
  if [ -n "$key" ]; then
    gpg_batch --symmetric --cipher-algo AES256 --compress-algo none -o "$partial" "$1" && sync "$partial" &&
      gpg_batch --decrypt "$partial" | cmp -s - "$1" && gpg_batch --decrypt "$partial" 2>/dev/null | pg_restore --list >/dev/null
  else
    cp "$1" "$partial" && sync "$partial" && cmp -s "$1" "$partial" && pg_restore --list "$partial" >/dev/null
  fi || { rm -f "$partial"; return 1; }
  mv "$partial" "$2"
  # Copying an old dump today must not make its contents appear newer to health checks.
  touch -r "$1" "$2"
}

copy_to_drive() {
  [ -n "$drive" ] || return 0
  # An unplugged drive leaves an empty mount point on the system disk. Never create the folder here:
  # a copy there would look like a second copy while sitting on the same disk as the database.
  if [ ! -d "$drive" ] || [ ! -w "$drive" ]; then
    echo "Backup drive folder $drive is missing or read-only. Is the drive plugged in and mounted? Not copying." >&2
    return 0
  fi
  if [ -n "$key" ] && [ ! -r "$key" ]; then echo "Encryption key $key is not readable. Not copying." >&2; return 0; fi
  for file in "$local_dir"/*.dump; do
    [ -f "$file" ] || continue
    name=${file##*/}
    [ -f "$drive/$name$( [ -n "$key" ] && echo .gpg)" ] && continue
    if store "$file" "$drive/$name$( [ -n "$key" ] && echo .gpg)"; then echo "Copied to backup drive: $name"; else echo "Copy of $name to the backup drive failed; retrying next hour" >&2; fi
  done
  # Encrypt plain copies left from before encryption was turned on, then remove the readable originals.
  if [ -n "$key" ]; then
    for plain in "$drive"/*.dump; do
      [ -f "$plain" ] || continue
      if [ -f "$plain.gpg" ] || store "$plain" "$plain.gpg"; then rm -f -- "$plain"; echo "Encrypted on backup drive: ${plain##*/}"; fi
    done
  fi
  prune "$drive" "$ext" "$drive_keep"
}

case "${1:-run}" in run|once) ;; *) echo "Usage: backup-loop.sh [run|once|check]" >&2; exit 2;; esac
while :; do
  fresh "$local_dir" .dump "$schedule_minutes" || dump
  copy_to_drive
  [ "${1:-run}" != once ] || exit 0
  sleep 3600
done
