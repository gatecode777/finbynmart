// How It Works (Page 12): content, CTA, structure and responsive checks on a running production build (static page: no database needed).
// run: BASE=http://localhost:3100 node docs/page-reports/tools/96-how-it-works-check.mjs
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3100", out = "docs/page-reports/screenshots"; fs.mkdirSync(out, { recursive: true });
let n = 0, bad = 0; const ok = (name, c, extra = "") => { n++; if (!c) bad++; console.log(c ? "PASS " : "FAIL ", name, extra); };
const res = await fetch(BASE + "/how-it-works"); const html = await res.text();
const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
ok("public route loads signed out (200)", res.status === 200);
for (const t of ["For Buyers", "Who receives your inquiry or requirement", "For Suppliers", "Good to know", "A direct inquiry", "A general requirement", "Post Requirement needs", "no setting to switch it off", "Registering does not verify your business", "not the same as verifying your company", "Confirming an order does not take payment"]) ok(`says: ${t}`, text.includes(t) || (t === "Post Requirement needs" && text.includes("Posting a requirement needs a buyer account")));
for (const t of [/guarantee(d)? (the )?best/i, /payment protection/i, /escrow/i, /within \d+ (hours|minutes)/i, /instant(ly)? (response|reply|quote)/i, /\d+\+? (suppliers|buyers)/i, /every supplier (on|in)/i, /fully verified/i, /opt[- ]?(in|out)/i, /Sample Buyer/i]) ok(`absent: ${t}`, !t.test(text.replace(/not sent to every supplier on Finbyn Mart/i, "").replace(/no minimum number of responses is guaranteed/i, "").replace(/Leads are not guaranteed/i, "")));
ok("states what is not promised: no timing, no guaranteed responses or leads, no ranking, no payment/shipping", /no timing is promised/.test(text) && /no minimum number of responses is guaranteed/.test(text) && /Leads are not guaranteed/.test(text) && /does not rank suppliers/.test(text) && /does not process payments or arrange shipping/.test(text));
ok("distinguishes direct inquiry from general requirement and says guest inquiries are not shared", /A direct inquiry/.test(text) && /A general requirement/.test(text) && /goes only to the supplier you selected/.test(text) && /No supplier is selected/.test(text));
ok("one h1 and no heading level jumps", (html.match(/<h1/g) ?? []).length === 1 && (() => { const hs = [...html.matchAll(/<h([1-4])[ >]/g)].map((m) => +m[1]); let j = 0; for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) j++; return j === 0; })());
const links = [...new Set([...html.matchAll(/<a [^>]*href="(\/[^"#]*)"/g)].map((m) => m[1]))].filter((l) => !l.startsWith("/_next"));
let broken = 0; for (const l of links) { const r = await fetch(BASE + l, { redirect: "manual" }); if (!(r.status === 200 || (r.status >= 300 && r.status < 400))) { broken++; console.log("BROKEN", r.status, l); } }
ok(`every internal link resolves (${links.length})`, broken === 0);
for (const [label, href] of [["Post Your Requirement", "/post-requirement"], ["Browse Products", "/products"], ["Find Suppliers", "/suppliers"], ["Sign Up as Buyer", "/sign-up"], ["Register as Supplier", "/register-supplier"], ["Sign In", "/sign-in"], ["Contact Us", "/contact-us"]]) ok(`CTA ${label} -> ${href}`, new RegExp(`href="${href}"[^>]*>${label}<`).test(html));
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
for (const [w, h] of [[320, 640], [360, 740], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [844, 390], [640, 360]]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: h }); const writes = [], errs = [];
  p.on("request", (r) => { if (!["GET", "HEAD"].includes(r.method()) && r.url().startsWith(BASE)) writes.push(r.method()); });
  p.on("console", (x) => { if (x.type() === "error") errs.push(x.text()); }); p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(BASE + "/how-it-works", { waitUntil: "networkidle0" });
  const m = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, clipped: [...document.querySelectorAll("a,li,h1,h2,h3,p")].filter((e) => !e.classList.contains("visually-hidden") && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== "visible").length, sliders: [...document.querySelectorAll("*")].filter((e) => e.scrollWidth > e.clientWidth + 1 && ["auto", "scroll"].includes(getComputedStyle(e).overflowX) && e.clientWidth > 0).length, noAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).length }));
  ok(`${w}x${h}: no overflow, no clipped text, no horizontal slider, alt present, no writes, no console errors`, m.over <= 0 && m.clipped === 0 && m.sliders === 0 && m.noAlt === 0 && writes.length === 0 && errs.length === 0, JSON.stringify({ ...m, writes: writes.length, errs: errs.slice(0, 1) }));
  if ([320, 1440, 844].includes(w)) await p.screenshot({ path: `${out}/12-how-it-works-${w}x${h}.png`, fullPage: true });
  await p.close();
}
{ const p = await b.newPage(); await p.setViewport({ width: 640, height: 400, deviceScaleFactor: 2 }); await p.goto(BASE + "/how-it-works", { waitUntil: "networkidle0" }); ok("desktop at 200% zoom (640 css px): no horizontal overflow", (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0); await p.close(); }
{ const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 }); await p.goto(BASE + "/how-it-works", { waitUntil: "networkidle0" });
  const seen = new Set(); let vis = 0; for (let i = 0; i < 40; i++) { await p.keyboard.press("Tab"); const s = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { t: e.tagName + (e.textContent || "").trim().slice(0, 16), v: (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none" }; }); if (s) { seen.add(s.t); if (s.v) vis++; } }
  ok("keyboard Tab reaches the CTAs with visible focus", seen.size >= 15 && vis >= seen.size * 0.8, `${seen.size}/${vis}`);
  // contrast of body copy and primary CTA text (computed)
  const ratio = await p.evaluate(() => { const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }; const body = document.querySelector("p[class*=itemBody]"); const bg = getComputedStyle(body.closest("li")).backgroundColor; const cta = [...document.querySelectorAll("a")].find((a) => a.textContent === "Post Your Requirement"); return { body: cr(getComputedStyle(body).color, bg), cta: cr(getComputedStyle(cta).color, getComputedStyle(cta).backgroundColor) }; });
  ok("contrast >= 4.5:1 for body copy and the primary CTA (computed from styles)", ratio.body >= 4.5 && ratio.cta >= 4.5, JSON.stringify(ratio));
  // back/forward
  await p.goto(BASE + "/", { waitUntil: "networkidle0" }); await p.goto(BASE + "/how-it-works", { waitUntil: "networkidle0" }); await p.goBack(); const back = p.url() === BASE + "/"; await p.goForward(); ok("browser back/forward between home and How It Works", back && p.url().endsWith("/how-it-works")); await p.close(); }
console.log(`${n} checks, ${bad} failed`); await b.close();
