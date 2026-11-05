# Page 05 backend audit (All Products)

Written before the implementation, 2026-11-02, from the repository as it was after Pages 01–04. Where later work changed a finding it is marked.

## What exists and was reused

| Area | Finding | Used how |
|---|---|---|
| Product source | **No product collection in MongoDB.** The catalog is `db/seed/*.csv` (21,392 products, 1,200 sellers of which 1,062 active, 118 categories, sizes) read once into memory by `src/lib/catalog/data.ts`, plus 12 sample B2B listings in `src/lib/constants/categoryPages.ts` for five other categories | Kept as the approved source. Nothing migrated; `docs/backend/CATALOG_MIGRATION_PLAN.md` named in the PRD does not exist |
| Catalog service | `src/lib/catalog/queries.ts` (`listProducts`, facets, apparel only), `categories.ts` (directory and category records), `categoryListing.ts` (per-category engine for Pages 03/04), `mappers.ts` (card data), `productRef.ts` (key resolution for writes) | The per-category engine became the single engine for the whole site; `queries.ts` is no longer used by `/products` (still used by the supplier and product pages) |
| Search | Substring match over a normalised string per product (`searchText`/`searchTokens` in `slug.ts`), no database search | Reused the normaliser; rules tightened (see the implementation doc). MongoDB Atlas Search is not in use and not needed for an in-memory catalog; no paid search service was added |
| Images | Catalog photos are `http://assets.myntassets.com/...` URLs (upgraded to https in code, hot-linked, `next/image` `unoptimized`); sample photos are local `/images/products/*.webp`. **ImageKit is not present in the project** (CLAUDE.md) and there is no image normalisation utility | Added `normalizeImage()` (string, array, object; local path or https allow-listed host; otherwise `null`) |
| Supplier data | Sellers have name, slug, city, state, specialization, rating, joined date. No verification field, no logo, no company profile; contact fields exist in the CSV but are never loaded | Public supplier object carries id, name, slug, url, city, state, type, verification status only |
| Wishlist | `wishlists` collection, `GET/POST /api/buyer/wishlist`, `DELETE /api/buyer/wishlist/[productId]`, unique `(userId, productKey)` index | Reused unchanged; `ProductCard` already carries the heart |
| Inquiry / quote | `inquiries` collection and `POST /api/inquiries`; product page "Get Best Quote" form | Reused; the card CTA opens that form |
| Requirement | `requirements` collection and `POST /api/requirements`; `/post-requirement` page reads product/category/subcategory from the link | Reused; the banner link passes the search text and category |
| Auth | Signed cookie session; roles not enforced | No change |
| Rate limit | `rateLimit()` in MongoDB with TTL | Reused for the new public endpoint |
| Pagination | `Page<T>` helper in `queries.ts`; `Pagination` UI | New metadata (`hasNextPage`, `hasPreviousPage`) added to the engine result |
| API response format | `{ ok, message, fields }` | New endpoint answers `{ ok, data, meta }` and errors `{ ok:false, code, message, fields }` (see the API reference) |

## Missing functionality (PRD item, status)

| Item | Status |
|---|---|
| Products collection with published/approved/active state, deleted/suspended flags | **Not present.** Eligibility today = product's category exists and its seller is Active (inactive sellers own no products in the seed, so the rule is in code but not exercised by data) |
| Brand, model, SKU, availability | **Not present** in any record: Brand and Availability filters are BLOCKED; brand and model words are only found when they appear in a name |
| Created/updated date, popularity | **Not present**: "Newest" and "Popularity" sorts are BLOCKED |
| Product-level rating and reviews | Not present for catalog products; sample listings carry sample ratings |
| Supplier verification | No workflow; catalog sellers are `unverified`; sample listings carry a sample flag |
| Product attribute configuration | Only `colour` exists |
| Country | No field |
| Currency | INR only |
| MOQ units | Only on sample listings, and mixed (pieces, rolls, boxes, kg, meters, sets): needed unit-aware handling |
| Featured products flag, `/api/public/products/featured`, `/facets`, `/[slug]` | No featured flag in the data (BLOCKED). Facets are returned inside the list response, so a separate endpoint was not needed; the product detail endpoint belongs to Page 06 |

## Data mapping problems found

1. Mixed MOQ units made the old bucket filter (used on Pages 03/04) compare unlike quantities (10 rolls with 10 pieces). Fixed in the shared engine; the filter is now per unit.
2. Only some products have supplier type or MOQ (the 12 sample listings). A filter on those attributes must exclude products without them rather than treat them as 0 or as a default.
3. `category` on `/products` used to mean a product category name ("Men Tshirts", linked from the product page breadcrumb); in the new scheme it is a main category id. Old links are mapped to subcategories.
4. Department links from the category directory use `/products?department=Men`; the parameter stays supported.
5. Subcategory ids must be unique across categories once everything is in one index. Verified there is no collision; the index build logs a warning if one appears.
6. 6,010 catalog products share a name with another product (different ids). Slugs end in the id, so URLs stay unique.

## Required modifications (done)

Extend the engine with a global scope, text search, city, department, supplier, per-unit MOQ and a page-size cap; add the public DTO and image normalisation; add the strict API parser and `GET /api/public/products`; convert the page to the shared view.

## Security risks identified

Unbounded or regex search (avoided: plain substring tests, 100 characters, 8 words); operator injection through query parameters (the API reads plain strings only and ignores unknown names); data leakage through DTOs (the public type is an explicit allow-list; test scans for contact fields); abusive request volume (rate limit; shared-cache headers); the public API returning sample data as real (each product carries `source`).

## Migration dependencies

None blocking. If the catalog moves to MongoDB, `src/lib/catalog/data.ts` and the index builders in `categoryListing.ts` are the seams; the indexes the queries would need are listed in the implementation doc.
