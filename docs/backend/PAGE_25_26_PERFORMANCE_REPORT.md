# Pages 25-26 — Performance report

Conditions: production build (`.next-audit`), `next start` on port 3100, throwaway database `finbynmart_test` on MongoDB Atlas reached over the internet (a shared cluster: latency varies), nothing else running, `FINBYN_PUBLIC_CACHE_MS=0`, one client making sequential requests (25 per read measurement, 15 for deep pages), one buyer. Source: `docs/page-reports/tools/25-26-settings-notifications-test.mjs` (group K) and `25-26-notification-explain.mjs`. There was no earlier notification or settings API, so there is no before/after comparison and no improvement is claimed. Latencies below are from the full runs made after the final index change; the run-to-run range is shown because it was wide.

## Reads and single writes (p95, ms, range over the last five full runs)
| Notifications stored | List (page 1) | Unread/category filtered | Deep page (last pages) | Unread count | Mark one read | Settings read |
|---|---|---|---|---|---|---|
| 100 | 79–97 | 76–100 | 76–104 | 72–84 | 169–242 | 73–91 |
| 1,000 | 76–112 | 78–92 | 77–109 | 76–118 | 177–232 | 79–201 |
| 10,000 | 87–411 | 81–105 | 88–238 | 73–96 | 170–343 | 74–158 |
| 20,000 | 97–1,122 | 79–89 | 96–162 | 73–100 | 172–244 | 75–152 |

Settings save p95 168–286 ms (15 saves). Payload of a 20-item page: 4.5 KB regardless of how many are stored.

**Where the targets were missed (state plainly):**
- *List p95 spikes:* in two of five runs one 20,000-row (or 10,000-row) measurement showed a p95 of 411 ms and 1,122 ms with a p50 of about 80 ms and a p99 of up to 2 s, i.e. one or two slow requests out of 25, right after the test inserted thousands of rows. The query plan itself is constant (20 keys, 20 documents, see below). The cause was not identified; the remote shared cluster is the likely source. In the other runs the same measurement was 79–142 ms.
- *Mark all as read:* each request marks at most 200 notifications and the page repeats it while `more` is true. A request takes about 180 ms for 100 rows and about 1.3 s p95 for a full batch of 200 on this cluster, so **a full batch misses the 500 ms write target**; marking 20,000 unread takes about 101 requests and 54 s in total. One request with a few dozen unread (the realistic case) is well inside the target. The cost is index maintenance on four indexes plus network round trips to the remote cluster; the cause of the 1.3 s per 200 rows was not proven. An unbounded single update (the first version) took 3.1 s for 10,000 and 9.4 s for 20,000, which is why the work is bounded. A "read-all watermark" design would make it constant-time but changes every filter and count; not done.

## Query plans (`25-26-notification-explain.mjs`, one buyer with 20,000 rows among 100,000)
| Query | Plan | Keys / docs examined |
|---|---|---|
| list newest, unread, read, category, category + unread | LIMIT > FETCH > IXSCAN on the matching `nf_*` index; **no SORT stage** | 20 / 20 |
| unread count (limit 100) | LIMIT > FETCH > IXSCAN `nf_buyer_status_newest` | 100 / 100 |
| read one | IXSCAN `_id_` | 1 / 1 |
| category total (for `meta.total`) | IXSCAN `nf_buyer_category_newest` | 6,668 index keys, 12 ms |
| deep page (skip 19,900) | SKIP over IXSCAN `nf_buyer_newest` | 19,920 keys, 20 docs fetched, about 266 ms in the explain |

Two defects were found and fixed with this check: the first version sorted by `createdAt, _id` on indexes without `_id` (a blocking sort over all 20,000 rows for every page), and the "read" filter used `readAt != null`, which no index can sort after (fixed with an `isRead` boolean). Another found defect: an unsorted "is there more?" lookup scanned the already-read rows (removed; a full batch now means "maybe more").

Settings: one document read by the unique `buyerId` index (p95 about 75–200 ms with the session lookup). Total counts for filtered lists scan the matching index keys (not documents); with the page limit of 1,000 pages the worst deep skip is bounded but slow (see the deep-page row); a keyset cursor would remove it and was not built.

## Not measured
Concurrent buyers (one client only), cold start, the settings page render time, notification creation latency under load (it adds two indexed operations to the inquiry, document and password-change routes), bell polling cost at scale (one indexed count per minute per open tab).
