> **Superseded in part by the Page 34 documents** (`docs/backend/PAGE_34_*.md`): summary, filters, bulk actions, comparison and the new sorts were added after this was written. The audit of what existed first is still accurate.

# Saved Suppliers — audit and API

Audit date 2026-11-04. No PRD text or reference image was received for this page; it follows the Saved Products precedent (same design system, same list controls) and the owner's sidebar item "Saved Suppliers".

## What existed

| Area | Finding |
|---|---|
| Data | Collection `wishlist_suppliers` (`userId`, `supplierKey`, `supplierName`, `addedAt`), unique index (userId, supplierKey), written by the heart on supplier cards and the "Save Supplier" button on supplier profiles through `POST/DELETE /api/buyer/wishlist/suppliers`. |
| List API | Only `GET /api/buyer/wishlist/suppliers` (keys only, for the hearts). No page, no details. |
| Cap | None (a buyer could save without limit). |
| Index for newest-first reads | None (sort in the database). |
| Supplier details | Public catalogue only: catalogue sellers (1,062 fictional sample sellers, "Active" ones) and sample suppliers. No contact fields are loaded; catalogue sellers are never verified. |

## What was built

- `src/lib/wishlist/savedSuppliersRules.ts` (parser, sorts, cap 500), `savedSuppliers.ts` (list service: reads the buyer's rows, then public details for the saved keys only), `GET /api/buyer/saved-suppliers`, page `/buyer/saved-suppliers`, `SavedSuppliersWorkspace` and `SavedSupplierCard`, sidebar link.
- Changed the existing save path: cap of 500 saved suppliers (409 with a message), new index `buyer_saved_suppliers_newest` (userId, addedAt desc, _id desc).
- Reuses the wishlist routes for saving and removing: nothing is duplicated and the supplier-page hearts and this page share one list.

## API

`GET /api/buyer/saved-suppliers?q&category&sort&page&limit` — buyer only (401 / 403), identity from the session (a `buyerId` parameter is ignored), private no-store. `sort`: recent, oldest, name, name-desc. `limit` ≤ 48. Response `{ ok, data:{ items, categories, totalSaved, totalMatchingSearch, total, page, limit, totalPages }, meta }`. Items carry name, initials, location, main category, supplier type, verified (only where the supplier's own record says so), product count, member-since year, profile / inquiry / products links. A supplier that has left the catalogue is returned as `available:false` with the saved name and no links, and can be removed by its stored key.

## Honest limits

No rating, response rate, contact details or "verified" for catalogue sellers (the data does not exist). Search covers name, city, state and main category. The list loads at most 500 rows and builds details in memory for them (bounded); at the cap it measured p95 174 ms on the remote cluster.
