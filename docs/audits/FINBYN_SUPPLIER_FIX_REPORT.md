# Supplier portal fix report (second pass)

Date: 2026-11-13 · Branch `main` · working tree on top of commit `1919536` · Plan: `FINBYN_SUPPLIER_FIX_PLAN.md`

## Summary
The remaining workflows that could be built safely are now in code: explicit order confirmation with stock reservation, product moderation, supplier notification producers, a staff support workflow and a bounded product list, plus a fail-closed isolated-test-database guard. **Everything that needs a database is still unverified**: no isolated, transaction-capable database was available (no local `mongod`, no Docker; the only configured database is live and was never used for writes). What *was* exercised for real is the production build over HTTP (route protection, removed endpoints, origin checks) and the existing responsive audit on public pages. Nothing was deployed and no production data was touched.

## Re-validation of the earlier claims
Confirmed against current code and, where possible, over HTTP on the production build: the verify-email and verify-phone routes answer **404**; `POST /api/supplier/products` answers **405**; cross-site writes to `/api/supplier/company`, `/api/supplier/notifications/read-all` and `/api/admin/company-links` answer **403**; the same writes from the same origin without a session answer **401**; unauthenticated `/supplier/*` and `/admin/*` pages redirect (307) to sign-in; `/supplier/company?tab=security` reaches the shared page flow; the genuine e-mail-token flow still writes verification with provenance. The source-regression suites (`58`, `59`, `60`, `61`) guard these structurally.

## Findings

| Finding | Fix / files | Static checks | Runtime evidence | Result | Remaining dependency |
|---|---|---|---|---|---|
| S-01 e-mail self-verify | routes and service removed; `emailVerifiedVia` provenance; `verification-provenance-dryrun.mjs` | tsc, lint, `58` | route answers 404 (HTTP, no DB) | FIXED, verified at HTTP level | dry-run script not executed (needs an approved copy); remediation of past records is a separate reviewed step |
| S-02 any 6-digit phone code | route and service removed; phone verification unavailable | `58` | route answers 404 | FIXED | an approved OTP provider |
| D-01 seller to company link | `sellerMapping.ts`, `sellers.map`, `company_seller_unique`, `/admin/company-links` | `58` | unauthenticated API 401, cross-site 403, page 307 | BUILT, mutation untested | `it-supplier-flows.mjs` needs an isolated database; unlink/reassign policy unresolved; dry-run conflict report not written because no company has a seller key today (keys were always empty) |
| D-02 moderation and publishing | `productDraftService` (submit/withdraw/edit block), `admin/productReview.ts`, routes, `/admin/product-review`, form buttons, `supplierPublished.ts` | `60` (20 checks) | admin APIs 401 without session | MODERATION BUILT; PUBLIC DISCOVERY NOT WIRED | wiring the approved snapshot into the listing engine, detail, search, category, supplier-profile and homepage surfaces (CSV plus MongoDB identity, ordering and counts need a design) |
| D-03 order creation | `orderConfirmation.ts`, confirm route, `ConfirmOrderPanel`, indexes `order_per_quotation` and `order_confirm_key` | `59` (18 checks) | buyer confirm API 401 without session | BUILT, mutation untested | isolated database; buyer-side notice of the order not built |
| Reservation | `reservedMilli`, RESERVE ledger rows, `canReserve`, reserved/available in the inventory UI, adjustments cannot remove reserved stock | `59`, `42` | none | RESERVE ONLY | dispatch, partial shipments, release on cancellation: NOT built (policy and UI), so reserved stock is never released automatically |
| D-04 legacy product POST | 405; function removed; invented stock removed | `58`, `61` | 405 over HTTP | FIXED, verified at HTTP level | none |
| M-01 dashboard messages | flags and copy | `58` | none | FIXED | finer capability split |
| M-02 inbox | `/supplier/inquiries` + `/api/supplier/inquiries/list` | build | API 401, page 307 | BUILT | needs data (a linked seller) |
| M-03 origin checks | 7 route files | `58` (23 write routes scanned) | 403 on evil Origin, 3 routes probed | FIXED, verified at HTTP level | authenticated same-origin success not exercised |
| M-04 notification limits | read and read-all | `58` | none | FIXED | none |
| M-05 notification producers | `notifyOwner.ts`; inquiry, quotation decision, order confirmed, product decision, support reply | `61` | none | PRODUCERS BUILT | needs a linked seller and data; order status changes after confirmation, buyer-side notices and e-mail are not produced |
| M-06 product reads | `getSupplierProducts` windowed DB reads and counts, indexes `supplier_products_by_name/price`, `findOwnedProduct` | `61` | none | PARTIAL | inventory list (`getInventory`) still builds the company's product set; no `explain` run |
| M-07 duplicate security UIs | shared module only | `58` | redirect 307 | FIXED | none |
| M-08 stale tests | corrected expectations | all pass | n/a | FIXED | none |
| M-09 tax configuration | documented | `58` | none | PARTIAL | no startup validation; the business must approve production treatments |
| M-10 tracker | reconciled; rows 113 to 116 added | n/a | n/a | FIXED | none |
| L-01 support staff | `supportStaff.ts`, `support.manage`, `/admin/support` | `61` | admin API 401 | BUILT, untested against data | isolated database; buyer-side notice of a reply not built |
| Public-page responsive | existing `audit.mjs`, `/sign-in`, `/sign-up`, `/register-supplier`, 44 widths including zoom and landscape | n/a | real browser run: no overflow, clipping or distorted images; all three pages report "heading contrast 1.0:1" and one 404 resource console error (pre-existing, unrelated to the supplier work, not investigated) | RAN (public pages only) | authenticated supplier/admin pages were not run: they need sessions and data |

## Evidence (commands actually run)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | no warnings or errors |
| `NEXT_DIST_DIR=.next-audit npm run build` | compiled successfully (after the last code change); `tsconfig.json` restored |
| all `docs/page-reports/tools/*unit-test.mjs` | 32 scripts, 32 passing, incl. `58` (20), `59` (18), `60` (20), `61` (17) |
| production server on :3100 with `MONGODB_URI` set to an unreachable address | 15 HTTP probes as listed above, all as expected |
| `docs/responsive/tools/audit.mjs` on 3 public routes | see table |
| `it-supplier-flows.mjs` | **not run**; it refuses without the isolated-database configuration (verified) |

**Not run:** every database-dependent check (integration, concurrency, transaction rollback, mapping and order races, moderation, support, notifications), `explain("executionStats")`, latency percentiles, authenticated browser or E2E, accessibility tooling on supplier/admin pages, responsive on supplier/admin pages. No performance numbers are claimed.

## Required configuration, migration and operations (none executed)
1. Create an isolated, transaction-capable test database and run `it-supplier-flows.mjs` (`docs/testing/TEST_ENVIRONMENT.md`).
2. New indexes are created on first use: `company_seller_unique`, `order_per_quotation`, `order_confirm_key`, `admin_inquiries_*`, `admin_product_review_queue`, `published_by_category`, `supplier_products_by_name/price`, `supplier_received_range`. Before the first production start, confirm no existing order has a duplicate `quotationReference` (none can, orders were never created) and no two companies share a seller key (keys were always empty).
3. Grant admin capabilities in the database only (`docs/admin/ADMIN_ACCESS.md`): `inquiries.read`, `inquiries.responses`, `inquiries.export`, `sellers.map`, `products.review`, `support.manage`.
4. Set `QUOTATION_TAX_RULES` with business-approved treatments.
5. There is still no scheduler or worker: supplier notices are created inline after commit, and buyer notices from the older outbox are retried when the supplier opens a page. No worker endpoint was added.
6. **A test server started by this session is still running on port 3100** (the sandbox denied stopping node processes). It was started from `.next-audit` with an unreachable database address. Stop it with `Get-NetTCPConnection -LocalPort 3100` then `Stop-Process -Id <pid>`, or close the terminal.

## Remaining blockers and risks
- Unverified at runtime: mapping, order confirmation and reservation, moderation, staff support, notices. Treat them as unproven until step 1 passes.
- **Product moderation does not make products public yet**: approval stores the snapshot and eligibility, but no public page reads it.
- **Dispatch and release-on-cancellation are not built**, so a confirmed tracked order holds its reservation indefinitely; cancellation flows must release it before orders are used for real.
- Unlink and reassignment of sellers remain unavailable by decision.
- Phone verification remains unavailable; past false verifications may exist (dry-run script prepared, not run).

## Readiness for the declared launch scope
Not ready for the full scope (leads, quote, order, ship, publish). A limited launch (accounts, profile, product drafts and review submission, inventory ledger, analytics, support tickets, security) is supported by code, but none of the new workflows has been exercised against a database, so a staging pass with the integration suite is required before any launch decision.

---

## Validation round (2026-11-13, later): test server, test database options, public-page defects

**Leftover test server.** The listener on port 3100 was identified before it was touched (`node ... next start -p 3100`, repository path, started this session, parent `cmd.exe /c next start -p 3100`, no children) and only that PID was stopped; the other Node processes were not touched. Later restarts recorded their PID and were stopped by verified PID only. Port 3100 is free now.

**Isolated MongoDB options found in this environment:** none. No `mongod`/`mongosh`, no service, no Docker or Podman, WSL not installed, no `mongodb-memory-server`, no `TEST_MONGODB_*` variables. Nothing was installed or invented, and no connection to the live database was made. **The integration suite (`it-supplier-flows.mjs`) therefore did not run: BLOCKED.** The guard was exercised and refuses all three weak configurations (no test mode, no confirmation, a name that is not `finbyn_it_*`) with the guard unchanged. For the same reason none of these ran: mapping and ownership uniqueness against data, cross-company data access, inquiry visibility, product moderation, support public/internal messages, one order per quotation, price preservation, reservation and shortage rollback, idempotency, notification preferences and deduplication. Their code paths are covered only by the static regression suites and by the HTTP probes above.

Prepared for the moment a database exists: `docs/page-reports/tools/start-test-replset.mjs` starts a loopback-only, single-node, transaction-capable replica set from a `mongod` you already have (`MONGOD_BIN` or PATH); data goes to the git-ignored `.test-mongo/`.

**Heading contrast "1.0:1": audit-tool false positive.** The tool compared the white heading text with the page background; the heading really sits on the teal auth panel (`#04534F`), a measured ratio of **8.92:1** (passes AA). Fixed the tool (`docs/responsive/tools/audit.mjs` now measures from the heading upward and skips a gradient or image it cannot measure); the warning no longer appears.

**404 resource: real, minor defect.** `/_vercel/speed-insights/script.js` is only served by Vercel hosting, so every page returned a 404 console error on any other host. Fixed in `src/app/layout.tsx`: the Speed Insights component renders only when `process.env.VERCEL` is set (on Vercel itself Speed Insights must be enabled in the project settings). Re-run: no failing responses on `/sign-in`, `/sign-up`, `/register-supplier`.

**Newly found, real defect: header search field unusable at laptop widths.** Measured at 1024px the text field was **29px** wide (51px at 1060, 87px at 1100, 131px at 1280), on every public page. Fixed in `SearchBar.module.css`: from 1024 to 1365px the search button keeps its icon and accessible name and drops the word. Re-measured: 101px at 1024, 160px at 1100, 205px at 1280. The slot's `min-width` of 240px (pre-existing) still limits it at the very bottom of that range.

**Responsive audit after the fixes (real browser, existing tool, 44 widths including zoom emulation and landscape, public pages only):** `/`, `/sign-in`, `/sign-up`, `/register-supplier`: no horizontal overflow, no clipped text, no layout problems, no console messages. One remaining note on the sign-up and supplier registration pages: a label-wrapped checkbox row 398x25px; this meets the WCAG 2.2 AA minimum of 24px but is below this project's 32px heuristic, so it was left as is. Supplier and admin pages were **not** run (they need sessions and data).

**Commands run:** `npx tsc --noEmit` (0 errors) · `npm run lint` (clean) · every `docs/page-reports/tools/*unit-test.mjs` (32 of 32 pass) · `NEXT_DIST_DIR=.next-audit npm run build` (compiled, three times) · `docs/responsive/tools/audit.mjs` with `ROUTES` set to the public routes · the Puppeteer probes under the session scratchpad (contrast, 404, search width).

**Runtime QA is not complete.** Build, unit and HTTP/browser checks on public pages do not establish runtime QA of the supplier and admin workflows.
