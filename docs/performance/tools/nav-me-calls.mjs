// Counts /api/auth/me requests (and other /api calls) while a visitor (AS=buyer@test.invalid signs in first; THROWAWAY database only) loads the homepage and then clicks through three pages (client-side navigation). run: BASE=http://localhost:3100 node docs/performance/tools/nav-me-calls.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE ?? "http://localhost:3100";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 }); let me = 0, other = 0;
p.on("request", (r) => { const u = new URL(r.url()); if (u.pathname === "/api/auth/me") me++; else if (u.pathname.startsWith("/api/")) { other++; console.log("  other:", r.method(), u.pathname); } });
if (process.env.AS) { await p.goto(BASE + "/about-us", { waitUntil: "networkidle0" }); await p.evaluate(async (e) => { await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: e, password: "Test-Passw0rd!x1" }) }); }, process.env.AS); me = 0; other = 0; }
await p.goto(BASE + "/", { waitUntil: "networkidle0" }); const afterLoad = me;
for (const href of ["/about-us", "/how-it-works", "/categories"]) { await p.evaluate((h) => document.querySelector(`a[href="${h}"]`)?.click(), href); await new Promise((r) => setTimeout(r, 1800)); }
console.log(`/api/auth/me calls: ${afterLoad} on first load, ${me} after 3 client-side navigations; other /api calls: ${other}`);
await b.close();
