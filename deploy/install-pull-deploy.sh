#!/usr/bin/env bash
# Install the server-side deploy timer. Run once on the production server, from the main checkout, as the user that
# deploys (the one deploy.sh runs as: passwordless `sudo -n docker`, ~/.local/state/ledger-deploy):
#   deploy/install-pull-deploy.sh
# Every 3 minutes the timer runs deploy/pull-deploy.mjs, which deploys the newest commit on main that passed CI.
# Status: systemctl list-timers ledger-deploy.timer   Logs: journalctl -u ledger-deploy -f
# Remove: sudo systemctl disable --now ledger-deploy.timer && sudo rm /etc/systemd/system/ledger-deploy.{service,timer}
set -euo pipefail
dir=$(cd "$(dirname "$0")/.." && pwd)
user=$(id -un)
node=$(command -v node) || { echo "node is not on PATH; install Node.js first." >&2; exit 1; }
[ -f "$dir/deploy/pull-deploy.mjs" ] || { echo "Run this from the Ledger main checkout." >&2; exit 1; }
# systemd starts with a bare PATH: keep node's folder (nvm installs live under the home folder) and the system folders.
path="$(dirname "$node"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

sudo tee /etc/systemd/system/ledger-deploy.service >/dev/null <<EOF
[Unit]
Description=Ledger: deploy the newest commit on main that passed CI
Wants=network-online.target
After=network-online.target docker.service

[Service]
Type=oneshot
User=$user
WorkingDirectory=$dir
Environment=HOME=$HOME
Environment=PATH=$path
Environment=LEDGER_DIR=$dir
ExecStart=$node $dir/deploy/pull-deploy.mjs
TimeoutStartSec=90min
EOF

sudo tee /etc/systemd/system/ledger-deploy.timer >/dev/null <<EOF
[Unit]
Description=Ledger: look for a new commit to deploy every 3 minutes

[Timer]
OnBootSec=2min
OnUnitInactiveSec=3min
RandomizedDelaySec=15s

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ledger-deploy.timer
echo "Installed for $user in $dir (node: $node)."
echo "What it would do now:"
LEDGER_DIR="$dir" "$node" "$dir/deploy/pull-deploy.mjs" --dry-run || true
echo "Timer: systemctl list-timers ledger-deploy.timer   Logs: journalctl -u ledger-deploy -f"
