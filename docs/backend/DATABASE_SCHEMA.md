# Database schema (MongoDB, as built through Pages 01–04)

Last updated 2026-11-02. Database name from `MONGODB_DB` (default `finbynmart`). Indexes are created lazily by the service that owns each collection, once per process, on first use. Only indexes that support a real query are created.

The product and supplier catalog is **not** in MongoDB: it is read from `db/seed/*.csv` (see `BACKEND_ARCHITECTURE.md`). Documents therefore reference catalog entities by key strings.

## `users` (existing)

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `name` | string | |
| `email` | string | stored lower-case |
| `passwordHash` | string | never returned by any endpoint |
| `role` | `"buyer"` or `"supplier"` | not yet enforced by the new endpoints |
| `supplier` | `{ businessName, phone, city, offering }` | only for role `supplier`; **not** a company profile and carries no verification |
| `createdAt` | Date | |

Index: `{ email: 1 }` unique.

## `requirements`

A buyer's posted need. Written by `src/lib/requirements/service.ts`.

| Field | Type | Rules |
|---|---|---|
| `_id` | ObjectId | |
| `userId` | ObjectId | from the session |
| `product` | string | required, ≤ 120 |
| `quantity` | number | whole, 1–1,000,000 |
| `unit` | string | optional, ≤ 20 |
| `city` | string | required, ≤ 80 |
| `category`, `subcategory` | string | optional, ≤ 80; free text from the page link, not validated against the category directory |
| `status` | `"open"` | only value so far |
| `createdAt` | Date | |

Index: `{ userId: 1, createdAt: -1 }`. Duplicate rule: same user, product, quantity and city within 10 minutes is refused.

## `inquiries`

A buyer's quote request to one supplier, about one product or in general. Written by `src/lib/inquiries/service.ts`.

| Field | Type | Rules |
|---|---|---|
| `_id` | ObjectId | |
| `buyerId` | ObjectId | from the session |
| `productKey`, `productName` | string | optional; resolved on the server from the catalog |
| `supplierKey`, `supplierName` | string | required; resolved on the server (the product's own seller, or the supplier named in a general inquiry) |
| `source` | `"catalog"` or `"sample"` | which data source the keys came from |
| `quantity` | number | whole, 1–1,000,000 |
| `unit` | string | optional, ≤ 20 |
| `message` | string | optional, ≤ 1000, line breaks kept, control characters removed |
| `status` | `"new"` | only value so far |
| `createdAt` | Date | |

Indexes: `{ buyerId: 1, createdAt: -1 }` (a buyer's inquiries), `{ supplierKey: 1, createdAt: -1 }` (a supplier's inbox, for the supplier dashboard). Duplicate rule: same buyer, supplier, product and quantity within 10 minutes is refused. Supplier contact details are never copied into the document.

## `wishlists`

One row per saved product. Written by `src/lib/wishlist/service.ts`.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `userId` | ObjectId | from the session; every query filters by it |
| `productKey` | string | catalog id or sample slug |
| `productName` | string | snapshot at save time |
| `addedAt` | Date | |

Index: `{ userId: 1, productKey: 1 }` **unique**; this index, not application code, prevents duplicate saves (a duplicate insert error 11000 is reported as `alreadySaved`). A buyer's list is read newest first and capped at 500 keys.

Supplier saves (`wishlistSuppliers` in the Page 08 PRD) do not exist yet.

## `rate_limits`

| Field | Type | Notes |
|---|---|---|
| `_id` | string | `"<action>:<subject>:<window number>"`, e.g. `inquiry:<userId>:2961234` |
| `count` | number | incremented atomically |
| `expireAt` | Date | window end + 60 s |

Index: `{ expireAt: 1 }` with `expireAfterSeconds: 0` (TTL). Not user data; safe to drop.

## Relationships

```
users 1 ──< requirements        (userId)
users 1 ──< inquiries           (buyerId)         inquiries >── catalog supplier / product (by key, not a foreign key)
users 1 ──< wishlists           (userId)          wishlists >── catalog product (by key)
```

There are no cascading deletes; no account deletion exists yet.

## Not present (do not assume)

`companies`, `products`, `categories`, `reviews`, `quotations`, `notifications`, supplier KYC and verification records. The "products" and "companies" collections named in the later page PRDs have no counterpart: the closest things are the CSV catalog (read-only) and the `supplier` sub-object on supplier-role users.

## `quotations` (added with Pages 29/30, 2026-11-04)

Buyer-side read and decision module. **Nothing in the application creates a quotation**: there is no supplier workflow yet, so documents arrive only from a future supplier module (or the test suite). One lineage shares a `reference` (`FBM-QT-XXXXXXXX`); every version is its own document (`version`, `isCurrent`). Fields: `inquiryId`, `inquiryReference`, `buyerId` (copied from the inquiry), supplier name/key/slug, product name and snapshot, `currency`, `unit`, `quantity`, `unitPriceMinor` (integer minor units), optional `discount`, `tax {label, bp}`, `charges[]`, `moq`, `terms{}`, `attachments[]` (metadata only), `validUntil`, `status` (DRAFT never visible, SENT, REVISION_REQUESTED, SUPERSEDED, ACCEPTED, REJECTED, WITHDRAWN), `accepted: true` only on an accepted version, `decision`, `events[]`, timestamps. EXPIRED / ACTIVE / EXPIRING_SOON are derived at read time.
Indexes: `quotation_version` (unique reference + version), `buyer_current_received`, `buyer_current_status_valid`, `inquiry_current`, `one_accepted_per_inquiry` (unique partial on inquiryId + accepted:true). See `PAGE_30_QUOTATION_DETAIL_API.md`.

## `orders` (added with Page 31, 2026-11-04)

Buyer-side read module. **Nothing in the application creates an order**: no checkout or supplier workflow exists, and accepting a quotation creates none. Documents arrive only from a future module (through `buildOrderDoc` in `src/lib/orders/service.ts`) or the test suite. Fields: `reference` (`FBM-ORD-XXXXXXXX`, unique), `buyerId`, supplier key/name/slug, optional `quotationReference` and `inquiryReference`, `items[]` (snapshot: name, quantity, unit, `unitPriceMinor`), derived `itemCount`, `currency`, `totalMinor` (agreed total, integer minor units), `status` (13-value lifecycle in `src/lib/orders/orderRules.ts`), `events[]`, optional `expectedDelivery {date, source}`, derived `expectedSort`, `placedAt`, `updatedAt`, optional `cancellationRequest`. Indexes: `order_reference` (unique), `buyer_orders_newest`, `buyer_orders_status`, `buyer_orders_updated`, `buyer_orders_amount`, `buyer_orders_expected`. No payment, invoice, shipment or return collections exist. See `PAGE_31_ORDER_DATA_MODEL.md`.

## `wishlist_suppliers` and `compare_items` (2026-11-04)

`wishlist_suppliers` gained the index `buyer_saved_suppliers_newest` (userId, addedAt desc, _id desc) and a 500-supplier cap. `compare_items` (new): `userId`, `productKey`, `productName`, `addedAt`; one list per buyer, at most 4 products; indexes `buyer_compare_product` (unique), `buyer_compare_order` and `buyer_compare_slot` (unique partial on userId + slot, which enforces the 4-product limit even under simultaneous requests); each row also carries `slot` (0 to 3).

## `support_tickets` (added with Page 36, 2026-11-05)

One document per buyer support ticket: `ticketReference` (`FBM-SUP-YYYYMM-XXXXXX`, unique), `buyerId`, `categoryId`, `subject`, `description`, optional `related`, `status` (8 values), server-set `priority` and `assignedAgentId`, embedded `attachments[]` (private storage reference) and append-only `events[]`, `idempotencyKey`, `notification.supportEmail`, dates. Seven indexes (unique reference, unique buyer+idempotency key, four buyer-scoped list indexes, status+created). Full field list and index purposes: `docs/backend/PAGE_36_SUPPORT_TICKET_DATA_MODEL.md`. The `notifications` collection gains category `support` / type `TICKET_CREATED`.
