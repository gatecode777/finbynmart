// Admin dashboard (Page 50) against the THROWAWAY test database (test-db-up.mjs, test-db-seed.mjs). It inserts minimal documents carrying ONLY the fields the dashboard counts (a PENDING product review, a
// pending verification, an OPEN and a RESOLVED ticket, a FAILED job, a PARTIAL job without and with an error), signs in as the full admin and as a restricted admin, and checks what each sees.
// Refuses anything but a 127.0.0.1 finbyn_it_* database.   run: MONGODB_URI=$(cat .test-db-uri) MONGODB_DB=finbyn_it_portals BASE=http://localhost:3100 node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/admin-dashboard-check.mjs
import { MongoClient, ObjectId } from "mongodb";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const uri = process.env.MONGODB_URI ?? "", dbName = process.env.MONGODB_DB ?? "", BASE = process.env.BASE ?? "http://localhost:3100", PW = "Test-Passw0rd!x1";
if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(uri) || !/^finbyn_it_[a-z0-9_]+$/.test(dbName)) throw new Error("refusing: not the local throwaway test database");
const { hashPassword } = await import("../../../src/lib/auth/password.ts");
const client = await MongoClient.connect(uri); const db = client.db(dbName);
const now = new Date();
await db.collection("supplier_products").insertOne({ name: "Fixture", draft: { review: { state: "PENDING", submittedAt: now } } }).catch(() => null);
const prodCol = (await db.listCollections().toArray()).map((c) => c.name);
await db.collection("verification_submissions").insertOne({ reference: "FBM-VER-TESTDASH", companyId: new ObjectId(), latest: true, state: "PENDING_REVIEW", revision: 1, createdAt: now });
await db.collection("support_tickets").insertMany([{ ticketReference: "T-OPEN", buyerId: new ObjectId(), idempotencyKey: "k1", status: "OPEN", updatedAt: now }, { ticketReference: "T-WAIT", buyerId: new ObjectId(), idempotencyKey: "k2", status: "WAITING_FOR_BUYER", updatedAt: now }, { ticketReference: "T-DONE", buyerId: new ObjectId(), idempotencyKey: "k3", status: "RESOLVED", updatedAt: now }]);
await db.collection("distribution_jobs").insertMany([{ inquiryId: new ObjectId(), state: "FAILED" }, { inquiryId: new ObjectId(), state: "PARTIAL" }, { inquiryId: new ObjectId(), state: "PARTIAL", lastError: "x" }, { inquiryId: new ObjectId(), state: "NO_MATCHES" }]);
await db.collection("users").updateOne({ email: "limited@test.invalid" }, { $setOnInsert: { name: "Limited Admin", email: "limited@test.invalid", passwordHash: await hashPassword(PW), role: "admin", accountStatus: "ACTIVE", emailVerified: true, adminPermissions: ["buyers.read"], createdAt: now } }, { upsert: true });
console.log("collections with products:", prodCol.filter((n) => /product/.test(n)).join(","));
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
let n = 0, bad = 0; const ok = (name, c, extra = "") => { n++; if (!c) bad++; console.log(c ? "PASS " : "FAIL ", name, extra); };
async function view(email, w = 1280) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: w, height: w === 1280 ? 800 : 844 });
  const writes = [], errs = []; let counting = false; p.on("request", (r) => { if (counting && !["GET", "HEAD"].includes(r.method()) && r.url().startsWith(BASE)) writes.push(r.method()); }); p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 100)); });
  await p.goto(BASE + "/sign-in", { waitUntil: "domcontentloaded" });
  await p.evaluate(async (e, pw) => { await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, password: pw }) }); }, email, PW);
  counting = true;
  await p.goto(BASE + "/admin/dashboard", { waitUntil: "domcontentloaded" }); await new Promise((r) => setTimeout(r, 2000));
  const data = await p.evaluate(() => ({ h1: document.querySelectorAll("h1").length, over: document.documentElement.scrollWidth - innerWidth, stats: [...document.querySelectorAll("section[aria-labelledby=queues-heading] li")].map((li) => li.innerText.replace(/\n+/g, " | ")), tools: [...document.querySelectorAll("section[aria-labelledby=tools-heading] h3 a")].map((a) => a.getAttribute("href")), url: location.pathname }));
  return { p, ctx, data, writes, errs };
}
const full = await view("admin@test.invalid");
console.log("full admin stats:", full.data.stats.join(" || "));
const num = (label) => Number((full.data.stats.find((s) => s.includes(label)) ?? "").split(" | ")[0].replace(/,/g, ""));
ok("full admin lands on /admin/dashboard: one h1, 14 tools (every built page), no overflow", full.data.url === "/admin/dashboard" && full.data.h1 === 1 && full.data.tools.length === 14 && full.data.over <= 0, `tools=${full.data.tools.length}`);
ok("support count = OPEN only here (waiting for the buyer and resolved are not counted)", num("Support tickets") === 1, String(num("Support tickets")));
ok("inquiries needing attention = FAILED + PARTIAL with an error (2), not NO_MATCHES, not PARTIAL without error", num("Inquiries needing attention") === 2, String(num("Inquiries needing attention")));
ok("verifications awaiting review = 1", num("Verifications") === 1, String(num("Verifications")));
ok("products awaiting review shows a number (not the failure dash)", Number.isFinite(num("Products awaiting")), full.data.stats.find((s) => s.includes("Products awaiting")));
ok("unread notifications shows a number", Number.isFinite(num("Unread notifications")));
ok("every card links to its queue page", (await full.p.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=queues-heading] a")].map((a) => a.getAttribute("href")))).every((h) => /^\/admin\/[a-z-]+$/.test(h)));
ok("viewing the dashboard sent no write request and logged no console error", full.writes.length === 0 && full.errs.length === 0, JSON.stringify(full.errs));
fs.mkdirSync("docs/page-reports/screenshots", { recursive: true });
await full.p.screenshot({ path: "docs/page-reports/screenshots/50-admin-dashboard-1280.png", fullPage: true });
await full.ctx.close();
const ltd = await view("limited@test.invalid");
ok("a restricted admin (buyers.read only) sees no queue counts and only Buyers and Settings", ltd.data.stats.length === 0 && ltd.data.tools.join() === "/admin/buyers,/admin/settings", JSON.stringify(ltd.data.tools));
await ltd.ctx.close();
const mob = await view("admin@test.invalid", 390);
ok("390 px: no horizontal overflow, one h1", mob.data.over <= 0 && mob.data.h1 === 1);
await mob.p.screenshot({ path: "docs/page-reports/screenshots/50-admin-dashboard-390.png", fullPage: true }); await mob.ctx.close();
const anon = await fetch(BASE + "/admin/dashboard", { redirect: "manual" }); const anonHtml = await anon.text(); ok("anonymous /admin/dashboard shows the admin sign-in form (no shell, no counts, no registration links)", anon.status === 200 && /Admin sign in/.test(anonHtml) && /type="password"/.test(anonHtml) && !/Needs attention|Sign up as a buyer|Register as a supplier/.test(anonHtml)); const idx = await fetch(BASE + "/admin", { redirect: "manual" }); ok("/admin redirects to /admin/dashboard", idx.status === 307 && /\/admin\/dashboard$/.test(idx.headers.get("location") ?? ""));
console.log(`${n} checks, ${bad} failed`); await b.close(); await client.close();
