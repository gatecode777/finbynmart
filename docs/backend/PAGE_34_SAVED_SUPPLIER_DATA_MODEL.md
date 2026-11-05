# Page 34 — Saved supplier data model

No new collection. The relationship is `wishlist_suppliers` (shared with the supplier-page hearts):

| Field | Meaning |
|---|---|
| `userId` | The buyer (ObjectId), always taken from the session. |
| `supplierKey` | The supplier's canonical stored key: a catalogue seller id (`SLR0123`) or a sample supplier slug (`shree-textiles`). Resolved by `resolveSupplier` when saving. |
| `supplierName` | The name at the time of saving, used **only** when the supplier has since left the catalogue ("unavailable"). It is never displayed for a supplier that still exists. |
| `addedAt` | The saved date, shown and sorted by. |

Unique: (`userId`, `supplierKey`): one relationship per buyer and supplier; many buyers may save the same supplier. Index `buyer_saved_suppliers_newest` (`userId`, `addedAt` desc, `_id` desc) serves the read with no in-database sort. Cap: 500 per buyer (409 beyond).

**Nothing about the supplier is copied into the relationship.** Name, location, type, description, categories, counts and verification are read live from the catalogue for the saved keys only (`src/lib/wishlist/savedSuppliers.ts`, memoised per supplier because the catalogue is a read-only seed). Removing a bookmark deletes the one row; no supplier or product record is touched.

Audit trail: `security_events` gets `saved_suppliers_cleared` (count only) when a buyer clears the list.
