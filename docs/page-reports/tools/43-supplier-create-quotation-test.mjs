import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

// Page 43 (Supplier Create Quotation: /supplier/quotations/create and the draft / preview / submit APIs).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/43-supplier-create-quotation-test.mjs
// Needs TWO running `next start` servers on the throwaway database MONGODB_DB=finbynmart_test from the same build:
//   BASE  (default :3100) with QUOTATION_TAX_RULES set to the TEST fixture below
//   BASE2 (default :3101) with QUOTATION_TAX_RULES NOT set (proves submission is BLOCKED when no tax treatment is configured)
// The tax rules here are a TEST FIXTURE only; no real rate exists in the product code. SKIP_PERF=1 skips the scale group.
const BASE = process.env.BASE || "http://localhost:3100";
const BASE2 = process.env.BASE2 || "http://localhost:3101";
const ROOT = "R:/indiamartref";
const TEST_DB = "finbynmart_test";
const SHOTS = `${ROOT}/docs/page-reports/screenshots`;
const require = createRequire(`${ROOT}/`);
const { MongoClient, ObjectId } = require("mongodb");
const load = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
const Q = await load("src/lib/quotations/quoteRules.ts");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === TEST_DB) throw new Error("Refusing: the configured live database is named like the test database.");
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const db = client.db(TEST_DB);
const users = db.collection("users"), inq = db.collection("inquiries"), qts = db.collection("quotations"), companies = db.collection("supplier_companies"), notes = db.collection("notifications"), outbox = db.collection("notification_outbox"), idem = db.collection("idempotency_keys"), events = db.collection("security_events");
const clearLimits = () => db.collection("rate_limits").deleteMany({});
await clearLimits();

const stamp = Date.now();
const emailOf = (t) => `t43-${stamp}-${t}@example.test`;
let ipN = 0;
const nextIp = () => `10.43.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "supplier create quotation passphrase";
const DAY = 86_400_000;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const rand8 = () => { const b = randomBytes(8); let s = ""; for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % 32]; return s; };
const ago = (d) => new Date(Date.now() - d * DAY);
const istDate = (plusDays) => Q.istDateText(Date.now() + plusDays * DAY);

class Session {
  jar = new Map();
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  async call(method, p, payload, headers = {}, base = BASE) {
    const r = await fetch(base + p, { method, headers: { "x-forwarded-for": nextIp(), ...(payload !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}), ...headers }, body: payload === undefined ? undefined : typeof payload === "string" ? payload : JSON.stringify(payload), redirect: "manual" });
    for (const line of r.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); this.jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    let json = null, text = null;
    try { text = await r.text(); json = JSON.parse(text); } catch {}
    return { status: r.status, json, text, headers: r.headers };
  }
  async page(p, base = BASE) {
    const r = await fetch(base + p, { headers: { "x-forwarded-for": nextIp(), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}) }, redirect: "manual" });
    return { status: r.status, text: await r.text(), location: r.headers.get("location") };
  }
}
const registerBuyer = async (tag, company) => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Quote ${tag} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: company, password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register buyer: ${r.status} ${r.text}`);
  return { s, id: (await users.findOne({ email: emailOf(tag) }))._id };
};
const registerSupplier = async (tag, keys) => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/supplier", { businessName: `Create ${tag.toUpperCase()} Traders`, contactName: `Sia ${tag}`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk for businesses.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register supplier: ${r.status} ${r.text}`);
  const user = await users.findOne({ email: emailOf(tag) });
  await s.call("GET", "/api/supplier/quotations/summary");
  await companies.updateOne({ ownerUserId: user._id }, { $set: { sellerKeys: keys } });
  return { s, id: user._id };
};
const SELLER_A = { supplierKey: "shree-textiles", supplierName: "Shree Textiles", supplierSlug: "shree-textiles", source: "sample" };
const SELLER_B = { supplierKey: "sunrise-hub", supplierName: "Sunrise Hub", supplierSlug: "sunrise-hub", source: "sample" };
const mkInq = (buyerId, seller, over = {}) => ({ ...(buyerId ? { buyerId, buyerType: "REGISTERED" } : { buyerType: "GUEST", guest: { name: "Guest", email: "guest@example.test", phone: "9", company: "G" } }), reference: `FBM-INQ-${rand8()}`, ...seller, productName: "Cotton poplin fabric", categoryName: "Textiles", quantity: 500, unit: "Meter", message: "Private buyer message.", inquiryType: "GET_BEST_QUOTE", deliveryLocation: { text: "Jaipur, Rajasthan 302001" }, status: "NEW", statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: ago(3) }], createdAt: ago(3), updatedAt: ago(3), ...over });

const fullInput = (over = {}) => ({
  currency: "INR", validUntil: istDate(15),
  lines: [{ id: "line-1", source: "INQUIRY", productKey: "", name: "Cotton poplin fabric", quantity: "500", unit: "Meter", unitPrice: "120.00", moq: "100", discountKind: "NONE", discountValue: "" }],
  taxRuleId: "TEST-NOT-APPLICABLE", freight: "1500.00", charges: [], leadTimeDays: "10", deliveryTerms: "EXW", paymentType: "ADVANCE", advancePercent: "30", netDays: "", notes: "Plain text note <b>not html</b>", ...over,
});
const TEST_RULES = [{ id: "TEST-NOT-APPLICABLE", version: "test-1", label: "Test fixture: not applicable", kind: "NOT_APPLICABLE", bp: null }, { id: "TEST-RATE-18", version: "test-1", label: "Test rate 18%", kind: "RATE", bp: 1800 }];

const create = (s, ref, input, base = BASE) => s.call("POST", "/api/supplier/quotations", { inquiryReference: ref, ...(input ? { input } : {}) }, {}, base);
const patch = (s, qref, rev, input, base = BASE) => s.call("PATCH", `/api/supplier/quotations/${qref}`, { expectedRevision: rev, input }, {}, base);
const preview = (s, qref, body, base = BASE) => s.call("POST", `/api/supplier/quotations/${qref}/preview`, body, {}, base);
const submit = (s, qref, body, base = BASE) => s.call("POST", `/api/supplier/quotations/${qref}/submit`, { confirm: true, ...body }, {}, base);
const key = () => randomBytes(16).toString("hex");
const med = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const timeIt = async (fn, n = 25) => { await clearLimits(); for (let i = 0; i < 2; i++) await fn(i); const t = []; for (let i = 0; i < n; i++) { const s0 = performance.now(); await fn(i + 2); t.push(performance.now() - s0); } return { p50: med(t, 0.5), p95: med(t, 0.95), p99: med(t, 0.99) }; };
const fmt = (t) => `p50 ${t.p50.toFixed(0)} ms, p95 ${t.p95.toFixed(0)} ms, p99 ${t.p99.toFixed(0)} ms`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
async function open(p, { width = 1440, height = 900, session } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/40\d|409|422|429|50\d|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  if (session) await page.setCookie(...[...session.jar].map(([name, value]) => ({ name, value, url: BASE })));
  await page.setViewport({ width, height });
  const resp = await page.goto(BASE + p, { waitUntil: "networkidle2" });
  page.errs = errs; page.status = resp.status(); page.context = context;
  return page;
}
const created = { users: [] };
const setVal = (p, sel, value) => p.evaluate((s, v) => { const el = document.querySelector(s); const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }, sel, value);
const clickBtn = (p, text) => p.evaluate((t) => { const b = [...document.querySelectorAll("button, a")].find((x) => x.textContent.trim().startsWith(t) && x.getClientRects().length && !x.disabled); if (!b) return false; b.click(); return true; }, text);

async function main() {
  const BA = await registerBuyer("ba", "Alpha Garments Pvt Ltd");
  const BB = await registerBuyer("bb", "Bravo Retail LLP");
  const SA = await registerSupplier("a", [SELLER_A.supplierKey]);
  const SB = await registerSupplier("b", [SELLER_B.supplierKey]);
  const SN = await registerSupplier("none", []);
  const SS = await registerSupplier("susp", [SELLER_A.supplierKey]);
  await companies.updateOne({ ownerUserId: SS.id }, { $set: { status: "SUSPENDED" } });
  created.users.push(BA.id, BB.id, SA.id, SB.id, SN.id, SS.id);

  const mk = async (doc) => { const r = await inq.insertOne(doc); return { ...doc, _id: r.insertedId }; };
  const I1 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S43AAAA1" }));
  const I2 = await mk(mkInq(BB.id, SELLER_A, { reference: "FBM-INQ-S43AAAA2", productName: "Silk Fabric", unit: "Piece", quantity: 100, status: "IN_PROGRESS" }));
  const I3 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S43AAAA3", status: "CLOSED" }));
  const I4 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S43AAAA4", status: "CANCELLED" }));
  const I5 = await mk(mkInq(null, SELLER_A, { reference: "FBM-INQ-S43AAAA5" }));
  const I6 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S43AAAA6", status: "new", productName: "Legacy Status Fabric" }));
  const IB = await mk(mkInq(BA.id, SELLER_B, { reference: "FBM-INQ-S43BBBB1", productName: "Sunrise Only Product" }));
  const extraInq = async (n, over = {}) => { const docs = []; for (let i = 0; i < n; i++) docs.push(mk(mkInq(BA.id, SELLER_A, { reference: `FBM-INQ-${rand8()}`.replace("FBM-INQ-", "FBM-INQ-S43"), ...over }))); return Promise.all(docs); };

  // ================= A: access
  const un = new Session();
  const routes = [["GET", "/api/supplier/inquiries"], ["GET", `/api/supplier/inquiries/${I1.reference}/quotation-context`], ["GET", "/api/supplier/quotation-products"], ["POST", "/api/supplier/quotations", { inquiryReference: I1.reference }], ["PATCH", "/api/supplier/quotations/FBM-QT-AAAAAAAA", { expectedRevision: 1, input: {} }], ["GET", "/api/supplier/quotations/FBM-QT-AAAAAAAA/draft"], ["POST", "/api/supplier/quotations/FBM-QT-AAAAAAAA/preview", {}], ["POST", "/api/supplier/quotations/FBM-QT-AAAAAAAA/submit", {}]];
  const unRes = await Promise.all(routes.map(([m, p, b]) => un.call(m, p, b)));
  check("A-01 no session: every new route answers 401 (picker, context, products, create, save, draft, preview, submit)", unRes.every((r) => r.status === 401), unRes.map((r) => r.status).join());
  const buyerRes = await Promise.all(routes.map(([m, p, b]) => BA.s.call(m, p, b)));
  check("A-02 a signed-in BUYER gets 403 JSON on every new route", buyerRes.every((r) => r.status === 403 && r.json?.ok === false), buyerRes.map((r) => r.status).join());
  const suspRes = await Promise.all(routes.slice(0, 4).map(([m, p, b]) => SS.s.call(m, p, b)));
  check("A-03 a supplier whose company is SUSPENDED (membership revoked) gets 403", suspRes.every((r) => r.status === 403), suspRes.map((r) => r.status).join());
  const pun = await un.page("/supplier/quotations/create");
  check("A-04 the page without a session redirects to sign-in and renders no inquiry data", [302, 307].includes(pun.status) && /sign-in/.test(pun.location ?? "") && !/FBM-INQ|Alpha Garments/.test(pun.text));
  const pb = await BA.s.page("/supplier/quotations/create");
  check("A-05 the page for a buyer redirects to /forbidden?portal=supplier with no data", [302, 307].includes(pb.status) && /forbidden/.test(pb.location ?? "") && !/FBM-INQ/.test(pb.text));
  check("A-06 a cross-site write is blocked (403) before anything is read", (await SA.s.call("POST", "/api/supplier/quotations", { inquiryReference: I1.reference }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status === 403);

  // ================= B: the picker
  const pick = await SA.s.call("GET", "/api/supplier/inquiries");
  const prefs = (pick.json?.items ?? []).map((i) => i.reference);
  check("B-01 the picker lists only quotable inquiries of the company's sellers: I1, I2, I6 (not closed, cancelled, guest, or another seller's)", pick.status === 200 && prefs.sort().join() === [I1.reference, I2.reference, I6.reference].sort().join(), prefs.join());
  check("B-02 each item carries the permitted buyer business name, product, quantity, status label; no email, phone, message or buyer id", pick.json.items.find((i) => i.reference === I1.reference).buyer === "Alpha Garments Pvt Ltd" && !/@example\.test|9876543210|Private buyer message|buyerId/.test(pick.text));
  check("B-03 search by reference and by product (server side)", (await SA.s.call("GET", `/api/supplier/inquiries?q=${I2.reference}`)).json.items.length === 1 && (await SA.s.call("GET", "/api/supplier/inquiries?q=silk")).json.items[0].reference === I2.reference && (await SA.s.call("GET", "/api/supplier/inquiries?q=Sunrise")).json.items.length === 0);
  check("B-04 pagination bounds: default 20, limit 50 ok, 51 refused (422), page 0 refused, a pattern character is plain text", pick.json.meta.limit === 20 && (await SA.s.call("GET", "/api/supplier/inquiries?limit=50")).status === 200 && (await SA.s.call("GET", "/api/supplier/inquiries?limit=51")).status === 422 && (await SA.s.call("GET", "/api/supplier/inquiries?page=0")).status === 422 && (await SA.s.call("GET", "/api/supplier/inquiries?q=.*")).json.items.length === 0);
  const pickB = await SB.s.call("GET", "/api/supplier/inquiries");
  check("B-05 supplier B sees only its own inquiry; a company with no linked seller is told so (noSellers) and gets nothing", pickB.json.items.length === 1 && pickB.json.items[0].reference === IB.reference && (await SN.s.call("GET", "/api/supplier/inquiries")).json.data.noSellers === true);
  const ctxRes = await SA.s.call("GET", `/api/supplier/inquiries/${I1.reference}/quotation-context`);
  const ctx = ctxRes.json?.data;
  check("B-06 the context shows the buyer's requirement as recorded, whether it can be quoted, defaults from the inquiry, the configured options and what is not available", ctx?.inquiry.productName === "Cotton poplin fabric" && ctx.inquiry.quantity === 500 && ctx.inquiry.unit === "Meter" && ctx.inquiry.deliveryLocation === "Jaipur, Rajasthan 302001" && ctx.eligible === true && ctx.defaults.lines[0].quantity === "500" && ctx.defaults.lines[0].unit === "Meter" && ctx.options.taxRules.length === 2 && ctx.capabilities.attachments.available === false && ctx.capabilities.pdf.available === false && ctx.capabilities.multiLine.available === false, JSON.stringify(ctx?.capabilities));
  check("B-07 the buyer's private message, email and phone are not in the context; buyer is the business name", !/Private buyer message|@example\.test|9876543210/.test(ctxRes.text) && ctx.inquiry.buyer === "Alpha Garments Pvt Ltd");
  const f1 = await SA.s.call("GET", `/api/supplier/inquiries/${IB.reference}/quotation-context`);
  const f2 = await SA.s.call("GET", "/api/supplier/inquiries/FBM-INQ-ZZZZZZZZ/quotation-context");
  const f3 = await SA.s.call("GET", "/api/supplier/inquiries/not-a-reference/quotation-context");
  check("B-08 another seller's inquiry, an unknown one and a malformed one give the SAME 404", f1.status === 404 && f2.status === 404 && f3.status === 404 && f1.text === f2.text && f2.text === f3.text);
  const cClosed = (await SA.s.call("GET", `/api/supplier/inquiries/${I3.reference}/quotation-context`)).json.data;
  const cGuest = (await SA.s.call("GET", `/api/supplier/inquiries/${I5.reference}/quotation-context`)).json.data;
  check("B-09 a closed inquiry and a guest inquiry are shown as NOT quotable, with the reason in words", cClosed.eligible === false && /closed/.test(cClosed.ineligibleReason) && cGuest.eligible === false && /guest/.test(cGuest.ineligibleReason));
  const prodList = await SA.s.call("GET", "/api/supplier/quotation-products");
  check("B-10 the product search lists only the company's OWN products, 20 per page, searchable, bounded (limit 51 refused)", prodList.status === 200 && prodList.json.items.length > 0 && prodList.json.items.length <= 20 && prodList.json.meta.limit === 20 && (await SA.s.call("GET", "/api/supplier/quotation-products?limit=51")).status === 422 && (await SB.s.call("GET", "/api/supplier/quotation-products")).json.items.every((p) => !prodList.json.items.some((a) => a.key === p.key && a.source === p.source)), `${prodList.json?.meta?.total} products`);

  // ================= C: create a draft
  const c1 = await create(SA.s, I1.reference, { lines: [{ unitPrice: "120.00" }], currency: "INR" });
  const D1 = c1.json?.data;
  check("C-01 an incomplete draft is saved (201): server-generated reference, revision 1, status DRAFT, defaults from the inquiry, tax 'pending'", c1.status === 201 && /^FBM-QT-[0-9A-HJKMNP-TV-Z]{8}$/.test(D1?.reference) && D1.revision === 1 && D1.status === "DRAFT" && D1.input.lines[0].quantity === "500" && D1.calculation.total === null, c1.text?.slice(0, 200));
  const dbDoc = await qts.findOne({ reference: D1.reference });
  check("C-02 ownership comes from the records: seller and buyer are the INQUIRY's, the company is the session's, createdBy is the signed-in user; status DRAFT; version 1 and current", dbDoc.supplierKey === "shree-textiles" && String(dbDoc.buyerId) === String(BA.id) && String(dbDoc.supplierCompanyId) === String((await companies.findOne({ ownerUserId: SA.id }))._id) && String(dbDoc.createdBy) === String(SA.id) && dbDoc.status === "DRAFT" && dbDoc.version === 1 && dbDoc.isCurrent === true && dbDoc.openKey === `${I1._id}:shree-textiles`);
  const forged = await create(SA.s, I2.reference, { lines: [{ unitPrice: "10.00" }] });
  const rawForged = await SA.s.call("POST", "/api/supplier/quotations", { inquiryReference: I6.reference, supplierKey: "sunrise-hub", supplierCompanyId: String(SB.id), buyerId: String(BB.id), status: "SENT", total: "1.00", grandTotal: "1.00", createdBy: String(SB.id), isCurrent: false, input: { total: "1.00", status: "SENT", supplierKey: "sunrise-hub", lines: [{ unitPrice: "10.00", total: "1.00" }] } });
  const forgedDoc = await qts.findOne({ reference: rawForged.json.data.reference });
  check("C-03 forged ownership, status, totals and createdBy in the body are ignored: the stored draft still belongs to the real seller, buyer, company and user", rawForged.status === 201 && forgedDoc.supplierKey === "shree-textiles" && String(forgedDoc.buyerId) === String(BA.id) && forgedDoc.status === "DRAFT" && String(forgedDoc.createdBy) === String(SA.id) && forgedDoc.isCurrent === true && !("total" in forgedDoc) && !("grandTotal" in forgedDoc) && !(forgedDoc.draft.input.total));
  const again = await create(SA.s, I1.reference);
  check("C-04 creating again for the same inquiry returns the SAME draft (200, created: false), never a second quotation", again.status === 200 && again.json.data.created === false && again.json.data.reference === D1.reference && (await qts.countDocuments({ inquiryId: I1._id })) === 1);
  check("C-05 supplier B cannot create for A's inquiry (404 identical to unknown); a malformed reference is 404", (await create(SB.s, I1.reference)).status === 404 && (await create(SB.s, "FBM-INQ-ZZZZZZZZ")).status === 404 && (await create(SA.s, "nonsense")).status === 404 && (await create(SA.s, undefined)).status === 404);
  const cl = await create(SA.s, I3.reference);
  const gu = await create(SA.s, I5.reference);
  const ca = await create(SA.s, I4.reference);
  check("C-06 a closed or cancelled inquiry is refused (409 INQUIRY_CLOSED), a guest inquiry too (409 NOT_ELIGIBLE); no draft is created", cl.status === 409 && cl.json.code === "INQUIRY_CLOSED" && ca.status === 409 && gu.status === 409 && gu.json.code === "NOT_ELIGIBLE" && (await qts.countDocuments({ inquiryId: { $in: [I3._id, I4._id, I5._id] } })) === 0);
  const bad = await create(SA.s, I2.reference.replace("AAAA2", "AAAA2"), { lines: [{ unitPrice: "12x", quantity: "5.5" }], freight: "-1", currency: "XYZ" });
  check("C-07 malformed values are refused with per-field messages (422) even for a draft; nothing is saved", bad.status === 409 || (bad.status === 422 && "lines.0.unitPrice" in bad.json.fields && "lines.0.quantity" in bad.json.fields && "freight" in bad.json.fields && "currency" in bad.json.fields), `${bad.status} ${JSON.stringify(bad.json?.fields ?? bad.json?.code)}`);
  const I7 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S43AAAA7" }));
  const bad2 = await create(SA.s, I7.reference, { lines: [{ unitPrice: "12x", quantity: "5.5" }], freight: "-1", currency: "XYZ" });
  check("C-07b ... confirmed on a fresh inquiry: 422 with the four field messages and no draft stored", bad2.status === 422 && ["lines.0.unitPrice", "lines.0.quantity", "freight", "currency"].every((k) => k in bad2.json.fields) && (await qts.countDocuments({ inquiryId: I7._id })) === 0);
  const big = await SA.s.call("POST", "/api/supplier/quotations", JSON.stringify({ inquiryReference: I7.reference, input: { notes: "x".repeat(30_000) } }), { "Content-Type": "application/json" });
  const nonJson = await SA.s.call("POST", "/api/supplier/quotations", "not json", { "Content-Type": "application/json" });
  check("C-08 a body over the size limit is 413; a body that is not a JSON object is 400", big.status === 413 && nonJson.status === 400);
  const prod = prodList.json.items[0];
  const withProduct = await create(SA.s, I7.reference, { lines: [{ source: "CATALOGUE", productKey: prod.key, name: prod.name, unit: "Meter", quantity: "10", unitPrice: "5.00" }] });
  check("C-09 a product that belongs to the company can be quoted (CATALOGUE source), and the product snapshot is stored", withProduct.status === 201 && withProduct.json.data.input.lines[0].productKey === prod.key && Boolean((await qts.findOne({ reference: withProduct.json.data.reference })).productKey === undefined));
  await qts.deleteOne({ reference: withProduct.json.data.reference });
  const foreignKey = SB.s ? (await SB.s.call("GET", "/api/supplier/quotation-products")).json.items[0]?.key : null;
  const foreignProd = await create(SA.s, I7.reference, { lines: [{ source: "CATALOGUE", productKey: foreignKey ?? "999999999", name: "x", unit: "Meter", quantity: "10", unitPrice: "5.00" }] });
  check("C-10 a product that is NOT the company's (another seller's, or unknown) is refused (422); a manual item with a product key too", foreignProd.status === 422 && "lines.0.productKey" in foreignProd.json.fields && (await create(SA.s, I7.reference, { lines: [{ source: "MANUAL", productKey: "123", name: "x" }] })).status === 422 && (await qts.countDocuments({ inquiryId: I7._id })) === 0);
  const buyerList = await BA.s.call("GET", "/api/buyer/quotations");
  check("C-11 a draft is invisible to the buyer: not in their list, and its reference is a 404 on the buyer detail route", buyerList.json.quotations.length === 0 && (await BA.s.call("GET", `/api/buyer/quotations/${D1.reference}`)).status === 404);
  const p42 = await SA.s.call("GET", "/api/supplier/quotations?status=drafts");
  check("C-12 Page 42 lists the draft as Draft, with no total yet and a Continue link; the Drafts card counts it", p42.json.quotations.some((q) => q.reference === D1.reference && q.status === "DRAFT" && q.total === null && q.editHref === `/supplier/quotations/create?reference=${D1.reference}`) && p42.json.data.summary.drafts >= 1);

  // ================= D: update with the revision guard
  const u1 = await patch(SA.s, D1.reference, 1, fullInput());
  check("D-01 saving the full form answers 200, revision 2, and the SERVER's calculation: subtotal 60000.00, freight 1500.00, total 61500.00", u1.status === 200 && u1.json.data.revision === 2 && u1.json.data.calculation.subtotal === "60000.00" && u1.json.data.calculation.freight === "1500.00" && u1.json.data.calculation.total === "61500.00", JSON.stringify(u1.json?.data?.calculation));
  const stale = await patch(SA.s, D1.reference, 1, fullInput({ notes: "STALE OVERWRITE" }));
  const afterStale = await qts.findOne({ reference: D1.reference });
  check("D-02 a save from a stale revision is a 409 STALE_REVISION with the current revision, and NOTHING is overwritten", stale.status === 409 && stale.json.code === "STALE_REVISION" && stale.json.data.currentRevision === 2 && afterStale.revision === 2 && !/STALE OVERWRITE/.test(JSON.stringify(afterStale.draft.input)));
  check("D-03 the revision is required: missing, negative, text and fractional are 422", [undefined, -1, "2", 1.5].every(async () => true) && (await SA.s.call("PATCH", `/api/supplier/quotations/${D1.reference}`, { input: fullInput() })).status === 422 && (await patch(SA.s, D1.reference, -1, fullInput())).status === 422 && (await patch(SA.s, D1.reference, "2", fullInput())).status === 422 && (await patch(SA.s, D1.reference, 1.5, fullInput())).status === 422);
  const race = await Promise.all([patch(SA.s, D1.reference, 2, fullInput({ notes: "writer one" })), patch(SA.s, D1.reference, 2, fullInput({ notes: "writer two" }))]);
  const racedDoc = await qts.findOne({ reference: D1.reference });
  check("D-04 two simultaneous saves from the same revision: exactly one wins (200), the other is 409, revision advances by exactly 1", race.filter((r) => r.status === 200).length === 1 && race.filter((r) => r.status === 409).length === 1 && racedDoc.revision === 3, race.map((r) => r.status).join());
  const forgedPatch = await SA.s.call("PATCH", `/api/supplier/quotations/${D1.reference}`, { expectedRevision: 3, status: "SENT", total: "1.00", supplierKey: "sunrise-hub", buyerId: String(BB.id), input: { ...fullInput(), total: "1.00", grandTotal: "1.00", status: "SENT" } });
  const fdoc = await qts.findOne({ reference: D1.reference });
  check("D-05 a save with a forged status, totals, seller or buyer: stored as a normal draft, forged fields ignored (status DRAFT, same seller and buyer), server total unchanged", forgedPatch.status === 200 && fdoc.status === "DRAFT" && fdoc.supplierKey === "shree-textiles" && String(fdoc.buyerId) === String(BA.id) && forgedPatch.json.data.calculation.total === "61500.00" && !("total" in fdoc));
  check("D-06 supplier B cannot read, save, preview or submit A's draft: all 404, identical to unknown", [await SB.s.call("GET", `/api/supplier/quotations/${D1.reference}/draft`), await patch(SB.s, D1.reference, 4, fullInput()), await preview(SB.s, D1.reference, {}), await submit(SB.s, D1.reference, { expectedRevision: 4, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() })].every((r) => r.status === 404) && (await SA.s.call("GET", "/api/supplier/quotations/FBM-QT-ZZZZZZZZ/draft")).status === 404);
  const invalidSave = await patch(SA.s, D1.reference, 4, fullInput({ lines: [{ ...fullInput().lines[0], unitPrice: "1e3", quantity: "0.5" }], freight: "1,500" }));
  check("D-07 invalid amounts on a save are 422 with field messages; the draft keeps its last good content and revision", invalidSave.status === 422 && "lines.0.unitPrice" in invalidSave.json.fields && (await qts.findOne({ reference: D1.reference })).revision === 4);
  const draftGet = await SA.s.call("GET", `/api/supplier/quotations/${D1.reference}/draft`);
  check("D-08 reopening returns the saved input exactly, the revision and the saved time (nothing came from browser storage)", draftGet.status === 200 && draftGet.json.data.revision === 4 && draftGet.json.data.input.paymentType === "ADVANCE" && draftGet.json.data.input.advancePercent === "30" && draftGet.json.data.input.notes === "Plain text note <b>not html</b>" && draftGet.json.data.savedLabel.length > 3);
  const lowUnit = await patch(SA.s, D1.reference, 4, fullInput({ lines: [{ ...fullInput().lines[0], unit: "Roll" }] }));
  check("D-09 an incomplete or inconsistent DRAFT still saves (drafts may be incomplete), and the unit rule is enforced at submission, not by guessing a conversion", lowUnit.status === 200 && lowUnit.json.data.revision === 5);
  await patch(SA.s, D1.reference, 5, fullInput());

  // ================= E: preview
  const rev6 = (await qts.findOne({ reference: D1.reference })).revision;
  const pv = await preview(SA.s, D1.reference, { expectedRevision: rev6 });
  check("E-01 preview of the saved draft: server totals, tax treatment, validity label ending 11:59 pm India time, no blocking issues, canSubmit", pv.status === 200 && pv.json.data.calculation.total === "61500.00" && pv.json.data.taxRule.id === "TEST-NOT-APPLICABLE" && pv.json.data.canSubmit === true && Object.keys(pv.json.data.blocking).length === 0 && /11:59 pm India time/.test(pv.json.data.validUntilLabel) && pv.json.data.stale === false, JSON.stringify(pv.json?.data?.blocking));
  const beforeBody = JSON.stringify((await qts.findOne({ reference: D1.reference })).draft.input);
  const pv2 = await preview(SA.s, D1.reference, { input: fullInput({ lines: [{ ...fullInput().lines[0], unitPrice: "200.00" }] }), expectedRevision: rev6 });
  const afterDoc = await qts.findOne({ reference: D1.reference });
  check("E-02 previewing an UNSAVED input calculates it (100000.00 + 1500.00 = 101500.00) but saves nothing, submits nothing, notifies nobody", pv2.json.data.calculation.total === "101500.00" && JSON.stringify(afterDoc.draft.input) === beforeBody && afterDoc.revision === rev6 && afterDoc.status === "DRAFT" && (await outbox.countDocuments({ quotationReference: D1.reference })) === 0 && (await notes.countDocuments({ type: "QUOTATION_RECEIVED", buyerId: BA.id })) === 0);
  const pvStale = await preview(SA.s, D1.reference, { expectedRevision: rev6 - 1 });
  check("E-03 a preview that names an older revision is flagged stale", pvStale.json.data.stale === true);
  const pvTax = await preview(SA.s, D1.reference, { input: fullInput({ taxRuleId: "TEST-RATE-18" }) });
  check("E-04 with the configured test rate the server applies it to the taxable amount only (10800.00 on 60000.00; total 72300.00)", pvTax.json.data.calculation.tax === "10800.00" && pvTax.json.data.calculation.total === "72300.00");
  const pvNo = await preview(SA.s, D1.reference, { input: fullInput({ taxRuleId: "" }) });
  check("E-05 with no tax treatment selected: NO final total, a provisional amount (61500.00) and a blocking message; cannot submit", pvNo.json.data.calculation.total === null && pvNo.json.data.calculation.provisional === "61500.00" && pvNo.json.data.canSubmit === false && "taxRuleId" in pvNo.json.data.blocking);
  const pvForged = await preview(SA.s, D1.reference, { input: fullInput({ taxRuleId: "GST-FORGED" }) });
  check("E-06 a forged / unknown tax treatment id is not accepted (blocking message, no total)", pvForged.json.data.canSubmit === false && "taxRuleId" in pvForged.json.data.blocking && pvForged.json.data.calculation.total === null);
  const pvBad = await preview(SA.s, D1.reference, { input: fullInput({ lines: [{ ...fullInput().lines[0], unit: "Roll", quantity: "50", moq: "100" }], validUntil: istDate(-1) }) });
  check("E-07 preview reports what blocks submission: wrong unit (no conversion), quantity below own MOQ, validity in the past", "lines.0.unit" in pvBad.json.data.blocking && "lines.0.quantity" in pvBad.json.data.blocking && "validUntil" in pvBad.json.data.blocking);
  // parity between the browser's calculation (the same module) and the server's
  const variants = [fullInput(), fullInput({ freight: "" }), fullInput({ lines: [{ ...fullInput().lines[0], discountKind: "PERCENT", discountValue: "2.5" }] }), fullInput({ lines: [{ ...fullInput().lines[0], quantity: "3", unitPrice: "33.33", discountKind: "AMOUNT", discountValue: "1.01" }], taxRuleId: "TEST-RATE-18" }), fullInput({ charges: [{ label: "Packing", amount: "200.00" }, { label: "Insurance", amount: "99.99" }], taxRuleId: "TEST-RATE-18" }), fullInput({ lines: [{ ...fullInput().lines[0], quantity: "1", unitPrice: "0.05" }], freight: "", taxRuleId: "TEST-RATE-18" })];
  let parity = true;
  for (const v of variants) {
    const server = (await preview(SA.s, D1.reference, { input: v })).json.data.calculation;
    const client = Q.computeQuote(Q.normaliseInput(v).value, TEST_RULES.find((r) => r.id === v.taxRuleId) ?? null);
    for (const k of ["subtotal", "discount", "taxable", "tax", "freight", "otherCharges", "provisional", "total"]) if (server[k] !== client[k]) { parity = false; console.log("      parity mismatch", k, server[k], client[k]); }
  }
  check("E-08 frontend / server parity: the browser's calculation (same module) and the server's agree on every amount for 6 inputs including discounts, rate, charges and the half-up boundary", parity);

  // ================= F: submit validations (server WITHOUT any tax configuration)
  const noRules = new Session(); noRules.jar = new Map(SA.s.jar);
  const ctxNo = (await noRules.call("GET", `/api/supplier/inquiries/${I1.reference}/quotation-context`, undefined, {}, BASE2)).json?.data;
  check("F-01 on a server with NO tax treatment configured the context says submission is unavailable and why; drafts still work", ctxNo?.options.taxRules.length === 0 && ctxNo.capabilities.submit.available === false && /QUOTATION_TAX_RULES/.test(ctxNo.capabilities.submit.reasons.join(" ")));
  const noRev = (await qts.findOne({ reference: D1.reference })).revision;
  const blocked = await submit(noRules, D1.reference, { expectedRevision: noRev, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() }, BASE2);
  check("F-02 submission is BLOCKED (422 TAX_UNRESOLVED) when the platform has no approved tax treatment; the draft stays a draft, nothing is sent", blocked.status === 422 && blocked.json.code === "TAX_UNRESOLVED" && /No tax treatment is configured/.test(blocked.json.fields.taxRuleId) && (await qts.findOne({ reference: D1.reference })).status === "DRAFT" && (await outbox.countDocuments({ quotationReference: D1.reference })) === 0);
  const s422 = await submit(SA.s, D1.reference, { expectedRevision: noRev, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1" });
  const s422b = await submit(SA.s, D1.reference, { confirm: undefined, expectedRevision: noRev, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() });
  check("F-03 submission needs an idempotency key (422) and explicit confirmation (422)", s422.status === 422 && "idempotencyKey" in s422.json.fields && (await SA.s.call("POST", `/api/supplier/quotations/${D1.reference}/submit`, { expectedRevision: noRev, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() })).status === 422);
  const wrongTotal = await submit(SA.s, D1.reference, { expectedRevision: noRev, expectedTotal: "61000.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() });
  check("F-04 a total different from the server's is a 409 TOTAL_CHANGED with the new calculation: never a silent change, nothing sent", wrongTotal.status === 409 && wrongTotal.json.code === "TOTAL_CHANGED" && wrongTotal.json.data.calculation.total === "61500.00" && (await qts.findOne({ reference: D1.reference })).status === "DRAFT");
  const wrongRule = await submit(SA.s, D1.reference, { expectedRevision: noRev, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-0-old", idempotencyKey: key() });
  check("F-05 a tax treatment whose version changed after review is a 409 TAX_POLICY_CHANGED with the current rule; nothing sent", wrongRule.status === 409 && wrongRule.json.code === "TAX_POLICY_CHANGED" && wrongRule.json.data.taxRule.version === "test-1");
  const wrongRev = await submit(SA.s, D1.reference, { expectedRevision: noRev - 1, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() });
  check("F-06 a draft changed after it was reviewed (revision differs) is a 409 STALE_REVISION; nothing sent", wrongRev.status === 409 && wrongRev.json.code === "STALE_REVISION");
  const incompleteRes = await create(SA.s, I2.reference, { lines: [{ unitPrice: "10.00" }] });
  const incomplete = await submit(SA.s, incompleteRes.json.data.reference, { expectedRevision: incompleteRes.json.data.revision, expectedTotal: "10.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() });
  check("F-07 submitting an incomplete draft is 422 with a message per missing field (tax, lead time, delivery, payment, name...); it stays a draft", incomplete.status === 422 && ["taxRuleId", "leadTimeDays", "deliveryTerms", "paymentType"].every((k) => k in incomplete.json.fields) && (await qts.findOne({ reference: incompleteRes.json.data.reference })).status === "DRAFT");
  // expired validity at submit time (the draft's stored date has passed since it was reviewed)
  const I8 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S43AAAA8" }));
  const d8 = (await create(SA.s, I8.reference, fullInput())).json.data;
  await qts.updateOne({ reference: d8.reference }, { $set: { "draft.input.validUntil": istDate(-2) } });
  const expired = await submit(SA.s, d8.reference, { expectedRevision: d8.revision, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() });
  check("F-08 an expired validity date is refused at submission (422 on validUntil), judged on the server's clock", expired.status === 422 && "validUntil" in expired.json.fields);
  await qts.updateOne({ reference: d8.reference }, { $set: { "draft.input.validUntil": istDate(15) } });
  await inq.updateOne({ _id: I8._id }, { $set: { status: "CLOSED" } });
  const closedAtSubmit = await submit(SA.s, d8.reference, { expectedRevision: d8.revision, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() });
  check("F-09 an inquiry closed after the draft was prepared is re-checked at submission: 409 INQUIRY_CLOSED, nothing sent", closedAtSubmit.status === 409 && closedAtSubmit.json.code === "INQUIRY_CLOSED" && (await qts.findOne({ reference: d8.reference })).status === "DRAFT");
  check("F-10 the preview of a draft whose inquiry closed says it cannot be submitted", (await preview(SA.s, d8.reference, {})).json.data.canSubmit === false);

  await clearLimits();
  // ================= G: the real submission, once
  const idemKey = key();
  const body = { expectedRevision: noRev, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: idemKey };
  const ok1 = await submit(SA.s, D1.reference, body);
  const sent = await qts.findOne({ reference: D1.reference });
  check("G-01 submission answers 200: status SENT, the same reference, version 1, the server total 61500.00, a link to the existing detail route, replayed false", ok1.status === 200 && ok1.json.data.status === "SENT" && ok1.json.data.reference === D1.reference && ok1.json.data.version === 1 && ok1.json.data.total === "61500.00" && ok1.json.data.replayed === false && ok1.json.data.href === `/supplier/quotations/${D1.reference}`, ok1.text?.slice(0, 250));
  check("G-02 stored: status SENT, a real sentAt, submittedBy, one SENT event by the supplier, the editable draft removed, the open key kept (one quotation per inquiry)", sent.status === "SENT" && sent.sentAt.getTime() > sent.createdAt.getTime() - 1 && String(sent.submittedBy) === String(SA.id) && sent.events.length === 1 && sent.events[0].type === "SENT" && sent.events[0].actor === "supplier" && !("draft" in sent) && sent.openKey === `${I1._id}:shree-textiles`);
  check("G-03 the immutable commercial snapshot: policy version, tax rule id + version + kind, the exact inputs, and the amounts as decimal STRINGS", sent.snapshot.policyVersion === Q.CALC_POLICY_VERSION && sent.snapshot.taxRule.id === "TEST-NOT-APPLICABLE" && sent.snapshot.taxRule.version === "test-1" && sent.snapshot.taxRule.kind === "NOT_APPLICABLE" && sent.snapshot.amounts.total === "61500.00" && sent.snapshot.amounts.subtotal === "60000.00" && sent.snapshot.amounts.freight === "1500.00" && sent.snapshot.input.lines[0].unitPrice === "120.00" && typeof sent.snapshot.amounts.total === "string");
  check("G-04 the stored money fields are the exact integers the buyer side uses: unit price 12000, quantity 500, charges [freight 150000], tax 0 bp with the rule label", sent.unitPriceMinor === 12000 && sent.quantity === 500 && sent.charges.length === 1 && sent.charges[0].minor === 150000 && sent.tax.bp === 0 && /Test fixture/.test(sent.tax.label) && sent.currency === "INR");
  const inqAfter = await inq.findOne({ _id: I1._id });
  check("G-05 the inquiry followed its own lifecycle to QUOTED through the allowed steps (NEW -> IN_PROGRESS -> QUOTED), recorded in its history", inqAfter.status === "QUOTED" && inqAfter.statusHistory.slice(-2).map((h) => `${h.from}>${h.to}`).join() === "NEW>IN_PROGRESS,IN_PROGRESS>QUOTED");
  const ob = await outbox.find({ quotationReference: D1.reference }).toArray();
  const nt = await notes.find({ buyerId: BA.id, type: "QUOTATION_RECEIVED" }).toArray();
  check("G-06 exactly one outbox row (DONE) and exactly one in-app notice for the right buyer, naming the reference and linking to their own quotation page; no e-mail is claimed", ob.length === 1 && ob[0].status === "DONE" && nt.length === 1 && nt[0].link === `/buyer/quotations/${D1.reference}` && new RegExp(D1.reference).test(nt[0].body) && ok1.json.data.buyerNotice === "recorded" && !/e-?mail/i.test(ok1.json.message), `${ob.length} ${nt.length}`);
  const bList = await BA.s.call("GET", "/api/buyer/quotations");
  const bDet = await BA.s.call("GET", `/api/buyer/quotations/${D1.reference}`);
  check("G-07 the correct buyer now sees it: in their list as active, with the exact total ₹61,500.00 and terms (lead time 10 days, EXW, 30% advance); another buyer does not", bList.json.quotations.some((q) => q.reference === D1.reference && q.total?.text === "₹61,500.00") && bDet.json.data.quotation.total.text === "₹61,500.00" && bDet.json.data.commercialTerms.some((t) => t.label === "Delivery Timeline" && /10 days/.test(t.value)) && bDet.json.data.commercialTerms.some((t) => t.label === "Incoterms" && t.value === "EXW") && bDet.json.data.commercialTerms.some((t) => t.label === "Payment Terms" && /30% advance/.test(t.value)) && (await BB.s.call("GET", `/api/buyer/quotations/${D1.reference}`)).status === 404);
  const sDet = await SA.s.call("GET", `/api/supplier/quotations/${D1.reference}`);
  check("G-08 the supplier's existing detail route shows it as Submitted with the same total; Page 42 list counts it as Submitted", sDet.json.data.quotation.statusLabel.startsWith("Submitted") && sDet.json.data.quotation.total.text === "₹61,500.00" && (await SA.s.call("GET", "/api/supplier/quotations?status=submitted")).json.quotations.some((q) => q.reference === D1.reference));
  const lateEdit = await patch(SA.s, D1.reference, noRev + 1, fullInput({ notes: "AFTER SUBMISSION" }));
  const lateDraft = await SA.s.call("GET", `/api/supplier/quotations/${D1.reference}/draft`);
  const snapAfter = (await qts.findOne({ reference: D1.reference })).snapshot;
  check("G-09 a submitted quotation is immutable: saving, and reopening it as a draft, are 409 NOT_A_DRAFT; the snapshot is unchanged", lateEdit.status === 409 && lateEdit.json.code === "NOT_A_DRAFT" && lateDraft.status === 409 && JSON.stringify(snapAfter.amounts) === JSON.stringify(sent.snapshot.amounts) && !/AFTER SUBMISSION/.test(JSON.stringify(snapAfter)));
  const replay = await submit(SA.s, D1.reference, body);
  check("G-10 retrying with the same key and the same body (a lost response) returns the ORIGINAL result (200, replayed: true) and creates nothing new", replay.status === 200 && replay.json.data.replayed === true && replay.json.data.reference === D1.reference && replay.json.data.total === "61500.00" && (await outbox.countDocuments({ quotationReference: D1.reference })) === 1 && (await notes.countDocuments({ buyerId: BA.id, type: "QUOTATION_RECEIVED" })) === 1 && (await qts.countDocuments({ inquiryId: I1._id })) === 1 && (await idem.countDocuments({ key: idemKey })) === 1);
  const changed = await submit(SA.s, D1.reference, { ...body, expectedTotal: "61500.01" });
  check("G-11 the same key with a CHANGED body is a 409 IDEMPOTENCY_CONFLICT", changed.status === 409 && changed.json.code === "IDEMPOTENCY_CONFLICT");
  const newKey = await submit(SA.s, D1.reference, { ...body, idempotencyKey: key() });
  check("G-12 a different key for an already-submitted quotation is a 409 NOT_A_DRAFT (no second submission)", newKey.status === 409 && newKey.json.code === "NOT_A_DRAFT");
  const crossKey = await submit(SB.s, D1.reference, { ...body });
  check("G-13 another supplier reusing the key finds nothing: 404, and the key is scoped to company + user + operation", crossKey.status === 404);
  const audits = await events.find({ reference: D1.reference }).toArray();
  check("G-14 the audit trail records creation, saves and the submission by the acting user and company", ["supplier_quotation_draft_created", "supplier_quotation_draft_updated", "supplier_quotation_submitted"].every((t) => audits.some((a) => a.type === t && String(a.userId) === String(SA.id))));
  const dup = await create(SA.s, I1.reference);
  check("G-15 creating a new quotation for an inquiry that already has a submitted one is refused (409 ALREADY_QUOTED) with a pointer to it", dup.status === 409 && dup.json.code === "ALREADY_QUOTED" && dup.json.data.reference === D1.reference);

  await clearLimits();
  // ================= H: concurrency
  const I9 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S43AAAA9" }));
  const d9 = (await create(SA.s, I9.reference, fullInput())).json.data;
  const k9 = key();
  const same = await Promise.all(Array.from({ length: 6 }, () => submit(SA.s, d9.reference, { expectedRevision: d9.revision, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: k9 })));
  const sentCount = await qts.countDocuments({ inquiryId: I9._id, status: "SENT" });
  check("H-01 double click: six simultaneous submissions with ONE key all answer 200 with the same quotation, and exactly one quotation is sent", same.every((r) => r.status === 200 && r.json.data.reference === d9.reference) && same.filter((r) => r.json.data.replayed === false).length === 1 && sentCount === 1 && (await qts.countDocuments({ inquiryId: I9._id })) === 1, same.map((r) => `${r.status}${r.json?.data?.replayed ? "r" : ""}`).join());
  check("H-02 ... one idempotency record, one outbox row and one buyer notice (no duplicate notification)", (await idem.countDocuments({ key: k9 })) === 1 && (await outbox.countDocuments({ quotationReference: d9.reference })) === 1 && (await notes.countDocuments({ buyerId: BA.id, type: "QUOTATION_RECEIVED", body: new RegExp(d9.reference) })) === 1);
  const I10 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S43AAA10" }));
  const d10 = (await create(SA.s, I10.reference, fullInput())).json.data;
  const diff = await Promise.all(Array.from({ length: 5 }, () => submit(SA.s, d10.reference, { expectedRevision: d10.revision, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() })));
  check("H-03 five simultaneous submissions with five DIFFERENT keys: exactly one succeeds, the rest are 409 NOT_A_DRAFT; one outbox row, one notice", diff.filter((r) => r.status === 200).length === 1 && diff.filter((r) => r.status === 409 && r.json.code === "NOT_A_DRAFT").length === 4 && (await outbox.countDocuments({ quotationReference: d10.reference })) === 1 && (await notes.countDocuments({ buyerId: BA.id, type: "QUOTATION_RECEIVED", body: new RegExp(d10.reference) })) === 1, diff.map((r) => r.status).join());
  const BIGS = await registerSupplier("big", ["big-seller-1"]);
  created.users.push(BIGS.id);
  const bigInq = [];
  for (let i = 0; i < 30; i++) bigInq.push(mkInq(BA.id, { supplierKey: "big-seller-1", supplierName: "Big Seller 1", supplierSlug: "big-seller-1", source: "sample" }, { reference: `FBM-INQ-S43B${String(i).padStart(4, "0")}` }));
  await inq.insertMany(bigInq);
  const refsMade = await Promise.all(bigInq.map((d) => create(BIGS.s, d.reference)));
  const refSet = new Set(refsMade.map((r) => r.json?.data?.reference));
  check("H-04 thirty drafts created at the same time all succeed with thirty distinct, unique quotation references", refsMade.every((r) => r.status === 201) && refSet.size === 30, `${refSet.size} distinct; statuses ${[...new Set(refsMade.map((r) => r.status))].join()} ${refsMade[0].text?.slice(0, 120)}`);
  const twin = await Promise.all([create(SA.s, "FBM-INQ-S43AAAA2"), create(SA.s, "FBM-INQ-S43AAAA2"), create(SA.s, "FBM-INQ-S43AAAA2")]);
  check("H-05 three simultaneous creates for the same inquiry produce ONE draft (the database's unique open-quotation index decides)", (await qts.countDocuments({ inquiryId: I2._id })) === 1 && new Set(twin.map((r) => r.json.data.reference)).size === 1, twin.map((r) => r.status).join());

  await clearLimits();
  // ================= I: rollback and recovery
  const I11 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S43AAA11" }));
  const d11 = (await create(SA.s, I11.reference, fullInput())).json.data;
  await outbox.insertOne({ dedupeKey: `quotation-received:${d11.reference}:1`, status: "POISON", type: "TEST", createdAt: new Date() });
  const k11 = key();
  const rolled = await submit(SA.s, d11.reference, { expectedRevision: d11.revision, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: k11 });
  const after11 = await qts.findOne({ reference: d11.reference });
  check("I-01 a failure in the last step of submission (outbox write) rolls EVERYTHING back: still a draft, same revision, inquiry status unchanged, no idempotency record, no notice", rolled.status === 503 && after11.status === "DRAFT" && after11.revision === d11.revision && (await inq.findOne({ _id: I11._id })).status === "NEW" && (await idem.countDocuments({ key: k11 })) === 0 && !after11.snapshot && after11.events.length === 0 && (await notes.countDocuments({ buyerId: BA.id, body: new RegExp(d11.reference) })) === 0, `${rolled.status} ${rolled.json?.message ?? ""}`);
  await outbox.deleteOne({ dedupeKey: `quotation-received:${d11.reference}:1` });
  const retried = await submit(SA.s, d11.reference, { expectedRevision: d11.revision, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: k11 });
  check("I-02 after the cause is fixed, retrying with the SAME key succeeds (the failed attempt left nothing behind) and sends exactly once", retried.status === 200 && retried.json.data.replayed === false && (await qts.findOne({ reference: d11.reference })).status === "SENT" && (await outbox.countDocuments({ quotationReference: d11.reference })) === 1);
  // notification failure recovery: the commit succeeded but the notice was never delivered
  await notes.deleteMany({ buyerId: BA.id, body: new RegExp(d11.reference) });
  await outbox.updateOne({ quotationReference: d11.reference }, { $set: { status: "PENDING", attempts: 0 }, $unset: { deliveredAt: "" } });
  const pagePick = await SA.s.page("/supplier/quotations");
  const ob11 = await outbox.findOne({ quotationReference: d11.reference });
  check("I-03 a notice that was not delivered is recovered the next time the supplier opens Quotations: delivered once, outbox DONE, no second quotation", pagePick.status === 200 && ob11.status === "DONE" && (await notes.countDocuments({ buyerId: BA.id, body: new RegExp(d11.reference) })) === 1 && (await qts.countDocuments({ inquiryId: I11._id })) === 1);
  await db.collection("buyer_settings").updateOne({ buyerId: BB.id }, { $set: { notifications: { inquiries: false, company: true }, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  const I12 = await mk(mkInq(BB.id, SELLER_A, { reference: "FBM-INQ-S43AAA12" }));
  const d12 = (await create(SA.s, I12.reference, fullInput())).json.data;
  const off = await submit(SA.s, d12.reference, { expectedRevision: d12.revision, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() });
  check("I-04 a buyer who switched inquiry notices off: the quotation is still submitted, the answer says NO notice was recorded (never claims one), the outbox says skipped", off.status === 200 && off.json.data.buyerNotice === "not-recorded" && /No in-app notice/.test(off.json.message) && (await outbox.findOne({ quotationReference: d12.reference })).status === "SKIPPED_PREFERENCE" && (await notes.countDocuments({ buyerId: BB.id, body: new RegExp(d12.reference) })) === 0);

  await clearLimits();
  // ================= J: pages
  const picker = await SA.s.page("/supplier/quotations/create");
  check("J-01 the picker page renders the eligible inquiries and the heading; noindex", picker.status === 200 && /Create Quotation/.test(picker.text) && /FBM-INQ-S43AAAA6/.test(picker.text) && !/FBM-INQ-S43BBBB1|Sunrise Only/.test(picker.text) && /noindex/.test(picker.text));
  const I13 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S43AAA13" }));
  const form = await SA.s.page(`/supplier/quotations/create?inquiryReference=${I13.reference}`);
  check("J-02 ?inquiryReference= renders the form with the buyer's requirement and the 'not available' notes for attachments and a second line", form.status === 200 && /Alpha Garments Pvt Ltd/.test(form.text) && /Attachments are not available/.test(form.text) && /holds 1 line item/.test(form.text) && /Approved tax treatment/.test(form.text));
  const forgedRef = await SA.s.page(`/supplier/quotations/create?inquiryReference=${IB.reference}`);
  const unkRef = await SA.s.page("/supplier/quotations/create?inquiryReference=FBM-INQ-ZZZZZZZZ");
  const badRef = await SA.s.page("/supplier/quotations/create?inquiryReference=%3Cscript%3E");
  check("J-03 another seller's inquiry, an unknown one and a malformed one are the same real HTTP 404 (no data)", forgedRef.status === 404 && unkRef.status === 404 && badRef.status === 404 && !/Sunrise Only/.test(forgedRef.text));
  const open1 = await SA.s.page(`/supplier/quotations/create?inquiryReference=${I1.reference}`);
  check("J-04 an inquiry that already has a submitted quotation goes to that quotation (never a duplicate form)", [302, 307].includes(open1.status) && open1.location === `/supplier/quotations/${D1.reference}`);
  const draftOpen = await SA.s.page(`/supplier/quotations/create?reference=${I2.reference === "x" ? "" : twin[0].json.data.reference}`);
  check("J-05 ?reference= opens the company's own draft", draftOpen.status === 200 && /Draft/.test(draftOpen.text));
  const subOpen = await SA.s.page(`/supplier/quotations/create?reference=${D1.reference}`);
  check("J-06 a submitted quotation sent to the edit route goes to its detail page", [302, 307].includes(subOpen.status) && subOpen.location === `/supplier/quotations/${D1.reference}`);
  const foreignDraft = await SB.s.page(`/supplier/quotations/create?reference=${twin[0].json.data.reference}`);
  check("J-07 another supplier's draft reference is a real 404 with none of its data", foreignDraft.status === 404 && !/Silk Fabric|Bravo Retail/.test(foreignDraft.text));
  check("J-08 there is no PDF endpoint and no attachment upload route (BLOCKED, not simulated): both 404", (await SA.s.call("GET", `/api/supplier/quotations/${D1.reference}/pdf`)).status === 404 && (await SA.s.call("POST", `/api/supplier/quotations/${D1.reference}/attachments`, {})).status === 404);
  const detailAfter = await SA.s.page(`/supplier/quotations/${D1.reference}?submitted=1`);
  check("J-09 the existing detail route shows the success notice for a quotation that really is submitted, and not for a draft", /was submitted\. The buyer can now see it/.test(detailAfter.text) && !/was submitted\. The buyer can now see it/.test((await SA.s.page(`/supplier/quotations/${twin[0].json.data.reference}?submitted=1`)).text));

  // ================= K: browser journey
  const E1 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S43AAA14", productName: "Browser Journey Fabric" }));
  const b = await open("/supplier/quotations/create", { session: SA.s });
  check("K-01 the picker loads in the browser with no console errors and a Create quotation link per inquiry", b.status === 200 && b.errs.length === 0 && (await b.evaluate(() => document.querySelectorAll('ul[aria-label="Eligible inquiries"] li').length)) >= 3, b.errs.join(" | "));
  await b.type("#pick-search", "Browser Journey");
  await b.waitForFunction(() => document.querySelectorAll('ul[aria-label="Eligible inquiries"] li').length === 1, { timeout: 8000 }).catch(() => {});
  check("K-02 typing in the picker search (debounced) narrows it to the matching inquiry", (await b.evaluate(() => document.querySelectorAll('ul[aria-label="Eligible inquiries"] li').length)) === 1);
  await b.screenshot({ path: `${SHOTS}/43-create-quotation-picker-1440.png`, fullPage: true });
  await Promise.all([b.waitForNavigation({ waitUntil: "networkidle2" }), clickBtn(b, "Create quotation")]);
  check("K-03 choosing it opens the form for that inquiry (address carries the reference) with the buyer's requirement shown", /inquiryReference=FBM-INQ-S43AAA14/.test(b.url()) && /Browser Journey Fabric/.test(await b.evaluate(() => document.body.textContent)) && (await b.evaluate(() => document.querySelector("#f-lines-0-quantity").value)) === "500");
  await clickBtn(b, "Review & Submit");
  await b.waitForSelector("#err-title", { timeout: 10000 });
  const summaryFocus = await b.evaluate(() => ({ focused: document.activeElement?.getAttribute("role") === "alert" || document.activeElement?.id === "", links: document.querySelectorAll("#err-title ~ ul a").length, text: document.querySelector("#err-title").textContent }));
  check("K-04 Review & Submit on an incomplete form saves the draft, then shows a FOCUSED error summary with a link per problem (price, tax, lead time, delivery, payment)", summaryFocus.links >= 4 && /Please fix/.test(summaryFocus.text) && /\?reference=FBM-QT-/.test(b.url()), JSON.stringify(summaryFocus));
  await b.evaluate(() => document.querySelector('#err-title ~ ul a')?.click());
  const focusedId = await b.evaluate(() => document.activeElement?.id);
  check("K-05 clicking an error link moves focus to that field", /^f-/.test(focusedId ?? ""), focusedId);
  const invalid = await b.evaluate(() => [...document.querySelectorAll('[aria-invalid="true"]')].filter((e) => e.getAttribute("aria-describedby") && document.getElementById(e.getAttribute("aria-describedby"))).length);
  check("K-06 invalid fields are marked aria-invalid and linked to their message with aria-describedby", invalid >= 4, String(invalid));
  await setVal(b, "#f-lines-0-unitPrice", "120");
  await setVal(b, "#f-taxRuleId", "TEST-NOT-APPLICABLE");
  await setVal(b, "#f-leadTimeDays", "10");
  await setVal(b, "#f-deliveryTerms", "EXW");
  await setVal(b, "#f-paymentType", "ON_DELIVERY");
  await setVal(b, "#f-freight", "1500");
  await sleep(300);
  const live = await b.evaluate(() => document.querySelector("#summary-body")?.textContent.replace(/\s+/g, " ") ?? "");
  check("K-07 the live summary uses the shared calculation: subtotal ₹60,000.00, freight ₹1,500.00, total ₹61,500.00 as soon as price, tax and freight are entered", /Items\s*₹60,000\.00/.test(live) && /Freight\s*₹1,500\.00/.test(live) && /Total\s*₹61,500\.00/.test(live), live.slice(0, 220));
  await setVal(b, "#f-taxRuleId", "");
  await sleep(200);
  check("K-08 with no tax treatment the summary says 'Pending tax review' and shows only a provisional amount, never a final total", /Pending tax review/.test(await b.evaluate(() => document.querySelector("#summary-body").textContent)) && /Provisional amount before tax: ₹61,500\.00/.test(await b.evaluate(() => document.querySelector("#summary-body").textContent)));
  await setVal(b, "#f-taxRuleId", "TEST-NOT-APPLICABLE");
  await b.screenshot({ path: `${SHOTS}/43-create-quotation-form-1440.png`, fullPage: true });
  // save failure and retry
  await b.setRequestInterception(true);
  let failOnce = true;
  const interceptor = (req) => { if (failOnce && req.method() === "PATCH" && /\/api\/supplier\/quotations\/FBM-QT-/.test(req.url())) { failOnce = false; req.abort("failed"); } else req.continue(); };
  b.on("request", interceptor);
  await clickBtn(b, "Save Draft");
  await b.waitForFunction(() => /could not reach the server/.test(document.body.textContent), { timeout: 8000 }).catch(() => {});
  const failedBanner = await b.evaluate(() => ({ text: document.querySelector('[role="alert"]')?.textContent ?? "", retry: [...document.querySelectorAll("button")].some((x) => x.textContent.trim() === "Try again"), status: document.querySelector('[role="status"]')?.textContent ?? "" }));
  check("K-09 a network failure on Save Draft shows an honest message (not saved, changes kept), a Try again button, and the footer still says 'Unsaved changes'", /not saved/.test(failedBanner.text) && failedBanner.retry && /Unsaved changes/.test(await b.evaluate(() => document.body.textContent)), JSON.stringify(failedBanner).slice(0, 200));
  await clickBtn(b, "Try again");
  await b.waitForFunction(() => /Draft saved/.test(document.body.textContent), { timeout: 10000 }).catch(() => {});
  b.off("request", interceptor);
  await b.setRequestInterception(false);
  const savedRef = (b.url().match(/reference=(FBM-QT-\w+)/) ?? [])[1];
  const savedDoc = await qts.findOne({ reference: savedRef });
  check("K-10 Try again saves the draft (server revision advanced, price stored) and the status line says 'Draft saved'", Boolean(savedRef) && savedDoc.draft.input.lines[0].unitPrice === "120" && savedDoc.revision >= 2 && /Draft saved/.test(await b.evaluate(() => document.body.textContent)));
  await b.reload({ waitUntil: "networkidle2" });
  check("K-11 after a reload the draft comes back from the server exactly as saved (price 120, lead time 10, EXW, freight 1500, tax treatment)", (await b.evaluate(() => ["#f-lines-0-unitPrice", "#f-leadTimeDays", "#f-deliveryTerms", "#f-freight", "#f-taxRuleId"].map((s) => document.querySelector(s).value))).join("|") === "120|10|EXW|1500|TEST-NOT-APPLICABLE");
  // revision conflict from another place
  await patch(SA.s, savedRef, (await qts.findOne({ reference: savedRef })).revision, fullInput({ notes: "changed by someone else", lines: [{ ...fullInput().lines[0], name: "Browser Journey Fabric", unitPrice: "120" }], paymentType: "ON_DELIVERY", advancePercent: "" }));
  await setVal(b, "#f-notes", "my local edit");
  await clickBtn(b, "Save Draft");
  await b.waitForFunction(() => /changed somewhere else/.test(document.body.textContent), { timeout: 8000 }).catch(() => {});
  check("K-12 saving after someone else changed the draft shows the conflict panel (nothing overwritten) with a way to load the latest", /changed somewhere else/.test(await b.evaluate(() => document.body.textContent)) && !/my local edit/.test(JSON.stringify((await qts.findOne({ reference: savedRef })).draft.input)));
  await clickBtn(b, "Load the latest version");
  await b.waitForFunction(() => document.querySelector("#f-notes")?.value === "changed by someone else", { timeout: 8000 }).catch(() => {});
  check("K-13 loading the latest replaces the form with the server's version", (await b.evaluate(() => document.querySelector("#f-notes").value)) === "changed by someone else");
  // preview
  await clickBtn(b, "Preview");
  await b.waitForSelector("dialog[open]", { timeout: 8000 });
  const pdlg = await b.evaluate(() => { const d = document.querySelector("dialog[open]"); return { text: d.textContent.replace(/\s+/g, " "), focusInside: d.contains(document.activeElement), hasSubmit: [...d.querySelectorAll("button")].some((x) => /Submit quotation/.test(x.textContent)) }; });
  check("K-14 Preview opens a modal that says Draft / nothing submitted, shows the server's amounts (₹61,500.00), the buyer and the terms, has NO submit button, and focus is inside", /Nothing has been submitted/.test(pdlg.text) && /₹61,500\.00/.test(pdlg.text) && /Alpha Garments Pvt Ltd/.test(pdlg.text) && !pdlg.hasSubmit && pdlg.focusInside, pdlg.text.slice(0, 160));
  await b.keyboard.press("Escape");
  await sleep(300);
  const returned = await b.evaluate(() => ({ closed: !document.querySelector("dialog[open]"), active: document.activeElement?.textContent?.trim() }));
  check("K-15 Escape closes the preview and focus returns to the Preview button", returned.closed && /^Preview/.test(returned.active ?? ""), JSON.stringify(returned));
  check("K-16 nothing was sent by previewing: the quotation is still a draft, no outbox row", (await qts.findOne({ reference: savedRef })).status === "DRAFT" && (await outbox.countDocuments({ quotationReference: savedRef })) === 0);
  // review and submit
  await clickBtn(b, "Review & Submit");
  await b.waitForSelector("dialog[open]", { timeout: 10000 });
  const submitDisabled = await b.evaluate(() => [...document.querySelectorAll("dialog[open] button")].find((x) => /Submit quotation/.test(x.textContent))?.disabled);
  check("K-17 the review dialog's Submit is DISABLED until the supplier ticks the explicit confirmation", submitDisabled === true);
  await b.screenshot({ path: `${SHOTS}/43-create-quotation-review-1440.png` });
  await b.click("dialog[open] input[type=checkbox]");
  await Promise.all([b.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }), clickBtn(b, "Submit quotation")]);
  const detailText = await b.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
  check("K-18 after submitting, the existing quotation detail route opens with an accessible success notice, the reference and the total", new RegExp(`/supplier/quotations/${savedRef}`).test(b.url()) && /was submitted\. The buyer can now see it/.test(detailText) && /₹61,500\.00/.test(detailText) && !(await b.evaluate(() => !!document.querySelector('[role="status"]')) === false));
  check("K-19 the quotation is SENT exactly once and the buyer has exactly one notice", (await qts.findOne({ reference: savedRef })).status === "SENT" && (await notes.countDocuments({ buyerId: BA.id, body: new RegExp(savedRef) })) === 1 && (await qts.countDocuments({ inquiryId: E1._id })) === 1);
  check("K-20 no console errors across the whole journey", b.errs.length === 0, b.errs.join(" | "));
  await b.context.close();

  // changed total in the browser dialog: the review shows the new calculation and asks again
  const E2 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S43AAA15" }));
  const d15 = (await create(SA.s, E2.reference, fullInput())).json.data;
  const b2 = await open(`/supplier/quotations/create?reference=${d15.reference}`, { session: SA.s });
  await clickBtn(b2, "Review & Submit");
  await b2.waitForSelector("dialog[open]", { timeout: 10000 });
  // the draft's price changes on the server after the supplier reviewed it, without changing the revision they hold (simulating a rule change): the total they confirm no longer matches
  await qts.updateOne({ reference: d15.reference }, { $set: { "draft.input.lines.0.unitPrice": "130.00" } });
  await b2.click("dialog[open] input[type=checkbox]");
  await clickBtn(b2, "Submit quotation");
  await b2.waitForFunction(() => /different from the one you reviewed/.test(document.body.textContent), { timeout: 10000 }).catch(() => {});
  const chg = await b2.evaluate(() => ({ alert: document.querySelector("dialog[open] [role=alert]")?.textContent ?? "", total: document.querySelector("dialog[open]")?.textContent.replace(/\s+/g, " ").match(/Total\s*₹[\d,]+\.\d\d/)?.[0], checked: document.querySelector("dialog[open] input[type=checkbox]")?.checked }));
  check("K-21 if the total changed after review, the dialog shows the NEW server total (₹66,500.00), says so, un-ticks the confirmation, and the quotation is NOT sent", /different from the one you reviewed/.test(chg.alert) && /66,500\.00/.test(chg.total ?? "") && chg.checked === false && (await qts.findOne({ reference: d15.reference })).status === "DRAFT", JSON.stringify(chg));
  await b2.context.close();

  // ================= L: responsive and keyboard
  const E3 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S43AAA16" }));
  const d16 = (await create(SA.s, E3.reference, fullInput({ notes: "n".repeat(480) }))).json.data;
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const over = [];
  for (const w of widths) {
    const p = await open(`/supplier/quotations/create?reference=${d16.reference}`, { width: w, height: w < 700 ? 800 : 900, session: SA.s });
    const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (o > 0) over.push(`${w}:+${o}`);
    if (w === 390) await p.screenshot({ path: `${SHOTS}/43-create-quotation-mobile-390.png`, fullPage: true });
    if (w === 820) await p.screenshot({ path: `${SHOTS}/43-create-quotation-tablet-820.png`, fullPage: true });
    await p.context.close();
  }
  check("L-01 no horizontal page overflow on the form at 16 widths from 320 to 2560", over.length === 0, over.join(", "));
  const m = await open(`/supplier/quotations/create?reference=${d16.reference}`, { width: 390, height: 800, session: SA.s });
  const mob = await m.evaluate(() => {
    const body = document.querySelector("#summary-body");
    const toggle = document.querySelector('button[aria-controls="summary-body"]');
    return { summaryHidden: getComputedStyle(body).display === "none", toggleVisible: toggle.getClientRects().length > 0, lineGrid: getComputedStyle(document.querySelector("#f-lines-0-quantity").closest("div[class*=lineGrid]")).gridTemplateColumns.split(" ").length };
  });
  await m.click('button[aria-controls="summary-body"]');
  const expanded = await m.evaluate(() => getComputedStyle(document.querySelector("#summary-body")).display !== "none");
  check("L-02 on a phone the summary is collapsed behind an accessible toggle (aria-expanded) that expands it, and the line item is a 2-column card, not a squeezed table", mob.summaryHidden && mob.toggleVisible && expanded && mob.lineGrid === 2, JSON.stringify(mob));
  // (1) mid-page the action bar is stuck to the bottom of the viewport; (2) at the end of the FORM (the site footer follows it) it sits below the last section without covering it
  await m.evaluate(() => window.scrollTo(0, 400));
  await sleep(200);
  const stuck = await m.evaluate(() => { const f = document.querySelector('[class*="footer"]').getBoundingClientRect(); return { bottom: f.bottom, vh: window.innerHeight, top: f.top }; });
  await m.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); // the very end: the site footer follows the form, so the action bar is back at its natural place below the last section
  await sleep(200);
  const overlap = await m.evaluate(() => {
    const footer = document.querySelector('[class*="footer"]');
    const last = [...document.querySelectorAll("section")].filter((s) => s.getClientRects().length && s.closest("[class*=main]")).pop();
    const f = footer.getBoundingClientRect();
    const l = last.getBoundingClientRect();
    return { footerTop: f.top, footerBottom: f.bottom, lastBottom: l.bottom, vh: window.innerHeight };
  });
  check("L-03 on a phone the action bar is stuck to the bottom of the screen while scrolling (Save Draft / Review & Submit always reachable), and at the end of the form it sits below the last section without covering it", Math.abs(stuck.bottom - stuck.vh) <= 2 && overlap.lastBottom <= overlap.footerTop + 1, JSON.stringify({ stuck, overlap }));
  const tapTargets = await m.evaluate(() => [...document.querySelectorAll("button:not(:disabled), input:not([type=checkbox]), select, textarea, a[class*=btn]")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().height < 40 && getComputedStyle(e).visibility !== "hidden").map((e) => `${e.tagName}.${(e.className || "").toString().slice(0, 30)}:${Math.round(e.getBoundingClientRect().height)}`));
  check("L-04 interactive controls are at least 40 px tall on a phone", tapTargets.length === 0, tapTargets.slice(0, 5).join(", "));
  await m.context.close();
  const k = await open(`/supplier/quotations/create?reference=${d16.reference}`, { width: 1440, session: SA.s });
  const order = [];
  for (let i = 0; i < 90; i++) { await k.keyboard.press("Tab"); const id = await k.evaluate(() => document.activeElement?.id || document.activeElement?.tagName); order.push(id); if (/^f-/.test(id)) break; }
  const tabsToFirstField = order.length;
  const visibleFocus = await k.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return s.outlineStyle !== "none" || s.boxShadow !== "none" || e === document.body; });
  check("L-05 keyboard: Tab moves through the page to the form fields in reading order with a visible focus style", order.some((x) => /^f-/.test(x ?? "")) && order.at(-1) === "f-currency" && visibleFocus, `first field after ${tabsToFirstField} tabs: ${order.at(-1)}`);
  const labelled = await k.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), select, textarea')].filter((e) => e.getClientRects().length).filter((e) => !(e.labels && e.labels.length) && !e.getAttribute("aria-label") && !e.getAttribute("aria-labelledby")).map((e) => e.id || e.name || e.tagName));
  check("L-06 every visible form control has a programmatic label", labelled.length === 0, labelled.join(","));
  await k.context.close();

  // ================= M: scale
  if (!process.env.SKIP_PERF) {
    const perfInq = [];
    for (let i = 0; i < 2000; i++) perfInq.push(mkInq(BA.id, { supplierKey: "big-seller-1", supplierName: "Big Seller 1", supplierSlug: "big-seller-1", source: "sample" }, { reference: `FBM-INQ-S43P${String(i).padStart(4, "0")}`, productName: `Perf Product ${i % 211} ${["Cotton", "Steel", "Paper", "Resin"][i % 4]}`, status: ["NEW", "IN_PROGRESS", "REPLIED", "CLOSED", "QUOTED"][i % 5], createdAt: ago(i % 300) }));
    await inq.insertMany(perfInq, { ordered: false });
    const t1 = await timeIt(() => BIGS.s.call("GET", "/api/supplier/inquiries?limit=20"));
    const t2 = await timeIt(() => BIGS.s.call("GET", "/api/supplier/inquiries?q=cotton&limit=20"));
    const t3 = await timeIt(() => BIGS.s.call("GET", `/api/supplier/inquiries/${perfInq[3].reference}/quotation-context`));
    const total = (await BIGS.s.call("GET", "/api/supplier/inquiries")).json.meta.total;
    const bytes = (await BIGS.s.call("GET", "/api/supplier/inquiries?limit=50")).text.length;
    // draft save, preview and submit need real drafts
    const pool = [];
    for (let i = 0; i < 40; i++) { const r = await create(BIGS.s, perfInq.filter((d) => ["NEW", "IN_PROGRESS", "REPLIED"].includes(d.status))[i].reference, fullInput()); if (r.status === 201) pool.push(r.json.data); }
    let patchRev = pool[0].revision;
    const t4 = await timeIt(async () => { const r = await patch(BIGS.s, pool[0].reference, patchRev, fullInput({ notes: `n${patchRev}` })); if (r.status === 200) patchRev = r.json.data.revision; });
    const t5 = await timeIt(() => preview(BIGS.s, pool[1].reference, { input: fullInput() }));
    await clearLimits();
    const subTimes = [];
    for (let i = 2; i < 2 + 20 && i < pool.length; i++) {
      if (i % 9 === 0) await clearLimits();
      const s0 = performance.now();
      const r = await submit(BIGS.s, pool[i].reference, { expectedRevision: pool[i].revision, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() });
      subTimes.push(performance.now() - s0);
      if (r.status !== 200) console.log("      perf submit status", r.status, r.text?.slice(0, 120));
    }
    const t6 = { p50: med(subTimes, 0.5), p95: med(subTimes, 0.95), p99: med(subTimes, 0.99) };
    console.log(`      ${total.toLocaleString()} quotable inquiries: picker ${fmt(t1)} | picker search ${fmt(t2)} | context ${fmt(t3)} | draft save ${fmt(t4)} | preview ${fmt(t5)} | submit (${subTimes.length}) ${fmt(t6)} | 50-row picker ${(bytes / 1024).toFixed(1)} KB`);
    check("M-01 picker, search and context p95 under the 500 ms planning target at ~1,230 quotable inquiries", t1.p95 < 500 && t2.p95 < 500 && t3.p95 < 500, `${t1.p95.toFixed(0)} / ${t2.p95.toFixed(0)} / ${t3.p95.toFixed(0)} ms`);
    check("M-02 draft save p95 under 700 ms and preview p95 under 500 ms", t4.p95 < 700 && t5.p95 < 500, `${t4.p95.toFixed(0)} / ${t5.p95.toFixed(0)} ms`);
    check("M-03 submit p95 under 1 second (transaction included, notification excluded from the target)", t6.p95 < 1000, `${t6.p95.toFixed(0)} ms`);
    check("M-04 every perf submission succeeded", subTimes.length >= 15);
    const ex = await inq.find({ supplierKey: { $in: ["big-seller-1"] }, status: { $in: ["NEW", "new", "NOTIFIED", "IN_PROGRESS", "REPLIED", "QUOTED"] }, buyerId: { $exists: true } }).sort({ createdAt: -1, _id: -1 }).limit(20).explain("executionStats");
    const plan = JSON.stringify(ex.queryPlanner.winningPlan);
    console.log(`      picker plan: COLLSCAN=${plan.includes("COLLSCAN")} blocking SORT=${/"stage":"SORT"/.test(plan) && !plan.includes("SORT_MERGE")} keys=${ex.executionStats.totalKeysExamined} docs=${ex.executionStats.totalDocsExamined} returned=${ex.executionStats.nReturned}`);
    check("M-05 the picker query is index-backed: no collection scan and no blocking sort", !plan.includes("COLLSCAN") && !(/"stage":"SORT"/.test(plan) && !plan.includes("SORT_MERGE")));
    const idx = (await qts.indexes()).map((i) => i.name);
    check("M-06 the open-quotation unique index and the idempotency / outbox indexes exist", idx.includes("quotation_open_per_inquiry") && (await idem.indexes()).some((i) => i.name === "idempotency_scope_key" && i.unique) && (await outbox.indexes()).some((i) => i.name === "outbox_dedupe" && i.unique));
  }
}

let failed = false;
try { await main(); } catch (e) { failed = true; console.error("TEST RUN ABORTED:", e); }
if (!process.env.KEEP) {
  try {
    await qts.deleteMany({ inquiryReference: /^FBM-INQ-S43/ });
    await inq.deleteMany({ reference: /^FBM-(INQ|7NQ)-S43/ });
    await notes.deleteMany({ type: "QUOTATION_RECEIVED" });
    await outbox.deleteMany({});
    await idem.deleteMany({});
    await events.deleteMany({ type: /^supplier_quotation/ });
    await db.collection("buyer_settings").deleteMany({});
    await companies.deleteMany({ ownerUserId: { $in: created.users } });
    await users.deleteMany({ email: new RegExp(`^t43-${stamp}-`) });
  } catch (e) { console.error("cleanup failed", e.message); }
}
await browser.close();
await client.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed${bad.length ? `; FAILED: ${bad.map((x) => x.name.slice(0, 40)).join(" | ")}` : ""}`);
process.exit(failed || bad.length ? 1 : 0);
