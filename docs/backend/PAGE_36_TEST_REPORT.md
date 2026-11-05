# Page 36 — Test report

Date: 2026-11-05. Everything below was actually run, against a production build in `.next-audit` served on port 3100, database `finbynmart_test` (dropped afterwards), Chrome (headless, `puppeteer-core`).

| Suite | Result |
|---|---|
| `36-support-rules-unit-test.mjs` (`node --import ./docs/page-reports/tools/alias-register.mjs ...`) | 29/29 |
| `36-buyer-support-test.mjs` | **75/75** |
| `npx tsc --noEmit`, `npm run lint`, production build | see final report |

Groups in the integration suite: A access (anonymous, supplier, suspended, forged cookie, page redirects, public routes) · B creation (validation, forbidden fields, related records, duplicate and simultaneous submission, unique references, rate limit) · C attachments (valid types, content/extension mismatch, wrong type, count, 413 oversize, empty file, no orphan files, private storage, owner download headers and bytes, foreign/anonymous/supplier access) · D ownership and isolation (including 405 on status change/delete, no private fields) · E status changes made in the database appear to the buyer (cards, detail, history) · F list, search, filters, sort, pagination, invalid input, summary counts · G FAQ and channels · H browser flows (page, KPIs, columns, search, filters dialog, sort, pagination, View, empty state, FAQ accordion, channels, form validation, real submit with a PDF and a double click, new row, ticket page, download, 404s) · R responsive (16 widths on two pages, phone cards vs desktop table, all seven columns visible at 900–2560, keyboard/labels) · P performance (1,000 tickets).

## Defects found by the tests and fixed
- Status-filtered lists used an index that did not match the sort (69 documents examined): added `buyer_tickets_status_newest`.
- At 1440px the table (shared 1080px minimum width) was cut off after Status; the unit/integration checks did not catch it, the screenshot did. Fixed with a compact table; check R-04 now guards it.
- Test-side issues corrected: the 10/hour creation limit hit the suite (helper now resets limits; B-12 tests the limit explicitly), a selector matching non-FAQ buttons, visually hidden labels reported as clipped.

## Regression runs after the Page 36 changes (sidebar link, new notification category, layout)
| Suite | Result |
|---|---|
| Page 22 dashboard | 96/96 |
| Pages 24 addresses | 85/85 |
| Pages 27–28 inquiries | 98/98 |
| Pages 29–30 quotations | 99/99 |
| Page 31 orders | 78/78 |
| Saved products | 40/40 |
| Saved suppliers | 66/66 |
| Compare products | 60/60 |
| Page 23 profile | 101/102 — K-01 performance: `GET company` 402 ms against a 350 ms target (not touched by this work) |
| Pages 25–26 settings/notifications | 93/94 after updating F-03 for the new always-on "support" row (now 4 switches, 2 locked) — K-02: mark-all-as-read request p95 about 1.3 s against 500 ms, a miss already documented in `PAGE_25_26_PERFORMANCE_REPORT.md`; one earlier run threw inside that performance group (a null response) and was not reproduced on the rerun |

## Not run
Lighthouse, an automated contrast tool, screen readers, Firefox, Safari, real devices, landscape and browser-zoom checks, the support-inbox e-mail send path (no provider or `SUPPORT_EMAIL` configured, so `notification.supportEmail` is only ever `not_configured` in tests), load tests, tests against a hosted database. The pages 05–13 suites were not re-run.
