# Rimdan mobile UX audit and validation

Audited on 2 November 2026, starting at commit `70d015b`, on branch `feature/mobile-first-ux`. The existing static architecture, original artwork and browser-local draft schema are preserved.

## Scope and method

Inspected dashboard, populated document library, templates, settings and editor at **320, 360, 375, 390, 414, 768 and 1024 CSS pixels**, in Persian RTL and English LTR: 70 screen/language/width combinations. A long-title fictional legacy draft exposed intrinsic-width problems that an empty library would miss. Additional tests cover all six templates at each width/language (84 edit/save/reopen flows), mark interactions and A4 exports. Desktop split mode was checked at 1440/1600 pixels.

Measurements, screenshots, Playwright keyboard input and Chromium DevTools Protocol touch/pen events were used. Tests do **not** constitute physical-device, real iOS/Android keyboard, Safari, TalkBack or VoiceOver certification.

## Findings and fixes

| Area | Before | Implemented |
| --- | --- | --- |
| Dashboard | A seeded long document title overflowed the page at all seven widths in both languages. | Grid/panel children can shrink; titles wrap; compact document cards at widths through 1100 px. |
| Library | Horizontal table scrolling reached 519 px in the populated narrow view. | Same semantic table/data becomes a compact two-column card layout. Search occupies its own row; filters remain accessible and wrap correctly. |
| Touch controls | Examples: 39 px language control, 43 px text inputs, 37 px formatting selects, small checkbox visuals. | Buttons/selects/inputs target at least 44 px; editable phone fields are at least 48 px. Checkbox visuals are 24 px inside clickable labels of at least 44 px. |
| Phone text | Many 12–14 px editable controls risked iOS focus zoom. | Text/select/number inputs use 16 px. The body editing view has a 16 px minimum; this does not change saved typography or A4 output. File chooser text remains smaller because it does not summon a typing keyboard. |
| Editor | Roughly 1,600 px of controls before preview; preview could begin around 1,900 px down. Sticky multi-row actions could cover fields. | Below 900 px, Edit/Preview tabs share one editor state. Document setup and formatting collapse by default; mark and custom-pad tools remain available. Save/Print/PDF sit in a separate action bar with status/error feedback. |
| Tablets | At 768/1024 px, a permanent 254 px sidebar consumed useful editor width. | Drawer navigation through 1100 px. Tabbed workspace through 899 px; split workspace from 900 px. Sticky tablet preview clears the header. |
| Navigation | No backdrop, Escape closing, focus containment or restoration. | Localized drawer close control, outside-tap dismissal, Escape, Tab wrapping, inert background, restored toggle focus, current-page semantics, and reduced-motion support. |
| Preview | Width-only fit, no dedicated zoom/pan workflow; small phone text difficult to inspect. | Fit considers both available width and height. Relative zoom up to 300%, mouse grab-pan, native touch scroll, two-finger zoom, keyboard-scrollable viewport and help. Oversized content stays inside the preview scroller. |
| Mark movement | Touch on an image could start a document drag while the user meant to scroll. | Scroll mode locks placement by default and after reopening. Explicit Position marks mode enables 44 px screen-space handles. Touch/pen movement starts only on a handle; touching the image itself keeps native scrolling. Numeric controls remain available in Edit. |
| Signature drawing | A minimum displayed height could distort the source canvas ratio. | A larger 720 × 420 logical canvas and matching responsive aspect ratio preserve drawn strokes; touch drawing does not scroll the page. Existing saved signature images are unchanged. |
| Keyboard/viewport | Action group was inside the long form and had no visual-viewport handling. | VisualViewport resize/offset information raises the action bar as needed; focused fields are revealed on focus/resize. Body height adapts to short viewports. No forced focus recentering during ordinary user scrolling. |
| Feedback | Fixed toasts could overlap important actions. | Editor messages appear in the action bar. Successful Save uses its existing status line; errors remain visible without covering Print/PDF. |
| Print | New screen UI could affect named A4 page boundaries or zoom. | Tabs, anchor, navigation, actions and scroll clipping are excluded from print. Screen zoom is restored after printing; A4 dimensions, pagination and letterhead offsets remain unchanged. |

## Validation results

Passed:

- `python3 tests/browser_smoke.py`: legacy drafts, save/reopen/edit/search, formatting, language switching, custom pad import/removal, unsaved guards, failure state and responsive checks.
- `python3 tests/document_marks.py`: PNG/JPEG/WebP validation/transparency, drawing with mouse/pen/touch, keyboard/numeric bounds, handle drag/resize, replacement/removal, draft isolation and A4 placement.
- `python3 tests/letterheads.py`: both original pads × all six templates, safe geometry, reopening, mobile widths, 12 A4 exports, multipage character preservation and preview/PDF page-count parity.
- `python3 tests/mobile_ux.py`: requested width/language matrix, 84 template flows, populated screens, navigation focus, tabs, zoom/fit/pinch, locked touch scrolling, explicit handles, numeric placement, a 420 px viewport keyboard simulation, print from Edit/Preview, multipage/zoom parity and restored post-print scale.
- Additional focused 390 px checks in both languages verify that scrolling over an image in **enabled placement mode** still leaves coordinates unchanged; only handles drag.
- JavaScript syntax checks and `git diff --check`.

A real regression was found during validation: the zero-height tab scroll anchor created a leading blank page before the named A4 page. Hiding that anchor in print removed the extra page; PDF page-count assertions were retained and rerun. Existing tests were updated to explicitly close the modal drawer, enable placement mode and switch phone tabs, rather than relying on the old unrestricted drag/stacked layout. No intended assertions were disabled.

The final screen audit reports no page-level horizontal overflow and no internal horizontal library/table overflow at the requested widths. Checkbox visuals are intentionally smaller than their associated touch targets.

Screenshots and PDFs are generated in `/tmp` (or `RIMDAN_TEST_ARTIFACTS`). Examples: `rimdan-mobile-fa-390-edit.png`, `rimdan-mobile-fa-390-preview.png`, `rimdan-mobile-en-768-preview.png`, `rimdan-mobile-desktop-1440.png`, and language/template PDFs. Structured results are in `rimdan-mobile-results.json`; a focused run uses a separate filtered results file.

## Remaining limitations

- Physical devices, real OS keyboards, Safari/Firefox and assistive technologies still need manual verification. Chromium resize simulation cannot establish behavior on every mobile browser.
- Fit is a full-page overview; small text requires preview zoom. The displayed percentage is relative to Fit, not print scaling. Very short landscape/keyboard viewports may still need scrolling.
- Editing document typography affects the actual A4 preview; the on-screen body input intentionally keeps readable text and may look larger than small selected print fonts.
- Signatures/stamps remain first-page-only; there is no collision detection or flow-around-text. The original letterhead safe areas and existing per-draft bounds are retained.
- Existing prototype limitations remain: browser-profile localStorage is not secure organizational storage, and there is no authentication, cloud synchronization or authenticity verification. No framework, paid service or new backend was added.
