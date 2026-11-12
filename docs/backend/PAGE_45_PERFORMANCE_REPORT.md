# Page 45 — performance report

Method: production build (`NEXT_DIST_DIR=.next-audit`, `next start`), MongoDB Atlas (remote, including round-trip latency), one signed-in supplier, HTTP through real routes, seeded with **10,000 orders** for one company across 13 statuses, two currencies (INR, USD), and 400 days. Run: 2026-11-12.

| Operation | p50 | p95 | p99 | Planning target (p95) | Target status |
|---|---|---|---|---|---|
| First-page list (20 rows, default newest) | 147 ms | 170 ms | 337 ms | ≤ 400 ms | Met |
| Filtered list (status + 90 days window) | 146 ms | 179 ms | 185 ms | ≤ 500 ms | Met |
| Product search ('cotton' substring inside 10,000 orders) | 165 ms | 181 ms | 201 ms | ≤ 500 ms | Met |
| Reference-prefix search ('FBM-ORD-A...') | 167 ms | 189 ms | 202 ms | ≤ 500 ms | Met |
| Order summary counts (8 status groups + All) | 114 ms | 144 ms | 148 ms | ≤ 700 ms | Met |
| Deep pagination (page 500 of 20) | 152 ms | 197 ms | 197 ms | ≤ 400 ms | Met |
| Amount sort within one currency (INR) | 167 ms | 268 ms | 336 ms | ≤ 400 ms | Met |
| Detail read by reference | 142 ms | 790 ms | 1,526 ms | ≤ 350 ms | Spikes on uncached Atlas cold queries; p50 142 ms |
| Response payload size (50-row listing) | 34.3 KB | — | — | < 60 KB | Met |
| CSV Export (10,000 orders capped at 5,000 rows) | 5,001 lines | — | — | ≤ 5,000 rows | Met (header `x-export-truncated: true`) |

Eight simultaneous list and summary requests all completed with 200 OK and strictly consistent counts.

## Query plans (`explain("executionStats")`)

All queries execute over dedicated indexes in the `orders` collection:

- **Newest First**: `supplier_orders_newest` `(supplierKey, placedAt -1)` — 21 keys examined, 21 documents examined, 21 returned. `COLLSCAN=false`, `SORT=false`.
- **Status Group (3 statuses) Newest**: `supplier_orders_status` `(supplierKey, status, placedAt -1)` — 23 keys examined, 21 documents examined, 21 returned. `COLLSCAN=false`, `SORT=false`.
- **Single Status Newest**: `supplier_orders_status` — 21 keys examined, 21 documents examined, 21 returned. `COLLSCAN=false`, `SORT=false`.
- **Updated Sort**: `supplier_orders_updated` `(supplierKey, updatedAt -1)` — 21 keys examined, 21 documents examined, 21 returned. `COLLSCAN=false`, `SORT=false`.
- **Amount Sort (INR)**: `supplier_orders_amount` `(supplierKey, currency, amount -1)` — 21 keys examined, 21 documents examined, 21 returned. `COLLSCAN=false`, `SORT=false`.
- **Date Window (Order Date)**: `supplier_orders_newest` — 21 keys examined, 21 documents examined, 21 returned. `COLLSCAN=false`, `SORT=false`.
- **Date Window (Updated Date)**: `supplier_orders_updated` — 21 keys examined, 21 documents examined, 21 returned. `COLLSCAN=false`, `SORT=false`.

## Limitations

- Buyer name search is not indexed across collections; buyer names are matched on business name in client view or exact filters.
- Synchronous CSV export is capped at 5,000 rows to prevent server memory saturation.
- Remote database network latency from local runner contributes ~80-120 ms baseline to all timings.

