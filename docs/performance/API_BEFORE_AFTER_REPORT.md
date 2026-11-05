# API before / after report

Same tool, same routes, same machine, same production-build method. "Before" is the baseline build (instrumentation only). "After" is the build with the optimisations listed in API_OPTIMIZATION_SUMMARY.md. Two "after" columns: **every request a different client** (the hardest case for the rate limiter, directly comparable with the baseline) and **steady clients** (40 addresses rotating, what repeat visitors look like). Format: before → after (every request a new client) → after (steady clients).

Node v26.5.0; win32 10.0.26300; 8 logical CPUs (13th Gen Intel(R) Core(TM) i3-1315U); 8 GB RAM; MongoDB Atlas reached over the internet (one database round trip from this machine measures about 30 ms, which is part of every figure below that includes the database); production build (`next build` + `next start`), not the dev server.

## One request at a time

Server p50 / p95 / p99 in milliseconds.

| Route | before | after (new clients) | after (steady clients) | client p95 ms | payload | DB ms (p50) | cold ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| GET /api/public/products (page 1, limit 20) | 46.3 / 60.4 / 75.9 | 35.3 / 70.7 / 94.1 | 0.5 / 44.5 / 58.5 | 77.4 → 83.2 → 56.9 | 27 KB → 27 KB | 31.7 → 34.3 → 0 | 1622.1 → 87 |
| GET /api/public/products (deep page 500) | 44.8 / 52 / 56.1 | 33.1 / 41.5 / 47.9 | 0.4 / 0.9 / 1.2 | 68.9 → 57 → 19.1 | 27 KB → 27 KB | 31.1 → 32 → 0 | 59.9 → 49.9 |
| GET /api/public/products (text search) | 53.6 / 64.7 / 72.7 | 32.7 / 40.1 / 44.9 | 0.4 / 0.7 / 0.7 | 75.9 → 55.3 → 18.3 | 19 KB → 19 KB | 30.5 → 31.8 → 0 | 83.5 → 53.3 |
| GET /api/public/products (sort price) | 54.1 / 64.7 / 77.1 | 32.7 / 43 / 55.2 | 0.7 / 36.3 / 46.7 | 76.8 → 54.9 → 51.6 | 27 KB → 27 KB | 30.8 → 31.4 → 0 | 71.5 → 47.8 |
| GET /api/public/products/suggest | 32 / 40 / 50 | 34.4 / 45.5 / 81.9 | 1.5 / 36.4 / 37.9 | 54.7 → 62.3 → 50.7 | 1.1 KB → 1.1 KB | 30.6 → 32.1 → 0 | 142.2 → 51.3 |
| GET /api/public/products/:slug (catalogue) | 31.2 / 36.4 / 42 | 33.1 / 49.7 / 55.6 | 0.4 / 0.7 / 0.9 | 52 → 62.6 → 18 | 1.7 KB → 1.7 KB | 30.5 → 32 → 0 | 54.9 → 53 |
| GET /api/public/products/:slug (sample) | 31.4 / 36 / 40.9 | 33.3 / 39.5 / 49.6 | 0.5 / 0.8 / 1 | 51.3 → 55.5 → 17.9 | 1.3 KB → 1.3 KB | 30.8 → 32.2 → 0 | 51 → 46.9 |
| GET /api/public/products/:slug/related | 31.4 / 37 / 52.6 | 32.9 / 41.6 / 48.3 | 0.7 / 57.4 / 120.5 | 51.7 → 57 → 65.2 | 5.6 KB → 5.6 KB | 30.6 → 31.7 → 0 | 36.4 → 52.1 |
| GET /api/public/suppliers (directory) | 33.9 / 42.2 / 59.8 | 35.5 / 40.1 / 44.4 | 2.6 / 124.7 / 354.7 | 57.3 → 55.8 → 138.2 | 18 KB → 18 KB | 31.2 → 32 → 0 | 117.3 → 59 |
| GET /api/public/suppliers/:slug (sample) | 32 / 59.1 / 113.2 | 34.7 / 48.7 / 54 | 0.3 / 0.4 / 0.5 | 70.1 → 65 → 17.8 | 1.3 KB → 1.3 KB | 31.6 → 34 → 0 | 35.9 → 50.9 |
| GET /api/public/suppliers/:slug/products (merged) | 31.4 / 151 / 194.5 | 33.6 / 59.8 / 134.8 | 0.5 / 0.8 / 1 | 161.5 → 73 → 18 | 16 KB → 16 KB | 30.6 → 32.5 → 0 | 52.4 → 55 |
| GET /api/public/suppliers/:slug/products (catalogue) | 41.5 / 50.8 / 56.2 | 33.2 / 44.7 / 65.6 | 0.5 / 73.1 / 108.8 | 64 → 60.8 → 84.1 | 7.7 KB → 7.7 KB | 30.5 → 32.4 → 0 | 62.3 → 51.9 |
| GET /api/public/suppliers/:slug/reviews | 59.7 / 77.8 / 87.3 | 32.6 / 40.6 / 66.9 | 0.6 / 131.7 / 530.1 | 89 → 55.3 → 139.6 | 5.0 KB → 5.0 KB | 58.6 → 31.6 → 0 | 351 → 106.9 |
| GET /api/public/suppliers/:slug/reviews/summary | 59.1 / 70.2 / 79.4 | 32.7 / 40.9 / 46 | 0.5 / 0.7 / 0.9 | 84.4 → 55.6 → 18.5 | 0.5 KB → 0.5 KB | 58.3 → 31.8 → 0 | 89.3 → 45.8 |
| GET /api/public/suppliers/:slug/certifications | 60.9 / 70.7 / 87.3 | 33 / 40.1 / 45.6 | 1.1 / 89.2 / 281.1 | 86.2 → 54.7 → 94.6 | 4.4 KB → 4.4 KB | 58.3 → 31.5 → 0 | 156.4 → 117.8 |
| PAGE / | – / – / – | – / – / – | – / – / – | 18.4 → 18.7 → 19.6 | 239 KB → 239 KB | – → – → – | 48 → 22.3 |
| PAGE /products | 15.6 / 17.5 / 19.1 | 0.1 / 0.3 / 0.5 | 0.2 / 0.3 / 0.4 | 67.7 → 35 → 37.9 | 220 KB → 220 KB | 0 → 0 → 0 | 151.2 → 25.5 |
| PAGE /products?page=500 | 15.1 / 16.8 / 17.2 | 0.1 / 0.2 / 0.3 | 0.2 / 0.3 / 0.4 | 63.9 → 31.7 → 34.4 | 218 KB → 218 KB | 0 → 0 → 0 | 59.3 → 32.4 |
| PAGE /search?q=shirt | 24.9 / 31.5 / 37.1 | 0.3 / 0.5 / 0.7 | 0.3 / 0.6 / 0.7 | 72.6 → 23 → 25.7 | 163 KB → 163 KB | 0 → 0 → 0 | 69.8 → 21.3 |
| PAGE /products/:slug (sample) | 0.5 / 0.9 / 1.1 | 0.3 / 0.4 / 0.5 | 0.3 / 0.5 / 0.6 | 37.5 → 23 → 25 | 136 KB → 136 KB | 0 → 0 → 0 | 38.8 → 27.9 |
| PAGE /products/:slug (catalogue) | 0.6 / 1 / 1.7 | 0.3 / 0.5 / 0.6 | 0.4 / 0.7 / 1.1 | 39.9 → 22.4 → 29.3 | 118 KB → 118 KB | 0 → 0 → 0 | 32.9 → 27.7 |
| PAGE /suppliers | 2.3 / 2.9 / 4.7 | 1.2 / 2.2 / 2.5 | 1.1 / 2.1 / 2.6 | 49.1 → 31.3 → 31.3 | 193 KB → 193 KB | 0 → 0 → 0 | 42.5 → 33.2 |
| PAGE /suppliers/:slug (profile) | 30.8 / 42.6 / 50.1 | 0.3 / 0.5 / 0.7 | 0.3 / 0.5 / 0.9 | 80.7 → 23 → 24.5 | 131 KB → 132 KB | 59.2 → 0 → 0 | 257.5 → 331.3 |
| PAGE /suppliers/:slug/products (merged) | 29.8 / 33.3 / 46.6 | 0.3 / 0.4 / 0.5 | 0.3 / 0.5 / 0.6 | 69 → 21.7 → 22.2 | 153 KB → 155 KB | 56.9 → 0 → 0 | 64.4 → 19 |
| PAGE /suppliers/:slug/products (catalogue) | 41.4 / 56.9 / 62.4 | 0.3 / 0.4 / 0.6 | 0.3 / 0.4 / 0.5 | 108.5 → 22.9 → 20 | 140 KB → 141 KB | 58.1 → 0 → 0 | 90.4 → 61.3 |
| PAGE /suppliers/:slug/reviews | 30.9 / 39.6 / 57.1 | 0.3 / 0.6 / 0.7 | 0.4 / 0.8 / 0.9 | 97.2 → 32.4 → 34.4 | 259 KB → 260 KB | 58.8 → 0 → 0 | 97.6 → 65.7 |
| PAGE /suppliers/:slug/certifications | 32.8 / 43.5 / 54.1 | 0.5 / 0.9 / 1.4 | 0.5 / 0.8 / 1.3 | 99.9 → 27.5 → 25.2 | 153 KB → 154 KB | 59 → 0 → 0 | 115.2 → 45.5 |
| PAGE /inquiry/:slug | 29.7 / 41.2 / 48.6 | 0.3 / 0.6 / 0.8 | 0.3 / 0.6 / 0.7 | 72.2 → 21.2 → 20.4 | 94 KB → 94 KB | 28.1 → 0 → 0 | 65.4 → 23.1 |
| PAGE /categories | 0.3 / 0.5 / 0.7 | 0.1 / 0.3 / 0.5 | 0.1 / 0.3 / 0.4 | 35.8 → 22.9 → 23.3 | 154 KB → 151 KB | 0 → 0 → 0 | 26.1 → 17.2 |
| PAGE /categories/:slug | 13 / 22.8 / 27.6 | 0.3 / 0.6 / 0.9 | 0.3 / 0.5 / 0.7 | 93.8 → 33.8 → 34.5 | 250 KB → 250 KB | 0 → 0 → 0 | 100.6 → 35.4 |

## Under concurrency (throughput and tail latency)

| Route | concurrent | req/s before → after | server p95 ms before → after | client p95 ms before → after |
|---|---:|---:|---:|---:|
| GET /api/public/products (page 1, limit 20) | 10 | 66.7 → 96.1 | 122.3 → 572.5 | 200.7 → 577.8 |
| GET /api/public/products (page 1, limit 20) | 50 | 63.9 → 130.9 | 672.7 → 476.5 | 861.2 → 506.8 |
| GET /api/public/products (deep page 500) | 10 | 71.2 → 219.6 | 133 → 45.5 | 198.4 → 54.2 |
| GET /api/public/products (deep page 500) | 50 | 75 → 135.8 | 516.9 → 892.7 | 747.2 → 900.4 |
| GET /api/public/products (text search) | 10 | 49.8 → 130.9 | 184.2 → 113.5 | 232.5 → 117.2 |
| GET /api/public/products (text search) | 50 | 47.7 → 245 | 855.3 → 503.6 | 1324.9 → 509.2 |
| GET /api/public/products (sort price) | 10 | 52.7 → 114.9 | 174.4 → 79.7 | 229.2 → 161.8 |
| GET /api/public/products (sort price) | 50 | 55.3 → 115.8 | 732.4 → 478.9 | 957.1 → 541.3 |
| GET /api/public/products/suggest | 10 | 142 → 107.3 | 42.5 → 167 | 50.8 → 226.9 |
| GET /api/public/products/suggest | 50 | 131 → 140.2 | 758.2 → 673.2 | 791.1 → 724.1 |
| GET /api/public/products/:slug (sample) | 10 | 136.1 → 130.2 | 75.4 → 51.8 | 83.3 → 60.4 |
| GET /api/public/products/:slug (sample) | 50 | 259.8 → 136.3 | 436.4 → 790.7 | 448.8 → 821.8 |
| GET /api/public/suppliers (directory) | 10 | 139.7 → 118.5 | 46.1 → 55.7 | 57.9 → 79.3 |
| GET /api/public/suppliers (directory) | 50 | 136 → 116.2 | 586.1 → 834.3 | 673.9 → 901.1 |
| GET /api/public/suppliers/:slug/products (merged) | 10 | 137.6 → 133 | 50.3 → 59 | 64.3 → 70.8 |
| GET /api/public/suppliers/:slug/products (merged) | 50 | 128.7 → 129.9 | 837.2 → 830.5 | 861.2 → 865.8 |
| GET /api/public/suppliers/:slug/products (catalogue) | 10 | 110.6 → 135.5 | 77.5 → 51 | 92.6 → 71.1 |
| GET /api/public/suppliers/:slug/products (catalogue) | 50 | 111.3 → 135.6 | 343.9 → 682.5 | 490.8 → 743.2 |
| GET /api/public/suppliers/:slug/reviews/summary | 10 | 59.6 → 115.1 | 699.8 → 205.8 | 703.4 → 211.7 |
| GET /api/public/suppliers/:slug/reviews/summary | 50 | 56.9 → 148.6 | 1241.5 → 823.6 | 1256.6 → 838.2 |
| PAGE /products | 10 | 3.1 → 72.3 | 109.6 → 0.2 | 8313.6 → 163.6 |
| PAGE /products | 50 | 7.5 → 71.2 | 111.5 → 0.2 | 12205.2 → 728 |
| PAGE /products?page=500 | 10 | 3.2 → 76.3 | 134.9 → 0.2 | 5120 → 137.5 |
| PAGE /products?page=500 | 50 | 9.1 → 68.1 | 46.5 → 0.2 | 7735.7 → 784.5 |
| PAGE /search?q=shirt | 10 | 16.8 → 74.9 | 48.2 → 0.6 | 813.9 → 158.3 |
| PAGE /search?q=shirt | 50 | 8 → 46.7 | 118.8 → 0.9 | 9684.5 → 1445.5 |
| PAGE /products/:slug (sample) | 10 | 26.4 → 97.6 | 2 → 0.4 | 457 → 116.6 |
| PAGE /products/:slug (sample) | 50 | 41.3 → 86.3 | 1.1 → 0.5 | 1353.1 → 681.9 |
| PAGE /products/:slug (catalogue) | 10 | 16.2 → 103.6 | 3.1 → 0.5 | 1093.5 → 114 |
| PAGE /products/:slug (catalogue) | 50 | 32.6 → 81.5 | 1.6 → 1 | 1653 → 955.9 |

The full step-by-step tables are in API_LOAD_TEST_REPORT.md.
