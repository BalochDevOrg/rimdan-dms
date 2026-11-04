# Rimdan DMS Phase 3 — implementation checkpoint

Date: 2026-11-04. Feature branch: `feature/rimdan-ux-redesign`.
Baseline: `feature/remediation-phase-1` at `461f37b`.
This branch was authored against the last available GitHub commit; it **does not**
contain the disconnected teammate's unpublished local changes.

## Implemented on this feature branch

- Additive navy/gold visual tokens, login polish, responsive editor spacing and
  modernized sidebar/navigation.
- Desktop sidebar collapse/expand, remembered per browser, with accessible
  icon labels. Mobile drawer remains independent.
- Real request activity indicator, editor button busy indicators and document
  search skeletons. No invented progress percentages.
- Search and clear buttons, previews in the document table, active-document
  recent list excluding archived items.
- Bilingual font families, icon alignment controls, expandable editor,
  dismissible centrally positioned toast messages.
- Per-document audiences (`all` / `selected`), recipient selector,
  role-filtered database policies, and API enforcement on library/query,
  direct-read, asset linkage and mutation paths.
- Administrator-assisted one-time password-reset links with 30-minute expiry,
  server-stored token digests, session revocation on reset, rate limiting and
  manual link delivery. The login screen includes Forgot Password and reset
  link redemption. **No SMTP/email delivery is configured or claimed.**
- New forward-only migration `009_document_visibility_recovery.sql`; existing
  migrations `001`–`008` are unchanged.
- Additional isolated backend/security assertions and a GitHub Actions job
  that is intended to run against disposable PostgreSQL 18.

## Important safety and acceptance boundaries

1. The new API **requires migration 009**. A successful Vercel build alone is
   not proof of a working server. Do not point the branch at an unmigrated
   production-like database expecting authenticated document flows to work.
2. No live Supabase migration was applied. No production Administrator,
   document, domain or environment setting was changed.
3. Migrations, API-level role enforcement and security tests require a passing
   disposable-PostgreSQL CI run and owner review before staging rollout.
4. Preview must have a separate, verified staging database before destructive
   or authenticated feature testing. Do not reuse its current Production/Preview
   shared DATABASE_URL indiscriminately.
5. `APP_ORIGIN` must match the stable, actual Preview branch host. Remote
   `DATABASE_URL` must retain restricted role and verified TLS. Owner database
   credentials must remain operator-only.
6. Manual password recovery is *not* self-service email delivery. A locked-out
   sole Administrator still needs an independently tested offline recovery
   process; do not assume this feature resolves that case.
7. The original company letterheads, physical A4 print rules, signature/stamp
   implementation, and migrations 001–008 were not intentionally rewritten.

## What is not yet verified or complete

- GitHub Actions may be queued. Until the job passes, migration compatibility,
  upgraded role tests, and API integration must be treated as unverified.
- Real Vercel Preview runtime, TLS, storage, role workflows and migration 009
  have not been certified.
- Visual browser regressions, authentic PDF output, last-page blank PDF issue,
  print margin differences and physical-printer checks have not passed for
  this branch. Do not claim they are fixed.
- Accessible asynchronous centered confirmation dialogs still use native
  browser confirmations in some routes.
- Password recovery email delivery, offline sole-Administrator recovery,
  long-term document revision history, quotas/orphan cleanup and MFA remain
  separate requirements.

## Proposed staging gate (manual and approved)

1. Review the full code diff and GitHub Actions results. Require all migrations
   through 009 and negative privilege/visibility/recovery tests to pass against
   **disposable** PostgreSQL.
2. Create or select a **separate staging Supabase project**; record its project
   ID and confirm it is not the currently live Rimdan project.
3. Apply migrations 001–009 to staging using the owner-only migration script
   after approval. Never rewrite earlier checksums.
4. Create a fictional staging Administrator, configure a restricted staging
   database role, TLS certificate trust and exact Preview origin.
5. Deploy only the Phase 3 feature branch to Preview (GitHub integration may
   already have built it automatically), then check config 200, anonymous
   session 401 and Administrator readiness. Test with fictional records.
6. Run selected-user privacy, saved state, export/PDF pagination, mobile
   layouts, recovery-token replay, and English/Persian regression tests.
7. Do not merge into main or promote the Production domain until successful
   staging results and separate owner approval.

**Current verdict:** feature-branch code published for review, **not production
ready and not authorized for live database migration or promotion**.
