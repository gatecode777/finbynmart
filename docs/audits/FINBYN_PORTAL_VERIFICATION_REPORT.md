# Finbyn Mart: authenticated portal verification (buyer, supplier, admin)

Date: 2026-11-21. Mode: verify, fix real defects found, change nothing else. Nothing was run against the live database: a **throwaway in-memory MongoDB replica set** (`mongodb-memory-server`, dev-only dependency added with your approval) was started with `docs/page-reports/tools/test-db-up.mjs`, seeded with three test identities by `test-db-seed.mjs` (buyer and supplier through the real registration endpoints, the admin inserted as an operator would), used, then stopped and discarded. Both scripts refuse anything but a 127.0.0.1 `finbyn_it_*` database. The `puppeteer-core` package used for the browser runs was installed with `--no-save`.

## 1. Authenticated page sweep (`portal-sweep.mjs`, read-only)
Signed in as each role in headless Chrome and opened every list-level portal page at 1280 and 390 px: 15 buyer, 13 supplier, 15 admin pages = 86 loads. Recorded status, final URL, h1, horizontal overflow, console errors, any 5xx response and any write request.
- Result after the fixes below: **86 of 86 clean** (200, no 5xx, one or more h1, no overflow, no console error, no write).
- Cross-portal refusal: buyer to `/supplier/dashboard`, `/admin`, `/admin/buyers`; supplier to `/buyer/dashboard`, `/admin`, `/admin/products`; admin to `/buyer/dashboard`, `/supplier/dashboard`: **8 of 8 refused** (redirect to `/forbidden`).
- Not covered: detail pages that need seeded business data (an inquiry, quotation, order, ticket, product draft), forms and actions (the sweep is read-only), widths other than 1280/390, accessibility tooling, Lighthouse, Firefox/Safari/devices. The test portals were empty, so this shows pages render in their empty state, not with real data.

## 2. Defects found and fixed
| # | Found by | Defect | Fix |
|---|---|---|---|
| 1 | Your report; reproduced and verified | The header showed "Sign In" to a signed-in visitor until the next navigation. `/api/auth/me` turned any failure (slow or erroring database) into `{ user: null }` with HTTP 200, and the header only re-checked when the path changed | `/api/auth/me` now answers 503 when it cannot tell; the header treats "unknown" as unknown (nothing shown as signed out), retries (1 s, 3 s), and re-checks on `pageshow` and tab focus; mobile menu ignores a failed answer. `header-session-check.mjs`: 5 of 5 pass, including the first one and two `/api/auth/me` calls failing |
| 2 | Sweep | `/supplier/analytics` returned **500** for a supplier: it created the `(supplierKey, createdAt)` index under the name `supplier_received_range` while the inquiries service already creates the same key pattern under its default name, so MongoDB answered `IndexOptionsConflict` (code 85). This would also fail on a real database | `analyticsService.ts` accepts code 85 (the index exists) and retries after any other failure |
| 3 | Sweep | After fix 2 the same page logged React error 418 (hydration mismatch): "Generated …" used the server's and the browser's own locale/time zone | Fixed to `en-IN` in `Asia/Kolkata` |
| 4 | Integration suites | **Cold-start deadlock in inquiry submission** (`src/lib/inquiries/service.ts`): `insertJob()` ran inside the open transaction and, on a process's first call, created indexes on `inquiries` while that transaction already held the collection, so the index build waited for the transaction and the transaction waited for the index build until the 20 s socket timeout. It affects the first inquiry or requirement after a restart on a database that lacks those indexes | `distributionCollections()` is now awaited before the transaction starts |
| 5 | Admin dashboard work (2026-11-21) | `ticketsCollection()`, `admin/productReview.ts`, `catalog/supplierPublished.ts` and `supplier/inventoryService.ts` cached a FAILED index build forever, so one transient failure broke that area until restart | each clears its cached promise on failure and retries |

## 3. Integration suites (first time any of them has run)
Run against the throwaway database, each in its own `finbyn_it_*` database. Before fix 4: 6 pass, 13 fail. After:

| Suite | Result |
|---|---|
| it-supplier-flows (7), it-lead-distribution (13), it-approved-flow (6), it-conversation-flow (9), it-requirement-flow (9), it-specifications-flow (8), it-recently-viewed (11), it-admin-categories (9), it-admin-quotations (12), it-admin-reports (10), it-admin-settings (9) | **PASS** |
| it-admin-products (check at line 56), it-admin-inquiries (line 136: expects 422, gets 409), it-admin-suppliers (line 104: expects 0 audit rows, finds 2), it-admin-buyers (line 61: contact masking assertion), it-admin-audit-logs (line 103: expects 4 events, gets 3) | **FAIL, not triaged**: each needs a decision whether the product or the test is wrong |
| it-admin-verification | **FAIL, test defect**: the fixture reuses seller key `fixture-seller-9` against the unique `company_seller_unique` index |
| it-admin-notifications | **FAIL, test defect**: the suite hands the application a session from its own MongoClient ("ClientSession must be from the same MongoClient") |

`run-integration-suites.mjs` also reports `it-supplier-flows` as FAIL although it passes 7/7 when run alone, and `it-requirement-flow` as BLOCKED on a database-name check; the runner's per-suite handling needs a look (not changed).

## 4. Other checks
`tsc`, lint, production build clean; all 60 unit scripts pass.

## 5. What this does not prove
Real-data behaviour of the buyer, supplier and admin workflows (forms, actions, detail pages), the five untriaged suite failures, the Page 55 authenticated checks, maintenance mode ON on a deployed instance, and any deployment. No change was committed.
