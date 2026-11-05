# Page 27 — Performance report (also covers the Page 28 detail API)

Conditions: production build (`.next-audit`), `next start` on port 3100, throwaway database `finbynmart_test` on MongoDB Atlas over the internet (shared cluster, latency varies), nothing else running, `FINBYN_PUBLIC_CACHE_MS=0`, one buyer, one client making sequential requests (25 per measurement, 15 for the last page), catalogue warmed by one call first. Source: `docs/page-reports/tools/27-28-buyer-inquiries-test.mjs` (group P) and `27-inquiry-explain.mjs`. The earlier list endpoint was unfiltered, unpaged and capped at 100 rows, so there is no like-for-like before/after and **no improvement is claimed**.

## Latency (p95, ms) by inquiries stored for the buyer
| Stored | List (page 1) | Status tab | Search (buyer-scoped text) | Supplier filter | Last page | Summary | Detail (`?view=detail`) | Cancel | 10 parallel lists (total) |
|---|---|---|---|---|---|---|---|---|---|
| 100 | 87 | 95 | 90 | 90 | 88 | 93 | 99 | 180 | 329 |
| 1,000 | 80 | 101 | 127 | 84 | 93 | 84 | 101 | 142 | 260 |
| 10,000 | 86 | 95 | **301** | 86 | 107 | 98 | 106 | 169 | 306 |
| 20,000 | 92 | 95 | 135 | 86 | **379** | 114 | 105 | 145 | 266 |

p50 of the list was 70–83 ms at every size. Payloads: a 20-row list page 11.4 KB, the summary 0.7 KB. The table is the first full run. The suite was run in full three times on the final code; ranges of p95 over the three runs (ms): list 80–103, status tab 75–101, search 85–301, supplier filter 83–98, last page 83–379, summary 77–129, detail 99–125, cancel 140–180, ten parallel lists 260–353 in total. Every value of every run is inside the targets (list < 400, summary < 300, detail < 350, cancel < 500), but the two highest are close: **search at 10,000 inquiries (301 ms, once; 108 and 112 ms in the other two runs)** and **the last page at 20,000 (379 ms, once; 106 and 101 in the others)**. The spread comes from the remote shared cluster; the query plans below do not change between runs.

## Query plans (`27-inquiry-explain.mjs`: one buyer with 20,000 inquiries among 30 others with 1,000 each)
| Query | Plan | Keys / documents examined |
|---|---|---|
| newest, oldest | IXSCAN `buyer_newest` (oldest scans it backwards), no sort stage | 20 / 20 |
| recently updated | IXSCAN `buyer_updated` | 20 / 20 |
| one status | IXSCAN `buyer_status_newest` | 20 / 20 |
| awaiting (four stored values) | SORT_MERGE over IXSCAN `buyer_status_newest` (a merge of already ordered scans, not a blocking sort) | 22 / 20 |
| date window | IXSCAN `buyer_newest` | 20 / 20 |
| supplier / type filter | IXSCAN `buyer_newest`, filter on the documents | 96 and 80 / the same |
| search | IXSCAN `buyer_newest`, regex on documents, stops at 20 matches | 496 / 496 |
| last page (skip 19,980) | SKIP over IXSCAN | 20,000 keys / 20 documents, 221–242 ms |
| tab counts and summary | GROUP over a covered IXSCAN (status only) | 20,000 keys / 0 documents |
| detail | IXSCAN `reference_1` | 1 / 1 |
| supplier choices (facets) | GROUP over a FETCH | 20,000 / 20,000 |

No collection scan and no blocking sort anywhere. Indexes added (each for a measured query shape): `buyer_newest {buyerId, createdAt:-1, _id:-1}`, `buyer_status_newest {buyerId, status, createdAt:-1, _id:-1}`, `buyer_updated {buyerId, updatedAt:-1, _id:-1}`. The older `{buyerId, createdAt}` index is now redundant (other modules still create it) and costs a little on every write.

## Known weak points
- **Offset paging** reads every key before the page: the last page of a 20,000-inquiry history is the slowest list query (about 380 ms). A keyset cursor would remove it; not built (a buyer with 20,000 inquiries is far beyond expectation, and the page limit of 1,000 bounds the worst case).
- **Search** is a literal regex over the buyer's own documents (not a text index): cost grows with the buyer's history until 20 matches are found; selective searches over 10,000+ rows approach the target.
- **Supplier choices** are grouped from the buyer's whole history on every page load (documents fetched); at 20,000 inquiries that is a 20,000-document group. Cheap for normal histories.
- The first request after a server start loads the catalogue (21,392 products) for thumbnails and supplier links: slower once, then in memory.

## Not measured
Concurrent buyers (one client only), cold start, the detail page's render time, the summary under write load.
