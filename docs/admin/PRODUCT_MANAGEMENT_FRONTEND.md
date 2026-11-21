# Admin Product Management: frontend implementation report

> Superseded for status and backend by `PRODUCT_MANAGEMENT.md` (backend now exists). This file remains the UI structure note.

Route `/admin/products` (tracker ID 54, verified in `docs/PAGE_TRACKER.md`). Status: **frontend implemented; backend integration pending; QA not started** (no authenticated browser run was possible). Nothing here changes data.

## Files
New: `src/app/admin/products/page.tsx`, `src/components/admin/AdminProductsWorkspace.tsx`, `src/components/admin/AdminProducts.module.css`, `src/lib/admin/productList.ts` (typed contract, URL state, reason validation), `src/lib/admin/productListDemo.ts` (demo fixtures), `docs/page-reports/tools/68-admin-products-frontend-unit-test.mjs`. Changed: `src/components/admin/AdminShell.tsx` (one sidebar entry, Products, with the existing Package icon), `docs/PAGE_TRACKER.md` (row 54).

## Reused
`AdminShell` and `src/app/admin/layout.tsx` (admin guard), `requireAdminPage` with the `products.review` capability (the same one as Product Review), `AdminInquiries.module.css` (page, breadcrumb, heading, panel, table, cards, badge, pager, empty, error), shared `Dropdown`, `SupplierProfile.module.css` buttons, `Auth.module.css` fields. The look is the existing admin pattern; nothing was restyled.

## Data mode
No product-list read API exists (`/api/admin/product-review` lists only PENDING submissions), so **normal mode shows an honest "The product list isn't available yet" panel** (404, 405 and 501 from the future endpoint mean "not built", never "empty"; a network or server failure shows an error with Retry; 401/403 shows a permission message). Demo records exist only for a local preview: an authenticated admin in a non-production build opening `/admin/products?preview=demo`. The fixtures are loaded by dynamic import only in that mode, are labelled on screen, never mix with live data, and filtering and paging in demo run locally in the browser as a demonstration. The preview does not bypass sign-in: the page is behind the admin guard (an anonymous request to `?preview=demo` redirects to sign-in, checked).

## Interactions implemented
Search (debounced 300 ms, stale requests cancelled), category, supplier, listing-status and sort dropdowns, Clear filters, previous/next paging (20 per page), all kept in the URL; loading skeleton; real empty versus no-match messages; details drawer (native `<dialog>`: focus trap, Escape, focus return, backdrop click, close button); unpublish confirmation dialog with a required reason (10 to 500 characters, labelled, error linked with `aria-describedby`); desktop table with caption and row/column headers; stacked cards below 768 px using the existing admin styles; neutral image fallback; long names wrap; missing SKU, price, MOQ and specifications read "Not provided" or are omitted.

## Unpublish: no mutation
The dialog states the intended public effect and requires a reason. In normal mode **Confirm Unpublish is disabled** with the visible explanation "the unpublish service is not connected yet". In the demo it only validates the reason and says "nothing was changed or saved". No request is sent, no row is removed or re-statused. There is no Delete Product. Review decisions are not duplicated: the page links to Product Review.

## Statuses (derived, none persisted for the UI)
PUBLISHED (publication APPROVED, not unpublished), PENDING_REVIEW (submitted revision awaiting a decision, nothing published), UNPUBLISHED (an approved listing taken down; needs the archive fact the public loader already respects), REJECTED. A published listing with a newer pending revision shows a separate "Pending changes" badge (the live content is still the approved one). Supplier drafts that were never submitted are not visible to admins and are not listed.

## Future API contract (not built; this round changes no backend)
`GET /api/admin/products?q=&status=&category=&supplier=&sort=updated|name&page=` (capability `products.review`, private, no-store, limit 20 fixed, page at most 1000, validated allow-lists, escaped search, indexed): `{ ok: true, data: { items: ProductRow[], meta: { page, limit, total|null, hasMore }, facets: { categories, suppliers } } }`. `GET /api/admin/products/<reference>`: `{ ok: true, data: ProductDetail }` (approved content and, separately, pending-change summary; only allow-listed fields, never private draft data or internal notes). Types: `src/lib/admin/productList.ts`. Unpublish (separate, later): `POST /api/admin/products/<reference>/unpublish { reason, expectedRevision }` in one transaction with an audit row, refresh of the public snapshot and a supplier notice.

## Checks actually run
`tsc` 0 errors, `lint` clean, production build compiled (route `/admin/products` listed), 39 of 39 unit scripts pass including new `68` (22 checks: URL-state allow-lists and round trip, reason validation, demo fixtures, and static structure: guard, demo gating, dynamic fixture import, honest states, no state-changing request, disabled confirm outside demo, dialog accessibility wiring, table and card structure, sidebar entry). Built server with an unreachable database: anonymous `/admin/products` and `/admin/products?preview=demo` redirect (307) to sign-in; `/api/admin/products` answers 404 (confirming the contract's "unavailable" case).

## Not tested (blocked)
No authenticated browser run: there is no admin account and no isolated database, and the guard was not bypassed. So the rendered page, drawer and dialog behaviour, keyboard and focus order, the 13 target widths, 200% zoom and landscape layouts, and contrast were **not** exercised in a browser; they are covered only by the static checks above and the shared admin styles. Remaining: connect the read API, build unpublish, then run the authenticated responsive and accessibility pass.
