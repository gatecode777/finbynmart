// Header signed-in state against the THROWAWAY test database (see test-db-up.mjs / test-db-seed.mjs): a signed-in visitor must never be shown "Sign In", even when the first /api/auth/me call fails.
// run: BASE=http://localhost:3100 node docs/page-reports/tools/header-session-check.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE ?? "http://localhost:3100", PW = "Test-Passw0rd!x1";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
let n = 0, bad = 0; const ok = (name, c, extra = "") => { n++; if (!c) bad++; console.log(c ? "PASS " : "FAIL ", name, extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1280, height: 800 });
await p.goto(BASE + "/sign-in", { waitUntil: "domcontentloaded" });
await p.evaluate(async (pw) => { await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "buyer@test.invalid", password: pw }) }); }, PW);
// what the visitor can see in the header at every moment: record whether a visible "Sign In" link ever appears
async function watch(label, fail) {
  const pg = await ctx.newPage(); await pg.setViewport({ width: 1280, height: 800 });
  let calls = 0; await pg.setRequestInterception(true);
  pg.on("request", (r) => { if (r.url().endsWith("/api/auth/me")) { calls++; if (fail && calls <= fail) return r.respond({ status: 503, contentType: "application/json", body: JSON.stringify({ user: null, unavailable: true }) }); } r.continue(); });
  await pg.evaluateOnNewDocument(() => { window.__sawGuest = false; const t = setInterval(() => { const l = [...document.querySelectorAll('nav[aria-label="Account actions"] a[href="/sign-in"]')].find((a) => { const nav = a.closest("nav"); return nav && getComputedStyle(nav).visibility !== "hidden" && a.getBoundingClientRect().width > 0; }); if (l) window.__sawGuest = true; }, 20); setTimeout(() => clearInterval(t), 9000); });
  await pg.goto(BASE + "/", { waitUntil: "domcontentloaded" }); await sleep(6500);
  const r = await pg.evaluate(() => ({ guest: window.__sawGuest, dash: !!document.querySelector('a[href="/buyer/dashboard"]') }));
  ok(`${label}: never shows "Sign In" to the signed-in buyer, and ends on the buyer dashboard link`, r.guest === false && r.dash === true, JSON.stringify({ ...r, meCalls: calls }));
  await pg.close();
}
await watch("normal load", 0);
await watch("first /api/auth/me call fails (503)", 1);
await watch("first two calls fail", 2);
// a signed-out visitor still gets the guest header (after the answer arrives)
const g = await b.createBrowserContext(); const gp = await g.newPage(); await gp.setViewport({ width: 1280, height: 800 }); await gp.goto(BASE + "/", { waitUntil: "domcontentloaded" }); await sleep(2500);
ok("a signed-out visitor sees Sign In", await gp.evaluate(() => { const a = document.querySelector('nav[aria-label="Account actions"] a[href="/sign-in"]'); return !!a && getComputedStyle(a.closest("nav")).visibility !== "hidden"; }));
// the API: unavailable is not "signed out"
const me = await fetch(BASE + "/api/auth/me"); ok("/api/auth/me answers 200 with user null when nobody is signed in", me.status === 200 && (await me.json()).user === null);
console.log(`${n} checks, ${bad} failed`); await b.close();
