# API baseline report

Measured on 2026-11-03 against a production build, **before any optimisation** (the build already contained the instrumentation, nothing else had changed).

## Environment

Node v26.5.0; win32 10.0.26300; 8 logical CPUs (13th Gen Intel(R) Core(TM) i3-1315U); 8 GB RAM; MongoDB Atlas reached over the internet (one database round trip from this machine measures about 30 ms, which is part of every figure below that includes the database); production build (`next build` + `next start`), not the dev server.

Data: the seed catalogue (21,392 products, 1,200 sellers) held in memory, and the throwaway database `finbynmart_test` (it held the fixtures of the Page 11-14 test suites: 12 reviews and 10 certifications for Shree Textiles, a few hundred inquiries). Server-side figures come from the application's own per-request log lines (`FINBYN_PERF=1`); client figures are the time for the full response to arrive over loopback. 1 concurrent request(s), 120 requests per route after 3 warm-up requests. Each request used its own client address so the per-address rate limits did not interfere; the limiter still ran.

How to read the columns: **server** = time inside the route handler (APIs) or the page function (pages; React's rendering of the HTML happens after it and is only in the client column). **DB** = time waiting on MongoDB, summed over operations, with the median number of operations. **cold** = the first request to that route after the server process started.

| Route | Target class (p95, ms) | server p50 | server p95 | server p99 | client p50 / p95 / p99 | payload (uncompressed) | DB ms (ops) | cold (ms) | p95 vs target |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| GET /api/public/products (page 1, limit 20) | undefined (<undefined) | 46.3 | 60.4 | 75.9 | 60.5 / 77.4 / 94.6 | 27 KB | 31.7 (1 ops) | 1622.1 | MISSES |
| GET /api/public/products (deep page 500) | undefined (<undefined) | 44.8 | 52 | 56.1 | 59.4 / 68.9 / 86.6 | 27 KB | 31.1 (1 ops) | 59.9 | MISSES |
| GET /api/public/products (text search) | undefined (<undefined) | 53.6 | 64.7 | 72.7 | 64.7 / 75.9 / 89.3 | 19 KB | 30.5 (1 ops) | 83.5 | MISSES |
| GET /api/public/products (sort price) | undefined (<undefined) | 54.1 | 64.7 | 77.1 | 64.1 / 76.8 / 90.4 | 27 KB | 30.8 (1 ops) | 71.5 | MISSES |
| GET /api/public/products/suggest | undefined (<undefined) | 32 | 40 | 50 | 46.8 / 54.7 / 59.6 | 1.1 KB | 30.6 (1 ops) | 142.2 | MISSES |
| GET /api/public/products/:slug (catalogue) | undefined (<undefined) | 31.2 | 36.4 | 42 | 47 / 52 / 57.2 | 1.7 KB | 30.5 (1 ops) | 54.9 | MISSES |
| GET /api/public/products/:slug (sample) | undefined (<undefined) | 31.4 | 36 | 40.9 | 46.4 / 51.3 / 59.6 | 1.3 KB | 30.8 (1 ops) | 51 | MISSES |
| GET /api/public/products/:slug/related | undefined (<undefined) | 31.4 | 37 | 52.6 | 46.9 / 51.7 / 61 | 5.6 KB | 30.6 (1 ops) | 36.4 | MISSES |
| GET /api/public/suppliers (directory) | undefined (<undefined) | 33.9 | 42.2 | 59.8 | 46.4 / 57.3 / 69.5 | 18 KB | 31.2 (1 ops) | 117.3 | MISSES |
| GET /api/public/suppliers/:slug (sample) | undefined (<undefined) | 32 | 59.1 | 113.2 | 47.9 / 70.1 / 119.8 | 1.3 KB | 31.6 (1 ops) | 35.9 | MISSES |
| GET /api/public/suppliers/:slug/products (merged) | undefined (<undefined) | 31.4 | 151 | 194.5 | 47.7 / 161.5 / 201.7 | 16 KB | 30.6 (1 ops) | 52.4 | MISSES |
| GET /api/public/suppliers/:slug/products (catalogue) | undefined (<undefined) | 41.5 | 50.8 | 56.2 | 48.9 / 64 / 71.4 | 7.7 KB | 30.5 (1 ops) | 62.3 | MISSES |
| GET /api/public/suppliers/:slug/reviews | undefined (<undefined) | 59.7 | 77.8 | 87.3 | 71.2 / 89 / 101.3 | 5.0 KB | 58.6 (2 ops) | 351 | MISSES |
| GET /api/public/suppliers/:slug/reviews/summary | undefined (<undefined) | 59.1 | 70.2 | 79.4 | 68.3 / 84.4 / 93.2 | 0.5 KB | 58.3 (2 ops) | 89.3 | MISSES |
| GET /api/public/suppliers/:slug/certifications | undefined (<undefined) | 60.9 | 70.7 | 87.3 | 74.1 / 86.2 / 90.5 | 4.4 KB | 58.3 (2 ops) | 156.4 | MISSES |
| PAGE / | undefined (<undefined) | – | – | – | 15.5 / 18.4 / 20.6 | 239 KB | – (– ops) | 48 | MISSES |
| PAGE /products | undefined (<undefined) | 15.6 | 17.5 | 19.1 | 54.7 / 67.7 / 74.4 | 220 KB | 0 (0 ops) | 151.2 | MISSES |
| PAGE /products?page=500 | undefined (<undefined) | 15.1 | 16.8 | 17.2 | 50.5 / 63.9 / 66.4 | 218 KB | 0 (0 ops) | 59.3 | MISSES |
| PAGE /search?q=shirt | undefined (<undefined) | 24.9 | 31.5 | 37.1 | 57.9 / 72.6 / 84 | 163 KB | 0 (0 ops) | 69.8 | MISSES |
| PAGE /products/:slug (sample) | undefined (<undefined) | 0.5 | 0.9 | 1.1 | 30.3 / 37.5 / 44.1 | 136 KB | 0 (0 ops) | 38.8 | MISSES |
| PAGE /products/:slug (catalogue) | undefined (<undefined) | 0.6 | 1 | 1.7 | 30.7 / 39.9 / 40.9 | 118 KB | 0 (0 ops) | 32.9 | MISSES |
| PAGE /suppliers | undefined (<undefined) | 2.3 | 2.9 | 4.7 | 38.3 / 49.1 / 51.5 | 193 KB | 0 (0 ops) | 42.5 | MISSES |
| PAGE /suppliers/:slug (profile) | undefined (<undefined) | 30.8 | 42.6 | 50.1 | 55 / 80.7 / 116.5 | 131 KB | 59.2 (2 ops) | 257.5 | MISSES |
| PAGE /suppliers/:slug/products (merged) | undefined (<undefined) | 29.8 | 33.3 | 46.6 | 54.2 / 69 / 108.1 | 153 KB | 56.9 (2 ops) | 64.4 | MISSES |
| PAGE /suppliers/:slug/products (catalogue) | undefined (<undefined) | 41.4 | 56.9 | 62.4 | 72.6 / 108.5 / 139.8 | 140 KB | 58.1 (2 ops) | 90.4 | MISSES |
| PAGE /suppliers/:slug/reviews | undefined (<undefined) | 30.9 | 39.6 | 57.1 | 72.6 / 97.2 / 186.8 | 259 KB | 58.8 (2 ops) | 97.6 | MISSES |
| PAGE /suppliers/:slug/certifications | undefined (<undefined) | 32.8 | 43.5 | 54.1 | 66.3 / 99.9 / 158.1 | 153 KB | 59 (2 ops) | 115.2 | MISSES |
| PAGE /inquiry/:slug | undefined (<undefined) | 29.7 | 41.2 | 48.6 | 52.2 / 72.2 / 100.8 | 94 KB | 28.1 (1 ops) | 65.4 | MISSES |
| PAGE /categories | undefined (<undefined) | 0.3 | 0.5 | 0.7 | 28.9 / 35.8 / 37.8 | 154 KB | 0 (0 ops) | 26.1 | MISSES |
| PAGE /categories/:slug | undefined (<undefined) | 13 | 22.8 | 27.6 | 55.2 / 93.8 / 106.6 | 250 KB | 0 (0 ops) | 100.6 | MISSES |

Notes
- A "p95 vs target" of *meets* for an API compares its **server** p95; for a page it compares the **client** p95 (end to end), which is the stricter reading.
- `PAGE /` is a statically generated page: it has no per-request page function, so only client figures exist.
- Payload sizes are uncompressed; `next start` compresses responses (gzip) for browsers: see API_PAYLOAD_AUDIT.md.
- These are single-request-at-a-time figures. What happens under concurrency is in API_LOAD_TEST_REPORT.md, and it is where the real problems appeared.
