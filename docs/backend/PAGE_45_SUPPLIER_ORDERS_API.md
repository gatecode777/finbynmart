# Page 45 — Supplier Orders API

Common: `requireSupplierApi()` (401 no session, 403 not a supplier / company not active) → permission (`viewOrders`; export also `exportOrders`: 403) → rate limit (reads: the reserved-block limiter, 240 / min per user; the export: the exact limiter, 10 / 10 min) → validation (400 with `fields`) → service. Every query carries `supplierKey ∈ the session company's sellerKeys`. Private, `Cache-Control: private, no-store`. No raw database error or stack is returned (503 with a safe message). Nothing here changes an order.

## `GET /api/supplier/orders`
Query (all optional, all validated against fixed lists or patterns; unknown parameters are never read): `q` (≤ 60 chars; order / quotation / inquiry reference prefix or product-name substring, matched literally), `status` (`all`, a group key, or one exact stored status), `range` (`7d`, `30d`, `90d`, `this-month`, `previous-month`, `custom`) with `startDate` / `endDate`, `dateBasis` (`placed` default, `updated`), `currency` (three letters), `sort` (`newest`, `oldest`, `updated`, `amount_high`, `amount_low`; the amount sorts need `currency`), `page` (1–1000), `limit` (1–50, default 20).
Answer: `{ ok, orders: Row[], data: { counts, currencies, capabilities, noSellers }, meta: { total, page, limit, totalPages } }`. `counts` = orders per chip under the search / date / currency filters (status not applied); `meta.total` = the exact size of the filtered list. `currencies` = those in use (≤ 10). `capabilities` says what is unavailable and why (create, confirm, fulfilment update, payments) and whether the role can export.
Errors: 400 invalid filter, 401, 403, 429 (`Retry-After`), 503.

## `GET /api/supplier/orders/summary`
Same filters except `status`, `sort`, `page`, `limit` (accepted and ignored). `{ ok, data: { counts, currencies, scope: { search, dateRange, dateBasis, currency }, noSellers } }`: the same numbers the list carries, with the scope spelled out. Counts only.

## `GET /api/supplier/orders/[reference]`
One order, read only, as the detail DTO (`order`, `buyer`, `payment`, `items`, `quotation`, `inquiry`, `events`, `cancellationRequest`, `capabilities`). Unknown, malformed (`FBM-ORD-` + 8 characters of the reference alphabet, upper case) and foreign references: the identical 404. 405 for any other method.

## `POST /api/supplier/orders/export`
Body (JSON, ≤ 2 kB): the list filters (`q`, `status`, `range`, `startDate`, `endDate`, `dateBasis`, `currency`; `page`, `limit`, `sort` ignored). Cross-site requests are refused (403) before anything is read. The answer is the CSV itself (`text/csv`, attachment `finbyn-mart-supplier-orders.csv`, newest order date first, at most **5,000 rows**), with `X-Export-Rows` and `X-Export-Truncated`. Built in the one response: nothing stored, no link, no expiry, no background job. Each export writes a `security_events` row (`supplier_orders_exported`: counts and filter *names*, never values).
Errors: 400 (invalid filter, or a body over 2 kB), 401, 403, 429, 503.

## Not provided (BLOCKED, no route exists)
Create, confirm, cancel, update fulfilment, mark paid, payment ledger, shipment tracking, invoice, asynchronous export jobs. A request to such a path is a 404; a write method on an order is a 405.

## Pages
`/supplier/orders` (list; first page rendered on the server, every later change through the API, state kept in the address) and `/supplier/orders/[reference]` (compact read-only detail; a real 404 for anything that is not the company's). No `loading.tsx` above either (the detail can 404 or redirect).
