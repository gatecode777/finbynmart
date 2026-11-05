// Latency of the product detail endpoints and page against a running `next start` (BASE, default :3100).
// Sequential requests from one client on the same machine as the server, production build. The public APIs allow 120
// requests per minute per address, so this uses 50 detail + 50 related requests, then 100 page loads (not limited).
const BASE = process.env.BASE || "http://localhost:3100";
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
const stats = (ms) => { const s = [...ms].sort((a, b) => a - b); return { n: s.length, min: s[0].toFixed(0), p50: pct(s, 50).toFixed(0), p95: pct(s, 95).toFixed(0), max: s[s.length - 1].toFixed(0) }; };
const timed = async (url) => { const t = performance.now(); const r = await fetch(url); await r.text(); if (r.status !== 200) throw new Error(`${url} -> ${r.status}`); return performance.now() - t; };

const keys = ["1163", "1164", "1165", "1528", "1529", "1530", "1531", "1532", "1533", "1534", "industrial-air-compressor", "solar-panel-540w", "pharma-tablets", "mens-cotton-tshirt"];
const slugs = ["nike-sahara-team-india-fanwear-round-neck-jersey-1163", "industrial-air-compressor", "solar-panel-540w", "nike-men-blue-t20-indian-cricket-jersey-1164"];

const cold = await timed(`${BASE}/api/public/products/1163`);
console.log(`first detail request after a start: ${cold.toFixed(0)} ms`);
const detail = []; for (let i = 0; i < 50; i++) detail.push(await timed(`${BASE}/api/public/products/${keys[i % keys.length]}`));
console.log("GET /api/public/products/<key>, 50 requests (includes the MongoDB rate-limit round trip):", stats(detail));
const related = []; for (let i = 0; i < 50; i++) related.push(await timed(`${BASE}/api/public/products/${keys[i % keys.length]}/related`));
console.log("GET /api/public/products/<key>/related, 50 requests:", stats(related));
const page = []; for (let i = 0; i < 100; i++) page.push(await timed(`${BASE}/products/${slugs[i % slugs.length]}`));
console.log("GET /products/<slug> server-rendered page, 100 requests:", stats(page));
