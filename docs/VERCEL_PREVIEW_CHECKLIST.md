# Vercel Preview deployment checklist — separate approval required

Phase one was implemented locally from bf08a98 on feature/remediation-phase-1. Nothing in this checklist was applied to Vercel or Supabase. Do not deploy the older remote baseline in place of the reviewed remediation patch. Preserve the current production deployment until the separate release decision.

## Configuration to verify for the exact new Preview

- Record reviewed commit/patch, branch, deployment ID, environment target and canonical Preview alias. Select **Preview**, with a branch override where appropriate; do not assume Production-scoped variables reach Preview.
- `APP_ORIGIN`: a literal exact HTTPS canonical Preview origin, with no path, credentials, query or fragment. Browse that same alias. Do not use wildcard origins, arbitrary request-host reflection or the Production domain for Preview. An origin mismatch remains a 403.
- `APP_ENV=production` for hosted Preview security. This app variable is independent of Vercel's environment name `preview`.
- `DATABASE_URL`: server-only restricted rimdan_app credentials, the intended isolated Preview database, and the exact host from Dashboard Connect. For the shared transaction pooler, use port 6543 and `rimdan_app.PROJECT_REF`; direct usernames have no project suffix. Passwords must be URL-encoded once. Use `sslmode=verify-full`; supported URL options are sslmode and sslrootcert only.
- If additional trust is required, `DATABASE_SSL_CA` contains valid multiline certificate PEM with real newlines. It supplements standard Node trust. Remove a Windows-local sslrootcert URL option; such a file does not exist in the hosted function. Never disable certificate/hostname verification or set NODE_TLS_REJECT_UNAUTHORIZED=0.
- Keep MIGRATION_DATABASE_URL, owner/bootstrap credentials, TEST_DATABASE_URL and RIMDAN_MODE=prototype out of hosted settings. No Supabase API keys are required by this architecture.
- Verify Node 24, Linux installation of the locked dependencies including sharp, `npm run build`, and the existing API rewrite. Review function packaging/runtime logs; a static build does not test module initialization or database connectivity.
- Prove Preview/Production database isolation before confidential data. These local tests do not establish that isolation.

Existing migrations 001–008 and the first Administrator must not be reapplied/recreated for this code-only update. No database migration is required for Phase one. Owner isolation verification is an optional separately controlled read-only operator step; never grant the runtime role ledger access to make it work.

## Approved deployment and acceptance sequence

1. Obtain explicit approval to publish/deploy the reviewed code and change Preview configuration. Phase one itself does neither.
2. Apply only the approved Preview configuration and create a **new** Preview deployment so its environment snapshot includes those settings. Preserve the chosen stable alias.
3. Without credentials, GET `/api/v1/config`: expect JSON 200 and `{ "mode": "server" }`. This validates origin/database configuration and CA parsing, not network connectivity.
4. Without a cookie, GET `/api/v1/session`: expect JSON 401 after a successful guarded database lookup. A 503 category distinguishes origin/database configuration, certificate configuration, database TLS/authentication/network or unsafe runtime role. Use the X-Request-ID to locate safe server logs.
5. The owner signs in normally without sharing the password. Confirm Secure, HttpOnly, SameSite=Strict, host-only cookie behavior locally in browser tools; do not paste cookie/CSRF values into logs or review comments.
6. As Administrator, GET `/api/v1/ready`: expect only `{ "ready": true }`. Managers/Employees must receive 403; unauthenticated callers receive 401. Check private document/asset visibility with controlled fictional staging accounts.
7. Exercise a delayed save with further edits, two-manager stale print/export conflicts, current-revision output, new-document Finalize/Archive, a failed transition retry, both languages and mobile preview. Do not load-test production or use confidential documents as fixtures.
8. Record results and deployment/commit IDs. Review recovery/backup, retention, grant-change auditing and other remaining production-audit findings before any Production promotion.

If a check fails, stop promotion and record status, safe category, stage and correlation ID. Do not log raw errors, connection strings, passwords, SQL, tokens or document contents. Recheck the exact deployment snapshot before changing credentials. Keep Origin/CSRF, RLS and TLS checks intact.

The source fix does not establish the actual cause of the previous Preview incident. Missing/invalid APP_ORIGIN remains a suspected historical cause until matched to the failing deployment's response and environment metadata. Production promotion, Git push/merge and real-service maintenance remain separate approval steps.
