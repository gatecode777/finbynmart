> **Superseded in part by the Page 35 documents** (`docs/backend/PAGE_35_*.md`, `docs/page-designs/35-buyer-compare-products.md`): the route is now `/buyer/compare-products`, and sections, difference highlighting, compatibility rules and per-product actions were added after this was written.

# Compare Products — audit and API

Audit date 2026-11-04. No PRD text or reference image was received; the page follows the owner's sidebar item "Compare Products" and reuses the quotation comparison layout.

## What existed

Nothing. No comparison list, route, page or button; the sidebar item was a non-link marked "Soon". Product detail data (`getPublicProductByKey`: price, MOQ, category, supplier, rating, specifications) already existed and is reused.

## What was built

- Collection `compare_items` (`userId`, `productKey`, `productName`, `addedAt`): one list per buyer, **at most 4 products**, in the order added. Indexes: `buyer_compare_product` (unique userId + productKey) and `buyer_compare_order` (userId, addedAt, _id).
- `src/lib/compare/service.ts`: list keys, add (true / already / "limit"), remove, clear, and `getProductComparison` (builds the columns and rows from the catalogue).
- `GET|POST|DELETE /api/buyer/compare`, `DELETE /api/buyer/compare/[productId]`; page `/buyer/compare`; `CompareProductsView`; `CompareButton` on product pages and Saved Products cards (reusing the generic wishlist client store); sidebar link.

## API (buyer accounts only for writes and details; private no-store)

| Route | Behaviour |
|---|---|
| `GET /api/buyer/compare` | Compared product keys. Anonymous visitors and suppliers get `authenticated:false` and an empty list (200) so product pages can show the button state. |
| `GET /api/buyer/compare?view=details` | The side-by-side comparison: columns in the order added, rows with a `differs` flag, notices, `max` 4 / `min` 2. 401 / 403 otherwise. |
| `POST /api/buyer/compare {productId}` | Add (201), already there (200 `alreadyAdded`), 404 unknown product, **409 `LIMIT`** at four. Rate limit 60 per 10 minutes. |
| `DELETE /api/buyer/compare/{productId}` | Remove one (a product that left the catalogue is removable by its stored key). |
| `DELETE /api/buyer/compare` | Clear the buyer's list. |

The identity always comes from the session; `userId` / `buyerId` in a body or query is ignored. Simultaneous adds cannot exceed four: each product takes one of four slots and the unique partial index `buyer_compare_slot` (userId, slot) lets a slot hold one product, so the database itself refuses a fifth (test B-07: six parallel adds keep exactly four; an earlier "count, then trim" design could leave five under a race and was replaced).

## Rules of the comparison

Rows: price (marked "(estimated)" for catalogue prices), price unit, minimum order, category, subcategory, supplier, location, supplier type, supplier verification ("Verified" only where the record says so, otherwise "Not verified"), rating (only if the record has one), plus up to 12 of the most common specification labels. Missing values are `null` and shown as "Not Provided". Rows that differ carry the word "Differs". Notices: mixed price units, catalogue prices are estimates, some products no longer available. **Nothing is ranked, scored or called best.** No contact fields are loaded.

## Honest limits

Catalogue products have few specifications, no MOQ and no ratings, so many rows show Not Provided; that is the data. This page compares products only; suppliers are compared from Saved Suppliers (`/buyer/compare-suppliers`). There is no persistence across accounts or devices beyond the buyer's own server-side list.
