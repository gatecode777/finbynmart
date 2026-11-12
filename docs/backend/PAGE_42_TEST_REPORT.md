# Page 42 — test report (everything below was actually run, 2026-11-11)

Environment: production build in `.next-audit` served on :3100 with `MONGODB_DB=finbynmart_test` (throwaway; dropped afterwards), Chrome headless 1440 default, `puppeteer-core`. The first runs were built with the Page 39 dashboard page moved aside (its component `SupplierDashboard` was missing); that component has since been written and the final run (126/126) is on a normal full-tree build. `tsconfig.json` was reverted after each build.

| Suite | Result |
|---|---|
| `node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/42-supplier-quotation-rules-unit-test.mjs` | **41 / 41** (query parsing, status mapping, withdrawal policy, CSV safety) |
| `docs/page-reports/tools/42-supplier-quotations-test.mjs` | **126 / 126** |
| Regression: `29-30-buyer-quotations-test.mjs` (SKIP_PERF=1) | 99 / 99 |
| Regression: `30-quotation-rules-unit-test.mjs` | 26 / 26 |
| Regression: `portal-rules-unit-test.mjs` | 7 / 7 |
| `npx tsc --noEmit` | passes (no errors) |
| `next lint` (supplier, quotations and API folders) | no warnings or errors |
| `next build` (production) | passes on the full tree |

## Groups in the 126 (see the script for each named check)
A access (401 / 403 / suspended / redirects) · B summary, counts, tabs, version de-duplication · C tenant isolation · D search, filters, sort, pagination, privacy of rows · E detail, pricing example, versions, capabilities, no edit/PDF route · F withdrawal (confirmation, refusals, race, event, notice, counts, buyer view) · G export (CSV, filters, formula safety, logging, rate limit) · H query plans · I server-rendered pages incl. real 404s · J browser (tabs, debounced search, filter panel, dialog open / Escape / confirm, 16 widths 320–2560 without horizontal overflow, detail page widths, mobile cards, touch targets, console errors) · K scale (100 / 1,000 / 10,000 rows, plans at 10,000, deep page, 8 simultaneous requests).

## Not run / not covered
Firefox, Safari, real devices, landscape orientation, browser zoom 80–200 %, screen reader, Lighthouse, a measured contrast ratio, Page 41 integration (does not exist), Page 43 creation (does not exist), buyer-decision / expiry / order notifications to a supplier (not built), PDF and order conversion (BLOCKED), supplier staff roles (not built), multi-role. The filter "drawer" is an inline panel (no drawer component exists). Accessibility was checked only by the structural rules in the suite (labelled controls, buttons, dialog behaviour, keyboard Tab reaches a control, 40 px+ touch targets); it is not an accessibility audit.

## Findings during testing
Four test bugs were fixed (a withdrawal of a legitimately withdrawable lineage, an over-strict 404 regex, a 240/min API limit hit by the scale loop, a fixed-sleep race). Two product issues were fixed: duplicated aggregations (over target at 10,000 rows) and a wrapping "Withdraw" label in the desktop Action column. One shared-shell observation not fixed here: at 820 px the supplier top bar's search box is squeezed to a few characters (Page 39 shell).
Screenshots: `docs/page-reports/screenshots/42-supplier-quotations-desktop-1440.png`, `…-tablet-820.png`, `…-mobile-390.png`, `42-supplier-quotation-detail-1440.png`.
