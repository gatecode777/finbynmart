# Public product search: the 16-second wait, measured, and the bounded policy

Tool: `node --import ./docs/page-reports/tools/alias-register.mjs docs/performance/tools/search-timing.mjs` (in-process, against an UNREACHABLE database; nothing is read or written). Measured 2026-11-16 on this machine; one run per number, no percentiles claimed.

## Where the time went (database unreachable)
| Stage | Time |
|---|---|
| Rate limiter (`rateLimitReserved`, fails open after the driver gives up) | 7,955 ms per call (3 calls: 24,027 ms; every call re-attempts the connection because a failed connection is not cached) |
| Approved-snapshot load (`ensureApproved`) | 8,006 ms (once per 15 s window) |
| Catalogue query (in-memory engine, cold) | 27-30 ms; cache hit 0 ms |
| Serialization (12 results) | under 1 ms, 8,485 bytes |

So the observed ~16 s was 8 s of the limiter waiting for MongoDB's `serverSelectionTimeoutMS` (8,000) plus 8 s of the first snapshot load. The catalogue query and serialization are not the problem. **It does not disappear by itself with a database**: any slow or unreachable database (a paused Atlas cluster, a network partition) reproduces the same waits, because both stages sit in front of an in-memory answer.

## Policy now (documented degraded behaviour)
- `boundedRateLimit` (public product search and requirement-spec): the database limiter gets a **1.5 s deadline**. On timeout or error the instance falls back to a **per-instance in-memory counter with a stricter ceiling (a quarter of the normal limit, at least 10 per window)** and skips the database for 10 s so later requests are not delayed. Abuse protection is never switched off; while degraded the limit is per instance (weaker than the shared one): the accepted trade-off for keeping read-only catalogue pages answering. The shared limiter returns as soon as the database answers.
- `ensureApproved`: waits at most **1.5 s** for the approved-products snapshot; after a slow or failed load requests are not held up again for 15 s (the previous, possibly empty, snapshot answers; the load continues in the background; approved supplier products may be missing from results until it succeeds, and nothing claims otherwise).
- Result: with the database down the first search takes about 3 s at most (1.5 s + 1.5 s), later ones milliseconds. Measured on the built server (`next start`, unreachable database): **search #1 3.09 s (was 16.10 s), searches #2 to #4: 4 to 5 ms.** The unit test `67` also measures the limiter (803 ms with an 800 ms deadline, then 0 ms) and that a flood is still blocked (10 of the first 40 pass).
- Over the limit the response is the existing 429 with `Retry-After`; the browser form cancels stale requests and shows a retryable message.

## Not changed
Write endpoints keep `rateLimit()` (exact, fail-open as documented in CLAUDE.md); a failed connection is still not cached by `getDb()` (each database-bound call re-attempts and can wait up to 8 s: those routes are authenticated writes and reads, not the public catalogue). A circuit breaker for them is a separate decision.
