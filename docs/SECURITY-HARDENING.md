# Security hardening — remaining actions

A security review of this repo (API/auth, browser client, and operations) ran after it was made public.
The exploitable and clearly code-fixable findings are already fixed in the codebase (see the "Security:" commits
and PR #7). This file lists what is **left**: actions only the repository/server owner can take, and a few code
changes that were deliberately **not** auto-deployed because they cannot be verified in the CI sandbox and a mistake
would reach production through the self-deploy timer. Apply each of those on the server, test it, and keep the
rollback handy.

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

Each of these is a real improvement but changes container/network/Postgres behaviour that the CI sandbox cannot
exercise. Apply on the server, run `deploy/deploy.sh` by hand, confirm `/api/health` and sign-in, and roll back with
the previous images if anything misbehaves.

### 2a. Pin the Docker subnet (keeps Caddy's trusted-proxy address valid)

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

### 2b. Run the API as a non-superuser Postgres role

`DATABASE_URL` connects as `ledger`, which is the cluster superuser (it is `POSTGRES_USER`). Any future SQL-injection
bug could then use `COPY … TO PROGRAM` to run shell commands in the db container. Give the API a role that owns its
tables but is not a superuser:

1. Add an init script (runs only on a fresh volume) that creates the app role, e.g.
   `deploy/db-init/01-app-role.sql` mounted at `/docker-entrypoint-initdb.d/`:
   ```sql
   CREATE ROLE ledger_app LOGIN PASSWORD :'app_password';
   GRANT ALL ON DATABASE ledger TO ledger_app;
   ```
   and grant it ownership/privileges on the schema the migrations create.
2. Point `DATABASE_URL` at `ledger_app`. Keep a separate superuser connection only for `migrate` if the migrations
   need DDL the app role lacks.

Because the init script runs only on an empty data volume, applying this to the existing database means running the
`CREATE ROLE`/`GRANT` statements once by hand against the live database, then switching `DATABASE_URL`. Test the full
migrate + API start + a sign-in and a ledger save before relying on it.

### 2c. Harden the Caddy container

Caddy is the only internet-facing container and currently runs as root with no restrictions, on the same network as
Postgres. Add:

```yaml
# compose.yaml, under the `proxy:` service
    cap_drop: [ALL]
    cap_add: [NET_BIND_SERVICE]
    security_opt: [no-new-privileges:true]
    read_only: true
    tmpfs: [/tmp]
```

Caddy writes to `/data` and `/config` (already named volumes) so `read_only` on the root filesystem is usually fine,
but test: `sudo docker compose up -d proxy` and confirm it serves and provisions/loads TLS. If it fails to write
somewhere, add that path as a `tmpfs` or volume. Consider also moving `db` to an `internal: true` network so only the
API and backup reach it.

Separately, `deploy/deploy.sh` builds with the images it first pulled; add `docker compose build --pull` (or
`pull` before `up`) so base images (`caddy:2-alpine`, `postgres:18-bookworm`, `node:22-bookworm-slim`) receive
security updates. Test a full deploy after changing it.

### 2d. Nonce-based CSP (drop `'unsafe-inline'` for scripts)

`deploy/Caddyfile` sets `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`. `eval` is blocked, but inline
`<script>`/`on*=` handlers would run — so if an HTML-injection bug were ever introduced, the CSP would not contain it.
**The browser review found no such injection today** (XSS payloads in 86 fields, every page and the CSV importer,
none fired), so this is defence-in-depth, not an open hole — which is why it is here and not in the shipped fix.

The correct fix for Next's App Router is a per-request nonce: Next middleware generates a nonce, sets the CSP header
with `'nonce-<value>' 'strict-dynamic'` (dropping `'unsafe-inline'` for `script-src`), and Next applies the nonce to
its own bootstrap scripts; the one hand-written inline script (the theme bootstrap in `public/loading.js`, rendered
via `app/workspace.tsx`) must carry the same nonce, read from `next/headers`. Move the CSP from `deploy/Caddyfile`
into that middleware so the header and the nonce come from one place. Leave `style-src 'unsafe-inline'` as-is (noncing
every inline style is a larger change and the finding is about scripts). Verify every page loads with no CSP console
errors and that the response `Content-Security-Policy` contains a nonce and no script `'unsafe-inline'`, behind Caddy
and Cloudflare, before relying on it.

## 3. Accepted / low, with rationale

- **Account lockout by IP.** The 10/min sign-in limit blocks the correct password too, so someone can lock the owner
  out by guessing wrong 10×/min at the published address. This is inherent to a per-IP limit; two-step verification
  and the new per-recipient email cap reduce the impact. Changing to a per-account progressive delay is possible but
  is its own project.
- **A website can POST to `/share`.** The service worker cannot tell a real OS share from a page's auto-submitted
  form, so an attacker site can push text/a file into the capture flow; the user must still press **Save**. The file
  is now size-capped (shipped). Auto-matching a shared UPI reference to a real payment is the legitimate feature, so
  it is kept; a "Shared from another app" label on that review screen would be a reasonable future addition.
- **Up to 12 MB JSON parsed before the auth guard** on `/api/*`. Low impact (needs bandwidth) and lowering the limit
  risks rejecting large legitimate ledger saves; left as-is.
