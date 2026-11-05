# Page 31 — Test report

Run 2026-11-04 on a production build (`.next-audit`, `next start` on port 3100), throwaway database `finbynmart_test` (dropped afterwards). Orders were inserted directly into that database because nothing in the application creates one.

## Results

| Suite | Result |
|---|---|
| `31-buyer-orders-test.mjs` (API + browser + performance) | **83 / 83** (A access 5, B isolation 6, C listing 18, D summary 3, E details 8, F cancellation 9, G export 7, H pages 19, R responsive 3, P performance 5) |
| `31-order-rules-unit-test.mjs` (statuses, groups, counts, query parser, cancellation input, CSV safety) | 21 / 21 |
| Regression: Page 22 dashboard (all sidebar items are now links) | 96 / 96 |
| Regression: Pages 27–28 inquiries | 98 / 98 |
| Regression: Pages 29–30 quotations (one invariant changed: accepting creates no *order* for the quotation) | 99 / 99 |
| Regression: Page 23 profile 102, Pages 25–26 settings 91, Saved Products 40, Saved Suppliers 36, Compare Products 42 | all passed |
| `npx tsc --noEmit`, `npm run lint`, production build | clean |

Regression runs skipped the performance groups where the suite allows (`SKIP_PERF=1`).

## Coverage

Access (anonymous, supplier, suspended, forged); ownership (foreign and unknown references identical, foreign write untouched, export scoped); listing (default order, tabs and their exact members, exact statuses, expired expected date changes nothing, search over reference / quotation / product / supplier with regex taken literally, supplier and currency filters, India-time date windows, combined filters, six sorts including the currency rule, pagination, invalid input, DTO contents, USD kept as USD); the five numbers and the "not available" capabilities; details; cancellation (confirmation, validation, mass assignment, the eligible and the eight ineligible statuses, repeat, race, no side collections); export (headers, filters, no private fields, formula defusing, audit rows, caps); the pages in a real browser (cards, tabs, search, filters dialog, sorting, export, row menu, cancellation dialog and its toast, View Order, the order page, print view, 404, empty state); 16 widths (320–2560) on the list and an order page for horizontal overflow, clipped headings and console errors; dialog focus and Escape; 1,000 and 10,000 orders.

## Not tested (do not assume)

Firefox, Safari, real devices, landscape, browser zoom 80–200%, screen readers, automated contrast and axe checks, Lighthouse, comparison with the reference image beyond screenshots (1440 and 390), the cancellation and export rate limits themselves, 100 orders and volumes above 10,000. Payments, invoices, shipment tracking, returns and refunds, order creation, supplier and admin order management, supplier notification: BLOCKED, no module exists, nothing to test.

## Defects found while testing (fixed)

1. The order page overflowed on phones (up to 378 px at 320 px wide): the amount sentence reused the list's no-wrap style. It now wraps (R-01).
2. Test-only: wrong supplier counts in my seed expectations, an operator-style key that is correctly ignored rather than refused, a regex that matched a harmless flag name, an order already cancelled by an earlier step, a wait that matched old activity text before the page refreshed, the 20-per-10-minutes cancellation limiter being hit by the suite itself, and a stale quotation invariant.
3. Performance: without an untimed warm-up call two cold-first-request spikes appeared (see the performance report).
