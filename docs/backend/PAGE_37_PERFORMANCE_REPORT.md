# Page 37 — Performance report

Measured 2026-11-05 with `docs/page-reports/tools/37-buyer-ticket-details-test.mjs` (group P) on a production build (`.next-audit`, port 3100), throwaway database `finbynmart_test`, public caches off, one local Windows machine (Chrome and other tools open) talking to the hosted MongoDB cluster. One buyer; one ticket with **1,000** messages and one with **10,000** (every 20th / 100th carrying a file; 30 status events on the first). Sequential requests, 40 per GET route after a warm-up, 30 per write after a discarded warm-up. Not a load test, not production.

## Final run (ms)
| Operation | Target p95 | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| Ticket details | < 300 | 97 | 131 | 318 |
| Conversation page, 1,000 messages | < 350 | 101 | 115 | 115 |
| Conversation page, 10,000 messages (newest) | < 350 | 100 | 116 | 120 |
| Conversation page, deep into 10,000 | < 350 | 101 | 114 | 123 |
| Timeline page, 1,000 / 10,000 / deep | < 300 | 102 / 101 / 100 | 122 / 174 / 120 | 124 / 181 / 130 |
| Files list, 1,000 / 10,000 | < 300 | 100 / 103 | 117 / 134 | 157 / 138 |
| Related record | < 300 | 68 | 81 | 82 |
| Reply (no files) | < 400 | 191 | 235 | — |
| Reopen | < 400 | 163 | 193 | — |
| Feedback | < 400 | 191 | 270 | — |

Response sizes at 10,000 messages: conversation page 5.1 KB, timeline page 4.7 KB, files page 5.5 KB. Ten simultaneous conversation requests all succeeded.

## Runs that missed (reported, not hidden)
Five complete runs were made while building. Single slow requests, not reproducible, appeared in three of them: files list (10,000) p95 325 ms and reopen p95 469 ms in the first run (only 15 and 12 samples, so p95 was the single slowest request; the suite now takes 40/30 samples with a warm-up), reply p95 483 ms in one later run (others: 204, 215, 224, 235 ms), and ticket-detail p99 of 998 ms / 318 ms in two runs. The Page 36 categories route also spiked once to 718 ms (normal 44–54 ms). These look like network or machine noise against a hosted database; no cause was proven. Writes are dominated by 4–5 sequential database round trips (about 190 ms for a reply); no optimisation was done.

## Indexes (explain, 10,000 messages)
| Query | Index | Documents examined |
|---|---|---:|
| conversation page (21) | `ticket_messages_visible` | 21 |
| timeline messages (51) | `ticket_messages_visible` | 51 |
| files page (21) | partial `ticket_message_files` | 21 |
| download lookup of one file | partial `ticket_message_file_id` | 0 (key lookup) |
| duplicate-send lookup | unique partial `ticket_message_send_key` | 0 (key lookup) |
| ticket by reference and buyer | `ticket_reference` | 1 |
| feedback by ticket | unique `ticket_feedback` | 0 |
No collection scan and no blocking sort. **Defect found by this check and fixed:** the duplicate-send lookup first used a partial index filtered on `$type`, which MongoDB cannot use for an equality lookup, so it read all 10,000 messages of the ticket on every reply; the filter is now `$exists`, and the check asserts at most one document.

## Not measured
Replies with files, large file downloads, cold starts, a hosted-production environment, concurrent load from many buyers, Lighthouse/LCP/INP/CLS.
