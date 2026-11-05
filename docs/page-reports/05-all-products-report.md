# Page 05 — All Products: implementation report (frontend)

Date: 2026-11-02. Route `/products`. Spec: `docs/page-designs/05-all-products.md`. Backend report: `05-all-products-backend-report.md`. Tracker ID 04 (PRD number 05).

## Files created

| File | Purpose |
|---|---|
| `src/components/ui/PageHero/` | Shared two-column hero (eyebrow, heading with a gold accent word, stats, photo with gold arc) |
| `src/components/ui/SearchPanel/` | Shared floating search card: debounced instant search, Enter, clear, pending state, plain GET fallback |
| `src/app/products/error.tsx` | Error boundary |
| `docs/page-reports/tools/05-all-products-test.mjs`, `05-all-products-perf.mjs`, `clear-test-rate-limits.mjs` | Scripts |

## Files modified

`src/app/products/page.tsx` (rewritten onto the shared view; legacy `?category=<name>` links mapped to subcategories); `src/components/category/CategoryListingPage/*` (hero/search/heading/filter-variant slots, new filter fields in chips, sort form and pagination, unrecognised-filter notice, supplier name chip, "Clear search"); `src/components/category/CategoryFilters/*` (Category, Subcategory and City groups, global variant, `next/form`, 44px option rows on touch screens, short price placeholders); `src/components/category/ListingToolbar/*`, `src/components/ui/FilterBar/*` (`next/form`); `src/components/ui/FilterDrawer/*` (closes on form submit); `src/components/ui/PageBody/*` (see below); `src/app/products/[slug]/page.tsx` (breadcrumb links to the Page 04 URL); `src/app/categories/[slug]/page.tsx` (record is optional in the shared type). Backend files are listed in the backend report.

## Fixes made along the way (outside the page, found while testing)

1. **Misaligned pages.** `PageBody` rendered its own `Container` while every page already wrapped it in one, so the breadcrumb sat at 58px and the content at 116px on Suppliers, Industries, Search, Sitemap, Post Requirement, account and placeholder pages. `PageBody` is now a plain column. Checked on the running site at five widths for 20 routes (including the 404 page): breadcrumb and heading share one left edge on all of them (the two product-detail pages differ only because their `h1` sits in the second column of a two-column layout).
2. **Full page reload on Apply.** The filter bars were plain GET forms; every Apply reloaded the document. They now use `next/form`, so Apply, Clear All and sort navigate on the client (header and footer stay, a counter set on `window` survives). Without JavaScript they still work as GET forms. Each form is keyed by the current URL so the fields follow the server state after a navigation. The mobile drawer used to close only because the page reloaded; it now closes itself on submit and on Clear All.

## Components reused

See the spec. Nothing global was duplicated.

## Data sources

Apparel catalog (21,392 products, 1,062 active sellers) and the 12 sample B2B listings of the other five categories (flagged sample data). Total shown: 21,404, equal to the Page 02 total. No data was invented.

## What was run

Against a production build served from `.next-audit` with a throwaway database, Chrome via `puppeteer-core` (desktop 1440×900 and iPhone 13 emulation):

| Suite | Result |
|---|---|
| `05-all-products-test.mjs` (76 page checks + 41 API checks) | **117 / 117** |
| `02-all-categories-test.mjs` | 54 / 54 |
| `03-04-category-subcategory-test.mjs` | 95 / 95 |
| `site-functional-regression-test.mjs` | 38 / 38 |
| `backend-pages-1-4-ui-test.mjs` | 21 / 21 |
| `backend-pages-1-4-test.mjs` | 54 / 54 |

Page checks cover: heading, hero stats and h1; page size, summary, pagination, last page, out-of-range and bad page numbers, `limit`; search against an independent text match, token joining, case and spaces, the short-word rule, sample-listing search and ranking, empty results, unsafe strings, 100-character cap, instant search without a reload, Enter, clear; every filter compared with the seed (category, subcategory, price, state, city, colour, department, legacy link, supplier), per-unit MOQ, supplier type, combined filters, unknown ids, facet-count rules, group list; Apply Filters, Clear All and Apply Range without a reload, filter badge, chips; sort, view, pagination keeping everything; image formats, links, quote link, card click, wishlist signed-out and signed-in; requirement banner and prefill; SEO flags, JSON-LD; phone overflow, drawer.

Static checks on the final code: `npx tsc --noEmit` and `npm run lint` were clean after the last code edit; the production build into `.next-audit` passed (run just before the final test run).

## Responsive results

`audit.mjs` (Chrome only) at 45 widths from 320 to 3440 on `/products`, `?q=tshirt`, `?category=packaging-printing`, `?q=zzzqqq` (no results), `?view=list&sort=price-asc&category=apparel-fashion`, `?category=nope` (notice), `/suppliers` and `/search?q=shirt`: no overflow, no clipped text, no distorted images, no small touch targets, no tiny text. I looked at screenshots at 1536 and 390 wide (the page matches the reference structure; the phone layout stacks cleanly). Screenshots are not stored in the repository. Not tested: Firefox, Safari, real devices, landscape beyond the audit's landscape-phone widths, real browser zoom.

## Known issues and decisions needed

1. **Default order puts the 12 sample B2B listings first** (category directory order: machinery, electrical, … then apparel), so page 1 looks like the reference. They are sample data with "Verified" badges and ratings that exist only in sample records. If you prefer real catalog products first, the order is one line in the engine.
2. **No Brand, Availability, Newest or Popularity** (no data). They need real product fields.
3. **Hero stat "Suppliers: 1,074"** counts 1,062 catalog sellers plus 12 sample suppliers; both are fictional.
4. **Numbering:** the PRD calls this Page 05, the tracker's ID is 04.
5. The hero photo is the existing warehouse image, not the cartons-on-pallet picture of the reference.
6. Accessibility audit and Lighthouse not run; error boundary not triggered in testing; no `loading.tsx` by design (see the spec).
7. Apparel photos are hot-linked from the dataset host (`unoptimized`); replace with licensed images before launch.
8. Applying a filter produces URLs with empty parameters (`?moq=&minPrice=&maxPrice=`) because `next/form` submits every field; they are parsed as "no filter" and are noindex only when a real filter is present.
9. `CategoriesHero` should be migrated to `PageHero`; `CategoryExplorer`'s search card duplicates `SearchPanel` styling.

## Pending backend dependencies

Real product records with brand, MOQ, availability and dates; an approved verification workflow; a product attribute configuration for per-category filters. See the backend audit.
