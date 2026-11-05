# Page 34 — Test report

Run 2026-11-04 on a production build (`.next-audit`, `next start` on port 3100), throwaway database `finbynmart_test` (dropped afterwards).

## Results

| Suite | Result |
|---|---|
| `saved-suppliers-test.mjs` (API + browser + performance) | **69 / 69** (A access 5, B isolation 6, C list 17, D summary 4, E remove / bulk / clear 7, F comparison 6, G cap 2, H pages 17, R responsive 2, P performance 3) |
| `saved-suppliers-rules-unit-test.mjs` (query parser, bulk keys, limits) | 12 / 12 |
| Regression on the same build (performance groups skipped): Page 08 suppliers 90, Page 09 supplier profile 46, Page 13 inquiry 241, Page 22 dashboard 96, Saved Products 40, Compare Products 44 (three consecutive runs), Orders 78, Quotations 99, Inquiries 98 | all passed (earlier runs of the last two are on the previous build; the code they cover did not change afterwards) |
| `npx tsc --noEmit`, `npm run lint`, production build | clean |

## Coverage

Access (anonymous, supplier, forged); isolation (single and bulk removal, comparison and compare page, clear); list contents (unavailable supplier, sample versus catalogue supplier facts, no contact or invented fields); sorting incl. most products and categories with a stable order; search over name, city, state and category with regex literal; category, state, city, type and verification filters and their combinations; paging; invalid input (rating sort, pending and rejected verification refused); the five summary numbers checked against the seed file independently; remove, bulk remove (empty, 21, invalid key, duplicates, mixed outcome), Clear All (confirmation, count, audit, repeat); comparison (columns, Not Provided, Differs, no ranking words, limits, not-saved and unavailable → 404, nothing changed); the 500 cap; the page in a real browser (cards, search, filters dialog, sort, Grid and List view, selection rules, Select All, Compare, Add to Inquiry, single / bulk / clear removals with their dialogs and toasts, empty state, 404-free compare with no selection); 16 widths (320 to 2560) in both Grid and List view for horizontal overflow, clipped text and console errors; dialog focus, Escape and labelled keyboard-focusable checkboxes; 500 saved suppliers.

## Not tested (do not assume)

Firefox, Safari, real devices, landscape, browser zoom 80–200%, screen readers, automated contrast and axe checks, Lighthouse, comparison with the reference image beyond screenshots (grid and list at 1440 and 390), the rate limits themselves, 20 / 100 / 1,000 saved suppliers. Logos, banners, ratings and reviews, verification pending / rejected, messaging and multi-supplier inquiry: BLOCKED, no data or module, nothing to test.

## Defects found while testing (fixed)

1. **Compare Products could keep five products** when six adds ran at once (found by the regression run, not by this suite): the "count, then trim" check cannot guarantee a limit under a race. The limit is now enforced by the database (four slots with a unique partial index); three consecutive runs of the 44-check suite pass.
2. In List view at 320 px the side padding left almost no room for the text; below 576 px the list rows now stack like the grid cards.
3. Test-only: a removed supplier re-saved by mistake, a regex that matched "top" inside ordinary category names, and a footer note that itself contains the words "no score or ranking".
