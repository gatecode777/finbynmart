# Page 31 — Order API reference

All routes: buyer session required (401 without, 403 for a supplier, 401 for a suspended or revoked session), `Cache-Control: private, no-store`. The buyer always comes from the session; a `buyerId` parameter is ignored. Code: `src/app/api/buyer/orders/**`, `src/lib/orders/`.

| Route | Purpose | Notes |
|---|---|---|
| `GET /api/buyer/orders?q&status&supplierId&currency&range&dateFrom&dateTo&sort&page&limit` | The buyer's orders, 20 a page (max 50), tab counts under the other filters | 400 on any invalid parameter. `status`: all, processing, in_transit, delivered, issues, or one exact status (lower case). `sort`: newest, oldest, updated, amount_high, amount_low, delivery_soon. **Amount sorts need `currency`** (mixed currencies are never ranked together). |
| `GET /api/buyer/orders/summary` | The five numbers (total, processing, in transit, delivered, active issues), tab counts, supplier and currency facets, `capabilities` | `capabilities`: payments, invoices, shipmentTracking, returns are `false`; cancellationRequest, export `true`. No payment or refund figure exists. |
| `GET /api/buyer/orders/{reference}` | One order: items, supplier, amount, quotation and inquiry links, events, cancellation request, capabilities | Foreign, unknown and malformed references: identical 404. |
| `POST /api/buyer/orders/{reference}/cancellation-requests` `{reason, confirm:true}` | Records a cancellation REQUEST | 201; 400 validation; 404; 409 not allowed (dispatched, delivered, already requested, ...). `supplierNotified:false`. Rate limit 20 / 10 min. |
| `POST /api/buyer/orders/export` `{q?, status?, supplierId?, currency?, range?, dateFrom?, dateTo?, sort?}` | CSV download of the buyer's own filtered orders (max 5,000 rows) | `text/csv`, attachment, `X-Export-Rows`, `X-Export-Truncated`. Logged in `security_events`. Rate limit 10 / 10 min. |

DELETE, PUT and PATCH are not exported on an order (405): a buyer cannot edit or delete an order or its status.

**Not built (BLOCKED, no module):** `/orders/{reference}/payments`, `/tracking`, `/invoices`, `/invoices/{ref}/download`, `/return-requests`. They are not stubbed: an endpoint that returns nothing would imply the module exists.

Response style follows the project's existing buyer APIs: `{ ok, … }` with `orders` / `data` / `meta`, or `{ ok:false, message, fields? }`; the PRD's illustrative `{success, data}` wrapper was not adopted, to keep every buyer API consistent for the shared client code.
