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
