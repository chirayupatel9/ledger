# Security hardening — remaining actions

A security review of this repo (API/auth, browser client, and operations) ran after it was made public.
The exploitable and clearly code-fixable findings are fixed in the codebase (see the "Security:" commits). This file
lists what is **left**: actions only the repository/server owner can take, and a few code changes that are not
auto-deployed because they cannot be verified in the CI sandbox and a mistake would reach production through the
self-deploy timer. Apply each of those on the server, test it, and keep the rollback handy.

## 1. Do now — owner-only (highest risk first)

These are GitHub or physical actions; there is nothing to change in the code.

1. **Remove the old self-hosted Actions runner.** While a runner is registered to a *public* repo, anyone can open a
   fork pull request whose workflow targets `runs-on: [self-hosted, ledger-deploy]` and run code on the production
   server as the deploy user (passwordless `sudo -n docker` = root). Check **Settings → Actions → Runners** is empty.
   If a runner is listed, on the server: `cd ~/actions-runner-ledger && sudo ./svc.sh stop && sudo ./svc.sh uninstall
   && ./config.sh remove --token <token from the Runners page>`. The server now deploys itself (see the README), so no
   runner is needed.
2. **Enable the "Protect main" ruleset.** It exists but is set to *disabled*. The self-deploy timer runs whatever
   lands on `main` within minutes, so an unprotected `main` means any write (a leaked token, a mis-used agent session)
   runs on the server. Require a pull request + review, with no bypass for apps.
3. **Require approval for fork pull-request workflows from _all_ outside contributors** (Settings → Actions → General).
   The default only asks for first-time contributors.
4. **Wipe the old USB backup drive.** Backups were copied to it unencrypted for about an hour on 2026-10-16 before
   GPG encryption was added; deleted blocks are usually recoverable. Copy the `.gpg` files off, then wipe free space
   (or reformat, ideally onto LUKS).
5. **Take down the stale hosted copy** of the app (an old ChatGPT Sites deployment). It is unmaintained and public.

## 2. Apply and test on the server (not auto-deployed)

Each of these changes container/network/Postgres behaviour that the CI sandbox cannot exercise. Apply on the server,
run `deploy/deploy.sh` by hand, confirm `/api/health` and sign-in, and roll back with the previous images if anything
misbehaves.

### 2a. Pin the Docker subnet (keeps Caddy's trusted-proxy address valid) — REVERTED, needs server testing

Was shipped in PR #9 and **reverted** after it broke the production deploy: pinning a subnet on an already-running
network forces Docker to recreate it, which failed against the live stack. CI (a fresh network each run) never hit
this. Reintroduce **on the server**, hands-on: either recreate the stack once during a maintenance window
(`docker compose down` without `-v`, then `up`) with the pin set to the subnet the network already uses, or pin it
when the stack is first created. Do not auto-deploy it. The original note is kept below.



`deploy/Caddyfile` trusts `CF-Connecting-IP` only from the gateway `172.18.0.1`. Compose does not pin the subnet, so a
network recreated on a different subnet would make Caddy stop trusting Cloudflare's client-IP header — then every
visitor shares the gateway IP and anyone can exhaust the 10/min sign-in limit for everyone. Pin it (the project
already uses this subnet, so pinning the current value is safe):

```yaml
# compose.yaml — add at the end, alongside the top-level `volumes:` block
networks:
  default:
    ipam:
      config:
        - subnet: 172.18.0.0/16   # Caddy trusts the gateway 172.18.0.1 (deploy/Caddyfile)
```

Test: `sudo docker compose up -d` recreates the network; confirm `docker network inspect ledger_default` shows
`172.18.0.0/16` and the gateway `172.18.0.1`, then sign in. If `172.18.0.0/16` is already taken by another network on
the host, pick the subnet that network currently has instead and update both places.

### 2b. Run the API as a non-superuser Postgres role — DONE (opt-in on existing deployments)

Implemented: `migrate` (as the superuser) creates a `ledger_app` login role and grants it DML on the app tables and
sequences; `apps/api` connects as it. It is **opt-in and safe to merge** — the `api` service's `DATABASE_URL` falls
back to the superuser when `LEDGER_APP_USER`/`LEDGER_APP_PASSWORD` are unset, so an existing deployment is unchanged
until those two lines are added to `.env` (then redeploy; migrate creates the role and grants on the next run).
`deploy/setup.mjs` generates them for new installs, so CI and fresh deployments use the restricted role by default —
CI runs its whole suite against it. Verified locally: the role is non-superuser with DML but no schema CREATE, and the
API ran as `ledger_app` through seven live suites with zero permission errors. The original note is kept below.



`DATABASE_URL` connects as `ledger`, which is the cluster superuser (it is `POSTGRES_USER`). Any future SQL-injection
bug could then use `COPY … TO PROGRAM` to run shell commands in the db container. Give the API a role that owns its
tables but is not a superuser: create a `ledger_app` login role, grant it privileges on the app schema, point
`DATABASE_URL` at it, and keep a superuser connection only for `migrate` if the migrations need DDL the app role
lacks. Because an init script runs only on an empty data volume, applying this to the existing database means running
the `CREATE ROLE`/`GRANT` statements once by hand against the live database, then switching `DATABASE_URL`. Test the
full migrate + API start + a sign-in and a ledger save before relying on it.

### 2c. Harden the Caddy container — REVERTED, needs server testing

Was shipped in PR #9 (`cap_drop`/`read_only`/`tmpfs`/`no-new-privileges` on the `proxy` service) and **reverted**: it
broke Caddy on the production **Cloudflare-tunnel** topology, which CI only exercised in plain-HTTP mode. Reintroduce
**on the server**, one directive at a time, watching `docker compose logs proxy` under the real tunnel config — most
likely `read_only` needs an extra writable path (add it as a `tmpfs` or volume) that the HTTP-only CI run never
reached. Do not auto-deploy it. The `db` `internal:` network and `docker compose build --pull` remain optional, also
server-tested. The original note is kept below.



Caddy is the only internet-facing container and currently runs as root with no restrictions, on the same network as
Postgres. Add to the `proxy:` service: `cap_drop: [ALL]`, `cap_add: [NET_BIND_SERVICE]`,
`security_opt: [no-new-privileges:true]`, `read_only: true`, and `tmpfs: [/tmp]` (Caddy writes to the `/data` and
`/config` volumes). Test `sudo docker compose up -d proxy` and confirm it serves and loads TLS; if it fails to write
somewhere, add that path as a tmpfs or volume. Consider also moving `db` to an `internal: true` network so only the
API and backup reach it. Separately, `deploy/deploy.sh` builds with the images it first pulled; add
`docker compose build --pull` so base images receive security updates, and test a full deploy.

### 2d. Nonce-based CSP (drop `'unsafe-inline'` for scripts) — DONE

Implemented: the CSP is now set per request with a script nonce by `apps/web/middleware.ts`, and `deploy/Caddyfile`
no longer sets it. `script-src` is `'self' 'nonce-<per-request>' 'wasm-unsafe-eval'` — no `'unsafe-inline'`. Next adds
the nonce to its own bootstrap scripts; the first-paint theme script (`public/loading.js`, threaded through
`app/workspace-page.tsx` → `app/workspace.tsx`) carries it too; the app's own bundles load via `'self'`. Styles keep
`'unsafe-inline'` (out of scope — the finding was scripts). Verified locally on a production build: every page sends a
nonce'd header with no script `'unsafe-inline'`, zero CSP violations and zero page errors across every page, and the
live suites pass. **The browser review found no current injection to chain this with, so it is defence in depth.**

This is the one change whose local harness (a Node proxy + `next start`) differs from production (Caddy + the
standalone server). **Watch the first deploy:** load the live site, confirm pages render, and confirm the response
`Content-Security-Policy` carries a `nonce-…` with no script `'unsafe-inline'`. A broken CSP would not fail the deploy
health check (the page still returns 200), so verify by hand and roll back with the previous images if the app
misbehaves.

## 3. Accepted / low, with rationale

- **Account lockout by IP.** The 10/min sign-in limit blocks the correct password too, so someone can lock the owner
  out by guessing wrong 10×/min at the published address. This is inherent to a per-IP limit; two-step verification
  and the per-recipient email cap reduce the impact. A per-account progressive delay is possible but is its own
  project.
- **A website can POST to `/share`.** The service worker cannot tell a real OS share from a page's auto-submitted
  form, so an attacker site can push text/a file into the capture flow; the user must still press **Save**. The file
  is now size-capped. Auto-matching a shared UPI reference to a real payment is the legitimate feature, so it is kept;
  a "Shared from another app" label on that review screen would be a reasonable future addition.
- **Up to 12 MB JSON parsed before the auth guard** on `/api/*`. Low impact (needs bandwidth) and lowering the limit
  risks rejecting large legitimate ledger saves; left as-is.
