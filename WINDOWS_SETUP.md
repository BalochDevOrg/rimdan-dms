# Windows PowerShell — local backend development

This branch includes backend commit `5851d98`, the bilingual editor and original Persian/English letterheads, mobile tabs/zoom, and signature/stamp tools. Use Node.js **24 LTS**, Git for Windows and PostgreSQL 16+ (or Docker Desktop in Linux-container mode). Run these commands from the repository root in PowerShell. `npm.cmd` avoids PowerShell's `npm.ps1` execution-policy restrictions without changing machine policy.

**Supabase is not ready:** the security-hardening patch has not been implemented. All seven existing SQL migrations are unsafe to apply unchanged to Supabase with its API grants/defaults. See the blocker at the start of [BACKEND.md](BACKEND.md). This runbook performs local operations only. Do not use remote URLs, production credentials, `--approve-production`, live accounts or a tunnel to production.

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

These are alternatives, not two required commands. Process environment values override env-file values; clear stale variables first. `npm run migrate` does not implicitly read `.env.local`. The runner applies all seven files in order, records SHA-256 checksums in `schema_migrations`, and safely skips matching applied migrations. It refuses changed applied SQL. Installation, startup and builds never run migrations or bootstrap automatically. Do not delete ledger rows to bypass an error.

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

That test URL is for the disposable Docker instance only. A password-protected local test instance needs its own local owner URL. Tests create/drop randomized databases and fixture accounts; never direct them at an important cluster, even through localhost forwarding. They reject non-loopback hosts. Browser suites are Python/Playwright scripts under `tests/`; their Chromium executable configuration is Linux-specific today, so Windows browser automation needs additional tooling adaptation. Manual Windows UI checks: both languages/pads, draft save/reopen, mobile preview, signature/stamp drawing/placement, manager actions, employee finalized-only reads and denied output.

Docker cleanup (destroys this disposable local data):

```powershell
docker stop rimdan-local-pg
```

Validation for this change was performed on Linux, not a physical Windows/PowerShell installation. Windows path handling now uses Node's `fileURLToPath`; native Windows installation, Docker Desktop configuration and real Windows browser interaction still require verification. Nothing here applies remote migrations, creates live users, deploys or merges.

## Validation recorded for this preparation

- Locked installation (`npm ci`), normal server-mode static build, JavaScript syntax and whitespace checks passed. Production dependency audit reported zero known vulnerabilities.
- Backend suite: 10 passed, 0 failed, on disposable local PostgreSQL 16. Backend browser integration passed local fixture invitations, role-aware navigation, private mark persistence, finalized-only employee reads/output denial and legacy import preservation.
- Existing editor, signature/stamp and official-letterhead browser suites passed; the latter tested 12 template/language combinations and A4 PDF exports.
- Full mobile suite passed seven widths in both languages, all screens, 84 template edit/save/reopen flows, touch drawing/placement/resizing, preview zoom and multipage PDF parity.
- Startup from a directory containing spaces passed; `.env.local` overrode `.env`; environment/server/SQL paths returned 404. This is Linux coverage of encoded path handling, not a native Windows test.
- `.env.local` is ignored; only `.env.example` is tracked. Secret-pattern checks of tracked text and reachable Git history found no obvious credentials. Official pads match `origin/main` byte-for-byte, and the backend retains the approved editor/mobile commits.
- Supabase hardening remains absent and unsafe for unchanged remote application. No remote migration, production account, deployment or merge was performed.
