# Buyer Saved Products: implementation report

**Status:** Implemented and verified on the throwaway database; QA not complete. **BLOCKED / not built:** Compare and multi-select (no comparison feature exists), supplier logos.

**Audit, data and API:** `docs/backend/SAVED_PRODUCTS_AUDIT_AND_API.md`. **Design:** `docs/page-designs/buyer-saved-products.md`.
**Frontend:** `src/app/buyer/saved-products/page.tsx`; `src/components/buyer/saved/*` (workspace, card, styles; reuses the inquiries list-page controls, the shared ConfirmDialog and Toast); sidebar link live.
**Backend:** `src/lib/wishlist/savedProductsRules.ts` (pure), `savedProducts.ts`; `GET /api/buyer/saved-products`; the existing wishlist routes now stop at 500 saved products; new index `buyer_saved_newest` on `wishlists`. No new collection.
**Results:** 8/8 unit, 41/41 browser and API checks (access, ownership, listing from real catalogue products, unavailable products, categories, filters, six sorts, search, pagination, invalid input, save/remove/duplicate/cap, index plan, grid/list, tabs, dialog, toast, offline error, empty state, Back, 16 widths, performance at 500). Regression: Pages 05 (117), 06 (69), 08 (90), 09 (46), backend 1–4 (63) and 22 (96) re-run and passing.
**Performance:** at the 500-product cap the list p95 is 146 ms (279 ms in one earlier run); filtered, searched, sorted and last-page variants 131–147 ms.

**Gaps:** the owner's PRD text was not available (built from the reference image); Lighthouse, contrast, Firefox/Safari, landscape, zoom and screen-reader tests not run; category and sort are computed in memory over at most 500 rows (fine at the cap, not a database query).
**Tracker:** row 30 (Wishlist) updated.
