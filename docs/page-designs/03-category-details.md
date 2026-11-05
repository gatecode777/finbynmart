# Page 03 — Category Details (`/categories/[slug]`)

Tracker: ID 03. Design **Reference Received** (`docs/design-references/03-category-details-reference.png`), Prompt **Complete**, Development **Complete** (implemented and functionally verified, 95 scripted checks shared with Page 04), QA **In Progress** (responsive verified in Chrome only). Master references: `DESIGN.md`, `CLAUDE.md`, `PAGE_TRACKER.md`, `01-homepage.md`, `02-all-categories.md`.

## Objective

Show one category with its real subcategories and products, and let a buyer narrow, sort and page through them, ask for a quote and post a bulk requirement. Same visual language as the homepage and Page 02.

## Layout and section hierarchy

1. Global utility bar, header and category navigation: shared, unchanged.
2. `category/CategoryDetailHero`: breadcrumb Home › All Categories › {Category} (shared `ui/Breadcrumb`), icon, Anton title, description, computed stats, approved category photo.
3. `category/SubcategoryChips`: "Popular subcategories" (6 by product count) with a "More" control that reveals every eligible subcategory; "All {Category}" resets.
4. Filter sidebar `category/CategoryFilters` (desktop sticky; below the lg breakpoint the shared `ui/FilterDrawer` titled "Filters").
5. `category/ListingToolbar`: result summary, sort, grid/list switch.
6. Applied-filter chips (each removes only itself) and the product grid or list of `category/ProductCard`.
7. Shared `ui/Pagination`, 20 products per page.
8. `category/BulkRequirementCta`.
9. `homepage/TrustBenefits`, then the global footer.

The markup lives once in `category/CategoryListingPage`; Pages 03 and 04 only supply data and wording (standing instruction 3 in `CLAUDE.md`).

## Component reuse

Reused: `MainHeader`, `AnnouncementBar`, `CategoryNavigation`, `Footer`, `Container`, `Breadcrumb`, `Button`, `Select`, `EmptyState`, `FilterDrawer`, `Pagination`, `ResultSummary`, `TrustBenefits`. New and shared: `CategoryListingPage`, `CategoryDetailHero`, `SubcategoryChips`, `CategoryFilters` (+ `FilterCheckList`), `ListingToolbar`, `BulkRequirementCta`, `ProductCard` (extended: whole-card link, `WishlistButton`), `ui/WishlistButton`, `ui/SignInPrompt`. The older `CategoryHero`, `SubcategoryGrid`, `ProductListingSection`, `FilterSidebar`, `ProductToolbar` and `utils/productFilters` are no longer used by any route; they are candidates for removal and were left in place.

## Data

One server-only service, `src/lib/catalog/categoryListing.ts`, behind `getCategoryRecord()` from `categories.ts`. `src/lib/catalog/listingQuery.ts` is the client-safe half (query type, option lists, URL parsing and building).

| Category | Source | What the records carry |
|---|---|---|
| Apparel & Fashion | The CSV catalog (`db/seed`, 21,392 products, active sellers only) | category, estimated price, seller state, colour. **No** MOQ, supplier type, brand, rating or verification |
| Packaging & Printing, Industrial Machinery, Electrical & Electronics, Construction & Real Estate, Health & Pharma | Sample B2B listings (`categoryPages.ts`, flagged in `docs/MISSING_ASSETS.md`) | supplier type, MOQ, rating, location, verified flag. **No** brand |
| Home & Lifestyle, Food & Beverages, Agriculture, Chemicals & Dyes | none | the page renders an honest empty state |

Only the visible page of products is turned into card data and sent to the browser; the index is built once per server process and held on `globalThis`.

### Filter groups (shown only when the category's records support them)

| Group | Rule |
|---|---|
| Category (subcategory) | Shown when the category has subcategories |
| Supplier Type | Sample-backed categories only |
| MOQ | Sample-backed categories only (1–10, 11–50, 51–100, Above 100) |
| Colour | Catalog-backed categories only |
| Price range | Min and max inputs; bounds come from the data |
| Location (state) | Both sources |
| Brand | **Never offered**: no record in the project has a brand |
| Verified supplier | Not offered as a filter; the sample records carry the flag, the catalog does not |

Facet counts are computed with every other active filter applied, but not the group's own filter, so an option never shows 0 only because it is already ticked.

Sorting: Relevance (source order), Price low→high, Price high→low. Newest and Popularity are not offered because the data has no such fields.

### URL contract

`/categories/<slug>?sub=a&sub=b&type=…&state=…&colour=…&moq=51-100&minPrice=100&maxPrice=900&sort=price-asc&view=list&page=2`. Repeated keys carry multiple values; each value is trimmed, capped at 80 characters, de-duplicated and capped at 60 entries. Unknown or malformed values fall back to defaults. Filtering is server-side through plain GET forms, so it works without client JavaScript; Apply Filters, Clear All, applied-filter chips, sort and pagination all produce links or form submissions, and a filtered URL opened directly renders the same result.

## Routing

| URL | Behaviour |
|---|---|
| `/categories/<slug>` | The page; `slug` is canonicalised (aliases `machinery-equipment` → `industrial-machinery`, `packaging-material` → `packaging-printing`: 307) |
| `/categories/industrial-supplies`, `/categories/more` | 307 to `/categories` |
| `/category/<slug>` | Legacy, 307 to the canonical URL, query string kept |
| Unknown slug | Real 404 (status 404) |
| `?page` beyond the last page | 307 to the last page |
| A known category with no eligible products | 200 with an empty state: other categories and Post Requirement, no filters, no toolbar, no invented products |

There is deliberately no `loading.tsx` above this route: it can 404 and redirect, and a loading boundary would stream a 200 first (a soft 404).

## Actions

- Product card: the whole card opens the product page (stretched link); the supplier link, the heart and "Get Best Quote" remain separate controls above it. "Get Best Quote" opens `/products/<slug>#get-best-quote`, which holds the real inquiry form.
- Heart: signed-in buyers save to MongoDB (`wishlists`); signed-out visitors are sent to sign in. The saved state is read back from the server on load.
- Bulk banner: opens `/post-requirement` with `category` (and `subcategory`) in the query; the form pre-fills them and stores a real requirement for a signed-in buyer.

## Responsive behaviour

Below 991px the sidebar is replaced by a "Filters" button that opens the shared drawer (focus trap, Escape, focus return, `inert` when closed); the subcategory chips are one row that scrolls sideways (wraps once "More" is opened); applied-filter chips wrap. Grid view is one column under 480px and an auto-fill grid (minimum card width 200px) from 480px up; list view is one card per row at every width. From 991px the sticky 270px sidebar sits beside the results. Touch screens (`pointer: coarse`) get 44px filter option rows. Verified by the audit at 45 widths (see the report); the exact column counts at each width were not recorded.

## SEO

Unique title and description per category; one `h1`; `BreadcrumbList` and `ItemList` JSON-LD (the list covers the visible page only); canonical emitted only when `NEXT_PUBLIC_SITE_URL` (or the Vercel production URL) is configured; any URL with a filter, a non-default sort or the list view is `noindex, follow` and canonicalises to the plain page; plain pagination (`?page=2`) stays indexable with its own canonical so every page of results can be found; the plain page is indexable. Product links are in the server HTML.

## States

Empty category and no-match (filters exclude everything) states exist and offer Clear All. `app/categories/[slug]/error.tsx` is the error boundary (not triggered in testing).
