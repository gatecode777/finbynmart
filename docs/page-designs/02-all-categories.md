# Page 02 — All Categories (`/categories`)

Tracker: Design **Reference Received** (image saved as `docs/design-references/02-all-categories-reference.jpg`), Prompt **Complete**, Development **Complete** (implemented and functionally verified, 54/54 scripted checks), QA **In Progress** (responsive verified in Chrome only; no accessibility audit, Lighthouse, Firefox or Safari run). Master references: `DESIGN.md`, `CLAUDE.md`, `PAGE_TRACKER.md`, `01-homepage.md`.

## Objective

Let a buyer explore every discoverable product category, search categories, move between parent and child categories, see how many products each holds, and open the right listing page. Same visual language as the homepage.

## Reference

The generated All Categories design supplied with the Page 02 PRD (2026-11-02). Saved as `docs/design-references/02-all-categories-reference.jpg` (recovered from the session transcript, 1199×1312). What it shows: breadcrumb; a two-column hero with the eyebrow "EXPLORE OUR PRODUCT CATEGORIES", the Anton heading "ALL CATEGORIES", a sentence, three icon stats and a warehouse photo framed by a gold arc; a floating "Find a Category" search card; a "Browse Categories" sidebar with a cream-highlighted "All Categories" row, icon rows and chevrons; a grid headed "All Categories (N)" with "Sort By: Popular", five-column image cards (name, product count, circular arrow) ending in a mint "View All Categories" tile; the benefits strip; the footer.

## Layout and section hierarchy

1. Global utility bar, header, category navigation — shared, unchanged (A).
2. Hero (`category/CategoriesHero`) with the breadcrumb Home › All Categories using `ui/Breadcrumb` (B, C). Stats are computed, never typed in.
3. Search card (`CategoryExplorer`) floating over the hero's bottom edge (D).
4. Explorer (E, F, G): sidebar (270px, sticky) + grid; below 991px the sidebar becomes the shared `ui/FilterDrawer` titled "Browse Categories".
5. Benefits strip: `homepage/TrustBenefits` with `overlap={false}` (H).
6. Global footer, unchanged (I).

## Component reuse

Reused: `MainHeader`, `AnnouncementBar`, `CategoryNavigation`, `Footer`, `Container`, `Breadcrumb`, `Button`, `Select`, `EmptyState`, `FilterDrawer` (extended: anything marked `data-drawer-close` dismisses the drawer on selection), `TrustBenefits` (new `overlap` prop, default keeps the homepage behaviour). New and shared: `category/CategoryCard` (+ `CategoryImage` with a branded fallback), `category/CategoryExplorer`, `category/CategoriesHero`. Server: `src/lib/catalog/categories.ts`. Route extras: `loading.tsx`, `error.tsx`. `src/lib/site.ts` supplies the public origin when configured.

## Category data mapping

One central, server-only service: `getCategoryDirectory()` in `src/lib/catalog/categories.ts`. No page component holds its own category array.

| Level | Source | Fields |
|---|---|---|
| Main (6 today) | The 10 curated homepage categories (`lib/constants/categories.ts`), kept only when eligible | name, slug, description (from the category page where it exists), curated image, icon key, `productCount`, `href` |
| Department (5) | Catalog departments under Apparel & Fashion (Men, Women, Boys, Girls, Unisex), label "{Dept} Apparel" | name, count, representative product photo, `href=/products?department=…` |
| Category (118) | Catalog categories (e.g. Men Tshirts) | name, count, representative product photo, `href=/products?department=…&category=…` |

`CategoryNode` (`src/types/index.ts`): `id` (slug path), `name`, `slug`, `description`, `parentId`, `childIds`, `productCount`, `href`, `isActive`, `imageSrc`, `imageRemote`, `imageAlt`, `iconKey`, `source`. The PRD's `isActive` exists and is always true today because no admin control exists.

Images: main categories use the approved local photos (`/images/categories/*.png`); departments and categories use the photo of a product in that category (a correct, relevant mapping, hot-linked from the dataset host and loaded `unoptimized`); a missing or failed image falls back to a branded mint tile with an icon. No image is reused across unrelated categories.

Destinations match counts: Apparel & Fashion opens its subcategories and its "View all" link goes to `/products` (all catalog products); every other main category opens `/category/<slug>`, whose listing count equals the card's.

## Availability rules (as implemented)

- Inactive categories are excluded (`isActive`).
- A category is public only if it has at least one eligible product or an eligible child.
- A parent is public when it has eligible products or eligible children.
- Eligible products: catalog products whose seller is Active and whose category exists; sample B2B listings for the other mains.
- Nothing is written or mutated. A category that loses its last product drops out on the next process start; one that gains products appears. (Counts are computed once per server process; a hosted database should replace this with a cached query and explicit invalidation.)
- Result today: **6 of the 10 curated categories are discoverable**. Home & Lifestyle, Food & Beverages, Agriculture and Chemicals & Dyes have no products and are hidden — they still appear in the homepage tiles and top navigation, which is a pending decision (below).

## Product counts

Computed once per server process by a single pass over the catalog already held in memory (not a per-request scan, and not 21,392 rows sent to the browser). Each product is counted once per level (department, category) and the main categories partition the products, so the hero total (sum of mains) never double counts. Counts are exact: no "+", no rounding. The hero total includes the sample B2B listings (12) alongside the 21,392 catalog products. Verified against an independent parse of the seed CSVs.

## Search logic

Client-side over the small directory (129 nodes): matches name, parent names and, for curated categories only, the written description (auto-generated "N products" sentences are not searched, otherwise every query for "products" would match everything). Tokens are normalised like the catalog search (case, hyphens, a lone letter joins the next word: "t shirt" → "tshirt"). Typing is debounced 200 ms; Enter or the Search button applies immediately; the × button and "Clear search" reset. Matches are shown as cards with their parent trail ("Apparel & Fashion › Men Apparel"). No matches shows an empty state with a Clear button. A `role="status"` live region announces the result count. The query is mirrored to `?q=` and the server renders a shared `?q=` link correctly.

## Sidebar and grid

"All Categories (N)" plus each discoverable main category with its icon. Categories with children show an expand/collapse toggle (`aria-expanded`) and list their departments; selecting a parent or department shows its children in the grid (`?c=<id>`), heading "{Name} (N)" and a "View all N products" link to the real listing. The active row is highlighted (cream with a gold edge) and `aria-current`. Leaf categories link straight to their listing. Sorting offers only real orders: Popular (most products) and Name A–Z. Grids show 15 cards at a time; the final "View All Categories" tile (shown only when more remain) loads the next batch, so nothing is hidden without a control. An invalid or leaf `?c=` falls back to All Categories.

## Responsive behaviour

| Width | Behaviour |
|---|---|
| Phone | Photo, then text, stats wrap to two rows; search card stacks (label, field, button); "Browse Categories" button opens the drawer; 2-column grid; benefits 2×2 |
| Tablet (≥640) | Search label above a field + button row; 3-column grid |
| ≥900 | Hero photo bleeds to the right edge with the gold arc |
| ≥991 | Search on one row; sidebar and grid side by side; 3 columns |
| ≥1100 / ≥1360 | 4 / 5 columns |

## SEO

Unique title and description; heading order h1 (hero) › h2 (sidebar title, grid heading); `BreadcrumbList` and `ItemList` JSON-LD; canonical `/categories` emitted only when `NEXT_PUBLIC_SITE_URL` (or the Vercel production URL) is configured, because the host is otherwise unknown; any `?c=` or `?q=` view is `noindex, follow` so child views create no duplicate metadata; main category cards are plain links present in the server HTML; card images use empty alt with the name in the link label.

## States

Loading: `app/categories/loading.tsx` skeleton. Empty: "No categories are available yet" when nothing is eligible; no-results state for searches. Error: `app/categories/error.tsx` with Try again and a link out (not triggered in testing).

## Accessibility

Search is a labelled `role="search"` form; sidebar is a labelled `nav` with `aria-current`; toggles have `aria-expanded` and names; the drawer manages focus, traps nothing it should not, closes on Escape and selection, and is `inert` when closed; 44px controls; reduced motion respected. Not audited with axe or Lighthouse.

## Acceptance criteria and status

1. Visually follows the reference — structure, spacing and components match; content differs where data rules require (6 categories, not 15). Not yet compared against the saved reference file.
2. Follows `DESIGN.md` — yes.
3. Reuses the shared header and footer — yes.
4. Every category shown comes from data — yes.
5. Category images correctly mapped — yes, with fallback.
6. Search works — yes (8 checks).
7. Sidebar navigation works — yes.
8. Cards navigate correctly — yes; counts match destinations.
9. Counts not fabricated — yes.
10. Empty categories follow the availability rules — yes.
11. Mobile and tablet layouts work — yes (Chrome emulation).
12. No horizontal overflow — none at 45 widths for five page states.
13. All controls work — yes.
14. Lint, TypeScript and production build pass — yes.

## Pending decisions

- The homepage tiles and top navigation still list the four categories hidden here.
- Apparel & Fashion points at the catalog (`/products`); the nine sample textile listings remain on `/category/apparel-fashion`.
- Real B2B categories and products (and a hosted database) are needed before the page approaches the reference's breadth.
