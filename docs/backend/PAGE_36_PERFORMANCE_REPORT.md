# Page 36 — Performance report

Measured 2026-11-05 with `docs/page-reports/tools/36-buyer-support-test.mjs` (group P) on a production build (`.next-audit`, port 3100), throwaway database `finbynmart_test`, one buyer with 1,000 stored tickets, public caches off, a local Windows machine with Chrome and other tools open. 15 timed requests per route after one warm-up; sequential. Numbers are from this single machine; no load test, no remote database latency and no production measurement was made.

| Route | Target p95 | Measured p50 / p95 (ms) |
|---|---:|---|
| `GET /api/buyer/support/tickets` (20 rows) | < 350 | 66 / 72 |
| list, status + category filter | < 350 | 69 / 79 |
| list, text search | < 400 | 69 / 80 |
| list, page 50 | < 350 | 69 / 82 |
| `GET /api/buyer/support/summary` | < 250 | 69 / 83 |
| `GET /api/buyer/support/categories` | < 200 | 34 / 44 |
| `GET /api/buyer/support/tickets/[ref]` | < 350 | 34 / 47 |
| `POST /api/buyer/support/tickets` (no files) | < 500 | 159 / 202 |

All targets met on this machine. A 20-row list answer is 7.5 KB with 1,000 tickets stored; ten simultaneous list requests all succeeded.

## Indexes (explain, 1,000 tickets)
Newest, status (newest), status (recently updated), recently updated and category list queries: IXSCAN, no COLLSCAN, no blocking SORT, 20 documents examined per 20-row page. The first run showed the status filter examining 69 documents because it used the newest index; the index `buyer_tickets_status_newest` was added and it now examines 20.

## Not measured
Ticket creation with attachments (file I/O dominated), cold-start times, large-attachment download throughput, Lighthouse/LCP/INP/CLS (not run), behaviour against a hosted MongoDB cluster. The substring search (`subject` regex) is bounded to one buyer's rows through the buyer index; it is fast at 1,000 tickets per buyer but has no text index, so a buyer with a very large number of tickets would scan more of their own rows.
