# Page 04 — Subcategory Details: implementation report

Date: 2026-11-02. Route `/categories/[slug]/[subcategory]`. Spec: `docs/page-designs/04-subcategory-details.md`. Tracker ID 97 (new, see the crosswalk in `docs/PAGE_TRACKER.md`): Design Reference Received · Prompt Complete · Development Complete · QA In Progress. Most of the work is shared with Page 03; read `03-category-details-report.md` for the shared files, reused components, data sources and static checks.

The page did not exist before (the old `/category/[slug]` only had a category level), so this is new code, but it contains no markup of its own: it reuses `CategoryListingPage` (standing instruction 3) and only supplies data and wording.

## Files created

`src/app/categories/[slug]/[subcategory]/page.tsx` (route, metadata, validation, wording). Everything else it renders is shared with Page 03. `getSubcategoryInfo()` was added to `src/lib/catalog/categoryListing.ts`, and `getCategoryListing` gained the `{ sub }` option.

## Files modified

`src/lib/catalog/categories.ts` leaf-category card hrefs now go to `/categories/apparel-fashion/<slug>` (Page 02 cards); `docs/PAGE_TRACKER.md`.

## Behaviour verified

The same suite as Page 03, `docs/page-reports/tools/03-04-category-subcategory-test.mjs`: **95 of 95 passed** for both pages. Page 04 coverage: title is the subcategory; breadcrumb Home › All Categories › Apparel & Fashion › Men Tshirts with correct links; product and supplier counts equal the seed for that subcategory; the heading count equals the total; filters adapt to the data (Colour, Price, Location, with no Category group and no Brand, MOQ or Type for the catalog); the related row starts with "All {Category}", highlights the current subcategory and lists the real siblings of the same department with "More" showing all, and nothing from another department; colour, location, price filters and the low→high sort each compared with the seed inside the subcategory; an out-of-range page redirects to the last page; the subcategory totals partition the category (no product in two subcategories); the bulk banner text is dynamic and carries category and subcategory; a parent alias redirects and keeps the subcategory; unique title, four-level BreadcrumbList and one `h1`; a sample-backed subcategory renders through the generic template with its own attributes and a local photo.

Invalid combinations return a real 404: unknown parent, unknown subcategory, a subcategory under the wrong parent. The 404 checks run in the same suite.

Related suites on the same build and throwaway database: 54/54 (Page 02), 38/38 (site regression), 54/54 and 21/21 (backend), all passing.

## Responsive results

`audit.mjs` on `/categories/apparel-fashion/men-tshirts` and `/categories/packaging-printing/corrugated-boxes` at 45 widths in Chrome: no overflow, no clipped text, no distorted images, no tiny text, no small touch targets. Same limits as Page 03: Firefox, Safari, real devices and real browser zoom were not tested; screenshots are not stored in the repository.

## Known issues and decisions needed

1. **Numbering.** The PRD calls this Page 04, but the approved tracker's ID 04 is Products. It was added as ID 97 instead of renumbering the baseline. Decide whether to adopt the PRD numbering everywhere.
2. **Reference image now saved** as `docs/design-references/04-subcategory-details-reference.jpg` (recovered from the session transcript after the page was built). The page was built from the PRD text and the Page 03 reference; it has not been compared against the saved image beyond a visual check.
3. Sample-backed subcategories have only a handful of products (often one). A page with a single product is correct but looks sparse; it needs real B2B data.
4. The same "verified suppliers" wording issue, the hot-linked apparel photos, the missing Brand filter, and the not-run accessibility, Lighthouse, Firefox and Safari checks listed in the Page 03 report apply here too.
5. A subcategory with no eligible products is not discoverable and 404s (documented behaviour); if a link points to one it will show the 404 page.
