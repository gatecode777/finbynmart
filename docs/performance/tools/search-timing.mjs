// Measures the stages of GET /api/public/products SEPARATELY, in-process, against an UNREACHABLE database (nothing is read or written): rate limiter, approved-snapshot
// load, catalogue query, serialization. Pass CASE=down (default) or CASE=bounded to use the bounded policy.
//   node --import ./docs/page-reports/tools/alias-register.mjs docs/performance/tools/search-timing.mjs
process.env.MONGODB_URI = "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=800"; // unreachable on purpose
process.env.MONGODB_DB = "finbyn_unused";
const rows = [];
const stage = async (name, fn) => {
  const t0 = performance.now();
  let note = "";
  try { const r = await fn(); note = r?.note ?? ""; } catch (e) { note = `threw: ${String(e.message).slice(0, 70)}`; }
  rows.push({ stage: name, ms: Math.round(performance.now() - t0), note });
};
const rl = await import("../../../src/lib/security/rateLimit.ts");
const ap = await import("../../../src/lib/catalog/approvedProducts.ts");
const eng = await import("../../../src/lib/catalog/categoryListing.ts");
const pub = await import("../../../src/lib/catalog/publicProduct.ts");
const q = eng.parseListingQuery({ q: "shirt", category: "apparel-fashion", limit: "12" });
eng.getProductListing(eng.parseListingQuery({})); // warm the in-memory catalogue (a one-off, measured by the startup warm-up in production)

await stage("1. rate limiter (database down)", async () => { const r = await rl.rateLimitReserved("timing:test", 120, 60); return { note: `ok=${r.ok}` }; });
await stage("1b. rate limiter again (3 calls)", async () => { for (let i = 0; i < 3; i++) await rl.rateLimitReserved("timing:test2", 120, 60); });
await stage("2. approved snapshot load (database down)", async () => { const r = await ap.refreshApproved(); return { note: JSON.stringify(r.skipped) }; });
await stage("3. catalogue query (in memory)", async () => { const l = eng.getProductListing(q); return { note: `${l.results.total} matches` }; });
let listing;
await stage("3b. catalogue query, cache hit", async () => { listing = eng.getProductListing(q); });
await stage("4. serialization", async () => { const body = JSON.stringify({ ok: true, data: { products: listing.results.items.map(pub.toPublicProduct) } }); return { note: `${body.length} bytes` }; });
if (rl.boundedRateLimit) {
  await stage("5. BOUNDED limiter (database down)", async () => { const r = await rl.boundedRateLimit("timing:bounded", 120, 60); return { note: `ok=${r.ok} degraded=${r.degraded}` }; });
  await stage("5b. BOUNDED limiter again (3 calls)", async () => { for (let i = 0; i < 3; i++) await rl.boundedRateLimit("timing:bounded2", 120, 60); });
}
console.table(rows);
process.exit(0);
