# API reference (as built through Pages 01–04)

Last updated 2026-11-02. All endpoints are Next.js route handlers under `src/app/api/`. JSON in, JSON out. Errors: `{ "ok": false, "message": string, "fields"?: { [name]: string } }`. Authentication is the `finbyn_session` cookie set by sign-in. Rate limits are fixed windows per key (see `BACKEND_ARCHITECTURE.md`); 429 responses carry `Retry-After`.

Verified by the scripts in `docs/page-reports/tools/` (`backend-pages-1-4-test.mjs`, 46 checks; `backend-pages-1-4-ui-test.mjs`, 21 checks) against a throwaway database.

## Requirements

### `POST /api/requirements`

Auth required. Body (JSON, ≤ 10 kB): `product` (required, ≤ 120), `quantity` (required, whole number 1–1,000,000, sent as number or string), `city` (required, ≤ 80), `unit` (≤ 20), `category` (≤ 80), `subcategory` (≤ 80).

| Status | Body | When |
|---|---|---|
| 201 | `{ ok: true, id }` | stored |
| 400 | `{ ok:false, message:"Check the highlighted fields.", fields }` or `Invalid request.` | validation, unreadable or oversized body |
| 401 | `{ ok:false, message }` | not signed in |
| 409 | `{ ok:false, message }` | same product, quantity and city within 10 minutes |
| 429 | rate-limit message | more than 10 valid submissions per user per 10 minutes |
| 503 | generic message | database error |

## Inquiries

### `POST /api/inquiries`

Auth required. Body (≤ 10 kB): `productId` and/or `supplierId`, `quantity` (required, whole 1–1,000,000), `unit` (≤ 20), `message` (≤ 1000).

- With `productId`: the product must resolve in the catalog or the sample listings (404 otherwise). The supplier is **the product's own seller**; if `supplierId` is also sent it must match (400 otherwise).
- With only `supplierId`: the supplier must resolve (404 otherwise); the inquiry is general.
- With neither: 400.

| Status | Body | When |
|---|---|---|
| 201 | `{ ok: true, id }` | stored |
| 400 | `{ ok:false, message, fields? }` | neither id, bad quantity, supplier does not sell the product, bad body |
| 401 | | not signed in |
| 404 | | unknown product or supplier |
| 409 | | same buyer, supplier, product and quantity within 10 minutes |
| 429 | | more than 20 valid inquiries per user per 10 minutes |
| 503 | | database error |

## Wishlist (saved products)

### `GET /api/buyer/wishlist`

Never an error for anonymous visitors: `200 { ok:true, authenticated:false, productIds:[] }`. Signed in: `200 { ok:true, authenticated:true, productIds:[...] }` (newest first, ≤ 500). `Cache-Control: no-store`.

### `POST /api/buyer/wishlist`

Auth required. Body (≤ 1 kB): `{ "productId": string }`. The product must resolve (404 otherwise).

| Status | Body |
|---|---|
| 201 | `{ ok:true, saved:true, alreadySaved:false }` |
| 200 | `{ ok:true, saved:true, alreadySaved:true }` (duplicate save is harmless) |
| 401 / 404 / 429 / 503 | error body |

Rate limit: 60 requests per user per 10 minutes, shared with DELETE.

### `DELETE /api/buyer/wishlist/[productId]`

Auth required. Removes the signed-in user's own entry only: `200 { ok:true, saved:false, removed:boolean }`. Another account's entry is never touched (the query filters by the session user). 401 / 429 / 503 as above.

## Public product listing (Page 05)

`GET /api/public/products` exists (search, filters, sort, pagination, facets; 120 requests per minute per address). Full reference: `PAGE_05_API_REFERENCE.md`. It answers `{ ok, data, meta }` and errors `{ ok:false, code, message, fields }`.

## Auth (existing, now rate-limited)

| Endpoint | Purpose | Limit |
|---|---|---|
| `POST /api/auth/register` | create a buyer or supplier-role account | 10 per client IP per hour |
| `POST /api/auth/login` | sign in; sets the session cookie | 10 per client IP per 10 minutes |
| `POST /api/auth/logout` | clear the cookie | none |
| `GET /api/auth/me` | current user or null | none |

Cookie: `finbyn_session`, `HttpOnly`, `SameSite=Lax`, `Secure` in production, 7 days.

## Product and supplier keys

`productId`/`supplierId` accept: a catalog product's numeric id (`"1163"`), a sample product's slug, a catalog seller id (`"SLR0873"`) or slug, a sample supplier slug. Anything else resolves to nothing and is refused. Only active catalog sellers exist in the loaded catalog.

## Not implemented (planned with later pages)

`/api/public/suppliers*`, `/api/public/products/[slug]`, `/api/public/products/facets` and `/featured`, `/api/public/inquiries`, `/api/public/requirements`, supplier wishlist endpoints, any read endpoint for inquiries or requirements, any role-restricted endpoint. The Page 05–08 PRDs name these; none exist today and the pages read the catalog directly in Server Components. The existing writes keep the `{ ok, message, fields }` shape rather than the `{ success, data, meta }` shape shown in the PRDs, so the whole API stays consistent; changing it is a decision for the owner.

## Buyer quotations (Pages 29/30, 2026-11-04)

`GET /api/buyer/quotations`, `GET /api/buyer/quotations/{reference}`, `POST /api/buyer/quotations/compare`, `POST /api/buyer/quotations/{reference}/accept | reject | revision-request`. Buyer only; the buyer comes from the session. Full contract: `docs/backend/PAGE_30_QUOTATION_DETAIL_API.md`. Responses to decisions always carry `supplierNotified: false`: there is no supplier notification channel and no order module.

## Buyer orders (Page 31, 2026-11-04)

`GET /api/buyer/orders`, `GET /api/buyer/orders/summary`, `GET /api/buyer/orders/{reference}`, `POST /api/buyer/orders/{reference}/cancellation-requests`, `POST /api/buyer/orders/export`. Buyer only; identity from the session. Full contract: `docs/backend/PAGE_31_ORDER_API_REFERENCE.md`. Payments, invoices, tracking and return routes are NOT built (no module). A cancellation request never cancels or refunds anything and the supplier is not notified (`supplierNotified: false`).

## Saved suppliers and compare (2026-11-04)

`GET /api/buyer/saved-suppliers` (see `SAVED_SUPPLIERS_AUDIT_AND_API.md`); `GET|POST|DELETE /api/buyer/compare`, `DELETE /api/buyer/compare/{productId}` (see `COMPARE_PRODUCTS_AUDIT_AND_API.md`).

## Saved suppliers, extended (Page 34, 2026-11-04)

`GET /api/buyer/saved-suppliers` now filters by `category`, `state`, `city`, `type`, `verification` and sorts by `products` / `categories`; new: `GET /api/buyer/saved-suppliers/summary`, `POST /api/buyer/saved-suppliers/bulk-remove` (max 20), `DELETE /api/buyer/saved-suppliers` (Clear All, `confirm: true`), `POST /api/buyer/saved-suppliers/compare` (2 to 4). Saving and removing one supplier stay on the shared `/api/buyer/wishlist/suppliers` routes. Full contract: `docs/backend/PAGE_34_SAVED_SUPPLIERS_API.md`.

## Compare products, extended (Page 35, 2026-11-05)

`GET /api/buyer/compare?view=details` now also returns `compatibility {currencyCompatible, unitCompatible, categoryCompatible}`, `capabilities`, `emptyLabels`, field `section` / `status` / `highlight`, column `code`, and notices as `{level, text}`. The page moved to `/buyer/compare-products` (`/buyer/compare` redirects, 308). No new API routes: the existing `/api/buyer/compare` routes are the state API. Contract: `docs/backend/PAGE_35_COMPARISON_API_REFERENCE.md`.

## Buyer support (Page 36, 2026-11-05)

`GET /api/buyer/support/summary`, `/categories`, `/related`, `GET|POST /api/buyer/support/tickets`, `GET /api/buyer/support/tickets/[ticketReference]` and `.../attachments/[attachmentId]`; public `GET /api/public/faqs`, `/api/public/faqs/categories`, `/api/public/support/channels`. Buyer routes need a buyer session, are `private, no-store`, and creation is limited to 10 per buyer per hour. Details: `docs/backend/PAGE_36_SUPPORT_API_REFERENCE.md`.
