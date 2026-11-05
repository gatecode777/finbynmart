# Page 22 performance report

Measured on 2026-11-03: production build, `next start`, MongoDB Atlas about 30 ms from this laptop (i3-1315U, 8 GB), throwaway database, one synthetic test buyer with 1,000, then 10,000, then 20,000 inquiries (random dates over a year, mixed statuses and products), caches irrelevant (the data is private and uncached). 30 sequential requests per row after one warm-up, from the test client over loopback. Source: `22-buyer-dashboard-test.mjs` (M group).

| Inquiries | Range | p50 | p95 | p99 | aggregation p50 | payload |
|---:|---|---:|---:|---:|---:|---:|
| 1,000 | 30 days | 110 ms | 137 ms | 141 ms | 33 ms | 5.5 KB |
| 1,000 | 90 days | 113 ms | 139 ms | 140 ms | 34 ms | 4.8 KB |
| 1,000 | 365 days | 109 ms | 145 ms | 145 ms | 37 ms | 4.7 KB |
| 10,000 | 30 days | 111 ms | 152 ms | 194 ms | 40 ms | 5.5 KB |
| 10,000 | 90 days | 109 ms | 139 ms | 153 ms | 58 ms | 4.8 KB |
| 10,000 | 365 days | 154 ms | 189 ms | 246 ms | 102 ms | 4.7 KB |
| 20,000 | 30 days | 120 ms | 224 ms | 453 ms | 52 ms | 5.5 KB |
| 20,000 | 90 days | 143 ms | 166 ms | 172 ms | 89 ms | 4.8 KB |
| 20,000 | 365 days | 223 ms | 266 ms | 273 ms | 171 ms | 4.8 KB |

Against the PRD target (overview p95 below 600 ms): met in every row; worst p95 266 ms. The payload does not grow with history. Explain plan of the aggregation at 20,000 inquiries: `IXSCAN` on `{buyerId, createdAt}` then `FETCH` and projection; no `COLLSCAN`.

Where the time goes (from `meta.timingsMs` in the answer): the single inquiry aggregation, plus four parallel small queries (recent five, active count, account, saved counts, each about 30 ms to Atlas), then the supplier recommendation (in memory, a few ms). Total about one aggregation round trip plus the slowest parallel query. Serialization is not measured separately.

Concurrency: 10 simultaneous requests for the 20,000-inquiry buyer: batch median 808 ms, maximum 898 ms (about 80-90 ms per request when serialised by the single Node process on this machine). The "lightweight refresh below 400 ms" and "recent lists below 300 ms" targets were not separately benchmarked: they are the same endpoint (about 110-270 ms); no separate refresh or list endpoint exists.

Not measured: production hosting, cold start, large quotation or order histories (no such modules), CPU and memory of the server.
