# Verified on the local Docker deployment

- Next.js and NestJS production images built successfully.
- PostgreSQL migrations applied; database, API, web, and local mail inbox healthy.
- TypeScript checks and existing finance/parser tests pass.
- Real PostgreSQL/SMTP integration tests pass: signup, email verification, password recovery, old-password rejection, session revocation, logout, two-user ledger and file isolation, origin rejection, revision conflicts, original download, and original deletion.
- Chromium UI tests pass: signup form, verification link, login, CSV mapping/preview/import, persistence after reload, mobile layout, and actual sign-out button. No browser JavaScript errors.
- PostgreSQL custom-format backup restored into a separate temporary database. Account and ledger counts, transaction counts, revisions, original bytes, and content digests matched; the temporary database was removed.
- Dependency audit reported zero known vulnerabilities after upgrading Next.js and Nodemailer. This is an advisory check, not a security certification.

The test mail server captures mail locally. Real Internet delivery, Google OAuth consent, public domain/TLS, offsite scheduled backups, monitoring, and load testing have not been verified. No public production-readiness claim is made.

## Custom-domain deployment

Verified `https://ledger.chirayupatel.dev/login` with a valid certificate and HTTP 308 redirect to HTTPS. Live Chromium checks passed for the operator-provisioned owner's login/logout, Secure/HttpOnly/SameSite=Lax session cookies, disabled Google/signup/recovery controls and endpoints, and CSRF rejection. Password change, old-password rejection, and revocation of other sessions were tested with a separate temporary account that was removed afterward. The owner's password was not changed by this test. Mail delivery is disabled and the local mail inbox is stopped.

## Bank-account management

- Account migration and validation unit tests pass: legacy conversion, idempotence, canonical labels, stable duplicate fingerprints, linked-record reassignment, dangling references, duplicate names, invalid account numbers/currencies, and archived backup roundtrip.
- Deployed migration 2 after a private PostgreSQL backup.
- Live Chromium workflow passes with temporary users: add/edit/rename accounts, duplicate-name rejection, import and duplicate preview after rename, archive exclusion from imports, account filtering, statement reassignment with original-file preservation, deletion of empty accounts only, stale-client/invalid-reference rejection, cross-user isolation, backup/restore, persisted reload, and mobile layout.
- TypeScript checks pass. Owner financial records were not used for browser QA.

## Account navigation and save retries

- Added protected workspace URLs, a safe login return destination, and URL-backed account/reporting-period filters.
- Live Chromium checks passed for direct Accounts access through login, refresh, Back/Forward, persisted account/date filters, mobile navigation labels, and the existing account/import/isolation workflow.
- Injected a temporary archive-save failure, confirmed the database stayed unchanged, then verified retry archived the account successfully.
- Unit tests reject external/unsupported login destinations and unsafe filter inputs. TypeScript checks and the Docker production build pass.

## Readable narrations and inline transaction editing

- All 24 domain/navigation tests and TypeScript checks passed; Docker production images built and the services are healthy.
- Live Chromium tests passed using temporary users: automatic labels, expandable original narration, inline name/category/type/note/review edits, persistence after reload, Cancel/discard protection, failed-save retry, conflicting edits, remotely deleted records, and Back navigation during an in-flight save.
- Search finds readable names, notes, and original references. CSV export retains both narration and label. Reimporting a renamed transaction is still detected as a duplicate.
- Verified server rejection of oversized labels, text-only rendering of HTML-like labels, per-user isolation, and mobile editing without horizontal overflow. Inspected desktop/mobile screenshots.
- Existing bank-account, import, reassignment, archive, backup/restore, and navigation browser regressions passed. Owner records were not used. Committed narration fixtures use synthetic reference numbers.

## Backup recovery and recurring coverage — 20 October 2026 (IST)

- All unit tests, TypeScript checks, whitespace checks, and Docker production builds passed. Added regressions for statement coverage beyond the last transaction, empty statements, account isolation, payment-date drift, the 24-hour backup deadline, health grace, failed-dump retry, preserved copy timestamps, and idempotent mount configuration.
- Live Chromium bookkeeping tests passed with disposable users, including a missing recurring payment covered by a statement with no later activity. The suite also covers Excel/card imports, reconciliation, gaps, transfers, rules, bulk edits, tax export, mobile layout, paging, TOTP, and CSP. Test users were removed.
- Restored the external disk mount after its startup dependency failure. Configured the existing UUID entry with systemd automount and a 60-second device timeout. Verified fstab parses, the boot automount unit is generated, and the mounted disk is visible inside the backup container. No reboot or disruptive unmount was performed.
- Missing encrypted drive copies caught up; backup health checks and Docker health passed. Created a fresh manual dump, verified its encrypted drive copy decrypted to identical bytes, then restored it into a separate temporary database. User/ledger/transaction counts, revisions, original file bytes, and content digests matched. Removed the temporary database and decrypted file; retained the encrypted and source backups.

## Numbered savings-account PDFs — 20 October 2026 (IST)

- Verified a supplied 59-page statement: all 917 transactions extracted, zero unreadable rows, and every running balance reconciled. Dates, signed amounts and balances matched an independent Poppler extraction for every row. The statement period was retained.
- Live Chromium preview passed for that PDF with original-file uploads explicitly blocked. No real statement or transactions were saved to Ledger. The supplied local attachment was deleted after verification; no real financial data was added to fixtures or Git.
- Synthetic PDFs exercise multi-line headers, serial numbers before dotted dates, narrations above/below the date baseline, long wrapped descriptions, repeated page headers, large deposits, excluded cheque numbers/footers, missing pages, numbering gaps, invalid dates, conflicting debit/credit values and missing balances.
- `tests/numbered-bank-browser.mjs` passed for preview, reconciliation, save, persisted reload, original download, duplicate prevention, and removal of both transactions and the stored original. Its disposable test account was deleted.
- Unit tests, TypeScript checks and the Docker web build passed; the updated web container is healthy.

## Browser cache consistency — 20 October 2026 (IST)

- Public JavaScript responses allowed four hours of caching, while workspace and lazy PDF imports reused unversioned URLs. Reproduced the reported “No transactions could be read” screen by loading the previous PDF parser into a disposable browser tab before importing a synthetic numbered statement.
- Web builds now copy the complete workspace module graph, styles and vendor workers into a content-hashed release directory. Unit tests verify deterministic URLs, dependency/worker changes producing new URLs, preserved relative paths, and unchanged previous build contents.
- The live numbered-PDF workflow passes with an intentionally stale `/pdf.js` module already loaded. The app requests its parser from the same versioned directory as its entry point. Synthetic transactions/originals and the disposable account were deleted after the test.
- Unit tests, TypeScript checks and the Docker production build passed; the web container is healthy. No personal statement was needed or retained for this regression.
