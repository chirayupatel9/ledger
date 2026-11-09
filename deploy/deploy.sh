#!/usr/bin/env bash
# Deploy Ledger from the main checkout: one deploy at a time (the production lock), a database backup first, a health
# check after, and the previous images back if the new ones are not healthy.
#   deploy/deploy.sh             deploy what the main checkout has now (by hand)
#   deploy/deploy.sh --ci <sha>  deploy a commit on origin/main (deploy/pull-deploy.mjs, once CI passed for it)
# The commit production runs is kept in ~/.local/state/ledger-deploy/deployed, so a commit already deployed is skipped.
set -uo pipefail
repo=${LEDGER_DIR:-/home/chirayu/code/ledger-selfhost}
state=${LEDGER_DEPLOY_STATE:-$HOME/.local/state/ledger-deploy}
health=${LEDGER_HEALTH_URL:-http://127.0.0.1:5800}
mode=manual target=''
if [ "${1:-}" = --ci ]; then mode=ci; target=${2:?Give the commit to deploy}; fi
cd "$repo" || exit 1
mkdir -p "$state"
log(){ printf '%s IST  %s\n' "$(TZ=Asia/Kolkata date '+%Y-%m-%d %H:%M:%S')" "$*"; }
# A phone alert through ntfy when a deploy fails or rolls back (NTFY_URL in .env; never printed).
notify(){ [ "${LEDGER_NOTIFY:-1}" = 1 ] || return 0;local url;url=$(grep -E '^NTFY_URL=' .env 2>/dev/null | head -1 | cut -d= -f2-);[ -n "$url" ] && curl -fsS -m 10 -H 'Title: Ledger deploy' -H 'Priority: high' -d "$1" "$url" >/dev/null 2>&1;return 0; }
fail(){ log "$1";[ "${2:-}" = alert ] && notify "$1";exit 1; }

exec 9>/tmp/ledger-production.lock
log "Waiting for the production lock"
flock -w 3600 9 || fail "Timed out waiting for the production lock." alert
deployed=$(cat "$state/deployed" 2>/dev/null || true)

if [ "$mode" = ci ]; then
 [ "$(git branch --show-current)" = main ] || fail "The main checkout is not on main; not deploying $target." alert
 [ -z "$(git status --porcelain --untracked-files=no)" ] || fail "The main checkout has uncommitted changes (a session is working there); not deploying $target. Once it is clean: node deploy/pull-deploy.mjs --retry" alert
 git fetch -q origin main || fail "Could not fetch origin/main." alert
 git merge-base --is-ancestor "$target" origin/main || fail "$target is not on origin/main; not deploying."
 head=$(git rev-parse HEAD)
 [ "$deployed" = "$target" ] && { log "Production already runs $target."; exit 0; }
 if [ "$deployed" = "$head" ] && git merge-base --is-ancestor "$target" "$head"; then log "Production already runs $head, which includes $target."; exit 0; fi
 if git merge-base --is-ancestor "$head" "$target"; then git merge -q --ff-only "$target" || fail "Could not move the main checkout to $target." alert
 else fail "The main checkout ($head) has commits that are not on origin/main; not deploying $target." alert; fi
else
 target=$(git rev-parse HEAD)
 [ -n "$(git status --porcelain --untracked-files=no)" ] && target="$target-dirty"
fi

log "Deploying $target (production ran ${deployed:-an unrecorded version})"
node deploy/backup.mjs || fail "The backup failed; not deploying $target." alert
# The images running now, to go back to.
for image in ledger-api ledger-web; do sudo -n docker image inspect "$image:local" >/dev/null 2>&1 && sudo -n docker tag "$image:local" "$image:rollback"; done
# LEDGER_TEST_UNHEALTHY=1 fails the first health check, to rehearse the rollback.
unhealthy_once=${LEDGER_TEST_UNHEALTHY:-0}
healthy(){ local i;if [ "$unhealthy_once" = 1 ];then unhealthy_once=0;log "Rehearsal: treating this deploy as unhealthy.";return 1;fi;for i in $(seq 1 40);do
 if curl -fsS -m 5 "$health/api/health" >/dev/null 2>&1 && [ "$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$health/login")" = 200 ];then return 0;fi;sleep 3;done;return 1; }
if sudo -n docker compose up -d --build && healthy; then
 echo "$target" > "$state/deployed";log "Healthy: production runs $target.";exit 0
fi
log "Not healthy after deploying $target: going back to the previous images."
sudo -n docker compose ps;sudo -n docker compose logs --tail=60 api web 2>&1 | tail -80
for image in ledger-api ledger-web; do sudo -n docker image inspect "$image:rollback" >/dev/null 2>&1 && sudo -n docker tag "$image:rollback" "$image:local"; done
if sudo -n docker compose up -d --no-build && healthy; then
 fail "Deploy of $target failed its health check and was rolled back: production runs the previous version (${deployed:-unrecorded}) again. The main checkout stays at $target; fix it and push again." alert
fi
fail "Deploy of $target failed and the rollback is not healthy either. Check the server now." alert
