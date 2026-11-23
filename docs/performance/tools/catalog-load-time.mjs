// Times the one-off catalogue load (CSV parse + indexes) and the first listing in a fresh process: this is the CPU every NEW server instance pays once.
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/performance/tools/catalog-load-time.mjs
const t0 = performance.now(); const c0 = process.cpuUsage();
const { getCatalog } = await import("../../../src/lib/catalog/data.ts");
const t1 = performance.now();
getCatalog();
const t2 = performance.now();
const { getProductListing, emptyListingQuery } = await import("../../../src/lib/catalog/categoryListing.ts");
const t3 = performance.now();
await getProductListing(emptyListingQuery());
const t4 = performance.now();
const cpu = process.cpuUsage(c0);
console.log(`import data.ts ${(t1 - t0).toFixed(0)} ms | getCatalog (parse + index) ${(t2 - t1).toFixed(0)} ms | import listing ${(t3 - t2).toFixed(0)} ms | first listing ${(t4 - t3).toFixed(0)} ms | total CPU ${((cpu.user + cpu.system) / 1000).toFixed(0)} ms`);
