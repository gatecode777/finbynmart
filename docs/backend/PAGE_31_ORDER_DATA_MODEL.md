# Page 31 — Order data model

Collection `orders` (new; none existed). Code: `src/lib/orders/service.ts`. **Nothing in the application writes it yet.** The one helper for a future writer (checkout or supplier confirmation) is `buildOrderDoc`, which sets the derived fields so a writer cannot forget them.

| Field | Meaning |
|---|---|
| `reference` | `FBM-ORD-XXXXXXXX` (Crockford-style alphabet, no I L O U), unique. For identification, never for access. |
| `buyerId` | The owning buyer (ObjectId). Every read starts from this value taken from the session. |
| `supplierKey`, `supplierName`, `supplierSlug?` | The supplier as it was when the order was placed. |
| `quotationReference?`, `inquiryReference?` | Where the order came from, only if the writer knows. |
| `items[]` | Snapshot: `productKey?`, `name`, `quantity`, `unit`, `unitPriceMinor`. What was ordered, not the current catalogue. |
| `itemCount` | Derived (`items.length`): lets the list say "+N more" without loading items. |
| `currency`, `totalMinor` | The agreed total as saved, integer minor units. Never recomputed from the catalogue; never converted. |
| `status` | One of the 13 lifecycle statuses (`PAGE_31_ORDER_STATUS_LIFECYCLE.md`). |
| `events[]` | `{type, at, actor: buyer | supplier | system, reason?}`: the recorded history shown as Order Activity. |
| `expectedDelivery?` | `{date, source: CARRIER | SUPPLIER | SCHEDULE}`: shown only when present, with its source. |
| `expectedSort` | Derived: the expected date, or `9999-12-31` when none, so "Expected Delivery Soon" lists dated orders first from an index. |
| `placedAt`, `updatedAt` | Timestamps. |
| `cancellationRequest?` | `{at, reason, previousStatus}` written by the buyer's request. |

Not stored (no module or no data): payments, refunds, invoices, shipments and tracking events, billing and delivery address snapshots, taxes and discounts as separate lines, contact details.

Indexes: `order_reference` (unique), `buyer_orders_newest` (buyerId, placedAt desc, _id desc), `buyer_orders_status` (buyerId, status, placedAt desc, _id desc), `buyer_orders_updated`, `buyer_orders_amount` (buyerId, currency, totalMinor desc, _id desc), `buyer_orders_expected` (buyerId, expectedSort, _id).
Money: integer minor units, formatted by `formatMoney` (Indian grouping for INR, the currency's own symbol otherwise).
