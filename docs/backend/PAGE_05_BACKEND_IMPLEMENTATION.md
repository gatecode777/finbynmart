# Page 05 backend implementation (as built)

2026-11-02. No MongoDB collection or index was created or changed for this page: it reads the in-memory catalog. Writes (wishlist, quote, requirement) reuse the Pages 1–4 backend described in `BACKEND_ARCHITECTURE.md`.

## Services

| Module | Role |
|---|---|
| `src/lib/catalog/listingQuery.ts` (client-safe) | `ListingQuery` type, option lists, `normalizeSearchQuery`, `parseListingQuery` (lenient, for pages), `listingParams`, `listingHref`, `NO_FILTERS`, unit helpers (`unitKey`, `unitLabel`, `moqBucketOf`, `describeMoq`), constants (`PAGE_SIZE` 20, `PRODUCTS_PAGE_SIZE` 10, `MAX_PAGE_SIZE` 50, `MAX_QUERY_LENGTH` 100) |
| `src/lib/catalog/categoryListing.ts` (server-only) | The one listing engine. `getProductListing(query, {pageSize})` for all products, `getCategoryListing(slug, query, {sub})` for Pages 03/04, `getSubcategoryInfo`. Builds a row index per category once per process and a merged index for all products (`globalThis.__finbynListingIndexes`) |
| `src/lib/catalog/publicProduct.ts` | `PublicProduct` DTO, `toPublicProduct`, `toPublicFacets`, `normalizeImage` |
| `src/lib/catalog/publicProductQuery.ts` | Strict parsing and validation of the API query string |
| `src/app/api/public/products/route.ts` | `GET /api/public/products` |

The PRD's suggested split (`product.service`, `product-search.service`, …) was not created: the existing engine already holds those concerns in one module, and the PRD says not to duplicate.

## Visibility

A product is listed when its main category is in the category directory (has products, is active) and its seller is an Active catalog seller; sample listings are listed with their sample category. There is no draft, rejected, deleted or suspended state in the data, so those rules cannot be exercised; they will need a `status` field when a products collection exists. Products whose seller is missing or inactive, or whose category is unknown, are dropped when the catalog loads (the seed currently has none such: 138 inactive sellers own no products).

## Search

Described in the page spec (`05-all-products.md`): normalise, up to 8 words of up to 100 characters, AND semantics, short words must start a word, longer words match anywhere in name, category, subcategory, colour, department and main-category name. The match per row is computed once per request. Unbounded regular expressions are not used anywhere. No Atlas Search and no paid service.

## Filtering and facets

Filters are applied to the row index, never in the browser. Facet counts for each group are computed with the search and all other filters applied but not the group's own filter; a selected option stays listed at 0. Groups: category, subcategory, supplier type (if any product has one), per-unit MOQ (if any product has one), state, city, colour (if any product has one), price bounds. Each tally is one pass over the 21,404 rows (about eight passes per request). Facets are recomputed per request; with the catalog in memory this is a few milliseconds, so no extra cache was added (the unfiltered state is what a cache would hold if the catalog moves to a database; invalidation would then be on catalog change).

## Sorting

`relevance` (search score, then source order), `price-asc`, `price-desc` (price, then source order). Prices are all present (minimum 139, maximum 12,539 on catalog; sample listings 12 to 75,000), so there is no missing-price case; a product without a price would sort by its absence of a value only if one existed. `newest` and `popularity` are rejected by the API.

## Pagination

`page` and `limit` (default 10 on `/products` and the API, maximum 50). The engine clamps the page to the last page and reports `hasNextPage`/`hasPreviousPage`; the page redirects to the last page; the API returns the last page with accurate meta. Only the visible page is converted to card data.

## Supplier and image integration

Each product carries its own supplier (seller id, name, slug, url, city, state, supplier type if any, verification status). Lookups are by map, one per visible card (no per-product query). A product whose seller cannot be resolved is not loaded. Images: `normalizeImage` accepts a string, an array or an object with `url`/`src`/`imageSrc`/`images`; local paths must be site-relative, remote URLs must be https from `assets.myntassets.com` or `www.finbynkart.com`; anything else becomes `null` (the card shows its branded tile). The catalog's `http://` URLs are upgraded to https at load time. 21,392 of 21,392 catalog image URLs are valid on the allowed host.

## Public API

See `PAGE_05_API_REFERENCE.md`.

## Wishlist, quote, requirement

Unchanged backend (`BACKEND_ARCHITECTURE.md`, `API_REFERENCE.md`): heart → `/api/buyer/wishlist`; "Get Best Quote" → the product page's inquiry form → `POST /api/inquiries` (supplier resolved on the server); banner → `/post-requirement` → `POST /api/requirements`. This page only passes context (search text, category) in the link.

## Indexes for a future database

If the catalog moves to MongoDB the query patterns would need: text or Atlas Search on name/category/colour; `(categoryId, subcategoryId)`; `(sellerId)`; `(price)`; `(state, city)` on the supplier lookup; `(unit, moq)` for MOQ. None is created now.

## Cache

`GET /api/public/products` sends `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` (the catalog changes only with a deploy). The in-memory indexes live for the life of the server process and rebuild on restart.
