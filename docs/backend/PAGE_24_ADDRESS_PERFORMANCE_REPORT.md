# Page 24 — Address performance report

Conditions: production build (`.next-audit`), `next start` on port 3100, throwaway database `finbynmart_test` on MongoDB Atlas over the internet, nothing else running, `FINBYN_PUBLIC_CACHE_MS=0`, one client making sequential requests (30 per read measurement, 10–15 per write measurement), one buyer. Source: `docs/page-reports/tools/24-buyer-addresses-test.mjs` (section K). There is no earlier address API, so there is no before/after comparison and no improvement is claimed.

## Reads (p95, ms; p50 and p99 in the suite output)
| Addresses held | List | Read one | Filtered search | List payload |
|---|---|---|---|---|
| 5 | 81 | 93 | 81 | 2.8 KB |
| 20 | 130 | 85 | 111 | 10.6 KB |
| 50 (the cap) | 110 | 101 | 81 | 26.1 KB |

## Writes (ms)
| Operation | p50 | p95 |
|---|---|---|
| Create | 105 | 119 |
| Update (versioned) | 187 | 240 |
| Set default (transaction) | 275 | 337 |

All are inside the CLAUDE.md targets (simple read < 300, detail < 350, filtered < 500, write < 500). Numbers vary between runs (an earlier run measured set-default p95 418 ms, list p95 up to 137 ms) because the database is remote; treat them as ranges. Set default is the slowest because it is a three-step transaction.

## Query plans (`docs/page-reports/tools/24-address-explain.mjs`, 10,000 rows for 200 buyers)
List, purpose-filtered list and text search: LIMIT > FETCH > IXSCAN on `{buyerId, createdAt}`, 50 keys and 50 documents examined for the buyer, no SORT stage, no COLLSCAN. Read one: IXSCAN, 1 key. Statistics: GROUP over COUNT_SCAN. The "defaults first" ordering is applied in code on the buyer's at most 50 rows so the database never sorts (an earlier version sorted on the default flags and would have needed an in-memory sort; changed after the explain check).

## Not measured
Concurrent buyers (one client only), cold-start latency, large histories (the 50-address cap bounds a buyer). Search uses a literal case-insensitive regex over at most the buyer's 50 rows, so it never scans other buyers.
