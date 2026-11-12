import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Page 39 (Supplier Dashboard: /supplier/dashboard, /api/supplier/dashboard, /api/supplier/dashboard/performance).
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test, Chrome and puppeteer-core (see build-and-serve-test.sh).
// Companies are linked to sellers by writing `sellerKeys` directly (the platform does that). Removes its own data at the end unless KEEP=1.
const BASE = process.env.BASE || "http://localhost:3100";
const ROOT = "R:/indiamartref";
const TEST_DB = "finbynmart_test";
const SHOTS = `${ROOT}/docs/page-reports/screenshots`;
const require = createRequire(`${ROOT}/`);
const { MongoClient, ObjectId } = require("mongodb");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === TEST_DB) throw new Error("Refusing: the configured live database is named like the test database.");
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const db = client.db(TEST_DB);
const users = db.collection("users"), inq = db.collection("inquiries"), qts = db.collection("quotations"), companies = db.collection("supplier_companies"), orders = db.collection("orders");
await db.collection("rate_limits").deleteMany({});

const stamp = Date.now();
const emailOf = (t) => `t39-${stamp}-${t}@example.test`;
let ipN = 0;
const nextIp = () => `10.39.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "supplier dashboard test passphrase";
const DAY = 86_400_000;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const rand8 = () => { const b = randomBytes(8); let s = ""; for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % 32]; return s; };
const ago = (d) => new Date(Date.now() - d * DAY);
const inFuture = (d) => new Date(Date.now() + d * DAY);

class Session {
  jar = new Map();
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  async call(method, p, payload) {
    const r = await fetch(BASE + p, { method, headers: { "x-forwarded-for": nextIp(), ...(payload !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}) }, body: payload === undefined ? undefined : JSON.stringify(payload), redirect: "manual" });
    for (const line of r.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); this.jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    let json = null, text = null;
    try { text = await r.text(); json = JSON.parse(text); } catch {}
    return { status: r.status, json, text, headers: r.headers };
  }
  async page(p) {
    const r = await fetch(BASE + p, { headers: { "x-forwarded-for": nextIp(), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}) }, redirect: "manual" });
    return { status: r.status, text: await r.text(), location: r.headers.get("location") };
  }
}
const registerBuyer = async (tag) => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Dash ${tag} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: "Alpha Garments Pvt Ltd", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register buyer: ${r.status} ${r.text}`);
  return { s, id: (await users.findOne({ email: emailOf(tag) }))._id };
};
const registerSupplier = async (tag, keys) => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/supplier", { businessName: `Dash ${tag.toUpperCase()} Traders`, contactName: `Sia ${tag}`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk for businesses.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register supplier: ${r.status} ${r.text}`);
  const user = await users.findOne({ email: emailOf(tag) });
  await s.call("GET", "/api/supplier/dashboard");
  await companies.updateOne({ ownerUserId: user._id }, { $set: { sellerKeys: keys } });
  return { s, id: user._id };
};

const SELLER_A = { supplierKey: "shree-textiles", supplierName: "Shree Textiles", supplierSlug: "shree-textiles", source: "sample" };
const SELLER_B = { supplierKey: "sunrise-hub", supplierName: "Sunrise Hub", supplierSlug: "sunrise-hub", source: "sample" };
const mkInq = (buyerId, seller, over = {}) => ({ buyerId, buyerType: "REGISTERED", reference: `FBM-INQ-${rand8()}`, ...seller, productName: "Cotton Fabric", categoryName: "Textiles", quantity: 1000, unit: "Meter", message: "Private buyer message.", inquiryType: "GET_BEST_QUOTE", status: "NEW", createdAt: ago(2), updatedAt: ago(2), ...over });

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
async function open(p, { width = 1440, session } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/40\d|409|429|50\d|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  if (session) await page.setCookie(...[...session.jar].map(([name, value]) => ({ name, value, url: BASE })));
  await page.setViewport({ width, height: 900 });
  const resp = await page.goto(BASE + p, { waitUntil: "networkidle2" });
  page.errs = errs; page.status = resp.status(); page.context = context;
  return page;
}
const text = (p) => p.evaluate(() => (document.querySelector("#supplier-content") ?? document.body).textContent.replace(/\s+/g, " "));
const created = [];

async function main() {
  const BA = await registerBuyer("buyer");
  const SA = await registerSupplier("a", [SELLER_A.supplierKey]);
  const SN = await registerSupplier("none", []);
  created.push(BA.id, SA.id, SN.id);

  // seller A: 3 inquiries in the last 30 days (2 awaiting: one "new", one IN_PROGRESS; 1 QUOTED), 1 older than 90 days, 1 for another seller
  const i1 = mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S39AAAA1", status: "new", createdAt: ago(1) });
  const i2 = mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S39AAAA2", status: "IN_PROGRESS", createdAt: ago(5), productName: "Silk Fabric" });
  const i3 = mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S39AAAA3", status: "QUOTED", createdAt: ago(10) });
  const i4 = mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S39AAAA4", status: "CLOSED", createdAt: ago(120) });
  const ib = mkInq(BA.id, SELLER_B, { reference: "FBM-INQ-S39BBBB1", productName: "Sunrise Secret Product" });
  const ins = await inq.insertMany([i1, i2, i3, i4, ib]);
  const iid = ins.insertedIds;
  const qd = (n, over) => ({ reference: `FBM-QT-S39AAAA${n}`, version: 1, isCurrent: true, inquiryId: iid[0], inquiryReference: "FBM-INQ-S39AAAA1", buyerId: BA.id, ...SELLER_A, productName: "Cotton Fabric", currency: "INR", unit: "Meter", quantity: 10, unitPriceMinor: 1000, validUntil: inFuture(20), status: "SENT", sentAt: ago(3), createdAt: ago(3), updatedAt: ago(3), events: [], ...over });
  await qts.insertMany([qd("1", { version: 2 }), qd("2", { validUntil: ago(1) }), qd("3", { version: 1, isCurrent: false, status: "SUPERSEDED", reference: "FBM-QT-S39AAAA1" }), qd("4", { status: "ACCEPTED", accepted: true }), { ...qd("5", {}), ...SELLER_B }]);
  const od = (n, over) => ({ reference: `FBM-ORD-S39AAA${n}`, buyerId: BA.id, ...SELLER_A, status: "CONFIRMED", placedAt: ago(4), items: [], currency: "INR", totalMinor: 100, itemCount: 0, events: [], updatedAt: new Date(), ...over });
  await orders.insertMany([od("1", {}), od("2", { status: "PENDING_CONFIRMATION" }), od("3", { status: "CANCELLED" }), od("4", { placedAt: ago(200) })]);

  // ===== access
  const un = new Session();
  check("A-01 no session: dashboard and chart APIs answer 401", (await un.call("GET", "/api/supplier/dashboard")).status === 401 && (await un.call("GET", "/api/supplier/dashboard/performance")).status === 401);
  check("A-02 a buyer gets 403 on both APIs and is redirected from the page to /forbidden", (await BA.s.call("GET", "/api/supplier/dashboard")).status === 403 && (await BA.s.call("GET", "/api/supplier/dashboard/performance")).status === 403 && /forbidden/.test((await BA.s.page("/supplier/dashboard")).location ?? ""));
  const pun = await un.page("/supplier/dashboard");
  check("A-03 the page without a session goes to sign-in and renders no company data", [302, 307].includes(pun.status) && /sign-in/.test(pun.location ?? "") && !/Dash A Traders/.test(pun.text));

  // ===== numbers
  const d = await SA.s.call("GET", "/api/supplier/dashboard?range=30d");
  const sum = d.json?.data?.summary?.data;
  check("B-01 total inquiries for 30 days = 3 (the 120-day-old one and the other seller's are not counted)", d.status === 200 && sum?.totalInquiries.value === 3, JSON.stringify(sum?.totalInquiries));
  check("B-02 pending responses = 2 (a legacy 'new' and IN_PROGRESS), right now and not period bound", sum?.pendingResponses.value === 2 && sum.pendingResponses.scope === "now");
  check("B-03 active quotations = 1: current, sent, valid (the expired, superseded, accepted and the other seller's are not active)", sum?.activeQuotations.value === 1, String(sum?.activeQuotations.value));
  check("B-04 confirmed orders = 1 (pending, cancelled and the 200-day-old one are not counted)", sum?.confirmedOrders.value === 1, String(sum?.confirmedOrders.value));
  check("B-05 a longer period changes the period metrics only: 90 days still 3 inquiries; this-month works", (await SA.s.call("GET", "/api/supplier/dashboard?range=90d")).json.data.summary.data.totalInquiries.value === 3 && (await SA.s.call("GET", "/api/supplier/dashboard?range=this-month")).status === 200);
  const dn = await SN.s.call("GET", "/api/supplier/dashboard");
  check("B-06 a company with no linked seller has genuine zeros and no recent inquiries or products", dn.json.data.summary.data.totalInquiries.value === 0 && dn.json.data.summary.data.activeQuotations.value === 0 && dn.json.data.recentInquiries.data.length === 0 && dn.json.data.company.linkedSellers === 0);
  const recent = d.json.data.recentInquiries.data;
  check("B-07 recent inquiries: only the company's own seller, newest first, buyer by business name", recent.length === 4 && recent[0].reference === "FBM-INQ-S39AAAA1" && recent.every((r) => !/SUNRISE|S39BBBB/.test(r.reference + r.product)) && recent[0].buyer === "Alpha Garments Pvt Ltd");
  check("B-08 no email, phone, buyer id or private message is in the dashboard response", !/@example\.test|9876543210|buyerId|Private buyer message|Sunrise Secret/.test(d.text));
  check("B-09 unavailable things are marked unavailable with a reason, never zero: response time, notifications; capabilities say replies, notifications and product management are off (quotation creation is on since Page 43)", d.json.data.snapshot.data.averageResponseTime.available === false && d.json.data.notifications.available === false && d.json.data.capabilities.responsesAvailable === false && d.json.data.capabilities.quotationCreation === true);
  check("B-10 bad periods are refused with 400 (unknown range, future custom end, reversed dates, missing dates)", (await SA.s.call("GET", "/api/supplier/dashboard?range=forever")).status === 400 && (await SA.s.call("GET", "/api/supplier/dashboard?range=custom&startDate=2026-11-01&endDate=2099-01-01")).status === 400 && (await SA.s.call("GET", "/api/supplier/dashboard?range=custom&startDate=2026-11-05&endDate=2026-11-01")).status === 400 && (await SA.s.call("GET", "/api/supplier/dashboard?range=custom")).status === 400);
  check("B-11 a companyId / supplierKey / sellerKeys parameter is never read (still own numbers)", (await SA.s.call("GET", `/api/supplier/dashboard?range=30d&companyId=${SN.id}&supplierKey=sunrise-hub&sellerKeys=sunrise-hub`)).json.data.summary.data.totalInquiries.value === 3);
  const perf = await SA.s.call("GET", "/api/supplier/dashboard/performance?range=30d");
  check("B-12 the chart route returns real series totals: 3 inquiries, 3 quotations (first versions only: a V2 is not a new quotation), 1 order", perf.status === 200 && perf.json.data.totals.inquiries === 3 && perf.json.data.totals.quotations === 3 && perf.json.data.totals.orders === 1, JSON.stringify(perf.json?.data?.totals));
  check("B-13 responses are private / no-store", /no-store/.test(d.headers.get("cache-control") ?? ""));

  // ===== page and browser
  const html = await SA.s.page("/supplier/dashboard");
  check("C-01 the page renders for the supplier: company name, the four KPI labels, noindex", html.status === 200 && html.text.includes("Dash A Traders") && ["Total Inquiries", "Pending Responses", "Active Quotations", "Confirmed Orders"].every((l) => html.text.includes(l)) && /noindex/.test(html.text));
  const noSeller = await SN.s.page("/supplier/dashboard");
  check("C-02 a company with no linked seller sees the explanation, not sample data", /No catalogue seller is linked/.test(noSeller.text));
  check("C-03 a bad period in the address falls back to the default instead of an error", (await SA.s.page("/supplier/dashboard?range=bogus")).status === 200);
  const b = await open("/supplier/dashboard", { session: SA.s });
  const kpis = await b.evaluate(() => [...document.querySelectorAll('[aria-label="Business summary"] li')].map((li) => li.textContent.replace(/\s+/g, " ")));
  check("D-01 the dashboard loads with no console errors and six... four KPI cards with 3, 2, 1, 1", b.status === 200 && b.errs.length === 0 && kpis.length === 4 && /Total Inquiries\s*3/.test(kpis[0]) && /Pending Responses\s*2/.test(kpis[1]) && /Active Quotations\s*1/.test(kpis[2]) && /Confirmed Orders\s*1/.test(kpis[3]), `${b.errs.join(" | ")} ${kpis.join(" | ")}`);
  await b.waitForSelector("#perf-title", { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 1500));
  check("D-02 the chart loads from its own route (an SVG or a data table is present, no error box)", await b.evaluate(() => !!document.querySelector("svg") && !document.querySelector('[role="alert"]')));
  await b.screenshot({ path: `${SHOTS}/39-supplier-dashboard-desktop-1440.png`, fullPage: true });
  await b.select("#sd-range", "90d");
  await b.waitForFunction(() => location.search.includes("range=90d"), { timeout: 8000 });
  check("D-03 choosing 90 days navigates and the server recomputes", /range=90d/.test(b.url()));
  await b.select("#sd-range", "custom");
  await b.waitForSelector("#sd-start", { timeout: 5000 }).catch(() => {});
  const customShown = await b.evaluate(() => !!document.querySelector("#sd-start") && !!document.querySelector("#sd-end"));
  await b.evaluate(() => { const el = document.querySelector("#sd-start"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ""); el.dispatchEvent(new Event("input", { bubbles: true })); });
  await b.click('#supplier-content form button[type="submit"]');
  await b.waitForFunction(() => /Choose both dates|must not be after/.test(document.body.textContent), { timeout: 5000 }).catch(() => {});
  check("D-04 Custom shows two dates and refuses an incomplete range with a message (no request)", customShown && /Choose both dates|must not be after/.test(await text(b)));
  const links = await b.evaluate(() => [...document.querySelectorAll("#supplier-content a")].map((a) => a.getAttribute("href")));
  check("D-05 no link points to a route that does not exist: inquiry references open the inquiry details page (Page 41) and View quotations goes to /supplier/quotations; there is no link to the unbuilt inquiries list, products or orders pages", !links.some((h) => /^\/supplier\/inquiries\/?$|^\/supplier\/products|^\/supplier\/orders/.test(h ?? "")) && links.includes("/supplier/quotations?status=submitted") && links.includes("/supplier/inquiries/FBM-INQ-S39AAAA1"));
  await b.context.close();
  const over = [];
  for (const w of [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560]) {
    const p = await open("/supplier/dashboard", { width: w, session: SA.s });
    const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (o > 0) over.push(`${w}:+${o}`);
    if (w === 390) await p.screenshot({ path: `${SHOTS}/39-supplier-dashboard-mobile-390.png`, fullPage: true });
    await p.context.close();
  }
  check("E-01 no horizontal page overflow at 16 widths from 320 to 2560", over.length === 0, over.join(", "));
  const m = await open("/supplier/dashboard", { width: 390, session: SA.s });
  const mob = await m.evaluate(() => ({ cards: document.querySelectorAll('ul[aria-label="Your latest inquiries"] > li').length, tableShown: getComputedStyle([...document.querySelectorAll("table")].find((t) => t.caption?.textContent === "Your latest inquiries").parentElement).display !== "none" }));
  check("E-02 on a phone the recent inquiries become cards (4) and the table is hidden", mob.cards === 4 && !mob.tableShown, JSON.stringify(mob));
  await m.context.close();
}

let failed = false;
try { await main(); } catch (e) { failed = true; console.error("TEST RUN ABORTED:", e); }
if (!process.env.KEEP) {
  try {
    await qts.deleteMany({ reference: /^FBM-QT-S39/ });
    await inq.deleteMany({ reference: /^FBM-INQ-S39/ });
    await orders.deleteMany({ reference: /^FBM-ORD-S39/ });
    await companies.deleteMany({ ownerUserId: { $in: created } });
    await users.deleteMany({ email: new RegExp(`^t39-${stamp}-`) });
  } catch (e) { console.error("cleanup failed", e.message); }
}
await browser.close();
await client.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed${bad.length ? `; FAILED: ${bad.map((x) => x.name.slice(0, 40)).join(" | ")}` : ""}`);
process.exit(failed || bad.length ? 1 : 0);
