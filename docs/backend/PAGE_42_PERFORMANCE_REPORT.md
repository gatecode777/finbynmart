# Page 42 — performance report

Method: production build (`NEXT_DIST_DIR=.next-audit`, `next start` on :3100, `FINBYN_PERF=1`) against the **throwaway** database `finbynmart_test` on MongoDB Atlas (remote, so every request includes network time to Atlas), run from the same machine through the real HTTP routes with a signed-in supplier. Each figure is 30 sequential requests after 3 untimed warm-ups (`42-supplier-quotations-test.mjs`, group K); the rate-limit counter is cleared before each group so a 429 is never timed. Data: 100 / 1,000 / 10,000 current quotations over 2 sellers, 2 buyers, INR and USD, mixed statuses and validity dates. Final run (2026-11-11). Run-to-run noise is real: a repeat run moved individual p95 values by ±50 ms and p99 (the second-worst of 30) by much more.

| Operation (p50 / p95 / p99, ms) | 100 | 1,000 | 10,000 | Target p95 |
|---|---|---|---|---|
| List, 20 rows | 156 / 192 / 223 | 153 / 160 / 174 | **153 / 196 / 217** | < 400 |
| Summary (six counts) | 107 / 135 / 143 | 103 / 123 / 138 | **113 / 135 / 149** | < 300 |
| Search + status tab | 148 / 175 / 186 | 150 / 177 / 180 | **174 / 214 / 221** | < 400 |
| Filters (validity, currency, 90 d) + sort | 172 / 293 / 663 | 146 / 162 / 187 | **152 / 179 / 287** | < 400 |
| Detail | 192 / 303 / 353 | 128 / 182 / 355 | **135 / 172 / 203** | < 350 |
| Versions | 157 / 239 / 268 | 129 / 169 / 173 | **136 / 152 / 158** | < 350 |

All within the PRD targets at 10,000 quotations in this run. A 50-row list response is 28.7 KB. Deep page (offset 9,980): 20 documents examined, 249 ms. Five simultaneous list requests: p50 416 ms, p95 737 ms (the PRD has no concurrency target; this figure varied between 650 and 850 ms across runs, so treat it as borderline). Eight simultaneous requests all returned correct, equal totals.

Baseline is ~105–150 ms even for tiny data: session lookup, company resolution and the rate-limit write each cost a round trip to Atlas. The list itself is 3 queries (page, count, one counts aggregation).

## What was measured before and after (the report the project rules ask for)
First 10,000-row run (before the fix): summary p95 **420 ms** and search + tab p95 **452 ms** (both over target), list p99 3,183 ms. Cause: the list ran three overlapping aggregations that fetched documents (counts, summary, currencies). Fix: one covered aggregation over `supplier_current_summary` (status, validity-ended, currency) that serves the cards, the tab counts and the currency list (a second one only when a search or filter is active), plus `supplier_current_status_created` so status tabs sort without an in-memory sort. After: summary p95 135 ms, search + tab 214 ms. List p99 outliers of 1.5–3 s appeared in some runs and not others (a single slow request among 30; not reproduced in the final run); they are not explained and should be watched on a real deployment.

## Query plans (`explain("executionStats")`)
No collection scan and no blocking sort for: default list, Oldest, Recently Updated, Validity Ending Soon, detail lookup (10-row data), and at 10,000 rows for the accepted, drafts, submitted, expired tabs and default list (keys examined 20, 20, 24, 147, 21; the expired tab examines 145 documents to return 20 because the validity condition is applied after the index). The counts aggregation is a covered index scan (`PROJECTION_COVERED`, 0 documents examined).

## Not measured / limits
Not a load test: single client, no sustained concurrency, no Vercel or CDN, development laptop to Atlas. Dev-server numbers were not used. Tested rows are synthetic; a company with many buyers adds one `users` lookup of at most 50 names per page.
