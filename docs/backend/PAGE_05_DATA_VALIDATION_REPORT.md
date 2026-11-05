# Page 05 data validation report

2026-11-02. Computed directly from `db/seed/*.csv` with an independent script (`parseCsv` in the test file), not from application code. Results are of the data as it is today; this is research and sample data, not business facts.

## Catalog

| Check | Result |
|---|---|
| Sellers / active / inactive | 1,200 / 1,062 / 138 |
| Active sellers with at least one product | 1,062 (all of them) |
| Inactive sellers with products | **0**: the inactive-seller exclusion rule exists in the loader but no data exercises it |
| Product rows / eligible (known category and active seller) | 21,392 / 21,392 (**0 excluded**), so "invalid product reference" handling is also not exercised by data |
| Categories / departments | 118 / 5 |
| Price (estimated, INR) | all present and positive, 139 to 12,539 |
| Colour | present on every product, 42 distinct |
| Image URLs | 21,392 present; all `http://` on one host (`assets.myntassets.com`); the loader upgrades them to https; all pass the allow-list |
| Distinct states / cities (active sellers) | 13 / 18 |
| Products sharing a name with another product | 6,010 (distinct ids; slugs end in the id so URLs are unique) |
| Brand, model, SKU, availability, MOQ, supplier type, rating (product), created date | **absent** from every catalog product |

## Sample B2B listings (12 in the five non-apparel categories)

Placeholder content flagged in `docs/MISSING_ASSETS.md`. They carry supplier type, MOQ with a unit, rating, a verified flag, price or price range and location. MOQ units are mixed (pieces, rolls, boxes, kg, meters, sets), which is why MOQ filtering is per unit. Their verified flags and ratings are sample values and are surfaced as such (`source: "sample"` in the API).

## What the page total is

21,392 catalog + 12 sample = **21,404** products, equal to the Page 02 total and to the sum of the six category pages. Test 5-01 checks it against the seed.

## Validation of requests

Covered by the API tests (A4–A13, A20): page, limit, sort, price, MOQ, unit, currency, search length, unsupported parameters, unknown ids, operator-like input; the page parser is lenient and falls back to defaults (tests 5-09, 5-28, 5-56).

## Not verifiable with this data

Unpublished, draft, rejected, suspended and deleted products (no such state exists); inactive-seller products (none exist); verification statuses (no workflow); product ratings and reviews (none); ImageKit URLs (ImageKit is not in the project); a MongoDB product collection (none).
