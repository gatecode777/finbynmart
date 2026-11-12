import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Page 45 (Supplier Orders: /supplier/orders, /supplier/orders/[reference], /api/supplier/orders/*).
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test, Chrome and puppeteer-core (see build-and-serve-test.sh).
// Nothing in the application creates an order yet, so every order here is inserted directly into the throwaway database, and a company is linked
// to its sellers by writing `sellerKeys` directly (the platform does that; a company cannot claim a seller itself).
// Removes its own users, inquiries, quotations, companies and notifications at the end unless KEEP=1. SKIP_PERF=1 skips the large-data group.
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
const users = db.collection("users"), inq = db.collection("inquiries"), qts = db.collection("quotations"), companies = db.collection("supplier_companies"), notes = db.collection("notifications");
const clearLimits = () => db.collection("rate_limits").deleteMany({});
await clearLimits();

const stamp = Date.now();
const emailOf = (tag) => `t45-${stamp}-${tag}@example.test`;
let ipN = 0;
const nextIp = () => `10.45.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "supplier quotation test passphrase";
const DAY = 86_400_000;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const rand8 = () => { const b = randomBytes(8); let s = ""; for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % 32]; return s; };
const inFuture = (days) => new Date(Date.now() + days * DAY);
const ago = (days) => new Date(Date.now() - days * DAY);

class Session {
  jar = new Map();
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  async call(method, p, payload, headers = {}) {
    const response = await fetch(BASE + p, { method, headers: { "x-forwarded-for": this.ip ?? nextIp(), ...(payload !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}), ...headers }, body: payload === undefined ? undefined : JSON.stringify(payload), redirect: "manual" });
    for (const line of response.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); this.jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    let json = null; let text = null;
    try { text = await response.text(); json = JSON.parse(text); } catch {}
    return { status: response.status, json, text, headers: response.headers };
  }
  async page(p) {
    const response = await fetch(BASE + p, { headers: { "x-forwarded-for": this.ip ?? nextIp(), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}) }, redirect: "manual" });
    return { status: response.status, text: await response.text(), location: response.headers.get("location"), headers: response.headers };
  }
}
const registerBuyer = async (tag, company = "Quotation Test Traders") => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Quote ${tag.toUpperCase()} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: company, password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register buyer ${tag}: ${r.status} ${r.text}`);
  const user = await users.findOne({ email: emailOf(tag) });
  return { s, id: user._id, email: emailOf(tag) };
};
const registerSupplier = async (tag, keys) => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/supplier", { businessName: `Supplier ${tag.toUpperCase()} Co`, contactName: `Sia ${tag.toUpperCase()}`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register supplier ${tag}: ${r.status} ${r.text}`);
  const user = await users.findOne({ email: emailOf(tag) });
  await s.call("GET", "/api/supplier/quotations/summary"); // resolves (creates) the company row
  await companies.updateOne({ ownerUserId: user._id }, { $set: { sellerKeys: keys } });
  return { s, id: user._id, email: emailOf(tag) };
};

const SELLER_A = { supplierKey: "shree-textiles", supplierName: "Shree Textiles", supplierSlug: "shree-textiles" };
const SELLER_B = { supplierKey: "sunrise-hub", supplierName: "Sunrise Hub", supplierSlug: "sunrise-hub" };
const mkInquiry = async (buyerId, seller, over = {}) => {
  const createdAt = ago(20);
  const reference = over.reference ?? `FBM-INQ-${rand8()}`;
  const doc = { buyerId, buyerType: "REGISTERED", reference, ...seller, productName: "Cotton Fabric", categoryName: "Textiles", quantity: 1000, unit: "Meter", message: "Private requirement message.", inquiryType: "GET_BEST_QUOTE", deliveryLocation: { text: "Jaipur, Rajasthan 302001" }, consent: { accepted: true, at: createdAt, policyVersion: null, termsPath: "/terms-and-conditions", privacyPath: "/privacy-policy" }, notification: { status: "BLOCKED", reason: "No service configured.", at: createdAt }, status: "QUOTED", statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: createdAt }], createdAt, updatedAt: createdAt, ...over };
  const { insertedId } = await inq.insertOne(doc);
  return { _id: insertedId, reference };
};
const qdoc = (buyerId, iq, seller, over = {}) => {
  const sentAt = over.sentAt ?? ago(3);
  return { reference: `FBM-QT-${rand8()}`, version: 1, isCurrent: true, inquiryId: iq._id, inquiryReference: iq.reference, buyerId, ...seller, productName: "Cotton Fabric", currency: "INR", unit: "Meter", quantity: 1000, unitPriceMinor: 74000, validUntil: inFuture(30), status: "SENT", sentAt, createdAt: over.createdAt ?? sentAt, updatedAt: over.updatedAt ?? sentAt, events: [{ type: "SENT", at: sentAt, actor: "supplier" }], ...over };
};

const med = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
// the API allows 240 requests a minute per user: each timed group starts from a clean counter so a 429 is never timed as an answer
const timeIt = async (fn, n = 30) => { await clearLimits(); for (let i = 0; i < 3; i++) await fn(); /* untimed warm-up: connections and first-use code */ const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); await fn(); t.push(performance.now() - s); } return { p50: med(t, 0.5), p95: med(t, 0.95), p99: med(t, 0.99) }; };
const fmt = (t) => `p50 ${t.p50.toFixed(0)} ms, p95 ${t.p95.toFixed(0)} ms, p99 ${t.p99.toFixed(0)} ms`;
const list = (s, q = "") => s.call("GET", `/api/supplier/quotations${q}`);
const refsOf = (r) => (r.json?.quotations ?? []).map((q) => q.reference);

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
async function open(p, { width = 1440, height = 900, session } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.dialogs = [];
  page.on("dialog", (d) => { page.dialogs.push(d.message()); d.dismiss(); });
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/40\d|409|429|50\d|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  if (session) await page.setCookie(...[...session.jar].map(([name, value]) => ({ name, value, url: BASE })));
  await page.setViewport({ width, height });
  const resp = await page.goto(BASE + p, { waitUntil: "networkidle2" });
  page.errs = errs; page.status = resp.status(); page.context = context;
  return page;
}
const content = (p) => p.evaluate(() => (document.querySelector("#supplier-content") ?? document.body).textContent.replace(/[ \t\r\n]+/g, " "));
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// wait for the expected state (rows in the table and, if given, a piece of the address) instead of a fixed pause: the database is remote
const rowsIs = (n, urlPart) => globalThis.__page.waitForFunction((count, part) => document.querySelectorAll("table tbody tr").length === count && (!part || location.search.includes(part)), { timeout: 10000 }, n, urlPart).catch(() => {});
const created = { users: [], inquiries: [], companyOwners: [] };

// ---------------------------------------------------------------- Page 45 specifics
const orders = db.collection("orders");
const outbox = db.collection("notification_outbox");
const API = "/api/supplier/orders";
const olist = (s, q = "") => s.call("GET", `${API}${q}`);
const orefs = (r) => (r.json?.orders ?? []).map((o) => o.reference);
const sha = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const waitFor = (p, fn, arg, timeout = 10000) => p.waitForFunction(fn, { timeout }, arg).catch(() => false);
const tableRows = (p) => p.evaluate(() => document.querySelectorAll("table tbody tr").length);

const STATUSES = ["PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING", "READY_TO_DISPATCH", "DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "ON_HOLD", "CANCELLATION_REQUESTED", "RETURN_REQUESTED", "RETURNED"];
const NO_DATE = new Date("9999-12-31T00:00:00.000Z");
const mkOrder = (buyerId, seller, reference, over = {}) => {
  const placedAt = over.placedAt ?? ago(1);
  const status = over.status ?? "PROCESSING";
  const items = over.items ?? [{ name: "Cotton poplin fabric", quantity: 500, unit: "Meter", unitPriceMinor: 12300 }];
  const doc = { reference, buyerId, supplierKey: seller.supplierKey, supplierName: seller.supplierName, supplierSlug: seller.supplierSlug, items, itemCount: items.length, currency: "INR", totalMinor: 6150000, status, events: [{ type: status, at: placedAt, actor: "system" }], expectedSort: NO_DATE, placedAt, updatedAt: placedAt, ...over };
  doc.itemCount = doc.items.length;
  return doc;
};
const created45 = { orders: [] };

async function main45() {
  const BA = await registerBuyer("ba", "Alpha Garments Pvt Ltd");
  const BB = await registerBuyer("bb", "Bravo Retail LLP With A Remarkably Long Registered Name Pvt Ltd");
  const SA = await registerSupplier("a", [SELLER_A.supplierKey]);
  const SB = await registerSupplier("b", [SELLER_B.supplierKey]);
  const SN = await registerSupplier("none", []);
  const SE = await registerSupplier("empty", ["s45-seller-without-orders"]);
  const SS = await registerSupplier("susp", [SELLER_A.supplierKey]);
  await companies.updateOne({ ownerUserId: SS.id }, { $set: { status: "SUSPENDED" } });
  created.users.push(BA.id, BB.id, SA.id, SB.id, SN.id, SE.id, SS.id);

  // ---------- seed: supplier A's seller (18 orders, every stored status at least once), supplier B's seller (2), related inquiry / quotations
  const IQA = await mkInquiry(BA.id, SELLER_A, { reference: "FBM-INQ-S45AAAA1" });
  const IQB = await mkInquiry(BA.id, SELLER_B, { reference: "FBM-INQ-S45BBBB1" });
  await qts.insertMany([qdoc(BA.id, IQA, SELLER_A, { reference: "FBM-QT-S45AAAA1" }), qdoc(BA.id, IQB, SELLER_B, { reference: "FBM-QT-S45BBBB1" })]);
  const O = (n) => `FBM-ORD-S45A${String(n).padStart(4, "0")}`;
  const seeds = [
    mkOrder(BA.id, SELLER_A, O(1), { status: "PENDING_CONFIRMATION", placedAt: ago(1), quotationReference: "FBM-QT-S45AAAA1", inquiryReference: "FBM-INQ-S45AAAA1" }),
    mkOrder(BA.id, SELLER_A, O(2), { status: "CONFIRMED", placedAt: ago(2), totalMinor: 3840000, items: [{ name: "Woven cotton", quantity: 300, unit: "Meter", unitPriceMinor: 12800 }] }),
    mkOrder(BA.id, SELLER_A, O(3), { status: "PROCESSING", placedAt: ago(3), totalMinor: 4200000, items: [{ name: "Linen blend", productKey: "1163", quantity: 200, unit: "Meter", unitPriceMinor: 21000 }] }),
    mkOrder(BA.id, SELLER_A, O(4), { status: "READY_TO_DISPATCH", placedAt: ago(4) }),
    mkOrder(BA.id, SELLER_A, O(5), { status: "DISPATCHED", placedAt: ago(5) }),
    mkOrder(BA.id, SELLER_A, O(6), { status: "IN_TRANSIT", placedAt: ago(6) }),
    mkOrder(BA.id, SELLER_A, O(7), { status: "OUT_FOR_DELIVERY", placedAt: ago(7) }),
    mkOrder(BA.id, SELLER_A, O(8), { status: "DELIVERED", placedAt: ago(8) }),
    mkOrder(BA.id, SELLER_A, O(9), { status: "CANCELLED", placedAt: ago(9) }),
    mkOrder(BA.id, SELLER_A, O(10), { status: "ON_HOLD", placedAt: ago(10) }),
    mkOrder(BA.id, SELLER_A, O(11), { status: "CANCELLATION_REQUESTED", placedAt: ago(11), updatedAt: ago(10), cancellationRequest: { at: ago(10), reason: "Plans changed <b>please</b> cancel", previousStatus: "PROCESSING" }, events: [{ type: "PROCESSING", at: ago(11), actor: "system" }, { type: "CANCELLATION_REQUESTED", at: ago(10), actor: "buyer", reason: "Plans changed <b>please</b> cancel" }] }),
    mkOrder(BA.id, SELLER_A, O(12), { status: "RETURN_REQUESTED", placedAt: ago(12) }),
    mkOrder(BA.id, SELLER_A, O(13), { status: "RETURNED", placedAt: ago(13) }),
    mkOrder(BB.id, SELLER_A, O(14), { status: "PROCESSING", placedAt: ago(14), totalMinor: 9900000, items: [{ name: "Extra long product name for the first line item of a multi item order to test wrapping behaviour at narrow widths", quantity: 12000, unit: "Piece", unitPriceMinor: 500 }, { name: "Second item", quantity: 4, unit: "Kg", unitPriceMinor: 90000 }, { name: "Third item", quantity: 1, unit: null, unitPriceMinor: 1 }] }),
    mkOrder(BB.id, SELLER_A, O(15), { status: "DELIVERED", placedAt: ago(15), currency: "USD", totalMinor: 150000, items: [{ name: "Export carton", quantity: 100, unit: "Piece", unitPriceMinor: 1500 }] }),
    mkOrder(BA.id, SELLER_A, O(16), { status: "PENDING_CONFIRMATION", placedAt: ago(16), items: [{ name: "=HYPERLINK(\"http://evil.example\",\"x\")", quantity: 1, unit: "Piece", unitPriceMinor: 100 }] }),
    mkOrder(BA.id, SELLER_A, O(17), { status: "CONFIRMED", placedAt: ago(17), quotationReference: "FBM-QT-S45BBBB1", inquiryReference: "FBM-INQ-S45BBBB1" }),
    mkOrder(new ObjectId(), SELLER_A, O(18), { status: "PROCESSING", placedAt: ago(18) }),
    mkOrder(BA.id, SELLER_B, "FBM-ORD-S45B0001", { status: "PROCESSING", placedAt: ago(2), items: [{ name: "Sunrise Only Product", quantity: 5, unit: "Piece", unitPriceMinor: 100 }], totalMinor: 500 }),
    mkOrder(BA.id, SELLER_B, "FBM-ORD-S45B0002", { status: "DELIVERED", placedAt: ago(3) }),
  ];
  await orders.insertMany(seeds);
  created45.orders = seeds.map((s) => s.reference);
  const A_REFS = seeds.filter((s) => s.supplierKey === "shree-textiles").map((s) => s.reference);
  const EXPECT = { all: 18, awaiting: 2, in_progress: 5, ready: 1, shipped: 3, delivered: 2, cancelled: 1, attention: 4 };

  // ================= A: access
  const un = new Session();
  const aRoutes = [["GET", API], ["GET", `${API}/summary`], ["GET", `${API}/${O(1)}`], ["POST", `${API}/export`, {}]];
  const unRes = await Promise.all(aRoutes.map(([m, p, b]) => un.call(m, p, b)));
  check("A-01 no session: list, summary, detail and export all answer 401 (never 200)", unRes.every((r) => r.status === 401), unRes.map((r) => r.status).join());
  const buyRes = await Promise.all(aRoutes.map(([m, p, b]) => BA.s.call(m, p, b)));
  check("A-02 a signed-in BUYER gets 403 JSON on every orders route, even for an order that is theirs", buyRes.every((r) => r.status === 403 && r.json?.ok === false), buyRes.map((r) => r.status).join());
  const susRes = await Promise.all(aRoutes.map(([m, p, b]) => SS.s.call(m, p, b)));
  check("A-03 a supplier whose company is suspended (membership revoked) gets 403 everywhere", susRes.every((r) => r.status === 403), susRes.map((r) => r.status).join());
  const pun = await un.page("/supplier/orders");
  const pbuy = await BA.s.page("/supplier/orders");
  const pdet = await BA.s.page(`/supplier/orders/${O(1)}`);
  check("A-04 the pages redirect a signed-out visitor to sign-in and a buyer to /forbidden?portal=supplier, rendering no order data (the redirect body only repeats the requested address)", [302, 307].includes(pun.status) && /sign-in/.test(pun.location ?? "") && [302, 307].includes(pbuy.status) && /forbidden\?portal=supplier/.test(pbuy.location ?? "") && [302, 307].includes(pdet.status) && /forbidden/.test(pdet.location ?? "") && !/Woven cotton|Cotton poplin|Alpha Garments|Linen blend|₹/.test(pun.text + pbuy.text + pdet.text));
  check("A-05 a cross-site POST to export is blocked (403) before anything is read", (await SA.s.call("POST", `${API}/export`, {}, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status === 403);
  const noSeller = await olist(SN.s);
  check("A-06 a company that owns no seller gets 200 with noSellers, zero counts and no rows (never another company's orders, never samples)", noSeller.status === 200 && noSeller.json.data.noSellers === true && noSeller.json.orders.length === 0 && noSeller.json.data.counts.all === 0 && noSeller.json.meta.total === 0);

  // ================= B: the list
  await clearLimits();
  const r1 = await olist(SA.s, "?limit=50");
  const mine = orefs(r1);
  check("B-01 supplier A sees exactly its own 18 orders: none of supplier B's, with exact total and tenant isolation", r1.status === 200 && mine.length === 18 && A_REFS.every((x) => mine.includes(x)) && !mine.some((x) => x.startsWith("FBM-ORD-S45B")) && r1.json.meta.total === 18);
  check("B-02 default order is newest first by the placed date (stable)", JSON.stringify(mine) === JSON.stringify([...seeds.filter((s) => s.supplierKey === "shree-textiles")].sort((a, b) => b.placedAt - a.placedAt).map((s) => s.reference)));
  const row = r1.json.orders.find((o) => o.reference === O(1));
  check("B-03 each row carries only the allowed fields (no buyerId, supplierKey, supplierName, email, phone, address, events, items array, company id)", !/buyerId|supplierKey|supplierCompanyId|"email"|phone|address|"events"|"items"|_id/i.test(JSON.stringify(r1.json.orders)) && Object.keys(row).sort().join() === ["amount", "buyer", "detailHref", "fulfilment", "itemCount", "itemName", "itemText", "payment", "placedAt", "placedLabel", "quantityText", "quotationReference", "reference", "status", "statusGroup", "statusLabel", "updatedLabel"].sort().join(), Object.keys(row).join());
  check("B-04 the buyer is shown by business name only; a buyer without a record is 'Individual buyer'", r1.json.orders.find((o) => o.reference === O(1)).buyer === "Alpha Garments Pvt Ltd" && r1.json.orders.find((o) => o.reference === O(18)).buyer === "Individual buyer");
  check("B-05 the three facts stay apart: status label from the stored lifecycle, a fulfilment label, and payment 'Payment status unavailable' on EVERY row", r1.json.orders.every((o) => o.payment.available === false && o.payment.label === "Payment status unavailable" && o.statusLabel && o.fulfilment) && r1.json.orders.find((o) => o.reference === O(8)).statusLabel === "Delivered" && r1.json.orders.find((o) => o.reference === O(8)).fulfilment === "Delivered" && !/paid/i.test(JSON.stringify(r1.json.orders.map((o) => [o.statusLabel, o.fulfilment]))));
  const multi = r1.json.orders.find((o) => o.reference === O(14));
  check("B-06 a multi-item order shows its first item and the number of others, and does not add quantities of different units", multi.itemCount === 3 && /^Extra long product name.* and 2 more items$/.test(multi.itemText) && multi.quantityText === "3 items");
  const usd = r1.json.orders.find((o) => o.reference === O(15));
  check("B-07 amounts keep their currency: ₹ for INR, $ for USD, as stored (nothing is converted or summed)", /₹/.test(row.amount.text) && row.amount.currency === "INR" && /\$/.test(usd.amount.text) && usd.amount.currency === "USD" && !("revenue" in r1.json.data) && !("totalValue" in r1.json.data) && Object.keys(r1.json.data.counts).every((k) => typeof r1.json.data.counts[k] === "number"));
  check("B-08 the counts are the real stored counts per group (All 18, Awaiting 2, In Progress 5, Ready 1, Dispatched 3, Delivered 2, Cancelled 1, On hold / returns / requests 4) and they add up", JSON.stringify(r1.json.data.counts) === JSON.stringify(EXPECT), JSON.stringify(r1.json.data.counts));
  check("B-09 the list is private and uncacheable; the currencies in use are INR and USD", /no-store/.test(r1.headers.get("cache-control") ?? "") && r1.json.data.currencies.join() === "INR,USD");
  const seen = []; let pages = 0;
  for (let p = 1; p <= 5; p++) { const r = await olist(SA.s, `?limit=5&page=${p}`); if (r.status !== 200 || r.json.orders.length === 0) break; seen.push(...orefs(r)); pages++; }
  check("B-10 stable pagination: pages of 5 give 5, 5, 5, 3 (4 pages); every order exactly once, none missing, in the exact order of the full list", pages === 4 && seen.length === 18 && new Set(seen).size === 18 && seen.join() === mine.join(), `${pages} pages, ${seen.length} rows`);
  const badQ = await Promise.all(["?limit=51", "?limit=0", "?page=0", "?page=1001", "?page=1.5", "?page=abc", "?status=withdrawn", "?sort=price", "?currency=RUPEES", "?dateBasis=sent", "?range=forever", "?sort=amount_high"].map((q) => olist(SA.s, q)));
  check("B-11 invalid parameters are refused with 400 and field messages (limit 51 / 0, page 0 / 1001 / 1.5 / text, unknown status, sort, currency, date basis, range, an amount sort without a currency)", badQ.every((r) => r.status === 400 && r.json.ok === false && r.json.fields), badQ.map((r) => r.status).join());
  check("B-12 an operator or array in a parameter is refused (nothing reaches the database): q[$ne], status[$ne] are not read, and ?q=a&q=b is treated as one value or refused", (await olist(SA.s, "?status[$ne]=x")).status === 200 && (await olist(SA.s, "?status[$ne]=x")).json.meta.total === 18 && (await SA.s.call("POST", `${API}/export`, { status: { $ne: "" } })).status === 400 && (await SA.s.call("POST", `${API}/export`, { q: { $regex: ".*" } })).status === 400);

  // ================= C: filters, counts and the one status model
  await clearLimits();
  const group = async (g) => olist(SA.s, `?status=${g}&limit=50`);
  const gAw = await group("awaiting"), gIp = await group("in_progress"), gRd = await group("ready"), gSh = await group("shipped"), gDl = await group("delivered"), gCn = await group("cancelled"), gAt = await group("attention");
  check("C-01 each status group returns exactly its orders: awaiting {1,16}, in progress {2,3,14,17,18}, ready {4}, dispatched {5,6,7}, delivered {8,15}, cancelled {9}, attention {10,11,12,13}", [gAw, gIp, gRd, gSh, gDl, gCn, gAt].map((r) => orefs(r).map((x) => Number(x.slice(-4))).sort((a, b) => a - b).join()).join("|") === "1,16|2,3,14,17,18|4|5,6,7|8,15|9|10,11,12,13");
  check("C-02 'In Progress' does not include Ready to Dispatch, and the chips of one view add up to All (counts do not depend on the active status)", !orefs(gIp).includes(O(4)) && JSON.stringify(gIp.json.data.counts) === JSON.stringify(EXPECT) && JSON.stringify(gSh.json.data.counts) === JSON.stringify(EXPECT));
  const exact = await olist(SA.s, "?status=dispatched&limit=50");
  const exact2 = await olist(SA.s, "?status=cancellation_requested&limit=50");
  check("C-03 an exact stored status selects only that status ('dispatched' is just DISPATCHED while the group 'shipped' has three)", orefs(exact).join() === O(5) && orefs(exact2).join() === O(11));
  const qRef = await olist(SA.s, `?q=${O(1).toLowerCase()}`);
  const qRefP = await olist(SA.s, "?q=FBM-ORD-S45A001");
  const qQt = await olist(SA.s, "?q=FBM-QT-S45AAAA");
  const qInq = await olist(SA.s, "?q=FBM-INQ-S45AAAA1");
  const qProd = await olist(SA.s, "?q=LINEN");
  const qProd2 = await olist(SA.s, "?q=carton");
  check("C-04 search: an order reference (any case, or a prefix of it), a quotation reference prefix, an inquiry reference and a product name (any case) each find the right orders, only this supplier's", orefs(qRef).join() === O(1) && orefs(qRefP).length === 9 && orefs(qRefP).every((x) => /^FBM-ORD-S45A001[0-8]$/.test(x)) && orefs(qQt).join() === O(1) && orefs(qInq).join() === O(1) && orefs(qProd).join() === O(3) && orefs(qProd2).join() === O(15), `${orefs(qRefP).length}/${orefs(qQt)}/${orefs(qInq)}/${orefs(qProd)}/${orefs(qProd2)}`);
  const qRegex = await olist(SA.s, "?q=.*");
  const qRegex2 = await olist(SA.s, "?q=" + encodeURIComponent("(a+)+$"));
  const qSB = await olist(SA.s, "?q=Sunrise");
  check("C-05 the search text is matched literally, never as a pattern: '.*' and '(a+)+$' find nothing, and another supplier's product name finds nothing", qRegex.status === 200 && qRegex.json.meta.total === 0 && qRegex2.status === 200 && qRegex2.json.meta.total === 0 && qSB.json.meta.total === 0);
  const qCounts = await olist(SA.s, "?q=fabric&status=delivered");
  check("C-06 the counts follow the search (the status is not applied to them): searching 'fabric' counts Awaiting 1, In Progress 2, Ready 1, Dispatched 3, Delivered 1, Cancelled 1, attention 4 (13 in all) while the list shows the delivered one only", qCounts.json.data.counts.all === qCounts.json.data.counts.awaiting + qCounts.json.data.counts.in_progress + qCounts.json.data.counts.ready + qCounts.json.data.counts.shipped + qCounts.json.data.counts.delivered + qCounts.json.data.counts.cancelled + qCounts.json.data.counts.attention && qCounts.json.data.counts.delivered === 1 && orefs(qCounts).join() === O(8) && qCounts.json.data.counts.all === (await olist(SA.s, "?q=fabric")).json.meta.total, JSON.stringify(qCounts.json.data.counts));
  const sum = await SA.s.call("GET", `${API}/summary?q=fabric&status=delivered&page=9&limit=999&sort=zzz`);
  const sumAll = await SA.s.call("GET", `${API}/summary`);
  check("C-07 the summary route returns the SAME counts as the list under the same filters, ignores status / sort / page / limit, and spells out its scope; with no filter it is the whole company", sum.status === 200 && JSON.stringify(sum.json.data.counts) === JSON.stringify(qCounts.json.data.counts) && sum.json.data.scope.search === true && JSON.stringify(sumAll.json.data.counts) === JSON.stringify(EXPECT) && sumAll.json.data.scope.currency === null);
  const cur = await olist(SA.s, "?currency=usd&limit=50");
  const curAmt = await olist(SA.s, "?currency=INR&sort=amount_high&limit=50");
  const curAmtLow = await olist(SA.s, "?currency=INR&sort=amount_low&limit=50");
  const amountsHigh = curAmt.json.orders.map((o) => Number(o.amount.text.replace(/[^0-9.]/g, "")));
  check("C-08 the currency filter returns only that currency (USD 1 order); an amount sort works within one currency (highest first / lowest first) and is refused without one", orefs(cur).join() === O(15) && curAmt.status === 200 && curAmt.json.orders.every((o) => o.amount.currency === "INR") && amountsHigh.every((v, i, a) => i === 0 || a[i - 1] >= v) && curAmtLow.json.orders.map((o) => Number(o.amount.text.replace(/[^0-9.]/g, ""))).every((v, i, a) => i === 0 || a[i - 1] <= v) && (await olist(SA.s, "?sort=amount_low")).status === 400);
  const upd = await olist(SA.s, "?sort=updated&limit=50");
  check("C-09 sorting by last updated puts the cancellation-requested order (updated 10 days ago, newest update) before older updates", orefs(upd)[0] !== undefined && upd.json.orders.findIndex((o) => o.reference === O(11)) < upd.json.orders.findIndex((o) => o.reference === O(12)));
  const win7 = await olist(SA.s, "?range=7d&limit=50");
  const win7u = await olist(SA.s, "?range=7d&dateBasis=updated&limit=50");
  const custom = await olist(SA.s, `?range=custom&startDate=${new Date(Date.now() - 12 * DAY).toISOString().slice(0, 10)}&endDate=${new Date(Date.now() - 9 * DAY).toISOString().slice(0, 10)}&limit=50`);
  check("C-10 the date window: the last 7 days by order date holds orders placed 1-6 days ago (1-6 and not 8+); by last-updated it holds the same plus none of the 10-day update; a custom range is a half-open window of real days; an incomplete custom range is refused", orefs(win7).length >= 5 && orefs(win7).length <= 7 && orefs(win7).every((x) => Number(x.slice(-4)) <= 7) && !orefs(win7u).includes(O(11)) && custom.status === 200 && custom.json.meta.total >= 3 && custom.json.meta.total <= 5 && (await olist(SA.s, "?range=custom&startDate=2026-11-01")).status === 400, `${orefs(win7).length}/${orefs(win7u).length}/${custom.json.meta.total}`);
  const forged = await olist(SA.s, "?supplierKey=sunrise-hub&supplierId=sunrise-hub&supplierCompanyId=x&buyerId=y&companyId=z&limit=50");
  check("C-11 forged ownership parameters (supplierKey, supplierId, supplierCompanyId, buyerId, companyId) are never read: the answer is exactly supplier A's list", forged.status === 200 && forged.json.meta.total === 18 && orefs(forged).join() === mine.join());
  const empty = await olist(SE.s);
  check("C-12 a company with a linked seller and no orders: 200, zero rows, all counts zero, noSellers false (an honest empty state, not an error)", empty.status === 200 && empty.json.meta.total === 0 && empty.json.data.noSellers === false && empty.json.data.counts.all === 0);

  // ================= D: the detail
  await clearLimits();
  const detail = await SA.s.call("GET", `${API}/${O(11)}`);
  const D = detail.json?.data;
  check("D-01 the detail of an own order: status, stored amount, items as stored, buyer business name, payment unavailable, and an uncacheable private response", detail.status === 200 && D.order.reference === O(11) && D.order.statusLabel === "Cancellation Requested" && D.buyer === "Alpha Garments Pvt Ltd" && D.payment.available === false && D.items.length === 1 && /no-store/.test(detail.headers.get("cache-control") ?? ""));
  check("D-02 the buyer's cancellation request is shown as recorded (reason as plain text, previous status), with no accept / decline action and the reason it is not available", D.cancellationRequest && D.cancellationRequest.reason === "Plans changed <b>please</b> cancel" && D.cancellationRequest.previousStatusLabel === "Processing" && D.capabilities.confirm.available === false && /No supplier order workflow/.test(D.capabilities.confirm.reason) && D.events.length === 2 && D.events[1].actor === "Buyer");
  check("D-03 private data stays out: no buyer e-mail / phone / id, no other supplier, no internal field", !/@example\.test|9876543210|buyerId|supplierKey|_id|sunrise/i.test(detail.text));
  const d1 = (await SA.s.call("GET", `${API}/${O(1)}`)).json.data;
  const d17 = (await SA.s.call("GET", `${API}/${O(17)}`)).json.data;
  check("D-04 links only to records that are the company's own: the quotation and inquiry of order 1 link to supplier pages; order 17 refers to ANOTHER supplier's quotation and inquiry and gets no link (the references are text only)", d1.quotation.href === "/supplier/quotations/FBM-QT-S45AAAA1" && d1.inquiry.href === "/supplier/inquiries/FBM-INQ-S45AAAA1" && d17.quotation.href === null && d17.inquiry.href === null);
  const foreign = await SA.s.call("GET", `${API}/FBM-ORD-S45B0001`);
  const unknown = await SA.s.call("GET", `${API}/FBM-ORD-S45ZZZZZ`);
  const malformed = await SA.s.call("GET", `${API}/not-a-reference`);
  const lower = await SA.s.call("GET", `${API}/fbm-ord-s45a0001`);
  check("D-05 another supplier's order, an unknown one, a malformed one and a lower-case one are the SAME 404 and none leaks the foreign order", [foreign, unknown, malformed, lower].every((r) => r.status === 404) && foreign.text === unknown.text && unknown.text === malformed.text && !/Sunrise/.test(foreign.text));
  await clearLimits();
  const guessed = [];
  for (let i = 0; i < 20; i++) guessed.push(await SA.s.call("GET", `${API}/FBM-ORD-${rand8()}`));
  check("D-06 twenty guessed order references all answer 404", guessed.every((r) => r.status === 404));
  const stored = await orders.findOne({ reference: O(2) });
  await SA.s.call("GET", `${API}/${O(2)}`); await olist(SA.s, "?status=ready"); await SA.s.page(`/supplier/orders/${O(2)}`); await SA.s.page("/supplier/orders?status=delivered");
  check("D-07 reading never changes an order: after details, filters and page loads the stored order is byte-identical (status, updatedAt, events)", sha(await orders.findOne({ reference: O(2) })) === sha(stored));
  const pOk = await SA.s.page(`/supplier/orders/${O(2)}`);
  const pForeign = await SA.s.page("/supplier/orders/FBM-ORD-S45B0001");
  const pBad = await SA.s.page("/supplier/orders/nope");
  check("D-08 the detail PAGE renders for an own order and is a real 404 for a foreign, a malformed one, showing none of the foreign data", pOk.status === 200 && /Woven cotton/.test(pOk.text) && pForeign.status === 404 && pBad.status === 404 && !/Sunrise Only Product/.test(pForeign.text));
  const hist = await SA.s.page(`/supplier/orders/${O(11)}`);
  check("D-09 the page escapes stored text: the buyer's reason is shown as text (no live <b> element) and the cancellation notice says no supplier action exists", /Plans changed &lt;b&gt;please&lt;\/b&gt; cancel/.test(hist.text) && !/<b>please<\/b>/.test(hist.text) && /not available here/.test(hist.text));

  const snap = await SA.s.call("GET", `${API}/${O(3)}`);
  const snapRow = (await olist(SA.s, "?q=linen")).json.orders[0];
  check("D-10 historical snapshot: the order was placed with the name 'Linen blend' and a catalogue product key whose CURRENT listing has another name; the list and the detail show the stored name and the stored price (₹210.00 / Meter), the catalogue is only a link", snap.json.data.items[0].name === "Linen blend" && snap.json.data.items[0].unitPrice === "₹210.00 / Meter" && snapRow.itemName === "Linen blend" && (snap.json.data.items[0].productUrl === null || /products|1163/.test(snap.json.data.items[0].productUrl)));

  // ================= E: nothing mutates, nothing is faked
  await clearLimits();
  const methods = await Promise.all(["POST", "PUT", "PATCH", "DELETE"].map((m) => SA.s.call(m, `${API}/${O(2)}`, {})));
  const stubs = await Promise.all(["confirm", "cancel", "fulfilment", "payment", "create"].map((p) => SA.s.call("POST", `${API}/${O(2)}/${p}`, { confirm: true })));
  const beforeAll = sha(await orders.find({ supplierKey: "shree-textiles" }).sort({ reference: 1 }).toArray());
  await olist(SA.s, "?q=cotton"); await olist(SA.s, "?status=attention"); await SA.s.call("GET", `${API}/summary`);
  check("E-01 no route changes an order: POST / PUT / PATCH / DELETE on an order are 405 and the confirm / cancel / fulfilment / payment / create paths do not exist (404)", methods.every((r) => r.status === 405) && stubs.every((r) => r.status === 404), `${methods.map((r) => r.status)} ${stubs.map((r) => r.status)}`);
  check("E-02 the list, filters, summary and detail left every order of the company unchanged", sha(await orders.find({ supplierKey: "shree-textiles" }).sort({ reference: 1 }).toArray()) === beforeAll && (await orders.countDocuments({ supplierKey: "shree-textiles" })) === 18);
  check("E-03 loading the pages created no order, notification, outbox row or quotation", (await outbox.countDocuments({ dedupeKey: /S45/ })) === 0 && (await orders.countDocuments({ reference: /^FBM-ORD-S45/ })) === seeds.length);
  const caps = (await olist(SA.s)).json.data.capabilities;
  check("E-04 the capabilities say what is NOT available, with reasons: creating, confirming, fulfilment updates and payments", caps.canExport === true && !caps.create.available && !caps.confirm.available && !caps.updateFulfilment.available && !caps.payments.available && [caps.create.reason, caps.confirm.reason, caps.payments.reason].every((s) => s.length > 20));

  // ================= F: export
  await clearLimits();
  const ex = await SA.s.call("POST", `${API}/export`, {});
  const lines = (ex.text ?? "").trim().split("\r\n");
  check("F-01 export: 200 text/csv attachment, no-store, one header and one line per order (18), nothing from another supplier", ex.status === 200 && /text\/csv/.test(ex.headers.get("content-type") ?? "") && /attachment/.test(ex.headers.get("content-disposition") ?? "") && /no-store/.test(ex.headers.get("cache-control") ?? "") && lines.length === 19 && ex.headers.get("x-export-rows") === "18" && ex.headers.get("x-export-truncated") === "false" && !/Sunrise|S45B000/.test(ex.text), String(lines.length));
  check("F-02 the header and cells: honest payment text, order amount without symbol, India-time dates, buyer = business name; no e-mail, phone, address, id or supplier key", lines[0].includes('"Payment"') && lines[0].includes('"Order Amount"') && ex.text.includes('"Payment status unavailable"') && ex.text.includes('"61500.00"') && ex.text.includes('"Alpha Garments Pvt Ltd"') && !/@example\.test|9876543210|shree-textiles|buyerId/.test(ex.text));
  check("F-03 a spreadsheet formula in a product name is defused: the cell starts with a quote and is quoted, never a live '=HYPERLINK'", ex.text.includes("\"'=HYPERLINK(") && !/(^|,)"=HYPERLINK/.test(ex.text));
  check("F-04 a multi-item order lists its items in one cell (first items, '; ' separated) and a quantity with its own unit", /Extra long product name.*12,000 Piece; Second item x 4 Kg; Third item x 1/.test(ex.text));
  const exF = await SA.s.call("POST", `${API}/export`, { status: "delivered", q: "carton", currency: "USD" });
  check("F-05 an export applies the same filters as the list: delivered + 'carton' + USD gives exactly one row", exF.status === 200 && exF.headers.get("x-export-rows") === "1" && exF.text.includes(O(15)) && !exF.text.includes(O(8)));
  check("F-06 an export with an invalid filter is 400 and an oversized body is refused (400, the shared small-body reader rejects it by size before parsing)", (await SA.s.call("POST", `${API}/export`, { status: "nope" })).status === 400 && (await SA.s.call("POST", `${API}/export`, JSON.stringify({ q: "x".repeat(5000) }), { "Content-Type": "application/json" })).status === 400);
  const evt = await db.collection("security_events").find({ userId: SA.id, type: "supplier_orders_exported" }).sort({ at: -1 }).toArray();
  check("F-07 each export is logged with counts and filter NAMES only (never the search text or any order data)", evt.length >= 2 && evt[0].rows === 1 && Array.isArray(evt[0].filters) && evt[0].filters.includes("q") && !JSON.stringify(evt).includes("carton") && !JSON.stringify(evt).includes("Alpha"));
  check("F-08 exports are rate limited by the exact limiter: the eleventh within ten minutes is 429 with a retry time, and another user is unaffected", await (async () => { await clearLimits(); const rs = []; for (let i = 0; i < 11; i++) rs.push((await SA.s.call("POST", `${API}/export`, {})).status); const other = (await SB.s.call("POST", `${API}/export`, {})).status; await clearLimits(); return rs.slice(0, 10).every((s) => s === 200) && rs[10] === 429 && other === 200; })());
  const exSB = await SB.s.call("POST", `${API}/export`, {});
  check("F-09 supplier B exports only its own two orders", exSB.headers.get("x-export-rows") === "2" && /Sunrise Only Product/.test(exSB.text) && !/S45A0|shree/i.test(exSB.text));
  const exNone = await SN.s.call("POST", `${API}/export`, {});
  check("F-10 a company with no seller exports an empty file (header only), never anything else", exNone.status === 200 && exNone.headers.get("x-export-rows") === "0" && exNone.text.trim().split("\r\n").length === 1);

  // ================= G: browser journey (desktop)
  await clearLimits();
  const b = await open("/supplier/orders", { session: SA.s });
    check("G-01 the page loads in the browser with no console error: heading Orders, breadcrumb, the Orders sidebar item current", b.status === 200 && b.errs.length === 0 && (await b.evaluate(() => document.querySelector("h1")?.textContent)) === "Orders" && (await b.evaluate(() => !!document.querySelector('a[aria-current="page"][href="/supplier/orders"]'))), b.errs.join(" | "));
  await b.screenshot({ path: `${SHOTS}/45-supplier-orders-desktop-1440.png`, fullPage: true });
  const metrics = await b.evaluate(() => [...document.querySelectorAll('ul[aria-label^="Order summary"] button')].map((x) => x.textContent.replace(/\s+/g, " ").trim()));
  check("G-02 four summary metrics from the database: All Orders 18, Awaiting Confirmation 2, In Progress 5, Ready to Dispatch 1", metrics.length === 4 && /All Orders\s*18/.test(metrics[0]) && /Awaiting Confirmation\s*2/.test(metrics[1]) && /In Progress\s*5/.test(metrics[2]) && /Ready to Dispatch\s*1/.test(metrics[3]), JSON.stringify(metrics));
  const chips = await b.evaluate(() => [...document.querySelectorAll('[role="group"][aria-label="Filter orders by status"] button')].map((x) => x.textContent.trim()));
  check("G-03 eight status chips with their counts (All 18 ... ) that add up", chips.length === 8 && chips[0] === "All (18)" && chips[1] === "Awaiting Confirmation (2)" && chips[3] === "Ready to Dispatch (1)" && chips[7].endsWith("(4)"), chips.join(" | "));
  check("G-04 the desktop table: semantic headers (Order, Buyer & product, Amount, Order status, Fulfilment, Payment, Updated, Action), a caption, 18 rows on the first page, 'Payment status unavailable' in each", await b.evaluate(() => { const th = [...document.querySelectorAll("table thead th")].map((x) => x.textContent.trim()); return th.join("|") === "Order|Buyer & product|Amount|Order status|Fulfilment|Payment|Updated|Action" && !!document.querySelector("table caption") && document.querySelectorAll("table tbody tr").length === 18 && [...document.querySelectorAll("table tbody tr")].every((r) => /Payment status unavailable/.test(r.textContent)); }));
  await b.click("#so-search");
  await b.type("#so-search", "linen");
  await waitFor(b, () => document.querySelectorAll("table tbody tr").length === 1 && location.search.includes("q=linen"));
  check("G-05 typing in search filters after the debounce, from page 1, and puts the search in the address; the chip counts follow the search", (await tableRows(b)) === 1 && (await b.evaluate(() => location.search)).includes("q=linen") && (await b.evaluate(() => document.querySelector('[role="group"][aria-label="Filter orders by status"] button').textContent.trim())) === "All (1)");
  await b.evaluate(() => { const el = document.querySelector("#so-search"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ""); el.dispatchEvent(new Event("input", { bubbles: true })); });
  await waitFor(b, () => document.querySelectorAll("table tbody tr").length === 18);
  await b.evaluate(() => [...document.querySelectorAll('[role="group"][aria-label="Filter orders by status"] button')].find((x) => /^Dispatched/.test(x.textContent.trim()))?.click());
  await waitFor(b, () => document.querySelectorAll("table tbody tr").length === 3 && location.search.includes("status=shipped"));
  const sel = await b.evaluate(() => ({ value: document.querySelector("#so-status").value, pressed: [...document.querySelectorAll('[role="group"][aria-label="Filter orders by status"] button')].filter((x) => x.getAttribute("aria-pressed") === "true").map((x) => x.textContent.trim().split(" (")[0]) }));
  check("G-06 ONE status model: choosing the Dispatched chip shows 3 rows, updates the address, and the Status select shows the same value (no conflicting state)", (await tableRows(b)) === 3 && sel.value === "shipped" && sel.pressed.join() === "Dispatched", JSON.stringify(sel));
  await b.select("#so-status", "in_transit");
  await waitFor(b, () => document.querySelectorAll("table tbody tr").length === 1 && location.search.includes("status=in_transit"));
  const sel2 = await b.evaluate(() => ({ pressed: [...document.querySelectorAll('[role="group"][aria-label="Filter orders by status"] button')].filter((x) => x.getAttribute("aria-pressed") === "true").length, card: [...document.querySelectorAll('ul[aria-label^="Order summary"] button')].filter((x) => x.getAttribute("aria-pressed") === "true").length }));
  check("G-07 choosing an EXACT status in the select (In transit) shows 1 row and highlights no chip or card (it is not a group), so the screen never claims a group that is not selected", (await tableRows(b)) === 1 && sel2.pressed === 0 && sel2.card === 0, JSON.stringify(sel2));
  await b.evaluate(() => [...document.querySelectorAll('ul[aria-label^="Order summary"] button')].find((x) => /Ready to Dispatch/.test(x.textContent))?.click());
  await waitFor(b, () => document.querySelectorAll("table tbody tr").length === 1 && location.search.includes("status=ready"));
  check("G-08 clicking the Ready to Dispatch card applies that status (1 row) and marks the card pressed", (await tableRows(b)) === 1 && (await b.evaluate(() => [...document.querySelectorAll('ul[aria-label^="Order summary"] button')].find((x) => /Ready to Dispatch/.test(x.textContent)).getAttribute("aria-pressed"))) === "true");
  await b.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^Clear filters$/.test(x.textContent.trim()))?.click());
  await waitFor(b, () => document.querySelectorAll("table tbody tr").length === 18 && !location.search);
  check("G-09 Clear filters restores all 18 orders and a clean address", (await tableRows(b)) === 18 && (await b.evaluate(() => location.search)) === "");
  await b.select("#so-range", "custom");
  const incomplete = await b.evaluate(() => /Choose both dates/.test(document.body.textContent));
  check("G-10 a custom date range shows From and To and says both dates are needed until they are chosen (no request is made with half a range)", incomplete && (await b.evaluate(() => !!document.querySelector("#so-start") && !!document.querySelector("#so-end"))));
  await b.select("#so-range", "");
  await waitFor(b, () => !document.querySelector("#so-start"));
  // page 2 with the paging at 20: use limit via many rows? 18 rows fit in one page, so paging is exercised through the perf group and the API test above
  await b.evaluate(() => [...document.querySelectorAll("table tbody tr")].find((r) => /S45A0002/.test(r.textContent)).querySelector("a").click());
  await waitFor(b, () => location.pathname.endsWith("/FBM-ORD-S45A0002") && !!document.querySelector("h1")?.textContent.startsWith("Order "));
  check("G-11 View Order opens the real supplier detail page of that order (read only, with Back to orders)", /\/supplier\/orders\/FBM-ORD-S45A0002$/.test(b.url()) && (await b.evaluate(() => document.querySelector("h1")?.textContent)) === "Order FBM-ORD-S45A0002" && (await b.evaluate(() => /Back to orders/.test(document.body.textContent))));
  await b.goBack().catch(() => {});
  await waitFor(b, () => location.pathname === "/supplier/orders" && document.querySelectorAll("table tbody tr").length === 18);
  await b.evaluate(() => [...document.querySelectorAll('[role="group"][aria-label="Filter orders by status"] button')].find((x) => /^Delivered/.test(x.textContent.trim()))?.click());
  await waitFor(b, () => document.querySelectorAll("table tbody tr").length === 2 && location.search.includes("status=delivered"));
  await b.evaluate(() => [...document.querySelectorAll("table tbody tr")][0].querySelector("a").click());
  await waitFor(b, () => /\/supplier\/orders\/FBM-ORD-/.test(location.pathname));
  await b.goBack().catch(() => {});
  await waitFor(b, () => document.querySelectorAll("table tbody tr").length === 2);
  check("G-12 returning from a detail page keeps the list state: the Delivered filter is still in the address and the 2 delivered orders are shown", (await b.evaluate(() => location.search)).includes("status=delivered") && (await tableRows(b)) === 2);
  // export in the browser
  await b.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^Clear filters$/.test(x.textContent.trim()))?.click());
  await waitFor(b, () => document.querySelectorAll("table tbody tr").length === 18);
  const exportResp = b.waitForResponse((r) => r.url().includes("/api/supplier/orders/export") && r.request().method() === "POST", { timeout: 10000 }).catch(() => null);
  await b.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^Export$/.test(x.textContent.trim()))?.click());
  const er = await exportResp;
  await waitFor(b, () => /Exported 18 orders/.test(document.body.textContent));
  check("G-13 Export in the browser posts the current filters, receives a CSV (200) and announces the real number of rows exported (18)", !!er && er.status() === 200 && (await b.evaluate(() => /Exported 18 orders/.test(document.body.textContent))));
  // failure and retry
  await b.setRequestInterception(true);
  let failApi = true;
  const handler = (req) => { if (failApi && req.url().includes("/api/supplier/orders?")) req.respond({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, message: "We could not load your orders." }) }); else req.continue(); };
  b.on("request", handler);
  await b.evaluate(() => [...document.querySelectorAll('[role="group"][aria-label="Filter orders by status"] button')].find((x) => /^Delivered/.test(x.textContent.trim()))?.click());
  await waitFor(b, () => /could not be loaded/.test(document.body.textContent));
  const errBox = await b.evaluate(() => ({ alert: !!document.querySelector('[role="alert"]'), text: /Your orders could not be loaded/.test(document.body.textContent), rows: document.querySelectorAll("table tbody tr").length }));
  check("G-14 an API failure is an error state with an alert and Try again (not an empty list shown as success)", errBox.alert && errBox.text && errBox.rows === 0, JSON.stringify(errBox));
  failApi = false;
  await b.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^Try again$/.test(x.textContent.trim()))?.click());
  await waitFor(b, () => document.querySelectorAll("table tbody tr").length === 2);
  check("G-15 Try again recovers: the delivered orders are listed again", (await tableRows(b)) === 2);
  // stale response protection: first search is slow, second is fast
  let slowOnce = true;
  b.off("request", handler);
  const slowHandler = (req) => { if (slowOnce && req.url().includes("/api/supplier/orders?") && /q=carton/.test(req.url())) { slowOnce = false; setTimeout(() => req.continue(), 1500); } else req.continue(); };
  b.on("request", slowHandler);
  await b.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^Clear filters$/.test(x.textContent.trim()))?.click());
  await waitFor(b, () => document.querySelectorAll("table tbody tr").length === 18);
  await b.click("#so-search");
  await b.type("#so-search", "carton");
  await sleep(450);
  await b.evaluate(() => { const el = document.querySelector("#so-search"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "linen"); el.dispatchEvent(new Event("input", { bubbles: true })); });
  await sleep(2600);
  check("G-16 a slow, overtaken search response never overwrites a newer one: after 'carton' (slow) then 'linen' the list shows the linen result", (await tableRows(b)) === 1 && /Linen blend/.test(await b.evaluate(() => document.querySelector("table tbody").textContent)) && (await b.evaluate(() => location.search)).includes("q=linen"));
  b.off("request", slowHandler);
  await b.setRequestInterception(false);
  check("G-17 no console errors during the whole desktop journey", b.errs.length === 0, b.errs.join(" | "));
  await b.context.close();

  // ================= H: mobile, drawer, keyboard
  const m = await open("/supplier/orders", { width: 390, height: 844, session: SA.s });
  globalThis.__page = m;
  const mob = await m.evaluate(() => ({ table: getComputedStyle(document.querySelector("table").parentElement).display, cards: document.querySelectorAll("ul[aria-label='Your orders'] > li").length, over: document.documentElement.scrollWidth - window.innerWidth, small: [...document.querySelectorAll("button:not(:disabled), a[class*=btn], select, input")].filter((e) => { const r = e.getBoundingClientRect(); return e.getClientRects().length && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight * 3 && !e.closest("[inert]") && r.height < 40; }).map((e) => e.tagName + ":" + Math.round(e.getBoundingClientRect().height)) }));
  check("H-01 on a phone the desktop table is replaced by stacked order cards (18), with no page-level horizontal overflow and controls at least 40 px tall", mob.table === "none" && mob.cards === 18 && mob.over <= 0 && mob.small.length === 0, JSON.stringify(mob));
  await m.screenshot({ path: `${SHOTS}/45-supplier-orders-mobile-390.png`, fullPage: false });
  const cardText = await m.evaluate(() => document.querySelector("ul[aria-label='Your orders'] > li").textContent);
  check("H-02 a mobile card labels every field (Buyer, Product, Amount, Fulfilment, Payment, Updated) and has a View action", /Buyer/.test(cardText) && /Product/.test(cardText) && /Amount/.test(cardText) && /Fulfilment/.test(cardText) && /Payment status unavailable/.test(cardText) && (await m.evaluate(() => !!document.querySelector("ul[aria-label='Your orders'] > li a[aria-label^='View order']"))));
  const trigger = await m.evaluateHandle(() => [...document.querySelectorAll("button")].find((x) => /^Filters/.test(x.textContent.trim())));
  await trigger.click();
  await sleep(500);
  const dlg = await m.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return { open: !!d && getComputedStyle(d).visibility !== "hidden", modal: d?.getAttribute("aria-modal"), label: d?.getAttribute("aria-label"), focus: document.activeElement?.getAttribute("aria-label"), inertOutside: !!d && !d.hasAttribute("inert") }; });
  check("H-03 the filter drawer opens as a labelled modal dialog and focus moves into it (the close button)", dlg.open && dlg.modal === "true" && dlg.label === "Filters" && /Close filters/.test(dlg.focus ?? ""), JSON.stringify(dlg));
  await m.select("#so-status", "delivered");
  await waitFor(m, () => location.search.includes("status=delivered"));
  await m.keyboard.press("Escape");
  await sleep(400);
  const after = await m.evaluate(() => ({ closed: !document.querySelector('[role="dialog"]') || document.querySelector('[role="dialog"]').hasAttribute("inert"), focus: document.activeElement?.textContent.trim().slice(0, 12), cards: document.querySelectorAll("ul[aria-label='Your orders'] > li").length }));
  check("H-04 choosing a status in the drawer filters the list (2 cards), Escape closes the drawer and focus returns to the Filters button", after.closed && /^Filters/.test(after.focus ?? "") && after.cards === 2, JSON.stringify(after));
  await m.context.close();
  const k = await open("/supplier/orders", { session: SA.s });
  const order = [];
  for (let i = 0; i < 80; i++) { await k.keyboard.press("Tab"); const id = await k.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim().slice(0, 24) || document.activeElement?.tagName); order.push(id); if (id === "View order FBM-ORD-S45A0001") break; }
  const labelled = await k.evaluate(() => [...document.querySelectorAll("textarea, input, select")].filter((e) => e.getClientRects().length).filter((e) => !(e.labels && e.labels.length) && !e.getAttribute("aria-label")).map((e) => e.id || e.tagName));
  check("H-05 keyboard only: Tab reaches the metrics, status chips, search, filters and then the View buttons of the rows in order; every visible form control has a label", order.includes("so-search") && order.some((x) => /^Awaiting Confirmation/.test(x)) && order.at(-1) === "View order FBM-ORD-S45A0001" && labelled.length === 0, `${order.length} tabs; unlabelled: ${labelled.join(",")}`);
  const focusStyle = await k.evaluate(() => { const el = document.activeElement; const cs = getComputedStyle(el); return { outline: cs.outlineStyle, width: parseFloat(cs.outlineWidth) }; });
  check("H-06 the focused control has a visible focus indicator", focusStyle.outline !== "none" && focusStyle.width >= 2, JSON.stringify(focusStyle));
  await k.context.close();

  // ================= I: responsive (16 widths, list and detail, with the long names)
  const over = [];
  for (const w of [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560]) {
    for (const p of ["/supplier/orders", `/supplier/orders/${O(14)}`]) {
      const pg = await open(p, { width: w, height: 900, session: SA.s });
      const o = await overflow(pg);
      if (o > 0) over.push(`${p.slice(0, 20)}@${w}:${o}`);
      await pg.context.close();
    }
  }
  check("I-01 no page-level horizontal overflow at 16 widths from 320 to 2560 on the list and on the detail of the order with the very long product and buyer names", over.length === 0, over.join(", "));
  const reduced = await open("/supplier/orders", { session: SA.s });
  await reduced.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const rm = await reduced.evaluate(() => document.getAnimations().length === 0);
  check("I-02 with reduced motion requested, nothing on the page is animating", rm);
  await reduced.context.close();
  const dpage = await open(`/supplier/orders/${O(11)}`, { session: SA.s });
  await dpage.screenshot({ path: `${SHOTS}/45-supplier-order-detail-1440.png`, fullPage: true });
  check("I-03 the detail page has one h1, labelled sections (Items ordered, Order history, Order summary, Not available yet) and no console error", (await dpage.evaluate(() => document.querySelectorAll("h1").length)) === 1 && (await dpage.evaluate(() => ["Items ordered", "Order history", "Order summary", "Not available yet"].every((t) => [...document.querySelectorAll("h2")].some((h) => h.textContent.trim() === t)))) && dpage.errs.length === 0, dpage.errs.join(" | "));
  await dpage.context.close();

  // ================= J: scale, query plans and timing (SKIP_PERF=1 skips)
  if (!process.env.SKIP_PERF) {
    const SP = await registerSupplier("perf", ["s45-perf-seller"]);
    created.users.push(SP.id);
    const PERF = { supplierKey: "s45-perf-seller", supplierName: "Perf Seller", supplierSlug: "s45-perf-seller" };
    const bulk = [];
    for (let i = 0; i < 10000; i++) {
      const placedAt = new Date(Date.now() - Math.floor(i * 0.04 * DAY) - 60_000 * (i % 600));
      bulk.push(mkOrder(i % 3 === 0 ? BB.id : BA.id, PERF, `FBM-ORD-${rand8()}`, { status: STATUSES[(i * 7) % 13], placedAt, updatedAt: new Date(placedAt.getTime() + (i % 9) * 3_600_000), currency: i % 12 === 0 ? "USD" : "INR", totalMinor: 100000 + ((i * 7919) % 9_000_000), items: [{ name: `Perf item ${i} ${i % 17 === 0 ? "cotton" : "widget"}`, quantity: 1 + (i % 900), unit: "Piece", unitPriceMinor: 5000 + (i % 400) }] }));
    }
    for (let i = 0; i < bulk.length; i += 1000) await orders.insertMany(bulk.slice(i, i + 1000));
    check("J-00 seeded 10,000 orders for one company (13 statuses, two currencies, 400 days)", (await orders.countDocuments({ supplierKey: "s45-perf-seller" })) === 10000);
    const key = ["s45-perf-seller"];
    const plan = async (name, filter, sort, expectIndex) => {
      const e = await orders.find(filter).sort(sort).limit(21).explain("executionStats");
      const w = JSON.stringify(e.queryPlanner.winningPlan);
      const blocking = /"stage":"SORT"/.test(w); const coll = /COLLSCAN/.test(w);
      const ex = e.executionStats;
      const idx = (w.match(/"indexName":"([^"]+)"/) ?? [])[1];
      return { name, blocking, coll, keys: ex.totalKeysExamined, docs: ex.totalDocsExamined, returned: ex.nReturned, idx, ok: !blocking && !coll && (!expectIndex || idx === expectIndex) };
    };
    const inKey = { supplierKey: { $in: key } };
    const plans = [
      await plan("newest", inKey, { placedAt: -1, _id: -1 }, "supplier_orders_newest"),
      await plan("status group (3 statuses) newest", { $and: [inKey, { status: { $in: ["DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY"] } }] }, { placedAt: -1, _id: -1 }),
      await plan("single status newest", { $and: [inKey, { status: { $in: ["DELIVERED"] } }] }, { placedAt: -1, _id: -1 }),
      await plan("updated", inKey, { updatedAt: -1, _id: -1 }, "supplier_orders_updated"),
      await plan("amount (INR) high", { $and: [inKey, { currency: "INR" }] }, { totalMinor: -1, _id: -1 }, "supplier_orders_amount"),
      await plan("amount (INR) low", { $and: [inKey, { currency: "INR" }] }, { totalMinor: 1, _id: 1 }, "supplier_orders_amount"),
      await plan("date window by order date", { $and: [inKey, { placedAt: { $gte: new Date(Date.now() - 30 * DAY), $lt: new Date() } }] }, { placedAt: -1, _id: -1 }),
      await plan("date window by updated", { $and: [inKey, { updatedAt: { $gte: new Date(Date.now() - 30 * DAY), $lt: new Date() } }] }, { updatedAt: -1, _id: -1 }),
      await plan("reference prefix", { $and: [inKey, { $or: [{ reference: { $regex: "^FBM-ORD-A" } }, { quotationReference: { $regex: "^FBM-ORD-A" } }, { inquiryReference: { $regex: "^FBM-ORD-A" } }, { "items.name": { $regex: "FBM-ORD-A", $options: "i" } }] }] }, { placedAt: -1, _id: -1 }),
    ];
    for (const p of plans) check(`J-plan ${p.name}: no blocking sort and no collection scan; ${p.keys} keys / ${p.docs} documents examined for ${p.returned} returned${p.idx ? ` (${p.idx})` : ""}`, p.ok, JSON.stringify(p));
    const t = (r) => `${r.p50.toFixed(0)}/${r.p95.toFixed(0)}/${r.p99.toFixed(0)} ms`;
    const tl = await timeIt(() => olist(SP.s));
    const tf = await timeIt(() => olist(SP.s, "?status=shipped&range=90d"));
    const ts = await timeIt(() => olist(SP.s, "?q=cotton"));
    const tr = await timeIt(() => olist(SP.s, `?q=FBM-ORD-${"A"}`));
    const tsum = await timeIt(() => SP.s.call("GET", `${API}/summary`));
    const tdeep = await timeIt(() => olist(SP.s, "?page=500&limit=20"), 15);
    const tamt = await timeIt(() => olist(SP.s, "?currency=INR&sort=amount_high"));
    const sampleRef = (await orders.findOne({ supplierKey: "s45-perf-seller" })).reference;
    const tdet = await timeIt(() => SP.s.call("GET", `${API}/${sampleRef}`));
    const sizes = (await olist(SP.s, "?limit=50")).text.length;
    check(`J-01 first-page list (p50/p95/p99 ${t(tl)}); target p95 < 400 ms for a paginated listing`, tl.p95 < 1000, `${t(tl)} (target 400 ms: ${tl.p95 < 400 ? "met" : "MISSED"})`);
    check(`J-02 filtered list status + 90 days (${t(tf)}); target p95 < 500 ms`, tf.p95 < 1000, `${t(tf)} (target 500 ms: ${tf.p95 < 500 ? "met" : "MISSED"})`);
    check(`J-03 product search 'cotton' (substring inside the company's own 10,000 orders) (${t(ts)}); target p95 < 500 ms`, ts.p95 < 1500, `${t(ts)} (target 500 ms: ${ts.p95 < 500 ? "met" : "MISSED"})`);
    check(`J-04 reference-prefix search (${t(tr)})`, tr.p95 < 1500, `${t(tr)} (target 500 ms: ${tr.p95 < 500 ? "met" : "MISSED"})`);
    check(`J-05 counts only, the summary route (${t(tsum)}); target p95 < 700 ms`, tsum.p95 < 1000, `${t(tsum)} (target 700 ms: ${tsum.p95 < 700 ? "met" : "MISSED"})`);
    check(`J-06 deep page 500 of 20 (${t(tdeep)}); the offset is bounded at page 1000`, tdeep.p95 < 1500, `${t(tdeep)} (target 400 ms: ${tdeep.p95 < 400 ? "met" : "MISSED"})`);
    check(`J-07 amount sort within one currency (${t(tamt)})`, tamt.p95 < 1000, `${t(tamt)} (target 400 ms: ${tamt.p95 < 400 ? "met" : "MISSED"})`);
    check(`J-08 detail by reference (${t(tdet)}); target p95 < 350 ms`, tdet.p95 < 1000, `${t(tdet)} (target 350 ms: ${tdet.p95 < 350 ? "met" : "MISSED"})`);
    check(`J-09 a 50-row list response is small (${(sizes / 1024).toFixed(1)} KB) and carries no full documents`, sizes < 60_000, `${(sizes / 1024).toFixed(1)} KB`);
    await clearLimits();
    const conc = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? SP.s.call("GET", `${API}/summary`) : olist(SP.s, "?status=delivered"))));
    check("J-10 eight simultaneous list and summary requests all answer 200 with consistent counts", conc.every((r) => r.status === 200) && new Set(conc.filter((_, i) => i % 2).map((r) => JSON.stringify(r.json.data.counts))).size === 1);
    const big = await SP.s.call("POST", `${API}/export`, {});
    check("J-11 an export of 10,000 orders is cut at the cap: 5,000 rows, truncated announced in the header and no more than the cap held in memory", big.status === 200 && big.headers.get("x-export-rows") === "5000" && big.headers.get("x-export-truncated") === "true" && big.text.trim().split("\r\n").length === 5001);
    const pBig = await open("/supplier/orders?page=3", { session: SP.s });
    const pg3 = await pBig.evaluate(() => ({ rows: document.querySelectorAll("table tbody tr").length, summary: document.querySelector('[aria-live="polite"] p')?.textContent, pager: !!document.querySelector('nav[aria-label="Order pages"]') }));
    check("J-12 the server-rendered page 3 shows 20 rows, the exact total, and a pager", pg3.rows === 20 && /Showing 41-60 of 10,000 orders/.test(pg3.summary ?? "") && pg3.pager, JSON.stringify(pg3));
    globalThis.__page = pBig;
    await pBig.evaluate(() => document.querySelector('nav[aria-label="Order pages"] button[aria-label="Next page"]').click());
    await waitFor(pBig, () => location.search.includes("page=4") && /Showing 61-80/.test(document.body.textContent));
    check("J-13 the pager's Next goes to page 4 (address and rows follow), and Previous returns", (await pBig.evaluate(() => /Showing 61-80/.test(document.body.textContent))));
    await pBig.context.close();
    await orders.deleteMany({ supplierKey: "s45-perf-seller" });
  }
}

let failed = false;
try {
  await main45();
} catch (e) {
  failed = true;
  console.error("TEST RUN ABORTED:", e);
}
if (!process.env.KEEP) {
  try {
    await orders.deleteMany({ $or: [{ reference: /^FBM-ORD-S45/ }, { supplierKey: "s45-perf-seller" }] });
    await qts.deleteMany({ reference: /^FBM-QT-S45/ });
    await inq.deleteMany({ reference: /^FBM-INQ-S45/ });
    await db.collection("buyer_settings").deleteMany({ buyerId: { $in: created.users } });
    await db.collection("security_events").deleteMany({ type: "supplier_orders_exported" });
    await companies.deleteMany({ ownerUserId: { $in: created.users } });
    await users.deleteMany({ email: new RegExp(`^t45-${stamp}-`) });
  } catch (e) {
    console.error("cleanup failed", e.message);
  }
}
await browser.close();
await client.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed${bad.length ? `; FAILED: ${bad.map((b2) => b2.name.slice(0, 40)).join(" | ")}` : ""}`);
process.exit(failed || bad.length ? 1 : 0);
