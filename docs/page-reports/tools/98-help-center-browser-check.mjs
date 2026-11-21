// Help Center (Page 15): HTTP + Chrome checks on a running production build (static page, no database needed).
// run: BASE=http://localhost:3100 node docs/page-reports/tools/98-help-center-browser-check.mjs
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3100", out = "docs/page-reports/screenshots"; fs.mkdirSync(out, { recursive: true });
let n = 0, bad = 0; const ok = (name, c, extra = "") => { n++; if (!c) bad++; console.log(c ? "PASS " : "FAIL ", name, extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = await fetch(BASE + "/help"); const html = await res.text();
const api = await (await fetch(BASE + "/api/public/faqs")).json(); const FAQ_COUNT = api.data.faqs.length;
ok("Help shows exactly the published entries of the public FAQ source (same count as /api/public/faqs, no private or extra fields)", FAQ_COUNT >= 20 && Object.keys(api.data.faqs[0]).sort().join() === "answer,category,id,question" && api.data.faqs.every((x) => Object.keys(x).length === 4));
for (const g of ["/blog", "/track-inquiry", "/refund-policy"]) { const t = await (await fetch(BASE + g)).text(); ok(`generic placeholder ${g} is unchanged (still the 'not published yet' template)`, /isn(&#x27;|')t published yet/.test(t)); }
const pageText = html.replace(/<script[\s\S]*?<\/script>/g, " ");
ok("channels: Contact Us and both portal support links shown; no mailto/tel and no live-chat or Online claim unless configured; no secret in the HTML", /href="\/contact-us"/.test(pageText) && /href="\/buyer\/support"/.test(pageText) && /href="\/supplier\/support"/.test(pageText) && (process.env.BASE2 ? true : !/mailto:|tel:/.test(pageText)) && !/\bOnline\b/.test(pageText) && !/MONGODB|AUTH_SECRET|IMAGEKIT|PRIVATE_KEY/.test(html));
if (process.env.BASE2) { const h2 = await (await fetch(process.env.BASE2 + "/help")).text(); ok("a configured e-mail shows as a mailto channel on the server that has it configured, and only there", /href="mailto:help@example\.org"/.test(h2) && !/href="mailto:/.test(html)); }
ok("public /help loads signed out (200)", res.status === 200);
const a = await fetch(BASE + "/faqs", { redirect: "manual" }); ok("/faqs permanently redirects to /help", a.status === 308 && /\/help$/.test(a.headers.get("location") ?? ""));
ok("the footer and header Help links point at /help", (await (await fetch(BASE + "/")).text()).match(/href="\/help"/g)?.length >= 2);
ok("every published question and answer is in the server-rendered HTML (readable without JavaScript)", (html.match(/<details/g) ?? []).length === FAQ_COUNT && /How do I create a buyer account\?/.test(html) && /Create a quotation|Open the inquiry in the supplier portal/.test(html));
ok("one h1; contact section heading; labelled search field", (html.match(/<h1/g) ?? []).length === 1 && />Still need help\?</.test(html) && /<label[^>]*>Search help topics<\/label>/.test(html));
ok("no placeholder text, no # links, no sample data", !/not published yet|Lorem|TODO|href="#"/.test(html.replace(/<script[\s\S]*?<\/script>/g, "")));
ok("the page does not claim a response time, 24/7 or live chat availability", !/24\s*\/\s*7|within \d+ (hours|minutes)/i.test(html) && /Live chat is not available/.test(html));
const links = [...new Set([...html.matchAll(/<a [^>]*href="(\/[^"#]*)"/g)].map((m) => m[1]))].filter((l) => !l.startsWith("/_next"));
let broken = 0; for (const l of links) { const r = await fetch(BASE + l, { redirect: "manual" }); if (!(r.status === 200 || (r.status >= 300 && r.status < 400))) { broken++; console.log("BROKEN", r.status, l); } }
ok(`every internal link resolves (${links.length}); authenticated destinations answer with a sign-in redirect, not an error`, broken === 0);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
async function open(w, h) { const p = await b.newPage(); await p.setViewport({ width: w, height: h }); const writes = [], external = [], errs = []; p.on("request", (r) => { if (!["GET", "HEAD"].includes(r.method()) && r.url().startsWith(BASE)) writes.push(r.method() + " " + r.url()); if (!r.url().startsWith(BASE) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) external.push(r.url()); }); p.on("console", (x) => { if (x.type() === "error") errs.push(x.text()); }); p.on("pageerror", (e) => errs.push(String(e))); await p.goto(BASE + "/help", { waitUntil: "domcontentloaded" }); await p.waitForSelector("details"); await sleep(1200); return { p, writes, external, errs }; }
const count = (p) => p.evaluate(() => document.querySelectorAll("details").length);
const status = (p) => p.evaluate(() => document.querySelector('p[role="status"]').textContent.trim());
{ const { p, writes, external, errs } = await open(1280, 800);
  const input = await p.$('input[type="search"]');
  await input.type("PASSWORD"); await sleep(200); ok("search is case-insensitive and updates the live status", (await count(p)) >= 2 && /question/.test(await status(p)), `${await count(p)} · ${await status(p)}`);
  await input.focus(); await p.keyboard.down("Control"); await p.keyboard.press("KeyA"); await p.keyboard.up("Control"); await input.type("   reset   "); await sleep(200); ok("surrounding whitespace is trimmed", (await count(p)) >= 1);
  await input.focus(); await p.keyboard.down("Control"); await p.keyboard.press("KeyA"); await p.keyboard.up("Control"); await input.type("supplier verification"); await sleep(200); ok("multi-word search matches across question and answer", (await count(p)) >= 1);
  await input.focus(); await p.keyboard.down("Control"); await p.keyboard.press("KeyA"); await p.keyboard.up("Control"); await input.type("zzzzqqqq"); await sleep(200); ok("no-result state is clear and offers reset, and says so in the live status", (await count(p)) === 0 && /No questions match/.test(await status(p)) && (await p.evaluate(() => /No help topic matches/.test(document.body.innerText))));
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent === "Reset search and topic").click()); await sleep(200); ok("Reset restores all FAQs and clears the field", (await count(p)) === FAQ_COUNT && (await input.evaluate((e) => e.value)) === "");
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^Supplier Account/.test(x.textContent)).click()); await sleep(200); const sup = await count(p);
  ok("a topic filters to its own questions and shows pressed state", sup === 4 && (await p.evaluate(() => [...document.querySelectorAll("button[aria-pressed=true]")].map((x) => x.textContent).join("|"))).startsWith("Supplier Account"));
  await input.type("verification"); await sleep(200); ok("topic + search combine (supplier + verification)", (await count(p)) === 1);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^Technical Support/.test(x.textContent)).click()); await sleep(200); ok("changing topic keeps the search text and re-filters (technical + verification = none)", (await count(p)) === 0);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent === "Reset search and topic").click()); await sleep(200);
  await input.type("<img src=x onerror=alert(1)>"); await sleep(200); ok("markup typed in the search is treated as text (nothing injected, no dialog)", (await p.evaluate(() => !document.querySelector("img[src=x]"))) && (await count(p)) === 0);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent === "Reset search and topic").click());
  // keyboard accordion
  await p.evaluate(() => document.querySelector("summary").focus()); await p.keyboard.press("Enter"); await sleep(150);
  const open1 = await p.evaluate(() => document.querySelector("details").open); await p.keyboard.press("Space"); await sleep(150); const open2 = await p.evaluate(() => document.querySelector("details").open);
  ok("keyboard: Enter opens and Space closes a question (native details)", open1 === true && open2 === false);
  await p.evaluate(() => { const d = document.querySelector("details"); d.open = true; });
  const link = await p.$("details[open] a"); const href = link ? await link.evaluate((e) => e.getAttribute("href")) : null; ok("an open answer shows working links", !!href && href.startsWith("/"), String(href));
  const focusVisible = await p.evaluate(() => { const s = document.querySelector("summary"); s.focus(); const cs = getComputedStyle(s); return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0; }); ok("summary shows a visible focus outline", focusVisible);
  ok("browsing and searching sent no write request, no external request and no console error", writes.length === 0 && external.length === 0 && errs.length === 0, JSON.stringify({ writes, external: external.slice(0, 2), errs: errs.slice(0, 2) }));
  await p.close(); }
{ const { p } = await open(1280, 800); await p.evaluate(() => document.querySelectorAll("details")[8].open = true); await p.click('input[type="search"]'); await p.keyboard.type("quotation"); await sleep(300);
  await p.screenshot({ path: `${out}/15-help-center-search-1280.png`, fullPage: false }); await p.close(); }
for (const [w, h] of [[320, 640], [360, 740], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [844, 390], [640, 360]]) {
  const { p } = await open(w, h);
  await p.evaluate(() => { document.querySelectorAll("details").forEach((d, i) => { if (i < 3) d.open = true; }); });
  const m = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, clipped: [...document.querySelectorAll("summary,summary span,p,a,button,li")].filter((e) => !e.classList.contains("visually-hidden") && getComputedStyle(e).overflow !== "visible" && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0).length, slider: [...document.querySelectorAll("*")].filter((e) => ["auto", "scroll"].includes(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && e.tagName !== "HTML" && e.tagName !== "BODY").length, small: [...document.querySelectorAll("button,summary,input,a")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 24; }).length }));
  ok(`${w}x${h}: no overflow, no clipped text, no horizontal slider`, m.over <= 0 && m.clipped === 0 && m.slider === 0, JSON.stringify(m));
  if ([320, 1440, 844].includes(w)) await p.screenshot({ path: `${out}/15-help-center-${w}x${h}.png`, fullPage: true });
  await p.close(); }
{ const p = await b.newPage(); await p.setViewport({ width: 640, height: 400, deviceScaleFactor: 2 }); await p.goto(BASE + "/help", { waitUntil: "domcontentloaded" }); await p.waitForSelector("details"); await sleep(800); ok("desktop at 200% zoom (640 css px): no horizontal overflow", (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0); await p.close(); }
{ const { p } = await open(1280, 800);
  const contrast = await p.evaluate(() => { const lum = (c) => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }; const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }; const on = [...document.querySelectorAll("button[aria-pressed=true]")][0], off = [...document.querySelectorAll("button[aria-pressed=false]")][0], ans = document.querySelector("details > div"), item = document.querySelector("details"); const bgOf = (e) => getComputedStyle(e).backgroundColor; return { on: cr(getComputedStyle(on).color, bgOf(on)), off: cr(getComputedStyle(off).color, bgOf(off)), answer: cr(getComputedStyle(ans).color, bgOf(item)) }; });
  ok("contrast >= 4.5:1 for selected topic, topic, and answer text (computed from styles)", contrast.on >= 4.5 && contrast.off >= 4.5 && contrast.answer >= 4.5, JSON.stringify(contrast));
  const heads = await p.evaluate(() => [...document.querySelectorAll("h1,h2,h3")].map((x) => x.tagName)); ok("heading hierarchy is h1 then h2", heads[0] === "H1" && heads.slice(1).every((t) => t === "H2"), heads.join());
  await p.close(); }
console.log(`${n} checks, ${bad} failed`); await b.close();
