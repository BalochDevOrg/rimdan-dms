# Windows PowerShell — local backend development

This branch includes backend commit `5851d98`, the bilingual editor and original Persian/English letterheads, mobile tabs/zoom, and signature/stamp tools. Use Node.js **24 LTS**, Git for Windows and PostgreSQL 16+ (or Docker Desktop in Linux-container mode). Run these commands from the repository root in PowerShell. `npm.cmd` avoids PowerShell's `npm.ps1` execution-policy restrictions without changing machine policy.

**Security patch:** additive migration 008 and the updated runner protect Supabase API-role grants and migration metadata. The local sections below use only local PostgreSQL. The separate Supabase section provides commands for you to review and run manually; none were executed against a real project during implementation.

## Install and inspect

```powershell
git clone --branch feature/multi-user-backend https://github.com/BalochDevOrg/rimdan-dms.git
Set-Location rimdan-dms
git status --short
git log -5 --oneline
git show --no-patch 5851d98
node --version
npm.cmd ci
Copy-Item .env.example .env.local
git check-ignore .env.local
```

If the checkout already exists, use it rather than cloning over local work. Preserve uncommitted files before changing branches. Do not overwrite an existing `.env.local`. Edit placeholders using a local editor; never commit passwords. `.env`, `.env.local` and other `.env.*` files are ignored, with `.env.example` as the only intentional exception. No owner secret is needed by the running application.

## Start an isolated local PostgreSQL instance

Choose one route. Do not use the same database for application data and automated test fixtures.

**Docker Desktop route:** this disposable development container uses trust authentication solely on loopback. It is inappropriate on shared/untrusted machines or outside temporary local development. Data is lost when stopped because `--rm` is used and no volume is configured. Use password authentication and an intentional backup/volume policy for local data you need to retain.

```powershell
docker run --rm -d --name rimdan-local-pg `
  -e POSTGRES_HOST_AUTH_METHOD=trust `
  -p 127.0.0.1:55432:5432 postgres:16-bookworm
docker exec rimdan-local-pg pg_isready -U postgres
# Repeat pg_isready until it succeeds; then create the local database.
docker exec rimdan-local-pg createdb -U postgres rimdan_dev
$env:MIGRATION_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55432/rimdan_dev'
```

**Installed PostgreSQL route:** use a dedicated local instance and database. In PowerShell with PostgreSQL's bin directory on PATH:

```powershell
createdb -h 127.0.0.1 -p 5432 -U postgres -W rimdan_dev
```

Supply the local owner URL securely as `MIGRATION_DATABASE_URL`, or put it in ignored `.env.local` for the explicit env-file command below. Percent-encode any password in a URL. Match `.env.local`'s port to your installation. Do not use the owner URL for `DATABASE_URL`.

## Run migrations manually

With the local owner URL already in the PowerShell process environment:

```powershell
npm.cmd run migrate
```

Alternatively, when the local owner URL is in ignored `.env.local`, explicitly load it:

```powershell
node --env-file=.env.local scripts/migrate.js
```

These are alternatives, not two required commands. Process environment values override env-file values; clear stale variables first. `npm run migrate` does not implicitly read `.env.local`. The runner applies all eight files in order, records SHA-256 checksums in `schema_migrations`, and safely skips matching applied migrations. It refuses changed applied SQL. Installation, startup and builds never run migrations or bootstrap automatically. Do not delete ledger rows to bypass an error.

After migration, create a limited local login. Docker route:

```powershell
docker exec rimdan-local-pg psql -U postgres -d rimdan_dev -v ON_ERROR_STOP=1 `
  -c 'CREATE ROLE rimdan_app LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT rimdan_runtime TO rimdan_app;'
```

For installed PostgreSQL, connect with `psql -h 127.0.0.1 -p 5432 -U postgres -W -d rimdan_dev`, execute that SQL, then run `\password rimdan_app` to supply its password privately. Never grant owner membership, superuser or BYPASSRLS. Do not repeat CREATE ROLE if the dedicated login already exists; inspect its privileges first.

For the temporary Docker trust setup, set `.env.local` to:

```dotenv
DATABASE_URL=postgresql://rimdan_app@127.0.0.1:55432/rimdan_dev
APP_ORIGIN=http://127.0.0.1:3000
APP_ENV=development
PORT=3000
```

For password-protected local PostgreSQL, replace the URL with its actual local port and URL-encoded application password. Keep the exact origin `http://127.0.0.1:3000` when visiting the app; switching to `localhost` causes the Origin check to reject mutations. Process-level `DATABASE_URL`/`APP_ORIGIN` values override `.env.local`; remove stale values if needed. Do not set `VERCEL` locally.

## Optional local test administrator — explicit initialization only

An empty migrated database has no accounts or public signup. To exercise the authenticated UI, explicitly initialize one **local test** administrator. This is not a live account. Do not save a default administrator password in source or shell history. With the owner URL available in the process or `.env.local`:

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL = Read-Host 'Local test administrator email'
$localPassword = Read-Host 'Local test password (12-128 characters)' -AsSecureString
try {
  $env:BOOTSTRAP_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $localPassword).Password
  node --env-file=.env.local scripts/bootstrap-admin.js
} finally {
  Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:MIGRATION_DATABASE_URL -ErrorAction SilentlyContinue
  $localPassword.Dispose()
  Remove-Variable localPassword -ErrorAction SilentlyContinue
}
```

The bootstrap refuses any non-empty accounts table and is never triggered by startup. The bootstrap password is briefly present in process memory/environment; use a trusted local session. If the owner URL was stored in `.env.local`, remove it after operator commands. Only the application login belongs in normal startup configuration. No account is created by copying this example or running the build.

## Start, build and test

```powershell
npm.cmd run dev
# Open http://127.0.0.1:3000 ; Ctrl+C stops the server.
```

`npm run dev` reads `.env`, then `.env.local`. The server binds only to loopback and serves an explicit public-file allowlist; it does not serve environment files or SQL. Use a second PowerShell window for checks:

```powershell
npm.cmd run build
$env:TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55432/postgres'
try {
  npm.cmd test
} finally {
  Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
}
git status --short
```

That test URL is for the disposable Docker instance only. A password-protected local test instance needs its own local owner URL. Tests create/drop randomized databases and fixture accounts; never direct them at an important cluster, even through localhost forwarding. They reject non-loopback hosts. Browser suites are Python/Playwright scripts under `tests/`; they now support Windows using an installed Playwright Chromium or the `RIMDAN_CHROMIUM` executable override. Manual Windows UI checks: both languages/pads, draft save/reopen, mobile preview, signature/stamp drawing/placement, manager actions, employee finalized-only reads and denied output.

Docker cleanup (destroys this disposable local data):

```powershell
docker stop rimdan-local-pg
```

The historical backend preparation below was validated on Linux. The hardening patch was tested natively on Windows/PowerShell with PostgreSQL 18 and headless Chromium; see SECURITY_HARDENING.md for current evidence. Docker Desktop, physical mobile devices and real provider connections remain unverified. Nothing here applies remote migrations, creates live users, deploys or merges.

## Historical validation recorded before migration 008

- Locked installation (`npm ci`), normal server-mode static build, JavaScript syntax and whitespace checks passed. Production dependency audit reported zero known vulnerabilities.
- Backend suite: 10 passed, 0 failed, on disposable local PostgreSQL 16. Backend browser integration passed local fixture invitations, role-aware navigation, private mark persistence, finalized-only employee reads/output denial and legacy import preservation.
- Existing editor, signature/stamp and official-letterhead browser suites passed; the latter tested 12 template/language combinations and A4 PDF exports.
- Full mobile suite passed seven widths in both languages, all screens, 84 template edit/save/reopen flows, touch drawing/placement/resizing, preview zoom and multipage PDF parity.
- Startup from a directory containing spaces passed; `.env.local` overrode `.env`; environment/server/SQL paths returned 404. This is Linux coverage of encoded path handling, not a native Windows test.
- `.env.local` is ignored; only `.env.example` is tracked. Secret-pattern checks of tracked text and reachable Git history found no obvious credentials. Official pads match `origin/main` byte-for-byte, and the backend retains the approved editor/mobile commits.
- The historical validation above predates migration 008. Current Windows hardening results are recorded in SECURITY_HARDENING.md. No remote migration, production account, deployment or merge was performed.

## Manual Supabase setup from Windows PowerShell (operator-run only)

Review SECURITY_HARDENING.md first. These commands are instructions for you; the implementation did not connect to your project. Use a dedicated Rimdan project, Node 24, Git and `psql` (PostgreSQL bin directory on PATH). Keep migrations/bootstrap out of installation, startup, build and Vercel. Do not run test suites against Supabase.

1. In Supabase Dashboard, open **Integrations > Data API** overview, turn off **Enable Data API**, and save. In Data API settings, also turn off **Automatically expose new tables** before disabling the API if needed. Keep it disabled: this application uses PostgreSQL directly and does not need REST/GraphQL or Supabase API keys. Disabling the Data API does not disable Supabase Auth or Storage; those services are unused here. Check the saved toggle after refreshing the page. If the Data API must serve another application, separate the projects before continuing. [Supabase's current procedure](https://supabase.com/docs/guides/api/securing-your-api) describes the setting and grant distinction.
2. Back up an existing database and its migration ledger. Stop application traffic and old migration processes. For an existing installation, use the exact same owner that created its application objects. Never rewrite 001–007 or delete ledger rows; follow the reconciliation procedure on any checksum mismatch.
3. Open Dashboard **Connect**. Choose **Direct connection** (IPv6) or **Session pooler** (IPv4). Copy the exact hostname/user/port, not the sample values. Direct owner user is `postgres`; shared session user is `postgres.PROJECT_REF`, port 5432. Download the root certificate from database settings and save it outside the repository. Do not use the transaction endpoint for operator commands.

Start in the existing project folder:

```powershell
Set-Location 'D:\BalochDev AI\rimdan-dms-feature-multi-user-backend'
node --version
npm.cmd ci
# Copy only if absent; never overwrite your existing local settings.
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
$caFile = (Resolve-Path (Read-Host 'Downloaded Supabase root CA file path')).Path
$env:DATABASE_SSL_CA = Get-Content -LiteralPath $caFile -Raw
$ownerHost = Read-Host 'Exact direct or session-pooler host from Connect'
$ownerUser = Read-Host 'Owner username from Connect (postgres or postgres.PROJECT_REF)'
$ownerPort = 5432

function New-RimdanDatabaseUrl {
  param([string]$DbHost, [int]$DbPort, [string]$DbUser)
  $secret = Read-Host 'Database password (not API key)' -AsSecureString
  try {
    $encodedPassword = [Uri]::EscapeDataString([Net.NetworkCredential]::new('', $secret).Password)
    $encodedUser = [Uri]::EscapeDataString($DbUser)
    return "postgresql://${encodedUser}:${encodedPassword}@${DbHost}:${DbPort}/postgres?sslmode=verify-full"
  } finally {
    $secret.Dispose()
    Remove-Variable encodedPassword -ErrorAction SilentlyContinue
  }
}
$env:MIGRATION_DATABASE_URL = New-RimdanDatabaseUrl $ownerHost $ownerPort $ownerUser
node scripts/migrate.js --approve-production
if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Stop and investigate; do not bootstrap.' }
node scripts/verify-isolation.js --approve-production --require-api-roles
if ($LASTEXITCODE -ne 0) { throw 'Isolation failed. Stop; keep the Data API disabled.' }
```

`--approve-production` is the deliberate remote-operation guard for your manual commands. Scripts do not load `.env.local` unless you explicitly add Node's `--env-file` option. Never print the constructed URL, use `Write-Host` on secrets, or paste passwords into command arguments. The password/URL is briefly present in this trusted process's memory/environment. The full pending batch commits atomically; already-matching files are skipped.

Create the least-privilege runtime login interactively, using the same owner endpoint. `-W` prompts for the owner password without putting it in shell history. `PGSSLROOTCERT` is for psql; Node uses the PEM environment variable configured above.

```powershell
$env:PGSSLMODE = 'verify-full'
$env:PGSSLROOTCERT = $caFile
psql -h $ownerHost -p $ownerPort -U $ownerUser -d postgres -W
```

Inside psql, on a new setup only:

```sql
\set ON_ERROR_STOP on
CREATE ROLE rimdan_app LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE postgres TO rimdan_app;
GRANT rimdan_runtime TO rimdan_app;
\password rimdan_app
SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication
FROM pg_roles WHERE rolname IN ('rimdan_app','rimdan_runtime');
SELECT pg_has_role('rimdan_app','rimdan_runtime','USAGE') AS must_be_true,
       has_schema_privilege('rimdan_app','public','CREATE') AS must_be_false;
SELECT ssl, version, cipher FROM pg_stat_ssl WHERE pid=pg_backend_pid();
\q
```

If `rimdan_app` already exists, inspect its attributes, parent memberships and ownership instead of repeating CREATE ROLE. Do not grant `postgres`, any provider admin role, or API-role membership to it. Provider permission errors must be investigated, never worked around with owner credentials in the web app.

Bootstrap the first Administrator only on an empty accounts table, after isolation verification. Existing installations skip this step and retain their Administrator:

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL = Read-Host 'First Administrator email'
$adminSecret = Read-Host 'Administrator password (12-128 characters)' -AsSecureString
try {
  $env:BOOTSTRAP_ADMIN_PASSWORD = [Net.NetworkCredential]::new('', $adminSecret).Password
  node scripts/bootstrap-admin.js --approve-production
  if ($LASTEXITCODE -ne 0) { throw 'Bootstrap failed; inspect before retrying.' }
} finally {
  $adminSecret.Dispose()
  Remove-Variable adminSecret -ErrorAction SilentlyContinue
  Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD, Env:BOOTSTRAP_ADMIN_EMAIL, Env:MIGRATION_DATABASE_URL -ErrorAction SilentlyContinue
}
```

Remove `MIGRATION_DATABASE_URL` even when skipping bootstrap or if any earlier step fails. Only the runtime connection belongs in `.env.local`/Vercel. For a manual runtime smoke test, copy the **Transaction pooler** host from Connect; custom-role username is `rimdan_app.PROJECT_REF` and port is 6543:

```powershell
$appHost = Read-Host 'Exact shared transaction-pooler host from Connect'
$appUser = Read-Host 'rimdan_app.PROJECT_REF'
$env:DATABASE_URL = New-RimdanDatabaseUrl $appHost 6543 $appUser
$env:APP_ORIGIN = 'http://127.0.0.1:3000'
$env:APP_ENV = 'development'
node --input-type=module -e "import {transaction,closeDatabase} from './server/db.js'; try { await transaction(async c => { const r=await c.query('SELECT ssl,version,cipher FROM pg_stat_ssl WHERE pid=pg_backend_pid()'); console.log(r.rows); }); } finally { await closeDatabase(); }"
if ($LASTEXITCODE -ne 0) { throw 'Runtime role/TLS check failed.' }
npm.cmd run dev
# Visit exactly http://127.0.0.1:3000 and sign in; Ctrl+C stops the server.
```

Local development cookies are allowed only on loopback in development. For a future Vercel configuration, manually set server-only `DATABASE_URL` to the custom transaction-pooler URL with `sslmode=verify-full`, `DATABASE_SSL_CA` to the provider PEM, `APP_ENV=production`, and `APP_ORIGIN` to the exact HTTPS deployment origin. Set no owner/bootstrap variables or Supabase API keys there. node-postgres uses unnamed queries, and actor/search_path state is transaction-local. No deployment is part of these instructions.

After the local smoke test, clear temporary variables. For persistent local settings, enter only the runtime URL and appropriate CA configuration into the ignored `.env.local` using your editor; never save owner/bootstrap credentials there.

```powershell
Remove-Item Env:DATABASE_URL, Env:DATABASE_SSL_CA, Env:MIGRATION_DATABASE_URL, Env:PGSSLMODE, Env:PGSSLROOTCERT -ErrorAction SilentlyContinue
Remove-Item Function:New-RimdanDatabaseUrl -ErrorAction SilentlyContinue
```

Recheck the Data API toggle and rerun `verify-isolation.js --approve-production --require-api-roles` with temporary owner credentials after future schema/provider changes. The SQL check reports eleven tables, seventeen functions and all three API roles; any denial failure stops the migration before commit. It verifies SQL isolation even when the HTTP API is disabled.


## Native Windows browser regressions

Use a disposable local cluster for TEST_DATABASE_URL. Install test tooling into the ignored local directory. `pdfinfo` (Poppler) must be on PATH for the letterhead/mobile PDF assertions.

```powershell
py -m venv .local/browser-venv
& ./.local/browser-venv/Scripts/python.exe -m pip install playwright==1.58.0
& ./.local/browser-venv/Scripts/python.exe -m playwright install chromium
$env:TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55432/postgres'
$env:RIMDAN_TEST_ARTIFACTS = "$PWD/.local/browser-results"
& ./.local/browser-venv/Scripts/python.exe tests/backend_browser.py
# The next build is ONLY for offline prototype browser regressions.
$env:RIMDAN_MODE = 'prototype'
npm.cmd run build
Remove-Item Env:RIMDAN_MODE
& ./.local/browser-venv/Scripts/python.exe -m http.server 8000 --bind 127.0.0.1 --directory public
```

In a second PowerShell window, from the repository root:

```powershell
$env:RIMDAN_TEST_ARTIFACTS = "$PWD/.local/browser-results"
& ./.local/browser-venv/Scripts/python.exe tests/browser_smoke.py
& ./.local/browser-venv/Scripts/python.exe tests/document_marks.py
& ./.local/browser-venv/Scripts/python.exe tests/letterheads.py
& ./.local/browser-venv/Scripts/python.exe tests/mobile_ux.py
```

Stop the temporary HTTP server with Ctrl+C. Then run `npm.cmd run build` without RIMDAN_MODE to restore the authenticated server-mode output. Serve only `public` with the temporary static server. For an existing Chromium installation set `RIMDAN_CHROMIUM` to its absolute executable path; no product code changes are needed.
