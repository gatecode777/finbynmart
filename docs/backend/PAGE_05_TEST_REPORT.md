# Page 05 test report

2026-11-02. Only tests that were run are listed.

## Environment

Windows 11, Node 26.5, Chrome (headless) through `puppeteer-core`, Next.js 15.5 production build (`next build` into `.next-audit`) served by `next start` on port 3100, MongoDB Atlas database `finbynmart_test` (throwaway, dropped afterwards). Scripts: `docs/page-reports/tools/` (`05-all-products-test.mjs`, `05-all-products-perf.mjs`, `build-and-serve-test.sh`, `clear-test-rate-limits.mjs`). Catalog expectations are computed from `db/seed/*.csv` by the test itself. There is no unit-test framework and no CI in the project; these are integration and browser scripts.

## Results

| Suite | Result |
|---|---|
| `05-all-products-test.mjs` (76 page checks, 41 API checks) | **117 / 117 passed** |
| `02-all-categories-test.mjs` | 54 / 54 |
| `03-04-category-subcategory-test.mjs` | 95 / 95 |
| `site-functional-regression-test.mjs` | 38 / 38 |
| `backend-pages-1-4-ui-test.mjs` | 21 / 21 |
| `backend-pages-1-4-test.mjs` | 54 / 54 |
| `npx tsc --noEmit`, `npm run lint` | clean |
| `next build` | passes |

Failures found and fixed during the work (all real or test-isolation issues, none hidden): the mobile filter drawer stayed open after Apply once forms navigated on the client (fixed in `FilterDrawer`); the old bucket MOQ test assumed one unit (updated to per-unit); the login-throttle check assumed no earlier attempts from the same address (relaxed); the functional sign-in check accepted only the wrong-password message and not the throttle message (accepts both); several of the new test's own selectors (hidden `innerText`, default-checked radio, `next/image` URLs, the header's own requirement link, a page number above the API cap, a JSON-LD array) were corrected.

## Coverage against the PRD list

| PRD area | Tests |
|---|---|
| Product listing, pagination, empty catalogue | 5-01…5-11, A1, A3, A5, A19 (an empty catalogue itself cannot be produced: the catalog is fixed data) |
| Unpublished, inactive, invalid references | A21 asserts the total equals the independently computed eligible set; the seed has **no** inactive-seller products and no invalid references, so exclusion is not exercised by data |
| Search: name, brand words, case, empty, invalid, with filters | 5-20…5-32, A10…A12, A15 (there is no model or SKU field) |
| Filters: category, subcategory, supplier type, price, MOQ and unit, location, combined | 5-40…5-59, A13, A14, A16, A24 (no brand, availability or currency data) |
| Sorting | 5-65, 5-68, 5-69, A6, A23 (newest and popularity are rejected: no data) |
| Suppliers: mapping, public data, verification, private fields | 5-51, 5-72, 5-73, A2, A18 |
| Images: local, remote, missing, arrays | 5-70, 5-71, A17 (the image normaliser's array/object/invalid branches are covered by code, not by a dedicated test; no catalog or sample record has a missing or invalid image) |
| Wishlist | 5-76, 5-77 (signed-out redirect, signed-in persistence and read-back); add/remove/duplicate/cross-account in the Pages 1–4 backend suite |
| Quotations and requirements | Quote link 5-74; requirement banner and prefill 5-78, 5-79; persistence and validation in the Pages 1–4 backend suites |
| Integration: refresh, URL sync, API errors | 5-21, 5-30…5-32, 5-60…5-67, A4…A13 |
| Mobile drawer, responsive | 5-90…5-92 and the responsive audit |

Not run: accessibility audit tooling, Lighthouse, Firefox, Safari, real devices, real browser zoom, keyboard-only walkthrough of the new controls, a load test beyond the sequential measurement below.

## Performance measurement

Local, same machine as the server, one client, sequential requests, production build, cold server (`docs/page-reports/tools/05-all-products-perf.mjs`):

| Measure | Result |
|---|---|
| First API request after a server start (builds the in-memory index; the harness also requested `/` just before) | 1,944 ms |
| `GET /api/public/products`, 100 varied queries (includes the MongoDB rate-limit round trip) | min 55, p50 77, **p95 106**, max 138 ms |
| `GET /products` server-rendered HTML, 100 varied queries | min 56, p50 110, **p95 194**, max 308 ms |

The PRD's suggested target (p95 under 800 ms) is met in this setup. It says nothing about production: network latency, a remote database for the rate limiter, serverless cold starts (each cold instance pays the index build) and concurrent load were not measured.
