# Page 34 — Supplier comparison

Built, because supported criteria exist. A separate route was needed: Compare Products (`/buyer/compare`) has a product data contract and is not reused.

- **Page** `/buyer/compare-suppliers?ids=a,b,c` and **API** `POST /api/buyer/saved-suppliers/compare {supplierIds}`: two to four different suppliers that are **the buyer's own saved ones and still listed**; anything else (not saved, unavailable, another buyer's) is one identical 404. The selection is stateless (the address), changes nothing, and is bounded.
- **Rows:** business type, verification, main categories, product categories (count), public products, business location, member since. Each only where the record holds it; otherwise null, shown as "Not Provided". The rows that differ carry the word "Differs".
- **Not included, because the data does not exist:** ratings, MOQ ranges, manufacturing or export capability, response statistics.
- **No verdict:** no score, rank, "best supplier" or recommendation; a verified and an unverified supplier are shown as they are. Table from 900 px, one card per supplier below; each has Contact Supplier (the inquiry form).

Tests: F-01 to F-06, B-05, B-06, H-08, H-10, H-17.
