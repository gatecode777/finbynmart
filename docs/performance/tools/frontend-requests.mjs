// Frontend request audit: which API calls does a page make from the browser, and are any repeated?
//   node docs/performance/tools/frontend-requests.mjs [--out docs/performance/results/frontend-requests.json]
// Loads each page in Chrome (guest, then signed in as a throwaway buyer), waits for the network to go quiet, optionally
// interacts, and lists every /api request with its count. Needs the test server (BASE, default :3100).
import fs from "node:fs";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE || "http://localhost:3100";
const ROOT = "R:/indiamartref";
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "docs/performance/results/frontend-requests.json";
const require = createRequire(`${ROOT}/`);
const { MongoClient } = require("mongodb");
const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));

const stamp = Date.now();
const email = `perf-${stamp}@example.test`;
const reg = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.50.50.50" }, body: JSON.stringify({ role: "buyer", name: "Perf Buyer", email, password: "perf-test-password-1" }) });
const cookies = (reg.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).map((pair) => ({ name: pair.slice(0, pair.indexOf("=")), value: pair.slice(pair.indexOf("=") + 1), url: BASE }));

const PAGES = [
  { path: "/", note: "home" },
  { path: "/products", note: "all products" },
  { path: "/products/cotton-fabric", note: "product detail" },
  { path: "/suppliers", note: "supplier directory" },
  { path: "/suppliers/shree-textiles", note: "supplier profile" },
  { path: "/suppliers/shree-textiles/products", note: "supplier products" },
  { path: "/suppliers/shree-textiles/reviews", note: "supplier reviews" },
  { path: "/search?q=shirt", note: "search results" },
  { path: "/inquiry/shree-textiles", note: "contact supplier" },
];

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const report = { base: BASE, when: new Date().toISOString(), pages: [] };

for (const mode of ["guest", "signed-in"]) {
  for (const page of PAGES) {
    const context = await browser.createBrowserContext();
    const p = await context.newPage();
    if (mode === "signed-in") await p.setCookie(...cookies);
    await p.setViewport({ width: 1440, height: 900 });
    const calls = [];
    p.on("request", (req) => { const url = new URL(req.url()); if (url.pathname.startsWith("/api/")) calls.push(`${req.method()} ${url.pathname}${url.search ? "?…" : ""}`); });
    await p.goto(BASE + page.path, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 500));
    const counts = calls.reduce((acc, c) => ((acc[c] = (acc[c] ?? 0) + 1), acc), {});
    report.pages.push({ mode, ...page, requests: counts, total: calls.length, duplicates: Object.entries(counts).filter(([, n]) => n > 1).map(([c, n]) => `${c} x${n}`) });
    await context.close();
  }
}

// typing in the header search box: how many suggestion requests for a six-letter word?
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  const calls = [];
  p.on("request", (req) => { const url = new URL(req.url()); if (url.pathname.includes("/suggest")) calls.push(url.search); });
  await p.goto(BASE + "/", { waitUntil: "networkidle0" });
  await p.click("header input[role=combobox]");
  await p.keyboard.type("jacket", { delay: 60 });
  await new Promise((r) => setTimeout(r, 1200));
  report.typing = { typed: "jacket", delayMsPerKey: 60, suggestionRequests: calls.length, queries: calls };
  await p.close();
}
await browser.close();

const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
await client.db("finbynmart_test").collection("users").deleteMany({ email });
await client.close();

fs.mkdirSync(OUT.replace(/[^/\\]+$/, ""), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
for (const r of report.pages) console.log(`${r.mode.padEnd(10)} ${r.path.padEnd(38)} ${String(r.total).padStart(2)} API calls  ${Object.entries(r.requests).map(([c, n]) => `${c}${n > 1 ? ` x${n}` : ""}`).join(" | ")}`);
console.log("typing 'jacket' at 60 ms per key ->", report.typing.suggestionRequests, "suggestion request(s)");
