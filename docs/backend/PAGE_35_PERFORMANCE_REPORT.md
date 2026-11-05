# Page 35 — Performance report

Method: production build (`.next-audit`, port 3100), `FINBYN_PUBLIC_CACHE_MS=0`, MongoDB Atlas (remote cluster), throwaway database `finbynmart_test`, group P of `compare-products-test.mjs`. The perf buyer compares **four** catalogue products. For each measure: one untimed warm-up call, then 15 sequential timed requests, from the same machine, one run (with 15 samples p95 and p99 are effectively the slowest request). Other processes (the owner's `next dev`) were running: indicative, not a benchmark.

| Measure | Target (p95) | p50 / p95 |
|---|---|---|
| Load the comparison (four products, `?view=details`) | < 350 ms | 72 / 133 ms |
| Compared keys (`GET /api/buyer/compare`) | < 300 ms | p95 101 ms |

Response size of the four-product comparison: about 5.7 KB (limit used in the test: 25 KB). The buyer's list is read through `buyer_compare_order` (userId, addedAt, _id): an index scan with no collection scan and no blocking sort (P-02).

How the cost stays small: at most four product records per request, all resolved from the in-memory read-only catalogue (no per-request database query for products or suppliers, no N+1), and one database read of at most four rows for the buyer's list. The extra work added by this page (row status, price and MOQ compatibility, specification planning) is pure in-memory work over four products. No new engine was introduced for a maximum of four products.

**Not measured:** add, remove and clear latency (the code paths are unchanged apart from the slot constraint; the race test covers their correctness, not their speed), products with very large specification objects (catalogue specifications are small), concurrency beyond the single-buyer series, Lighthouse, LCP/INP/CLS, a deployed host, and a before/after comparison of the earlier page. Compatibility validation has no separate endpoint (it is part of the load), so it has no separate figure.
