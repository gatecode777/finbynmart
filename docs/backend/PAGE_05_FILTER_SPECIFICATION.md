# Page 05 filter specification

As implemented 2026-11-02 in `src/lib/catalog/categoryListing.ts`. Page URLs use the short names; the API accepts the PRD names as aliases (see the API reference).

## Semantics

- Within one group, selected values are OR (a product matches any ticked state). Across groups and with the search text, conditions are AND.
- A product that lacks an attribute never matches a filter on it (no supplier type, no MOQ, no colour). Missing is never treated as 0, as a default or as "any".
- Unknown category, subcategory, department and supplier ids are dropped and reported (page notice, API `ignoredFilters`). Other values are free text: an unknown state or city simply matches nothing.
- Facet counts: for each group, the search and all other filters are applied but not the group's own filter. A ticked option stays listed even at 0. Counts are for the supplier-and-product set in scope, never inactive or unlisted products.

## Groups

| Group | Page param | API param | Source | Shown when | Notes |
|---|---|---|---|---|---|
| Category | `category` | `category` | Main category directory | always (global page) | Six discoverable categories; searchable list |
| Subcategory | `sub` | `subcategory`, `sub` | Catalog category name / sample subcategory | always | 118 apparel categories + sample subcategories; counts follow the selected categories |
| Supplier type | `type` | `supplierType`, `type` | Sample listings | some product carries one | Manufacturer, Exporter, Wholesaler, Trader as present; apparel products have none and never match |
| Colour | `colour` | `colour` | Catalog | some product carries one | 42 colours |
| Price | `minPrice`, `maxPrice` | same | Estimated price (catalog) / listed price range (sample) | always | INR only; ranges overlap-match; inputs validated non-negative, min ≤ max (API) |
| MOQ | `moq=<unit>:<bucket>` | `moqUnit` + `minMOQ`/`maxMOQ` | Sample listings | some product carries one | Buckets 1–10, 11–50, 51–100, above 100, **per unit**; units normalised (pieces = piece, boxes = box) |
| Location (state) | `state` | `state` | Supplier | always | 13 states |
| City | `city` | `city` | Supplier | always | 18 cities |
| Department | `department` | `department` | Catalog category | URL only | From category-directory links |
| Supplier | `seller` | `seller` | Supplier slug | URL only | From supplier pages |

## Not offered

| PRD filter | Reason |
|---|---|
| Brand | No brand field in any record (search finds brand words that appear in a name) |
| Availability | No availability or stock field; publication status is not stock |
| Country | No country field (all suppliers are in India, but that is not data) |
| Currency other than INR | No other currency exists |
| Attributes (specifications) | Only colour exists; there is no per-category attribute configuration |
| Newest / Popularity sort | No dates or popularity data |

## Interaction

Plain GET form (works without JavaScript); with JavaScript `next/form` navigates on the client. "Apply Filters (N)" counts active filters (not the search text); "Clear All" keeps the search; applied filters show as removable chips; on phones the same form is in a drawer that closes after Apply or Clear All. Every filter change resets the page to 1.
