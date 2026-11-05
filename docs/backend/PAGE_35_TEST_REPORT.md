# Page 35 — Test report

Run 2026-11-05 on a production build (`.next-audit`, `next start` on port 3100), throwaway database `finbynmart_test` (dropped afterwards).

## Results

| Suite | Result |
|---|---|
| `compare-products-test.mjs` (API + browser + performance) | **62 / 62** (A access 6, B state and limit 9, C isolation 3, D comparison data 20, E remove and clear 4, G pages 16, R responsive 2, P performance 2) |
| `35-comparison-rules-unit-test.mjs` (row status, lowest price and MOQ compatibility, specification planning, limits) | 18 / 18 |
| Regression on the same build (performance groups skipped): Page 05 all products 117, Page 06 product details 69, Page 08 suppliers 90, Page 09 supplier profile 46, Page 22 dashboard 96, Saved Products 40, Saved Suppliers 66, backend pages 1–4 63 and their UI suite 21 | all passed |
| `npx tsc --noEmit`, `npm run lint`, production build | clean |

In one regression batch Page 09 (Chrome "Target closed") and Page 22 (an API answer missing) failed once; both passed 46/46 and 96/96 when rerun on their own, so they were environment flakes, not app failures.

## Coverage

Access (anonymous, supplier, forged, page redirect), the old route's 308 redirect; add, duplicate, unknown product, sample product, the limit of four, the race (six at once keep four), `userId` in the body ignored, rate limit; isolation; comparison data (order, fields, differs flags, nothing ranked, no private fields, unavailable product, specification de-duplication, notice levels, compatibility and capabilities, the lowest-price rule against the catalogue prices, units and categories that differ, empty rows not drawn, agreement with the catalogue, codes without invented brand or SKU); remove and clear; the page in a real browser (heading with the count, chips, header actions, sticky criteria column, keyboard-focusable named scroll region, the at-the-limit state, Highlight differences and Show differences only, per-column Add to Inquiry / View / Save / Remove, Save through the shared wishlist with no inquiry created, the neutral lowest-price tag, remove and clear dialogs, empty state, the product button on the Product Explorer cards, sign-in redirect, saved-product cards); 16 widths (320 to 2560) for horizontal overflow, clipped headings and console errors; phone cards against desktop table; 4 products performance.

## Not tested (do not assume)

Firefox, Safari, real devices, landscape, browser zoom 80–200%, screen readers, automated contrast and axe checks, Lighthouse, add / remove / clear latency, the comparison with the reference image beyond screenshots (1440 and 390, which I looked at), mixed currencies (only INR exists), products with large specification objects. SKU, brand, supplier logo, availability, lead time, certifications, warranty, supplier ratings, bulk tiers and offers: BLOCKED, no data.

## Defects found while testing and reviewing (fixed)

1. Some catalogue products list "Category", "Subcategory" and "Minimum order" among their specifications: they repeated rows already shown, and a "Specific to one product" section held only those repeats. They are now filtered out (D-19).
2. Informational notes (estimated prices, different categories) were drawn in the same red as real warnings. Notices now carry a level (D-20).
3. The Rating row was labelled "Supplier Rating" although it holds the product's rating (sample listings only): renamed "Rating".
4. Test-only: a DOM element returned across the browser boundary; renamed buttons and headings.
