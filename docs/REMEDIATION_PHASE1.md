# Remediation Phase one — implementation and validation

Date: 2026-11-04. Local branch: `feature/remediation-phase-1`, based on `bf08a98`. Changes are uncommitted and have not been pushed, merged or deployed. The existing audit/reconciliation reports and secure-config directory were preserved.

## Implemented scope

| Area | Changes |
| --- | --- |
| Isolation verification | Expands runtime-ledger ACLs, including PostgreSQL 17+ MAINTAIN without breaking older privilege catalogs; checks every application-owned sequence for runtime and API roles. Negative grant regressions now reject both previously missed privileges. |
| Operator reliability | Shared transaction/resource helper includes acquisition failure, rollback, release and pool shutdown. The primary operation error survives rollback/cleanup failures; a cleanup error is surfaced when there was no earlier failure. |
| Saves and transitions | Compares the captured editable snapshot with the current draft before replacing it. Newer edits remain dirty and keep the acknowledged server revision/asset identity. New Finalize/Archive creates a draft and then performs a versioned transition only if the snapshot is unchanged. Failed transitions and same-account expiry recovery retain the created draft ID for retry. |
| Print/export | Requires expected version, locks the selected row through authorization/audit, rejects stale versions with 409, renders the returned authorized snapshot and waits for images. Edits or account/document changes during preparation prevent printing. |
| Runtime safety | Handles idle pool errors; validates JSON object shapes and Content-Type; validates origin, database URL and CA configuration with safe failure categories. Existing Origin, CSRF, TLS, role and RLS boundaries remain intact. |
| Readiness/diagnostics | `/config` validates configuration without connecting. Administrator-only `/ready` returns only readiness. `scripts/check-runtime.js` verifies origin, restricted runtime role and a SELECT 1 transaction without owner credentials or ledger access. Logs contain only event, correlation ID, route class, method, stage, category and allowlisted code. No raw exception messages/stacks, SQL, URLs, headers, credentials or document contents are logged. |
| Bilingual UI/runbooks | Signed-out language/direction and chrome update correctly. Authenticated mode describes company server storage accurately, preserves prototype warnings in prototype mode, and distinguishes local-draft clearing. Windows instructions guard existing .env.local, distinguish owner/runtime credentials, label historical setup and identify the reviewed local branch. |

## Changed files

- Runtime: `server/errors.js` (new), `server/auth.js`, `server/db.js`, `server/api.js`, `server/documents.js`.
- Browser adapter: `server-client.js`.
- Operator scripts: `scripts/operator-transaction.js` and `scripts/check-runtime.js` (new), `scripts/migrate.js`, `scripts/bootstrap-admin.js`, `scripts/verify-isolation.js`.
- Tests/fixtures: `tests/operator.test.js`, `tests/runtime.test.js`, `tests/remediation_browser.py` (new), `tests/backend.test.js`, `tests/security.test.js`, `tests/prepare-browser-db.js`.
- Configuration/documentation: `.env.example`, `package.json`, `WINDOWS_SETUP.md`, `SECURITY_HARDENING.md`, this file, and `docs/VERCEL_PREVIEW_CHECKLIST.md` (new).

No migration, schema, RLS policy, database function or grant was changed. **Migrations 001–008 are byte-for-byte unchanged from bf08a98.** Original company artwork, letterhead/mark code, mobile CSS/interaction code and other frontend source remain unchanged.

## Validation results

All PostgreSQL integration tests used a newly created, loopback-only PostgreSQL 18 instance under ignored `.local/remediation-phase1/`, with a generated localhost test certificate, randomized databases and fictional accounts. The instance was stopped after testing. No existing database was reset or used; no live Supabase connection or production bootstrap occurred. Test fixture migrations/bootstrap are confined to that new local instance.

| Command/check | Final result |
| --- | --- |
| `node --test --test-concurrency=1 tests/backend.test.js tests/security.test.js tests/operator.test.js tests/runtime.test.js` | **35 passed, 0 failed, 0 skipped**: 11 backend, 9 security, 5 operator, 10 runtime groups |
| TLS handshake group within the suite, with TEST_TLS_CA explicitly set | Trusted certificate accepted; untrusted CA and wrong hostname/IP rejected; no TLS test skipped |
| `tests/remediation_browser.py` on the real local backend | **10 scenarios passed**: delayed-save retention/subsequent persistence; two-manager stale print/export conflict/current output; edits during output; new Finalize; new Archive; edits during creation; transition retry; expiry recovery; bilingual company text; English/Persian mobile auth semantics |
| `tests/backend_browser.py` on local fixtures | Passed real sessions, invitations, role navigation, private signature save/finalize/reopen, Employee finalized-only read/output denial and import preservation |
| `tests/browser_smoke.py` | Passed editor, legacy drafts, formatting/date persistence, duplication, six viewport widths, PDF and storage-failure coverage |
| `tests/document_marks.py` | Passed raster validation, transparency, mouse/pen/touch drawing, placement/resize, persistence, bounds and print geometry |
| `tests/letterheads.py` | Passed 12 language/template combinations, original pads, safe writing area, A4 exports and multipage parity |
| `tests/mobile_ux.py` | Passed seven widths × two languages, all screens, 84 template edit/save/reopen flows, focus/navigation/touch/zoom and PDF parity |
| Production `scripts/build-static.js` in an isolated copy of current sources | Passed; authenticated server marker and static allowlist verified; existing public output untouched |
| `npm.cmd audit --omit=dev --audit-level=high` | Zero reported vulnerabilities at validation time |
| `npm.cmd ls --depth=0` | Locked direct dependencies pg 8.16.3 and sharp 0.35.5 present; no new dependency added |
| JS/Python syntax, PowerShell instruction parsing, whitespace checks | Passed; 21 Windows runbook PowerShell blocks parse |
| Source integrity and secret-pattern checks | Migrations 001–008, artwork and untracked user reports preserved; environment/local dependency/data paths remain ignored; no recognized secret patterns in the change set |

The tests use actual PostgreSQL for ACL/RLS/role/session and two-manager behavior, and mocked failure injection for connection acquisition/cleanup, invalid configuration, certificate error categories, unsafe roles and log redaction. Synthetic secret markers are asserted absent from both error responses and logs. No checks were disabled to obtain passing results. The earlier browser failures were corrected by preserving acknowledged identity without prematurely publishing completed-save state, and fixing a test setup expression that invoked its print spy while installing it.

Evidence is retained under ignored `.local/remediation-phase1/`: backend-security-unit.log, browser-artifacts/remediation-browser-results.json, backend-browser.log, prototype-results.json, individual prototype logs, and the isolated production build. These scratch runners are local evidence, not published automation or a replacement for the maintained tests.

## Behavior and compatibility notes

- Print/export clients must now send `{ "version": <expected revision> }`. Old clients without a revision fail closed with 409; reload clients after an approved rollout.
- Output is bound to the revision authorized by that request. This is browser printing, not an immutable or cryptographically signed PDF. The existing output audit function/schema was preserved, so no new revision field was added to its event detail. Output-intent auditing does not prove a physical print occurred.
- Ordinary Save Draft still drafts the snapshot. Finalize/Archive explicitly transitions it. If edits arrive while a new draft is being created, those edits remain unsaved and finalization is postponed rather than silently publishing an older snapshot.
- Configuration faults now return categorized 503s consistently; actual TLS, database authentication/network and unsafe-role failures also have distinct safe categories. The original incident's deployed cause is not established by these local tests.
- `/ready` requires an Administrator session. For pre-login verification, a successful anonymous `/session` response is 401 after the guarded database lookup; `/config` 200 alone is insufficient.

## Audit reconciliation and remaining risks

Reconciliation R1–R4 are addressed. Production-audit F02/F03/F06/F08/F11/F13/F14 are addressed in the requested scope. F01/F04 have configuration validation, diagnostic and readiness improvements plus a separate manual deployment gate; the actual Preview environment snapshot and runtime remain unverified because deployment/settings changes were prohibited.

Recovery/password lifecycle/MFA (F05), grant-change audit triggers (F07), quotas/orphan retention (F09), automated CI/branch deployment gates (remaining F10), and durable document history/restore (F12) remain outside this no-schema Phase-one batch. No claim is made that these changes alone complete production readiness. Grant-audit/history/password-helper schema work needs separate design/approval and forward-only migrations, never edits to 001–008.

Actual Vercel environment scoping, Linux function packaging, provider CA/pooler routing and Preview/Production isolation must be verified in the next approved stage. Headless Chromium/CDP tests do not certify physical mobile devices, assistive technology or company printers. Dependency advisories can change after this validation date.

Follow [VERCEL_PREVIEW_CHECKLIST.md](VERCEL_PREVIEW_CHECKLIST.md) only after explicit approval to publish/deploy and change Preview configuration. No push, merge, deployment, Vercel-variable change or live database operation has been performed.
