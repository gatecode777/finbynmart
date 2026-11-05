# Page 05 — All Products (`/products`)

Tracker ID 04 (owner PRD number 05; see the crosswalk in `PAGE_TRACKER.md`). Reference: `docs/design-references/05-all-products-reference.jpg`. Master references: `DESIGN.md`, `CLAUDE.md`, `PAGE_TRACKER.md`, `01-homepage.md`, `02-all-categories.md`, `03-category-details.md`, `04-subcategory-details.md`. Status and test evidence: `docs/page-reports/05-all-products-report.md` and `05-all-products-backend-report.md`.

Per the standing instruction the page already existed (apparel-only filter bar and grid). It was modified, not rebuilt: the route, the catalog data layer and the shared `ProductCard`, `Pagination`, `FilterDrawer`, `ResultSummary`, `BulkRequirementCta` and `TrustBenefits` were kept; the page now renders through the shared listing view.

## Objective

Let a buyer browse every publicly discoverable product, search it, narrow it with filters, sort it, switch grid and list, save a product, open it, ask for a quote and post a requirement. All data is real catalog data or the flagged sample B2B listings; nothing is typed into the page.

## Layout and section hierarchy

1. Global utility bar, header and category navigation: shared, unchanged.
2. `ui/PageHero` (new, shared with the later listing pages): breadcrumb Home › Products; eyebrow "Explore Our Product Range"; Anton heading "ALL" (plain) + "PRODUCTS" (gold); description; three computed statistics; warehouse photo framed by a gold arc.
3. `ui/SearchPanel` (new, shared): floating card "Search Products" with the input and the Search button.
4. Filter sidebar (`category/CategoryFilters`, "global" variant; below 991px the shared `ui/FilterDrawer`).
5. Heading "All Products (N)", Sort By, grid/list toggle (`category/ListingToolbar`).
6. Notice for unrecognised filters, applied-filter chips, then the grid or list of `category/ProductCard`.
7. "Showing X–Y of N products" and `ui/Pagination`.
8. `category/BulkRequirementCta` "Can't Find the Right Product?"; `homepage/TrustBenefits`; global footer.

The page-level markup is `category/CategoryListingPage`, the same component as Pages 03 and 04, extended with `hero`, `search`, `heading` and `filtersVariant` slots (standing instruction 3). Page 07 (search results) will use it the same way.

## Differences from the reference, on purpose

| Reference | Built | Why |
|---|---|---|
| 50,000+ products, 10,000+ suppliers, 50+ categories, 100% verified | Computed: products, suppliers, categories | The figures are placeholders. There is no verification workflow, so no verified statistic or percentage is shown |
| "from verified suppliers" in the hero text and the banner | "from suppliers" | Catalog sellers carry no verification (CLAUDE.md: never shown as verified) |
| Category list of industrial categories with large counts | The six discoverable categories with real counts, then a searchable Subcategory group | Only six main categories have products |
| Brand and Availability filter groups | Not offered | No record carries a brand or an availability value |
| Rating on every card | Only where a record has one (sample listings) | Catalog products have no ratings |
| Placeholder examples "Solar Panel, Packaging Box" | "T-Shirt, Air Compressor, Corrugated Box" | Examples that return results |
| Hero photo of cartons on a pallet | Existing warehouse photo `/images/industries/retail-wholesale.jpg` | The pallet photo is not in the project (listed in `docs/MISSING_ASSETS.md`) |
| Sort: Newest, Popularity | Relevance, Price low to high, Price high to low | The data has no dates and no popularity |

## Component reuse

Reused: header, utility bar, navigation, footer, `Container`, `Breadcrumb`, `Button`, `Select`, `EmptyState`, `FilterDrawer`, `Pagination`, `ResultSummary`, `ProductCard`, `WishlistButton`, `BulkRequirementCta`, `TrustBenefits`, `FilterCheckList`, `ListingToolbar`. New and shared: `ui/PageHero`, `ui/SearchPanel`. Extended: `CategoryListingPage`, `CategoryFilters`, `FilterDrawer` (closes itself when a form inside submits), `PageBody` (no longer wraps a second `Container`). `CategoriesHero` (Page 02) is a near-duplicate of `PageHero` and is a candidate to migrate.

## Search

One central engine (`getProductListing`, see `docs/backend/PAGE_05_BACKEND_IMPLEMENTATION.md`). Text is normalised (lower case, hyphens dropped: "t-shirt" is "tshirt"; a lone letter joins the next word: "t shirt" is "tshirt"), capped at 100 characters and 8 words, and every word must match. Words of up to three letters must start a word ("men" does not find "women"); longer words match anywhere in name, category, colour or department ("shirt" finds "tshirt"). No regular expression and no database query are involved. Fields searched: product name, category, subcategory, colour, department (brand and model words are found where they appear in the name; there is no separate brand, model or SKU field).

Interaction: typing updates the results after a 400 ms pause (at least two characters, or an empty box) through client-side navigation, with a spinner and a screen-reader "Searching…" status; Enter or the button applies immediately; the × button clears. The text lives in `?q=`. Without JavaScript the card is a plain GET form.

Relevance (when searching): per word an exact name word scores 6, a name word starting with it 4, a match inside the name 3, a match only in category or colour 1; the phrase at the start of the name adds 5, anywhere in the name 2; ties keep source order. Without search text, "Relevance" is source order (categories in directory order, then catalog order). It makes no popularity claim.

## Filters

All server side, through the URL; a filtered URL opened directly gives the same page.

| Group | URL parameter | Rule |
|---|---|---|
| Category (main) | `category` (repeatable) | Six discoverable categories with counts; searchable; open by default |
| Subcategory | `sub` | Searchable list, limited by the selected categories; collapsed unless used |
| Supplier Type | `type` | Shown because some products carry one; a product without a type never matches |
| Colour | `colour` | Catalog products only |
| Price Range (₹) | `minPrice`, `maxPrice` | Open by default; overlapping price ranges match |
| MOQ | `moq` = `<unit>:<bucket>` | **Per unit** (1–10 pieces, 11–50 rolls, …); units are never compared; a product without MOQ is not "MOQ 0" |
| Location (State) | `state` | 13 states |
| City | `city` | 18 cities |
| (URL only) Department | `department` | From the category directory links; shown as a chip |
| (URL only) Supplier | `seller` | From supplier pages; shown as a chip with the supplier name |

"Apply Filters (N)" shows the active filter count (search text not counted); "Clear All" removes the filters and keeps the search. Facet counts are computed with the search and every other filter applied but not the group's own, so an option never reads 0 only because it is ticked. Unknown category, subcategory, department or supplier ids are ignored with a visible notice. The API also accepts a unit-aware MOQ range (`moqUnit`, `minMOQ`, `maxMOQ`).

## Sorting, view, pagination

Relevance, Price low→high, Price high→low (ties keep source order); grid or list (`view=list`). Page size 10 by default (the PRD), `limit` up to 50 (larger values are capped). "Showing X–Y of N", Previous, numbers, last page, Next. A page past the end redirects (307) to the last page; a non-numeric page is page 1. Search, filters, sort, view and page size are kept in every link.

## Navigation and actions

Whole-card link to `/products/<slug>`; supplier link to `/suppliers/<slug>`; "Get Best Quote" to `/products/<slug>#get-best-quote` (the real inquiry form); the heart saves to `wishlists` (signed-out visitors are sent to sign in). The banner opens `/post-requirement` with the search text as the product and, when exactly one category is selected, that category.

## Responsive behaviour

Phone: stacked hero (photo first), stats wrap, the search card stacks label, field and button, "Filter Products" opens the drawer (closes after Apply or Clear All), one-column cards. From 480px an auto-fill grid; from 991px the sticky sidebar sits beside the grid and the grid reaches five columns where the width allows.

## SEO policy

Unique title and description; one `h1`; `BreadcrumbList` and `ItemList` JSON-LD (visible page only); canonical only when `NEXT_PUBLIC_SITE_URL` (or the Vercel production URL) is set; any URL with search text, a filter, a non-default sort, list view or `limit` is `noindex, follow`; plain pagination (`?page=N`) stays indexable with its own canonical; product links are in the server HTML.

## States

No match: count 0, a hint naming the search, "Clear search" and "Clear all filters". Unrecognised filters: a notice. Error: `app/products/error.tsx` (Try again, Browse categories). There is deliberately no `loading.tsx`: the page can redirect (out-of-range page) and a loading boundary would stream a 200 first; the page is fully server rendered, so there is no client data fetch to show a skeleton for. Search and filter changes show a pending spinner.

## Acceptance

See the report for what was run: 117 scripted checks on the page and the API, plus the regression suites of Pages 02–04 and the backend.
