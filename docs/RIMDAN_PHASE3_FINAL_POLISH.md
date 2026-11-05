# Rimdan DMS — Final Phase 3 interaction pass

Implementation branch: `feature/rimdan-ux-redesign`.
This is a Preview-only change; no live Supabase migrations or Production promotion
were executed.

## Implemented
- Browser-native chooser file controls now use accessible metallic gold styling.
- Asynchronous API activity uses a delayed, steady loading overlay. A
  dismissible centered notification confirms database saves, account creation
  and authorized deletions; errors are distinct.
- Internal sensitive-action confirmations use a branded centered dialog.
  Browser-owned beforeunload dialogs remain native for browser security.
- Document library exposes Preview, Edit/Read and Delete icon controls with
  Cloud or Local indicators. Employee accounts cannot delete; backend
  authorization determines which staff members can delete particular records.
- Local prototype deletions affect localStorage only; server deletions use the
  existing versioned, audited backend and leave Production unchanged.
- Body toolbar can emphasize a **selected passage** (bold, italic, underline)
  with safe text markers. Preview and print split/render styled runs without
  interpreting HTML. Whole-document font size, font family and paragraph
  alignment continue to apply to the entire document.
- A light/dark UI appearance toggle is present in the header and Settings,
  persists locally and leaves the printed company letterhead unchanged.
- Admin account management has explicit role edit and access-removal actions.
  Removal deactivates a Manager/Employee account, revokes sessions, and
  preserves historical documents and audit records. It is **not a destructive
  account/database erase**. Manager/Employee accounts cannot use the Accounts
  API. Sole Administrator cannot be removed.
- The signed-in signature and stamp panel no longer claims that the system is
  merely an insecure browser prototype; uploads are previewed locally until
  saving the document to company storage.

## Scope and limitations
- Inline styling is lightweight and uses readable plaintext markers in the
  input editor (`**bold**`, `*italic*`, `++underline++`). This is not a
  full Word-compatible WYSIWYG editor and does not support pasting arbitrary
  rich HTML. Existing plain-text documents remain compatible.
- Export is the existing browser print-to-PDF flow, not a server-rendered PDF.
- User-targeted document visibility and reset-token workflows remain gated
  until database migration 009 can be securely reviewed and applied. No
  billable staging database was created.
- OS/browser-level unsaved-tab closing confirmation cannot be restyled by a
  website, though in-app navigation now uses the branded dialog.
- Do not promote to Production until an Administrator has manually verified
  document and account workflows on Preview.

## Verification
Automated CI: disposable PostgreSQL backend/security tests, legacy 001–008
schema test, bilingual Chromium login/startup test, browser UI workflow test
including selection-only formatting and role-limited account removal,
Persian/English A4 PDF page count test, packaged asset check, dependency
audit and unchanged-migration ledger check.

Review CI results for the branch head. A Vercel READY build means deployment
completed; it does not independently prove successful authenticated workflows
against the live company database.
