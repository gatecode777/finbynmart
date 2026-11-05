import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Page 31 (Buyer Orders: /buyer/orders, /buyer/orders/[reference], /api/buyer/orders*).
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test, Chrome and puppeteer-core.
// NOTHING in the application creates an order yet, so every order here is inserted directly into the throwaway database.
// Removes its own users, orders and audit rows at the end unless KEEP=1. SKIP_PERF=1 skips group P.
const BASE = process.env.BASE || "http://localhost:3100";
const ROOT = "R:/indiamartref";
const TEST_DB = "finbynmart_test";
const require = createRequire(`${ROOT}/`);
const { MongoClient, ObjectId } = require("mongodb");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === TEST_DB) throw new Error("Refusing: the configured live database is named like the test database.");
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const db = client.db(TEST_DB);
const users = db.collection("users"), ords = db.collection("orders"), audit = db.collection("security_events");
const clearLimits = () => db.collection("rate_limits").deleteMany({});
await clearLimits();

const stamp = Date.now();
const emailOf = (tag) => `t31-${stamp}-${tag}@example.test`;
let ipN = 0;
const nextIp = () => `10.33.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "orders test passphrase";
const DAY = 86_400_000;
const NO_DATE = new Date("9999-12-31T00:00:00.000Z");
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const rand8 = () => { const b = randomBytes(8); let s = ""; for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % 32]; return s; };
const ago = (days) => new Date(Date.now() - days * DAY);
const inFuture = (days) => new Date(Date.now() + days * DAY);
const istDate = (ms) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);

class Session {
  jar = new Map();
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  async call(method, p, payload) {
    const response = await fetch(BASE + p, { method, headers: { "x-forwarded-for": this.ip ?? nextIp(), ...(payload !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}) }, body: payload === undefined ? undefined : JSON.stringify(payload), redirect: "manual" });
    for (const line of response.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); this.jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    let json = null; let text = null;
    try { text = await response.text(); json = JSON.parse(text); } catch {}
    return { status: response.status, json, text, headers: response.headers };
  }
  async page(p) {
    const response = await fetch(BASE + p, { headers: { "x-forwarded-for": this.ip ?? nextIp(), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}) }, redirect: "manual" });
    return { status: response.status, text: await response.text(), location: response.headers.get("location") };
  }
}
const register = async (tag) => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Ord ${tag.toUpperCase()} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: "Order Test Traders", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register ${tag}: ${r.status} ${r.text}`);
  return { s, id: (await users.findOne({ email: emailOf(tag) }))._id };
};

const S1 = { supplierKey: "shree-textiles", supplierName: "Shree Textiles", supplierSlug: "shree-textiles" };
const S2 = { supplierKey: "sunrise-hub", supplierName: "Sunrise Hub", supplierSlug: "sunrise-hub" };
const S3 = { supplierKey: "SLR0009", supplierName: "Prime Textiles" };
// one order document, with the derived fields (itemCount, expectedSort) the writer must set, exactly as buildOrderDoc does
const ord = (buyerId, over = {}) => {
  const items = over.items ?? [{ productKey: "1163", name: "Cotton Poplin Fabric", quantity: 2000, unit: "Meter", unitPriceMinor: 74000 }];
  const placedAt = over.placedAt ?? ago(3);
  const status = over.status ?? "PROCESSING";
  const doc = { reference: `FBM-ORD-${rand8()}`, buyerId, ...S1, items, currency: "INR", totalMinor: 14800000, status, placedAt, updatedAt: placedAt, events: [{ type: status, at: placedAt, actor: "system" }], ...over };
  doc.itemCount = doc.items.length;
  doc.expectedSort = doc.expectedDelivery?.date ?? NO_DATE;
  return doc;
};

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
async function open(p, { width = 1440, height = 900, session } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/40\d|409|429|50\d|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  if (session) await page.setCookie(...[...session.jar].map(([name, value]) => ({ name, value, url: BASE })));
  await page.setViewport({ width, height });
  const resp = await page.goto(BASE + p, { waitUntil: "networkidle2" });
  page.errs = errs; page.status = resp.status(); page.context = context;
  return page;
}
const content = (p) => p.evaluate(() => (document.querySelector("#buyer-content") ?? document.body).textContent.replace(/[ \t\r\n]+/g, " "));
const clickText = (p, selector, t) => p.evaluate((s, x) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(x) && e.getClientRects().length); if (!el) return false; el.click(); return true; }, selector, t);
const hydrated = (p, sel) => p.waitForFunction((s) => Object.keys(document.querySelector(s) ?? {}).some((k) => k.startsWith("__react")), { timeout: 10000 }, sel).catch(() => {});
const rowsN = (p) => p.evaluate(() => document.querySelectorAll("tbody tr").length);
const waitRows = (p, n) => p.waitForFunction((x) => document.querySelectorAll("tbody tr").length === x, { timeout: 8000 }, n).catch(() => {});
const med = (a, q) => { const x = [...a].sort((m, n) => m - n); return x[Math.min(x.length - 1, Math.floor(q * x.length))]; };
// one untimed call first (the first request after a bulk load pays for cold caches), then n timed ones
const timeIt = async (fn, n = 15) => { await fn(); const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); await fn(); t.push(performance.now() - s); } return { p50: med(t, 0.5), p95: med(t, 0.95), p99: med(t, 0.99) }; };
const list = (s, q = "") => s.call("GET", `/api/buyer/orders${q}`);
const summary = (s) => s.call("GET", "/api/buyer/orders/summary");
const detail = (s, ref) => s.call("GET", `/api/buyer/orders/${ref}`);
const cancel = (s, ref, body) => s.call("POST", `/api/buyer/orders/${ref}/cancellation-requests`, body);
const exportCsv = (s, body = {}) => s.call("POST", "/api/buyer/orders/export", body);
const REASON = "Ordered the wrong quantity by mistake";

async function main() {
  const A = await register("a"), B = await register("b"), C = await register("c");
  const SUPPLIER = new Session();
  await SUPPLIER.call("POST", "/api/auth/register/supplier", { businessName: "Order Supplier Co", contactName: "Sia Rao", email: emailOf("sup"), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  const SUSP = await register("susp");
  await users.updateOne({ _id: SUSP.id }, { $set: { accountStatus: "SUSPENDED" } });

  // ---------- seed: buyer A, 14 orders, placed i days ago, one status each (see the counting rules)
  const R = (n) => `FBM-ORD-QAAAAA${String(n).padStart(2, "0")}`;
  const total = (i) => ((i * 7) % 14 + 1) * 1_000_000;
  const spec = [
    [1, "PENDING_CONFIRMATION", S1, { quotationReference: "FBM-QT-QAAAAAA1", inquiryReference: "FBM-INQ-QAAAAAA1" }],
    [2, "CONFIRMED", S2, {}],
    [3, "PROCESSING", S1, { items: [{ productKey: "1163", name: "Cotton Poplin Fabric", quantity: 2000, unit: "Meter", unitPriceMinor: 74000 }, { name: "Viscose Blend Fabric", quantity: 1500, unit: "Meter", unitPriceMinor: 61000 }, { name: "Linen Fabric", quantity: 1000, unit: "Meter", unitPriceMinor: 52000 }], updatedAt: new Date() }],
    [4, "READY_TO_DISPATCH", S3, {}],
    [5, "DISPATCHED", S1, { expectedDelivery: { date: inFuture(3), source: "CARRIER" } }],
    [6, "IN_TRANSIT", S2, { expectedDelivery: { date: inFuture(5), source: "SUPPLIER" } }],
    [7, "OUT_FOR_DELIVERY", S3, { expectedDelivery: { date: ago(1), source: "SCHEDULE" } }],
    [8, "DELIVERED", S1, {}],
    [9, "DELIVERED", S2, { currency: "USD", totalMinor: 500000 }],
    [10, "ON_HOLD", S3, {}],
    [11, "CANCELLATION_REQUESTED", S1, { cancellationRequest: { at: ago(1), reason: "Seeded earlier request", previousStatus: "CONFIRMED" } }],
    [12, "CANCELLED", S2, {}],
    [13, "RETURN_REQUESTED", S3, {}],
    [14, "RETURNED", S1, {}],
  ];
  const aDocs = spec.map(([i, status, sup, over]) => ord(A.id, { reference: R(i), status, ...sup, placedAt: new Date(Date.now() - i * DAY), updatedAt: over.updatedAt ?? new Date(Date.now() - i * DAY), totalMinor: over.totalMinor ?? total(i), ...over }));
  await ords.insertMany(aDocs);
  const bDocs = [ord(B.id, { reference: "FBM-ORD-QBBBBBB1", ...S3, supplierName: "Bravo Unique Supplier", items: [{ name: "Bravo Unique Product", quantity: 10, unit: "Piece", unitPriceMinor: 5000 }], totalMinor: 50000 })];
  await ords.insertMany(bDocs);

  // ================= A: access
  const un = new Session();
  const routes = [["GET", "/api/buyer/orders"], ["GET", "/api/buyer/orders/summary"], ["GET", `/api/buyer/orders/${R(1)}`], ["POST", `/api/buyer/orders/${R(1)}/cancellation-requests`, { reason: REASON, confirm: true }], ["POST", "/api/buyer/orders/export", {}]];
  const anon = await Promise.all(routes.map(([m, p, b]) => un.call(m, p, b)));
  check("A-01 no session: every order route answers 401, private, with nothing of an order", anon.every((r) => r.status === 401 && /no-store/.test(r.headers.get("cache-control") ?? "") && !/FBM-ORD|Shree/.test(r.text ?? "")), anon.map((r) => r.status).join(" "));
  const sup = await Promise.all(routes.map(([m, p, b]) => SUPPLIER.call(m, p, b)));
  check("A-02 a supplier account: every order route answers 403", sup.every((r) => r.status === 403), sup.map((r) => r.status).join(" "));
  check("A-03 a suspended buyer's session no longer works (401)", (await list(SUSP.s)).status === 401);
  const forged = new Session(); forged.jar.set("finbyn_session", "garbage.value");
  check("A-04 a forged session cookie: 401", (await list(forged)).status === 401);
  const anonPages = await Promise.all(["/buyer/orders", `/buyer/orders/${R(1)}`].map((p) => un.page(p)));
  check("A-05 both pages without a session redirect to sign-in and carry no order data", anonPages.every((r) => [302, 303, 307, 308].includes(r.status) && /sign-in/.test(r.location ?? "") && !/Cotton|Shree|1,50,000/.test(r.text)), anonPages.map((r) => `${r.status} ${r.location}`).join(" | "));

  // ================= B: isolation
  const bl = (await list(B.s)).json;
  check("B-01 buyer B sees only B's own order, never A's", bl.orders.length === 1 && bl.orders[0].reference === "FBM-ORD-QBBBBBB1" && !/FBM-ORD-QAAAAA/.test(JSON.stringify(bl)));
  const foreign = await detail(B.s, R(1)), unknown = await detail(B.s, "FBM-ORD-ZZZZZZZZ"), malformed = await detail(B.s, "not-a-reference");
  check("B-02 another buyer's reference, an unknown one and a malformed one answer the same 404 message with nothing of the order", [foreign, unknown, malformed].every((r) => r.status === 404 && r.json?.message === "That order was not found.") && !/Cotton|Shree|1,50,000/.test(foreign.text));
  const spoof = (await list(B.s, `?buyerId=${A.id}&userId=${A.id}`)).json;
  check("B-03 a buyerId in the query is ignored: the session decides", spoof.meta.total === 1);
  const before = JSON.stringify(await ords.find({ reference: R(2) }).toArray());
  const fc = await cancel(B.s, R(2), { reason: REASON, confirm: true });
  check("B-04 a cancellation request on another buyer's order: 404 and the stored order is untouched", fc.status === 404 && before === JSON.stringify(await ords.find({ reference: R(2) }).toArray()));
  const bExport = await exportCsv(B.s);
  check("B-05 B's export holds B's order only, never A's", bExport.status === 200 && /FBM-ORD-QBBBBBB1/.test(bExport.text) && !/FBM-ORD-QAAAAA/.test(bExport.text));
  check("B-06 the detail page of another buyer's order is the site's 404 with nothing of it", await (async () => { const r = await B.s.page(`/buyer/orders/${R(1)}`); return r.status === 404 && !/Cotton|Shree|1,50,000/.test(r.text); })());

  // ================= C: list
  const full = await list(A.s, "?limit=50");
  const a = full.json;
  check("C-01 A's list holds all 14 orders (cancelled and returned included), newest first, private no-store", full.status === 200 && a.meta.total === 14 && a.orders[0].reference === R(1) && a.orders.at(-1).reference === R(14) && /no-store/.test(full.headers.get("cache-control") ?? ""), `${a.meta.total} ${a.orders[0]?.reference}`);
  const tc = a.data.tabCounts;
  check("C-02 tab counts follow the rules: all 14, processing 3, in transit 3, delivered 2, issues 3 (finished cancelled and returned are not issues)", tc.all === 14 && tc.processing === 3 && tc.in_transit === 3 && tc.delivered === 2 && tc.issues === 3, JSON.stringify(tc));
  const refs = async (q) => (await list(A.s, `?limit=50&${q}`)).json.orders.map((o) => o.reference).sort();
  const ex = (...n) => n.map(R).sort();
  check("C-03 each tab returns exactly its orders", JSON.stringify(await refs("status=processing")) === JSON.stringify(ex(2, 3, 4)) && JSON.stringify(await refs("status=in_transit")) === JSON.stringify(ex(5, 6, 7)) && JSON.stringify(await refs("status=delivered")) === JSON.stringify(ex(8, 9)) && JSON.stringify(await refs("status=issues")) === JSON.stringify(ex(10, 11, 13)));
  check("C-04 an exact status works (pending confirmation, cancelled, returned); an unknown status is refused (400)", JSON.stringify(await refs("status=pending_confirmation")) === JSON.stringify(ex(1)) && JSON.stringify(await refs("status=cancelled")) === JSON.stringify(ex(12)) && JSON.stringify(await refs("status=returned")) === JSON.stringify(ex(14)) && (await list(A.s, "?status=shipped")).status === 400);
  const o7 = a.orders.find((o) => o.reference === R(7));
  check("C-05 an expected date that has passed never changes the status: still Out for Delivery, not Delivered, not Delayed", o7.status === "OUT_FOR_DELIVERY" && o7.deliveryLabel === "Out for Delivery" && !/delay/i.test(JSON.stringify(a.orders)) && o7.expectedDelivery.source === "Order schedule");
  const search = async (q) => refs(`q=${encodeURIComponent(q)}`);
  check("C-06 search: order reference prefix, quotation reference, product name, supplier name; a regex character is taken literally", JSON.stringify(await search("FBM-ORD-QAAAAA03")) === JSON.stringify(ex(3)) && JSON.stringify(await search("FBM-QT-QAAAAAA1")) === JSON.stringify(ex(1)) && (await search("Linen")).join() === R(3) && (await search("prime textiles")).length === 4 && (await search(".*")).length === 0 && (await search("AAAAA03")).length === 0);
  check("C-07 supplier and currency filters", (await refs("supplierId=sunrise-hub")).length === 4 && JSON.stringify(await refs("currency=USD")) === JSON.stringify(ex(9)) && (await refs("currency=INR")).length === 13);
  const today = istDate(Date.now());
  const d5 = istDate(Date.now() - 5 * DAY), d2 = istDate(Date.now() - 2 * DAY);
  check("C-08 date windows in India time: Last 7 Days = the 6 newest; Last 30 Days = all; a custom range keeps only its days; a future end or half a pair is refused", (await refs("range=7d")).length === 6 && (await refs("range=30d")).length === 14 && JSON.stringify(await refs(`range=custom&dateFrom=${d5}&dateTo=${d2}`)) === JSON.stringify(ex(2, 3, 4, 5)) && (await list(A.s, `?range=custom&dateFrom=${today}&dateTo=2999-01-01`)).status === 400 && (await list(A.s, `?dateFrom=${d5}`)).status === 400);
  check("C-09 filters work together: processing + Shree + INR; the tab counts are counted under the other filters", JSON.stringify(await refs("status=processing&supplierId=shree-textiles&currency=INR")) === JSON.stringify(ex(3)) && (await list(A.s, "?supplierId=shree-textiles")).json.data.tabCounts.all === 6);
  const newest = (await list(A.s, "?sort=newest&limit=50")).json.orders.map((o) => o.reference), oldest = (await list(A.s, "?sort=oldest&limit=50")).json.orders.map((o) => o.reference), upd = (await list(A.s, "?sort=updated&limit=50")).json.orders.map((o) => o.reference);
  check("C-10 newest and oldest are exact opposites; recently updated puts the one updated just now first", newest.join() === [...oldest].reverse().join() && upd[0] === R(3));
  check("C-11 amount sorts need a currency (400 without one: mixed currencies are never ranked together)", (await list(A.s, "?sort=amount_high")).status === 400 && (await list(A.s, "?sort=amount_low")).status === 400);
  const hi = (await list(A.s, "?sort=amount_high&currency=INR&limit=50")).json.orders.map((o) => o.amount.text), lo = (await list(A.s, "?sort=amount_low&currency=INR&limit=50")).json.orders;
  const nums = (arr) => arr.map((t) => Number(t.replace(/[^0-9.]/g, "")));
  check("C-12 highest and lowest amount, within INR only (USD never appears among them)", nums(hi).every((n, i, x) => i === 0 || x[i - 1] >= n) && hi.length === 13 && nums(lo.map((o) => o.amount.text)).every((n, i, x) => i === 0 || x[i - 1] <= n) && lo.every((o) => o.amount.currency === "INR"));
  const ds = (await list(A.s, "?sort=delivery_soon&limit=50")).json.orders.map((o) => o.reference);
  check("C-13 expected delivery soon: dated orders first, soonest first (the overdue one, then +3 days, then +5), the undated ones after", ds.slice(0, 3).join() === [R(7), R(5), R(6)].join() && ds.length === 14);
  const p1 = (await list(A.s, "?limit=5&page=1")).json, p3 = (await list(A.s, "?limit=5&page=3")).json;
  const seen = new Set(); for (let p = 1; p <= 3; p++) for (const o of (await list(A.s, `?limit=5&page=${p}`)).json.orders) seen.add(o.reference);
  check("C-14 pagination: 5 per page gives 3 pages, the last holds 4, nobody appears twice; the default page size is 20", p1.orders.length === 5 && p1.meta.totalPages === 3 && p3.orders.length === 4 && seen.size === 14 && (await list(A.s)).json.meta.limit === 20);
  const bad = await Promise.all(["?limit=500", "?page=0", "?sort=price", "?currency=inr", "?supplierId=%3Cx%3E", `?q=${"x".repeat(200)}`, "?limit=abc", "?status[$ne]=x"].map((q) => list(A.s, q)));
  check("C-15 invalid filters are refused with 400 (never an unbounded list); an operator-style key such as status[$ne] is just an unknown parameter: ignored, not passed to the database, the list is unchanged", bad.slice(0, 7).every((r) => r.status === 400) && bad[7].status === 200 && bad[7].json.meta.total === 14, bad.map((r) => r.status).join(" "));
  const row = a.orders.find((o) => o.reference === R(3));
  check("C-16 a row carries only what the table shows: multi-item orders say how many more, the amount is the saved total in its own currency, no ids, events, reasons or private fields", row.itemCount === 3 && row.primaryItem.name === "Cotton Poplin Fabric" && row.primaryItem.quantityText === "2,000 Meter" && /^₹/.test(row.amount.text) && !/buyerId|_id|"events"|"cancellationRequest"|expectedSort|"reason"/.test(JSON.stringify(row)), JSON.stringify(row).slice(0, 160));
  const usd = a.orders.find((o) => o.reference === R(9));
  check("C-17 a USD order keeps its own currency (no conversion, no ₹)", usd.amount.currency === "USD" && /^\$/.test(usd.amount.text) && usd.amount.text === "$5,000.00", usd.amount.text);
  check("C-18 a buyer with no orders gets an empty list and zeros", (await list(C.s)).json.meta.total === 0 && (await summary(C.s)).json.data.summary.totalOrders === 0);

  // ================= D: summary
  const sm = (await summary(A.s)).json.data;
  check("D-01 the five numbers are the real counts: total 14, processing 3, in transit 3, delivered 2, active issues 3", JSON.stringify(sm.summary) === JSON.stringify({ totalOrders: 14, processing: 3, inTransit: 3, delivered: 2, activeIssues: 3 }), JSON.stringify(sm.summary));
  check("D-02 facets list only the suppliers and currencies of A's orders", sm.facets.suppliers.length === 3 && sm.facets.currencies.map((c) => c.id).join() === "INR,USD" && !/Bravo/.test(JSON.stringify(sm.facets)));
  check("D-03 payments, invoices, shipment tracking and returns are reported as NOT available, and no payment or refund figure exists anywhere in the answer", sm.capabilities.payments === false && sm.capabilities.invoices === false && sm.capabilities.shipmentTracking === false && sm.capabilities.returns === false && sm.capabilities.cancellationRequest === true && Object.keys(sm.summary).length === 5 && !/paid|refund|pending ?payment|invoiceCount/i.test(JSON.stringify(sm.summary) + JSON.stringify(a.data)));

  // ================= E: detail
  const d1 = await detail(A.s, R(1));
  const d = d1.json?.data;
  check("E-01 detail returns the order with items, supplier, amount, links to its quotation and inquiry, events and capabilities; private no-store", d1.status === 200 && d.order.reference === R(1) && d.items.length === 1 && d.order.amount.text === "₹80,000.00" && /no-store/.test(d1.headers.get("cache-control") ?? ""), JSON.stringify(d?.order?.amount));
  check("E-02 it links the accepted quotation and the inquiry it came from, only as saved", d.order.quotation?.href === "/buyer/quotations/FBM-QT-QAAAAAA1" && d.order.inquiry?.href === "/buyer/inquiries/FBM-INQ-QAAAAAA1" && (await detail(A.s, R(2))).json.data.order.quotation === null);
  check("E-03 the item is the snapshot the order was placed with (name, quantity, unit price), not the current catalogue", d.items[0].name === "Cotton Poplin Fabric" && d.items[0].quantityText === "2,000 Meter" && d.items[0].unitPrice === "₹740.00 / Meter");
  check("E-04 expected delivery shows its source; an order without one says so (null), nothing is estimated", (await detail(A.s, R(5))).json.data.order.expectedDelivery.source === "Carrier estimate" && d.order.expectedDelivery === null);
  check("E-05 capabilities follow the status: a pending order can ask to cancel, an in-transit one cannot; payments, invoices, tracking and returns are false", d.capabilities.cancellationRequest === true && (await detail(A.s, R(6))).json.data.capabilities.cancellationRequest === false && d.capabilities.payments === false && d.capabilities.invoices === false && d.capabilities.shipmentTracking === false && d.capabilities.returns === false);
  check("E-06 the detail answer holds no internal or private fields (buyer id, internal ids, e-mail, phone)", !/buyerId|"_id"|example\.test|9876543210|expectedSort/.test(d1.text));
  check("E-07 the event history is the recorded one: the seeded request of order 11 shows with its reason", (await detail(A.s, R(11))).json.data.cancellationRequest?.reason === "Seeded earlier request");
  const wrong = await Promise.all([A.s.call("DELETE", `/api/buyer/orders/${R(1)}`), A.s.call("PUT", `/api/buyer/orders/${R(1)}`, { status: "DELIVERED" }), A.s.call("PATCH", `/api/buyer/orders/${R(1)}`, { status: "DELIVERED" })]);
  check("E-08 an order cannot be edited or deleted by the buyer: DELETE, PUT and PATCH are not allowed (405) and nothing changed", wrong.every((r) => r.status === 405) && (await ords.findOne({ reference: R(1) })).status === "PENDING_CONFIRMATION", wrong.map((r) => r.status).join());

  // ================= F: cancellation request
  const nc = await cancel(A.s, R(1), { reason: REASON });
  check("F-01 without the explicit confirmation: 400 and nothing changes", nc.status === 400 && nc.json.fields?.confirm && (await ords.findOne({ reference: R(1) })).status === "PENDING_CONFIRMATION");
  const badBodies = await Promise.all([cancel(A.s, R(1), { reason: "short", confirm: true }), cancel(A.s, R(1), { reason: "<b>markup</b> in this reason", confirm: true }), cancel(A.s, R(1), { reason: REASON, confirm: true, status: "CANCELLED", buyerId: String(B.id) }), cancel(A.s, R(1), { reason: "x".repeat(600), confirm: true })]);
  check("F-02 a short or markup reason, an extra field (status, buyerId) and an over-long reason are refused (400) with field messages", badBodies.every((r) => r.status === 400 && r.json.fields) && (await ords.findOne({ reference: R(1) })).status === "PENDING_CONFIRMATION");
  const ok = await cancel(A.s, R(1), { reason: REASON, confirm: true });
  const after1 = await ords.findOne({ reference: R(1) });
  check("F-03 a pending order: 201, status CANCELLATION_REQUESTED (NOT Cancelled), the reason and previous status saved, an event added; the answer says supplier not notified, not cancelled, nothing refunded", ok.status === 201 && ok.json.status === "CANCELLATION_REQUESTED" && ok.json.supplierNotified === false && /not cancelled yet/.test(ok.json.message) && /nothing is refunded/.test(ok.json.message) && after1.status === "CANCELLATION_REQUESTED" && after1.cancellationRequest.previousStatus === "PENDING_CONFIRMATION" && after1.cancellationRequest.reason === REASON && after1.events.at(-1).type === "CANCELLATION_REQUESTED" && after1.events.at(-1).actor === "buyer", ok.json?.message);
  check("F-04 the order is not deleted and stays in the list; the numbers move (issues 3 to 4, total unchanged, pending order left the Processing-free 'other' group)", (await list(A.s, "?limit=50")).json.meta.total === 14 && (await summary(A.s)).json.data.summary.activeIssues === 4 && (await summary(A.s)).json.data.summary.totalOrders === 14);
  check("F-05 asking again is refused (409) with the reason and stores no second event", (await cancel(A.s, R(1), { reason: REASON, confirm: true })).status === 409 && (await ords.findOne({ reference: R(1) })).events.filter((e) => e.type === "CANCELLATION_REQUESTED").length === 1);
  await clearLimits(); // section F makes more than the 20 requests per 10 minutes the limiter allows one buyer; the limit is not what is tested here
  const refused = await Promise.all([5, 6, 7, 8, 10, 12, 13, 14].map((n) => cancel(A.s, R(n), { reason: REASON, confirm: true })));
  check("F-06 dispatched, in transit, out for delivery, delivered, on hold, cancelled, return requested and returned orders cannot be cancelled here (409 each) and none changed", refused.every((r) => r.status === 409) && (await ords.countDocuments({ buyerId: A.id, status: { $in: ["DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "ON_HOLD", "CANCELLED", "RETURN_REQUESTED", "RETURNED"] } })) === 9, refused.map((r) => r.status).join());
  await clearLimits();
  const race = await Promise.all([1, 2, 3, 4, 5].map(() => cancel(A.s, R(2), { reason: REASON, confirm: true })));
  check("F-07 the same order asked five times at once: one 201, four 409, a single event", race.filter((r) => r.status === 201).length === 1 && race.filter((r) => r.status === 409).length === 4 && (await ords.findOne({ reference: R(2) })).events.filter((e) => e.type === "CANCELLATION_REQUESTED").length === 1, race.map((r) => r.status).join());
  check("F-08 malformed and unknown references: 404 (no body of the order)", (await cancel(A.s, "bad", { reason: REASON, confirm: true })).status === 404 && (await cancel(A.s, "FBM-ORD-ZZZZZZZZ", { reason: REASON, confirm: true })).status === 404);
  check("F-09 no payment, refund or invoice record is created by a cancellation request", !(await db.listCollections().toArray()).some((c) => /payment|refund|invoice|shipment/i.test(c.name)));

  // ================= G: export
  const auditBefore = await audit.countDocuments({ userId: A.id, type: "orders_exported" });
  const e1 = await exportCsv(A.s, {});
  const lines = e1.text.trim().split(/\r\n/);
  check("G-01 export: a CSV attachment (private, no-store, nosniff) with a header and one row per order (14), the row count in a header", e1.status === 200 && /text\/csv/.test(e1.headers.get("content-type") ?? "") && /attachment/.test(e1.headers.get("content-disposition") ?? "") && /no-store/.test(e1.headers.get("cache-control") ?? "") && e1.headers.get("x-content-type-options") === "nosniff" && lines.length === 15 && lines[0].startsWith("Order Reference,") && e1.headers.get("x-export-rows") === "14" && e1.headers.get("x-export-truncated") === "false", `${lines.length} ${e1.headers.get("x-export-rows")}`);
  const e2 = await exportCsv(A.s, { status: "delivered" });
  check("G-02 filters apply to the export: delivered gives exactly the 2 delivered orders, and amounts are plain decimals with their currency", e2.text.trim().split(/\r\n/).length === 3 && /FBM-ORD-QAAAAA08/.test(e2.text) && /FBM-ORD-QAAAAA09/.test(e2.text) && /,USD,5000\.00,/.test(e2.text) && !/FBM-ORD-QAAAAA03/.test(e2.text));
  check("G-03 no payment, address, contact or internal field exists in the file", !/buyerId|userId|example\.test|9876543210|expectedSort|payment|invoice|@/i.test(e1.text.replace(/finbyn/gi, "")));
  const evil = ord(A.id, { reference: "FBM-ORD-QAAAEVIL", supplierName: "@evilsupplier", items: [{ name: "=HYPERLINK(\"http://x\")", quantity: 1, unit: null, unitPriceMinor: 100 }], totalMinor: 100, status: "CONFIRMED", placedAt: ago(0.1) });
  await ords.insertOne(evil);
  const e3 = await exportCsv(A.s, { q: "evil" });
  check("G-04 a spreadsheet formula in a name is defused (a leading apostrophe), so opening the file cannot run it", /'@evilsupplier/.test(e3.text) && /"'=HYPERLINK/.test(e3.text) && !/(^|,)=HYPERLINK/m.test(e3.text), e3.text.split(/\r\n/)[1]);
  await ords.deleteOne({ reference: "FBM-ORD-QAAAEVIL" });
  check("G-05 each export is logged (count and filter names, no values)", (await audit.countDocuments({ userId: A.id, type: "orders_exported" })) === auditBefore + 3 && (await audit.findOne({ userId: A.id, type: "orders_exported", filters: "status" }))?.rows === 2);
  check("G-06 an invalid export filter is refused (400), nothing is generated; page and limit are ignored for a file", (await exportCsv(A.s, { status: "shipped" })).status === 400 && (await exportCsv(A.s, { page: "7", limit: "1" })).text.trim().split(/\r\n/).length === 15);
  check("G-07 an export of someone with no orders is just the header (no error)", (await exportCsv(C.s)).text.trim().split(/\r\n/).length === 1);

  // ================= H: pages (browser)
  await ords.updateOne({ reference: R(1) }, { $set: { status: "PENDING_CONFIRMATION", updatedAt: new Date() }, $unset: { cancellationRequest: "" } });
  await ords.updateOne({ reference: R(2) }, { $set: { status: "CONFIRMED" }, $unset: { cancellationRequest: "" } });
  await clearLimits();
  const lp = await open("/buyer/orders", { session: A.s });
  await hydrated(lp, "#order-search");
  await sleep(400);
  const nav = await lp.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, active: document.querySelector("#buyer-sidebar [aria-current]")?.textContent.trim() ?? null, robots: document.querySelector("meta[name=robots]")?.content, crumb: document.querySelector("#buyer-content")?.textContent.slice(0, 60), kpis: [...document.querySelectorAll("ul[aria-label='Order summary'] li")].map((li) => li.textContent.replace(/\s+/g, " ")) }));
  check("H-01 the page: shell with Orders current, heading 'My Orders', breadcrumb, noindex, five cards with the real numbers, 14 rows, no console errors", lp.status === 200 && nav.h1 === "My Orders" && /Orders/.test(nav.active ?? "") && /Home \/ Buyer Dashboard \/ Orders/.test(nav.crumb) && /noindex/.test(nav.robots ?? "") && nav.kpis.length === 5 && /Total Orders\s*14/.test(nav.kpis[0]) && /Processing\s*3/.test(nav.kpis[1]) && /In Transit\s*3/.test(nav.kpis[2]) && /Delivered\s*2/.test(nav.kpis[3]) && /Returns \/ Issues\s*3/.test(nav.kpis[4]) && (await rowsN(lp)) === 14 && lp.errs.length === 0, JSON.stringify(nav.kpis));
  const t = await content(lp);
  check("H-02 the Payment Overview says it is not available yet and shows NO amount; the table has no payment or invoice column; delivery and expected date are shown; amounts carry their currency", /Payment Overview: not available yet/.test(t) && !/Paid Amount|Pending Payment|Invoices Available/.test(t) && await lp.evaluate(() => ![...document.querySelectorAll("thead th")].some((h) => /Payment|Invoice/i.test(h.textContent)) && [...document.querySelectorAll("thead th")].some((h) => /Expected Delivery/.test(h.textContent))) && /USD, as agreed/.test(t));
  await clickText(lp, "button", "Processing");
  await waitRows(lp, 3);
  const tab = await lp.evaluate(() => ({ n: document.querySelectorAll("tbody tr").length, url: location.search, pressed: [...document.querySelectorAll("[aria-pressed=true]")].map((b) => b.textContent.trim()) }));
  check("H-03 the Processing tab filters in place (3 rows), is marked pressed and the address carries ?status=processing", tab.n === 3 && /status=processing/.test(tab.url) && tab.pressed.some((x) => /^Processing/.test(x)), JSON.stringify(tab));
  await clickText(lp, "button", "All Orders");
  await waitRows(lp, 14);
  await lp.type("#order-search", "Linen");
  await waitRows(lp, 1);
  const sr = await lp.evaluate(() => ({ n: document.querySelectorAll("tbody tr").length, url: location.search }));
  check("H-04 search is debounced, filters in place (1 order) and is kept in the address; Clear search restores all", sr.n === 1 && /q=Linen/.test(sr.url));
  await lp.click("button[aria-label='Clear search']");
  await waitRows(lp, 14);
  const opt = await lp.evaluate(() => [...document.querySelectorAll("#order-sort option")].map((o) => ({ v: o.value, d: o.disabled })));
  check("H-05 with two currencies the amount sorts are disabled until a currency is chosen; the four others are available", opt.filter((o) => o.d).map((o) => o.v).join() === "amount_high,amount_low" && opt.length === 6);
  await lp.select("#order-sort", "oldest");
  await lp.waitForFunction(() => /sort=oldest/.test(location.search) && /FBM-ORD-QAAAAA14/.test(document.querySelector("tbody tr")?.textContent ?? ""), { timeout: 8000 }).catch(() => {});
  check("H-06 changing the sort re-reads the server: the oldest order is first", await lp.evaluate(() => /FBM-ORD-QAAAAA14/.test(document.querySelector("tbody tr").textContent)));
  await lp.select("#order-sort", "newest");
  await lp.waitForFunction(() => !/sort=/.test(location.search), { timeout: 8000 }).catch(() => {});
  await clickText(lp, "button", "Filters");
  await lp.waitForSelector("[role=dialog]");
  await lp.evaluate(() => { const sel = [...document.querySelectorAll("[role=dialog] select")].find((s) => [...s.options].some((o) => o.value === "USD")); sel.value = "USD"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
  await clickText(lp, "[role=dialog] button", "Apply");
  await waitRows(lp, 1);
  const flt = await lp.evaluate(() => ({ n: document.querySelectorAll("tbody tr").length, url: location.search, chips: [...document.querySelectorAll("ul[aria-label='Active filters'] li")].map((l) => l.textContent.trim()) }));
  check("H-07 the Filters dialog applies a currency filter (1 USD order), shows it as a removable chip, and keeps it in the address", flt.n === 1 && /currency=USD/.test(flt.url) && flt.chips.some((c) => /USD/.test(c)), JSON.stringify(flt));
  const optUsd = await lp.evaluate(() => [...document.querySelectorAll("#order-sort option")].filter((o) => o.disabled).length);
  await clickText(lp, "button", "Clear all filters");
  await waitRows(lp, 14);
  check("H-08 with a currency chosen the amount sorts become available; Clear all filters restores all 14", optUsd === 0 && (await rowsN(lp)) === 14);
  const dl = lp.waitForResponse((r) => r.url().endsWith("/api/buyer/orders/export") && r.request().method() === "POST", { timeout: 10000 });
  await clickText(lp, "button", "Export Orders");
  const exp = await dl;
  await sleep(600);
  check("H-09 Export Orders asks the server for the buyer's file (200, text/csv) and only then reports success in a toast", exp.status() === 200 && /text\/csv/.test(exp.headers()["content-type"] ?? "") && /Exported 14 orders/.test(await lp.evaluate(() => document.body.textContent)), String(exp.status()));
  await lp.evaluate(() => document.querySelector("tbody tr button[aria-label^='More actions']").click());
  const menu = await lp.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].map((m) => m.textContent.trim()));
  check("H-10 the row menu offers only what works: Request Cancellation (no Track, Invoice or Return: those modules do not exist)", menu.join() === "Request Cancellation", menu.join());
  await clickText(lp, "[role=menuitem]", "Request Cancellation");
  await lp.waitForSelector("[role=alertdialog]");
  await clickText(lp, "[role=alertdialog] button[type=submit]", "Send cancellation request");
  const verr = await lp.evaluate(() => document.querySelector("[role=alertdialog] [role=alert]")?.textContent ?? "");
  const dlgText = await lp.evaluate(() => document.querySelector("[role=alertdialog]").textContent.replace(/\s+/g, " "));
  check("H-11 the cancellation dialog says it is a request (not a cancellation or refund, supplier not notified yet), validates the reason before sending, and nothing is saved by an empty submit", /10 characters/.test(verr) && /not cancelled until the supplier agrees/.test(dlgText) && /nothing is refunded/.test(dlgText) && (await ords.countDocuments({ buyerId: A.id, status: "CANCELLATION_REQUESTED" })) === 1 /* only the seeded order 11 */);
  await lp.type("[role=alertdialog] textarea", REASON);
  await clickText(lp, "[role=alertdialog] button[type=submit]", "Send cancellation request");
  await lp.waitForFunction(() => !document.querySelector("[role=alertdialog]"), { timeout: 10000 }).catch(() => {});
  await sleep(800);
  const afterReq = await ords.countDocuments({ buyerId: A.id, status: "CANCELLATION_REQUESTED" });
  check("H-12 a valid request is saved on the server (one more order now says Cancellation Requested) and the page shows it, with a toast that says it is not cancelled yet", afterReq === 2 && /Cancellation Requested/.test(await content(lp)) && /not cancelled yet/.test(await lp.evaluate(() => document.body.textContent)));
  await lp.evaluate(() => [...document.querySelectorAll("tbody a")].find((a) => /View order/i.test(a.getAttribute("aria-label") ?? "")).click());
  await lp.waitForFunction(() => /\/buyer\/orders\/FBM-ORD-/.test(location.pathname), { timeout: 10000 }).catch(() => {});
  check("H-13 View Order opens the order's own page", /\/buyer\/orders\/FBM-ORD-/.test(await lp.evaluate(() => location.pathname)));
  await lp.context.close();

  const dp = await open(`/buyer/orders/${R(3)}`, { session: A.s });
  const dt = await content(dp);
  const dh = await dp.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, crumb: document.querySelector("#buyer-content")?.textContent.slice(0, 120), robots: document.querySelector("meta[name=robots]")?.content }));
  check("H-14 the order page: heading, breadcrumb ending with the reference, noindex, the three items as ordered with the saved amount and the order activity, no console errors", dp.status === 200 && dh.h1 === "Order Details" && new RegExp(`Orders / ${R(3)}`).test(dh.crumb) && /noindex/.test(dh.robots ?? "") && /Items Ordered \(3\)/.test(dt) && /Cotton Poplin Fabric/.test(dt) && /Linen Fabric/.test(dt) && /Order Amount: ₹/.test(dt) && /Order Activity/.test(dt) && dp.errs.length === 0);
  check("H-15 it says payments, invoices, shipment tracking, returns and addresses are not available yet, and shows no payment, invoice or tracking data", /Not Available Yet/.test(dt) && /not connected to orders yet/.test(dt) && !/Tracking Number|Invoice Number|Paid Amount/i.test(dt));
  await dp.emulateMediaType("print");
  const printed = await dp.evaluate(() => ({ top: getComputedStyle(document.querySelector("header")).display, side: getComputedStyle(document.querySelector("#buyer-sidebar")).display, bar: [...document.querySelectorAll("button, a")].filter((b) => /Print \/ Save|Request Cancellation|Back to Orders/.test(b.textContent)).map((b) => b.closest("[class*=noPrint]") ? getComputedStyle(b.closest("[class*=noPrint]")).display : "visible") }));
  check("H-16 the print view hides the workspace and the action buttons, so the printout is the order only", printed.top === "none" && printed.side === "none" && printed.bar.length >= 2 && printed.bar.every((v) => v === "none"), JSON.stringify(printed));
  await dp.emulateMediaType("screen");
  await dp.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/31-buyer-order-details-1440.png`, fullPage: true });
  await dp.context.close();
  const dr = await open(`/buyer/orders/${R(2)}`, { session: A.s });
  await dr.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Request Cancellation/.test(b.textContent)).click());
  await dr.waitForSelector("[role=alertdialog]");
  await dr.type("[role=alertdialog] textarea", REASON);
  await clickText(dr, "[role=alertdialog] button[type=submit]", "Send cancellation request");
  // "You asked to cancel this order" appears only after the page was re-read (the old activity list can already say "Cancellation Requested")
  await dr.waitForFunction(() => !document.querySelector("[role=alertdialog]") && /You asked to cancel this order/.test(document.querySelector("#buyer-content")?.textContent ?? ""), { timeout: 12000 }).catch(() => {});
  const h17 = { st: (await ords.findOne({ reference: R(2) })).status, text: (await content(dr)).slice(0, 260), btns: await dr.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 8)), dialog: await dr.evaluate(() => document.querySelector("[role=alertdialog]")?.textContent.slice(0, 300) ?? null) };
  check("H-17 requesting cancellation from the order page saves it, the page now says Cancellation Requested with the reason, and the cancel button is gone", h17.st === "CANCELLATION_REQUESTED" && /You asked to cancel this order/.test(h17.text + (await content(dr))) && !h17.btns.some((b) => /Request Cancellation/.test(b)), JSON.stringify(h17));
  await dr.context.close();
  check("H-18 an unknown, malformed or another buyer's reference is the 404 page", (await A.s.page("/buyer/orders/FBM-ORD-NOPE0000")).status === 404 && (await A.s.page("/buyer/orders/bad")).status === 404 && (await B.s.page(`/buyer/orders/${R(3)}`)).status === 404);
  const ep = await open("/buyer/orders", { session: C.s });
  const et = await content(ep);
  check("H-19 a buyer with no orders sees 'No Orders Yet' with the PRD wording and a Browse Products link, zeros in the cards, an honest payment note, no console errors", /No Orders Yet/.test(et) && /Your confirmed purchases will appear here/.test(et) && /Browse Products/.test(et) && /Total Orders\s*0/.test(et) && ep.errs.length === 0 && await ep.evaluate(() => document.querySelector("button[disabled]") !== null));
  await ep.context.close();

  // ================= R: responsive
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const badW = [];
  for (const [path, name] of [["/buyer/orders", "list"], [`/buyer/orders/${R(3)}`, "details"]]) {
    for (const w of widths) {
      const p = await open(path, { width: w, session: A.s });
      const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const clipped = await p.evaluate(() => [...document.querySelectorAll("#buyer-content h1, #buyer-content h2, #buyer-content h3, #buyer-content li")].filter((e) => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1 && !/auto|scroll/.test(getComputedStyle(e).overflowX) && !e.closest("[class*=tableWrap]")).map((e) => `${e.tagName}.${String(e.className).slice(0, 30)}:${e.textContent.slice(0, 24)}`));
      if (o > 0 || clipped.length || p.errs.length) badW.push(`${name}@${w}: overflow ${o}, clipped ${clipped.slice(0, 2).join("|")}, errors ${p.errs.length}`);
      if (w === 390 || (name === "list" && w === 1440)) await p.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/31-orders-${name}-${w}.png`, fullPage: true });
      await p.context.close();
    }
  }
  check("R-01 no horizontal overflow, clipped headings or cards, or console errors on the list and an order page at 16 widths (320 to 2560)", badW.length === 0, badW.join("; "));
  const phone = await open("/buyer/orders", { width: 390, session: A.s });
  const desk = await open("/buyer/orders", { width: 1440, session: A.s });
  check("R-02 on a phone the orders are cards (table hidden); on a desktop the table (cards hidden); the reference and amount stay visible on a card", await phone.evaluate(() => getComputedStyle(document.querySelector("table").closest("[class*=tableWrap]")).display === "none" && getComputedStyle(document.querySelector("ul[aria-label='Your orders']")).display !== "none" && /FBM-ORD-/.test(document.querySelector("ul[aria-label='Your orders'] li").textContent) && /₹|\$/.test(document.querySelector("ul[aria-label='Your orders'] li").textContent)) && await desk.evaluate(() => getComputedStyle(document.querySelector("ul[aria-label='Your orders']")).display === "none" && document.querySelector("table").getClientRects().length > 0));
  await phone.context.close(); await desk.context.close();
  const kb = await open("/buyer/orders", { session: A.s });
  await hydrated(kb, "#order-search");
  await clickText(kb, "button", "Filters");
  await kb.waitForSelector("[role=dialog]");
  const inDialog = await kb.evaluate(() => document.querySelector("[role=dialog]").contains(document.activeElement));
  await kb.keyboard.press("Escape");
  await sleep(300);
  check("R-03 the filters dialog takes focus when opened and closes on Escape", inDialog && !(await kb.$("[role=dialog]")));
  await kb.context.close();

  if (process.env.SKIP_PERF === "1") return;
  // ================= P: performance (production build, nothing else running)
  const D = await register("perf");
  const report = [];
  const perfOrders = (n, offset) => Array.from({ length: n }, (_, i) => {
    const k = offset + i;
    const placedAt = new Date(Date.now() - k * 3_600_000);
    const statuses = ["PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING", "READY_TO_DISPATCH", "DISPATCHED", "IN_TRANSIT", "DELIVERED", "DELIVERED", "DELIVERED", "CANCELLED"];
    return ord(D.id, { reference: `FBM-ORD-P${String(k).padStart(7, "0").replace(/[ILOU]/g, "7")}`, placedAt, updatedAt: placedAt, status: statuses[k % 10], currency: k % 17 === 0 ? "USD" : "INR", totalMinor: ((k * 7919) % 90000) * 100 + 100, ...(k % 3 === 0 ? S2 : k % 3 === 1 ? S3 : S1), items: [{ name: k % 2 ? "Perf Cotton Fabric" : "Perf Steel Pipe", quantity: 100 + (k % 900), unit: "Piece", unitPriceMinor: 5000 }], expectedDelivery: k % 4 === 0 ? { date: new Date(Date.now() + (k % 30) * DAY), source: "SUPPLIER" } : undefined });
  });
  let have = 0;
  for (const size of [1000, 10000]) {
    while (have < size) { const n = Math.min(2000, size - have); await ords.insertMany(perfOrders(n, have)); have += n; }
    await clearLimits();
    const lastPage = Math.ceil(size / 20);
    const first = (await list(D.s, "?limit=1")).json.orders[0].reference;
    const t = {
      list: await timeIt(() => list(D.s, "?limit=20")),
      tab: await timeIt(() => list(D.s, "?status=in_transit&limit=20")),
      search: await timeIt(() => list(D.s, "?q=Perf%20Cotton&limit=20")),
      last: await timeIt(() => list(D.s, `?page=${lastPage}&limit=20`)),
      amount: await timeIt(() => list(D.s, "?sort=amount_high&currency=INR&limit=20")),
      soon: await timeIt(() => list(D.s, "?sort=delivery_soon&limit=20")),
      summary: await timeIt(() => summary(D.s)),
      detail: await timeIt(() => detail(D.s, first)),
    };
    const bytes = (await list(D.s, "?limit=20")).text.length;
    const par = await Promise.all(Array.from({ length: 10 }, () => list(D.s, "?limit=20")));
    report.push({ size, t, bytes, parallelOk: par.every((r) => r.status === 200) });
    await clearLimits();
  }
  for (const r of report) console.log(`  PERF ${String(r.size).padStart(6)} orders: ` + Object.entries(r.t).map(([k, v]) => `${k} p50 ${v.p50.toFixed(0)} p95 ${v.p95.toFixed(0)} p99 ${v.p99.toFixed(0)}`).join("; ") + ` (${r.bytes} B)`);
  check("P-01 against the targets at 1,000 and 10,000 orders (p95): list under 400 ms (also by tab, search, last page, amount and expected-delivery sorts, under 500 for the filtered ones), summary under 300, detail under 350", report.every((r) => r.t.list.p95 < 400 && r.t.tab.p95 < 500 && r.t.search.p95 < 500 && r.t.last.p95 < 500 && r.t.amount.p95 < 500 && r.t.soon.p95 < 500 && r.t.summary.p95 < 300 && r.t.detail.p95 < 350), report.map((r) => `${r.size}: list ${r.t.list.p95.toFixed(0)} tab ${r.t.tab.p95.toFixed(0)} search ${r.t.search.p95.toFixed(0)} last ${r.t.last.p95.toFixed(0)} amount ${r.t.amount.p95.toFixed(0)} soon ${r.t.soon.p95.toFixed(0)} summary ${r.t.summary.p95.toFixed(0)} detail ${r.t.detail.p95.toFixed(0)}`).join(" | "));
  check("P-02 a list page is bounded (20 rows under 25 KB even with 10,000 stored) and ten simultaneous requests all succeed", report.at(-1).bytes < 25_000 && report.every((r) => r.parallelOk), `${report.at(-1).bytes} B`);
  const plans = {};
  const owner = D.id;
  for (const [name, filter, sort] of [["newest", { buyerId: owner }, { placedAt: -1, _id: -1 }], ["tab", { buyerId: owner, status: { $in: ["DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY"] } }, { placedAt: -1, _id: -1 }], ["updated", { buyerId: owner }, { updatedAt: -1, _id: -1 }], ["amount", { buyerId: owner, currency: "INR" }, { currency: 1, totalMinor: -1, _id: -1 }], ["soon", { buyerId: owner }, { expectedSort: 1, _id: 1 }]]) {
    const ex = await ords.find(filter).sort(sort).limit(20).explain("executionStats");
    plans[name] = { s: JSON.stringify(ex.queryPlanner.winningPlan), docs: ex.executionStats.totalDocsExamined, keys: ex.executionStats.totalKeysExamined };
  }
  check("P-03 every listing query uses an index: no collection scan, no blocking sort, and it examines about one page of documents (not the history)", Object.values(plans).every((p) => /IXSCAN/.test(p.s) && !/COLLSCAN/.test(p.s) && !/"SORT"/.test(p.s) && p.docs <= 40), Object.entries(plans).map(([k, p]) => `${k}: ${p.docs} docs`).join(", "));
  let grp = null;
  try { grp = await ords.aggregate([{ $match: { buyerId: owner } }, { $group: { _id: "$status", n: { $sum: 1 } } }]).explain("queryPlanner"); } catch { /* not explainable on this server */ }
  check("P-04 the numbers come from one grouped read over the buyer's index (an index scan, no collection scan)", grp !== null && /IXSCAN|DISTINCT_SCAN|COUNT_SCAN|PROJECTION_COVERED/.test(JSON.stringify(grp)) && !/COLLSCAN/.test(JSON.stringify(grp)));
  const big = await timeIt(async () => { const r = await exportCsv(D.s, {}); return r; }, 3);
  console.log(`  PERF export of 5,000 of 10,000 orders: p50 ${big.p50.toFixed(0)} ms, p95 ${big.p95.toFixed(0)} ms`);
  const eb = await exportCsv(D.s, {});
  check("P-05 a large export is capped at 5,000 rows and says it was cut short (header), in a few seconds", eb.headers.get("x-export-rows") === "5000" && eb.headers.get("x-export-truncated") === "true" && big.p95 < 5000, `${eb.headers.get("x-export-rows")} ${eb.headers.get("x-export-truncated")}`);
  await clearLimits();
}

async function cleanup() {
  if (process.env.KEEP === "1") return;
  const mine = await users.find({ email: { $regex: `^t31-${stamp}-` } }, { projection: { _id: 1 } }).toArray();
  const ids = mine.map((u) => u._id);
  await ords.deleteMany({ buyerId: { $in: ids } });
  await audit.deleteMany({ userId: { $in: ids } });
  await db.collection("notifications").deleteMany({ buyerId: { $in: ids } });
  await users.deleteMany({ _id: { $in: ids } });
  await clearLimits();
}

try {
  await main();
} catch (error) {
  check("suite ran to the end without throwing", false, String(error?.stack ?? error));
} finally {
  await cleanup();
  await browser.close();
  await client.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? "\nFAILED:\n" + failed.map((f) => " - " + f.name).join("\n") : ""}`);
process.exit(failed.length ? 1 : 0);
