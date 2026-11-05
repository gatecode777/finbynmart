# Page 31 — Performance report

Method: production build (`.next-audit`, port 3100), `FINBYN_PUBLIC_CACHE_MS=0`, MongoDB Atlas (remote cluster), throwaway database `finbynmart_test`, group P of `31-buyer-orders-test.mjs`. The perf buyer holds 1,000 and then 10,000 orders (10 statuses, 2 currencies, 3 suppliers, a quarter with an expected date). For each measure: one untimed warm-up call, then 15 sequential timed requests from the same machine, one run. With 15 samples p95 and p99 are effectively the slowest request. The owner's `next dev` and other processes were running, so these are indicative, not a benchmark.

| Measure (p95 target) | 1,000 orders p50 / p95 | 10,000 orders p50 / p95 |
|---|---|---|
| List, 20 rows (< 400 ms) | 75 / 93 ms | 83 / 118 ms |
| Tab (In Transit) (< 500) | 68 / 83 | 82 / 104 |
| Search "Perf Cotton" (< 500) | 69 / 84 | 104 / 111 |
| Last page (< 500) | 81 / 92 | 83 / 85 |
| Highest amount, INR (< 500) | 70 / 82 | 90 / 101 |
| Expected delivery soon (< 500) | 77 / 89 | 81 / 89 |
| Summary (< 300) | 67 / 76 | 86 / 94 |
| Detail (< 350) | 70 / 83 | 69 / 87 |

All targets met in the final run. A 20-row list page is 14.5 KB (limit used in the test: 25 KB) and ten simultaneous list requests all succeeded. Export of the capped 5,000 of 10,000 orders: p50 749 ms, p95 852 ms (no target defined; the file is generated in the one response).

**What did not look good before the warm-up was added.** In two earlier full runs without the warm-up call, the first request after the bulk load was slow: summary p95 359 ms at 1,000 orders (one spike, p50 79 ms) and list p95 302 ms at 10,000 (one spike, p50 91 ms, still under target). Those are cold-cache first calls, not steady-state; a user's very first request after a long idle period could see this.

**Indexes and query plans** (`explain`, check P-03): newest, status tab, recently updated, amount (with a currency) and expected-delivery listings each use their index (`buyer_orders_newest`, `buyer_orders_status`, `buyer_orders_updated`, `buyer_orders_amount`, `buyer_orders_expected`) with no collection scan and no blocking sort, and examine at most about one page of documents at 10,000 orders. The status-count aggregation reads the buyer's orders through the buyer index (P-04); it reads every order of that buyer, so at much larger volumes it should be revisited (for example with maintained counters).

**Not measured:** 100 orders, volumes above 10,000, the search `$regex` (a contains-match on item and supplier names: bounded to the buyer's rows but not index-assisted), concurrency beyond ten parallel requests, Lighthouse, LCP/INP/CLS, a deployed host, and a before/after comparison (new module, so there is no "before").
