# API optimisation summary

All figures come from `docs/performance/results/*.json` (tool: `docs/performance/tools/bench.mjs`), same machine, production build, nothing else running during the "after" runs (the first "after" attempt overlapped with type-checking and tests and was discarded and re-run). Detailed tables: `API_BASELINE_REPORT.md`, `API_BEFORE_AFTER_REPORT.md`, `API_LOAD_TEST_REPORT.md`, `API_INDEX_AUDIT.md`. Environment: 8 logical CPUs (i3-1315U), 8 GB RAM, MongoDB Atlas about 30 ms away, so every database round trip costs about 30 ms.

## What was changed

1. Request timing: an AsyncLocalStorage context, a MongoDB timing proxy, `Server-Timing` and per-request log lines (`FINBYN_PERF=1`), slow-route warnings (`FINBYN_SLOW_MS`).
2. Short in-process caches with single-flight loading for public, read-only data: reviews and review headline (30 s), certifications (30 s, keyed by India date), LRU cache of built listing results. Switches: `FINBYN_PUBLIC_CACHE_MS` (0 = all off), `FINBYN_REVIEW_CACHE_MS`, `FINBYN_CERT_CACHE_MS`, `FINBYN_LISTING_CACHE_MS`.
3. Incremental static regeneration for product pages; catalogue and supplier pages stop doing per-request database work.
4. `rateLimitReserved` for public read routes: one database write reserves a block of the allowance (1/12 of the limit); the global limit is preserved.
5. Warm-up of the catalogue at server start (`instrumentation.ts`).
6. Reviews: headline computed from a rating-only projection; list limited and allow-listed fields.

## Measured result (before to after, steady state)

Pages (server-rendered): the database work disappeared from most pages. Examples, client p95 one request at a time: `/suppliers/:slug` 80.7 to 23 ms, `/suppliers/:slug/reviews` 97.2 to 32.4 ms, `/products` 67.7 to 35 ms. Under 10 concurrent clients `/products` went from 3.1 to 72.3 req/s, `/search?q=shirt` from 16.8 to 74.9, a product page from 16.2 to 103.6. All page routes meet their target classes at every concurrency level up to 10; at 50 concurrent, `/search` (1,445 ms p95) and the product page (956 ms) do **not** meet the 400-500 ms targets.

APIs: single-request server p95 for the review and certification routes fell from about 70-78 ms to about 40 ms (their database round trips went from 2 to 1). For the other API routes the single-request time is dominated by one rate-limit write (about 30 ms) and did not change materially.

## What did NOT improve (stated plainly)

- Under concurrency most lightweight API routes are bounded by the one database round trip of the rate limiter. Throughput stays around 110-150 requests per second and p95 at 50 concurrent clients stays in the 450-900 ms range, **above the 300-500 ms targets**, in both "before" and "after". Several were slower in this run at 50 concurrent: `/api/public/products/:slug` (259.8 to 136.3 req/s), `/api/public/suppliers` (136 to 116.2 req/s), `/api/public/suppliers/:slug/products (catalogue)` p95 (343.9 to 682.5 ms). Repeated runs on this laptop-class machine differ by similar amounts (the discarded first run showed other routes moving the opposite way), so these differences are not claimed as regressions or improvements, but they are also not shown to be noise by a repeated clean run: that was not done.
- Moving the rate limiter off the per-request database write (for example an edge or in-memory limiter per instance) is the next change that would move these numbers; it was not made because it weakens the global-limit guarantee.
- The 4 "steady client" tables show repeat visitors served from the reserved block with 0 database operations (server p50 0.3-0.7 ms), but their tail (p95/p99) still includes the occasional block reservation (about 35 ms); some routes show larger tails (for example `/api/public/suppliers` steady p99 354.7 ms) whose cause was not investigated.

## Not measured

CPU and memory of the server process, Atlas-side metrics, production (Vercel) behaviour, and the large-dataset runs with `FINBYN_CATALOG_LIMIT` below the full 21,392 products. Synthetic volumes of 1k, 10k and 50k reviews, certifications and inquiries were checked at the query-plan level only (`API_INDEX_AUDIT.md`: every query uses an index, no collection scan, no blocking sort).

## Pagination and payload

Defaults stay at the page-PRD sizes (10, 8, 10), maximum 50, which deviates from the performance PRD's default of 20; list payloads are 0.5-27 KB (uncompressed); pages are 94-260 KB uncompressed (about 16-31 KB gzipped).
