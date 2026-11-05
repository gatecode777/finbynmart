# Page 35 — Comparison state model

No new collection. `compare_items` (shared with the Compare button everywhere):

| Field | Meaning |
|---|---|
| `userId` | The buyer (ObjectId), always from the session. A comparison is private to its buyer; there is no shared list. |
| `productKey` | The product's canonical key: a catalogue product id (`1163`) or a sample listing slug. Validated by `resolveProduct` when added. |
| `productName` | The name at the time of adding, used **only** when the product has since left the catalogue ("no longer available"). |
| `addedAt` | Display order. |
| `slot` | 0 to 3. |

Indexes: `buyer_compare_product` (unique userId + productKey: no duplicate), `buyer_compare_order` (userId, addedAt, _id: the list in order, no in-database sort), `buyer_compare_slot` (unique partial userId + slot: **the limit of four is a database constraint**; an earlier "count, then trim" design could leave five products under a race and was replaced).

Persistence: server side, per buyer, so the comparison survives navigation, refresh, another tab and another device. Nothing about the product (name, price, specifications, supplier) is stored: every load resolves the **current** catalogue record, so a changed or removed product shows its current state or "no longer available" (which can only be removed), never a stale copy. Removing or clearing deletes only these rows: saved products, the catalogue and inquiries are untouched.

Limit policy: minimum two for a side-by-side comparison (one product is shown with "add at least two"); maximum four, one definition (`COMPARE_PRODUCTS_MIN/MAX` in `src/lib/compare/comparisonRules.ts`) shared by the service, the API (409 `LIMIT` for a fifth, never a silent swap) and the pages.
