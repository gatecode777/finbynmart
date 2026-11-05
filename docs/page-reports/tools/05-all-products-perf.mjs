// Latency of GET /api/public/products and of the server-rendered /products page against a running `next start`.
// Sequential requests from one client on the same machine as the server (no network), against the 21,404-product catalog.
// The API allows 120 requests per minute per address, so 100 varied requests stay under the limit.
const BASE = process.env.BASE || "http://localhost:3100";
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
const stats = (ms) => { const s = [...ms].sort((a, b) => a - b); return { n: s.length, min: s[0].toFixed(0), p50: pct(s, 50).toFixed(0), p95: pct(s, 95).toFixed(0), max: s[s.length - 1].toFixed(0) }; };

const timed = async (url, expect = 200) => {
  const t = performance.now();
  const r = await fetch(url);
  await r.text();
  if (r.status !== expect) throw new Error(`${url} -> ${r.status}`);
  return performance.now() - t;
};

const queries = [
  "", "q=tshirt", "q=nike%20jersey", "q=air%20compressor", "category=apparel-fashion", "category=packaging-printing",
  "sub=men-tshirts", "state=Gujarat&category=apparel-fashion", "minPrice=500&maxPrice=1000", "sort=price-asc", "sort=price-desc&q=shirt",
  "colour=Blue&category=apparel-fashion&sort=price-asc", "limit=50", "page=500", "q=puma&state=Maharashtra", "department=Women",
];

console.log("cold start (first request builds the in-memory index):");
const cold = await timed(`${BASE}/api/public/products?limit=1`);
console.log(`  first API request: ${cold.toFixed(0)} ms`);

const api = [];
for (let i = 0; i < 100; i++) api.push(await timed(`${BASE}/api/public/products?${queries[i % queries.length]}`));
console.log("API GET /api/public/products, 100 varied requests (includes the MongoDB rate-limit round trip):", stats(api));

const page = [];
for (let i = 0; i < 100; i++) page.push(await timed(`${BASE}/products?${queries[i % queries.length]}`));
console.log("Page GET /products (server-rendered HTML), 100 varied requests:", stats(page));
