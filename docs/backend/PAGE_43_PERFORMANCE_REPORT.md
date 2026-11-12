# Page 43 — performance report

Method: production build (`NEXT_DIST_DIR=.next-audit`, `next start`), MongoDB Atlas (remote, so every request includes the round trip), one signed-in supplier, HTTP through the real routes, 25 sequential requests per figure after 2 untimed warm-ups (submit: 20 requests, each on its own freshly created draft), rate-limit counters cleared before each group. Data: 1,630 quotable inquiries for one company (2,000 seeded, of which 400 closed / quoted), a company with ~29 catalogue products. Final run 2026-11-12. Planning targets are targets, not claims; run-to-run noise is real (±50 ms on p95, more on p99).

| Operation | p50 | p95 | p99 | Target (p95) |
|---|---|---|---|---|
| Picker, 20 rows | 142 ms | 176 ms | 203 ms | ≤ 500 (read) |
| Picker search (product substring) | 152 ms | 188 ms | 269 ms | ≤ 500 |
| Quotation context (inquiry + options) | 134 ms | 168 ms | 171 ms | ≤ 500 |
| Draft save (PATCH, revision guard) | 340 ms | 377 ms | 393 ms | ≤ 700 |
| Preview (server calculation) | 180 ms | 244 ms | 409 ms | ≤ 500 |
| Submit (transaction: 5 writes + inquiry steps; notice excluded) | 597 ms | 741 ms | 741 ms | ≤ 1,000 |
| 50-row picker response | 17 KB | | | |

All within the planning targets in this run. The submit figure is dominated by the transaction round trips to Atlas (snapshot read, majority write concern); it is the closest to its target.

## Query plans (`explain("executionStats")`)
Picker first page: `supplier_quotable_newest` `(supplierKey, status, createdAt −1, _id −1)` — **23 keys examined, 20 documents examined, 20 returned, no collection scan, no blocking sort**. Before that index existed the same query examined all 1,630 documents and sorted in memory (the existing dashboard index has no `_id`, so it could not serve the stable sort): that was a real finding of the first scale run, fixed with one index. The open-quotation unique index, the idempotency unique + TTL indexes and the outbox indexes exist (M-06).

## Not measured / limits
Single client, no sustained concurrency test, no Vercel, no CDN. Concurrency was tested for correctness only (double click, 30 simultaneous creates, 5 simultaneous submits), not for throughput. Draft-save and submit timings include remote database latency from a development machine.
