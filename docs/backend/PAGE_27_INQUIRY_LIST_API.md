# Page 27 — Inquiry list API

All routes: buyer session required (401 without; 403 for a supplier; a suspended buyer's session no longer works), `Cache-Control: private, no-store`. The buyer always comes from the session; `buyerId` and `userId` in a query are never read.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/buyer/inquiries` | The list. Response `{ ok, inquiries[], data: { statusCounts, appliedFilters }, meta: { total, page, limit, totalPages } }` |
| GET | `/api/buyer/inquiries/summary` | `data: { summary: { total, awaitingResponse, repliedOrQuoted, closed }, statusCounts, facets: { suppliers[], categories[] } }` over all of the buyer's inquiries |
| GET | `/api/buyer/inquiries/[id]` | One inquiry (reference, or the id of an old record without one). Page 28 adds `?view=detail` |
| PATCH | `/api/buyer/inquiries/[id]/cancel` | Cancel (reference or id). 30 per 10 minutes |

## List parameters (all validated; anything else is ignored)
`q` (≤60), `status` (all, new, in_progress, awaiting_response, replied, quoted, closed, cancelled, rejected; capitals accepted), `inquiryType` (PRODUCT_INQUIRY, GET_BEST_QUOTE, GENERAL_INQUIRY, BULK_REQUIREMENT), `supplierId` (a `supplierKey`), `categoryId` (a slug), `range` (7d, 30d, 90d, this-month, previous-month, custom), `dateFrom` and `dateTo` (YYYY-MM-DD, India time, inclusive), `sort` (newest, oldest, updated), `page` (1–1000), `limit` (1–50, default 20). Invalid values: 400 with `fields`. `cursor` is not offered (offset paging; see the performance report).

## Row (allow-listed)
`id`, `reference` (null for an old record), `inquiryType`, `inquiryTypeLabel`, `status`, `statusLabel`, `product {name, url, imageSrc, imageRemote}` or null, `categoryName`, `supplier {name, url, initials}`, `quantity`, `unit`, `submittedAt`, `updatedAt`, `cancelledAt`, `canCancel`, `detailHref`, `quotation` (always null: no quotation module). Never: message, delivery location, buyer id, guest data, consent, notification state, idempotency key, supplier contact data.

## Errors
400 validation · 401 · 403 · 404 (cancel/detail: unknown, another buyer's, malformed, guest, all identical) · 409 (cancel: status does not allow it) · 429 · 503 (database).

## Compatibility
The `inquiries` array and the row fields `id`, `reference`, `status`, `inquiryTypeLabel`, `canCancel` are unchanged for earlier callers; `message`, `deliveryLocation`, `supplierSlug`, `productName` and `latestResponse` moved (private text out of the list; names into `product` and `supplier`).
