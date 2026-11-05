# Page 34 report — Buyer Saved Suppliers

Date: 2026-11-04. Route `/buyer/saved-suppliers` (+ `/buyer/compare-suppliers`). Spec: `docs/page-designs/34-buyer-saved-suppliers.md`. This PRD described a page that already existed (tracker row 31), so it was **extended, not rebuilt**.

## What was found first

The saved-supplier relationship, the shared save / remove routes and a basic list page existed. There was no supplier "company" repository: suppliers are a read-only seed (fictional catalogue sellers and a few sample suppliers) with name, city, state, a category, products and, for samples only, a type, a verified flag and one description. No logos, banners, ratings, reviews, countries, verification workflow, messaging or multi-supplier inquiry exist. Audit: `docs/backend/PAGE_34_SAVED_SUPPLIERS_AUDIT.md`.

## What was built

Backend: `src/lib/wishlist/savedSuppliers.ts` (live per-supplier facts memoised per supplier, filters, sorts, summary and facets, comparison), `savedSuppliersRules.ts` (parser, limits), `supplierService.ts` (bulk remove, clear), `categoryCount` added to the public supplier DTO; routes `GET …/saved-suppliers` (filters), `GET …/summary`, `POST …/bulk-remove`, `DELETE …/saved-suppliers` (Clear All), `POST …/compare`. No new collection; the shared save / remove routes were reused, not duplicated.
Frontend: summary cards, Filters dialog, Grid and List view, selection with the 20 / 2-to-4 / one-inquiry rules, bulk and clear-all dialogs, supplier comparison page.
Tests: `saved-suppliers-test.mjs` 69/69, `saved-suppliers-rules-unit-test.mjs` 12/12, regression suites green (`PAGE_34_TEST_REPORT.md`).
A bug found along the way and fixed: Compare Products could keep five products under a simultaneous-add race; the limit is now a database constraint.

## Feature status

| Feature | Status |
|---|---|
| Listing, save / remove (shared routes), search, category / state / city / type / verification filters, sorts, Grid and List, pagination | Implemented, tested |
| Summary: Total Saved, Verified, Active, Product Categories, **States** (not Countries) | Implemented, tested |
| Selection (max 20), Remove Selected, Clear All | Implemented, tested |
| Compare Selected (2 to 4, own saved suppliers, no ranking) | Implemented, tested |
| Contact Supplier (inquiry form), Add to Inquiry (one supplier) | Implemented, tested |
| Logos and banners, ratings and reviews, "Highest Rating", verification pending / rejected, countries | **BLOCKED**: no data or workflow |
| Buyer-supplier messaging, multi-supplier inquiry | **BLOCKED**: no module |
| Supplier suspension, unlisting, retention states | Not applicable: the data has only listed or not listed |

## Performance (final run, 500 saved suppliers, remote cluster, indicative)

Listing p95 198 ms (target 350), summary 153, search and filters 113 to 124, bulk removal of 20 p95 153 (target 500); an index scan with no collection scan or blocking sort. Details and what was not measured: `PAGE_34_PERFORMANCE_REPORT.md`.

## Honest summary

Real buyers can use all of it, but the content is limited by the data: no logos, ratings or countries exist, and only sample suppliers can be "verified". Design and QA are not marked complete: no Firefox, Safari, device, zoom, landscape, screen-reader or Lighthouse runs, and the reference image was matched by screenshots only (grid and list at 1440 and 390).

Not committed. Cleanup done: throwaway database dropped, test server on port 3100 stopped, `tsconfig.json` reverted.
