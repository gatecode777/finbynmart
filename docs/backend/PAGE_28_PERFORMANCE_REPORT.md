# Page 28 — Performance report

Same conditions and run as `PAGE_27_PERFORMANCE_REPORT.md` (production build, remote shared Atlas cluster, one sequential client, 25 samples, throwaway database). There was no earlier detail answer of this kind, so no before/after exists and no improvement is claimed.

| Operation | 100 stored | 1,000 | 10,000 | 20,000 | Target |
|---|---|---|---|---|---|
| Detail API p95 (`GET /api/buyer/inquiries/[ref]?view=detail`) | 99 ms | 101 | 106 | 105 | below 350 |
| Cancel p95 | 180 ms | 142 | 169 | 145 | below 500 |

Over three full runs the detail API p95 ranged 99–125 ms and cancel 140–180 ms (targets 350 and 500).

Detail is one indexed read (`reference_1`: 1 key, 1 document) plus in-memory catalogue lookups for the supplier and product; its cost does not grow with the buyer's history. Cancel is one conditional `findOneAndUpdate` (rate limit counter, session and the update).

**Not applicable (nothing to measure):** timeline, responses, quotations, messages and attachments have no separate queries: the timeline is built from the same document, the other modules do not exist. **Not measured:** the details page's server render and HTML size, concurrent readers, the print rendering, external notification delivery (none exists).
