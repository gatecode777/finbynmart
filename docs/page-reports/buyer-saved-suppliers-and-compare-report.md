# Report — Saved Suppliers and Compare Products (buyer workspace)

Date: 2026-11-04. No PRD text or reference images were sent for these two sidebar items; both follow the existing design system and the Saved Products / quotation comparison patterns. Orders was not built (see the end).

## Saved Suppliers — `/buyer/saved-suppliers` (tracker row 31)

Built on the existing `wishlist_suppliers` collection and the existing save/remove routes. New: list service and `GET /api/buyer/saved-suppliers`, page, workspace and card, category tabs, search (name, city, state, category), four sorts, pagination, removal with confirmation, honest empty, error and "no longer available" states. Changed: the save path now stops at 500 suppliers (409) and has a newest-first index.
Tests: `saved-suppliers-test.mjs` 36 checks (38 with the performance group) and `saved-suppliers-rules-unit-test.mjs` 8/8, both passing. Covered: access, isolation, list rules, remove, cap, indexes, page behaviour, 16 widths, and 500 saved suppliers (p95 174 ms, index scan).
Not shown, because the data does not exist: ratings, response rate, contact details, verification of catalogue sellers.

## Compare Products — `/buyer/compare` (new tracker ID 102)

New `compare_items` collection (one list per buyer, at most 4, unique per product, 2 indexes), service, API (`GET`, `GET ?view=details`, `POST`, `DELETE`, `DELETE /{productId}`), page, comparison view (table from 900px, cards below), `CompareButton` on product pages and Saved Products cards (reuses the generic wishlist client store). Differing rows say "Differs", missing values "Not Provided", catalogue prices are labelled estimates, mixed price units are flagged, nothing is ranked or called best. Concurrency: six simultaneous adds keep exactly four.
Tests: `compare-products-test.mjs` 44/44 (access, add rules and limit, race, isolation, comparison data, unavailable products, remove and clear, page and button behaviour in a browser, 16 widths, performance: full comparison p95 127 ms).

## Regression (same build, performance groups skipped)

Page 22 dashboard 96/96 (the sidebar now has one non-link item), Saved Products 40/40, Page 06 product details 69/69, Page 08 suppliers 90/90, Page 09 supplier profile 46/46, Pages 29/30 quotations 99/99, Pages 27/28 inquiries 98/98; `tsc`, `npm run lint` and the production build clean.

## Not tested

Firefox, Safari, real devices, browser zoom, landscape, screen readers, automated contrast, Lighthouse. Both pages are Design/QA "In Progress", not complete.

## Orders — not built

The sidebar's last "Soon" item needs a domain this project does not have: no order model, no payment, no supplier fulfilment, no delivery tracking, no status vocabulary. Accepting a quotation intentionally creates nothing (see `docs/backend/PAGE_30_QUOTATION_DECISION_RULES.md`). Building an Orders page would mean inventing that whole model, or a page that can only say "not available", which the project rules forbid as a decorative page. It needs an owner decision or PRD first: who creates an order (buyer checkout, supplier confirmation after an accepted quotation, or both), the statuses, whether payment is in scope, and what a supplier must do to update it.
