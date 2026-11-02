# Multi-user backend: architecture, operation and review

This branch adds a server-side application to a formerly static-only prototype. It has been validated with disposable local PostgreSQL databases and local HTTP servers. **No production database, live account, deployment or Vercel project has been changed.** Production rollout requires separate approval, credentials and operator validation.

## Minimum integration

The existing bilingual editor, original official pads, templates, mobile tabs/zoom, signatures and stamps remain plain browser JavaScript. A Node 24 Vercel Function (`api/index.js`) delegates to `server/api.js`. PostgreSQL (`pg`) holds accounts, opaque sessions, invitations, document revisions, templates, private raster uploads and audit records. `sharp` validates and normalizes untrusted raster images. No client database SDK, third-party authentication provider or framework was added.

`npm run build` creates `public/` from an explicit frontend allowlist and copies the original company artwork unchanged. Server code, SQL, `.env`, scripts and dependency directories are not static output. Vercel rewrites `/api/v1/*` to the Node function. No install/build step runs migrations or creates accounts.

Mode is explicit: the checked-in source HTML is a standalone **prototype**; the normal build and Node development server inject a **server** mode marker. A server deployment whose API fails or returns 404 fails closed at authentication. It never silently loads local drafts. `RIMDAN_MODE=prototype npm run build` is an intentional offline-prototype build, not a production company backend. Runtime secrets never enter that marker or browser files.

## Permission matrix

| Capability | Administrator | Manager | Employee |
| --- | --- | --- | --- |
| Read/search drafts, finalized and archived documents | Yes | Yes | Finalized only |
| Create, edit, duplicate, archive and soft-delete | Yes | Yes | Denied |
| Finalize a company document | Yes | Yes | Denied |
| Upload/apply signatures, stamps and custom pads | Authorized assets | Owned/granted assets; retain existing document attachments | Denied |
| Read applied images in accessible documents | Yes | Yes | Only attached to finalized documents |
| App Print/PDF and output endpoints | Yes | Yes | Denied |
| Template management | Yes | Yes | Denied |
| Create accounts/invitations, assign manager/employee roles, deactivate others | Yes | Denied | Denied |
| Grant/revoke private asset authorization | Grant API | Denied | Denied |
| Read audit records | API | Denied | Denied |
| Change own role/activity or create a second active administrator | Denied | Denied | Denied |

The UI is an aid, not the security boundary. Every protected API request resolves its opaque session against the current active account and current role. PostgreSQL policies independently restrict rows and writes. Role changes affect existing sessions on subsequent requests; deactivation deletes their records so old cookies remain invalid after reactivation; SQL policies also protect resource access if a role changes between session resolution and a database statement. The client refreshes authority after a role-related denial and clears protected state on session loss/logout.

Employees have a read-only finalized-document viewer, no editor/mark controls, denied print/export endpoints and an employee print stylesheet. **This is not DRM:** anyone authorized to read rendered content can capture it, copy it, override browser styling, or recreate a PDF outside the app. Server rules prevent unauthorized records/mutations/output endpoints; they cannot guarantee that visible pixels are never printed or downloaded.

## Database-level enforcement

Migrations:

1. `001_initial.sql`: tables, indexes, partial unique active-administrator index, deferred exactly-one trigger, account self-change guard, RLS, least-privilege grants and narrow authentication/session functions.
2. `002_output_audit.sql`: guarded output audit function.
3. `003_policy_hardening.sql`: explicit asset-application permission, retained document attachments, and accurate null-versus-applied mark auditing.
4. `004_deferred_admin_and_deletion.sql`: owner-context deferred count and a narrow authorized soft-delete transition that does not weaken read policies.
5. `005_account_and_output_guards.sql`: active accounts require password hashes; output auditing verifies an existing non-deleted document.
6. `006_invitation_lifecycle.sql`: safe password-presence metadata and invitation lifecycle auditing.
7. `007_deactivation_revocation.sql`: deactivation deletes existing sessions and revokes pending invitations, so reactivation cannot revive old cookies.

A fresh migrated database is empty and unbootstrapped. The first account write must be the owner-only bootstrap. Thereafter every account-writing transaction must commit with **exactly one active administrator**: the partial unique index prevents two, and the deferred trigger prevents zero, independently of caller RLS. It is intentionally impossible to demote/deactivate the only administrator through the web API. Accounts are deactivated rather than deleted to preserve references and history.

The web login must be a non-owner, non-superuser, non-`BYPASSRLS` role with only membership in `rimdan_runtime`. The API rejects an owner or a role inheriting ownership. Do not give it schema creation, owner membership or broader provider administration privileges. PostgreSQL owners can administratively override policies; migration-owner credentials are an operator boundary, not web credentials.

Each transaction derives `app.user_id` from the server-verified session with `SET LOCAL`; pool reuse cannot carry a previous actor. Policies use this actor and its current active role. This is a **trusted application-server** RLS model: a person holding the web database credential can impersonate an actor through SQL, so that credential must remain server-only and must never be issued to end users. Narrow `SECURITY DEFINER` functions use fixed search paths and revoked PUBLIC execution. End users receive no SQL credentials.

Documents use integer revisions and row locking. Updates/deletion require the expected version; stale changes return HTTP 409. Soft-deleted documents disappear from all normal read policies; audit and attachment history remain. Metadata-only lists are paginated in 1,000-row batches, with server-side title/number/recipient and status/type filtering. Summary counts are separately computed under RLS. Full body/asset data loads only when a document is opened.

Database triggers append document creation/modification/finalization/archive/deletion, signing/stamping changes, account/role/activity changes, template changes and asset upload/deletion events. The runtime cannot update/delete audit records or directly insert forged rows. Output requests through application buttons/endpoints are also logged; native browser actions outside those controls are not a comprehensive output audit. Audit does not contain passwords, raw session/invitation tokens, image bytes or document body snapshots. This implementation has revision conflict detection, not full historical document versions.

## Authentication and invitations

Passwords are salted scrypt hashes (`N=131072`, `r=8`, `p=1`), 12–128 UTF-16 characters as in browser inputs. Login errors do not reveal whether an email exists. Database-backed 15-minute limits cover IP and normalized-email/token buckets. Sessions last eight hours; only SHA-256 token digests are stored. Production cookies use `__Host-`, Secure, HttpOnly, SameSite=Strict and Path=/. Mutation endpoints require an exact configured Origin, JSON and a session CSRF token. Login and invitation redemption require Origin/JSON but have their own public credential flow. Logout invalidates the server session.

Only an administrator can create a password-backed account or issue a single-use 24-hour invitation. The browser console uses the safer invitation workflow; email delivery is **not integrated**. The one-time link is returned to that administrator to distribute securely. Its secret is a URL fragment, removed before rendering; redemption submits it in a POST body. Never paste links/passwords into logs, source, chat or analytics. Invited users must choose a password before activation. Administrators can revoke pending links by deactivating the account and reissue an invitation for an inactive account; reissue invalidates prior links. Self-service password-reset/recovery, MFA and automated email delivery are not implemented.

The administrator cannot change their own role/activity, assign another administrator online, or deactivate the current administrator. A future administrator transfer is an explicitly approved **offline owner maintenance transaction**: lock accounts, set the old administrator to an inactive non-admin role, set an existing password-backed target as the active administrator, commit and verify the invariant. Revoke old sessions, retain backups and audit the operator action. Do not weaken the constraint or add a second active administrator to work around it. No transfer has been performed by this task.

## Private files and marks

Private images are PostgreSQL `bytea`, never files beneath `assets/` or `public/`. Official company pads remain deliberately public repository assets. Uploads accept only decoded PNG/JPEG/WebP up to 2 MB, 4096 pixels per side and 12 megapixels; animations, SVG, URLs, malformed data and oversized converted output are rejected. The decoder strips metadata and stores PNG, preserving alpha. Larger/general attachments require another reviewed design, such as private object storage; they are not accepted by this initial raster-only API.

Uploads are owned by an account. The administrator can authorize another staff account via `POST /api/v1/assets/:id/grants`, and revoke that authorization with DELETE on the same route. Library fetches require ownership/admin/grant; document-image routes also require a readable document and an actual attachment link. Employees can see images applied to finalized documents, not private asset libraries or drafts. New document attachments require database-level apply permission. Another manager can retain/move existing attachments while editing that company document; attaching the same image to a different document requires ownership or a grant.

Cloud duplication requires saving first and copies text/formatting into a draft. It retains marks/custom pads only when the caller owns them, is the administrator, or has an explicit asset grant; unauthorized image reuse is omitted with a clear UI message. This preserves authorized copies without turning document read access into a reusable signature library. Local prototype duplication retains its previous behavior. There is no dedicated asset-library/grant-management UI yet; upload/apply/remove is integrated into the editor, while grant and asset-cleanup operations are authorized APIs. Removing an image from a document unlinks it; deleting a referenced asset returns a conflict to protect history. Retention/orphan cleanup is an operator task.

## Operator setup — not executed in production

1. Provision PostgreSQL with TLS, row-level policies, a pooled endpoint suitable for serverless connections, backups and role-management capability. Provider owner permissions must permit the migration's `rimdan_runtime` NOLOGIN group. Do not bypass a provider limitation by using an owner connection in the web app.
2. Store secrets outside browser code. Copy `.env.example` only for local development and enter values securely. Set `MIGRATION_DATABASE_URL` to a direct owner connection and `DATABASE_URL` to the limited pooled login. Remote URLs must use `sslmode=verify-full`; verification is never disabled. Configure `APP_ORIGIN` to the exact HTTPS application origin.
3. After approval and backup review, run `npm ci`, then `npm run migrate -- --approve-production` with **only operator/migration-owner credentials** available. The runner takes an advisory lock, applies each SQL file transactionally, records SHA-256 checksums and refuses changed applied migrations. It is repeatable. There is no automatic downgrade or destructive reset.
4. Create a dedicated application login securely with provider tooling or `CREATE ROLE rimdan_app LOGIN`, set its password through a secure prompt/provider vault, and `GRANT rimdan_runtime TO rimdan_app`. Do not grant owner, SUPERUSER or BYPASSRLS. Use its pooled URL as the Vercel server-only `DATABASE_URL`.
5. After explicit live-account approval, set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` securely and run `npm run bootstrap-admin -- --approve-production` with the owner connection. This locks accounts and **refuses any non-empty account table**. Remove the bootstrap password and migration-owner connection from normal runtime settings afterward. There is no public bootstrap endpoint or default password.
6. Review `vercel.json`, production function bundling (including native `sharp`), secure cookie behavior, TLS pooling and the CSP in an approved preview deployment. The local static build passed; no actual Vercel deployment was performed. Preview environments need their own exact `APP_ORIGIN`, isolated database and independently approved account bootstrap. Never point a preview/test suite at production.
7. Schedule/monitor retention of expired sessions, invitation tokens, rate-limit buckets, audit records and unreferenced uploads under an approved policy. Add storage quotas, backup/restore drills, external monitoring and recovery workflows before sensitive production use. The runtime pool is capped at four connections per instance; size provider pool limits for aggregate serverless concurrency.

For local Node development use `npm ci`, configure a separate local database and role, run migrations/bootstrap locally, then `npm run dev`. HTTP cookies are permitted only with `APP_ENV=development`, an actual loopback `APP_ORIGIN`, and outside Vercel. This exception cannot enable insecure cookies on a Vercel deployment. Local `.env` is gitignored, never copied to static output and should not be served with a repository-wide generic file server.

## Explicit migration of legacy drafts

In authenticated staff mode, choose **Import browser-local drafts** and confirm. The adapter reads the existing `rimdan_demo_docs` store, uploads supported raster attachments privately, and creates **draft** database records with an owner-scoped import key. Repeated imports do not duplicate the document. Source localStorage is not deleted or overwritten, including on partial failure. Local data and server data are never automatically merged. Unsupported/oversized legacy images need manual reduction/reselection; errors preserve the original. Copy files before deleting any local legacy data.

Company saves use the database, not localStorage. Save records a draft; Finalize explicitly publishes it to employee readers; Archive hides it from employees. Session-expired unsaved working content can be held only in volatile memory and restored after the **same** staff account signs back in; switching accounts or explicit logout clears it. Closing/reloading the tab loses unsaved recovery. Existing local prototype data is not permission-protected and remains readable to anyone sharing that browser profile; use separate profiles and handle legacy data deliberately. New company drafts and private image bytes are never written to that legacy store.

## Local validation

Only disposable databases/fixture users on a loopback PostgreSQL instance were used:

```sh
# Local tests only. Never use trust authentication outside this ephemeral setup.
docker run --rm -d --name rimdan-backend-test \
  -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:55432:5432 postgres:16-bookworm
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres npm test
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres python3 tests/backend_browser.py
docker stop rimdan-backend-test
```

Tests create randomized databases and remove them. They refuse non-loopback test URLs. Never use a production cluster or a tunnel to one. Python browser tests require Playwright/system Chromium, already available in this task environment.

Passed: ten backend groups covering real HTTP sessions, production cookie flags, CSRF/Origin denial, employee/API and direct SQL/RLS denials, single-admin invariant/self-role protection, image validation/private grants, audit changes, version races, finalized-only reads, archive/delete/duplicate, templates, import idempotence, invitation replay, account changes, expiry/throttling and rejection of owner/inherited-owner web credentials. Browser integration passed invitation acceptance, manager template editing and private mark save/finalize/reopen, read-only employee viewing/print denial, and explicit local import preserving source. Existing editor, marks, official-pad and full mobile suites also passed in prototype mode. Static build/syntax checks passed and `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities after updating the initial image-library version.

Early local runs caught soft-delete RLS and deferred-trigger-context defects; migrations 003–007 resolve them and the full suite passed again. No assertions were weakened or disabled. Production TLS connections, provider role provisioning, actual Vercel runtime behavior and real-device authentication flows remain unverified pending approved infrastructure setup.
