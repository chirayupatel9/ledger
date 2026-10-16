# Ledger — self-hosted

This is the Docker edition of Ledger. It uses **Next.js / React**, a separate **NestJS / TypeScript API**, **PostgreSQL 18**, **Better Auth**, and **Caddy**. It has no Supabase, Cloudflare D1/R2, or Sites runtime dependency. The earlier Sites project remains separately in `../ledger`; this edition is in `ledger-selfhost`.

## Current deployment

- Live app: https://ledger.chirayupatel.dev
- Login: `chirayu@ledger.chirayupatel.dev`
- Generated password: `.secrets/owner-login.json` (mode 0600, excluded from Git and Docker builds).
- After signing in, use **Your account & data → Change password**. Changing a password revokes other sessions.
- Google login, public signup, and email recovery are disabled. `MAIL_DELIVERY_ENABLED=false` prevents outbound mail and disables email-dependent authentication endpoints. The account was explicitly provisioned and verified by the operator; verification requirements remain in place for other accounts.

The existing host Cloudflare Tunnel routes this hostname to `http://127.0.0.1:5800`. Public traffic uses Cloudflare-managed HTTPS and an encrypted tunnel; the final HTTP hop stays on the same host. HTTP redirects to HTTPS and HSTS is enabled. The database/API/web ports remain private. The `drop` and `files` tunnel routes are preserved.

Use `sudo docker compose up -d --build` for updates on this host. **Do not use `deploy/compose.production.yaml` here**: that optional configuration is for direct Internet hosting without the tunnel. The tunnel route lives in `/etc/cloudflared/config.yml` with a pre-change backup at `/etc/cloudflared/config.before-ledger.yml`. Caddy trusts the current Docker gateway `172.18.0.1` for the Cloudflare client-IP header; update that explicit address if the Docker subnet changes. Do not expose the loopback origin port directly to the Internet.

To enable email later, configure a real SMTP sender, set `MAIL_DELIVERY_ENABLED=true`, and recreate the API container. Verify delivery before inviting signups. Google remains optional and disabled without its credentials. The local Mailpit container is stopped.

## Local development on a separate checkout



```sh
node deploy/setup.mjs
sudo docker compose --profile local up -d --build
```

- App: http://localhost:5800
- Local verification/reset email inbox: http://localhost:5801
- Create your account in the app, open its verification email in the local inbox, then sign in.
- Google sign-in stays disabled until your Google client ID and secret are configured.

Both ports bind to loopback. PostgreSQL, the API, and the Next.js server have no published host ports. The `.env` file has unique generated secrets and mode 0600. Setup never overwrites an existing file. Docker restarts the services after reboot; PostgreSQL data survives application rebuilds in `ledger_postgres-data`. Do not run `docker compose down -v` unless you intend to erase data.

## Application

Indian CSV and text-table PDF imports, preview and column mapping, exact paise amounts, categorization rules, review flags, income/expense summaries, transfers/refunds, duplicate detection, original statement downloads, activity history, and JSON/CSV export are retained. PDF parsing happens in the browser; confirmed data and originals persist in PostgreSQL, not browser storage.

Email/password signup requires email verification. Better Auth manages password hashing, database sessions, reset tokens, Google OAuth, origin protection, and database-backed authentication throttling. Password resets revoke sessions. API operations derive the owner from the verified session and scope every financial query by that owner. User-supplied ownership and gateway identity headers are ignored. Automatic linking of Google and password accounts by email is disabled.

Ledger writes lock the user's database row and check the revision in one transaction. Upload quotas are checked under the same lock. Originals currently use PostgreSQL `bytea`, which keeps file deletion and ledger changes atomic and puts all records in one consistent database backup. This is deliberately simple for a single-server deployment; large installations should introduce private object storage through a storage service with a durable deletion queue. Limits: 20 MB/file, 1 GiB and 2,000 files/account, 25,000 transactions, 500 rules.

The UI preserves the existing browser-based finance renderer inside React. New pages can use React directly; replacing that renderer is a separate UI refactor. Nest controllers, authentication, storage, and validation are separate modules. The database uses versioned application migrations and the pinned authentication library's schema migration API.

## Google and public hosting

1. Choose a domain pointing to this server. Set `APP_ORIGIN=https://your-domain` and `SITE_ADDRESS=your-domain` in `.env`.
2. Configure a real SMTP sender: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM`. Verify your sender domain and test delivery. Mailpit is a local test inbox, not an Internet mail service. With email enabled, public startup rejects absent SMTP credentials. Public startup always rejects plain HTTP origins.
3. Create a Google OAuth web client with redirect URI `https://your-domain/api/auth/callback/google`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. For local testing, use `http://localhost:5800/api/auth/callback/google` in a development OAuth client. Keep credentials out of version control.
4. Start with `sudo docker compose -f compose.yaml -f deploy/compose.production.yaml up -d --build`. This publishes ports 80/443 and Caddy provisions TLS. Stop local Mailpit when no longer needed: `sudo docker compose --profile local stop mailpit`.
5. Verify real email signup/recovery, Google login with two accounts, per-user isolation, and HTTPS cookies before inviting users.

The existing `chatgpt.site` URL cannot host these Docker containers. Use this machine's localhost URL now and your own domain for public hosting.

## Operations and backups

```sh
sudo docker compose ps
sudo docker compose logs --tail=100 api
node deploy/backup.mjs
node deploy/restore-check.mjs backups/ledger-TIMESTAMP.dump
```

Backups contain account information, original bank statements, and pending email links. Store encrypted copies off this host, restrict access, schedule backups, and test restoration. The backup command creates a private PostgreSQL custom-format dump under `backups/`. Restore into a **new empty database first** using `pg_restore --exit-on-error --no-owner`; compare ledger revisions, row counts, and original bytes before considering a production restore. Never restore over a live database casually. Preserve `.env` secrets securely alongside your recovery plan; rotating `AUTH_SECRET` can invalidate sessions and encrypted provider credentials.

The mail outbox retries failed SMTP deliveries up to eight times with exponential delay. Watch `mail_outbox` for exhausted attempts. `/api/health` checks database connectivity; configure external uptime monitoring and disk/backup/SMTP alerts for public operation. Caddy access logging is intentionally off so verification URLs are not recorded. Server errors log codes, not financial request bodies or credentials.

## Validation

```sh
npm ci
npm test
npm run build
npm run test:integration
```

Integration tests require the local Docker stack and Mailpit, create unique test accounts, and exercise real PostgreSQL and SMTP, including verification, recovery, sessions, two-account file/data isolation, conflicting writes, CSRF, and deletion. They do not send real Internet email or test Google consent. Run browser checks with `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser.mjs` (Playwright and its Chromium installation are supplied separately). The restore-check command uses a fresh temporary database and deletes only that verification database when done.

## Production limits

A running local stack is not a public production launch. The live domain and HTTPS are configured. Optional Google credentials, email delivery, monitoring, offsite backup schedules, retention policy, and representative load tests remain operator setup. Snapshot writes are bounded but should be benchmarked before large-scale use. There is no universal scanned-PDF OCR, professional tax preparation, or CPA-level judgment. Accounts and data from the old Sites deployment are not automatically migrated; export a ledger backup and originals from that account, restore to your verified new account, and attach originals again.

## Bank accounts

Open [Accounts](https://ledger.chirayupatel.dev/accounts) from the sidebar, mobile navigation, Overview, or account settings to add or edit bank/institution, account nickname, type, and optional last four digits. Accounts use stable IDs, so renaming updates their statements and transactions without breaking duplicate detection. Full account numbers are not collected. INR is currently the only supported currency.

Imports select an existing active account or let you create one first. **Statements → Change account** moves an import and all its transactions while retaining the original file. Review overlapping imports after a move. Archive accounts to hide them from new import choices while retaining history; reactivate them to import again. Only empty accounts can be deleted.

Workspace pages have direct URLs. Login returns you to the requested page, and account/date filters survive refresh and browser Back/Forward navigation. The bank-account filter applies to transactions, summaries, reports, and the statement library. Account cards show all imported credits, debits, and net movement, including transfers; these are not bank balances. JSON backups include account metadata and IDs. Older backups and existing ledgers are upgraded automatically by migration 2; old open browser tabs must reload before saving. A pre-migration database backup is retained locally.

Run `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/bank-accounts-browser.mjs` to verify the live workflow using temporary test accounts that are removed afterward. This test does not use or change the owner's financial records.

## Repository

The private repository is [chirayupatel9/ledger](https://github.com/chirayupatel9/ledger). GitHub Actions checks types, parser/account validation, and production builds on pushes to `main` and pull requests. Deployment remains a separate Docker operation on this server. Credentials (`.env`, `.secrets/`), database dumps, generated builds, dependency folders, and test screenshots are excluded from version control and Docker build context.

## Readable transactions and inline editing

Transaction rows show a readable label with expandable original bank narration. A local parser recognizes explicit self transfers, UPI (including structured UP abbreviations), NEFT/IMPS/RTGS, card purchases, automatic payments, cheques, cash transactions, common merchants, and unambiguous name segments. It removes reference numbers, bank routing codes, and payment handles from labels, and preserves refund/reversal/failure markers. Ambiguous supported formats use a payment-channel label; unknown formats keep a shortened preview; the UI distinguishes suggestions, shortened narration, and your own labels. Bank data is not sent to an external language-model provider.

Use **Edit** on a transaction to change its readable name, category, cash-flow type, note, and review status in place. Save/Cancel work on desktop and mobile. Leaving a changed draft asks before discarding it; failed saves retain the draft, and conflicting edits require reviewing the current record before retrying. Date, signed amount, account, and original narration remain tied to the imported statement.

Custom names persist in PostgreSQL as optional transaction metadata. Search matches names, notes, and original reference numbers. CSV exports include both `description` (the bank narration) and `readable_name`; duplicate detection continues to use the original narration. Existing transactions gain readable labels automatically without rewriting their source records.

Run `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/transactions-browser.mjs` for live disposable-user tests of editing, concurrency, retry, search/export, duplicate detection, and mobile behavior.

## Indian bookkeeping features

- **Imports:** Excel (`.xls`/`.xlsx`, read in the browser with SheetJS), CSV and text-based PDFs. Column detection covers SBI, HDFC, ICICI, Axis and Kotak headers including `DR`/`CR`, `Dr / Cr`, `Withdrawal Amt.` and running balance columns. Excel date cells are read from their serial value, so US date formats cannot swap day and month. Separator, total and footer rows are skipped; unreadable rows that contain figures are still reported.
- **Credit card statements:** import a card PDF (or a CSV/Excel export) into an account of type **Credit card**. Single-amount layouts are read the way Indian card statements print them: charges unsigned or `Dr`/`D`, credits `Cr`/`C`, a leading `+`/`−` or brackets, with the amount as the rightmost value on the row. Serial-number, reward-point, merchant-category and foreign-amount columns are ignored. The previous balance due and total due are read whether printed beside their labels or in a row underneath, so the import check confirms previous due − payments + purchases = total due. Payments received are transfers; refunds, reversals and surcharge waivers are refunds; cashback is other income; finance charges, fees, forex markup and GST are Fees & charges (GST suggested as "GST paid"). EMI rows read "EMI 3 of 12 · Merchant". Card balances show as **Outstanding** (or **Credit balance**). A card statement uploaded to a bank account is flagged. On bank statements, card bill payments (`CC … AUTOPAY`, `CREDIT CARD`, CRED) are transfers.
- **Reconciliation:** each import shows the statement period and opening/closing balance (taken from the running balance, the file's header or typed in) and checks that opening + credits − debits = closing. Rows that break the running balance are listed before saving. Duplicates use date, narration, amount and, when both rows have one, running balance, so two identical UPI payments on the same day are not merged.
- **Books check** (Statements page): per account, a coverage bar, missing statement periods, balances that do not carry over between statements, per-statement differences, and the bank balance as of the latest statement. **Details** on a statement edits its period and balances. Overview and Accounts flag accounts that need attention.
- **Categories and tax:** Indian categories (Insurance, Loan EMI, Taxes, Fees & charges, Cash withdrawal, Dividends, Rental income, Donations, Education…) with direction-aware narration rules. Optional tax tags map transactions to ITR income heads and old-regime deduction sections (80C, 80CCD(1B), 80D, 80E, 80G, 24(b), HRA/80GG); suggestions come from narrations and can be confirmed or overridden. **Reports → Tax summary** totals them per financial year and exports a tax schedule CSV. Section names follow the Income-tax Act, 1961 (FY 2025-26); the Income-tax Act, 2025 renumbers them from tax year 2026-27. This is not a tax computation.
- **Productivity:** bulk edit (category, type, tax tag, reviewed), rules that can back-fill transactions still in review, and 200-row paging on Transactions.

## Security additions

- **Two-step verification** (TOTP with one-time backup codes) at `/security`, linked from **Your account & data**. Sign-in then asks for an authenticator code; devices can be trusted for 30 days; repeated wrong codes lock the account temporarily.
- Caddy sends a Content-Security-Policy with `default-src 'self'` and `connect-src 'self'`, so injected script cannot send data to another origin.

## Scheduled backups

The `backup` service wakes hourly. When the newest dump is older than `BACKUP_INTERVAL_HOURS` (default 24) it runs `pg_dump`, verifies the dump with `pg_restore --list`, writes `backups/scheduled-*.dump` (mode 0600) and keeps the newest `BACKUP_KEEP` (default 14). Manual `ledger-*.dump` files are never pruned.

**Backup drive (onsite second copy).** On this host, `.env` sets `COMPOSE_FILE=compose.yaml:deploy/compose.backup-drive.yaml`, which passes the external USB drive mounted at `/mnt/backup` (`/etc/fstab`, `nofail`) into the backup container. Every hour, each dump not yet on the drive is copied to `/mnt/backup/ledger/`, synced, compared byte-for-byte and checked with `pg_restore --list`. The newest `BACKUP_DRIVE_KEEP` (default 60) scheduled dumps are kept there, and manual dumps are kept indefinitely. Drop's backups live beside it in `/mnt/backup/drop`.

- The folder must already exist on the drive. If the drive is unplugged, the empty mount point has no `ledger` folder, so the service refuses to copy rather than writing to the system disk. Copies catch up automatically after the drive is mounted again; no restart is needed.
- `sudo docker compose ps` shows `backup` as unhealthy when either the local dump or the drive copy is older than the interval plus two hours. See why with `sudo docker compose logs --tail=20 backup`.
- To set up a new drive: mount it (add it to `/etc/fstab` with `nofail`), then run `sudo install -d -o $(id -u) -g $(id -g) -m 700 /mnt/backup/ledger`. Set `BACKUP_DRIVE` if it is mounted somewhere else.
- To prove a copy restores: `node deploy/restore-check.mjs /mnt/backup/ledger/scheduled-TIMESTAMP.dump`.
- The drive is not encrypted, and it sits beside the server. It protects against a failed system disk or an accidental deletion, not against theft, fire or an attacker on this machine. An offsite copy is still needed for those.

Run the live bookkeeping checks with `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/bookkeeping-browser.mjs`.
