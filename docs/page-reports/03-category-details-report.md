# Page 03 — Category Details: implementation report

Date: 2026-11-02. Route `/categories/[slug]` (legacy `/category/[slug]` redirects). Spec: `docs/page-designs/03-category-details.md`. Tracker ID 03: Design Reference Received · Prompt Complete · Development Complete · QA In Progress. Page 04 (Subcategory Details) shares the view and the test suite; see `04-subcategory-details-report.md`.

Per the standing instruction, the page already existed (on sample data and the old `FilterSidebar`/`ProductListingSection` components). It was modified to the new reference, not rebuilt from nothing; the working data flow, shared components and routes were kept or extended. What was replaced, and why, is listed below.

## Files created

| File | Purpose |
|---|---|
| `src/lib/catalog/listingQuery.ts` | Client-safe query type, option lists, `parseListingQuery`, `listingHref` (a Client Component may not import the server module) |
| `src/lib/catalog/categoryListing.ts` | Server-only listing service: faceted counts, filtering, sorting, pagination, `getSubcategoryInfo` |
| `src/components/category/CategoryListingPage/` | The shared page markup for Pages 03 and 04, JSON-LD, applied-filter chips, empty and no-match states |
| `src/components/category/CategoryDetailHero/` | Hero with breadcrumb, icon, title, computed stats, photo |
| `src/components/category/SubcategoryChips/` | Popular subcategories row with "More" |
| `src/components/category/CategoryFilters/` | Filter groups (+ `FilterCheckList` client island with in-group search) |
| `src/components/category/ListingToolbar/` | Sort (submits on change) and grid/list links |
| `src/components/category/BulkRequirementCta/` | Bulk requirement banner |
| `src/components/ui/WishlistButton/`, `SignInPrompt/` | Heart button backed by the server, sign-in prompt |
| `src/app/categories/[slug]/page.tsx`, `error.tsx` | The route and its error boundary |

## Files modified

`src/lib/catalog/categories.ts` (hrefs now `/categories/<id>`, `getCategoryRecord`, `resolveCategoryRoute`, slug aliases), `src/components/category/ProductCard/*` (whole-card link, heart, quote link), `src/components/ui/FilterDrawer/*` (breakpoint and footer options, `data-drawer-close`), `src/components/ui/Pagination/*` (array-valued params), `src/components/homepage/TrustBenefits/*` (`overlap` prop), `src/app/category/[slug]/page.tsx` (now a redirect), `src/app/products/[slug]/page.tsx` (breadcrumb uses the canonical category), `src/app/post-requirement/page.tsx` (reads category, subcategory, product from the link).

Superseded and unused, left in place for the owner to delete: `CategoryHero`, `SubcategoryGrid`, `ProductListingSection`, `FilterSidebar`, `ProductToolbar`, `utils/productFilters`, `categoryAliases.isKnownCategory`.

## Components reused

Header, utility bar, category navigation, footer (all through `layout.tsx`), `Container`, `Breadcrumb`, `Button`, `Select`, `EmptyState`, `FilterDrawer`, `Pagination`, `ResultSummary`, `TrustBenefits`, `ProductCard`, the homepage gold-arc photo pattern.

## Data sources

Apparel & Fashion: the CSV catalog (21,392 products, active sellers only). Five other categories: the sample B2B listings (flagged in `docs/MISSING_ASSETS.md`). Four categories have no products and show an honest empty state. Nothing was invented to imitate the reference: the reference's Brand filter, ratings on every card, "5,000+ products" and similar figures have no data behind them and are not shown.

## Functional behaviour (what was run)

`docs/page-reports/tools/03-04-category-subcategory-test.mjs` against a production build served from `.next-audit` with `next start`, Chrome via `puppeteer-core`, desktop and iPhone-13 touch emulation: **95 of 95 checks passed** (Pages 03 and 04 together). Page 03 coverage: hero product, supplier and subcategory counts compared with an independent parse of the seed CSVs; dynamic title and breadcrumb; the category photo; popular chips equal the real top subcategories, "More" reveals all, a chip navigates; subcategory, colour, price and location filters each compared with an independent count, combined filters, filters in the URL and the same result from a directly opened URL, active-filter count, applied-filter chips, Clear All; price ordering in both directions starting at the true cheapest and dearest product, sorting keeps filters, no Newest/Popularity option; "Showing 1–20 of N", 20 products per page, Next and last-page controls, page 2 differs; list and grid views, pagination keeps the view; "Get Best Quote" target and product link resolve; an empty category shows information and an empty state with no fake products and hides filters and toolbar; unknown slug returns a real 404 status; alias and legacy URLs redirect; a sample-backed category offers Supplier Type and MOQ but not Brand or Colour and its MOQ and supplier-type filters change the results correctly; title, description, single `h1`, BreadcrumbList and ItemList counts, noindex only on filtered views, unique metadata per category; the mobile filter drawer applies filters.

Related suites run on the same build and database: `02-all-categories-test.mjs` 54/54, `site-functional-regression-test.mjs` 38/38, `backend-pages-1-4-test.mjs` 54/54, `backend-pages-1-4-ui-test.mjs` 21/21 (the last two cover the heart, the quote form, the requirement form and whole-card clicks on these pages).

Static checks on the final code (run after the last code edit): `npx tsc --noEmit` clean, `npm run lint` ("No ESLint warnings or errors"), production build into `.next-audit` passes.

## Responsive results

`docs/responsive/tools/audit.mjs` (Chrome only) at 45 widths from 320 to 3440 including landscape-phone and zoom-equivalent widths, on `/categories/apparel-fashion`, `/categories/packaging-printing`, `/categories/home-lifestyle` and the other routes of the batch: no page overflow, no clipped text, no distorted images, no tiny text, no touch target under 32px (checkboxes and radios are measured through their label, stretched-link cards through the whole card; the CSS also sets 44px filter rows on touch screens, which the audit does not measure separately). Screenshots were taken during development; they are not stored in the repository. Firefox, Safari/WebKit and physical devices were not tested; browser zoom was emulated by viewport width, not by real zoom.

## Known issues and decisions needed

1. **Only 6 of 10 categories have products**, and the five non-apparel ones hold 1–8 sample listings, so most pages show one or a few products. Real B2B product data is needed for the page to look like the reference.
2. **No Brand filter, no rating filter, no verified-only filter, no Newest/Popularity sort**: the data has no such fields (see the spec). They appear only if a data source supplies them.
3. **"Verified suppliers" copy.** The hero stat says "Verified Suppliers" only for sample-backed categories (their records carry a flag; those are sample data), otherwise "Suppliers". The banner wording ("Get quotes from verified suppliers…") follows the reference and the homepage, but the catalog sellers have no verification, so this marketing claim is ahead of the data.
4. Apparel product photos are hot-linked from the research dataset host (`unoptimized`); replace with licensed images before launch.
5. The hidden categories (Home & Lifestyle, Food & Beverages, Agriculture, Chemicals & Dyes) still appear in homepage tiles and the top navigation and open the empty state.
6. Counts and indexes are built once per server process; a hosted database should replace this with a cached query and explicit invalidation.
7. Canonical URLs are emitted only when `NEXT_PUBLIC_SITE_URL` (or the Vercel production URL) is set; none is set today.
8. Old, unused components listed above should be deleted in a cleanup.
9. Not run: accessibility audit, Lighthouse, Firefox, Safari, the error boundary (never triggered), real browser zoom.
10. The reference image for this page is saved in `docs/design-references/`; the visual comparison was by eye, not pixel by pixel.

## Backend dependencies

Wishlist hearts, the quote form and the requirement banner use the backend described in `docs/backend/` (verified separately, not part of the 95 listing checks beyond the UI tests above). Missing for a full experience: a real product and supplier store with MOQ, brand and verification, and supplier-facing read endpoints for the inquiries these pages create.
