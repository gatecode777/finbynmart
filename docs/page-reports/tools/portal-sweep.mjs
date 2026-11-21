// Authenticated portal sweep against the THROWAWAY test database (see test-db-up.mjs / test-db-seed.mjs). Read-only: it signs in as the three seeded test identities, opens every portal page at 1280 and 390,
// and records status, headings, overflow, console errors and write requests. It also checks cross-portal refusal and the header's signed-in state.
// run: BASE=http://localhost:3100 node docs/page-reports/tools/portal-sweep.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE ?? "http://localhost:3100";
const PW = "Test-Passw0rd!x1";
const ROUTES = {
  buyer: ["/buyer/dashboard", "/buyer/inquiries", "/buyer/quotations", "/buyer/quotations/compare", "/buyer/orders", "/buyer/saved-products", "/buyer/saved-suppliers", "/buyer/compare-products", "/buyer/compare-suppliers", "/buyer/profile", "/buyer/addresses", "/buyer/settings", "/buyer/security", "/buyer/support", "/buyer/recently-viewed"],
  supplier: ["/supplier/dashboard", "/supplier/inquiries", "/supplier/quotations", "/supplier/quotations/create", "/supplier/orders", "/supplier/products", "/supplier/products/new", "/supplier/inventory", "/supplier/analytics", "/supplier/company", "/supplier/settings", "/supplier/security", "/supplier/support"],
  admin: ["/admin/dashboard", "/admin/inquiries", "/admin/products", "/admin/buyers", "/admin/suppliers", "/admin/verification", "/admin/categories", "/admin/company-links", "/admin/product-review", "/admin/support", "/admin/quotations", "/admin/reports", "/admin/notifications", "/admin/settings", "/admin/audit-logs"],
};
const FOREIGN = { buyer: ["/supplier/dashboard", "/admin", "/admin/buyers"], supplier: ["/buyer/dashboard", "/admin", "/admin/products"], admin: ["/buyer/dashboard", "/supplier/dashboard"] };
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0; const issues = [];
const rows = [];
for (const role of ["buyer", "supplier", "admin"]) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1280, height: 800 });
  await p.goto(BASE + "/sign-in", { waitUntil: "domcontentloaded" });
  const login = await p.evaluate(async (email, pw) => { const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pw }) }); const j = await r.json().catch(() => ({})); return { status: r.status, path: j.redirectTo ?? j.path ?? null, msg: j.message }; }, `${role}@test.invalid`, PW);
  console.log(`[${role}] sign-in API ${login.status} -> ${login.path ?? login.msg}`);
  for (const w of [1280, 390]) {
    await p.setViewport({ width: w, height: w === 1280 ? 800 : 844 });
    for (const path of ROUTES[role]) {
      const writes = [], errs = [], failed = [];
      const onReq = (r) => { if (!["GET", "HEAD"].includes(r.method()) && r.url().startsWith(BASE)) writes.push(r.method() + " " + new URL(r.url()).pathname); };
      const onRes = (r) => { if (r.url().startsWith(BASE) && r.status() >= 500) failed.push(r.status() + " " + new URL(r.url()).pathname); };
      const onCon = (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 120)); };
      p.on("request", onReq); p.on("response", onRes); p.on("console", onCon); p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
      const r = await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => ({ status: () => "ERR " + e.message.slice(0, 40) }));
      await sleep(1800);
      const m = await p.evaluate(() => ({ h1: document.querySelectorAll("h1").length, over: document.documentElement.scrollWidth - innerWidth, text: document.body.innerText.slice(0, 4000), title: document.title })).catch(() => ({ h1: 0, over: 0, text: "", title: "" }));
      const final = new URL(p.url()).pathname + new URL(p.url()).search;
      const appErr = /Application error|Something went wrong|Internal Server Error|This page couldn.t load|could not be loaded|Try again/i.test(m.text);
      const ok = r.status() === 200 && final.startsWith(path.split("?")[0]) && m.h1 >= 1 && m.over <= 0 && errs.length === 0 && failed.length === 0 && writes.length === 0;
      rows.push({ role, w, path, status: r.status(), final, h1: m.h1, over: m.over, errs: errs.length, failed: failed.join(","), writes: writes.length, appErr });
      if (!ok || appErr) { bad++; issues.push(`${role} ${w} ${path} status=${r.status()} final=${final} h1=${m.h1} over=${m.over} errs=${errs.slice(0, 2).join(" | ")} 5xx=${failed.join(",")} writes=${writes.join(",")} errorText=${appErr}`); }
      p.off("request", onReq); p.off("response", onRes); p.off("console", onCon);
    }
  }
  // cross-portal refusal
  for (const path of FOREIGN[role]) { await p.setViewport({ width: 1280, height: 800 }); await p.goto(BASE + path, { waitUntil: "domcontentloaded" }).catch(() => null); await sleep(800); const final = new URL(p.url()).pathname; const refused = !final.startsWith(path.split("/").slice(0, 2).join("/")) || /sign-in|forbidden|unauthorized/.test(final); console.log(`[${role}] foreign ${path} -> ${final} ${refused ? "REFUSED" : "!! REACHED"}`); if (!refused) { bad++; issues.push(`${role} reached foreign ${path}`); } }
  await ctx.close();
}
console.log(`\nrows ${rows.length}, with issues ${bad}`);
for (const i of issues) console.log("ISSUE", i);
await b.close();
