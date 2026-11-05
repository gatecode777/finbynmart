# Page 04 — Subcategory Details (`/categories/[slug]/[subcategory]`)

Tracker: ID 97 (new; the approved baseline's ID 04 is Products, see the crosswalk in `PAGE_TRACKER.md`). Design **Reference Received**, Prompt **Complete**, Development **Complete** (implemented and functionally verified, 95 scripted checks shared with Page 03), QA **In Progress** (responsive verified in Chrome only). Reference image: `docs/design-references/04-subcategory-details-reference.jpg`. Master references: `DESIGN.md`, `CLAUDE.md`, `PAGE_TRACKER.md`, `03-category-details.md`.

## Objective

Show one subcategory (for example Men Tshirts under Apparel & Fashion, or Corrugated Boxes under Packaging & Printing) with its products, narrowed by only the filters that make sense inside it. It is the same view as Page 03 with a different scope, so it uses the same component and differs only in data and wording.

## Shared view

`category/CategoryListingPage` renders both pages (standing instruction 3 in `CLAUDE.md`: pages that differ only in data share one component). Layout, filter drawer, toolbar, grid and list views, pagination, the bulk banner, the empty states and the SEO rules are exactly those in `docs/page-designs/03-category-details.md`. Only the differences are listed below.

## What differs from Page 03

| Area | Page 04 |
|---|---|
| Data call | `getCategoryListing(slug, query, { sub })` restricts the rows to the subcategory; the Category (subcategory) filter group and the popular-chips list are omitted |
| Breadcrumb | Home › All Categories › {Category} › {Subcategory}, 4-item `BreadcrumbList` |
| Hero | Title is the subcategory; stats are Products and, for a sample-backed category where the records carry a verified flag, Verified Suppliers, otherwise Suppliers; photo is a real product photo of the subcategory, falling back to the parent's approved image |
| Related row | "Explore Subcategories:" starts with "All {Category}" (links to Page 03) and lists the real siblings, most products first, the current one highlighted. For the catalog, a sibling is a category in the same department (Men Tshirts shows Men categories only); for sample categories, all other eligible subcategories. "More" reveals the rest |
| Filter groups | Only those the records support inside this subcategory: Colour, Price, Location for Apparel & Fashion; Supplier Type, MOQ, Price, Location for sample categories. No Brand, no Category group |
| Bulk banner | "Need {Subcategory} in Bulk?"; the link carries `category`, `subcategory` and `product` to `/post-requirement`, which pre-fills them |
| Empty state | Cannot occur for a valid URL: a subcategory with no eligible products is not publicly discoverable and returns 404 |
| Title | "{Subcategory} — {Category} | Finbyn Mart" |

## Routing and validation

| URL | Behaviour |
|---|---|
| `/categories/<slug>/<subcategory>` | The page |
| Parent is an alias (`machinery-equipment`, `packaging-material`) | 307 to the canonical parent, subcategory and query kept |
| Parent is `industrial-supplies` or `more` | 307 to `/categories` |
| Unknown parent | Real 404 |
| Subcategory unknown, under the wrong parent, or with no eligible products | Real 404; another category's products are never shown under it |
| `?page` beyond the last page | 307 to the last page |

Subcategory ids for the catalog are `slugify(category name)`, for example `men-tshirts`. The product counts of a parent's subcategories partition the parent (no product is in two subcategories); this is checked by test 4-14.

Like Page 03 there is no `loading.tsx` above the route, because it can 404 and redirect.

## SEO

Same rules as Page 03: unique title and description per subcategory, one `h1`, `BreadcrumbList` and `ItemList` JSON-LD, Open Graph with the subcategory photo, canonical only when the site origin is configured, `noindex, follow` for filtered, sorted or list-view URLs, plain pagination indexable.

## Not offered, and why

- Brand filter: no record anywhere carries a brand.
- Rating and verified-only filters: rating and the verified flag exist only on the sample B2B listings and not on the 21,392 catalog products, so a filter would behave differently per category. Not built.
- Newest and Popularity sort: no creation date or popularity data exists.

They appear only if a real data source supplies the fields.
