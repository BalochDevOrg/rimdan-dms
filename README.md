# Rimdan Trade — Document Management Prototype

Bilingual (Persian RTL / English LTR) responsive front-end prototype prepared by BalochDev using the supplied company logo.

## Run locally

Open `index.html` in a browser. For development, alternatively run `python -m http.server 8000` in this folder and visit `http://localhost:8000`.

## Demo functionality

- Dashboard with counts and recent browser-local draft documents
- Document library with title/number/recipient search and filters
- Six template entry cards (letter, invoice, receipt, delivery, transaction, custom); **all currently open a generic text editor, not unique structured forms**
- Create, edit, save, reopen drafts using `localStorage` in the same browser
- A4-style company-logo preview and browser Print / Save as PDF
- Persian-English switching; responsive mobile navigation

## Important limitations

**Not production-ready.** No authentication, database, server, access controls, approval flow, cloud sync, backups, document versions, audit log, or specialized financial forms. Drafts remain in browser storage and may disappear if local storage is cleared. Use fictional data only. Printed output is approximate and must be checked against approved letterhead specifications. Google Fonts use an internet connection; browser fallback fonts are provided.

## Deployment

This is a static site suitable for a preview on GitHub Pages, Vercel, or Cloudflare Pages. Never describe this preview as secure DMS hosting. Do not connect real business records before implementing authenticated backend permissions and backup policies.

## Next phase

Confirm approved document samples, real workflow, users/roles, data residency, hosting, document numbering, and backup/recovery. Then develop database-backed production features separately.
