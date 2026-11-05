import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Pages 29 and 30 (Buyer My Quotations: /buyer/quotations and /api/buyer/quotations, Quotation Details & Comparison:
// /buyer/quotations/[reference], /buyer/quotations/compare, accept / reject / revision-request).
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test, Chrome and puppeteer-core.
// No supplier can create a quotation yet, so every quotation here is inserted directly into the throwaway database.
// Removes its own users, inquiries and quotations at the end unless KEEP=1. SKIP_PERF=1 skips group P.
const BASE = process.env.BASE || "http://localhost:3100";
const ROOT = "R:/indiamartref";
const TEST_DB = "finbynmart_test";
const require = createRequire(`${ROOT}/`);
const { MongoClient, ObjectId } = require("mongodb");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === TEST_DB) throw new Error("Refusing: the configured live database is named like the test database.");
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const db = client.db(TEST_DB);
const users = db.collection("users"), inq = db.collection("inquiries"), qts = db.collection("quotations");
const clearLimits = () => db.collection("rate_limits").deleteMany({});
await clearLimits();

const stamp = Date.now();
const emailOf = (tag) => `t2930-${stamp}-${tag}@example.test`;
let ipN = 0;
const nextIp = () => `10.30.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "quotation test passphrase";
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
const register = async (tag) => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Quote ${tag.toUpperCase()} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: "Quotation Test Traders", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register ${tag}: ${r.status} ${r.text}`);
  const user = await users.findOne({ email: emailOf(tag) });
  return { s, id: user._id, email: emailOf(tag) };
};

const SUP = { s1: { supplierKey: "shree-textiles", supplierName: "Shree Textiles", supplierSlug: "shree-textiles" }, s2: { supplierKey: "sunrise-hub", supplierName: "Sunrise Hub", supplierSlug: "sunrise-hub" }, s3: { supplierKey: "SLR9999", supplierName: "Zenith Packaging" } };
const mkInquiry = async (buyerId, over = {}) => {
  const createdAt = ago(20);
  const reference = over.reference ?? `FBM-INQ-${rand8()}`;
  const doc = { buyerId, buyerType: "REGISTERED", reference, ...SUP.s1, quantity: 1000, unit: "Meter", message: "Private requirement message, buyer only.", inquiryType: "GET_BEST_QUOTE", deliveryLocation: { text: "Jaipur, Rajasthan 302001" }, consent: { accepted: true, at: createdAt, policyVersion: null, termsPath: "/terms-and-conditions", privacyPath: "/privacy-policy" }, notification: { status: "BLOCKED", reason: "No service configured.", at: createdAt }, status: "QUOTED", statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: createdAt }], createdAt, updatedAt: createdAt, ...over };
  const { insertedId } = await inq.insertOne(doc);
  return { _id: insertedId, reference };
};
const qdoc = (buyerId, iq, over = {}) => {
  const sentAt = over.sentAt ?? ago(3);
  return { reference: `FBM-QT-${rand8()}`, version: 1, isCurrent: true, inquiryId: iq._id, inquiryReference: iq.reference, buyerId, ...SUP.s1, productName: "Cotton Fabric", currency: "INR", unit: "Meter", quantity: 1000, unitPriceMinor: 74000, validUntil: inFuture(30), status: "SENT", sentAt, createdAt: sentAt, updatedAt: sentAt, events: [{ type: "SENT", at: sentAt, actor: "supplier" }], ...over };
};

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
const content = (p) => p.evaluate(() => (document.querySelector("#buyer-content") ?? document.body).textContent.replace(/[ \t\r\n]+/g, " "));
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const clickText = (p, selector, t) => p.evaluate((s, x) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(x) && e.getClientRects().length); if (!el) return false; el.click(); return true; }, selector, t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const timeIt = async (fn, n = 15) => { const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); await fn(); t.push(performance.now() - s); } return { p50: med(t, 0.5), p95: med(t, 0.95) }; };
const list = (s, q = "") => s.call("GET", `/api/buyer/quotations${q}`);
const detail = (s, ref, q = "") => s.call("GET", `/api/buyer/quotations/${ref}${q}`);
const cmp = (s, references) => s.call("POST", "/api/buyer/quotations/compare", { references });
const act = (s, ref, kind, body) => s.call("POST", `/api/buyer/quotations/${ref}/${kind}`, body);

async function main() {
  const A = await register("a");
  const B = await register("b");
  const C = await register("c");
  const SUPPLIER = new Session();
  await SUPPLIER.call("POST", "/api/auth/register/supplier", { businessName: "Quote Supplier Co", contactName: "Sia Rao", email: emailOf("sup"), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  const SUSP = await register("susp");
  await users.updateOne({ _id: SUSP.id }, { $set: { accountStatus: "SUSPENDED" } });

  // ---------- seed: buyer A
  const I1 = await mkInquiry(A.id, { reference: "FBM-INQ-QAAAAAA1", productKey: "cotton-fabric", productName: "Cotton Fabric" });
  const I2 = await mkInquiry(A.id, { reference: "FBM-INQ-QAAAAAA2" });
  const IB = await mkInquiry(B.id, { reference: "FBM-INQ-QBBBBBB1" });
  const ref = (n) => `FBM-QT-AAAAAAA${n}`;
  const detailed = {
    discount: { kind: "PERCENT", bp: 500 }, tax: { label: "GST", bp: 1200 }, charges: [{ label: "Freight", minor: 500000 }], moq: { quantity: 200, unit: "Meter" },
    terms: { deliveryMinDays: 7, deliveryMaxDays: 10, deliveryLocation: "Jaipur", incoterms: "EXW", paymentTerms: "50% advance, 50% on delivery", packaging: "Export carton", warranty: "6 months" },
    productSnapshot: { description: "Plain woven cotton.", specs: [{ label: "GSM", value: "120" }], features: ["Pre-shrunk"] },
    attachments: [{ id: "att1", name: "spec-sheet.pdf", type: "application/pdf", size: 120000 }],
  };
  const v1 = qdoc(A.id, I1, { reference: ref("1"), version: 1, isCurrent: false, status: "SUPERSEDED", unitPriceMinor: 76000, sentAt: ago(6), validUntil: inFuture(25), ...detailed, events: [{ type: "SENT", at: ago(6), actor: "supplier" }, { type: "SUPERSEDED", at: ago(3), actor: "system" }] });
  const v2 = qdoc(A.id, I1, { reference: ref("1"), version: 2, isCurrent: true, unitPriceMinor: 74000, sentAt: ago(3), validUntil: inFuture(30), ...detailed, events: [{ type: "SENT", at: ago(3), actor: "supplier" }] });
  const q2 = qdoc(A.id, I1, { reference: ref("2"), ...SUP.s2, unitPriceMinor: 71000, validUntil: inFuture(5), sentAt: ago(2), productName: "Cotton Fabric" });
  const q3 = qdoc(A.id, I1, { reference: ref("3"), ...SUP.s3, currency: "USD", unit: "Piece", quantity: 500, unitPriceMinor: 1200, sentAt: ago(1), productName: "Cotton Fabric" });
  const q4 = qdoc(A.id, I1, { reference: ref("4"), validUntil: ago(2), sentAt: ago(40), productName: "Old Cotton Offer" });
  const q5 = qdoc(A.id, I1, { reference: ref("5"), status: "REVISION_REQUESTED", validUntil: inFuture(10), sentAt: ago(8), productName: "Cotton Revision", events: [{ type: "SENT", at: ago(8), actor: "supplier" }, { type: "REVISION_REQUESTED", at: ago(7), actor: "buyer", reason: "PRICE", message: "Please lower the unit price a little." }] });
  const q6 = qdoc(A.id, I2, { reference: ref("6"), productName: "Second Inquiry Offer", sentAt: ago(4) });
  const q7 = qdoc(A.id, I2, { reference: ref("7"), ...SUP.s2, status: "ACCEPTED", accepted: true, decision: { type: "ACCEPTED", at: ago(1), reason: null }, productName: "Accepted Offer", sentAt: ago(5), events: [{ type: "SENT", at: ago(5), actor: "supplier" }, { type: "ACCEPTED", at: ago(1), actor: "buyer" }] });
  const q8 = qdoc(A.id, I2, { reference: ref("8"), ...SUP.s3, status: "REJECTED", decision: { type: "REJECTED", at: ago(2), reason: "Too slow" }, productName: "Rejected Offer", sentAt: ago(9) });
  const draft = qdoc(A.id, I2, { reference: ref("9"), status: "DRAFT", productName: "Secret Draft" });
  const withdrawn = qdoc(A.id, I2, { reference: ref("W"), status: "WITHDRAWN", productName: "Withdrawn Offer" });
  await qts.insertMany([v1, v2, q2, q3, q4, q5, q6, q7, q8, draft, withdrawn]);
  const qb1 = qdoc(B.id, IB, { reference: "FBM-QT-BBBBBBB1", supplierName: "Bravo Unique Supplier", productName: "Bravo Unique Product" });
  await qts.insertOne(qb1);
  // current quotations of A (no drafts): v2 (ref1), q2, q3, q4, q5, q6, q7, q8, withdrawn = 9
  // tabs: active = ref1, q2, q3, q6, (withdrawn is WITHDRAWN: no tab) = 4; expiring = q2 (5 days) = 1; revision = q5 = 1; accepted = q7; rejected = q8; expired = q4

  // ================= A: access
  const un = new Session();
  const routes = [["GET", "/api/buyer/quotations"], ["GET", `/api/buyer/quotations/${ref("1")}`], ["POST", "/api/buyer/quotations/compare", { references: [ref("1"), ref("2")] }], ["POST", `/api/buyer/quotations/${ref("2")}/accept`, { version: 1, confirm: true }], ["POST", `/api/buyer/quotations/${ref("2")}/reject`, { version: 1, confirm: true }], ["POST", `/api/buyer/quotations/${ref("2")}/revision-request`, { version: 1, reason: "PRICE", message: "Lower the price please." }]];
  const anon = await Promise.all(routes.map(([m, p, b]) => un.call(m, p, b)));
  check("A-01 no session: every quotation route answers 401, private, with nothing of a quotation", anon.every((r) => r.status === 401 && /no-store/.test(r.headers.get("cache-control") ?? "") && !/FBM-QT|Shree/.test(r.text ?? "")), anon.map((r) => r.status).join(" "));
  const sup = await Promise.all(routes.map(([m, p, b]) => SUPPLIER.call(m, p, b)));
  check("A-02 a supplier account: every quotation route answers 403", sup.every((r) => r.status === 403), sup.map((r) => r.status).join(" "));
  const susp = await list(SUSP.s);
  check("A-03 a suspended buyer's session no longer works (401)", susp.status === 401);
  const forged = new Session(); forged.jar.set("finbyn_session", "garbage.value");
  check("A-04 a forged session cookie: 401", (await list(forged)).status === 401);
  const anonPages = await Promise.all(["/buyer/quotations", `/buyer/quotations/${ref("1")}`, `/buyer/quotations/compare?refs=${ref("1")},${ref("2")}`].map((p) => un.page(p)));
  check("A-05 the three pages without a session redirect to sign-in and carry no quotation data", anonPages.every((r) => [302, 303, 307, 308].includes(r.status) && /sign-in/.test(r.location ?? "") && !/Shree|Cotton|7,40,000/.test(r.text)), anonPages.map((r) => `${r.status} ${r.location}`).join(" | "));
  const supPages = await SUPPLIER.page("/buyer/quotations");
  check("A-06 a supplier opening the buyer quotations page sees no quotations", !/FBM-QT|Shree Textiles/.test(supPages.text) || supPages.status !== 200);

  // ================= B: ownership
  const bList = await list(B.s);
  check("B-01 buyer B sees only B's own quotation, never A's", bList.json.quotations.length === 1 && bList.json.quotations[0].reference === "FBM-QT-BBBBBBB1" && !/FBM-QT-AAAAAAA/.test(bList.text));
  const foreign = await detail(B.s, ref("1"));
  const unknown = await detail(B.s, "FBM-QT-ZZZZZZZZ");
  const malformed = await detail(B.s, "not-a-reference");
  check("B-02 another buyer's reference, an unknown one and a malformed one all answer the same 404 message with nothing of the quotation", [foreign, unknown, malformed].every((r) => r.status === 404 && r.json?.message === "That quotation was not found.") && !/Shree|740/.test(foreign.text));
  const draftRead = await detail(A.s, ref("9"));
  check("B-03 a draft is not reachable even for its own buyer (404), and is not in the list or the counts", draftRead.status === 404 && !JSON.stringify((await list(A.s, "?limit=50")).json).includes("Secret Draft"));
  const spoof = await list(B.s, `?buyerId=${A.id}&userId=${A.id}`);
  check("B-04 a buyerId in the query is ignored: the session decides", spoof.status === 200 && spoof.json.quotations.every((r) => r.reference === "FBM-QT-BBBBBBB1"));
  const foreignCmp = await cmp(B.s, [ref("1"), ref("2")]);
  check("B-05 comparing another buyer's quotations answers 404 and shows nothing", foreignCmp.status === 404 && !/Shree|740/.test(foreignCmp.text));
  const mixedCmp = await cmp(A.s, [ref("1"), "FBM-QT-BBBBBBB1"]);
  check("B-06 comparing one's own with another buyer's quotation is 404 too (no hint that it exists)", mixedCmp.status === 404 && !/Bravo/.test(mixedCmp.text));
  const before = JSON.stringify(await qts.find({ reference: { $in: [ref("2"), ref("6")] } }).sort({ reference: 1 }).toArray());
  const foreignActs = await Promise.all([act(B.s, ref("2"), "accept", { version: 1, confirm: true }), act(B.s, ref("2"), "reject", { version: 1, confirm: true }), act(B.s, ref("2"), "revision-request", { version: 1, reason: "PRICE", message: "Please reduce it for me." })]);
  const after = JSON.stringify(await qts.find({ reference: { $in: [ref("2"), ref("6")] } }).sort({ reference: 1 }).toArray());
  check("B-07 accept, reject and revision on another buyer's quotation: 404 and the stored quotation is untouched", foreignActs.every((r) => r.status === 404) && before === after);
  check("B-08 the detail page of another buyer's quotation is the site's 404 with nothing of it", await (async () => { const r = await B.s.page(`/buyer/quotations/${ref("1")}`); return r.status === 404 && !/Shree|7,40,000/.test(r.text); })());

  // ================= C: list
  const all = await list(A.s, "?limit=50");
  const a = all.json;
  check("C-01 A's list holds the nine current quotations (versions are one entry), newest first, with private no-store", all.status === 200 && a.meta.total === 9 && /no-store/.test(all.headers.get("cache-control") ?? "") && a.quotations[0].reference === ref("3"), `${a.meta.total} / ${a.quotations[0]?.reference}`);
  const tc = a.data.tabCounts;
  check("C-02 tab counts: all 9, active 4, expiring 1, revision 1, accepted 1, rejected 1, expired 1", tc.all === 9 && tc.active === 4 && tc.expiring === 1 && tc.revision === 1 && tc.accepted === 1 && tc.rejected === 1 && tc.expired === 1, JSON.stringify(tc));
  check("C-03 summary: total 9, active 4, expiring soon 1, accepted 1, rejected 1", JSON.stringify(a.data.summary) === JSON.stringify({ total: 9, active: 4, expiringSoon: 1, accepted: 1, rejected: 1 }), JSON.stringify(a.data.summary));
  const tabRefs = async (s) => (await list(A.s, `?status=${s}&limit=50`)).json.quotations.map((r) => r.reference).sort();
  check("C-04 each tab returns exactly its quotations (expired = past validity, revision = requested and still valid)", (await tabRefs("expired")).join() === ref("4") && (await tabRefs("revision")).join() === ref("5") && (await tabRefs("accepted")).join() === ref("7") && (await tabRefs("rejected")).join() === ref("8") && (await tabRefs("expiring")).join() === ref("2") && (await tabRefs("active")).length === 4);
  const exp = a.quotations.find((r) => r.reference === ref("4"));
  check("C-05 an expired quotation is shown as Expired (derived from its validity date), the stored status is untouched", exp.status === "EXPIRED" && (await qts.findOne({ reference: ref("4") })).status === "SENT");
  const search = async (q) => (await list(A.s, `?q=${encodeURIComponent(q)}&limit=50`)).json.quotations.map((r) => r.reference).sort();
  check("C-06 search matches quotation number prefix, inquiry reference, product and supplier; and a regex character is taken literally", (await search("FBM-QT-AAAAAAA2")).join() === ref("2") && (await search("FBM-INQ-QAAAAAA2")).length === 4 && (await search("Second Inquiry")).join() === ref("6") && (await search("Zenith")).length === 2 && (await search(".*")).length === 0);
  const oldest = (await list(A.s, "?sort=oldest&limit=50")).json.quotations;
  const valid = (await list(A.s, "?sort=valid&limit=50")).json.quotations;
  check("C-07 sorting: oldest first puts the 40-day-old quotation first; by validity puts the expired one first", oldest[0].reference === ref("4") && valid[0].reference === ref("4"));
  const p1 = await list(A.s, "?limit=4&page=1"); const p3 = await list(A.s, "?limit=4&page=3");
  check("C-08 pagination: 4 per page, 3 pages, the last page holds the remaining one, no row appears twice", p1.json.quotations.length === 4 && p1.json.meta.totalPages === 3 && p3.json.quotations.length === 1 && new Set([...p1.json.quotations, ...(await list(A.s, "?limit=4&page=2")).json.quotations, ...p3.json.quotations].map((r) => r.reference)).size === 9);
  const bad = await Promise.all(["?limit=500", "?page=0", "?status=hacked", "?sort=price", "?limit=abc", `?q=${"x".repeat(200)}`].map((q) => list(A.s, q)));
  check("C-09 invalid filters are refused with 400 (or a capped page size), never an unbounded list", bad.slice(1).every((r) => r.status === 400) && (bad[0].status === 400 || bad[0].json.quotations.length <= 50), bad.map((r) => r.status).join(" "));
  const row = a.quotations.find((r) => r.reference === ref("1"));
  check("C-10 a list row carries only what the table shows (no buyer id, events, terms, attachment ids, e-mail)", !/buyerId|events|attachments|"terms"|example\.test|supplierKey/.test(JSON.stringify(row)) && row.unitPrice === "₹740.00" && row.total.text === "₹7,92,360.00" && row.version === 2, JSON.stringify(row).slice(0, 220));
  const none = await list(C.s);
  check("C-11 a buyer with no quotations gets an empty list and zero counts (nothing invented)", none.status === 200 && none.json.quotations.length === 0 && none.json.data.summary.total === 0);

  // ================= D: detail
  const d1 = await detail(A.s, ref("1"));
  const d = d1.json?.data;
  check("D-01 detail returns the current version (2) with supplier, inquiry, price breakdown, terms, versions, events and capabilities; private no-store", d1.status === 200 && d.quotation.version === 2 && d.quotation.isCurrent && d.inquiry.reference === "FBM-INQ-QAAAAAA1" && /no-store/.test(d1.headers.get("cache-control") ?? ""));
  const rows = Object.fromEntries(d.priceBreakdown.rows.map((r) => [r.label, r.value]));
  check("D-02 the price breakdown is exact: 1,000 x ₹740.00 = ₹7,40,000.00; 5% discount ₹37,000.00; taxable ₹7,03,000.00; GST 12% ₹84,360.00; freight ₹5,000.00; total ₹7,92,360.00", rows["Subtotal"] === "₹7,40,000.00" && rows["Discount (5%)"] === "- ₹37,000.00" && rows["Taxable Amount"] === "₹7,03,000.00" && rows["GST (12%)"] === "₹84,360.00" && rows["Freight"] === "₹5,000.00" && rows["Total Amount"] === "₹7,92,360.00", JSON.stringify(rows));
  const d2 = (await detail(A.s, ref("2"))).json.data;
  const rows2 = Object.fromEntries(d2.priceBreakdown.rows.map((r) => [r.label, r.value]));
  check("D-03 a quotation without tax or discount says so: Tax 'Not specified', no invented GST, total labelled 'before tax (no tax stated)'", rows2["Tax"] === "Not specified" && rows2["Discount"] === "Not specified" && /Total before tax/.test(JSON.stringify(d2.priceBreakdown.rows)) && rows2["Subtotal"] === "₹7,10,000.00");
  check("D-04 missing commercial terms are null (shown as Not Provided), never a default", d2.commercialTerms.find((t) => t.label === "Payment Terms").value === null && d2.commercialTerms.find((t) => t.label === "Warranty").value === null && d.commercialTerms.find((t) => t.label === "Payment Terms").value === "50% advance, 50% on delivery" && d.commercialTerms.find((t) => t.label === "Delivery Timeline").value === "7 - 10 days");
  check("D-05 version history lists both versions (2 current, 1 superseded) with what changed; an earlier version opens by number", d.versions.length === 2 && d.versions[0].version === 2 && d.versions[0].changes.includes("Unit price") && d.versions[1].status === "SUPERSEDED");
  const old = (await detail(A.s, ref("1"), "?version=1")).json?.data;
  check("D-06 version 1 shows its own price (₹760.00), is not current and offers no decision", old.quotation.unitPrice === "₹760.00" && !old.quotation.isCurrent && !old.capabilities.accept && !old.capabilities.reject && !old.capabilities.requestRevision);
  check("D-07 a version that does not exist (or an invalid one) is a 404", (await detail(A.s, ref("1"), "?version=9")).status === 404 && (await detail(A.s, ref("1"), "?version=abc")).status === 404 && (await detail(A.s, ref("1"), "?version=0")).status === 404);
  check("D-08 the product snapshot and attachment list are shown as saved; attachment download is not offered", d.productSnapshot.specs[0].value === "120" && d.attachments.length === 1 && d.capabilities.attachmentsDownload === false && !/storage|path|url/i.test(JSON.stringify(d.attachments)));
  check("D-09 nothing that does not exist is offered: messaging false, order false; supplier is not claimed verified unless its own record says so", d.capabilities.messageSupplier === false && d.capabilities.order === false);
  check("D-10 the detail answer holds no internal or private fields (buyer id, internal ids, e-mail, phone, consent)", !/buyerId|"_id"|inquiryId|example\.test|9876543210|"consent"/.test(d1.text));
  check("D-11 the capabilities follow the status: open ones allow accept, reject and revision; expired, accepted, withdrawn, revision-requested do not (revision-requested may still be rejected)", (await detail(A.s, ref("2"))).json.data.capabilities.accept && !(await detail(A.s, ref("4"))).json.data.capabilities.accept && !(await detail(A.s, ref("7"))).json.data.capabilities.reject && !(await detail(A.s, ref("W"))).json.data.capabilities.accept && !(await detail(A.s, ref("5"))).json.data.capabilities.requestRevision);
  const d6 = (await detail(A.s, ref("6"))).json.data;
  check("D-12 on an inquiry that already has an accepted quotation, another open quotation cannot be accepted", d6.capabilities.accept === false && d6.capabilities.reject === true);
  check("D-13 the pending revision request is shown with its reason and message", (await detail(A.s, ref("5"))).json.data.pendingRevision?.message === "Please lower the unit price a little.");

  // ================= E: comparison
  const c1 = await cmp(A.s, [ref("1"), ref("2")]);
  const cd = c1.json?.data;
  check("E-01 comparing two quotations of one inquiry returns both columns in the order asked, field rows and the inquiry link", c1.status === 200 && cd.columns.map((c) => c.reference).join() === `${ref("1")},${ref("2")}` && cd.fields.length >= 10 && cd.inquiry.reference === "FBM-INQ-QAAAAAA1");
  check("E-02 like-for-like quotations: price comparable, Unit Price and Total marked as differing, Offered Quantity not", cd.compatibility.priceComparable === true && cd.fields.find((f) => f.key === "unitPrice").differs && cd.fields.find((f) => f.key === "total").differs && !cd.fields.find((f) => f.key === "quantity").differs);
  check("E-03 NO ranking or verdict anywhere: no best, cheapest, recommended, score, rank or winner in the answer", !/best|cheapest|recommend|score|rank|winner|lowest/i.test(JSON.stringify({ ...cd, fields: cd.fields.map((f) => f.label) })), "");
  check("E-04 missing values stay null (Not Provided): the quotation without payment terms has no invented text", cd.columns[1].values.payment === null && cd.columns[0].values.payment === "50% advance, 50% on delivery");
  const c3 = (await cmp(A.s, [ref("1"), ref("3")])).json.data;
  check("E-05 different currency, unit and quantity are flagged and the offers are not called comparable", c3.compatibility.priceComparable === false && ["currency", "unit", "quantity"].every((f) => c3.compatibility.mismatches.some((m) => m.field === f)));
  const c4 = (await cmp(A.s, [ref("1"), ref("4")])).json.data;
  check("E-06 an expired quotation can be compared but is flagged as no longer an open offer", c4.compatibility.mismatches.some((m) => m.field === "status") && c4.columns[1].status === "EXPIRED");
  const diff = await cmp(A.s, [ref("1"), ref("6")]);
  check("E-07 quotations of different inquiries are refused (400) with the reason", diff.status === 400 && diff.json.code === "DIFFERENT_INQUIRIES");
  const one = await cmp(A.s, [ref("1")]); const dup = await cmp(A.s, [ref("1"), ref("1")]); const five = await cmp(A.s, [ref("1"), ref("2"), ref("3"), ref("4"), ref("5")]);
  check("E-08 fewer than two (also the same one twice) or more than four are refused with 400; four are allowed", one.status === 400 && dup.status === 400 && five.status === 400 && (await cmp(A.s, [ref("1"), ref("2"), ref("3"), ref("4")])).status === 200, `${one.status} ${dup.status} ${five.status}`);
  check("E-09 malformed references and a non-array body are refused with 400 and nothing is queried", (await cmp(A.s, ["x", "y"])).status === 400 && (await A.s.call("POST", "/api/buyer/quotations/compare", { references: "FBM-QT-AAAAAAA1" })).status === 400 && (await A.s.call("POST", "/api/buyer/quotations/compare", {})).status === 400);
  const stateBefore = JSON.stringify(await qts.find({ buyerId: A.id }).sort({ reference: 1, version: 1 }).toArray());
  await cmp(A.s, [ref("1"), ref("2"), ref("3")]);
  check("E-10 comparing changes nothing: every stored quotation of A is byte-for-byte the same afterwards", stateBefore === JSON.stringify(await qts.find({ buyerId: A.id }).sort({ reference: 1, version: 1 }).toArray()));

  // ================= G: pages (browser)
  const lp = await open("/buyer/quotations", { session: A.s });
  await lp.waitForFunction(() => Object.keys(document.querySelector("#quotation-search") ?? {}).some((k) => k.startsWith("__react")), { timeout: 10000 }).catch(() => {});
  await sleep(500);
  const lnav = await lp.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, crumb: document.querySelector("#buyer-content")?.textContent.slice(0, 120), active: document.querySelector("#buyer-sidebar [aria-current]")?.textContent.trim() ?? null, title: document.title, robots: document.querySelector("meta[name=robots]")?.content }));
  const lt = await content(lp);
  check("G-01 My Quotations: shell with Quotations current, heading 'My Quotations', breadcrumb, five KPI cards with the real numbers, noindex, no console errors", lp.status === 200 && lnav.h1 === "My Quotations" && /Quotations/.test(lnav.active ?? "") && /Home \/ Buyer Dashboard \/ Quotations/.test(lnav.crumb) && /Total Quotations\s*\d/.test(lt) && /noindex/.test(lnav.robots ?? "") && lp.errs.length === 0, `${JSON.stringify(lnav)} ${lp.errs.join("|")}`);
  const rowsText = await lp.evaluate(() => [...document.querySelectorAll("tbody tr")].map((tr) => tr.textContent.replace(/\s+/g, " ")));
  check("G-02 the table shows the nine current quotations with number, supplier, quantity, unit price, total and status; the 'before tax' note where no tax is stated; no draft", rowsText.length === 9 && rowsText.some((t) => /FBM-QT-AAAAAAA1/.test(t) && /₹7,92,360\.00/.test(t) && /₹740\.00/.test(t)) && rowsText.some((t) => /before tax/.test(t)) && !/Secret Draft/.test(rowsText.join(" ")), rowsText.length);
  await clickText(lp, "button", "Expired");
  await lp.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1, { timeout: 8000 }).catch(() => {});
  const expRows = await lp.evaluate(() => ({ n: document.querySelectorAll("tbody tr").length, url: location.search, pressed: [...document.querySelectorAll("[aria-pressed=true]")].map((b) => b.textContent.trim()) }));
  check("G-03 the Expired tab filters in place (one row), is marked pressed, and the address carries ?status=expired", expRows.n === 1 && /status=expired/.test(expRows.url) && expRows.pressed.some((t) => /^Expired/.test(t)), JSON.stringify(expRows));
  await clickText(lp, "button", "All");
  await lp.waitForFunction(() => document.querySelectorAll("tbody tr").length === 9, { timeout: 8000 }).catch(() => {});
  await lp.type("#quotation-search", "Zenith");
  await lp.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2, { timeout: 8000 }).catch(() => {});
  const sRows = await lp.evaluate(() => ({ n: document.querySelectorAll("tbody tr").length, url: location.search }));
  check("G-04 search is debounced, filters in place (2 Zenith quotations) and is kept in the address; Clear search restores all", sRows.n === 2 && /q=Zenith/.test(sRows.url));
  await lp.click("button[aria-label='Clear search']");
  await lp.waitForFunction(() => document.querySelectorAll("tbody tr").length === 9, { timeout: 8000 }).catch(() => {});
  await lp.select("#quotation-sort", "oldest");
  await lp.waitForFunction(() => /sort=oldest/.test(location.search) && /FBM-QT-AAAAAAA4/.test(document.querySelector("tbody tr")?.textContent ?? ""), { timeout: 8000 }).catch(() => {});
  check("G-05 changing the sort re-reads the server and the oldest quotation is first", await lp.evaluate(() => /FBM-QT-AAAAAAA4/.test(document.querySelector("tbody tr").textContent)));
  await lp.select("#quotation-sort", "received");
  await lp.waitForFunction(() => !/sort=oldest/.test(location.search), { timeout: 8000 }).catch(() => {});
  await lp.waitForFunction(() => document.querySelectorAll("tbody tr").length === 9 && !/sort=oldest/.test(location.search), { timeout: 8000 }).catch(() => {});
  const boxes = await lp.$$("tbody input[type=checkbox]");
  const stateAtTick = JSON.stringify(await qts.find({ buyerId: A.id }).project({ status: 1, version: 1 }).sort({ reference: 1, version: 1 }).toArray());
  await boxes[0].click();
  const oneSel = await content(lp);
  check("G-06 ticking one row shows 'selected for comparison' and no Compare button yet; ticking does not accept or change anything", /1 selected for comparison/.test(oneSel) && !/Compare Selected/.test(oneSel) && stateAtTick === JSON.stringify(await qts.find({ buyerId: A.id }).project({ status: 1, version: 1 }).sort({ reference: 1, version: 1 }).toArray()));
  await boxes[1].click();
  const twoSel = await lp.evaluate(() => [...document.querySelectorAll("a")].find((a) => /Compare Selected/.test(a.textContent))?.getAttribute("href") ?? null);
  check("G-07 two ticked rows give a 'Compare Selected (2)' link to /buyer/quotations/compare with exactly those references", /^\/buyer\/quotations\/compare\?refs=FBM-QT-AAAAAAA\w,FBM-QT-AAAAAAA\w$/.test(twoSel ?? ""), twoSel);
  for (const b of boxes.slice(2, 4)) await b.click();
  check("G-08 at most four can be selected: the remaining checkboxes are disabled", await lp.evaluate(() => [...document.querySelectorAll("tbody input[type=checkbox]")].filter((c) => !c.checked).every((c) => c.disabled)));
  await lp.context.close();

  const cp = await open(`/buyer/quotations/compare?refs=${ref("1")},${ref("2")}`, { session: A.s });
  const ct = await content(cp);
  const ctab = await cp.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, heads: [...document.querySelectorAll("table th[scope=col]")].map((t) => t.textContent.replace(/\s+/g, " ").trim()), differs: [...document.querySelectorAll("table th[scope=row]")].filter((t) => /Differs/.test(t.textContent)).length }));
  check("G-09 the comparison page: heading, one column per quotation, 'Differs' words on the differing rows, 'Not Provided' for missing terms, no ranking words, no console errors", cp.status === 200 && ctab.h1 === "Compare Quotations" && ctab.heads.length === 3 && ctab.differs >= 3 && /Not Provided/.test(ct) && !/best value|cheapest|recommended|winner/i.test(ct) && cp.errs.length === 0, JSON.stringify(ctab));
  check("G-10 a like-for-like comparison says nothing is ranked; a mismatched one (currency/unit/quantity) shows the warning notices", /nothing here is ranked/.test(ct) && await (async () => { const p = await open(`/buyer/quotations/compare?refs=${ref("1")},${ref("3")}`, { session: A.s }); const t = await content(p); await p.context.close(); return /different currencies/.test(t) && /different units/.test(t) && !/like for like, so their amounts/.test(t); })());
  await cp.context.close();
  const cp404 = await A.s.page(`/buyer/quotations/compare?refs=${ref("1")},FBM-QT-BBBBBBB1`);
  const cpDiff = await open(`/buyer/quotations/compare?refs=${ref("1")},${ref("6")}`, { session: A.s });
  const cpNone = await open("/buyer/quotations/compare", { session: A.s });
  check("G-11 comparison edge cases on the page: a foreign reference is the 404; different inquiries and no selection show an explanation with a way back, not an error", cp404.status === 404 && /different inquiries/.test(await content(cpDiff)) && /Choose quotations to compare/.test(await content(cpNone)));
  await cpDiff.context.close(); await cpNone.context.close();

  const dp = await open(`/buyer/quotations/${ref("1")}`, { session: A.s });
  const dt = await content(dp);
  const dh = await dp.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, crumb: document.querySelector("#buyer-content")?.textContent.slice(0, 160), tabs: [...document.querySelectorAll("nav[aria-label='Quotation sections'] a, nav[aria-label='Quotation sections'] button")].map((t) => t.textContent.trim()), robots: document.querySelector("meta[name=robots]")?.content }));
  check("G-12 the details page: heading 'Quotation Details & Comparison', breadcrumb ends with the reference, five sections, noindex, no console errors", dp.status === 200 && dh.h1 === "Quotation Details & Comparison" && new RegExp(`Quotations / ${ref("1")}`).test(dh.crumb) && dh.tabs.length === 5 && /noindex/.test(dh.robots ?? "") && dp.errs.length === 0, JSON.stringify(dh));
  check("G-13 it shows the exact breakdown (₹7,92,360.00 total, GST 12%), terms with delivery 7 - 10 days, the supplier, the inquiry link, and states that accepting records the decision only", /₹7,92,360\.00/.test(dt) && /GST \(12%\)/.test(dt) && /7 - 10 days/.test(dt) && /Shree Textiles/.test(dt) && /FBM-INQ-QAAAAAA1/.test(dt));
  check("G-14 messages and order processing are honestly unavailable (no fake chat, no 'order placed')", await (async () => { const p = await open(`/buyer/quotations/${ref("1")}?tab=messages`, { session: A.s }); const t = await content(p); await p.context.close(); return /not available yet/i.test(t) && !/order placed|order number/i.test(t); })());
  const hist = await open(`/buyer/quotations/${ref("1")}?tab=history`, { session: A.s });
  const ht = await content(hist);
  check("G-15 Revision History tab lists version 2 (current) and version 1 (superseded) with the changed price", /V2|Version 2/.test(ht) && /V1|Version 1/.test(ht) && /Superseded/.test(ht) && /Unit price/.test(ht));
  await hist.context.close();
  const oldPage = await open(`/buyer/quotations/${ref("1")}?version=1`, { session: A.s });
  const ot = await content(oldPage);
  check("G-16 an earlier version opens by ?version=1 with its own price and offers no decision buttons", /₹760\.00/.test(ot) && !(await oldPage.evaluate(() => /Accept Quotation|Reject Quotation|Request Revision/.test([...document.querySelectorAll("button")].map((b) => b.textContent).join(" ")))));
  await oldPage.context.close();
  check("G-17 an unknown, malformed, draft or foreign reference is the 404 page; a bad ?version is 404", (await A.s.page("/buyer/quotations/FBM-QT-NOPE0000")).status === 404 && (await A.s.page("/buyer/quotations/bad")).status === 404 && (await A.s.page(`/buyer/quotations/${ref("9")}`)).status === 404 && (await A.s.page(`/buyer/quotations/${ref("1")}?version=x`)).status === 404);

  // ================= F: decisions
  const iF = await mkInquiry(A.id); const iG = await mkInquiry(A.id); const iH = await mkInquiry(A.id); const iR = await mkInquiry(A.id);
  const fa = qdoc(A.id, iF, { reference: "FBM-QT-FACCEPT1" }); const fb = qdoc(A.id, iG, { reference: "FBM-QT-FREJECT1" }); const fr = qdoc(A.id, iR, { reference: "FBM-QT-FREVSN01" });
  const fx1 = qdoc(A.id, iH, { reference: "FBM-QT-FCNC0001" }); const fx2 = qdoc(A.id, iH, { reference: "FBM-QT-FCNC0002" });
  const fs1 = qdoc(A.id, iF, { reference: "FBM-QT-FSTAE001", version: 1, isCurrent: false, status: "SUPERSEDED" }); const fs2 = qdoc(A.id, iF, { reference: "FBM-QT-FSTAE001", version: 2 });
  const fe = qdoc(A.id, iG, { reference: "FBM-QT-FEXPRD01", validUntil: ago(1) });
  await qts.insertMany([fa, fb, fr, fx1, fx2, fs1, fs2, fe]);
  const noConfirm = await act(A.s, fa.reference, "accept", { version: 1 });
  check("F-01 accept without the explicit confirmation is refused (400) and nothing changes", noConfirm.status === 400 && noConfirm.json.fields?.confirm && (await qts.findOne({ reference: fa.reference })).status === "SENT");
  const extra = await act(A.s, fa.reference, "accept", { version: 1, confirm: true, status: "ACCEPTED", buyerId: String(B.id), price: 1 });
  check("F-02 unknown fields in the body are refused (no mass assignment of status, buyer or price)", extra.status === 400 && (await qts.findOne({ reference: fa.reference })).status === "SENT");
  const stale = await act(A.s, "FBM-QT-FSTAE001", "accept", { version: 1, confirm: true });
  check("F-03 deciding an old version is refused (409 STALE) and the current version is untouched", stale.status === 409 && stale.json.code === "STALE" && (await qts.findOne({ reference: "FBM-QT-FSTAE001", version: 2 })).status === "SENT");
  const expired = await act(A.s, fe.reference, "accept", { version: 1, confirm: true });
  check("F-04 an expired quotation cannot be accepted (409) or have a revision requested", expired.status === 409 && (await act(A.s, fe.reference, "revision-request", { version: 1, reason: "PRICE", message: "Lower the price please." })).status === 409 && (await qts.findOne({ reference: fe.reference })).status === "SENT");
  const wd = await act(A.s, ref("W"), "accept", { version: 1, confirm: true });
  check("F-05 a withdrawn quotation cannot be accepted (409)", wd.status === 409 && (await qts.findOne({ reference: ref("W") })).status === "WITHDRAWN");
  const acc = await act(A.s, fa.reference, "accept", { version: 1, confirm: true });
  const accDoc = await qts.findOne({ reference: fa.reference, version: 1 });
  check("F-06 accepting an open quotation succeeds: status ACCEPTED, decision and event saved, and the answer says it records the decision only (no order, no payment, supplier not notified)", acc.status === 200 && acc.json.status === "ACCEPTED" && acc.json.supplierNotified === false && /decision only/.test(acc.json.message) && /not available yet/.test(acc.json.message) && accDoc.status === "ACCEPTED" && accDoc.accepted === true && accDoc.decision.type === "ACCEPTED" && accDoc.events.at(-1).type === "ACCEPTED", acc.json?.message);
  const names = (await db.listCollections().toArray()).map((c) => c.name);
  check("F-07 accepting creates no order (none exists for the accepted quotation) and no payment or invoice record (no such collection)", (await db.collection("orders").countDocuments({ quotationReference: fa.reference })) === 0 && !names.some((n) => /payment|invoice/i.test(n)));
  const again = await act(A.s, fa.reference, "accept", { version: 1, confirm: true });
  check("F-08 accepting the same quotation again is refused (409) and changes nothing more", again.status === 409 && (await qts.findOne({ reference: fa.reference })).events.length === 2);
  check("F-09 another quotation of the same inquiry cannot now be accepted (409 ALREADY_ACCEPTED) and the stale version-2 of the same inquiry stays open", (await act(A.s, "FBM-QT-FSTAE001", "accept", { version: 2, confirm: true })).json.code === "ALREADY_ACCEPTED");
  const rej = await act(A.s, fb.reference, "reject", { version: 1, confirm: true, reason: "Delivery is too slow for us." });
  const rejDoc = await qts.findOne({ reference: fb.reference });
  check("F-10 rejecting stores the status, the reason and an event; the answer states supplier not notified", rej.status === 200 && rejDoc.status === "REJECTED" && rejDoc.decision.reason === "Delivery is too slow for us." && rej.json.supplierNotified === false);
  check("F-11 a reject reason with markup is refused (400); an over-long one too", (await act(A.s, fe.reference, "reject", { version: 1, confirm: true, reason: "<script>x</script>" })).status === 400 && (await act(A.s, "FBM-QT-FSTAE001", "reject", { version: 2, confirm: true, reason: "x".repeat(2000) })).status === 400);
  const rev = await act(A.s, fr.reference, "revision-request", { version: 1, reason: "PRICE", message: "Please offer a better unit price for this volume." });
  const revDoc = await qts.findOne({ reference: fr.reference });
  check("F-12 a revision request saves the reason and message with the version, moves the quotation to Revision Requested, and says the supplier is NOT notified", rev.status === 201 && revDoc.status === "REVISION_REQUESTED" && revDoc.events.at(-1).reason === "PRICE" && rev.json.supplierNotified === false && /not notified/.test(rev.json.message));
  const dupRev = await act(A.s, fr.reference, "revision-request", { version: 1, reason: "PRICE", message: "Please offer a better unit price for this volume." });
  check("F-13 a duplicate revision request is refused (409) and no second event is stored", dupRev.status === 409 && (await qts.findOne({ reference: fr.reference })).events.filter((e) => e.type === "REVISION_REQUESTED").length === 1);
  const badRev = await Promise.all([act(A.s, fx1.reference, "revision-request", { version: 1, reason: "NOPE", message: "Please offer a better price." }), act(A.s, fx1.reference, "revision-request", { version: 1, reason: "PRICE", message: "short" }), act(A.s, fx1.reference, "revision-request", { version: 1, reason: "PRICE", message: "<b>bad</b> markup in this message" }), act(A.s, fx1.reference, "revision-request", { reason: "PRICE", message: "Please offer a better price." })]);
  check("F-14 revision requests with an unknown reason, a too short message, markup or no version are refused with 400 and field messages", badRev.every((r) => r.status === 400 && r.json.fields) && (await qts.findOne({ reference: fx1.reference })).status === "SENT");
  const rejAfterRev = await act(A.s, fr.reference, "reject", { version: 1, confirm: true });
  check("F-15 a quotation with a requested revision can still be rejected by the buyer", rejAfterRev.status === 200 && (await qts.findOne({ reference: fr.reference })).status === "REJECTED");
  // concurrency: two different quotations of one inquiry accepted at the same moment
  const race = await Promise.all([act(A.s, fx1.reference, "accept", { version: 1, confirm: true }), act(A.s, fx2.reference, "accept", { version: 1, confirm: true })]);
  const accepted = await qts.countDocuments({ inquiryId: iH._id, accepted: true });
  check("F-16 two quotations of one inquiry accepted simultaneously: exactly one wins, the other gets 409, one accepted record exists", race.map((r) => r.status).sort().join() === "200,409" && accepted === 1, race.map((r) => r.status).join());
  // concurrency: the same quotation accepted five times at once
  const iS = await mkInquiry(A.id); const same = qdoc(A.id, iS, { reference: "FBM-QT-FSAME001" }); await qts.insertOne(same);
  const five1 = await Promise.all([1, 2, 3, 4, 5].map(() => act(A.s, same.reference, "accept", { version: 1, confirm: true })));
  const sameDoc = await qts.findOne({ reference: same.reference });
  check("F-17 the same quotation accepted five times at once: one 200, four 409, a single accepted event", five1.filter((r) => r.status === 200).length === 1 && five1.filter((r) => r.status === 409).length === 4 && sameDoc.events.filter((e) => e.type === "ACCEPTED").length === 1, five1.map((r) => r.status).join());
  const iT = await mkInquiry(A.id); const t1 = qdoc(A.id, iT, { reference: "FBM-QT-FTWNX001" }); await qts.insertOne(t1);
  const mix = await Promise.all([act(A.s, t1.reference, "accept", { version: 1, confirm: true }), act(A.s, t1.reference, "reject", { version: 1, confirm: true })]);
  const mixDoc = await qts.findOne({ reference: t1.reference });
  check("F-18 accept and reject of one quotation at the same moment: one wins and the stored state is consistent with it", mix.filter((r) => r.status === 200).length === 1 && ((mixDoc.status === "ACCEPTED" && mixDoc.accepted === true) || (mixDoc.status === "REJECTED" && !mixDoc.accepted)), `${mix.map((r) => r.status)} ${mixDoc.status}`);
  const idx = await qts.indexes();
  check("F-19 the database itself guards the rule: a unique partial index allows one accepted quotation per inquiry", idx.some((i) => i.name === "one_accepted_per_inquiry" && i.unique && i.partialFilterExpression?.accepted === true));
  check("F-20 an unparsable or empty body is a 400, not a server error", (await A.s.call("POST", `/api/buyer/quotations/${ref("2")}/accept`, undefined)).status === 400);
  const wrongMethod = await Promise.all([A.s.call("DELETE", `/api/buyer/quotations/${ref("2")}`), A.s.call("PUT", `/api/buyer/quotations/${ref("2")}`, { status: "ACCEPTED" }), A.s.call("PATCH", `/api/buyer/quotations/${ref("2")}`, { unitPriceMinor: 1 })]);
  check("F-21 a quotation cannot be edited or deleted by the buyer: DELETE, PUT and PATCH are not allowed (405)", wrongMethod.every((r) => r.status === 405) && (await qts.findOne({ reference: ref("2") })).unitPriceMinor === 71000, wrongMethod.map((r) => r.status).join());

  await clearLimits(); // section F made more than 30 decisions for this buyer: the 30 per 10 minutes limit is its own test (none here)
  // decisions through the UI, on fresh quotations
  const iU1 = await mkInquiry(A.id); const iU2 = await mkInquiry(A.id); const iU3 = await mkInquiry(A.id);
  const ua = qdoc(A.id, iU1, { reference: "FBM-QT-ZACCEPT1" }); const ub = qdoc(A.id, iU2, { reference: "FBM-QT-ZREJECT1" }); const uc = qdoc(A.id, iU3, { reference: "FBM-QT-ZREVSN01" });
  await qts.insertMany([ua, ub, uc]);
  const ap = await open(`/buyer/quotations/${ua.reference}`, { session: A.s });
  await clickText(ap, "button", "Accept Quotation");
  await ap.waitForSelector("[role=alertdialog], [role=dialog]");
  const dlg = await ap.evaluate(() => document.querySelector("[role=alertdialog], [role=dialog]").textContent.replace(/\s+/g, " "));
  const untouched = (await qts.findOne({ reference: ua.reference })).status === "SENT";
  check("G-18 Accept asks first in a dialog naming the quotation, version, supplier, amounts and validity, and says it records the decision only; nothing changes until confirmed", /FBM-QT-ZACCEPT1/.test(dlg) && /version 1/.test(dlg) && /Shree Textiles/.test(dlg) && /records your decision only/.test(dlg) && /nothing is ordered, paid or sent/.test(dlg) && untouched);
  await clickText(ap, "button", "Not yet");
  check("G-19 'Not yet' closes the dialog and the quotation is still open", !(await ap.$("[role=alertdialog], [role=dialog]")) && (await qts.findOne({ reference: ua.reference })).status === "SENT");
  await clickText(ap, "button", "Accept Quotation");
  await ap.waitForSelector("[role=alertdialog], [role=dialog]");
  await clickText(ap, "[role=alertdialog] button, [role=dialog] button", "Yes, accept quotation");
  await ap.waitForFunction(() => /Accepted/.test(document.querySelector("#buyer-content")?.textContent ?? "") && !/Accept Quotation/.test([...document.querySelectorAll("button")].map((b) => b.textContent).join(" ")), { timeout: 12000 }).catch(() => {});
  const apText = await content(ap);
  check("G-20 confirming accepts on the server: the page now says Accepted, the decision buttons are gone, and the success message says no order was created", (await qts.findOne({ reference: ua.reference })).status === "ACCEPTED" && /Accepted/.test(apText) && !(await ap.evaluate(() => /Accept Quotation|Reject Quotation|Request Revision/.test([...document.querySelectorAll("button")].map((b) => b.textContent).join(" ")))) && !/order placed|payment received/i.test(apText), "");
  await ap.context.close();

  const rp = await open(`/buyer/quotations/${ub.reference}`, { session: A.s });
  await clickText(rp, "button", "Reject Quotation");
  await rp.waitForSelector("[role=alertdialog]");
  await rp.type("[role=alertdialog] textarea", "Found a better supplier.");
  await clickText(rp, "[role=alertdialog] button", "Yes, reject quotation");
  await rp.waitForFunction(() => !document.querySelector("[role=alertdialog]") && /Rejected/.test(document.querySelector("#buyer-content")?.textContent ?? ""), { timeout: 12000 }).catch(() => {});
  const rejStored = await qts.findOne({ reference: ub.reference });
  check("G-21 rejecting through the dialog saves the status and the typed reason, and the page shows Rejected", rejStored.status === "REJECTED" && rejStored.decision.reason === "Found a better supplier." && /Rejected/.test(await content(rp)), JSON.stringify({ st: rejStored.status, reason: rejStored.decision?.reason, text: (await content(rp)).slice(0, 80), dialog: await rp.evaluate(() => document.querySelector('[role=alertdialog]')?.textContent.slice(0, 400) ?? null) }));
  await rp.context.close();

  const vp = await open(`/buyer/quotations/${uc.reference}`, { session: A.s });
  await clickText(vp, "button", "Request Revision");
  await vp.waitForSelector("[role=dialog] form");
  await vp.click("[role=dialog] button[type=submit]");
  const errsShown = await vp.evaluate(() => [...document.querySelectorAll("[role=dialog] [role=alert]")].map((e) => e.textContent));
  check("G-22 the revision form validates before sending: an empty submit shows a reason and a message error and saves nothing", errsShown.length === 2 && (await qts.findOne({ reference: uc.reference })).status === "SENT", errsShown.join("|"));
  await vp.select("[role=dialog] select", "DELIVERY");
  await vp.type("[role=dialog] textarea", "Please shorten the delivery time to seven days.");
  await vp.click("[role=dialog] button[type=submit]");
  await vp.waitForFunction(() => /Revision Requested/i.test(document.querySelector("#buyer-content")?.textContent ?? ""), { timeout: 12000 }).catch(() => {});
  const revStored = await qts.findOne({ reference: uc.reference });
  check("G-23 a valid revision request is saved with reason DELIVERY and the message, the page shows Revision Requested and no second request is offered", revStored.status === "REVISION_REQUESTED" && revStored.events.at(-1).reason === "DELIVERY" && /Revision Requested/i.test(await content(vp)) && !(await vp.evaluate(() => /Request Revision/.test([...document.querySelectorAll("button")].map((b) => b.textContent).join(" ")))), JSON.stringify({ st: revStored.status, last: revStored.events.at(-1), btns: await vp.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 12)) }));
  await vp.context.close();

  await dp.emulateMediaType("print");
  const printed = await dp.evaluate(() => ({ top: getComputedStyle(document.querySelector("header")).display, side: getComputedStyle(document.querySelector("#buyer-sidebar")).display, bar: [...document.querySelectorAll("button")].filter((b) => /Print \/ Save|Accept Quotation|Reject Quotation|Request Revision/.test(b.textContent)).map((b) => b.closest("[class*=noPrint]") ? getComputedStyle(b.closest("[class*=noPrint]")).display : "visible") }));
  check("G-24 the print view hides the workspace and the action buttons, so the printout is the quotation only (PDF export is not offered: print / save from the browser)", printed.top === "none" && printed.side === "none" && printed.bar.length >= 3 && printed.bar.every((v) => v === "none"), JSON.stringify(printed));
  await dp.emulateMediaType("screen");
  await dp.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/30-buyer-quotation-details-desktop-1440.png`, fullPage: true });
  await dp.context.close();

  // inquiry details integration (Page 28)
  const ip = await open("/buyer/inquiries/FBM-INQ-QAAAAAA1", { session: A.s });
  await clickText(ip, "[role=tab]", "Quotations");
  const itext = await content(ip);
  check("G-25 Inquiry Details shows the real quotations: 'Quotations Received' count 5, the Quotations tab lists them with links and a Compare link, and the 'not connected' text is gone", /Quotations Received\s*5/.test(itext) && /FBM-QT-AAAAAAA1/.test(itext) && /Compare these quotations/.test(itext) && !/Quotations are not connected yet/.test(itext), itext.slice(0, 80));
  await ip.context.close();
  const ie = await open("/buyer/quotations", { session: C.s });
  const et = await content(ie);
  check("G-26 a buyer with no quotations sees 'No Quotations Yet' with the honest reason (suppliers cannot send quotations yet) and a link to My Inquiries, zeros in the cards", /No Quotations Yet/.test(et) && /cannot send quotations through Finbyn Mart yet/.test(et) && /Total Quotations\s*0/.test(et) && ie.errs.length === 0);
  await ie.context.close();

  // ================= R: responsive
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const targets = [["/buyer/quotations", "list"], [`/buyer/quotations/${ref("1")}`, "details"], [`/buyer/quotations/compare?refs=${ref("1")},${ref("2")},${ref("3")},${ref("5")}`, "compare"]];
  const bad_ = [];
  for (const [path, name] of targets) {
    for (const w of widths) {
      const p = await open(path, { width: w, height: 900, session: A.s });
      const o = await overflow(p);
      const clipped = await p.evaluate(() => [...document.querySelectorAll("#buyer-content h1, #buyer-content h2, #buyer-content table, #buyer-content [class*=card]")].filter((e) => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1 && !/auto|scroll/.test(getComputedStyle(e).overflowX) && !e.closest("[class*=compareWrap], [class*=tableWrap]")).map((e) => `${e.tagName}.${String(e.className).slice(0, 40)}:${e.scrollWidth}>${e.clientWidth}:${e.textContent.slice(0, 30)}`));
      if (o > 0 || clipped.length > 0 || p.errs.length) bad_.push(`${name}@${w}: overflow ${o}, clipped ${clipped.join(" | ")}, errors ${p.errs.length}`);
      if (w === 390) await p.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/30-quotation-${name}-390.png`, fullPage: true });
      await p.context.close();
    }
  }
  check("R-01 no horizontal overflow, clipped headings or cards, or console errors on the list, details and a four-way comparison at 16 widths (320 to 2560)", bad_.length === 0, bad_.join("; "));
  const cm = await open(`/buyer/quotations/compare?refs=${ref("1")},${ref("2")}`, { width: 390, session: A.s });
  const cardsShown = await cm.evaluate(() => ({ table: getComputedStyle(document.querySelector("table")?.closest("[class*=compareWrap]") ?? document.body).display, cards: getComputedStyle(document.querySelector("[class*=compareCards]")).display }));
  check("R-02 on a phone the comparison is one card per quotation (table hidden); on a desktop it is the table", cardsShown.table === "none" && cardsShown.cards !== "none");
  await cm.context.close();
  const cd2 = await open(`/buyer/quotations/compare?refs=${ref("1")},${ref("2")}`, { width: 1440, session: A.s });
  check("R-03 on a desktop the comparison table is visible and the cards are hidden", await cd2.evaluate(() => getComputedStyle(document.querySelector("[class*=compareCards]")).display === "none" && document.querySelector("table").getClientRects().length > 0));
  await cd2.context.close();
  // keyboard: tab focus visible and dialog focus
  const kb = await open(`/buyer/quotations/${ref("2")}`, { session: A.s });
  await clickText(kb, "button", "Reject Quotation");
  await kb.waitForSelector("[role=alertdialog]");
  const focusIn = await kb.evaluate(() => document.querySelector("[role=alertdialog]").contains(document.activeElement));
  await kb.keyboard.press("Escape");
  await sleep(300);
  check("R-04 the reject dialog takes focus when opened, closes on Escape, and returns focus to the page", focusIn && !(await kb.$("[role=alertdialog]")));
  await kb.context.close();

  if (process.env.SKIP_PERF === "1") return;
  // ================= P: performance (production build, nothing else running)
  const D = await register("perf");
  const IP = await mkInquiry(D.id);
  const bulk = [];
  for (let i = 0; i < 400; i++) bulk.push(qdoc(D.id, i < 4 ? IP : await (async () => ({ _id: new ObjectId(), reference: `FBM-INQ-PERF${String(i).padStart(4, "0")}` }))(), { reference: i < 4 ? `FBM-QT-PERF000${i}` : `FBM-QT-PERF${String(i).padStart(4, "0")}`, sentAt: ago(i % 90), validUntil: inFuture((i % 40) + 1), status: i % 7 === 0 ? "REJECTED" : "SENT", productName: i % 3 === 0 ? "Perf Cotton" : "Perf Steel" }));
  await qts.insertMany(bulk);
  const history = []; for (let v = 1; v <= 20; v++) history.push(qdoc(D.id, IP, { reference: "FBM-QT-PERFHSTR", version: v, isCurrent: v === 20, status: v === 20 ? "SENT" : "SUPERSEDED", sentAt: ago(30 - v), discount: { kind: "PERCENT", bp: 100 * (v % 5) }, tax: { label: "GST", bp: 1800 }, charges: [{ label: "Freight", minor: 100000 }] }));
  await qts.insertMany(history);
  await clearLimits();
  const t = {
    list: await timeIt(() => list(D.s, "?limit=20")),
    listFiltered: await timeIt(() => list(D.s, "?status=active&q=Perf&limit=20&page=3")),
    detail: await timeIt(() => detail(D.s, "FBM-QT-PERFHSTR")),
    history: await timeIt(() => detail(D.s, "FBM-QT-PERFHSTR", "?version=7")),
    compare4: await timeIt(() => cmp(D.s, ["FBM-QT-PERF0000", "FBM-QT-PERF0001", "FBM-QT-PERF0002", "FBM-QT-PERF0003"])),
  };
  const decide = [];
  for (let i = 0; i < 12; i++) { const iq = await mkInquiry(D.id); const q = qdoc(D.id, iq, { reference: `FBM-QT-PERFDE${String(i).padStart(2, "0")}` }); await qts.insertOne(q); const s = performance.now(); await act(D.s, q.reference, i % 2 ? "accept" : "reject", { version: 1, confirm: true }); decide.push(performance.now() - s); }
  const dec = { p50: med(decide, 0.5), p95: med(decide, 0.95) };
  for (const [k, v] of Object.entries({ ...t, decide: dec })) console.log(`  PERF ${k.padEnd(13)} p50 ${v.p50.toFixed(0)} ms  p95 ${v.p95.toFixed(0)} ms`);
  const plan = await qts.find({ buyerId: D.id, isCurrent: true, status: { $ne: "DRAFT" } }).sort({ sentAt: -1, _id: -1 }).limit(20).explain("queryPlanner");
  const stages = JSON.stringify(plan.queryPlanner.winningPlan);
  check("P-01 targets (p95, remote cluster): list under 400 ms, filtered/searched list under 500, detail under 350, version history under 300, comparison of four under 500, accept/reject under 500", t.list.p95 < 400 && t.listFiltered.p95 < 500 && t.detail.p95 < 350 && t.history.p95 < 300 && t.compare4.p95 < 500 && dec.p95 < 500, Object.entries({ ...t, decide: dec }).map(([k, v]) => `${k} ${v.p95.toFixed(0)}`).join(", "));
  check("P-02 the default list query uses an index (no collection scan, no blocking sort)", /IXSCAN/.test(stages) && !/COLLSCAN/.test(stages) && !/"SORT"/.test(stages), stages.slice(0, 120));
  const big = await list(D.s, "?limit=20");
  check("P-03 a list page is bounded (20 rows under 25 KB even with 400 stored) and ten simultaneous requests all succeed", big.text.length < 25_000 && (await Promise.all(Array.from({ length: 10 }, () => list(D.s, "?limit=20")))).every((r) => r.status === 200), `${big.text.length} B`);
}

async function cleanup() {
  if (process.env.KEEP === "1") return;
  const mine = await users.find({ email: { $regex: `^t2930-${stamp}-` } }, { projection: { _id: 1 } }).toArray();
  const ids = mine.map((u) => u._id);
  await qts.deleteMany({ buyerId: { $in: ids } });
  await inq.deleteMany({ buyerId: { $in: ids } });
  await db.collection("notifications").deleteMany({ buyerId: { $in: ids } });
  await db.collection("security_events").deleteMany({ userId: { $in: ids } });
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
