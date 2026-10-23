# Ledger — self-hosted

This is the Docker edition of Ledger. It uses **Next.js / React**, a separate **NestJS / TypeScript API**, **PostgreSQL 18**, **Better Auth**, and **Caddy**. It has no Supabase, Cloudflare D1/R2, or Sites runtime dependency. The earlier Sites project remains separately in `../ledger`; this edition is in `ledger-selfhost`.

## Current deployment

- Live app: https://ledger.chirayupatel.dev
- Login: `chirayupatel911@gmail.com` (password, or Continue with Google)
- Generated password: `.secrets/owner-login.json` (mode 0600, excluded from Git and Docker builds).
- After signing in, use **Your account & data → Change password**. Changing a password revokes other sessions.
- Sign-up is invite-only (`SIGNUP_MODE=invite`): only addresses the owner adds under **Settings → Invitations** can create an account, by email or Google. See [Sign-up and invitations](#sign-up-and-invitations).
- Email (verification, password reset, invitations) is sent through Gmail SMTP. Google sign-in is configured.
- The owner account was provisioned and verified by the operator; verification requirements remain in place for other accounts.
- Everything runs on Indian Standard Time (`Asia/Kolkata`): every container and the database (`TZ`, PostgreSQL `timezone`), backup file names (e.g. `scheduled-2026-10-21T02-30-00+0530.dump`), logs, and the app itself, which uses IST for "today", the current financial year and every timestamp whatever the device's time zone. Timestamps are stored with their time zone, so nothing stored changes.

The existing host Cloudflare Tunnel routes this hostname to `http://127.0.0.1:5800`. Public traffic uses Cloudflare-managed HTTPS and an encrypted tunnel; the final HTTP hop stays on the same host. HTTP redirects to HTTPS and HSTS is enabled. The database/API/web ports remain private. The `drop` and `files` tunnel routes are preserved.

Use `sudo docker compose up -d --build` for updates on this host. **Do not use `deploy/compose.production.yaml` here**: that optional configuration is for direct Internet hosting without the tunnel. The tunnel route lives in `/etc/cloudflared/config.yml` with a pre-change backup at `/etc/cloudflared/config.before-ledger.yml`. Caddy trusts the current Docker gateway `172.18.0.1` for the Cloudflare client-IP header; update that explicit address if the Docker subnet changes. Do not expose the loopback origin port directly to the Internet.

Email settings are described under [Email](#email-password-reset). Google sign-in is optional and disabled without its credentials. The local Mailpit container is stopped.

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

Indian CSV, Excel, text-table PDF and scanned (image-only) PDF imports, preview and column mapping, exact paise amounts, categorization rules, review flags, income/expense summaries, transfers/refunds, duplicate detection, original statement downloads, activity history, and JSON/CSV export are retained. PDF parsing happens in the browser; confirmed data and originals persist in PostgreSQL, not browser storage.

Email/password signup requires email verification. Better Auth manages password hashing, database sessions, reset tokens, Google OAuth, origin protection, and database-backed authentication throttling. Password resets revoke sessions. API operations derive the owner from the verified session and scope every financial query by that owner. User-supplied ownership and gateway identity headers are ignored. Google and password sign-in are linked only for the same verified email address.

Ledger writes lock the user's database row and check the revision in one transaction. Upload quotas are checked under the same lock. Originals currently use PostgreSQL `bytea`, which keeps file deletion and ledger changes atomic and puts all records in one consistent database backup. This is deliberately simple for a single-server deployment; large installations should introduce private object storage through a storage service with a durable deletion queue. Limits: 20 MB/file, 1 GiB and 2,000 files/account, 25,000 transactions, 500 rules.

The UI preserves the existing browser-based finance renderer inside React. New pages can use React directly; replacing that renderer is a separate UI refactor. Nest controllers, authentication, storage, and validation are separate modules. The database uses versioned application migrations and the pinned authentication library's schema migration API.

## Google and public hosting

1. Choose a domain pointing to this server. Set `APP_ORIGIN=https://your-domain` and `SITE_ADDRESS=your-domain` in `.env`.
2. Configure a real SMTP sender: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM`. Verify your sender domain and test delivery. Mailpit is a local test inbox, not an Internet mail service. With email enabled, public startup rejects absent SMTP credentials. Public startup always rejects plain HTTP origins.
3. Create a Google OAuth web client with redirect URI `https://your-domain/api/auth/callback/google`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. For local testing, use `http://localhost:5800/api/auth/callback/google` in a development OAuth client. Keep credentials out of version control.
4. Start with `sudo docker compose -f compose.yaml -f deploy/compose.production.yaml up -d --build`. This publishes ports 80/443 and Caddy provisions TLS. Stop local Mailpit when no longer needed: `sudo docker compose --profile local stop mailpit`.
5. Verify real email signup/recovery, Google login with two accounts, per-user isolation, and HTTPS cookies before inviting users.

The existing `chatgpt.site` URL cannot host these Docker containers. Use this machine's localhost URL now and your own domain for public hosting.

## Sign-up and invitations

`SIGNUP_MODE` in `.env` decides who can create an account (recreate the API container after changing it):

| Mode | Who can create an account |
| --- | --- |
| `closed` (default) | Nobody. Accounts are created by the operator with `apps/api/src/create-account.ts`. |
| `invite` | Only email addresses on the invitation list, by email/password or Google. |
| `open` | Anyone. Not recommended until the items in `docs/PRODUCTION-READINESS.md` are done. |

The workspace owner (the first verified account, recorded in `workspace_owners`) manages the list under **Settings → Invitations**. Adding an address emails an invitation with a sign-up link (when email is on). Each invited person gets a separate, empty ledger and cannot see anyone else's. Removing an invitation stops a pending sign-up; it does not delete an account that already exists. The rule is checked when the account is created, so the sign-up form, the API and Google sign-in all obey it. Email/password sign-up also needs email delivery, because the address must be verified.

Google sign-in notes: an account with two-step verification on still enters its authenticator or backup code after Google, exactly as after a password (a device trusted for 30 days skips it). Accounts without two-step verification sign straight in. An account created with a password can also sign in with Google: the first Google sign-in links the two, but only when Google and Ledger have both verified the same email address. Different addresses are never linked.

## Operations and backups

Each web build puts the workspace scripts, styles, lazy importers and PDF workers under one content-hashed `/assets/<release>/` directory. Changing any dependency changes the entire release's URLs, so browser/CDN caches cannot mix the new app with an older parser. Generated assets are excluded from Git and Docker build inputs. After deployment, reload an already-open tab to use the new release.

```sh
sudo docker compose ps
sudo docker compose logs --tail=100 api
node deploy/backup.mjs
node deploy/restore-check.mjs backups/ledger-TIMESTAMP.dump
```

Backups contain account information, original bank statements, and pending email links. Store encrypted copies off this host, restrict access, schedule backups, and test restoration. The backup command creates a private PostgreSQL custom-format dump under `backups/`. Restore into a **new empty database first** using `pg_restore --exit-on-error --no-owner`; compare ledger revisions, row counts, and original bytes before considering a production restore. Never restore over a live database casually. Preserve `.env` secrets securely alongside your recovery plan; rotating `AUTH_SECRET` can invalidate sessions and encrypted provider credentials.

The mail outbox retries failed SMTP deliveries up to eight times with exponential delay. Watch `mail_outbox` for exhausted attempts. `/api/health` checks database connectivity; configure external uptime monitoring and disk/backup/SMTP alerts for public operation. Caddy access logging is intentionally off so verification URLs are not recorded. Server errors log codes, not financial request bodies or credentials.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to main and every pull request (and by hand):

- **check**: unit tests, type checks and the production build.
- **stack**: builds the production Docker images and starts the local stack on the runner (`deploy/setup.mjs` with open sign-up and throwaway secrets, `docker compose --profile local`), then runs the integration test (real PostgreSQL and SMTP through Mailpit) and the transactions, settings, history and budgets browser suites against it (`LEDGER_URL=http://localhost:5800`). Every browser suite takes its address from `LEDGER_URL` (a unit test checks this), so CI never touches the live site.

**Deployment (CD).** When both jobs pass on a push to main, the **deploy** job runs on a self-hosted runner on the production server (labels `self-hosted, ledger-deploy`; installed in `~/actions-runner-ledger` as a systemd service, running as the server user). It runs `deploy/deploy.sh --ci <commit>`, which:

1. waits for the production lock (`/tmp/ledger-production.lock`, shared with sessions and the live suites);
2. refuses if the main checkout is not on main, has uncommitted changes, or has commits that are not on origin/main, and skips if production already runs that commit (or a newer one that includes it), recorded in `~/.local/state/ledger-deploy/deployed`;
3. fast-forwards the main checkout, takes a database backup (`deploy/backup.mjs`) and keeps the running images as `ledger-api:rollback` and `ledger-web:rollback`;
4. builds and starts the new version (`docker compose up -d --build`) and checks `/api/health` and the sign-in page;
5. if that fails, puts the previous images back (`docker compose up -d --no-build`), checks again, sends a phone alert through ntfy (`NTFY_URL`), and fails the job. Database migrations are not undone; they are additive.

Deploy by hand with `deploy/deploy.sh` from the main checkout (same steps, for what the checkout has now). `LEDGER_TEST_UNHEALTHY=1 LEDGER_NOTIFY=0 deploy/deploy.sh` rehearses a rollback without an alert. Deployments are listed under the repository's **production** environment on GitHub.

A local stack delivers email for reserved test domains (`.test`, `.example`…) to Mailpit; a public deployment records it but never sends it.

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

Click a column heading on Transactions (Transaction, Date, Category / type, Status, Amount) to sort by it, and again to reverse it; the **Sort** menu does the same and is the way to sort on a phone. Amount sorts by size, money in or out; name and category sort A–Z; Status puts Needs review first. Sorting works with the filters and search, applies to the CSV export, and is remembered on that device.

To name several at once (for example, from **Needs review**), select them and type a **Title…** in the bulk bar; the selected transactions' current titles are offered as suggestions. It applies together with any category, type, tax tag or tag changes, and *Mark reviewed* decides whether they leave Needs review.

Custom names persist in PostgreSQL as optional transaction metadata. Search matches names, notes, and original reference numbers. CSV exports include both `description` (the bank narration) and `readable_name`; duplicate detection continues to use the original narration. Existing transactions gain readable labels automatically without rewriting their source records.

Run `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/transactions-browser.mjs` for live disposable-user tests of editing, concurrency, retry, search/export, duplicate detection, and mobile behavior.

## Whom a UPI payment went to

A UPI narration names the person or shop you paid (or who paid you), their UPI ID and the note you typed, in a different order at each bank (`parseUPI` in `packages/domain/transaction-labels.js`):

| Bank | Narration |
| --- | --- |
| ICICI | `UPI/RAMESH KUMAR/ramesh@ybl/Rent/YES BANK LIMITED/628512345678/YBL…` |
| HDFC | `UPI-RAMESH KUMAR-ramesh@ybl-YESB0000001-628512345678-Rent` |
| SBI, IDFC, Yes | `UPI/DR/628512345678/RAMESH KUM/YESB/ramesh@yb/Rent` |
| Axis | `UPI/P2A/628512345678/RAMESH KUMAR/Rent/YES BANK` |
| Kotak | `UPI/RAMESH KUMAR/628512345678/Rent` |

Fields are recognised by what they look like (a UPI ID, the 12-digit reference, an IFSC or bank name, even when cut short to fit the column), so the payee becomes the transaction's name ("Ramesh Kumar") and the UPI ID and your note show underneath. Default notes the apps fill in ("UPI", "Payment from PhonePe", "Collect request"…) are not shown. Shops are named by brand, including their legal names (Bundl Technologies → Swiggy, Avenue Supermarts → DMart, Kiranakart → Zepto, One97 → Paytm). With no name in the narration, the UPI ID itself is used; only a narration with neither stays "UPI payment". Your own names and title rules still come first, and the original narration never changes.

## Categories learned from payees

Ledger remembers the category you use for each payee: its UPI ID, and its title, separately for money out and money in (`packages/domain/learn.js`). It learns from settled transactions (not in Needs review, not Uncategorized, not a linked transfer) when one category is clearly the usual one (at least two thirds of them). Generic titles such as "UPI payment" teach nothing.

- **On import** (and for a UPI message or bill added from the phone), a row takes the category you use for that payee. Seen twice or more before, it is settled; seen once, it still waits in Needs review. Your own category rules come first.
- **In Needs review**, a row shows the learned category as a suggestion (*Groceries? Use it*), and **Use N suggested categories** takes them all.
- **When you change a transaction's category**, the message offers to put the same payee's other transactions in it too.

## Monthly budgets

**Budgets** on the dashboard (Set budgets / Edit budgets) holds a monthly limit for any spending category and for all spending, in rupees (`budgets` in the ledger; `packages/domain/budgets.js`). Spending counts expenses after refunds, as on the dashboard; transfers and investments do not count. The editor shows last month's spending for each category as a guide. The card shows each budget for this month (or the month chosen at the top): spent, left or over, and a status: *On track*, *On pace to go over* (from the first week, if the month's pace would pass the limit), *Nearly used* (80% or more) or *Over*. A row opens that category's transactions for the month. Budgets over or nearly used lead the dashboard's *What changed* notes. Hide the card with Customize or Settings → Dashboard components.

## Undo and change history

Every save keeps the ledger as it was before it (`ledger_versions`, the last 30 per account). Right after a change, the message at the bottom offers **Undo**; after an undo it offers **Redo**. **Ctrl+Z** (⌘Z on a Mac), outside a text box, undoes the latest change. **Change history** (the clock in the header, or Settings → Change history & undo) lists the last 30 changes: undo the latest, or go back to before an earlier one, which also undoes every change after it. Going back is a change of its own, so it can be undone. A statement original or receipt photo you removed is still deleted straight away; undoing that change brings everything else back and says the file could not come back. Starting over (removing everything) clears the history. `POST /api/ledger/restore {revision, to}` restores the version saved at revision `to`; `GET /api/ledger/history` lists them. Run `tests/history-browser.mjs` for the live checks.

## Tags

A transaction can carry any number of tags (up to 20, each up to 40 characters, no commas), for things that cut across categories and accounts: a trip, a project, what you will claim back. Tags match whatever their case, and the spelling already in your ledger is reused.

- **Edit** on a transaction has a Tags box: type a tag and press Enter or a comma (or pick a suggestion); × or Backspace removes one.
- Select several transactions and use **Add tags…** or **Remove tag…** in the bulk bar.
- Tags show as chips under the transaction's name. Click one, or use the tag filter, to see every transaction with that tag (or *Untagged*); search also finds `#tag`.
- **Tags** on Transactions lists every tag with its count and spend, and renames (renaming onto an existing tag merges them), deletes or shows each one.
- **Spending by tag** on Reports totals each tag for the chosen period and accounts (spent after refunds, and money received). A transaction with several tags counts under each.
- CSV exports have a `tags` column. Tags are kept when a statement row replaces a transaction added from your phone.
- **Tag rules** (in the Tags window): *narration contains*, *narration is exactly* or *title is* some text → a tag. They tag statement imports and phone entries as they arrive, and a new rule can also tag the matching transactions you already have (the form shows how many). Renaming a tag renames it in its rules; deleting a tag removes its rules; removing a rule leaves the tags where they are.

Tags are stored on each transaction (`tags` in the ledger, checked by `validTags` in `packages/domain/tags.js`). Run `tests/tags-browser.mjs` for the live checks.

## Indian bookkeeping features

- **Imports:** Excel (`.xls`/`.xlsx`, read in the browser with SheetJS), CSV and text-based PDFs. Column detection covers SBI, HDFC, ICICI, Axis and Kotak headers including `DR`/`CR`, `Dr / Cr`, `Withdrawal Amt.` and running balance columns. Excel date cells are read from their serial value, so US date formats cannot swap day and month. Separator, total and footer rows are skipped; unreadable rows that contain figures are still reported.
- **Numbered savings-account PDFs:** transaction-history exports with `S No.`, `Transaction Date`, `Cheque Number`, `Transaction Remarks`, `Withdrawal`, `Deposit` and `Balance` are supported, including multi-line headers, repeated page headers, dotted dates and wrapped narrations above/below the amount row. Large values use their right-aligned column position to distinguish deposits from withdrawals. Missing table pages, numbering gaps and unreadable rows are reported; running balances are checked before saving.
- **Credit card statements:** import a card PDF (or a CSV/Excel export) into an account of type **Credit card**. Single-amount layouts are read the way Indian card statements print them: charges unsigned or `Dr`/`D`, credits `Cr`/`C`, a leading `+`/`−` or brackets. The amount is taken from under the **Amount** column header (whole-rupee values included), or the rightmost value when there is no header; the row date is found in the Date column even when chart labels sit beside it. Serial-number, reward-point, merchant-category and foreign-amount columns are left out of descriptions. The bank's reference number is kept, so the same statement imported in two formats (for example ICICI's app "last statement" and its e-statement PDF) is flagged as duplicates even though the narrations differ. Wallet top-ups (Amazon Pay, Paytm) are transfers. The previous balance due and total due are read whether printed beside their labels or in a row underneath, so the import check confirms previous due − payments + purchases = total due. Payments received are transfers; refunds, reversals and surcharge waivers are refunds; cashback is other income; finance charges, fees, forex markup and GST are Fees & charges (GST suggested as "GST paid"). EMI rows read "EMI 3 of 12 · Merchant". Card balances show as **Outstanding** (or **Credit balance**). A card statement uploaded to a bank account is flagged. On bank statements, card bill payments (`CC … AUTOPAY`, `CREDIT CARD`, CRED) are transfers.
- **SIP and mutual fund reports:** import a distributor, CAMS/KFintech or platform transaction report (Excel or CSV with Scheme, Transaction Type, Amount, Units/NAV/Folio and Stamp Duty columns) into an account of type **Investment**. Purchases, SIPs and switch-ins are money in, booked at the amount your bank debited (amount + stamp duty) with the stamp duty as its own Taxes charge; redemptions, SWPs and switch-outs are money out. Descriptions keep the scheme, folio, units and NAV, and titles read "Scheme · SIP Purchase". If the report has a Total row, the import checks that the rows add up to it. A fund report uploaded to a bank account is flagged.
- **Mutual fund CAS PDFs:** the Consolidated Account Statement from CAMS or KFintech (see [Investments](#investments-sips-and-mutual-funds)) imports into an account of type **Investment** in the same format as a fund report. Enter the CAS password in the PDF password field.
- **Investments and transfers:** after the import, Ledger proposes linking each purchase to its bank debit (NSE/BSE Clearing, AMC, CAMS/KFin, broker narrations). Identical SIPs on the same day (for example six ₹25,000 debits and six ₹25,000 purchases) are paired one-to-one automatically, since any pairing is equally correct. Investment debits only match an Investment account, never a card payment or a self transfer, and linked pairs stay in the Investments category.
- **Reconciliation:** each import shows the statement period and opening/closing balance (taken from the running balance, the file's header or typed in) and checks that opening + credits − debits = closing. Rows that break the running balance are listed before saving. Duplicates use date, narration, amount and, when both rows have one, running balance, so two identical UPI payments on the same day are not merged.
- **Books check** (Statements page): per account, a coverage bar, missing statement periods, balances that do not carry over between statements, per-statement differences, and the bank balance as of the latest statement. **Details** on a statement edits its period and balances. Overview and Accounts flag accounts that need attention.
- **Categories and tax:** Indian categories (Insurance, Loan EMI, Taxes, Fees & charges, Cash withdrawal, Dividends, Rental income, Donations, Education…) with direction-aware narration rules. Optional tax tags map transactions to ITR income heads and old-regime deduction sections (80C, 80CCD(1B), 80D, 80E, 80G, 24(b), HRA/80GG); suggestions come from narrations and can be confirmed or overridden. **Reports → Tax summary** totals them per financial year and exports a tax schedule CSV. Section names follow the Income-tax Act, 1961 (FY 2025-26); the Income-tax Act, 2025 renumbers them from tax year 2026-27. This is not a tax computation.
- **Transfers between your accounts:** after every import Ledger checks whether the new rows are the other side of a transfer already in your books, and if so opens the linking dialog straight away (nothing is linked until you confirm). Overview shows a reminder while linkable transfers remain, and **Reports → Transfers between your accounts** shows linked money out, in and the net (₹0 across all accounts when both sides are linked), plus any unlinked transfers. **Transactions → Find transfer pairs** proposes a debit in one account and a credit of the same amount in another within 3 days, when at least one side is a Transfer or both narrations share a reference number (UPI RRN, NEFT/IMPS UTR). Narrations are re-read with the current rules, so a `Self … INFT/NEFT/IMPS/UPI … Self` debit counts as a transfer even if it was imported as an expense, and investment debits (NSE/BSE Clearing, brokers, mutual funds) never match a bank or card account unless the other side is an account of type Investment. Mutually best matches are pre-ticked; when several matches are equally likely, the dialog shows them as a choice (with each original narration) so you pick the right one or decide later. Confirming links both legs and marks them reviewed Transfers. **Edit → Linked transfer** links or unlinks a leg by hand. Linked rows show “Transfer to/from <account>”, the type filter has **Unlinked transfers**, the Statements books check notes unlinked transfers per account, and CSV exports include `linked_account`. The server keeps a link only as exactly two Transfer legs of equal and opposite amounts in different accounts; anything else (for example after a statement is removed) is unlinked rather than rejected.
- **Recurring payments and income** (Reports): the same payee in the same account at a weekly, monthly, quarterly or yearly interval (three occurrences, two for yearly; one skipped month allowed). Shows the typical amount, monthly-equivalent cost, next expected date, and series whose expected payment falls inside the dates your statements cover but is missing. Generic UPI/NEFT labels only group at an identical amount; same-day repeats and irregular orders are not series. Click a payee to see its transactions.
- **Productivity:** bulk edit (category, type, tax tag, reviewed), rules that can back-fill transactions still in review, and 200-row paging on Transactions.

## Security additions

- **Two-step verification** (TOTP with one-time backup codes) at `/security`, linked from **Your account & data**. Sign-in, by password or Google, then asks for an authenticator code; devices can be trusted for 30 days; repeated wrong codes lock the account temporarily.
- Overview shows a reminder until two-step verification is turned on.
- Caddy sends a Content-Security-Policy with `default-src 'self'` and `connect-src 'self'`, so injected script cannot send data to another origin.

## Scheduled backups

The `backup` service wakes hourly. When the newest dump is older than `BACKUP_INTERVAL_HOURS` (default 24) it runs `pg_dump`, verifies the dump with `pg_restore --list`, writes `backups/scheduled-*.dump` (mode 0600) and keeps the newest `BACKUP_KEEP` (default 14). The additional two-hour health grace does not delay the next backup. Manual `ledger-*.dump` files are never pruned.

**Backup drive (onsite second copy).** On this host, `.env` sets `COMPOSE_FILE=compose.yaml:deploy/compose.backup-drive.yaml`, which passes the external USB drive mounted at `/mnt/backup` (`/etc/fstab`, `nofail`) into the backup container. Every hour, each dump not yet on the drive is copied to `/mnt/backup/ledger/`, synced, compared byte-for-byte and checked with `pg_restore --list`. The newest `BACKUP_DRIVE_KEEP` (default 60) scheduled dumps are kept there, and manual dumps are kept indefinitely. Drop's backups live beside it in `/mnt/backup/drop`.

- The folder must already exist on the drive. If the drive is unplugged, the empty mount point has no `ledger` folder, so the service refuses to copy rather than writing to the system disk. Copies catch up automatically after the drive is mounted again; no restart is needed.
- `sudo docker compose ps` shows `backup` as unhealthy when either the local dump or the drive copy is older than the interval plus two hours. See why with `sudo docker compose logs --tail=20 backup`.
- This host uses `x-systemd.automount,x-systemd.device-timeout=60s,nofail` on the existing UUID-based `/mnt/backup` entry in `/etc/fstab`. Access triggers mounting even if the disk was slow to appear at boot. Apply this configuration idempotently with `sudo python3 deploy/configure-backup-mount.py`; it backs up fstab and reloads systemd without interrupting mounted disks. If the disk is currently unmounted, run `sudo systemctl start mnt-backup.automount` and access `/mnt/backup/ledger`. An absent or failed drive still raises a backup alert.
- Verified copies preserve the source dump's modification time, so copying an old backup cannot make its data appear fresh. After changing `deploy/backup-loop.sh`, restart the worker with `sudo docker compose restart backup`.
- To set up a new drive: mount it (add it to `/etc/fstab` with `nofail`), then run `sudo install -d -o $(id -u) -g $(id -g) -m 700 /mnt/backup/ledger`. Set `BACKUP_DRIVE` if it is mounted somewhere else.
- **Encryption:** drive copies are encrypted with GnuPG (AES-256) using the passphrase in `.secrets/backup-drive-key` (mounted read-only into the backup container). Keep a copy of that passphrase in your password manager: without it the drive copies cannot be restored. Each copy is checked by decrypting it back to identical bytes and listing it with `pg_restore`. To restore, set `umask 077`, then run `gpg --batch --pinentry-mode loopback --passphrase-file .secrets/backup-drive-key -d /mnt/backup/ledger/FILE.dump.gpg > restore.dump` and `node deploy/restore-check.mjs restore.dump`. The check restores into a temporary database and compares against the live database, so use a fresh backup without intervening ledger writes. Remove the decrypted temporary dump afterward.
- The drive sits beside the server. It protects against a failed system disk or an accidental deletion; encryption protects a lost or stolen drive. It does not protect against fire or an attacker on this machine: an offsite copy is still needed for those.

Run the live bookkeeping checks with `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/bookkeeping-browser.mjs`.

## Alerts

The `monitor` service checks every `MONITOR_INTERVAL_MINUTES` (default 5) and sends an ntfy push when something fails and when it recovers, with a reminder every 12 hours while it stays failing:

- the public site (`APP_ORIGIN/api/health`, through Cloudflare);
- a scheduled backup newer than the backup interval plus two hours;
- an encrypted copy on the backup drive that recent (and whether the drive is mounted);
- free space below 10% on the server disk or the backup drive.

Messages name the failing check only. Install the ntfy app and subscribe to the topic in `NTFY_URL` in `.env` (the topic name is the only secret; keep it private). Send a test with `sudo docker compose exec monitor node /monitor/monitor.mjs test`. A machine that loses power or network cannot report itself; that needs a check from another machine.

## Dashboard insights and report charts

Computed in the browser from your ledger (`packages/domain/insights.js`, drawn by `public/charts.js` as plain SVG, no chart library). They follow the account filter; time charts cover the selected month or financial year, otherwise the last 12 months up to your latest transactions.

- **Dashboard** (each can be turned off in Settings → Dashboard components): *What changed* notes (biggest category change on last month, savings rate, largest expense, a new regular payment, something unusual); **Net worth** at each month end (bank balances from running balances or confirmed closing balances, card balances owed, investments at the amount invested and at today's value for the latest month); **Coming up**: regular payments due in the next 30 days and the bank balance after them; **Spending by category** each month; **Savings rate** each month; **Tax-saving progress** for the financial year against old-regime limits (80C ₹1.5 L, 80CCD(1B) ₹50,000, 80D ₹25,000, 24(b) ₹2 L) from your tax tags.
- **Reports**: top payees, how you pay (UPI, card, bank transfer, auto-debit, cash, cheque) each month, where the month went (opening balance → income → spending by category → invested → closing balance), unusual payments (far above the usual for that payee, possible double charges, price rises), account balances and credit-card amounts owed over time, and a 26-week spending calendar with weekday averages.
- **Investments**: allocation by fund (today's value where known), SIP vs lump sum, and invested vs worth per fund.

Accounts with no known balance (no running balance and no confirmed closing balance) are left out of net worth and balances, and named under the chart.

**Interactive.** Hover over a chart (or tap it on a phone) to see the exact figures for that month, day or part; on charts with lines or stacked bars, every series' value for the month is listed. Click a bar, a part of a ring, a legend row, a calendar day, a top payee or a step of *Where the month went* to open Transactions filtered to it: that month (and money in or out), that category, that day, that payee. On a phone the first tap pins the tooltip, with *See these transactions* and, for a stacked month, each part as its own button. In a legend with several series (net worth, balances, spending by category, how you pay, money in and out), click a name to switch that series off or on; the axis rescales. Charts take keyboard focus: the arrow keys move between months (in the calendar, left and right move a week, up and down a day), Enter opens the transactions and Escape closes the tooltip. Transactions has a category filter, and a day filter shown as a chip you can clear.

## Make the dashboard and Reports your own

**Customize** (on the dashboard and on Reports) lists the cards: tick to show or hide them, and move them up or down. The layout is saved in your preferences (`dashboardOrder`, `reportsOrder`, `reportsHidden`, validated against the known cards in `packages/domain/preferences.js`), so it is the same on every device; *Reset to default* restores it. Dashboard cards use the same switches as Settings → Dashboard components. Cards you have not placed (for example, new ones in a later release) appear in their default spot.

**Not recurring.** A payment Ledger takes for a regular one can be marked *Not recurring* from the recurring list on Reports or from Coming up on the dashboard. It is then left out of the recurring list, Coming up, the "new regular payment" note and price-rise alerts (`recurringDismissed` in the ledger, by the series key). *N marked not recurring* on the recurring list shows them, each with *It is recurring* to bring it back.

## Investments (SIPs and mutual funds)

The **Investments** page (`/investments`) brings together two sources (`packages/domain/investments.js`):

- **Fund reports** imported into an account of type Investment (the SIP or mutual fund transaction report from a distributor, CAMS or KFintech, or the CAS PDF). Each fund shows money invested (with stamp duty), redemptions, units, average NAV and value at the latest NAV in the reports. Units and value count only the imported transactions, so import reports from the first purchase, or a [CAS since inception](#consolidated-account-statement-cas), for complete holdings; a fund whose report redeems more units than it bought shows no value.
- **Bank debits** categorised as Investments (SIPs through NSE Clearing, ICCL, BSE or a fund house). The same payee and amount about a month apart is listed as a SIP.

A bank debit linked to a fund purchase is counted once. SIPs show their day of the month, instalments and next due date; a SIP is flagged as missed or stopped only when the imported reports or statements reach past its due date. The page also shows invested this financial year (IST), monthly totals for the last 12 months and which bank payments are not yet matched to a fund report.

### Consolidated Account Statement (CAS)

For complete holdings, import the detailed CAS PDF from CAMS or KFintech (both cover every fund house) for the period **since inception**, into an account of type Investment. It is password-protected: enter the password you set when you requested it in **PDF password**. The PDF is read in the browser (`apps/web/public/cas.js`):

- Each scheme section gives the folio, the scheme name (its code, advisor and registrar are left out), its ISIN, the opening unit balance, the dated rows and the closing unit balance. Rows are written as a fund report's, plus the ISIN after the scheme so live NAVs match the fund exactly: `SIP Purchase · Scheme · ISIN INF000A01AA1 · Folio 123/45 · 13.027 units @ ₹1918.97`, Investments, Transfer. The Investments page reads them unchanged. Purchases, SIPs, switch-ins, STP-ins and dividend reinvestments are money in at the amount your bank paid (amount + stamp duty), with `Stamp duty · Scheme · Folio` as its own Taxes charge. Redemptions, switch-outs, STP-outs and SWPs are money out at what reached your bank (amount − STT), with `STT · Scheme · Folio` as its own charge (not income tax). The direction comes from the units, checked against the running unit balance, so a purchase that removes units is a reversal.
- IDCW (dividend) payouts don't change units and are left out: the money is recorded from your bank statement. Notes such as address changes are skipped, and rows that cannot be read are listed.
- **Unit check:** for every scheme, the units are read back from the new rows (the way the Investments page reads them) and added to the opening balance; the review shows whether each scheme reaches the closing unit balance printed on the CAS, and which rows break the running unit balance. A scheme that starts the period with units is pointed out: request a CAS since inception so the Investments page counts them.
- **Already imported:** a row with the same date, folio (before the `/`), direction and units as a fund row already in the account (stamp duty: the same amount) is a duplicate and unchecked, even when the report words the scheme differently. The CAS rows then take the scheme name already in your ledger, so a fund is not split in two. Import a CAS over a distributor's report and only the missing months are added.

Run the live check with `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/cas-import-browser.mjs`. To check a real CAS without uploading it, add `LEDGER_PREVIEW_CAS=/path/to/cas.pdf LEDGER_PREVIEW_PASSWORD=…`: it is previewed in the browser only and only counts are printed. Never commit a real statement; the tests use a synthetic one (`tests/fixtures/cas-statement.mjs`).

### Today's NAVs, gain and XIRR

Each fund is valued at today's official NAV from AMFI when it is matched to an AMFI scheme, with the NAV date shown. Otherwise it keeps the value at the latest NAV in the reports. Gain is that value plus redemptions minus what you paid (with stamp duty). XIRR is the annualised return of the dated purchases, redemptions and the value on the NAV date, with 365-day years as in a spreadsheet's XIRR. The top tile adds these up across funds and says how many funds use today's NAV. Units still count only the imported transactions.

- **Where NAVs come from:** the API downloads AMFI's [NAVAll.txt](https://www.amfiindia.com/spages/NAVAll.txt) at 23:30 and 10:00 IST. It also downloads at startup when the last update is over 20 hours old. A failed download is retried after 1 minute, doubling to every hour, and never delays or stops the API. Logs give the error type and HTTP status only. The latest NAV per scheme (code, ISINs, name, plan, option, fund house, category, NAV, date) is kept in the `fund_navs` table (migration 6). This is public data shared by every account, about 14,000 rows. `AMFI_NAV_URL` in `.env` points the download elsewhere, for example a test file. The browser never contacts AMFI (the CSP allows `connect-src 'self'`). `GET /api/navs` (signed in) answers for the schemes in your own ledger only, and `GET /api/navs/search?q=` searches schemes by name, AMFI code or ISIN.
- **Matching** (`packages/domain/navs.js`): an ISIN in the report (`· ISIN INF… ·` in the description) decides the match. Otherwise the scheme name is compared word for word with punctuation, "Plan"/"Option" and "Fund" ignored, and former names ("(erstwhile …)") also count. The plan (Direct or Regular) and option (Growth, IDCW, or Dividend as its old name, Bonus) must be the same. An IDCW frequency (daily, monthly…) and payout or reinvestment pick among IDCW options. A fund is matched automatically only when exactly one scheme fits. Otherwise the fund shows "N AMFI schemes could be this fund" or "No AMFI scheme with this name". It then offers a picker with the likeliest schemes first (nearest to your report's NAV where AMFI lists them without plan or option), a search, and **Don't match this fund**.
- **Your choice** is saved in the ledger as `fundMatches` (scheme name → AMFI code, or none). There is one choice per scheme name, across folios and accounts. The server validates and merges it like preferences, so an older open tab that does not know the field keeps it. Choose again from any fund row (**Change** / **Not right?**). An AMFI NAV older than your report's is not used.

Live check (synthetic disposable account; the page runs against a stubbed NAV source, and the real endpoints are checked against AMFI data): `PLAYWRIGHT_MODULE=… node tests/nav-browser.mjs`.

## On your phone: the app, UPI messages and bill photos

**Install.** Ledger is a progressive web app (`app/manifest.ts`, `public/sw.js`). On Android, open it in Chrome and choose *Install app*; on iPhone, Safari → Share → *Add to Home Screen*. Settings → *Ledger on your phone* shows the right steps and an *Install* button when the browser offers one. The phone bar holds Overview, Transactions, **Add**, Investments and More (the other pages).

**Add from a UPI or bank message.** Paste an SMS or app notification (HDFC, ICICI, SBI, Axis, Kotak and card formats, GPay/PhonePe notifications). `packages/domain/capture.js` reads the amount, direction, account (by its last digits), date, payee and UPI reference. The same UPI reference is a certain match; otherwise the same amount within three days, named account first. A match gets the payee as its name and the reference; with no match, the payment is added now (`source: "message"`, no statement) and the statement's own row replaces it on import, keeping its name, note, tax tag and receipts. The message itself is not stored.

**Add a photo of a bill.** Take or choose a photo; it is shrunk to a JPEG and read **on the device** with Tesseract (served from `public/ocr/tesseract-7.0.0/`, about 7 MB, downloaded the first time a bill is read and kept by the service worker). Ledger finds the total, date and shop, suggests the payment (same amount within a rupee, within five days) and attaches the photo as a receipt, stored privately with `POST /api/files` and deleted when it is removed from every transaction. A bill whose payment has not arrived yet waits in the inbox (shown on the overview) or can be added as a new payment.

**PDF invoices.** *Choose a photo or PDF* also takes PDF invoices (Amazon, Swiggy, utilities…). Ledger reads the text inside the PDF with pdf.js, or reads it with the same on-device OCR if the PDF is a scan, finds the total (grand total, invoice value, order total, amount payable…), the date and the seller (a *Sold by* line), and keeps the original PDF as the receipt, shown with a picture of its first page. Password-protected PDFs need the password removed first. PDFs can also be shared to Ledger on Android.

**Share to Ledger (Android).** The installed app is a share target: share a bank SMS, a bill photo or a PDF invoice to Ledger and it opens in Add. The service worker keeps the shared item on the device until the page picks it up; if it is not running yet (first launch), Ledger asks to share again.

Security notes: the CSP allows `'wasm-unsafe-eval'` (WebAssembly compilation only, needed by the bill reader), and `Permissions-Policy` allows the camera for Ledger itself only (`camera=(self)`). The service worker never caches `/api` responses or pages.

## Scanned statements

A PDF statement with no text inside (a scan, or a statement printed to images) is read **on the device** with the same Tesseract OCR as bill photos. Each page (up to 20) is drawn with pdf.js and read word by word; the words are grouped into rows by position and passed to the normal bank and card parsers, so column detection, running balances and the opening/closing reconciliation work as for any PDF (`ocrLines` and `readScannedPages` in `public/pdf.js`). The import review says the statement was a scan; check every row and the balances against the original. Longer scans need splitting, or use the bank's Excel or CSV download.

## Statements that cannot be read

When an import fails, Ledger emails `IMPORT_ALERT_EMAIL` (set in `.env`; currently the owner's Gmail) so the parser can be extended. It reports:

- a file that could not be read (for example, a CSV or spreadsheet without a transaction table, or a damaged PDF);
- a PDF that yields no transactions, or a mapped CSV/Excel file that yields none;
- a statement where some rows could not be read and were left out;
- a file type Ledger does not open (for example `.ofx`).

The email describes the file only: its name, type, page count and size, the bank it appears to be from (the bank named first on a PDF's first page), the bank account it was imported into, the column names found, the parser's error and notes, how many rows were read, and who imported it and when. The statement is not attached and nothing from its rows is included; failed files are never saved. Share the original file to have the parser updated. A wrong or missing PDF password and the 150-page limit are not reported.

Each file is reported once per kind of failure (re-reported after 7 days if it still fails), with at most 20 reports per person per day. The person importing sees that the administrator was told. Leave `IMPORT_ALERT_EMAIL` empty to turn reports off; they also need email delivery on. Reports from test accounts at reserved domains (`.test`) are recorded but never sent.

## Email (password reset)

Every email (invitation, email verification, password reset, unreadable-statement report) uses one branded layout from `packages/domain/emails.js`: an HTML version styled like the sign-in page, plus a plain-text version for mail apps that prefer it.

Email is off until SMTP credentials are set. Sending email does not open sign-up: that is set by `SIGNUP_MODE` (see below). For Gmail, create an app password (Google Account → Security → 2-Step Verification → App passwords), then set in `.env`:

```
MAIL_DELIVERY_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@gmail.com
SMTP_PASSWORD=<16-character app password>
MAIL_FROM=Ledger <you@gmail.com>
```

and recreate the API (`sudo docker compose up -d api`). Your Ledger login address must be a mailbox you can read: `ledger.chirayupatel.dev` has no mail server.

## Settings and transaction titles

**Theme.** Light and dark use one set of colour tokens (`--surface`, `--surface-2…4`, `--line`, `--line-strong`, `--text`, `--text-2`, `--text-3`, `--accent-ink`/`-soft`/`-line`, and `--warn-*`, `--danger-*`, `--info-*`) defined at the top of `public/styles.css`, with dark values under `:root[data-theme=dark]`. New styles should use them rather than fixed colours so they work in both themes. The sidebar, header bar, toasts and chart colours stay the same in both. The sign-in, sign-up, password and two-step pages (`public/auth.css`) follow the theme last used on the device, otherwise the device setting, and the browser bar colour follows the device's light or dark mode. Text is at least 10 px.

**Settings** (`/settings`) changes how Ledger looks and what it shows, saved to your account so it follows you across devices: theme (light, dark, or follow the device), font size (14–22 px; the whole interface scales), font family (Ledger sans, device font, serif), row spacing (comfortable or compact), which Overview components appear (cash-flow chart, spending categories, recent transactions), and transaction details (running balances, where a title came from, original narrations expanded). Changes preview immediately and only apply after **Save settings**; leaving with unsaved changes asks first.

**Transaction titles** (`/titles`) replaces cryptic bank narrations with names you recognise:

- **Your titles** lists each title once (most used first) with how many transactions have it, their accounts, money in and out, and where the title comes from; **Show transactions** opens the list. Click a title (or **Edit title**) to edit it in place: the transactions under it follow as you type, Enter saves and Esc cancels. Saving changes every transaction with that title: your own titles change, a naming rule that gives the title changes, and an automatic title (such as *Self transfer*) gets a naming rule "Automatic title is …", so transactions you import later get the new title too. Renaming to a title you already use puts the two together; renaming back to the automatic title removes the rule.
- **Naming rules** match the original narration by contained or exact text, or the automatic title (ignoring case and spacing), and apply to existing and future transactions. Narration rules come first, in order (**Move up** changes priority); the rule form previews how many transactions it will rename.
- **Individual titles** (*Edit this one*, inside a title's transactions) correct one transaction and take priority over rules.
- Titles appear in transactions, search, recurring payments, reports and CSV exports (`readable_name`); the original narration is never changed and is still searchable and exported.

The server validates preferences and up to 500 rules, and keeps your preferences and rules when an older open tab or an older backup saves without them. Run `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/settings-browser.mjs` and `tests/title-groups-browser.mjs` for the live checks.

## Categories

Ledger ships with 24 built-in categories that automatic suggestions and tax tags rely on. On **Categories → Your categories** you can:

- **Add your own** (for example "Pets"), with a colour and a kind (spending or income). Use them in edits, bulk edit, import review and category rules.
- **Relabel, recolour or hide a built-in.** Its internal name stays the same, so automatic categorisation and tax suggestions keep working; hidden categories leave the pickers but transactions keep them. Uncategorized and Transfers cannot be hidden.
- **Rename a custom category**: its transactions and rules move with it.
- **Delete a custom category**: if anything uses it, choose where its transactions and rules go.

Every label shown must be unique. Charts, reports, search and CSV exports use your labels and colours. The server validates categories (up to 100 custom) and keeps them when an older tab or backup saves without them.
