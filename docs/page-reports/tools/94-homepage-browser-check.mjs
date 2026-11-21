// Homepage (Page 01) browser check on a running production build: search, links, requirement strip, no writes on load, console, overflow, headings, CLS.
// run: BASE=http://localhost:3100 node docs/page-reports/tools/94-homepage-browser-check.mjs
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3100", out = "docs/page-reports/screenshots"; fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
let n = 0, bad = 0; const ok = (name, c, extra = "") => { n++; if (!c) bad++; console.log(c ? "PASS " : "FAIL ", name, extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(w, h) { const p = await b.newPage(); await p.setViewport({ width: w, height: h }); const writes = [], errs = []; p.on("request", (r) => { if (!["GET", "HEAD"].includes(r.method()) && r.url().startsWith(BASE)) writes.push(r.method() + " " + r.url()); }); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); }); p.on("pageerror", (e) => errs.push(String(e))); await p.goto(BASE + "/", { waitUntil: "networkidle0" }); return { p, writes, errs }; }
for (const [w, h] of [[320, 640], [360, 740], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [844, 390], [640, 360]]) {
  const { p, writes, errs } = await open(w, h);
  const m = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, h1: document.querySelectorAll("h1").length, skips: (() => { const hs = [...document.querySelectorAll("h1,h2,h3")].map((x) => +x.tagName[1]); let s = 0; for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) s++; return s; })(), noAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).length, broken: [...document.images].filter((i) => i.loading !== "lazy" && i.complete && i.naturalWidth === 0).length, sectionH2: [...document.querySelectorAll("h2")].map((x) => x.textContent.trim()) }));
  ok(`${w}x${h}: no horizontal overflow, one h1, no heading jumps, every img has alt attr, no broken eager img`, m.over <= 0 && m.h1 === 1 && m.skips === 0 && m.noAlt === 0 && m.broken === 0, JSON.stringify({ over: m.over, h1: m.h1, skips: m.skips, noAlt: m.noAlt, broken: m.broken }));
  ok(`${w}x${h}: loading the page sent no write request and logged no console error`, writes.length === 0 && errs.length === 0, errs.slice(0, 2).join(" | "));
  if ([320, 390, 1440, 844].includes(w)) { await p.screenshot({ path: `${out}/01-homepage-${w}x${h}.png`, fullPage: true }); }
  await p.close();
}
// CLS and bundle on desktop
{ const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
  await p.evaluateOnNewDocument(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); });
  await p.goto(BASE + "/", { waitUntil: "networkidle0" }); await sleep(800); const cls = await p.evaluate(() => window.__cls); ok("measured CLS on a cold load at 1280 (lab, one run)", cls <= 0.1, "cls=" + cls.toFixed(4)); await p.close(); }
// 200% zoom simulation: 640px layout at 2x pixel ratio equals desktop 1280 at 200%
{ const p = await b.newPage(); await p.setViewport({ width: 640, height: 400, deviceScaleFactor: 2 }); await p.goto(BASE + "/", { waitUntil: "networkidle0" }); ok("desktop at 200% zoom (640 css px wide): no horizontal overflow", (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0); await p.close(); }
// search
async function search(typeLabel, text, press = "Enter") {
  const { p } = await open(1280, 800);
  const form = (await p.$$('form[role="search"]')).pop();
  const hero = await p.evaluateHandle(() => [...document.querySelectorAll('form[role="search"]')].pop());
  if (typeLabel) { await hero.asElement().$("button[aria-haspopup]").then((x) => x.click()); await sleep(200); await p.evaluate((t) => { const lists = [...document.querySelectorAll('ul[aria-label="Search in"]')]; const o = [...lists.pop().querySelectorAll('[role="option"]')].find((x) => x.textContent.trim() === t); o?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })); }, typeLabel); await sleep(200); }
  const input = await hero.asElement().$("input"); await input.click(); await input.type(text);
  if (press === "Enter") await p.keyboard.press("Enter"); else await (await hero.asElement().$('button[type="submit"]')).click();
  await sleep(1500); const url = p.url(); const stayed = url === BASE + "/"; const focused = await p.evaluate(() => document.activeElement?.tagName); await p.close(); return { url, stayed, focused };
}
let r = await search(null, "cotton shirt"); ok("Enter on a products search goes to /search?q=cotton%20shirt", /\/search\?q=cotton(%20|\+)shirt$/.test(r.url), r.url);
r = await search(null, "steel & pipe <b>", "click"); ok("special characters are encoded, not forwarded raw", /q=steel(%20|\+)%26(%20|\+)pipe(%20|\+)%3Cb%3E/.test(r.url), r.url);
r = await search(null, "   "); ok("whitespace-only search does not navigate and keeps focus in the field", r.stayed && r.focused === "INPUT", r.url + " " + r.focused);
r = await search("Suppliers", "textile"); ok("Suppliers type goes to the supplier directory search", /\/suppliers\?q=textile/.test(r.url), r.url);
r = await search("Services", "fabric"); ok("Services type goes to type=services search", /type=services/.test(r.url) && /q=fabric/.test(r.url), r.url);
// back/forward
{ const { p } = await open(1280, 800); const hero = await p.evaluateHandle(() => [...document.querySelectorAll('form[role="search"]')].pop()); const input = await hero.asElement().$("input"); await input.type("cotton"); await p.keyboard.press("Enter"); await sleep(1500); await p.goBack(); await sleep(800); const back = p.url() === BASE + "/"; await p.goForward(); await sleep(800); ok("back returns to the homepage and forward to the results", back && /\/search/.test(p.url())); await p.close(); }
// popular search chips
{ const { p } = await open(1280, 800); const hrefs = await p.evaluate(() => [...document.querySelectorAll("a")].filter((a) => /\/search\?type=products&q=/.test(a.getAttribute("href"))).map((a) => a.getAttribute("href"))); ok("popular-search chips exist and point at the canonical search", hrefs.length > 0, hrefs.slice(0, 2).join(",")); const r2 = await fetch(BASE + hrefs[0]); ok("a popular-search link resolves", r2.status === 200, String(r2.status)); await p.close(); }
// product and supplier cards
{ const { p } = await open(1280, 800);
  const cards = await p.evaluate(() => ({ prod: [...document.querySelectorAll('#featured-products-heading')].length, pl: [...document.querySelectorAll('section[aria-labelledby="featured-products-heading"] a[href^="/products/"]')].map((a) => a.getAttribute("href")), sl: [...document.querySelectorAll('section[aria-labelledby="suppliers-heading"] a[href^="/suppliers/"]')].map((a) => a.getAttribute("href")) }));
  ok("product section shows real product links (unique, canonical /products/…)", new Set(cards.pl.map((x) => x.split("#")[0])).size === 5, "5 distinct product pages");
  const first = cards.pl[0]; const rp = await fetch(BASE + first); ok("first product card destination resolves (200)", rp.status === 200, first + " " + rp.status);
  const rs = await fetch(BASE + cards.sl[0]); ok("first supplier card destination resolves (200)", rs.status === 200, cards.sl[0] + " " + rs.status);
  ok("no sample/placeholder wording left on the page", !/Sample (Buyer|quotes)|for layout only/i.test(await p.evaluate(() => document.body.innerText)));
  await p.close(); }
// requirement strip
{ const { p, writes } = await open(1280, 800);
  const inputs = await p.$$('section[aria-labelledby="requirement-heading"] input');
  await p.evaluate(() => [...document.querySelectorAll('section[aria-labelledby="requirement-heading"] button[type="submit"]')][0].click()); await sleep(500);
  ok("empty strip shows validation and does not navigate", p.url() === BASE + "/" && (await p.evaluate(() => document.querySelectorAll('section[aria-labelledby="requirement-heading"] [role="alert"], section[aria-labelledby="requirement-heading"] [aria-invalid="true"]').length)) > 0);
  await inputs[0].type("cotton fabric"); await inputs[1].type("100"); await inputs[2].type("Surat");
  await p.evaluate(() => document.querySelector('section[aria-labelledby="requirement-heading"] button[type="submit"]').click()); await sleep(2500);
  ok("Continue opens /post-requirement with the prefilled values (no submission from the strip)", /\/post-requirement\?/.test(p.url()) && /product=cotton(\+|%20)fabric/.test(p.url()) && /quantity=100/.test(p.url()) && /city=Surat/.test(p.url()) && !writes.some((x) => !x.includes("/_next")), p.url() + " | writes:" + writes.join(","));
  await p.close(); }
// keyboard + focus visible
{ const { p } = await open(1280, 800); const seen = new Set(); let vis = 0; for (let i = 0; i < 25; i++) { await p.keyboard.press("Tab"); const s = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { t: e.tagName + (e.textContent || "").trim().slice(0, 18), outline: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== "none" }; }); if (s) { seen.add(s.t); if (s.outline) vis++; } }
  ok("Tab moves through at least 10 distinct controls and most show a visible focus style", seen.size >= 10 && vis >= seen.size * 0.8, `${seen.size} controls, ${vis} visible`); await p.close(); }
console.log(`${n} checks, ${bad} failed`); await b.close();
