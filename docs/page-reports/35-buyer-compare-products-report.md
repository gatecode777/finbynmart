# Page 35 report — Buyer Compare Products

Date: 2026-11-05. Route `/buyer/compare-products` (the old `/buyer/compare` redirects with 308). Spec: `docs/page-designs/35-buyer-compare-products.md`. This PRD described a page that already existed (tracker ID 102), so it was **extended, not rebuilt**.

## What was found first

State, API, add / remove / clear and the Compare buttons existed. The catalogue holds no SKU, brand, supplier logo, availability, lead time, certification, warranty, supplier rating, bulk tier, offer or price history, and there is no per-category specification registry (each specification carries its own group). Audit: `docs/backend/PAGE_35_PRODUCT_COMPARISON_AUDIT.md`.

## What was built

`src/lib/compare/comparisonRules.ts` (new, pure: limits, row status, price and MOQ compatibility, lowest-value rule, specification planning), the extended `getProductComparison` (sections, statuses, compatibility, capabilities, product code, notices with levels, rows nobody states not drawn, attributes already shown as rows not repeated), the rebuilt comparison view (chips, Highlight differences, Show differences only, sticky criteria column and named keyboard-focusable scroll region, grouped sections, per-product actions with the shared wishlist Save), the route move and redirect, the PRD header, and a round Compare button on every product card (the card badge moved below it). No new collection; the existing `/api/buyer/compare` routes were extended, not duplicated.
Tests: `compare-products-test.mjs` 62/62, `35-comparison-rules-unit-test.mjs` 18/18, regression suites green (`PAGE_35_TEST_REPORT.md`).

## Feature status

| Feature | Status |
|---|---|
| State, add, remove, clear, limit of four (database-enforced), persistence | Implemented, tested (incl. a race) |
| Product summary (image, name, code, supplier, verification, category) | Implemented; SKU, brand, supplier logo **BLOCKED** |
| Price and MOQ comparison with currency and unit rules, neutral lowest-value tag | Implemented, tested; bulk tiers, offers, discounts, price history **BLOCKED** |
| Specifications, category-aware (shared by group, single-product ones apart) | Implemented from each attribute's own group; no registry exists |
| Availability, lead time, certifications, warranty, supplier ratings | **BLOCKED**: no data (listed as not available, never guessed) |
| Difference highlighting and differences-only | Implemented, tested |
| Add to Inquiry (that supplier's form), Save Product (shared), View Product, Add More Products | Implemented, tested |
| Separate `/api/buyer/compare-products`, `/validate`, `/bulk` routes | Not created (the state API was extended instead) |

## Performance (final run, remote cluster, indicative)

Four-product comparison p50 72 ms, p95 133 ms (target 350), about 5.7 KB; key list p95 101 ms (target 300). Details: `PAGE_35_PERFORMANCE_REPORT.md`.

## Honest summary

Everything the data can support is built, but the comparison of a real catalogue product is sparse by nature: many rows show only a few values, and some of the reference image's rows cannot exist yet. Design and QA are not marked complete: no Firefox, Safari, device, zoom, landscape, screen-reader or Lighthouse runs. I looked at the screenshots (1440 and 390) and fixed two problems seen there (repeated attributes, over-alarming notices).

Not committed. Cleanup done: throwaway database dropped, test server on port 3100 stopped, `tsconfig.json` reverted.
