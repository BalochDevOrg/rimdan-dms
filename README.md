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

## Official bilingual letterheads

Original company artwork is included unchanged at `assets/persian-pad.jpg` (853 × 1280) and `assets/english-pad.png` (1055 × 1491). Every template automatically follows the **document language**, independently of the interface language. Drafts persist `language` and `letterhead` (`official-fa`, `official-en`, or `custom`). Existing drafts without a pad selection receive the appropriate official default when opened; their body and formatting remain intact.

Both images are fitted and centered on physical 210 × 297 mm A4 pages without stretching or cropping. The Persian pad's narrower proportions leave approximately 6 mm white side margins; the English pad is almost exactly A4. Original colors, logos, watermark, printed field labels and contact details come exclusively from the background image. The old generated header/footer/logo are hidden. The files are not resized, recompressed or otherwise edited on disk.

Editable date and document number values occupy the artwork's printed entry lines, using language-specific physical offsets; labels are not duplicated. Persian dates use the Persian calendar, English dates use day/month/year. The native date input continues to store Gregorian ISO dates. Subject, recipient and body start at 98 mm from the page top and stop at 242 mm, protecting both letterheads' header, printed fields and footer. Very long metadata fields are constrained to their allotted spaces and trigger a warning; shorten them before printing. Body text is measured with the actual typography and split across additional A4 pages without dropping characters. Each page repeats the background, date/number, subject and recipient. Signature/stamp placements remain on the first page only. This is automatic pagination, not a full word processor with manual page breaks or rich-text selection formatting.

The existing custom-image import remains available under **Company letterhead**. Import PNG/JPEG/WebP up to 3 MB, at least 400 × 600 pixels. It explicitly switches the current draft to a custom pad, embeds that image in the draft, and marks the draft unsaved. Choose the official option or remove the custom pad to restore the language-appropriate default; save to persist this choice. Legacy browser-wide imported images remain available for explicit custom selection, but never replace official defaults automatically. Custom date offsets and safe writing areas assume a compatible layout and require manual review.

Preview zoom changes only screen scale, including mobile. All pages print at A4 with the same internal layout and full-page image fit, even without a signature/stamp. Choose 100% scale and disable browser headers/footers. Physical edge-to-edge output requires a borderless-capable printer. Original raster resolution limits print sharpness; no synthetic upscaling is applied. Review generated PDFs and physical printer output before business use.

## Signature and company stamp

Expand **Signature and company stamp / امضا و مهر شرکت** in the editor. Upload your own PNG, JPEG or WebP, or draw a signature with a mouse, pen or touchscreen. No stamp generator or authentic-looking sample stamp is included. Drawing is optional; uploading an image is the keyboard-accessible alternative.

Upload and **Preview drawing** only prepare a pending image. Nothing is applied until you choose **Place / replace on document**. Replacing preserves placement. Clear removes the pending image; Remove from document removes the placed asset. Save the draft to persist placement or removal. Each draft supports one signature and one stamp. Duplicate draft explicitly copies the draft's placed assets; new documents start without them. Pending images and drawings are memory-only and are cleared when opening another draft or creating a new one. A drawing survives interface-language rerendering but is not saved until it has been placed and the draft saved.

Enable Position marks in Preview, then drag an image with a mouse or use its move handle to reposition it; drag the lower corner to resize with its aspect ratio preserved. Touch/pen movement starts only on a handle so image scrolling stays safe. On mobile, move and resize handles retain 44 × 44 CSS-pixel touch targets even when the page preview scales down. Numeric fields specify distance from the physical left/top page edges and width in millimetres, regardless of interface language. Focus a placed image or either handle: arrow keys move 1 mm (Shift: 5 mm), +/− resize. All methods clamp the complete image to x 18–192 mm and y 100–242 mm, protecting the header and footer of the known Rimdan layout. Older placements extending below the new 242 mm boundary are clamped upward on opening and persisted on the next Save. Custom artwork is not automatically analyzed; check its protected regions and manually avoid overlapping body text or the other asset.

PNG/WebP alpha is preserved. Drawings default to transparent and can be given an opaque white background. The optional signature-only near-white removal removes pixels with every RGB channel at least 245; it can remove light-colored ink and is not a sophisticated background-removal tool. Stamp backgrounds are never altered beyond raster normalization.

Uploads require matching MIME and PNG/JPEG/WebP magic bytes, at most 2 MB, dimensions no greater than 4096 per side or 12 megapixels, and aspect ratio 1:5 through 12:1. Decoded images are rasterized to PNG with their longest side capped at 1200 pixels, stripping original metadata. Converted data must fit 1.5 million characters; some high-detail images need reducing before import. SVG, external image URLs, corrupt files and unsupported types are rejected. Reopened mark sources are restricted to embedded PNG data; coordinates are normalized again.

Images and coordinates are embedded **only in that draft** under its `marks.signature` and `marks.stamp` fields in the existing browser-local draft store. There is no global signature/stamp library, upload endpoint, or organizational sharing feature. This is not permission isolation: anyone with access to the same browser profile/site storage can read its drafts and assets. Secure organizational asset management, role permissions, revocation, audit and authenticity verification require a production backend. Avoid real sensitive signatures in this prototype. Imported letterhead retains its existing separate browser-wide behavior.

Placed assets print/export on the **first page only** at the same physical coordinates as the live preview. Official-pad documents use a full A4 named print page with internal writing margins, avoiding shrink-to-fit from full-page artwork. Print handles and editor outlines are excluded. Use 100% print scale with browser headers/footers off. Long bodies flow across measured A4 preview/print pages, but there is no signature/stamp page selector, repeated signature/stamp, automatic text wrap around assets or collision detection. Review the PDF before use; physical printer borderless limits and browser differences remain.

## Mobile workspace

At widths below 900 CSS pixels, **Edit / ویرایش** and **Preview / پیش‌نمایش** tabs provide one workspace without losing input or drawings. Document setup and formatting groups collapse by default; expand them for template/language, letterhead and typography controls. The action bar keeps Save, Print and PDF available in both tabs and displays save/errors inline. At 900 pixels and above, the editor and preview share a split layout. Navigation is a keyboard-accessible drawer through 1100 pixels, freeing tablet space.

Preview opens in **Fit page** mode, preserving the complete A4 aspect ratio. +/− controls zoom up to 300% relative to Fit; drag empty space with a mouse, scroll/pan with one finger, or pinch with two fingers. Zoom only changes the screen view. Print/PDF retains physical dimensions and pagination, including when printing from Edit or while zoomed.

Marks start locked in Scroll mode, including after reopening a draft. Choose **Position marks** to show large move/resize handles. A finger or pen on an image itself continues to scroll; use a handle for deliberate placement. Mouse image dragging, keyboard arrows and numeric fields are retained in placement mode. Use **Signature / stamp tools** to return directly to the Edit tools. The larger proportional drawing pad accepts mouse, touch and pen input without stretching strokes.

Phone inputs use readable text and touch targets. VisualViewport events adapt the action bar to reduced visible space; short-view and focus checks are simulated in Chromium, not verified on physical iOS/Android keyboards. See [the mobile audit](MOBILE_UX_AUDIT.md) for findings, breakpoints, test coverage and remaining limitations.

## Validation

No test runner existed in the initial repository. Browser regression suites are provided:

```sh
# Requires Python Playwright and Chromium; already available in the tested cloud environment.
python3 tests/browser_smoke.py
python3 tests/document_marks.py
python3 tests/letterheads.py
python3 tests/mobile_ux.py
node --check script.js
node --check document-marks.js
node --check letterheads.js
node --check mobile-ux.js
```

Start the static server first. Override `RIMDAN_TEST_URL` if needed, `RIMDAN_TEST_ARTIFACTS` for screenshots/PDFs (default `/tmp`). Tests use an isolated browser context and fictional drafts, including an injected legacy draft and a synthetic blank image for letterhead import. They do not touch your normal browser data. Tests cover editing, formatting/date persistence, saving/reopening, duplication, library search, language/direction, discarded-navigation cancellation, template replacement, storage failure, artwork import/removal/reload, six viewport widths, PDF action and rendering. The signature/stamp suite additionally covers real mouse/pen/touch events, explicit placement, image validation/transparency, numeric/keyboard bounds, replacements/removals, draft isolation, unsafe restored-source rejection, and print coordinates with provisional and imported letterhead. The official-letterhead suite exercises both languages and all six templates (12 combinations), editable fields, original asset paths, safe writing geometry, marks, reopening, mobile widths, and A4 PDF page-count parity, including lossless long-body pagination. Tests use abstract mark fixtures, never authentic-looking test stamps. PDF dimensions/page counts are checked when `pdfinfo` is available. Test screenshots and PDFs are written under `/tmp` by default.

## Limitations

No authentication, database, synchronization, approvals, audit history, backup, secure storage, or access controls. Clearing browser storage removes drafts and imported artwork. Use fictional data only. Google Fonts are optional external requests; local fallback fonts are provided. Actual printed output and localized typography require review on target browsers/printers. Interface labels and starter templates are bilingual; user-authored content is never automatically translated.
