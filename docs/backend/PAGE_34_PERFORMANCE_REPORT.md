# Page 34 — Performance report

Method: production build (`.next-audit`, port 3100), `FINBYN_PUBLIC_CACHE_MS=0`, MongoDB Atlas (remote cluster), throwaway database `finbynmart_test`, group P of `saved-suppliers-test.mjs`. The perf buyer holds **500 saved suppliers** (the maximum), all real active catalogue sellers. For each measure: one untimed warm-up call, then 15 sequential timed requests (8 bulk removals), from the same machine, one run. With 15 samples p95 and p99 are effectively the slowest request. The owner's `next dev` and other processes were running: indicative, not a benchmark.

| Measure | Target (p95) | p50 / p95 |
|---|---|---|
| Saved supplier listing, 12 per page | < 350 ms | 123 / 198 ms |
| Summary + filter choices | < 300 ms | 110 / 153 ms |
| Search + Most Products sort, page 2 | < 400 ms | p95 113 ms |
| Category + not-verified filter + name sort | < 400 ms | p95 124 ms |
| Bulk removal of 20 | < 500 ms | 139 / 153 ms |

All targets met in the final run. A 12-supplier page is 8.3 KB (test limit 25 KB); ten simultaneous list requests all succeeded. The stored-relationship read (`buyer_saved_suppliers_newest`) is an index scan with no collection scan and no blocking sort (P-03).

How the cost is bounded: the database read is at most 500 rows by index; supplier facts come from the read-only catalogue seed and are memoised per supplier (never per buyer), so the cost per request is proportional to the saved count, not to the 21,392-product catalogue, and no supplier's products are loaded per request. Search, filters, sorting and the counts run in the application over those rows (the supplier facts are not in MongoDB), which is why they all cost about the same as a plain listing. The first request after a server start pays for the memo; the warm-up call excludes that, and no cold-start figure was measured.

Not measured: 20, 100 and 1,000 saved suppliers (the cap is 500), single save and remove latency (unchanged shared routes, covered by earlier suites), concurrency beyond ten parallel requests, Lighthouse, LCP/INP/CLS, a deployed host, and a before/after comparison of the earlier page.
