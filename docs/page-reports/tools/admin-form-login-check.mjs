// Admin sign-in form at /admin/dashboard against the THROWAWAY test database (test-db-up.mjs / test-db-seed.mjs): a signed-out visitor sees the form, a wrong password is an inline error under the field,
// the right one lands on /admin/dashboard, a buyer who signs in through it is NOT taken into the admin portal. run: BASE=http://localhost:3100 node docs/page-reports/tools/admin-form-login-check.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE ?? "http://localhost:3100", PW = "Test-Passw0rd!x1";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
let n = 0, bad = 0; const ok = (name, c, extra = "") => { n++; if (!c) bad++; console.log(c ? "PASS " : "FAIL ", name, extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function attempt(email, password) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1280, height: 800 });
  await p.goto(BASE + "/admin/dashboard", { waitUntil: "domcontentloaded" }); await p.waitForSelector('input[type="email"]'); await sleep(1500);
  const info = await p.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, register: /Sign up as a buyer|Register as a supplier/.test(document.body.innerText), shell: !!document.querySelector("aside, nav[aria-label*=Admin]") }));
  await p.type('input[type="email"]', email); await p.type('input[type="password"]', password);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.type === "submit").click());
  return { p, ctx, info };
}
{ const { p, ctx, info } = await attempt("admin@test.invalid", "wrong-password"); await sleep(1500);
  ok("signed out: /admin/dashboard shows the Admin sign in form, with no registration links and no admin shell", info.h1 === "Admin sign in" && !info.register && !info.shell, JSON.stringify(info));
  ok("a wrong password is an inline error under the password field, and the visitor stays on the form", await p.evaluate(() => { const pw = document.querySelector('input[type="password"]'); const e = document.getElementById(pw.getAttribute("aria-describedby") ?? "x"); return pw.getAttribute("aria-invalid") === "true" && /Incorrect email or password/.test(e?.textContent ?? ""); }) && new URL(p.url()).pathname === "/admin/dashboard");
  await ctx.close(); }
{ const { p, ctx } = await attempt("admin@test.invalid", PW); await sleep(3500);
  ok("the administrator signs in through the form and lands on /admin/dashboard with the dashboard", new URL(p.url()).pathname === "/admin/dashboard" && (await p.evaluate(() => /Admin Dashboard/i.test(document.body.innerText) && !!document.querySelector("section[aria-labelledby=tools-heading]"))), p.url());
  await p.goto(BASE + "/admin", { waitUntil: "domcontentloaded" }); await sleep(1500);
  ok("/admin redirects an administrator to /admin/dashboard", new URL(p.url()).pathname === "/admin/dashboard");
  await ctx.close(); }
{ const { p, ctx } = await attempt("buyer@test.invalid", PW); await sleep(3500);
  ok("a buyer who signs in through the admin form is sent to the buyer portal, not into admin", /^\/buyer\//.test(new URL(p.url()).pathname) || new URL(p.url()).pathname === "/forbidden", p.url());
  await p.goto(BASE + "/admin/dashboard", { waitUntil: "domcontentloaded" }); await sleep(1500);
  ok("and /admin/dashboard is then refused for that buyer", new URL(p.url()).pathname === "/forbidden");
  await ctx.close(); }
console.log(`${n} checks, ${bad} failed`); await b.close();
