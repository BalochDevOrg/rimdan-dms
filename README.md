# Rimdan Trade — Document Studio Prototype

Bilingual Persian RTL / English LTR static document workspace. This is a browser-local prototype, not secure cloud storage or multi-user document management.

## Run

From the checkout, run `python3 -m http.server 8000 --bind 127.0.0.1` and open the local server in your browser. There is no build step, package installation, database, or application credential requirement.

## Document workspace

- Desktop controls on the left, scaled A4 preview on the right; stacked mobile layout.
- Recipient, subject/title, number, editable date, and body update the preview immediately.
- Font family, point size, bold, italic, underline, alignment, and line spacing apply to the entire body. Formatting individual selections is not implemented.
- Six templates provide editable starter text. These are not accounting forms and perform no financial calculations.
- Save and reopen drafts, duplicate a draft, and search/filter the existing document library. Older prototype drafts remain compatible.
- Document language is saved independently of interface language. Switching the interface preserves unsaved input. Persian previews use RTL and Persian calendar formatting; the native date input stores an ISO Gregorian date.
- Unsaved navigation and browser-close warnings; explicit save errors when browser storage is unavailable or full.
- Print and Export PDF both use the browser print dialog. Choose Save as PDF for a PDF; automatic file download is not provided.

## Branding and letterhead

The repository contains the supplied `assets/logo.png`. The original full-page letterhead shown in the design reference is **not available as a repository asset**. The default generated letterhead uses the original logo, existing company details, and a faint logo watermark; it is provisional, not a reproduction of the reference artwork.

In the editor, expand **Company letterhead** and import the original blank PNG/JPEG/WebP (up to 3 MB, at least 400 × 600 pixels). The exact image is retained in this browser's localStorage and fitted without cropping to A4; the original pixels are not edited. This is a browser-wide setting, not a per-draft attachment. Import/remove does not alter document text. Review date/number placement and content before printing. To distribute the actual artwork with the site, an accessible original file must still be added to the repository in a subsequent change.

Print uses A4 with 18 mm page margins. Imported artwork extends into those margins; physical edge-to-edge output requires a printer supporting borderless A4. Turn off browser headers/footers and use 100% scale. Background graphics may need enabling for the provisional watermark. The screen scales a physical A4 canvas; long content expands with a warning and flows across printed pages. Repeated original letterhead on continuation pages and a paginated screen preview are not implemented. Imported artwork is intended for single-page letters. The provided reference image has a different aspect ratio from A4; fitting preserves its ratio and can leave narrow white edges.

## Validation

No test runner existed in the initial repository. A browser regression script is now provided:

```sh
# Requires Python Playwright and Chromium; already available in the tested cloud environment.
python3 tests/browser_smoke.py
node --check script.js
```

Start the static server first. Override `RIMDAN_TEST_URL` if needed, `RIMDAN_TEST_ARTIFACTS` for screenshots/PDFs (default `/tmp`). Tests use an isolated browser context and fictional drafts, including an injected legacy draft and a synthetic blank image for letterhead import. They do not touch your normal browser data. Tests cover editing, formatting/date persistence, saving/reopening, duplication, library search, language/direction, discarded-navigation cancellation, template replacement, storage failure, artwork import/removal/reload, six viewport widths, PDF action and rendering. PDF dimensions/page counts can be checked with `pdfinfo`.

## Limitations

No authentication, database, synchronization, approvals, audit history, backup, secure storage, or access controls. Clearing browser storage removes drafts and imported artwork. Use fictional data only. Google Fonts are optional external requests; local fallback fonts are provided. Actual printed output and localized typography require review on target browsers/printers. Interface labels and starter templates are bilingual; user-authored content is never automatically translated.
