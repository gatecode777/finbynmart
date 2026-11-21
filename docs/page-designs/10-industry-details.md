# Industry Details (original tracker Page 10, `/industries/[slug]`)

Status 2026-11-16: **Development: Implemented (mechanism complete) but every industry currently shows "products aren't set up yet", because no industry-to-category mapping is APPROVED.** Design: not marked complete. QA: In Progress (public read-only browser probe and unit checks run; nothing else). This is deliberate, not a gap in the code: the repository had **no** industry-to-category relationship, and the page rules forbid inferring one from names or keywords.

## What changed (extension of the existing page; no duplicate page, no redesign)
- The page keeps its hero banner and breadcrumb and now renders the shared listing component (`CategoryListingPage`) over the central listing engine through `getIndustryListing(mainCategoryIds, query)`: search, category chips, filters, sort, pagination (20 per page), product cards with Get Best Quote and View Details, and "Post your requirement" (the existing general-requirement page; no inquiry is created by viewing the page).
- `src/lib/constants/industryCategories.ts`: the mapping model (industry id → canonical MAIN category ids, `status` APPROVED | PROPOSED, `source`, `approvedBy`, `approvedOn`) and `validateIndustryMap`. **Only APPROVED entries are used.** All eight shipped entries are PROPOSED (documentation for the owner); education has no proposal.
- `src/lib/catalog/industryScope.ts`: server-side scope resolver (UNMAPPED, or MAPPED with the categories that are discoverable *now* by the central rule).
- `getIndustryListing` (in `categoryListing.ts`): a scoped view of the same eligible base index All Products uses, so every hiding rule applies (category inactive or empty, product not approved, unpublished, company suspended) and **facets, totals and chips are computed over the scoped base, never over one page**. A category filter outside the scope is dropped and reported (`ignored`), never honoured.

## States (never one empty state)
1. Unknown industry slug: the existing 404.
2. No approved mapping: "Products for this industry aren't set up yet" (links to all products and Post a requirement). The catalogue is never shown as a fallback.
3. Approved mapping, no discoverable category: "No public products in this industry yet".
4. Mapped, filters/search match nothing: the shared "no matches" state with its hint.
5. The catalogue read failed: "Products could not be loaded" with Try again (not a zero result).

## Mapping proposals awaiting owner approval (not used)
manufacturing → industrial-machinery, electrical-electronics, chemicals-dyes, packaging-printing · construction → construction-real-estate, industrial-machinery · agriculture → agriculture · healthcare → health-pharma · food-processing → food-beverages, packaging-printing · retail-wholesale → apparel-fashion, home-lifestyle · hospitality → food-beverages, home-lifestyle · education → none proposed. To approve one: set `status: "APPROVED"`, `approvedBy`, `approvedOn` in `industryCategories.ts`. Today only `apparel-fashion` has public products, so an approved mapping that includes it lists those products and the others appear automatically when they have public products.

## Not built (stated, not decorative)
- **Suppliers tab:** omitted. An accurate industry-scoped supplier view needs per-supplier category aggregation in the supplier listing engine; the existing supplier list cannot yet be scoped to categories.
- No new API: the page is server-rendered through the central engine; the public products API is unchanged.
- Subcategory-level mapping (only main categories; the engine includes every subcategory below them).
- The engine is in-memory (catalogue CSV plus the approved supplier snapshot), so pagination is over that index, not a database query; the approved-supplier snapshot refreshes within its 60 s TTL after an approval, unpublish, category or company status change (the same invalidation All Products uses). Listing results are cached 5 minutes per scope/query by the engine's existing cache.

## Inquiry actions
The cards reuse the existing Get Best Quote flow: the product reference only; the server reloads authoritative context (product publicly eligible now, company active, supplier actually offering it) in the inquiry route. The selected supplier receives the DIRECT inquiry and automatic matching runs through the central service; this page adds no distribution.

## Verification (what actually ran)
| Check | Result |
|---|---|
| `77-industry-details-unit-test.mjs`: mapping validation and "only approved is used", scoped listing on the real catalogue (scope, central eligibility, outside-scope filter dropped, search, deterministic pagination, bounded size), page wiring | 15 pass |
| Public read-only browser probe on the dev server, widths 320, 390, 768, 1024, 1440, 2560: unmapped state, a temporarily approved mapping (reverted afterwards), a category filter outside the scope, an empty search | no horizontal overflow, no page errors, images with alt text; mapped page lists 10 cards per probe page at the time of the probe (page size is now 20) |
| `tsc --noEmit`, `npm run lint` | pass |
| Not run: the other 10 widths, landscape, zoom 80–200 %, keyboard and screen-reader checks, signed-in inquiry submission through an industry card, supplier-product inclusion (needs approved supplier products in a database), Lighthouse or latency measurements |
