# Page 05 — All Products: backend report

2026-11-02. Details: `docs/backend/PAGE_05_BACKEND_AUDIT.md`, `PAGE_05_BACKEND_IMPLEMENTATION.md`, `PAGE_05_API_REFERENCE.md`, `PAGE_05_FILTER_SPECIFICATION.md`, `PAGE_05_DATA_VALIDATION_REPORT.md`, `PAGE_05_SECURITY_REPORT.md`, `PAGE_05_TEST_REPORT.md`.

## Backend audit findings

There is no product collection: the approved source is the in-memory CSV catalog (21,392 products, 1,062 active sellers) plus 12 sample B2B listings. No brand, model, SKU, availability, dates, popularity, product ratings, verification workflow or ImageKit. Wishlist, inquiry, requirement, rate-limit and session code from Pages 1–4 exist and were reused.

## Database changes

None. No collection or index was created, changed or dropped. The throwaway test database `finbynmart_test` was used for the tests and is dropped afterwards.

## APIs

Created: `GET /api/public/products` (search, filters, sort, pagination, facets, applied filters). Reused unchanged: `GET/POST /api/buyer/wishlist`, `DELETE /api/buyer/wishlist/[productId]`, `POST /api/inquiries`, `POST /api/requirements`. Not created: `/facets` (facets are in the list response), `/featured` (no featured data), `/[slug]` (Page 06), `/api/public/inquiries` and `/api/public/requirements` (the authenticated routes are the approved workflow).

## Services

Extended, not duplicated: `categoryListing.ts` (now the single listing engine for Pages 03, 04, 05 and the API), `listingQuery.ts`. New helpers: `publicProduct.ts` (DTO, `normalizeImage`), `publicProductQuery.ts` (strict API parsing). Behaviour changes that also affect Pages 03/04: MOQ is per unit; unknown subcategory ids are dropped with a notice; search is available on the engine.

## Search and filters

Plain substring search over precomputed text, AND semantics, short words must start a word, documented relevance scoring, no regex, no external service. Filters: category, subcategory, supplier type, colour, price, per-unit MOQ, state, city, department, supplier. Counts exclude the group's own filter. Blocked for lack of data: brand, availability, country, currency other than INR, attributes, newest and popularity.

## Supplier, image, wishlist, quote, requirement

Supplier objects carry public fields only; catalog suppliers are always `unverified`. Images are normalised or `null`. Wishlist, quote and requirement behave as in the Pages 1–4 backend, driven from this page and verified (heart signed-out and signed-in; quote link; requirement prefill).

## Security

Strict validation, no operator or regex input, public-field allow-list, rate limit (120 per minute per address) with 429 and `Retry-After`, safe errors. Open items: roles not enforced, no CSP/CSRF token, limiter fails open, sample data returned (flagged) by the public API.

## Performance

API p50 77 ms, p95 106 ms; page p50 110 ms, p95 194 ms (local, sequential, 100 requests each); first request after a start 1.9 s. See the test report for the limits of this measurement.

## Tests

117/117 on the page and API, plus 262 regression checks in the other suites, all passing against a production build and a throwaway database.

## Known issues

1. Sample listings appear first and carry sample ratings and verified flags (also visible through the API, flagged by `source`).
2. The seed has no inactive-seller products and no invalid references, so those exclusion rules are covered by code but not by data.
3. Catalog and sample data live in process memory; a serverless cold start rebuilds the index (about 2 s here).
4. Response shape keeps `ok` instead of the PRD's `success`.

## Tracker

Tracker ID 04 (PRD Page 05): Design Reference Received; Prompt Complete; Development Complete; QA In Progress. Extended statuses: Frontend Implemented; Backend API Ready, and Database Connected for the reused writes; Functional Verified (117 checks); Responsive QA In Progress (Chrome only); Testing Passed (scripted).
