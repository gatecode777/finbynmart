# Page 44 — performance report

Method: production build (`NEXT_DIST_DIR=.next-audit`, `next start`), MongoDB Atlas (remote, so every request includes round-trip latency), one signed-in supplier, HTTP through the real routes, sequential requests after warm-up on a 45-version quotation lineage (`FBM-QT-S44MANY1`), rate-limit counters cleared before each run. Run: 2026-11-12.

| Operation | p50 | p95 | p99 | Planning target (p95) | Target status |
|---|---|---|---|---|---|
| Detail by reference (current offer, pointers) | 141 ms | 160 ms | 186 ms | ≤ 500 ms | Met |
| Version history page (20 summaries, cursor) | 117 ms | 141 ms | 145 ms | ≤ 500 ms | Met |
| Compare versions (version 1 vs 45) | 105 ms | 138 ms | 147 ms | ≤ 700 ms | Met |
| Activity feed (events + revisions merged) | 113 ms | 122 ms | 146 ms | ≤ 500 ms | Met |
| Server-rendered page (`?version=7`) | 195 ms | 212 ms | 212 ms | ≤ 500 ms | Met |
| Create revision (new draft lineage, copy) | 396 ms | 480 ms | 480 ms | ≤ 1,000 ms | Met |
| Withdraw quotation (atomic state + notice outbox) | 433 ms | 471 ms | 471 ms | ≤ 1,000 ms | Met |
| Response payload size (version 7 detail) | 11.4 KB | — | — | < 40 KB | Met |

All operations comfortably beat their planning targets. Five concurrent requests to the versions page completed with p50 208 ms and p95 666 ms.

## Query plans (`explain("executionStats")`)

All version reads use the compound unique index `(supplierKey, reference, version)`:

- **Versions page**: `supplier_quotation_versions` — 21 keys examined, 21 documents examined, 21 returned. `COLLSCAN=false`, blocking `SORT=false`.
- **Versions cursor page (`version < 26`)**: `supplier_quotation_versions` — 21 keys examined, 21 documents examined, 21 returned. `COLLSCAN=false`, blocking `SORT=false`.
- **Compare two versions (`$in: [1, 45]`)**: `supplier_quotation_versions` — 4 keys examined, 2 documents examined, 2 returned. `COLLSCAN=false`, blocking `SORT=false`.
- **Selected version (`version: 7`)**: `supplier_quotation_versions` — 1 key examined, 1 document examined, 1 returned. `COLLSCAN=false`, blocking `SORT=false`.
- **Current / draft / accepted pointers**: `supplier_quotation_pointers` — 45 keys examined, 45 documents examined, 1 returned. `COLLSCAN=false`, blocking `SORT=false`.

## Limitations

Single client measurement over internet connection to Atlas; local development server (`next start`); no CDN/edge caching. Concurrency was tested for consistency and isolation (atomic operations, version increments, unique outbox keys), not saturated enterprise load.

