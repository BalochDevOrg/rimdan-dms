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

## Signature and company stamp

Expand **Signature and company stamp / امضا و مهر شرکت** in the editor. Upload your own PNG, JPEG or WebP, or draw a signature with a mouse, pen or touchscreen. No stamp generator or authentic-looking sample stamp is included. Drawing is optional; uploading an image is the keyboard-accessible alternative.

Upload and **Preview drawing** only prepare a pending image. Nothing is applied until you choose **Place / replace on document**. Replacing preserves placement. Clear removes the pending image; Remove from document removes the placed asset. Save the draft to persist placement or removal. Each draft supports one signature and one stamp. Duplicate draft explicitly copies the draft's placed assets; new documents start without them. Pending images and drawings are memory-only and are cleared when opening another draft or creating a new one. A drawing survives interface-language rerendering but is not saved until it has been placed and the draft saved.

Drag an image or its move handle to reposition it; drag the lower corner to resize with its aspect ratio preserved. On mobile, move and resize handles retain 44 × 44 CSS-pixel touch targets even when the page preview scales down. Numeric fields specify distance from the physical left/top page edges and width in millimetres, regardless of interface language. Focus a placed image or either handle: arrow keys move 1 mm (Shift: 5 mm), +/− resize. All methods clamp the complete image to x 18–192 mm and y 100–250 mm, protecting the header and footer of the known Rimdan layout. Custom artwork is not automatically analyzed; check its protected regions and manually avoid overlapping body text or the other asset.

PNG/WebP alpha is preserved. Drawings default to transparent and can be given an opaque white background. The optional signature-only near-white removal removes pixels with every RGB channel at least 245; it can remove light-colored ink and is not a sophisticated background-removal tool. Stamp backgrounds are never altered beyond raster normalization.

Uploads require matching MIME and PNG/JPEG/WebP magic bytes, at most 2 MB, dimensions no greater than 4096 per side or 12 megapixels, and aspect ratio 1:5 through 12:1. Decoded images are rasterized to PNG with their longest side capped at 1200 pixels, stripping original metadata. Converted data must fit 1.5 million characters; some high-detail images need reducing before import. SVG, external image URLs, corrupt files and unsupported types are rejected. Reopened mark sources are restricted to embedded PNG data; coordinates are normalized again.

Images and coordinates are embedded **only in that draft** under its `marks.signature` and `marks.stamp` fields in the existing browser-local draft store. There is no global signature/stamp library, upload endpoint, or organizational sharing feature. This is not permission isolation: anyone with access to the same browser profile/site storage can read its drafts and assets. Secure organizational asset management, role permissions, revocation, audit and authenticity verification require a production backend. Avoid real sensitive signatures in this prototype. Imported letterhead retains its existing separate browser-wide behavior.

Placed assets print/export on the **first page only** at the same physical coordinates as the live preview. Signed documents use a full A4 named print page with 18 mm internal margins (and existing letterhead spacing), avoiding shrink-to-fit from full-page artwork. Print handles and editor outlines are excluded. Use 100% print scale with browser headers/footers off. Long documents still flow across pages, but there is no page selector, repeated signature/stamp, automatic text wrap around assets or collision detection. Review the PDF before use; physical printer borderless limits and browser differences remain.

## Validation

No test runner existed in the initial repository. A browser regression script is now provided:

```sh
# Requires Python Playwright and Chromium; already available in the tested cloud environment.
python3 tests/browser_smoke.py
python3 tests/document_marks.py
node --check script.js
node --check document-marks.js
```

Start the static server first. Override `RIMDAN_TEST_URL` if needed, `RIMDAN_TEST_ARTIFACTS` for screenshots/PDFs (default `/tmp`). Tests use an isolated browser context and fictional drafts, including an injected legacy draft and a synthetic blank image for letterhead import. They do not touch your normal browser data. Tests cover editing, formatting/date persistence, saving/reopening, duplication, library search, language/direction, discarded-navigation cancellation, template replacement, storage failure, artwork import/removal/reload, six viewport widths, PDF action and rendering. The signature/stamp suite additionally covers real mouse/pen/touch events, explicit placement, image validation/transparency, numeric/keyboard bounds, replacements/removals, draft isolation, unsafe restored-source rejection, and print coordinates with provisional and imported letterhead. It uses abstract image fixtures, never authentic-looking test stamps. PDF dimensions/page counts are checked when `pdfinfo` is available. Test screenshots and PDFs are written under `/tmp` by default.

## Limitations

No authentication, database, synchronization, approvals, audit history, backup, secure storage, or access controls. Clearing browser storage removes drafts and imported artwork. Use fictional data only. Google Fonts are optional external requests; local fallback fonts are provided. Actual printed output and localized typography require review on target browsers/printers. Interface labels and starter templates are bilingual; user-authored content is never automatically translated.
