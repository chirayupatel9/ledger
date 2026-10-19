#!/usr/bin/env python3
"""Enable on-demand mounting for an existing /mnt/backup fstab entry. Run with sudo.
Does not format disks, change their UUID, unmount an active disk, or create data directories.
"""
import datetime
import os
from pathlib import Path
import shutil
import subprocess

def configure(contents):
    lines = contents.splitlines(keepends=True)
    matches = []
    for index, line in enumerate(lines):
        fields = line.split()
        if fields and not line.lstrip().startswith('#') and len(fields) >= 6 and fields[1] == '/mnt/backup':
            matches.append((index, fields))
    if len(matches) != 1:
        raise ValueError('Expected exactly one existing /mnt/backup fstab entry; nothing changed.')
    index, fields = matches[0]
    if not fields[0].startswith('UUID='):
        raise ValueError('Expected the backup disk to be identified by its existing UUID; nothing changed.')
    options = [x for x in fields[3].split(',') if x not in ('noauto', 'x-systemd.automount') and not x.startswith('x-systemd.device-timeout=')]
    if 'nofail' not in options:
        options.append('nofail')
    fields[3] = ','.join(options + ['x-systemd.automount', 'x-systemd.device-timeout=60s'])
    lines[index] = ' '.join(fields) + '\n'
    return ''.join(lines)

def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with sudo to update the existing system mount configuration.')
    fstab = Path('/etc/fstab')
    old = fstab.read_text()
    new = configure(old)
    if new != old:
        backup = Path('/etc/fstab.before-ledger-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
        shutil.copy2(fstab, backup)
        fstab.write_text(new)
        print('Saved the previous fstab configuration to', backup)
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    print('Backup automount configured. Existing mounted filesystems were not interrupted.')

if __name__ == '__main__':
    main()
