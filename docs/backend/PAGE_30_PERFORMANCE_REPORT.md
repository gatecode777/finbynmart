# Page 30 — Performance report

Method: production build (`.next-audit`, port 3100), `FINBYN_PUBLIC_CACHE_MS=0`, MongoDB Atlas (remote cluster), throwaway database `finbynmart_test`, group P of `29-30-buyer-quotations-test.mjs`: 15 sequential requests per measure from the same machine, one run. Data for the perf buyer: 400 current quotations (plus a 20-version lineage). Other processes (the owner's `next dev`) were running, so these are indicative, not a benchmark.

| Measure | Target (p95) | Measured p50 / p95 (final run) | Result |
|---|---|---|---|
| List, 20 rows | < 400 ms | 83 / 92 ms | met |
| List filtered + searched, page 3 | < 500 ms | 77 / 122 ms | met |
| Detail, 20 versions | < 350 ms | 169 / 187 ms | met |
| Version history (`?version=7`) | < 300 ms | 168 / 203 ms | met |
| Compare 4 quotations | < 500 ms | 134 / 153 ms | met |
| Accept / reject (12 writes) | < 500 ms | 202 / 288 ms | met |

Earlier runs of the same suite during development gave comparable figures (list p95 89–130 ms, detail 185–197 ms, decide 208–288 ms).

Index use: `explain` of the default list query (buyerId, isCurrent, status ≠ DRAFT, sort sentAt desc, _id desc) shows an index scan with no collection scan and no blocking sort (check P-02). Payload: a 20-row list page is under 25 KB (P-03) and ten simultaneous requests all succeed.

Not measured: before/after comparison (new module, so there is no "before"), 10,000+ quotations per buyer, `explain` of the search ($regex, contains-match on product and supplier uses the buyer index plus a filter), Lighthouse, LCP/INP/CLS, behaviour on a deployed host. The tab-count aggregation reads every current quotation of the buyer; at a few hundred this is fast, at very large volumes it should be revisited.
