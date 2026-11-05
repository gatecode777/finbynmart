# Buyer Saved Products (`/buyer/saved-products`)

Tracker row 30 (baseline "Wishlist", `/account/wishlist`), route moved into the buyer workspace. The owner's PRD text for this page was not sent; the build follows the reference image (labelled "Page 27 — Buyer Saved Products" by mistake) and the project rules. Role: authenticated buyer only.

## Layout (follows the reference)
- Shared buyer shell, **Saved Products** is the current (gold) sidebar item. Breadcrumb Home > Buyer Dashboard > Saved Products; heading, description and **Add More Products** (to `/products`).
- Category tabs with counts: **All Saved (n)** then each category the saved products belong to, most first (the category comes from the catalogue, the same function as the dashboard's category chart). Counts follow the search.
- Toolbar: search by product or supplier name (debounced, 60 characters), sort (Recently Saved, Oldest Saved, Name A-Z, Name Z-A, Price Low to High, Price High to Low), **grid / list** toggle (remembered in the browser).
- Cards (grid: 4 per row on wide screens, fewer on narrow; list: one per row): image, category tag, name (links to the product), short description, "By supplier" (linked when the supplier has a public page; "Verified" only when its record says so), price with unit, **Get Quote** (the existing inquiry form of that supplier for that product; hidden when the supplier has no public page), **View Product**, and a heart that removes the product.
- Removal asks first in the shared alert dialog (names the product, says it can be saved again, focus on "Keep it"), then shows the success toast; the card and counts update only after the server confirmed.
- Pager "Showing a - b of n saved products" (12 per page, up to 48 by API); states: skeleton when slow, **No Saved Products Yet** (with Explore Products), "No matching saved products" / "No saved products in this category" with Clear filters, an error with Try again. A product that has left the catalogue stays in the list as **unavailable** under its saved name (no price, link or quote), and can be removed.
- Choices live in the address (`?q=&category=&sort=&page=`); Back/Forward and reload restore them; a page restored from the cache is read again.

## Not built (honest)
- **Compare / Compare Selected / multi-select** (in the reference): there is no comparison feature or page, so no control is shown. The sidebar's Compare Products stays "Soon".
- The reference's `POST /api/buyer/saved-products`, `DELETE /api/buyer/saved-products/[id]`, `POST .../compare` and the `saved_products` collection: not created. Saving and removing already exist (`POST /api/buyer/wishlist`, `DELETE /api/buyer/wishlist/[productId]`, collection `wishlists`); only the list read is new. No second collection.
- Supplier logos, and any "date saved" text on the card (the sort uses it; the card does not show it).

Report: `docs/page-reports/buyer-saved-products-report.md`.
