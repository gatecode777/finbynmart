# API load test report

Tool: `docs/performance/tools/bench.mjs` (a small Node load generator; k6 and autocannon are not installed in this project and adding a dependency was not needed). Concurrency steps 1, 5, 10, 25 and 50, 200 requests (at least 4 per virtual user) per step, after 3 warm-up requests, GET requests only, against the throwaway database. No destructive test was run and nothing touched live data.

## Environment

Node v26.5.0; win32 10.0.26300; 8 logical CPUs (13th Gen Intel(R) Core(TM) i3-1315U); 8 GB RAM; MongoDB Atlas reached over the internet (one database round trip from this machine measures about 30 ms, which is part of every figure below that includes the database); production build (`next build` + `next start`), not the dev server.

CPU and memory of the server process were not sampled separately; the signs of CPU saturation below are inferred from requests per second flattening while latency grows with the page's own work staying small, which is stated where it matters. Database resource usage on Atlas was not available (no Atlas metrics access): the database column is the round-trip time the application observed.

Error and timeout rates: every request in every step below returned a success status (0 errors, 0 timeouts) unless a row says otherwise.

## Before optimisation (baseline build, every request from a different client address)

**GET /api/public/products (page 1, limit 20)** (undefined, target p95 < undefined ms; cold 425.2 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 15.3 | 0 | 51 | 70.5 | 85.5 | 64.4 | 84 | 127.6 | 31.6 |
| 5 | 36.4 | 0 | 75.8 | 196.6 | 328.3 | 115.4 | 314.8 | 472 | 59.6 |
| 10 | 66.7 | 0 | 81.9 | 122.3 | 554.5 | 140.5 | 200.7 | 568.3 | 70.6 |
| 25 | 69.1 | 0 | 200.4 | 300.6 | 1301.4 | 314.9 | 441.5 | 1317.7 | 189.2 |
| 50 | 63.9 | 0 | 523 | 672.7 | 1643.8 | 701.5 | 861.2 | 1860.4 | 507.1 |

**GET /api/public/products (deep page 500)** (undefined, target p95 < undefined ms; cold 52.6 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 18.9 | 0 | 40.9 | 50.3 | 61.9 | 50 | 63.6 | 70 | 30.4 |
| 5 | 51.5 | 0 | 58.8 | 101.5 | 138.4 | 87.3 | 151.8 | 172 | 47.9 |
| 10 | 71.2 | 0 | 80.8 | 133 | 171.2 | 133.1 | 198.4 | 244.2 | 69.2 |
| 25 | 73.7 | 0 | 171.5 | 300 | 337.7 | 304.3 | 449.6 | 460.3 | 160.5 |
| 50 | 75 | 0 | 412 | 516.9 | 602.9 | 645.6 | 747.2 | 752.3 | 401.9 |

**GET /api/public/products (text search)** (undefined, target p95 < undefined ms; cold 59.5 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 18.6 | 0 | 45.1 | 50.1 | 59.3 | 51.2 | 66.5 | 71.9 | 30.1 |
| 5 | 44.1 | 0 | 75.8 | 106.7 | 121.2 | 113 | 133.2 | 147.7 | 59.9 |
| 10 | 49.8 | 0 | 117.8 | 184.2 | 193.6 | 199.8 | 232.5 | 248.5 | 103.1 |
| 25 | 52.4 | 0 | 250.6 | 402.4 | 440.7 | 461.6 | 531.8 | 551.6 | 233.9 |
| 50 | 47.7 | 0 | 603.4 | 855.3 | 874.9 | 961 | 1324.9 | 1331.8 | 586.5 |

**GET /api/public/products (sort price)** (undefined, target p95 < undefined ms; cold 49.3 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 16.6 | 0 | 49 | 62.5 | 67.3 | 60 | 76.9 | 80.7 | 30.4 |
| 5 | 39.7 | 0 | 80 | 118.7 | 141.7 | 120 | 162.1 | 186.6 | 62.6 |
| 10 | 52.7 | 0 | 105.7 | 174.4 | 209.8 | 183.2 | 229.2 | 281.6 | 90.3 |
| 25 | 57.4 | 0 | 226.2 | 350.3 | 376.6 | 434 | 455.1 | 469.8 | 209.9 |
| 50 | 55.3 | 0 | 557 | 732.4 | 874.1 | 902.7 | 957.1 | 960.8 | 541.7 |

**GET /api/public/products/suggest** (undefined, target p95 < undefined ms; cold 50.1 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 23.3 | 0 | 30.9 | 34.7 | 43.4 | 44.7 | 52.6 | 58.8 | 29.9 |
| 5 | 112.1 | 0 | 31.3 | 38.7 | 244.2 | 37.9 | 50.9 | 249.4 | 30.4 |
| 10 | 142 | 0 | 32.4 | 42.5 | 651 | 38.8 | 50.8 | 655.8 | 31.5 |
| 25 | 143.6 | 0 | 46.2 | 789.2 | 796.2 | 60.3 | 799.2 | 812.3 | 45.4 |
| 50 | 131 | 0 | 188.3 | 758.2 | 788.1 | 204.6 | 791.1 | 841.5 | 187.5 |

**GET /api/public/products/:slug (sample)** (undefined, target p95 < undefined ms; cold 82.7 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 23.7 | 0 | 30.6 | 38.1 | 43.6 | 41.7 | 52.7 | 61.1 | 30.1 |
| 5 | 113.6 | 0 | 30.8 | 40.4 | 229.1 | 37.1 | 50.1 | 236.8 | 30.2 |
| 10 | 136.1 | 0 | 32.1 | 75.4 | 628.2 | 41 | 83.3 | 634.3 | 31.7 |
| 25 | 128.1 | 0 | 45.4 | 308.8 | 330.1 | 62.6 | 325 | 348.9 | 45.1 |
| 50 | 259.8 | 0 | 84.3 | 436.4 | 455 | 102.7 | 448.8 | 464.3 | 84 |

**GET /api/public/suppliers (directory)** (undefined, target p95 < undefined ms; cold 49.9 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 22.2 | 0 | 32.6 | 39 | 47.4 | 46.6 | 52.6 | 58.5 | 30.2 |
| 5 | 109 | 0 | 32 | 53.1 | 216.4 | 39.8 | 62.6 | 226.3 | 30.3 |
| 10 | 139.7 | 0 | 33.3 | 46.1 | 623.3 | 40.7 | 57.9 | 631.2 | 31.8 |
| 25 | 131 | 0 | 68.5 | 635.5 | 663.1 | 104.2 | 656.2 | 696.6 | 66.6 |
| 50 | 136 | 0 | 201.9 | 586.1 | 623.7 | 286.6 | 673.9 | 711.1 | 199.4 |

**GET /api/public/suppliers/:slug/products (merged)** (undefined, target p95 < undefined ms; cold 49.8 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 22.1 | 0 | 31.6 | 40 | 49.3 | 46.5 | 55.2 | 59.1 | 30.6 |
| 5 | 110.9 | 0 | 30.6 | 38.7 | 246 | 37.3 | 49.7 | 250.4 | 30 |
| 10 | 137.6 | 0 | 33.1 | 50.3 | 634.4 | 40.7 | 64.3 | 645.2 | 32.6 |
| 25 | 150.5 | 0 | 42.2 | 808.7 | 820.1 | 53.5 | 817.9 | 834.8 | 41.7 |
| 50 | 128.7 | 0 | 122.9 | 837.2 | 852.2 | 142.4 | 861.2 | 887.4 | 122.4 |

**GET /api/public/suppliers/:slug/products (catalogue)** (undefined, target p95 < undefined ms; cold 45.9 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 20.7 | 0 | 36.2 | 39 | 42.1 | 49.3 | 54 | 57.7 | 30.1 |
| 5 | 84.6 | 0 | 41.9 | 53.1 | 107.3 | 57.4 | 68.2 | 127.9 | 36.1 |
| 10 | 110.6 | 0 | 53.7 | 77.5 | 255.7 | 80.2 | 92.6 | 280.8 | 48.5 |
| 25 | 123 | 0 | 113.2 | 258.5 | 319 | 188.3 | 309.4 | 409.3 | 107.9 |
| 50 | 111.3 | 0 | 284.9 | 343.9 | 370.6 | 433.3 | 490.8 | 512.4 | 278.2 |

**GET /api/public/suppliers/:slug/reviews/summary** (undefined, target p95 < undefined ms; cold 80.5 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 13.3 | 0 | 61.2 | 81.6 | 127 | 71.5 | 97.9 | 132.3 | 59.7 |
| 5 | 54.3 | 0 | 61.3 | 317 | 349.3 | 70.5 | 323 | 356.3 | 60.4 |
| 10 | 59.6 | 0 | 64.4 | 699.8 | 708.8 | 73.4 | 703.4 | 715.7 | 63.7 |
| 25 | 59.2 | 0 | 122.7 | 862.8 | 880.4 | 148.1 | 879.9 | 896.2 | 121.9 |
| 50 | 56.9 | 0 | 689.8 | 1241.5 | 1255.6 | 747 | 1256.6 | 1284.4 | 688.7 |

**PAGE /products** (undefined, target p95 < undefined ms; cold 116.3 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 12 | 0 | 18.2 | 30.5 | 35.7 | 69.6 | 175.5 | 293.3 | 0 |
| 5 | 8.9 | 0 | 26.8 | 55.3 | 97.2 | 487.9 | 1182.4 | 1783.4 | 0 |
| 10 | 3.1 | 0 | 40.7 | 109.6 | 381.7 | 1898.1 | 8313.6 | 19164.3 | 0 |
| 25 | 5.4 | 0 | 38.9 | 128.2 | 224.2 | 4823.2 | 8798.7 | 8887.3 | 0 |
| 50 | 7.5 | 0 | 25.3 | 111.5 | 171.8 | 4689.7 | 12205.2 | 12255.3 | 0 |

**PAGE /products?page=500** (undefined, target p95 < undefined ms; cold 190.2 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 3.8 | 0 | 54.1 | 140.8 | 302 | 193.7 | 586.3 | 1167.2 | 0 |
| 5 | 4 | 0 | 56.8 | 120.9 | 241 | 1090.3 | 2323.9 | 5086.1 | 0 |
| 10 | 3.2 | 0 | 66.4 | 134.9 | 156 | 2974.3 | 5120 | 5268.9 | 0 |
| 25 | 3.2 | 0 | 47.3 | 112 | 142.8 | 6624.4 | 23691.3 | 23792.9 | 0 |
| 50 | 9.1 | 0 | 27.1 | 46.5 | 99.6 | 5015.4 | 7735.7 | 7779.8 | 0 |

**PAGE /search?q=shirt** (undefined, target p95 < undefined ms; cold 138.4 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 14.2 | 0 | 29.6 | 48.7 | 54 | 66.7 | 104.3 | 108.5 | 0 |
| 5 | 13.3 | 0 | 35.8 | 55.1 | 63.7 | 374.9 | 523.9 | 560.8 | 0 |
| 10 | 16.8 | 0 | 28.7 | 48.2 | 52.8 | 549.5 | 813.9 | 840.1 | 0 |
| 25 | 13.8 | 0 | 34.8 | 58.9 | 65.7 | 1714 | 2510.9 | 2546 | 0 |
| 50 | 8 | 0 | 46.7 | 118.8 | 155.8 | 4305.3 | 9684.5 | 9736.2 | 0 |

**PAGE /products/:slug (sample)** (undefined, target p95 < undefined ms; cold 68.4 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 19.5 | 0 | 0.9 | 2 | 3.5 | 49.3 | 80.2 | 94.8 | 0 |
| 5 | 22.6 | 0 | 0.9 | 2.1 | 3.8 | 210.7 | 307.8 | 370.1 | 0 |
| 10 | 26.4 | 0 | 0.8 | 2 | 2.4 | 370.3 | 457 | 511.4 | 0 |
| 25 | 32.5 | 0 | 0.6 | 1.5 | 2.1 | 734.2 | 983 | 988.6 | 0 |
| 50 | 41.3 | 0 | 0.5 | 1.1 | 1.3 | 1099.9 | 1353.1 | 1368.3 | 0 |

**PAGE /products/:slug (catalogue)** (undefined, target p95 < undefined ms; cold 47.1 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 19.8 | 0 | 0.9 | 3.4 | 5.4 | 42.5 | 102.6 | 186.7 | 0 |
| 5 | 16.2 | 0 | 1.2 | 4.7 | 6.9 | 281 | 555.1 | 799 | 0 |
| 10 | 16.2 | 0 | 1.2 | 3.1 | 5.2 | 445.1 | 1093.5 | 1910.9 | 0 |
| 25 | 16.9 | 0 | 1.3 | 3.5 | 14.7 | 1329.1 | 2236.3 | 2282.8 | 0 |
| 50 | 32.6 | 0 | 0.6 | 1.6 | 2 | 1534.3 | 1653 | 1678.7 | 0 |


## After optimisation (same routes, same method, every request from a different client address)

**GET /api/public/products (page 1, limit 20)** (paginated listing, target p95 < 400 ms; cold 90.5 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 21.4 | 0 | 32.4 | 41.8 | 54.2 | 47 | 57.1 | 67.3 | 31.4 |
| 5 | 91.9 | 0 | 31.7 | 57.2 | 290.3 | 40.5 | 62.4 | 300.3 | 31.1 |
| 10 | 96.1 | 0 | 32.6 | 572.5 | 671.7 | 41 | 577.8 | 678.6 | 32.1 |
| 25 | 120.8 | 0 | 60.9 | 822.8 | 846.7 | 69 | 829.8 | 850.6 | 60.6 |
| 50 | 130.9 | 0 | 96.7 | 476.5 | 872.8 | 111 | 506.8 | 888.6 | 96.4 |

**GET /api/public/products (deep page 500)** (paginated listing, target p95 < 400 ms; cold 49.4 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 22 | 0 | 32.4 | 37.1 | 45.1 | 47 | 52.2 | 55.8 | 31.4 |
| 5 | 95.7 | 0 | 31.4 | 40.7 | 291.7 | 38.7 | 54.4 | 300.3 | 30.9 |
| 10 | 219.6 | 0 | 32.1 | 45.5 | 156.1 | 38.4 | 54.2 | 161.1 | 31.8 |
| 25 | 135.9 | 0 | 37.4 | 940 | 947.6 | 46.9 | 945 | 954.5 | 37.1 |
| 50 | 135.8 | 0 | 107.9 | 892.7 | 896.7 | 122 | 900.4 | 905.1 | 107.6 |

**GET /api/public/products (text search)** (search, target p95 < 500 ms; cold 47.8 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 21.1 | 0 | 32.3 | 42.3 | 49.5 | 47.5 | 57.3 | 65.8 | 31.3 |
| 5 | 110.2 | 0 | 31.4 | 44.1 | 146.4 | 39.5 | 55.9 | 153.4 | 30.9 |
| 10 | 130.9 | 0 | 31.4 | 113.5 | 698.4 | 38.9 | 117.2 | 706.7 | 31.1 |
| 25 | 138.5 | 0 | 37.2 | 405.5 | 708.5 | 50.1 | 410.5 | 714.5 | 37 |
| 50 | 245 | 0 | 75 | 503.6 | 508 | 90.4 | 509.2 | 513.1 | 74.7 |

**GET /api/public/products (sort price)** (filtered catalogue, target p95 < 500 ms; cold 46.6 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 21.5 | 0 | 32.4 | 44 | 69.4 | 45.2 | 63.8 | 112.8 | 31.4 |
| 5 | 107.2 | 0 | 33.2 | 43.6 | 115 | 44 | 58.3 | 122.8 | 32 |
| 10 | 114.9 | 0 | 43.5 | 79.7 | 523.4 | 58.3 | 161.8 | 532.4 | 42.6 |
| 25 | 141.5 | 0 | 80.5 | 440.5 | 476.7 | 133.9 | 499.8 | 550.2 | 79.9 |
| 50 | 115.8 | 0 | 212.6 | 478.9 | 507.5 | 324.4 | 541.3 | 630 | 212 |

**GET /api/public/products/suggest** (simple read, target p95 < 300 ms; cold 47.6 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 22.3 | 0 | 32.9 | 40.8 | 46.1 | 44.4 | 53 | 59.4 | 30.9 |
| 5 | 100.4 | 0 | 33.5 | 51.3 | 165.5 | 44.4 | 67.4 | 171.2 | 31.9 |
| 10 | 107.3 | 0 | 39.2 | 167 | 565.7 | 55.9 | 226.9 | 576.6 | 37.4 |
| 25 | 139.1 | 0 | 71.9 | 605.7 | 635.8 | 117.9 | 627.3 | 670.2 | 70.3 |
| 50 | 140.2 | 0 | 174.8 | 673.2 | 677 | 232.9 | 724.1 | 749.4 | 173.8 |

**GET /api/public/products/:slug (sample)** (detail, target p95 < 350 ms; cold 53.2 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 22.2 | 0 | 32.2 | 35.6 | 41.6 | 46.2 | 53.2 | 56 | 30.9 |
| 5 | 108.8 | 0 | 31.3 | 37.3 | 208.7 | 40.7 | 51.6 | 214.7 | 30.5 |
| 10 | 130.2 | 0 | 32.9 | 51.8 | 708.4 | 42 | 60.4 | 717.8 | 32.2 |
| 25 | 145.9 | 0 | 54.7 | 681 | 694.2 | 88.4 | 706.5 | 720.8 | 54.2 |
| 50 | 136.3 | 0 | 153.3 | 790.7 | 804.8 | 189.8 | 821.8 | 846.4 | 152.9 |

**GET /api/public/suppliers (directory)** (paginated listing, target p95 < 400 ms; cold 55.2 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 20.7 | 0 | 36.3 | 42.7 | 54.6 | 47.5 | 59.3 | 69.9 | 31.5 |
| 5 | 98.8 | 0 | 36.9 | 46.3 | 51.9 | 49.6 | 62.2 | 65.1 | 33.4 |
| 10 | 118.5 | 0 | 41.3 | 55.7 | 557.1 | 57.4 | 79.3 | 569.9 | 38.2 |
| 25 | 123.6 | 0 | 84.1 | 575.6 | 594.2 | 145.7 | 608.2 | 654.7 | 81.4 |
| 50 | 116.2 | 0 | 197 | 834.3 | 857.5 | 281.8 | 901.1 | 951.3 | 194 |

**GET /api/public/suppliers/:slug/products (merged)** (paginated listing, target p95 < 400 ms; cold 55.6 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 21.1 | 0 | 33.3 | 42.8 | 55 | 47.3 | 58.3 | 71 | 31.8 |
| 5 | 108.8 | 0 | 32.4 | 37.3 | 163.9 | 41.8 | 51.3 | 173.4 | 31.3 |
| 10 | 133 | 0 | 34.3 | 59 | 612.5 | 45.4 | 70.8 | 619.2 | 33.7 |
| 25 | 138.7 | 0 | 57.8 | 756.8 | 763.6 | 86.6 | 777.4 | 793.2 | 57 |
| 50 | 129.9 | 0 | 138.2 | 830.5 | 851.3 | 168.3 | 865.8 | 880.5 | 137.7 |

**GET /api/public/suppliers/:slug/products (catalogue)** (paginated listing, target p95 < 400 ms; cold 70.9 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 22.2 | 0 | 32.7 | 41 | 47.1 | 44.9 | 55.1 | 59.7 | 31.6 |
| 5 | 104.7 | 0 | 34 | 52.5 | 71.3 | 44.2 | 70.1 | 99.4 | 33.1 |
| 10 | 135.5 | 0 | 34 | 51 | 607.5 | 43 | 71.1 | 616 | 33.5 |
| 25 | 139.7 | 0 | 48.6 | 810.4 | 825.4 | 69.3 | 830.8 | 841.9 | 48.4 |
| 50 | 135.6 | 0 | 170.6 | 682.5 | 740.8 | 220.6 | 743.2 | 793.4 | 170 |

**GET /api/public/suppliers/:slug/reviews/summary** (simple read, target p95 < 300 ms; cold 81.7 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 22.4 | 0 | 32 | 38 | 43.4 | 43.4 | 54.4 | 59 | 31 |
| 5 | 106.5 | 0 | 33.5 | 49.5 | 139.5 | 43.4 | 56.9 | 143.9 | 32.8 |
| 10 | 115.1 | 0 | 42.1 | 205.8 | 605.3 | 50.7 | 211.7 | 611.3 | 41.7 |
| 25 | 135.3 | 0 | 60 | 845.9 | 859.3 | 77.7 | 852.7 | 876.2 | 59.5 |
| 50 | 148.6 | 0 | 163.9 | 823.6 | 851.1 | 178.7 | 838.2 | 856.8 | 163.5 |

**PAGE /products** (paginated listing, target p95 < 400 ms; cold 57.3 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 46.2 | 0 | 0.1 | 0.3 | 0.4 | 17.8 | 33.6 | 37.8 | 0 |
| 5 | 72.2 | 0 | 0.1 | 0.2 | 0.2 | 68.2 | 78.7 | 87.5 | 0 |
| 10 | 72.3 | 0 | 0.1 | 0.2 | 0.4 | 134.7 | 163.6 | 187.1 | 0 |
| 25 | 70.6 | 0 | 0.1 | 0.2 | 0.2 | 346.3 | 401.6 | 408.1 | 0 |
| 50 | 71.2 | 0 | 0.1 | 0.2 | 0.3 | 697.3 | 728 | 763 | 0 |

**PAGE /products?page=500** (paginated listing, target p95 < 400 ms; cold 32.9 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 53.7 | 0 | 0.1 | 0.2 | 0.3 | 16.6 | 30.1 | 32.6 | 0 |
| 5 | 74.1 | 0 | 0.1 | 0.2 | 0.3 | 67.1 | 72.2 | 74 | 0 |
| 10 | 76.3 | 0 | 0.1 | 0.2 | 0.4 | 129.7 | 137.5 | 140.3 | 0 |
| 25 | 72 | 0 | 0.1 | 0.2 | 0.4 | 337.3 | 378.2 | 381.9 | 0 |
| 50 | 68.1 | 0 | 0.1 | 0.2 | 0.3 | 716.4 | 784.5 | 794.1 | 0 |

**PAGE /search?q=shirt** (search, target p95 < 500 ms; cold 47.6 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 57.7 | 0 | 0.3 | 0.6 | 0.7 | 16.3 | 25.8 | 28.5 | 0 |
| 5 | 45.4 | 0 | 0.3 | 1.1 | 2.6 | 60.4 | 352.8 | 517.4 | 0 |
| 10 | 74.9 | 0 | 0.3 | 0.6 | 0.9 | 131.1 | 158.3 | 176.9 | 0 |
| 25 | 57.4 | 0 | 0.3 | 0.8 | 1.6 | 423.1 | 564.5 | 569.3 | 0 |
| 50 | 46.7 | 0 | 0.4 | 0.9 | 1.2 | 986.5 | 1445.5 | 1478.1 | 0 |

**PAGE /products/:slug (sample)** (detail, target p95 < 350 ms; cold 15.2 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 44.8 | 0 | 0.4 | 0.9 | 1.3 | 19.8 | 36.5 | 46.4 | 0 |
| 5 | 83.8 | 0 | 0.3 | 0.5 | 0.9 | 54.6 | 92.8 | 141.2 | 0 |
| 10 | 97.6 | 0 | 0.3 | 0.4 | 0.6 | 100.1 | 116.6 | 121.5 | 0 |
| 25 | 94.7 | 0 | 0.2 | 0.4 | 0.6 | 266.9 | 299.4 | 312.5 | 0 |
| 50 | 86.3 | 0 | 0.2 | 0.5 | 0.7 | 510.3 | 681.9 | 761 | 0 |

**PAGE /products/:slug (catalogue)** (detail, target p95 < 350 ms; cold 25.1 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 57.4 | 0 | 0.3 | 0.6 | 1 | 16.7 | 26 | 29.1 | 0 |
| 5 | 108.7 | 0 | 0.3 | 0.4 | 0.8 | 44.6 | 55 | 60.5 | 0 |
| 10 | 103.6 | 0 | 0.3 | 0.5 | 0.8 | 94.8 | 114 | 116.2 | 0 |
| 25 | 104.3 | 0 | 0.2 | 0.6 | 0.7 | 215.8 | 390.3 | 393.7 | 0 |
| 50 | 81.5 | 0 | 0.3 | 1 | 2 | 483.5 | 955.9 | 972.6 | 0 |


## After optimisation, 40 steady client addresses (what repeat visitors look like)

**GET /api/public/products (page 1, limit 20)** (paginated listing, target p95 < 400 ms; cold 413.1 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 58.3 | 0 | 0.6 | 35.8 | 37.7 | 13.8 | 48 | 52.7 | 0 |
| 5 | 372.3 | 0 | 0.3 | 0.6 | 57.5 | 7.5 | 13.5 | 63.5 | 0 |
| 10 | 380.6 | 0 | 0.2 | 87.6 | 231.7 | 10.5 | 96.6 | 239.7 | 0 |
| 25 | 667.9 | 0 | 0.2 | 0.4 | 30.6 | 32.2 | 36.1 | 62.9 | 0 |
| 50 | 347.2 | 0 | 0.3 | 265.2 | 359.3 | 22.9 | 273.3 | 379.8 | 0 |

**GET /api/public/products (deep page 500)** (paginated listing, target p95 < 400 ms; cold 19.7 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 69.9 | 0 | 0.5 | 0.9 | 31.1 | 15.9 | 18.9 | 46.2 | 0 |
| 5 | 394.1 | 0 | 0.2 | 32.5 | 36.4 | 6 | 42.9 | 48.5 | 0 |
| 10 | 652.6 | 0 | 0.2 | 0.5 | 30.7 | 13.7 | 18.5 | 45.6 | 0 |
| 25 | 423.5 | 0 | 0.2 | 69.3 | 77.6 | 31.5 | 82.6 | 93 | 0 |
| 50 | 693.7 | 0 | 0.2 | 0.5 | 30.3 | 60.5 | 70.2 | 95.7 | 0 |

**GET /api/public/products (text search)** (search, target p95 < 500 ms; cold 23.4 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 50.2 | 0 | 0.5 | 34.1 | 42.9 | 16.2 | 48.2 | 55.6 | 0 |
| 5 | 458.1 | 0 | 0.3 | 0.7 | 32 | 9.2 | 16.9 | 44.4 | 0 |
| 10 | 384.7 | 0 | 0.3 | 35.4 | 38.7 | 20.3 | 48.6 | 75.5 | 0 |
| 25 | 638.3 | 0 | 0.2 | 0.5 | 30.3 | 31.7 | 52.3 | 75.3 | 0 |
| 50 | 317.4 | 0 | 0.3 | 122.1 | 137.1 | 100.4 | 191.6 | 205.5 | 0 |

**GET /api/public/products (sort price)** (filtered catalogue, target p95 < 500 ms; cold 35.3 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 72.3 | 0 | 0.4 | 0.9 | 36 | 15.1 | 19.1 | 47.9 | 0 |
| 5 | 192.7 | 1 | 0.2 | 38.2 | 547.3 | 6.4 | 47.9 | 551.8 | 0 |
| 10 | 603.2 | 5 | 0.2 | 1.5 | 40.2 | 12.9 | 26.7 | 53.2 | 0 |
| 25 | 412.6 | 11 | 0.2 | 63.8 | 73.5 | 30.3 | 88.3 | 99.3 | 0 |
| 50 | 421 | 35 | 0.2 | 73 | 83.2 | 49.7 | 125.1 | 131.2 | 0 |

**GET /api/public/products/suggest** (simple read, target p95 < 300 ms; cold 49.3 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 36 | 0 | 1.4 | 44.5 | 61 | 16.7 | 55.4 | 76.9 | 0 |
| 5 | 413.3 | 0 | 0.8 | 1.4 | 2 | 11.6 | 17.9 | 19.1 | 0 |
| 10 | 594.3 | 0 | 0.5 | 0.9 | 1.5 | 16.4 | 21.7 | 23.6 | 0 |
| 25 | 361.9 | 0 | 0.7 | 2 | 2.6 | 51.4 | 128.3 | 136.9 | 0 |
| 50 | 463.3 | 0 | 0.7 | 167.7 | 197.3 | 58.4 | 189.8 | 211.1 | 0 |

**GET /api/public/products/:slug (sample)** (detail, target p95 < 350 ms; cold 47.1 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 52.4 | 0 | 0.4 | 33.6 | 44.9 | 15.9 | 47.3 | 56.6 | 0 |
| 5 | 442.9 | 0 | 0.3 | 0.5 | 30.8 | 10.4 | 14.1 | 37.6 | 0 |
| 10 | 613.3 | 0 | 0.2 | 37.6 | 42 | 9.9 | 45.7 | 52.9 | 0 |
| 25 | 735 | 0 | 0.2 | 0.3 | 38.2 | 27.6 | 36.9 | 62.9 | 0 |
| 50 | 364.5 | 0 | 0.4 | 185.1 | 193.1 | 123.8 | 241.2 | 253.5 | 0 |

**GET /api/public/suppliers (directory)** (paginated listing, target p95 < 400 ms; cold 56.7 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 49.2 | 0 | 2 | 34.3 | 36.7 | 16.1 | 49.4 | 51 | 0 |
| 5 | 226.8 | 0 | 1.7 | 3.4 | 34.2 | 18.2 | 37.3 | 57.5 | 0 |
| 10 | 259.4 | 0 | 1.6 | 60.2 | 68.4 | 32.8 | 81.6 | 90.5 | 0 |
| 25 | 276.6 | 0 | 1.5 | 2.9 | 32.5 | 83.8 | 99.1 | 118.8 | 0 |
| 50 | 248.5 | 0 | 1.8 | 278 | 338 | 161.4 | 353.7 | 414.6 | 0 |

**GET /api/public/suppliers/:slug/products (merged)** (paginated listing, target p95 < 400 ms; cold 8.9 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 81.1 | 0 | 0.5 | 1.2 | 34.9 | 10.7 | 18.5 | 49.9 | 0 |
| 5 | 362.4 | 0 | 0.2 | 36.3 | 39.9 | 7.5 | 45.8 | 55.3 | 0 |
| 10 | 489.7 | 0 | 0.3 | 0.6 | 32.5 | 18.3 | 32.9 | 46 | 0 |
| 25 | 570.7 | 0 | 0.2 | 60.5 | 62 | 34.2 | 84.6 | 90.5 | 0 |
| 50 | 177.7 | 0 | 0.5 | 2.2 | 36.4 | 206 | 433.7 | 455.3 | 0 |

**GET /api/public/suppliers/:slug/products (catalogue)** (paginated listing, target p95 < 400 ms; cold 13.9 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 52.9 | 0 | 0.5 | 33.4 | 39.6 | 15.5 | 47.6 | 54.1 | 0 |
| 5 | 361.5 | 0 | 0.3 | 0.6 | 37.1 | 13.6 | 17.3 | 50.1 | 0 |
| 10 | 242.9 | 0 | 0.4 | 61.2 | 220.6 | 25.7 | 140.6 | 243.4 | 0 |
| 25 | 250 | 0 | 0.4 | 0.8 | 36.6 | 77.5 | 201.9 | 231.6 | 0 |
| 50 | 322.9 | 0 | 0.4 | 164.9 | 173.7 | 116.2 | 268.5 | 291.2 | 0 |

**GET /api/public/suppliers/:slug/reviews/summary** (simple read, target p95 < 300 ms; cold 107.7 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 49.9 | 0 | 0.5 | 35.5 | 44.9 | 15.8 | 50.7 | 60.8 | 0 |
| 5 | 386.7 | 0 | 0.3 | 0.6 | 40.4 | 10.8 | 20 | 56.7 | 0 |
| 10 | 309 | 0 | 0.3 | 44.7 | 50.2 | 26.8 | 63.8 | 84.2 | 0 |
| 25 | 349.6 | 0 | 0.4 | 0.6 | 37.3 | 58.1 | 93.5 | 116.9 | 0 |
| 50 | 302.9 | 0 | 0.4 | 181.1 | 203.5 | 101.1 | 313.5 | 366.7 | 0 |

**PAGE /products** (paginated listing, target p95 < 400 ms; cold 59.8 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 24.2 | 0 | 0.4 | 0.6 | 0.9 | 42.2 | 53.5 | 55.7 | 0 |
| 5 | 32.5 | 0 | 0.3 | 0.5 | 0.6 | 156.2 | 185.9 | 203.7 | 0 |
| 10 | 33.5 | 0 | 0.3 | 0.5 | 0.9 | 281.8 | 372.5 | 559.5 | 0 |
| 25 | 32.9 | 0 | 0.3 | 0.4 | 0.6 | 750.6 | 804.4 | 810.9 | 0 |
| 50 | 41.8 | 0 | 0.2 | 0.3 | 0.5 | 1172.2 | 1307 | 1325.5 | 0 |

**PAGE /products?page=500** (paginated listing, target p95 < 400 ms; cold 32.4 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 27.1 | 0 | 0.3 | 0.7 | 1.3 | 35.6 | 53.5 | 62.8 | 0 |
| 5 | 35.2 | 0 | 0.3 | 0.4 | 0.6 | 149.1 | 170.3 | 177.7 | 0 |
| 10 | 33.5 | 0 | 0.3 | 0.5 | 0.6 | 300.5 | 332.5 | 340.4 | 0 |
| 25 | 29.4 | 0 | 0.3 | 0.6 | 0.7 | 826.2 | 1010.8 | 1017.6 | 0 |
| 50 | 30.7 | 0 | 0.3 | 0.5 | 0.6 | 1633.1 | 1717.3 | 1744.6 | 0 |

**PAGE /search?q=shirt** (search, target p95 < 500 ms; cold 30.1 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 30.6 | 0 | 0.6 | 1.2 | 1.4 | 32.2 | 46.1 | 52.2 | 0 |
| 5 | 40 | 0 | 0.6 | 0.9 | 1.1 | 129.6 | 152.7 | 157.5 | 0 |
| 10 | 43.7 | 0 | 0.5 | 0.9 | 1.3 | 235.4 | 262.6 | 270.4 | 0 |
| 25 | 47.9 | 0 | 0.5 | 0.8 | 1.3 | 514.2 | 605.3 | 610.2 | 0 |
| 50 | 39.6 | 0 | 0.5 | 1 | 10.1 | 1200.3 | 1452.4 | 1457.8 | 0 |

**PAGE /products/:slug (sample)** (detail, target p95 < 350 ms; cold 28.9 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 34.1 | 0 | 0.6 | 1 | 1.3 | 29.2 | 43.1 | 50.3 | 0 |
| 5 | 50.3 | 0 | 0.5 | 0.9 | 1.3 | 100.5 | 125.8 | 132.8 | 0 |
| 10 | 50.8 | 0 | 0.5 | 0.8 | 0.9 | 197.7 | 225.5 | 236.9 | 0 |
| 25 | 50.7 | 0 | 0.5 | 0.9 | 1.2 | 478.7 | 666.8 | 669.3 | 0 |
| 50 | 47.5 | 0 | 0.5 | 0.9 | 1.2 | 993.2 | 1264.5 | 1269.7 | 0 |

**PAGE /products/:slug (catalogue)** (detail, target p95 < 350 ms; cold 28.7 ms)

| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 38.5 | 0 | 0.6 | 1.2 | 1.3 | 26.5 | 37.5 | 42.1 | 0 |
| 5 | 61.8 | 0 | 0.5 | 0.9 | 1 | 80.2 | 101.7 | 107.7 | 0 |
| 10 | 59.9 | 0 | 0.5 | 0.9 | 1.1 | 166.9 | 193 | 198.1 | 0 |
| 25 | 61.6 | 0 | 0.4 | 0.9 | 1 | 419.1 | 451.5 | 453.5 | 0 |
| 50 | 59.4 | 0 | 0.5 | 0.9 | 1 | 839.5 | 906.5 | 916.8 | 0 |

