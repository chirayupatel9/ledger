# Production readiness: Ledger for Indian bookkeeping

Audit of the self-hosted app (Next.js + NestJS + PostgreSQL in Docker) as of 16 Oct 2026.
Status: **Done** = implemented, deployed and tested in this pass; **Needs decision** = blocked on a choice only the owner can make; **Later** = deliberately deferred.

## 1. Statement import (Indian banks)

| Gap | Why it matters | Status |
| --- | --- | --- |
| No Excel import | SBI, HDFC, ICICI, Axis and Kotak net banking export `.xls`/`.xlsx` far more often than CSV. | Done |
| Column detection misses common headers (`DR`/`CR`, `Dr / Cr`, `Withdrawal Amt.`, `Closing Balance`, `BAL`) | Axis and Kotak files need manual mapping; balance is ignored. | Done |
| Balance column discarded | Running balance is the only way to prove nothing was dropped or misread during import. | Done |
| Separator/footer rows reported as "rows that could not be read" | Bank exports have asterisk rows and summary footers; the warning becomes noise. | Done |
| Scanned PDFs (OCR) | Some branches issue image-only PDFs. | Later |
| Credit card statement PDFs (single amount column with Cr suffix) | CC PDFs rarely have separate debit/credit columns. | Done (verified on a real ICICI Amazon Pay statement in both its app and e-statement formats, plus synthetic HDFC, SBI Card and ICICI layouts) |

## 2. Bookkeeping integrity

| Gap | Why it matters | Status |
| --- | --- | --- |
| No reconciliation | Opening balance + transactions should equal the bank's closing balance; without this the books can silently be wrong. | Done |
| No statement coverage / missing-period detection | A missing month makes every report wrong; users cannot see it. | Done |
| Account cards show "net movement", not balance | Users expect the balance as of their latest statement. | Done |
| Transfers between own accounts are not paired | Both legs are tagged Transfer but not linked. | Done (Find transfer pairs, manual linking in Edit, unlinked-transfer filter) |
| Single-entry cash-flow model, no double-entry / Tally export | Needed for business books and CA hand-off in Tally. | Needs decision (personal vs business product) |

## 3. Indian tax and categorisation

| Gap | Why it matters | Status |
| --- | --- | --- |
| Categories are budget-style only | No Insurance, Loan EMI, Taxes, Donations, Education, Dividends, Rental income, Fees & charges, Cash withdrawal. | Done |
| No tax tagging | ITR needs income by head and deduction-eligible payments (80C, 80D, 80G, 24(b), NPS, rent). | Done |
| No financial-year tax summary | The main reason Indians reconcile bank statements is ITR filing. | Done |
| Rules only apply to future imports | Adding a rule should fix existing uncategorised transactions too. | Done |
| No bulk edit | Reviewing hundreds of UPI rows one by one is impractical. | Done |
| All transactions rendered at once | Slow with a year of UPI history. | Done |
| Crore amounts shown as "100.0L" in charts | Indian digit grouping should show Cr. | Done |
| GST input credit tracking, invoices | Needed only for GST-registered users. | Needs decision |

## 4. Security and operations

| Gap | Why it matters | Status |
| --- | --- | --- |
| Backups are manual and kept only on the same host | One disk failure loses every statement. | Daily verified `scheduled-*.dump` backups (14 kept), copied and verified hourly to the external USB drive at `/mnt/backup/ledger` (60 kept), health-checked. Drive copies are encrypted (AES-256). The 2026-10-20 recovery restored a failed startup mount and configured UUID-based systemd automount with a 60-second device timeout; the 24-hour schedule now excludes health grace. A copy away from this building was skipped for now. |
| No two-step verification | Bank statements behind a single password on the public Internet. | Done (TOTP + backup codes, opt-in at `/security`) |
| Content-Security-Policy has no `script-src`/`connect-src` | An injected script could exfiltrate financial data to another origin. | Done |
| Test logins left in production DB (`*@example.test`) | Verified accounts nobody owns. | Done (3 accounts removed after a verified backup) |
| Password reset needs email | Owner can only be reset by the operator. | Done (Gmail SMTP; owner login moved to a Gmail address; sign-up is invite-only; Google sign-in links to the same verified address) |
| No uptime/disk/backup alerting | Failures go unnoticed. | Done (ntfy push alerts for site, backups, drive copy, disk space; host power loss still needs an outside check) |
| Ledger stored as one JSON document per user | Every edit rewrites the whole ledger; fine for one user, not for many large ledgers. | Later (normalise into tables before public signup) |
| Account deletion, privacy notice, consent (DPDP Act 2023) | Required before accepting other users. | Needs decision (public launch) |
| Old ChatGPT Sites deployment still published | Duplicate, unmaintained copy of the app. | Needs decision (take down) |

## How this pass was verified

- `npm test`: 37 unit tests, including real XLSX and legacy XLS workbooks, reconciliation (oldest-first and newest-first statements), coverage gaps, tax tags and server validation.
- `tests/bookkeeping-browser.mjs` (live, disposable users): Excel import with period and balances, duplicate re-import, a statement with a missing row, missing-month and balance-break detection, statement details, rule back-fill, bulk edit, tax summary and export, mobile layout, 200-row paging, two-step verification sign-in, and no Content-Security-Policy violations.
- `tests/transactions-browser.mjs` and `tests/bank-accounts-browser.mjs` re-run against the live site with no regressions.

## Decisions still needed from the owner

1. **Offsite backups** (skipped for now): a destination away from this building (e.g. Backblaze B2, S3, Google Drive via rclone). Dumps are on the system disk and, encrypted, on the attached USB drive.
2. **Email delivery**: done (Gmail SMTP, branded emails, owner login on Gmail).
3. **Product direction**: personal books only, or business books too (GST, invoices, double-entry, Tally XML export).
4. **Public signup**: requires normalising the ledger into tables, account deletion, a privacy notice and consent flow (DPDP Act duties apply to hosted services from 13 May 2027).
5. **Old ChatGPT Sites copy** (`ledger-money-desk.chiiirayu.chatgpt.site`): take it down.
