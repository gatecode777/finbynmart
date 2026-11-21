# Admin Product Management (original tracker Page 54, `/admin/products`)

Status 2026-11-16: **Design: not marked complete (no owner approval). Prompt: delivered. Development: Implemented (frontend + backend). QA: In Progress** — unit, type, lint and build checks ran; every database and authenticated-browser check is **BLOCKED** (no isolated test database, no admin session). Nothing here is Functionally Verified. Supersedes the frontend-only note in `PRODUCT_MANAGEMENT_FRONTEND.md` (still accurate for the UI structure).

## Source and scope
- **Source: supplier-created products (`supplier_products`) that were submitted or published.** A draft that was never submitted is private to its supplier and never appears. The legacy catalogue (21,392 CSV products) is **not listed and cannot be unpublished**: it has no mutable visibility record, and CSV files are never edited from an HTTP request. The page says so; no catalogue row shows a working-looking Unpublish. Merging the two sources is deliberately not done.
- Scope model: the admin model has capabilities only (no organisation or category scope), so scope = capability. Nothing broader is implied.

## Capabilities (default deny, read from the account on every request)
| Capability | Allows |
|---|---|
| `products.read` | the page, list, summary, approved (public) detail |
| `products.review` | pending replacement revision and review state in the detail; link to Product Review (existing workflow, decisions are never duplicated here) |
| `products.unpublish` | the Unpublish action (row flag `actions.unpublish`, re-checked by the route) |
| `products.export` | CSV export |
Audit history is written for every unpublish; it is not exposed as a separate screen (no audit viewer exists). Grant by an operator in the database (`ADMIN_ACCESS.md`).

## Listing status (derived; no new persisted status)
PUBLISHED = publication APPROVED and no `archivedAt`; PENDING_REVIEW / REJECTED = never published, review state; UNPUBLISHED = `archivedAt` set. A published product with a pending replacement stays PUBLISHED and is flagged `pendingChanges`. The detail and list show the **live (approved) content**, never the pending snapshot; pending data appears only with `products.review`, clearly separated.

## Unpublish
- `POST /api/admin/products/[reference]/unpublish` `{ reason, expectedRevision }`. Reason trimmed, 10–500 characters; revision must be a whole number equal to the live `publication.revision`.
- One transaction: conditional `updateOne` (APPROVED, same revision, not yet archived) sets `archivedAt` and `unpublish{at,by,reason,revision}`; an `admin_audit_log` row (`PRODUCT_UNPUBLISHED`); a `product_visibility_events` recovery row (unique `dedupeKey unpublish:<ref>:<revision>`). Actor and time come from the session/server, never the body (unknown body fields are refused). Nothing is deleted; identity, history, review snapshot and publication snapshot remain.
- Answers: 401 / 403 / 404 (unknown, malformed or never-published: identical) / 409 stale revision / 413 / 422 / 429 / 200 `{alreadyUnpublished}`. A retry after a lost response answers 200 with `alreadyUnpublished: true` and writes no second audit row, event or notice. Two concurrent admins: one wins, the other gets the idempotent answer.
- **No automatic restore.** Approving a replacement revision later does not clear `archivedAt`; there is **no Republish** action (not asked for, policy unresolved).

## Effects (one rule)
Public eligibility = publication APPROVED and no `archivedAt` (`isEligibleDoc`, snapshot cached 60 s, refreshed by `invalidateApproved()` after commit). The same loader feeds listing, search, category pages, supplier profile, product detail, related products and the inquiry form. **Authorization-grade checks do not use the cache:** `isProductPublicNow` reads the database before a new inquiry or requirement is accepted (`/api/public/inquiries`, `/api/requirements`) and inside matching recipient creation. Historical inquiries, quotations and orders are untouched (they reference the product id and keep their own snapshots). Category discoverability follows eligible products. Saved-product views use the existing "unavailable" pattern. Homepage product sections do not exist for supplier products (not built).

## Post-commit recovery
The supplier in-app notice (`notifySellerOwnerByCompany`, never e-mail/SMS, internal reason never included, dedupe key per product + revision) and the cache refresh are driven from the stored event. A failed step leaves the event pending; `sweepVisibilityEvents` retries it, called by the existing distribution worker (`runDistribution`, `POST /api/internal/distribution`). **No scheduler is deployed**, so until the worker is called a failed refresh can leave the cached snapshot stale for up to its 60 s TTL per instance and a notice pending; the authorization-grade check above means stale display never lets a new lead through. Cache refresh is per instance (no shared cache exists).

## Read, search, export
- `GET /api/admin/products` (q, status, category, supplier, sort `updated|name`, page; allow-lists, default 20, max 50, stable `_id` tie-break), `GET /api/admin/products/[reference]`, `POST /api/admin/products/export` (≤ 5,000 rows, same filters and scope, permitted fields only, `csvCell` formula-safe, no internal reason, logged by counts). Search text is regex-escaped and anchored (name prefix, SKU, exact reference); an invalid supplier id matches nothing. Writes are origin-checked (`isCrossSiteWrite`) and rate-limited; all responses `no-store`. DTOs are allow-listed (no supplier contact data, internal notes or snapshots).
- Indexes (created lazily, idempotent): `admin_products_updated {updatedAt:-1,_id:-1}`, `admin_products_name {name:1,_id:1}`, `admin_products_company_updated {companyId:1,updatedAt:-1}` on `supplier_products`; `visibility_event_dedupe` (unique) and `visibility_event_pending` on `product_visibility_events`. New collection `product_visibility_events`; **no migration, no backfill**; existing documents are valid. **`explain` was not run** (no isolated database): whether the `$or` existence filter uses these indexes without an in-memory sort is unverified.

## Tests
| Check | Result |
|---|---|
| `68-admin-products-frontend-unit-test.mjs` | 22 pass |
| `69-admin-products-rules-unit-test.mjs` (status derivation, price text, reason, filter safety, CSV, capabilities) | 17 pass |
| all 40 unit scripts in `docs/page-reports/tools` | pass (one stale assertion in 67 corrected to the new `isProductPublicNow` check, not weakened) |
| `tsc --noEmit`, `npm run lint`, production build (`NEXT_DIST_DIR=.next-audit`; tsconfig restored) | pass |
| built-server probes, no database: `GET list/detail` unauthenticated 401; cross-site `POST unpublish/export` 403; page redirects to sign-in | pass |
| `it-admin-products.mjs` (scoped list, statuses, pagination, 404/409/422, rollback, unpublish + audit + event + notice, idempotent retry, concurrency, replacement approval stays hidden, public removal, historical inquiry untouched, export) | **BLOCKED**: written and loads (preflight), never run |
| authorization per capability over HTTP with real sessions, E2E, responsive 320–2560 (+3440), zoom 80–200 %, accessibility, performance | **BLOCKED / not run** |

Run the integration suite per `docs/testing/TEST_ENVIRONMENT.md` (`FINBYN_TEST_MODE`, `TEST_MONGODB_URI`, `TEST_MONGODB_DB=finbyn_it_*`, `TEST_DB_CONFIRM`; transaction-capable). The guard is unchanged.

## Not measured / not built
No latency numbers (no database). Not built: Republish, audit-history screen, legacy-catalogue unpublish, organisation/category admin scope, scheduler for the recovery sweep, e-mail notice.

Observation, FIXED 2026-11-16 (see `docs/audits/FINBYN_ORIGINAL_78_PAGE_STATUS.md`, F.10): an unauthenticated request to any `/admin/*` page used to redirect to `/sign-in?next=/admin/inquiries`, because the admin layout (`src/app/admin/layout.tsx:18`) runs first and hard-codes that `next` value; the page-level `requireAdminPage` path is never reached for anonymous visitors. After sign-in the admin lands on Inquiries, not the page they asked for.
