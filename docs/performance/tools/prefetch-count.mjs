// Counts the background requests (Next.js link prefetches `?_rsc=`, API calls) one page view makes, with and without scrolling to the footer. run: BASE=http://localhost:3100 node docs/performance/tools/prefetch-count.mjs [paths...]
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE ?? "http://localhost:3100";
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/products", "/categories/apparel-fashion"];
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
for (const path of paths) {
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 }); const reqs = [];
  p.on("request", (r) => { const u = new URL(r.url()); if (u.origin === new URL(BASE).origin && (u.searchParams.has("_rsc") || u.pathname.startsWith("/api/"))) reqs.push(u.pathname + (u.searchParams.has("_rsc") ? " [prefetch]" : "")); });
  await p.goto(BASE + path, { waitUntil: "networkidle0" }); await new Promise((r) => setTimeout(r, 1500)); const top = reqs.length;
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await new Promise((r) => setTimeout(r, 2000));
  console.log(`${path.padEnd(30)} on load: ${top} background requests (${reqs.slice(0, top).filter((x) => x.includes("prefetch")).length} prefetch); after scrolling to the footer: ${reqs.length}`);
  await p.close();
}
await b.close();
