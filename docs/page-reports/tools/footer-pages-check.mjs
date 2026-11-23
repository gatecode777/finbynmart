// Footer information pages: status, one h1, no overflow at 5 widths, no console errors, CTA targets, preset contact topic, no private data. Read-only; uses no database.
// run (server from a build, with a dead MONGODB_URI so no real data can be touched): BASE=http://localhost:3100 node docs/page-reports/tools/footer-pages-check.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE ?? "http://localhost:3100";
const SLUGS = ["success-stories","blog","careers","press","buyer-guide","safety-tips","supplier-membership","lead-management","pricing","supplier-guide","supplier-success-stories","track-inquiry","report-abuse","feedback","refund-policy","cookie-policy","disclaimer"];
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
let n = 0, bad = 0; const ok = (name, c, extra = "") => { n++; if (!c) bad++; console.log(c ? "PASS " : "FAIL ", name, extra); };
const p = await b.newPage(); const errs = []; p.on("console", (m) => m.type() === "error" && errs.push(m.text())); p.on("pageerror", (e) => errs.push(String(e)));
for (const slug of SLUGS) {
  errs.length = 0;
  for (const w of [320, 390, 768, 1280, 1440]) {
    await p.setViewport({ width: w, height: 800 });
    const r = await p.goto(`${BASE}/${slug}`, { waitUntil: "networkidle0" });
    const d = await p.evaluate(() => ({ h1: [...document.querySelectorAll("h1")].map((x) => x.textContent), over: document.documentElement.scrollWidth > innerWidth + 1, generic: /isn.t published yet/.test(document.body.innerText), footer: !!document.querySelector("footer"), robots: document.querySelector('meta[name=robots]')?.content ?? "" }));
    ok(`${slug} @${w}: 200, one h1, no overflow, footer, not the generic template`, (r.status() === 200 || r.status() === 304) && d.h1.length === 1 && !d.over && d.footer && !d.generic, JSON.stringify(w === 1280 ? { h1: d.h1, robots: d.robots } : {}));
  }
  ok(`${slug}: no console errors`, errs.length === 0, errs.join(" | ").slice(0, 200));
}
await p.setViewport({ width: 1280, height: 800 });
const hrefs = async (slug) => { await p.goto(`${BASE}/${slug}`, { waitUntil: "networkidle0" }); return p.$$eval("article a", (as) => as.map((a) => a.getAttribute("href"))); };
ok("track-inquiry links /buyer/inquiries (the page's guard sends a signed-out visitor to sign-in and back)", (await hrefs("track-inquiry")).includes("/buyer/inquiries"));
ok("lead-management links /supplier/inquiries", (await hrefs("lead-management")).includes("/supplier/inquiries"));
ok("report-abuse and feedback link Contact Us with an allowlisted topic", (await hrefs("report-abuse")).includes("/contact-us?topic=REPORT_PROBLEM") && (await hrefs("feedback")).includes("/contact-us?topic=FEEDBACK"));
for (const [t, v] of [["REPORT_PROBLEM", "REPORT_PROBLEM"], ["FEEDBACK", "FEEDBACK"], ["<script>", ""], ["NOPE", ""]]) {
  await p.goto(`${BASE}/contact-us?topic=${encodeURIComponent(t)}`, { waitUntil: "networkidle0" });
  ok(`contact-us ?topic=${t} presets "${v}"`, (await p.$eval("select[data-field=topic]", (s) => s.value)) === v);
}
for (const slug of ["refund-policy", "cookie-policy", "disclaimer"]) { await p.goto(`${BASE}/${slug}`, { waitUntil: "networkidle0" }); ok(`${slug}: review-draft notice, noindex, no date`, await p.evaluate(() => /Review draft/.test(document.body.innerText) && /noindex/.test(document.querySelector('meta[name=robots]')?.content ?? "") && !/Effective \d/.test(document.body.innerText))); }
await p.setViewport({ width: 640, height: 400, deviceScaleFactor: 2 }); // 200% zoom of 1280 wide
for (const slug of ["buyer-guide", "supplier-guide", "refund-policy"]) { await p.goto(`${BASE}/${slug}`, { waitUntil: "networkidle0" }); ok(`${slug} at 200% zoom: no overflow`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
console.log(`${n} checks, ${bad} failed`); await b.close();
