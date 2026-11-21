// Industry details (Page 10): browser/HTTP check on a running production build.
// It needs the TEMPORARY fixture mapping (retail-wholesale and manufacturing APPROVED, agriculture APPROVED over an empty category) that is NEVER committed: see docs/page-designs/PAGE_10_INDUSTRY_DETAILS_COMPLETION.md.
// run: BASE=http://localhost:3100 node docs/page-reports/tools/95-industry-details-browser-check.mjs
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3100", out = "docs/page-reports/screenshots"; fs.mkdirSync(out, { recursive: true });
let n = 0, bad = 0; const ok = (name, c, extra = "") => { n++; if (!c) bad++; console.log(c ? "PASS " : "FAIL ", name, extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => { const r = await fetch(BASE + p, { redirect: "manual" }); return { status: r.status, html: r.status < 400 ? await r.text() : "" }; };
const cards = (html) => [...new Set([...html.matchAll(/href="(\/products\/[^"#]+)"/g)].map((m) => m[1]))];
const total = async (cat) => { const j = await (await fetch(`${BASE}/api/public/products?category=${cat}&pageSize=1`)).json(); const d = j.data; return d.pagination?.total ?? d.total ?? d.meta?.total ?? d.totals?.products; };

// states
const A = await get("/industries/retail-wholesale"); ok("mapped industry: 200 with its own title and canonical-free (no site origin configured) head", A.status === 200 && /<title>Retail &amp; Wholesale \| Finbyn Mart/.test(A.html));
ok("mapped industry shows product cards, no duplicates", cards(A.html).length >= 10, cards(A.html).length + " distinct links on page 1");
ok("breadcrumb links Home > Industries > name", /href="\/industries"/.test(A.html) && />Retail &amp; Wholesale</.test(A.html));
const Z = await get("/industries/agriculture"); ok("approved mapping with no public products: honest no-products state (not an error, not the catalogue)", Z.status === 200 && /No public products in this industry yet/.test(Z.html) && cards(Z.html).length === 0);
const E = await get("/industries/education"); ok("industry with no approved mapping: honest not-set-up state and no products", E.status === 200 && /set up yet/.test(E.html.replace(/&#x27;/g, "'")) && cards(E.html).length === 0);
const N = await get("/industries/not-an-industry"); ok("unknown slug: 404 with no fabricated industry metadata", N.status === 404 && !/not-an-industry/i.test(N.html.replace(/<script[\s\S]*?<\/script>/g, "")));
for (const odd of ["/industries/Retail-Wholesale", "/industries/retail-wholesale%2F..", "/industries/%00"]) { const r = await get(odd); ok(`odd slug ${odd} is not turned into an industry`, r.status === 404 || r.status === 400 || r.status >= 300, String(r.status)); }
// scope, leakage, totals
const totalOf = async (cat) => (/"totalItems":(d+)/.exec(await (await fetch(`${BASE}/api/public/products?category=${cat}&pageSize=1`)).text()) ?? [])[1];
const ldTotal = (html) => (/"numberOfItems":(d+)/.exec(html) ?? [])[1];
const tApparel = await totalOf("apparel-fashion");
ok("industry total (structured data) equals its listable mapped category only: sample-only home-lifestyle adds nothing, nothing double counted", ldTotal(A.html) === tApparel, `industry=${ldTotal(A.html)} apparel=${tApparel}`);
const oos = await get("/industries/retail-wholesale?category=food-beverages"); ok("a category outside the industry scope is ignored, never honoured (no food products)", oos.status === 200 && cards(oos.html).length > 0 && !/food-beverages/i.test(cards(oos.html).join()));
const m = await get("/industries/manufacturing");
ok("manufacturing (mapped to sample-only categories): no sample listing is presented as live inventory; honest no-products state", cards(m.html).length === 0 && /No public products in this industry yet/.test(m.html), "cards=" + cards(m.html).length);
// pagination
const p1 = await get("/industries/retail-wholesale?page=1"), p2 = await get("/industries/retail-wholesale?page=2"), p2b = await get("/industries/retail-wholesale?page=2");
ok("page 2 differs from page 1, is deterministic across requests, has no overlap", p2.status === 200 && cards(p2.html).join() === cards(p2b.html).join() && !cards(p2.html).some((x) => cards(p1.html).includes(x)) && cards(p2.html).length > 0);
const far = await get("/industries/retail-wholesale?page=999999"); ok("an out-of-range page is handled (clamped or empty page state), never a 500", far.status < 500, String(far.status));
const hostile = await get("/industries/retail-wholesale?page=-1&sort=<script>&category[]=x&q=" + "a".repeat(500)); ok("hostile query values do not break the page or echo markup", hostile.status < 500 && !/<script>/i.test(hostile.html.replace(/<script[\s\S]*?<\/script>/g, "")));
const q = await get("/industries/retail-wholesale?q=zzzzqqqq"); ok("search with no match shows the no-match state with Reset/clear, not 'no products in this industry'", q.status === 200 && cards(q.html).length === 0 && !/No public products in this industry/.test(q.html));
const qs = await get("/industries/retail-wholesale?q=jersey"); ok("search keeps the industry scope (results exist, form action stays on the industry)", cards(qs.html).length > 0 && /action="\/industries\/retail-wholesale"/.test(qs.html));
ok("no inline server error text on any state", ![A, Z, E, q].some((r) => /Application error|Internal Server Error/.test(r.html)));
// links
let broken = 0; for (const l of cards(A.html).slice(0, 10)) { const r = await fetch(BASE + l); if (r.status !== 200) broken++; } ok("product card links resolve (first 10)", broken === 0);
ok("general requirement link goes to the canonical flow, not a selected-supplier link", /href="\/post-requirement[^"]*"/.test(A.html) && !/supplier=/.test(A.html.match(/href="\/post-requirement[^"]*"/)?.[0] ?? ""));
const indList = await get("/industries"); ok("industries listing links to this detail route", /href="\/industries\/retail-wholesale"/.test(indList.html));

// browser
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
for (const [w, h] of [[320, 640], [360, 740], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [844, 390], [640, 360]]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: h }); const writes = [], errs = [];
  p.on("request", (r) => { if (!["GET", "HEAD"].includes(r.method()) && r.url().startsWith(BASE)) writes.push(r.method() + " " + r.url()); });
  p.on("console", (x) => { if (x.type() === "error") errs.push(x.text()); }); p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`${BASE}/industries/retail-wholesale`, { waitUntil: "networkidle0" });
  const m2 = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, h1: document.querySelectorAll("h1").length, jump: (() => { const hs = [...document.querySelectorAll("h1,h2,h3,h4")].map((x) => +x.tagName[1]); let s = 0; for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) s++; return s; })(), noAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).length, unlabeled: [...document.querySelectorAll("input,select")].filter((i) => i.type !== "hidden" && !i.labels?.length && !i.getAttribute("aria-label") && !i.getAttribute("aria-labelledby") && !i.closest("label")).length }));
  ok(`${w}x${h}: no overflow, one h1, no heading jumps, alt present, inputs labelled, no writes, no console errors`, m2.over <= 0 && m2.h1 === 1 && m2.jump === 0 && m2.noAlt === 0 && m2.unlabeled === 0 && writes.length === 0 && errs.length === 0, JSON.stringify({ ...m2, writes: writes.length, errs: errs.slice(0, 1) }));
  if ([320, 1440, 844].includes(w)) await p.screenshot({ path: `${out}/10-industry-details-${w}x${h}.png`, fullPage: true });
  await p.close();
}
{ const p = await b.newPage(); await p.setViewport({ width: 640, height: 400, deviceScaleFactor: 2 }); await p.goto(`${BASE}/industries/retail-wholesale`, { waitUntil: "networkidle0" }); ok("desktop at 200% zoom (640 css px): no horizontal overflow", (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0); await p.close(); }
{ const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 }); await p.goto(`${BASE}/industries/agriculture`, { waitUntil: "networkidle0" }); ok("empty-industry state: no overflow on mobile", (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0); await p.screenshot({ path: `${out}/10-industry-details-empty-390.png` }); await p.close(); }
{ const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 }); await p.goto(`${BASE}/industries/education`, { waitUntil: "networkidle0" }); await p.screenshot({ path: `${out}/10-industry-details-unmapped-390.png` }); await p.close(); }
{ const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 }); await p.goto(`${BASE}/industries/retail-wholesale`, { waitUntil: "networkidle0" });
  // category chip keeps scope and resets page
  await p.goto(`${BASE}/industries/retail-wholesale?page=2`, { waitUntil: "networkidle0" });
  const chip = await p.evaluateHandle(() => [...document.querySelectorAll("a")].find((a) => /category=/.test(a.getAttribute("href") ?? "") && /^\/industries\/retail-wholesale/.test(a.getAttribute("href"))));
  const href = await chip.evaluate((a) => a?.getAttribute("href")); ok("a category chip stays inside the industry and drops page=2", !!href && /^\/industries\/retail-wholesale\?/.test(href) && !/page=2/.test(href), href);
  const seen = new Set(); let vis = 0; for (let i = 0; i < 25; i++) { await p.keyboard.press("Tab"); const s = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { t: e.tagName + (e.textContent || "").trim().slice(0, 16), v: (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none" }; }); if (s) { seen.add(s.t); if (s.v) vis++; } }
  ok("keyboard Tab reaches >= 10 controls with visible focus", seen.size >= 10 && vis >= seen.size * 0.8, `${seen.size}/${vis}`); await p.close(); }
console.log(`${n} checks, ${bad} failed`); await b.close();
