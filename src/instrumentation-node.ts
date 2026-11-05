/**
 * Node-runtime part of instrumentation.ts (kept in its own file so the edge compile of instrumentation never reaches
 * `node:fs`). Loads the product catalogue (about 21,000 products from the seed files), builds the search index and answers
 * the most common listing once, so the first visitor does not wait for that work (measured at about 1.6 s before this
 * existed). Nothing is requested from the network or the database.
 */
export async function warmCatalogue() {
  const started = performance.now();
  const { getCatalog } = await import("@/lib/catalog/data");
  const loaded = performance.now();
  const catalog = getCatalog();
  const { getProductListing, parseListingQuery } = await import("@/lib/catalog/categoryListing");
  getProductListing(parseListingQuery({}));
  const { getCategoryDirectory } = await import("@/lib/catalog/categories");
  getCategoryDirectory();
  const done = performance.now();
  if (process.env.FINBYN_PERF === "1") {
    console.log(JSON.stringify({ type: "perf", kind: "startup", route: "warm catalogue", products: catalog.products.length, sellers: catalog.sellers.length, importMs: Math.round(loaded - started), totalMs: Math.round(done - started) }));
  }
}
