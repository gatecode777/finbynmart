# API reference — `GET /api/public/products`

Implemented 2026-11-02 (`src/app/api/public/products/route.ts`). Public, read-only, no authentication. It reads the same engine as the `/products` page, so the page and the API always agree. Verified by `docs/page-reports/tools/05-all-products-test.mjs` (checks A1–A25).

Response convention: success `{ "ok": true, "data": {...}, "meta": {...} }`; failure `{ "ok": false, "code": "...", "message": "...", "fields": { "<param>": "<reason>" } }`. This keeps the project's `ok` flag instead of the PRD's `success` flag so the whole API stays consistent (the write endpoints answer `{ ok, message, fields }`); a switch is a decision for the owner. Codes: `VALIDATION_ERROR` (400), `RATE_LIMITED` (429, with `Retry-After`), `INTERNAL_ERROR` (503). Internal errors are logged on the server and never returned.

## Query parameters

Repeat a parameter for several values (`category=a&category=b`). Names not listed are ignored. Values are plain strings: there is no way to send an operator or an object.

| Parameter | Meaning | Validation |
|---|---|---|
| `q` | Search text | ≤ 100 characters after trimming; control characters removed |
| `page` | Page number | whole number 1–1,000,000; a page past the end returns the last page |
| `limit` | Page size | whole number 1–50; default 10 |
| `category` | Main category id (e.g. `packaging-printing`) | ≤ 80 characters, ≤ 60 values; unknown ids are ignored and reported in `ignoredFilters` |
| `subcategory` (alias `sub`) | Subcategory id | same |
| `department` | Catalog department (Men, Women, …) | same; catalog products only |
| `supplierType` (alias `type`) | Supplier type | products without a type never match |
| `state`, `city` | Supplier location | exact value |
| `colour` | Product colour | exact value |
| `seller` | Supplier slug | `[a-z0-9-]`, ≤ 80 |
| `minPrice`, `maxPrice` | Price range in INR | non-negative numbers; `minPrice` ≤ `maxPrice`; overlapping ranges match |
| `currency` | Only `INR` | anything else is rejected |
| `moqUnit`, `minMOQ`, `maxMOQ` | Unit-aware MOQ range | letters-only unit (aliases such as "pieces" and "piece" are one unit); `minMOQ`/`maxMOQ` require `moqUnit`; products without MOQ never match; different units are never compared |
| `sort` | `relevance` (default), `price-asc`, `price-desc` | anything else is rejected, including `newest` and `popularity` (the data has no dates or popularity) |

Rejected with an explanation because the data cannot support them: `brand`, `availability`, `attributes`, `country`.

## Success response

```json
{
  "ok": true,
  "data": {
    "products": [ { "id": "1163", "slug": "nike-sahara-…-1163", "name": "…", "url": "/products/…",
      "image": { "src": "https://assets.myntassets.com/…", "remote": true },
      "price": { "min": 1269, "currency": "INR", "unit": "Piece", "estimated": true },
      "moq": { "quantity": 500, "unit": "piece" },
      "category": { "id": "apparel-fashion", "name": "Apparel & Fashion" },
      "subcategory": { "id": "men-tshirts", "name": "Men Tshirts" },
      "department": "Men", "colour": "Blue",
      "supplier": { "id": "SLR0873", "name": "…", "slug": "…", "url": "/suppliers/…", "city": "…", "state": "…",
        "type": "Manufacturer", "verificationStatus": "unverified" },
      "rating": { "value": 4.8, "count": 120 },
      "source": "catalog" } ],
    "facets": { "categories": [], "subcategories": [], "supplierTypes": [], "moq": [], "states": [], "cities": [], "colours": [],
      "price": { "currency": "INR", "min": 12, "max": 75000 } },
    "appliedFilters": { "q": null, "category": [], "subcategory": [], "department": [], "supplierType": [], "state": [], "city": [],
      "colour": [], "seller": null, "moqUnit": null, "minMOQ": null, "maxMOQ": null, "moq": null, "minPrice": null, "maxPrice": null, "sort": "relevance" },
    "ignoredFilters": []
  },
  "meta": { "currentPage": 1, "pageSize": 10, "totalItems": 21404, "totalPages": 2141, "hasNextPage": true, "hasPreviousPage": false }
}
```

`moq`, `rating`, `department`, `colour` and `supplier.type` appear only when the record has them. `source` is `catalog` for the product catalog and `sample` for the sample B2B listings (placeholder content flagged in `docs/MISSING_ASSETS.md`; a consumer should not treat their ratings or "verified" flag as real). `supplier.verificationStatus` is `verified` only where a record says so; there is no verification workflow, so catalog suppliers are always `unverified`. Facet entries are `{ value, label, count }`; counts are computed with the search and every other filter applied but not the group's own filter.

## Never returned

Seller email, phone, owner name, pincode, internal keys, database ids, private fields (test A2 scans the whole response for them).

## Limits and caching

120 requests per minute per client address (MongoDB-backed counter, fails open). Responses carry `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`. Measured latency is in `PAGE_05_TEST_REPORT.md`.

## Not implemented (and why)

`GET /api/public/products/facets` (facets are in the list response), `/featured` (no featured flag in the data), `/[slug]` (Page 06).

## Existing endpoints this page relies on

`GET/POST /api/buyer/wishlist`, `DELETE /api/buyer/wishlist/[productId]`, `POST /api/inquiries`, `POST /api/requirements`: see `API_REFERENCE.md`. The PRD names `POST /api/public/inquiries` and `/api/public/requirements`; the existing authenticated routes are the approved workflow and no duplicates were created.
