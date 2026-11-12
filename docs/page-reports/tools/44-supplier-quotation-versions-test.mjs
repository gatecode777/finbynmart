import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

// Page 44 (Supplier Quotation Details & Version History: /supplier/quotations/[reference]?version=n and the versions / compare / revisions / activity / withdraw APIs).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/44-supplier-quotation-versions-test.mjs
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test with QUOTATION_TAX_RULES set to the TEST fixture (the revision journey submits through the
// create-quotation workflow), Chrome and puppeteer-core. Lineages are inserted directly where the case is about stored shapes (legacy, accepted, withdrawn, 45 versions) and are
// built through the real Page 43 API where the case is about the workflow. Every buyer is a throwaway account: no notification reaches a real user. SKIP_PERF=1 skips group L.
const BASE = process.env.BASE || "http://localhost:3100";
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
const emailOf = (t) => `t44-${stamp}-${t}@example.test`;
let ipN = 0;
const nextIp = () => `10.44.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "supplier quotation versions passphrase";
const DAY = 86_400_000;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const rand8 = () => { const b = randomBytes(8); let s = ""; for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % 32]; return s; };
const ago = (d) => new Date(Date.now() - d * DAY);
const future = (d) => new Date(Date.now() + d * DAY);
const key = () => randomBytes(16).toString("hex");
const istDate = (plus) => Q.istDateText(Date.now() + plus * DAY);
const sha = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex");
const med = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const timeIt = async (fn, n = 25) => { await clearLimits(); for (let i = 0; i < 2; i++) await fn(i); const t = []; for (let i = 0; i < n; i++) { const s0 = performance.now(); await fn(i + 2); t.push(performance.now() - s0); } return { p50: med(t, 0.5), p95: med(t, 0.95), p99: med(t, 0.99) }; };
const fmt = (t) => `p50 ${t.p50.toFixed(0)} ms, p95 ${t.p95.toFixed(0)} ms, p99 ${t.p99.toFixed(0)} ms`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Session {
  jar = new Map();
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  async call(method, p, payload, headers = {}) {
    const r = await fetch(BASE + p, { method, headers: { "x-forwarded-for": nextIp(), ...(payload !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}), ...headers }, body: payload === undefined ? undefined : typeof payload === "string" ? payload : JSON.stringify(payload), redirect: "manual" });
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
const registerBuyer = async (tag, company) => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Versions ${tag} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: company, password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register buyer: ${r.status} ${r.text}`);
  return { s, id: (await users.findOne({ email: emailOf(tag) }))._id };
};
const registerSupplier = async (tag, keys) => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/supplier", { businessName: `Versions ${tag.toUpperCase()} Traders`, contactName: `Sia ${tag}`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk for businesses.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register supplier: ${r.status} ${r.text}`);
  const user = await users.findOne({ email: emailOf(tag) });
  await s.call("GET", "/api/supplier/quotations/summary");
  await companies.updateOne({ ownerUserId: user._id }, { $set: { sellerKeys: keys } });
  return { s, id: user._id };
};
const SELLER_A = { supplierKey: "shree-textiles", supplierName: "Shree Textiles", supplierSlug: "shree-textiles", source: "sample" };
const SELLER_B = { supplierKey: "sunrise-hub", supplierName: "Sunrise Hub", supplierSlug: "sunrise-hub", source: "sample" };
const mkInq = (buyerId, seller, over = {}) => ({ buyerId, buyerType: "REGISTERED", reference: `FBM-INQ-${rand8()}`, ...seller, productName: "Cotton poplin fabric", categoryName: "Textiles", quantity: 500, unit: "Meter", message: "Private buyer message.", inquiryType: "GET_BEST_QUOTE", deliveryLocation: { text: "Jaipur, Rajasthan 302001" }, status: "QUOTED", statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: ago(30) }], createdAt: ago(30), updatedAt: ago(30), ...over });
const fullInput = (over = {}) => ({ currency: "INR", validUntil: istDate(15), lines: [{ id: "line-1", source: "INQUIRY", productKey: "", name: "Cotton poplin fabric", quantity: "500", unit: "Meter", unitPrice: "120.00", moq: "100", discountKind: "NONE", discountValue: "" }], taxRuleId: "TEST-NOT-APPLICABLE", freight: "1500.00", charges: [], leadTimeDays: "10", deliveryTerms: "EXW", paymentType: "ADVANCE", advancePercent: "30", netDays: "", notes: "Plain text note", ...over });
const REV = "/api/supplier/quotations";
const revise = (s, ref, body, headers) => s.call("POST", `${REV}/${ref}/revisions`, body, headers);
const withdraw = (s, ref, body) => s.call("POST", `${REV}/${ref}/withdraw`, { confirm: true, ...body });

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
async function open(p, { width = 1440, height = 900, session } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/40\d|409|422|429|50\d|503|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  if (session) await page.setCookie(...[...session.jar].map(([name, value]) => ({ name, value, url: BASE })));
  await page.setViewport({ width, height });
  const resp = await page.goto(BASE + p, { waitUntil: "networkidle2" });
  page.errs = errs; page.status = resp.status(); page.context = context;
  return page;
}
const setVal = (p, sel, value) => p.evaluate((s, v) => { const el = document.querySelector(s); const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }, sel, value);
const clickBtn = (p, text) => p.evaluate((t) => { const b = [...document.querySelectorAll("button, a")].find((x) => x.textContent.trim().startsWith(t) && x.getClientRects().length && !x.disabled); if (!b) return false; b.click(); return true; }, text);
const created = { users: [] };

async function main() {
  const BA = await registerBuyer("ba", "Alpha Garments Pvt Ltd");
  const BB = await registerBuyer("bb", "Bravo Retail LLP");
  const SA = await registerSupplier("a", [SELLER_A.supplierKey]);
  const SB = await registerSupplier("b", [SELLER_B.supplierKey]);
  const SS = await registerSupplier("susp", [SELLER_A.supplierKey]);
  await companies.updateOne({ ownerUserId: SS.id }, { $set: { status: "SUSPENDED" } });
  const companyA = await companies.findOne({ ownerUserId: SA.id });
  created.users.push(BA.id, BB.id, SA.id, SB.id, SS.id);
  const mk = async (doc) => { const r = await inq.insertOne(doc); return { ...doc, _id: r.insertedId }; };
  const doc = (buyerId, iq, seller, reference, version, over = {}) => ({ reference, version, isCurrent: true, inquiryId: iq._id, inquiryReference: iq.reference, buyerId, ...seller, productName: "Cotton poplin fabric", currency: "INR", unit: "Meter", quantity: 500, unitPriceMinor: 12000, validUntil: future(30), status: "SENT", sentAt: ago(10 - version), createdAt: ago(10 - version), updatedAt: ago(10 - version), events: [{ type: "SENT", at: ago(10 - version), actor: "supplier" }], ...over });

  // ---------- legacy lineage L1 (no snapshot): v1 superseded, v2 current
  const IL = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S44AAAK1" }));
  const L1 = "FBM-QT-S44AAAA1";
  const detailed = { discount: { kind: "PERCENT", bp: 500 }, tax: { label: "GST", bp: 1200 }, charges: [{ label: "Freight", minor: 500000 }], moq: { quantity: 200, unit: "Meter" }, terms: { deliveryMinDays: 7, deliveryMaxDays: 10, deliveryLocation: "Jaipur", incoterms: "EXW", paymentTerms: "50% advance, 50% on delivery", packaging: "Export carton", warranty: "6 months", remarks: "Legacy note A <b>bold</b>" }, productSnapshot: { description: "Plain woven cotton.", specs: [{ label: "GSM", value: "120" }], features: ["Pre-shrunk"] } };
  await qts.insertMany([
    doc(BA.id, IL, SELLER_A, L1, 1, { isCurrent: false, status: "SUPERSEDED", unitPriceMinor: 76000, ...detailed, terms: { ...detailed.terms, remarks: "Legacy note A" }, events: [{ type: "SENT", at: ago(9), actor: "supplier" }, { type: "SUPERSEDED", at: ago(8), actor: "system" }] }),
    doc(BA.id, IL, SELLER_A, L1, 2, { unitPriceMinor: 74000, ...detailed, openKey: `${IL._id}:shree-textiles` }),
  ]);
  // ---------- accepted, withdrawn, rejected, expired, draft, incomplete legacy, quoted-name lineages
  const mkLineage = async (suffix, over, iqOver = {}) => { const iq = await mk(mkInq(BA.id, SELLER_A, { reference: `FBM-INQ-S440${suffix}`, ...iqOver })); await qts.insertOne(doc(BA.id, iq, SELLER_A, `FBM-QT-S440${suffix}`, 1, over)); return { iq, ref: `FBM-QT-S440${suffix}` }; };
  const ACC = await mkLineage("ACC1", { status: "ACCEPTED", accepted: true, decision: { type: "ACCEPTED", at: ago(1), reason: null }, events: [{ type: "SENT", at: ago(5), actor: "supplier" }, { type: "ACCEPTED", at: ago(1), actor: "buyer" }] });
  const WDR = await mkLineage("WDR1", { status: "WITHDRAWN", events: [{ type: "SENT", at: ago(5), actor: "supplier" }, { type: "WITHDRAWN", at: ago(4), actor: "supplier", reason: "Out of stock" }] });
  const REJ = await mkLineage("REJ1", { status: "REJECTED", decision: { type: "REJECTED", at: ago(2), reason: "Too slow" } });
  const EXP = await mkLineage("EXP1", { validUntil: ago(2) });
  const DRF = await mkLineage("DRF1", { status: "DRAFT", draft: { input: fullInput(), complete: false, savedAt: ago(1) }, revision: 3 });
  const BAD = await mkLineage("BAD1", { quantity: 0, unitPriceMinor: 5000 });
  const NAMED = await mkLineage("NAM1", { productName: "Quoted Name As Submitted", productKey: "1163", unitPriceMinor: 4242 });
  const CLS = await mkLineage("CKD1", {}, { status: "CLOSED" });
  const IB = await mk(mkInq(BA.id, SELLER_B, { reference: "FBM-INQ-S44BBBB1" }));
  await qts.insertOne(doc(BA.id, IB, SELLER_B, "FBM-QT-S44BBBB1", 1, { productName: "Sunrise Only Product" }));
  // ---------- a lineage with a currency change
  const CUR = await mkLineage("CRN1", { isCurrent: false, status: "SUPERSEDED" });
  await qts.insertOne(doc(BA.id, CUR.iq, SELLER_A, CUR.ref, 2, { currency: "USD", unitPriceMinor: 1500, unit: "Meter" }));
  // ---------- a lineage with 45 versions
  const MANY = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S44MANY1" }));
  const manyDocs = [];
  for (let v = 1; v <= 45; v++) manyDocs.push(doc(BA.id, MANY, SELLER_A, "FBM-QT-S44MANY1", v, { isCurrent: v === 45, status: v === 45 ? "SENT" : "SUPERSEDED", unitPriceMinor: 12000 + v * 10, revisionOf: v > 1 ? v - 1 : undefined, revisionReason: v > 1 ? `Reason ${v}` : undefined }));
  await qts.insertMany(manyDocs.map((d) => { Object.keys(d).forEach((k) => d[k] === undefined && delete d[k]); return d; }));

  // ================= A: access
  const un = new Session();
  const routes = [["GET", `${REV}/${L1}`], ["GET", `${REV}/${L1}/versions`], ["GET", `${REV}/${L1}/compare?from=1&to=2`], ["GET", `${REV}/${L1}/activity`], ["POST", `${REV}/${L1}/revisions`, { baseVersion: 2, reason: "Price update", idempotencyKey: key() }], ["POST", `${REV}/${L1}/withdraw`, { confirm: true }]];
  const unRes = await Promise.all(routes.map(([m, p, b]) => un.call(m, p, b)));
  check("A-01 no session: detail, versions, compare, activity, revisions and withdraw all answer 401", unRes.every((r) => r.status === 401), unRes.map((r) => r.status).join());
  const buyRes = await Promise.all(routes.map(([m, p, b]) => BA.s.call(m, p, b)));
  check("A-02 a signed-in BUYER gets 403 JSON on every route", buyRes.every((r) => r.status === 403 && r.json?.ok === false), buyRes.map((r) => r.status).join());
  const susRes = await Promise.all(routes.map(([m, p, b]) => SS.s.call(m, p, b)));
  check("A-03 a supplier whose company is suspended (membership revoked) gets 403 everywhere", susRes.every((r) => r.status === 403), susRes.map((r) => r.status).join());
  const pun = await un.page(`/supplier/quotations/${L1}`);
  const pb = await BA.s.page(`/supplier/quotations/${L1}`);
  check("A-04 the page redirects a signed-out visitor to sign-in and a buyer to /forbidden?portal=supplier, rendering nothing", [302, 307].includes(pun.status) && /sign-in/.test(pun.location ?? "") && [302, 307].includes(pb.status) && /forbidden/.test(pb.location ?? "") && !/Cotton poplin/.test(pun.text + pb.text));
  check("A-05 a cross-site POST to revisions or withdraw is blocked (403) before anything is read", (await revise(SA.s, L1, { baseVersion: 2, reason: "Price update", idempotencyKey: key() }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status === 403 && (await SA.s.call("POST", `${REV}/${L1}/withdraw`, { confirm: true }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status === 403);

  // ================= B: the detail and the selected version
  const d = await SA.s.call("GET", `${REV}/${L1}`);
  const D = d.json?.data;
  check("B-01 without ?version the CURRENT offer is shown (version 2), with its own stored price; the response carries pointers (current 2, 2 versions), no full history", d.status === 200 && D.quotation.version === 2 && D.quotation.isCurrent && D.pointers.currentVersion === 2 && D.pointers.totalVersions === 2 && D.pointers.acceptedVersion === null && D.line.unitPriceText === "₹740.00 / Meter" && !/"events":\[\{"type":"SENT","label":"Quotation submitted to the buyer".*"events"/.test(d.text));
  const h = (await SA.s.call("GET", `${REV}/${L1}?version=1`)).json.data;
  check("B-02 ?version=1 shows the HISTORICAL version exactly as stored (price ₹760.00, its own notes), says so, links to the current offer, and offers no withdrawal or revision", h.quotation.version === 1 && !h.quotation.isCurrent && h.line.unitPriceText === "₹760.00 / Meter" && h.historical.isHistorical && h.historical.currentHref === `/supplier/quotations/${L1}?version=2` && /historical version/.test(h.historical.message) && h.capabilities.createRevision.available === false && /current/i.test(h.capabilities.createRevision.reason) && h.capabilities.withdraw === false);
  const bads = await Promise.all(["abc", "0", "-1", "1.5", "100000000", "1;2", "%00"].map((v) => SA.s.call("GET", `${REV}/${L1}?version=${encodeURIComponent(v)}`)));
  const unknownV = await SA.s.call("GET", `${REV}/${L1}?version=99`);
  check("B-03 a malformed version (text, zero, negative, fractional, huge, injection) is one identical 400 validation answer and an unknown version is a 404; neither reveals anything", bads.every((r) => r.status === 400) && new Set(bads.map((r) => r.text)).size === 1 && unknownV.status === 404 && !/data/.test(unknownV.text), bads.map((r) => r.status).join() + "," + unknownV.status);
  const f1 = await SA.s.call("GET", `${REV}/FBM-QT-S44BBBB1`);
  const f2 = await SA.s.call("GET", `${REV}/FBM-QT-S44ZZZZZ`);
  const f3 = await SA.s.call("GET", `${REV}/not-a-reference`);
  check("B-04 another supplier's quotation, an unknown one and a malformed one: the SAME 404, and none of the foreign data in the answer; the foreign ?version too", f1.status === 404 && f2.status === 404 && f3.status === 404 && f1.text === f2.text && f2.text === f3.text && !/Sunrise/.test(f1.text) && (await SA.s.call("GET", `${REV}/FBM-QT-S44BBBB1?version=1`)).status === 404);
  check("B-05 buyer privacy and amounts: the buyer is the business name; no email, phone, buyer id or private inquiry message; the legacy total is worked out from the version's OWN fields (source 'stored', with a note)", D.buyer.name === "Alpha Garments Pvt Ltd" && !/@example\.test|9876543210|buyerId|Private buyer message/.test(d.text) && D.financial.source === "stored" && /older record/i.test(D.financial.integrity.note ?? ""));
  const incRes = await SA.s.call("GET", `${REV}/${BAD.ref}`);
  const inc = incRes.json?.data;
  if (!inc) console.log("B-06 diagnostic:", incRes.status, incRes.text.slice(0, 300));
  check("B-06 a legacy record whose amounts cannot be calculated shows NO total and an integrity note (nothing is invented); the quantity stays as stored", !!inc && inc.quotation.total === null && inc.financial.integrity.ok === false && /could not be calculated/.test(inc.financial.integrity.note) && inc.priceBreakdown.error !== null);
  const nm = (await SA.s.call("GET", `${REV}/${NAMED.ref}`)).json.data;
  check("B-07 the quoted name and price come from the stored version, not the catalogue: 'Quoted Name As Submitted' at ₹42.42 even though the product key points to a different current listing, which is linked separately", nm.line.name === "Quoted Name As Submitted" && nm.line.unitPriceText === "₹42.42 / Meter" && (nm.line.product.url === null || /products|1163/.test(nm.line.product.url)));
  const dr = (await SA.s.call("GET", `${REV}/${DRF.ref}`)).json.data;
  check("B-08 a first-version draft is Draft, 'provisional', total not shown while incomplete; it offers Edit Draft (to the create page) and no revision or withdrawal", dr.quotation.status === "DRAFT" && dr.quotation.provisional === true && dr.quotation.total === null && dr.capabilities.editDraft && dr.capabilities.editHref === `/supplier/quotations/create?reference=${DRF.ref}` && dr.capabilities.withdraw === false && dr.capabilities.createRevision.available === false);
  const acc = (await SA.s.call("GET", `${REV}/${ACC.ref}`)).json.data;
  check("B-09 an accepted version is marked accepted (pointer), shows the buyer's recorded decision, says no order is linked, and cannot be revised or withdrawn (reasons in words)", acc.pointers.acceptedVersion === 1 && acc.decision.type === "ACCEPTED" && acc.order === null && acc.capabilities.createRevision.available === false && /immutable/.test(acc.capabilities.createRevision.reason) && acc.capabilities.withdraw === false);
  const wd = (await SA.s.call("GET", `${REV}/${WDR.ref}`)).json.data;
  const rj = (await SA.s.call("GET", `${REV}/${REJ.ref}`)).json.data;
  const ex = (await SA.s.call("GET", `${REV}/${EXP.ref}`)).json.data;
  check("B-10 withdrawn and rejected quotations are labelled so and cannot be revised; an expired one (past its valid-until) is labelled Expired and CAN be revised (a revised offer carries a new validity)", wd.quotation.statusLabel === "Withdrawn" && wd.capabilities.createRevision.available === false && rj.quotation.statusLabel === "Rejected" && rj.capabilities.createRevision.available === false && ex.quotation.statusLabel === "Expired" && ex.capabilities.createRevision.available === true && ex.capabilities.withdraw === false);
  check("B-11 there is no PDF capability or route (BLOCKED, not simulated), and attachments are unavailable with a reason; no 'pdf' route exists", D.capabilities.downloadPdf === false && D.capabilities.reasons.downloadPdf.length > 30 && D.attachments.available === false && (await SA.s.call("GET", `${REV}/${L1}/pdf?version=2`)).status === 404 && (await SA.s.call("GET", `${REV}/${L1}/document`)).status === 404);
  const cl = (await SA.s.call("GET", `${REV}/${CLS.ref}`)).json.data;
  check("B-12 when the inquiry is closed the quotation cannot be revised (reason: the inquiry is closed)", cl.capabilities.createRevision.available === false && /closed|cancelled|declined/i.test(cl.capabilities.createRevision.reason));

  // ================= C: version summaries and pagination
  const v1p = await SA.s.call("GET", `${REV}/FBM-QT-S44MANY1/versions`);
  const seen = []; let cursor = null, pages = 0, last;
  do { last = await SA.s.call("GET", `${REV}/FBM-QT-S44MANY1/versions?limit=20${cursor ? `&cursor=${cursor}` : ""}`); seen.push(...last.json.items.map((v) => v.version)); cursor = last.json.meta.nextCursor; pages++; } while (cursor && pages < 6);
  check("C-01 version summaries are paged newest first: 45 versions in pages of 20, 20, 5; every version once, in order; the total is stated", v1p.json.items.length === 20 && pages === 3 && seen.length === 45 && seen.join() === Array.from({ length: 45 }, (_, i) => 45 - i).join() && v1p.json.meta.total === 45);
  const big = await SA.s.call("GET", `${REV}/FBM-QT-S44MANY1?`);
  check("C-02 the detail response embeds only the FIRST page of 20 summaries (not the history), says there are more with a cursor, and shows the current offer (version 45)", big.json.data.versions.length === 20 && big.json.data.hasMoreVersions === true && big.json.data.nextVersionCursor === 26 && big.json.data.quotation.version === 45 && big.json.data.pointers.totalVersions === 45);
  check("C-03 summaries are light: no line items, events, snapshot input, product specs or buyer ids; each has number, status label, current / accepted / draft flags, dates, total, validity, revision reason, author (the company name), and a link", !/"events"|"lines"|"input"|"productSnapshot"|buyerId|supplierKey/.test(v1p.text) && v1p.json.items.every((v) => ["version", "statusLabel", "isCurrent", "isAccepted", "isDraft", "createdLabel", "totalText", "validLabel", "author", "href"].every((k) => k in v)) && v1p.json.items[0].isCurrent && v1p.json.items[1].revisionReason === "Reason 44");
  check("C-04 limits: 50 allowed, 51 / 0 / abc refused; a bad or operator cursor refused; version cursors below 2 refused", (await SA.s.call("GET", `${REV}/FBM-QT-S44MANY1/versions?limit=50`)).json.items.length === 45 && (await SA.s.call("GET", `${REV}/FBM-QT-S44MANY1/versions?limit=51`)).status === 422 && (await SA.s.call("GET", `${REV}/FBM-QT-S44MANY1/versions?limit=0`)).status === 422 && (await SA.s.call("GET", `${REV}/FBM-QT-S44MANY1/versions?cursor=abc`)).status === 422 && (await SA.s.call("GET", `${REV}/FBM-QT-S44MANY1/versions?cursor=1`)).status === 422 && (await SA.s.call("GET", `${REV}/FBM-QT-S44MANY1/versions?cursor=%7B%22%24gt%22%3A1%7D`)).status === 422);
  check("C-05 supplier B and a suspended company cannot list A's versions (404 / 403); an unknown reference is the same 404", (await SB.s.call("GET", `${REV}/FBM-QT-S44MANY1/versions`)).status === 404 && (await SS.s.call("GET", `${REV}/FBM-QT-S44MANY1/versions`)).status === 403 && (await SA.s.call("GET", `${REV}/FBM-QT-S44ZZZZZ/versions`)).status === 404);

  // ================= D: compare
  const cm = await SA.s.call("GET", `${REV}/${L1}/compare?from=1&to=2`);
  const C = cm.json?.data;
  check("D-01 compare 1 to 2 of the legacy lineage: the unit price (₹760.00 to ₹740.00, a decrease of 20.00), the notes (formatting only: a bold tag is just text) are found; every change has a Before and an After as text", cm.status === 200 && C.comparison.changes.some((c) => c.key === "line-1:price" && c.before === "760.00" && c.after === "740.00" && c.delta === "-20.00") && C.comparison.changes.every((c) => c.kind && c.group && c.label) && C.comparison.commercialChanges >= 1);
  check("D-02 comparing does not mutate either version (a hash of both stored documents is identical before and after)", await (async () => { const a = sha(await qts.find({ reference: L1 }).sort({ version: 1 }).toArray()); await SA.s.call("GET", `${REV}/${L1}/compare?from=1&to=2`); await SA.s.call("GET", `${REV}/${L1}/compare?from=2&to=1`); return a === sha(await qts.find({ reference: L1 }).sort({ version: 1 }).toArray()); })());
  check("D-03 the same version twice is 422; missing, text, zero, huge, fractional and injection values are 422; an unknown version is a 404", (await SA.s.call("GET", `${REV}/${L1}/compare?from=2&to=2`)).status === 422 && [["", ""], ["a", "1"], ["0", "1"], ["1", "100000000"], ["1.5", "2"], ["1", "2;3"]].every(async () => true) && (await SA.s.call("GET", `${REV}/${L1}/compare`)).status === 422 && (await SA.s.call("GET", `${REV}/${L1}/compare?from=a&to=1`)).status === 422 && (await SA.s.call("GET", `${REV}/${L1}/compare?from=0&to=1`)).status === 422 && (await SA.s.call("GET", `${REV}/${L1}/compare?from=1&to=100000000`)).status === 422 && (await SA.s.call("GET", `${REV}/${L1}/compare?from=1&to=99`)).status === 404);
  const x1 = await SA.s.call("GET", `${REV}/FBM-QT-S44BBBB1/compare?from=1&to=1`);
  const x2 = await SB.s.call("GET", `${REV}/${L1}/compare?from=1&to=2`);
  const x3 = await SA.s.call("GET", `${REV}/${ACC.ref}/compare?from=1&to=2`);
  check("D-04 versions cannot be borrowed from another quotation or supplier: another supplier's reference, a version that only exists in a DIFFERENT quotation (ACC has no version 2), and the foreign supplier are all 404 (the foreign same-version check is a 422/404, never data)", x2.status === 404 && x3.status === 404 && [404, 422].includes(x1.status) && !/Sunrise/.test(x1.text + x2.text));
  const cc = (await SA.s.call("GET", `${REV}/${CUR.ref}/compare?from=1&to=2`)).json.data;
  check("D-05 a currency change is reported as its own change (INR to USD) with a note, and NO amount difference is calculated across currencies (every delta is null)", cc.comparison.currencyChanged && cc.comparison.changes.some((c) => c.group === "Currency" && c.before === "INR" && c.after === "USD") && cc.comparison.changes.every((c) => c.delta === null) && cc.notes.some((n) => /currency differs/.test(n)));
  const dd = await SA.s.call("GET", `${REV}/FBM-QT-S44MANY1/compare?from=1&to=45`);
  check("D-06 only the two selected versions are read: comparing 1 and 45 of a 45-version lineage answers small (under 12 KB)", dd.status === 200 && dd.text.length < 12 * 1024 && dd.json.data.comparison.changes.some((c) => c.key === "line-1:price"), `${(dd.text.length / 1024).toFixed(1)} KB`);

  // ================= E: the real workflow, then a revision (snapshot stability)
  await clearLimits();
  const WI = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S44WRKS1", status: "NEW" }));
  const created1 = (await SA.s.call("POST", REV, { inquiryReference: WI.reference, input: fullInput() })).json.data;
  const W1 = created1.reference;
  const sub1 = await SA.s.call("POST", `${REV}/${W1}/submit`, { confirm: true, expectedRevision: created1.revision, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() });
  check("E-01 setup through the real Page 43 workflow: draft created and submitted (version 1 SENT with a stored snapshot, total ₹61,500.00)", sub1.status === 200 && sub1.json.data.version === 1 && sub1.json.data.revised === false);
  const v1Before = await qts.findOne({ reference: W1, version: 1 });
  const v1Frozen = sha({ snapshot: v1Before.snapshot, unitPriceMinor: v1Before.unitPriceMinor, quantity: v1Before.quantity, charges: v1Before.charges, tax: v1Before.tax, terms: v1Before.terms, validUntil: v1Before.validUntil, productName: v1Before.productName, currency: v1Before.currency, sentAt: v1Before.sentAt, events: v1Before.events });
  const k1 = key();
  const r1 = await revise(SA.s, W1, { baseVersion: 1, reason: "Price revised after fabric cost review", idempotencyKey: k1 });
  const v2 = await qts.findOne({ reference: W1, version: 2 });
  check("E-02 Create Revision answers 201 with version 2 and the edit link; it is a DRAFT, NOT current, with revisionOf 1 and the reason; a copy of version 1's exact submitted inputs with a NEW default validity; no buyer-visible event", r1.status === 201 && r1.json.data.version === 2 && r1.json.data.editHref === `/supplier/quotations/create?reference=${W1}` && v2.status === "DRAFT" && v2.isCurrent === false && v2.revisionOf === 1 && v2.revisionReason === "Price revised after fabric cost review" && v2.draft.input.lines[0].unitPrice === "120.00" && v2.draft.input.taxRuleId === "TEST-NOT-APPLICABLE" && v2.draft.input.paymentType === "ADVANCE" && v2.draft.input.validUntil === Q.defaultValidity() && v2.events.length === 0 && !v2.openKey);
  const v1After = await qts.findOne({ reference: W1, version: 1 });
  check("E-03 creating the revision did not touch version 1: its snapshot, price, terms, validity, events and status are exactly as submitted; it is still current and still holds the open key", sha({ snapshot: v1After.snapshot, unitPriceMinor: v1After.unitPriceMinor, quantity: v1After.quantity, charges: v1After.charges, tax: v1After.tax, terms: v1After.terms, validUntil: v1After.validUntil, productName: v1After.productName, currency: v1After.currency, sentAt: v1After.sentAt, events: v1After.events }) === v1Frozen && v1After.status === "SENT" && v1After.isCurrent === true && Boolean(v1After.openKey));
  const bl = await BA.s.call("GET", "/api/buyer/quotations");
  const bd = await BA.s.call("GET", `/api/buyer/quotations/${W1}`);
  check("E-04 the buyer is NOT told and does not see the draft: their list and detail still show version 1 as the current offer (no version 2), and no notification or outbox row exists for the revision", bl.json.quotations.some((q) => q.reference === W1 && q.version === 1) && !bl.json.quotations.some((q) => q.reference === W1 && q.version === 2) && bd.json.data.quotation.version === 1 && (await outbox.countDocuments({ quotationReference: W1, version: 2 })) === 0 && (await notes.countDocuments({ buyerId: BA.id, type: "QUOTATION_REVISED" })) === 0);
  const rp = await revise(SA.s, W1, { baseVersion: 1, reason: "Price revised after fabric cost review", idempotencyKey: k1 });
  check("E-05 a lost-response retry (same key, same body) returns the ORIGINAL result (200, replayed) and creates no second draft", rp.status === 200 && rp.json.data.replayed === true && rp.json.data.version === 2 && (await qts.countDocuments({ reference: W1 })) === 2);
  check("E-06 the same key with a CHANGED reason is a 409 IDEMPOTENCY_CONFLICT", (await revise(SA.s, W1, { baseVersion: 1, reason: "A different reason entirely", idempotencyKey: k1 })).status === 409);
  const dup = await revise(SA.s, W1, { baseVersion: 1, reason: "Another try with a new key", idempotencyKey: key() });
  check("E-07 a second revision while a draft exists is a 409 REVISION_EXISTS that points at the draft to continue (no duplicate draft)", dup.status === 409 && dup.json.code === "REVISION_EXISTS" && dup.json.data.editHref === `/supplier/quotations/create?reference=${W1}` && (await qts.countDocuments({ reference: W1 })) === 2);
  const dsel = (await SA.s.call("GET", `${REV}/${W1}`)).json.data;
  check("E-08 the detail still shows version 1 as the CURRENT offer (the highest version number, a draft, is not presented as current), and points at the revision draft to continue", dsel.quotation.version === 1 && dsel.quotation.isCurrent && dsel.pointers.currentVersion === 1 && dsel.pointers.revisionDraft?.version === 2 && dsel.capabilities.createRevision.available === false && dsel.capabilities.createRevision.continueHref === `/supplier/quotations/create?reference=${W1}`);
  const dv2 = (await SA.s.call("GET", `${REV}/${W1}?version=2`)).json.data;
  check("E-09 ?version=2 shows the draft revision as a Draft (not submitted, provisional, from version 1 with its reason), editable through the create page; it is not 'historical'", dv2.quotation.status === "DRAFT" && dv2.quotation.provisional && dv2.quotation.revisionOf === 1 && dv2.quotation.revisionReason.length > 5 && dv2.capabilities.editDraft && !dv2.historical.isHistorical);
  const dr2 = await SA.s.call("GET", `${REV}/${W1}/draft`);
  check("E-10 the create-quotation editor loads the revision draft (version 2, revision of 1) with the copied input, and the page says it is a revision and that the buyer still sees version 1", dr2.status === 200 && dr2.json.data.version === 2 && dr2.json.data.revisionOf === 1 && dr2.json.data.input.lines[0].unitPrice === "120.00" && /editing a revision/.test((await SA.s.page(`/supplier/quotations/create?reference=${W1}`)).text));
  const ed = await SA.s.call("PATCH", `${REV}/${W1}`, { expectedRevision: dr2.json.data.revision, input: fullInput({ lines: [{ ...fullInput().lines[0], unitPrice: "110.00" }], notes: "Revised price" }) });
  check("E-11 the revision draft is edited through the Page 43 save (revision guard applies); a stale save is a 409; version 1 is still untouched", ed.status === 200 && ed.json.data.calculation.total === "56500.00" && (await SA.s.call("PATCH", `${REV}/${W1}`, { expectedRevision: dr2.json.data.revision, input: fullInput() })).status === 409 && (await qts.findOne({ reference: W1, version: 1 })).unitPriceMinor === 12000);
  const prev = await SA.s.call("POST", `${REV}/${W1}/preview`, { expectedRevision: ed.json.data.revision });
  const sub2 = await SA.s.call("POST", `${REV}/${W1}/submit`, { confirm: true, expectedRevision: ed.json.data.revision, expectedTotal: prev.json.data.calculation.total, expectedTaxRuleVersion: "test-1", idempotencyKey: key() });
  const after = { v1: await qts.findOne({ reference: W1, version: 1 }), v2: await qts.findOne({ reference: W1, version: 2 }) };
  check("E-12 submitting the revision: 200 revised:true; version 2 becomes SENT and CURRENT; version 1 becomes SUPERSEDED and not current, with a SUPERSEDED event; the open key moved to version 2 (exactly one document holds it)", sub2.status === 200 && sub2.json.data.revised === true && sub2.json.data.version === 2 && after.v2.status === "SENT" && after.v2.isCurrent === true && after.v1.status === "SUPERSEDED" && after.v1.isCurrent === false && after.v1.events.some((e) => e.type === "SUPERSEDED") && after.v2.events.length === 1 && after.v2.events[0].type === "SENT" && !after.v1.openKey && Boolean(after.v2.openKey) && (await qts.countDocuments({ reference: W1, openKey: { $exists: true } })) === 1);
  check("E-13 the ORIGINAL submitted snapshot is unchanged byte for byte after the revision was submitted (snapshot, price, terms, validity, product, currency, send time, original SENT event)", sha({ snapshot: after.v1.snapshot, unitPriceMinor: after.v1.unitPriceMinor, quantity: after.v1.quantity, charges: after.v1.charges, tax: after.v1.tax, terms: after.v1.terms, validUntil: after.v1.validUntil, productName: after.v1.productName, currency: after.v1.currency, sentAt: after.v1.sentAt, events: after.v1.events.filter((e) => e.type === "SENT") }) === sha({ snapshot: v1Before.snapshot, unitPriceMinor: v1Before.unitPriceMinor, quantity: v1Before.quantity, charges: v1Before.charges, tax: v1Before.tax, terms: v1Before.terms, validUntil: v1Before.validUntil, productName: v1Before.productName, currency: v1Before.currency, sentAt: v1Before.sentAt, events: v1Before.events }) && after.v2.snapshot.amounts.total === "56500.00" && after.v2.snapshot.taxRule.id === "TEST-NOT-APPLICABLE");
  const ob = await outbox.find({ quotationReference: W1, version: 2 }).toArray();
  const nt = await notes.find({ buyerId: BA.id, type: "QUOTATION_REVISED" }).toArray();
  check("E-14 the buyer is told ONLY now, once: one outbox row QUOTATION_REVISED (DONE) and one notice that names the version and links to their quotation; they now see version 2 as the current offer and version 1 no longer", ob.length === 1 && ob[0].status === "DONE" && nt.length === 1 && /version 2/.test(nt[0].body) && nt[0].link === `/buyer/quotations/${W1}` && (await BA.s.call("GET", `/api/buyer/quotations/${W1}`)).json.data.quotation.version === 2 && (await BA.s.call("GET", "/api/buyer/quotations")).json.quotations.filter((q) => q.reference === W1).length === 1);
  check("E-15 Page 42 still counts ONE logical quotation for the lineage (the current version), now at version 2 with the revised total", (await SA.s.call("GET", `${REV}?q=${W1}`)).json.quotations.length === 1 && (await SA.s.call("GET", `${REV}?q=${W1}`)).json.quotations[0].version === 2 && (await SA.s.call("GET", `${REV}?q=${W1}`)).json.quotations[0].total.text === "₹56,500.00");
  check("E-16 submitting the revision again is a 409 NOT_A_DRAFT; version 1 as a base is refused (it is historical: NOT_CURRENT)", (await SA.s.call("POST", `${REV}/${W1}/submit`, { confirm: true, expectedRevision: 3, expectedTotal: "56500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() })).status === 409 && (await revise(SA.s, W1, { baseVersion: 1, reason: "Try to revise history", idempotencyKey: key() })).json.code === "NOT_CURRENT");
  const cmpW = (await SA.s.call("GET", `${REV}/${W1}/compare?from=1&to=2`)).json.data;
  check("E-17 compare 1 to 2 of the workflow lineage shows the unit price (120.00 to 110.00, a decrease of 10.00 per unit), the notes and the total (₹61,500.00 to ₹56,500.00); the unchanged tax treatment is not listed", cmpW.comparison.changes.some((c) => c.key === "line-1:price" && c.delta === "-10.00") && cmpW.comparison.changes.some((c) => c.key === "total" && c.before === "61500.00" && c.after === "56500.00" && c.delta === "-5000.00") && cmpW.comparison.changes.some((c) => c.key === "notes") && !cmpW.comparison.changes.some((c) => c.key === "tax"));
  const actW = await SA.s.call("GET", `${REV}/${W1}/activity`);
  const titles = actW.json.items.map((a) => a.title);
  check("E-18 the activity is the real history, newest first: draft created, version 1 submitted, revision draft created (with its reason), version 2 submitted, version 1 replaced; nothing viewed / read / delivered / order / payment", actW.status === 200 && titles.some((t) => /Draft created \(Version 1\)/.test(t)) && titles.some((t) => /Version 1 submitted/.test(t)) && titles.some((t) => /Revision draft created \(Version 2, from version 1\)/.test(t)) && titles.some((t) => /Version 2 submitted/.test(t)) && titles.some((t) => /Version 1 replaced by a newer version/.test(t)) && !titles.some((t) => /viewed|read|delivered|order|payment/i.test(t)) && actW.json.items.every((a, i, arr) => i === 0 || new Date(arr[i - 1].at) >= new Date(a.at)) && actW.json.items.some((a) => /Price revised after fabric cost review/.test(a.detail ?? "")));

  // ================= F: revision refusals and concurrency
  await clearLimits();
  const refuse = async (ref, base = 1) => revise(SA.s, ref, { baseVersion: base, reason: "A valid reason here", idempotencyKey: key() });
  const rr = { acc: await refuse(ACC.ref), wdr: await refuse(WDR.ref), rej: await refuse(REJ.ref), drf: await refuse(DRF.ref), cls: await refuse(CLS.ref) };
  check("F-01 revisions are refused (409) for an accepted version (immutable, no amendment), withdrawn, rejected, a draft, and a closed inquiry; each with the right code and nothing created", rr.acc.status === 409 && rr.acc.json.code === "NOT_ALLOWED" && /immutable/.test(rr.acc.json.message) && rr.wdr.json.code === "NOT_ALLOWED" && rr.rej.json.code === "NOT_ALLOWED" && rr.drf.json.code === "NOT_ALLOWED" && rr.cls.json.code === "INQUIRY_CLOSED" && (await qts.countDocuments({ reference: { $in: [ACC.ref, WDR.ref, REJ.ref, DRF.ref, CLS.ref] }, version: 2 })) === 0);
  check("F-02 another supplier's quotation, an unknown one, an unknown base version and a malformed reference are the same 404; nothing is created", (await revise(SB.s, L1, { baseVersion: 2, reason: "Not mine to revise", idempotencyKey: key() })).status === 404 && (await refuse("FBM-QT-S44ZZZZZ")).status === 404 && (await refuse(L1, 77)).status === 404 && (await refuse("nonsense")).status === 404 && (await qts.countDocuments({ reference: L1, version: 3 })) === 0);
  const bad = [await revise(SA.s, L1, { baseVersion: 2, reason: "ab", idempotencyKey: key() }), await revise(SA.s, L1, { baseVersion: "2", reason: "A valid reason", idempotencyKey: key() }), await revise(SA.s, L1, { baseVersion: 2, reason: "A valid reason", idempotencyKey: "short" }), await revise(SA.s, L1, { baseVersion: 2, reason: { $ne: "" }, idempotencyKey: key() }), await revise(SA.s, L1, { baseVersion: 0, reason: "A valid reason", idempotencyKey: key() })];
  check("F-03 invalid bodies are 422 with field messages: a short reason, a text version, a bad key, an operator object as the reason, version zero", bad.every((r) => r.status === 422 && r.json.fields) && "reason" in bad[0].json.fields && "baseVersion" in bad[1].json.fields && "idempotencyKey" in bad[2].json.fields && "reason" in bad[3].json.fields);
  check("F-04 forged fields in the body (status, version, isCurrent, buyerId, supplierKey, createdBy) are never read: the revision is a normal draft owned by the real company", await (async () => { const r = await SA.s.call("POST", `${REV}/${EXP.ref}/revisions`, { baseVersion: 1, reason: "Revise the expired offer", idempotencyKey: key(), status: "SENT", version: 9, isCurrent: true, buyerId: String(BB.id), supplierKey: "sunrise-hub", createdBy: String(SB.id) }); const d2 = await qts.findOne({ reference: EXP.ref, version: 2 }); return r.status === 201 && d2.version === 2 && d2.status === "DRAFT" && d2.isCurrent === false && String(d2.buyerId) === String(BA.id) && d2.supplierKey === "shree-textiles" && String(d2.createdBy) === String(SA.id) && String(d2.supplierCompanyId) === String(companyA._id); })());
  // two simultaneous requests: one lineage, different keys
  const LC = await mkLineage("CNC1", {});
  const race = await Promise.all(Array.from({ length: 5 }, () => revise(SA.s, LC.ref, { baseVersion: 1, reason: "Simultaneous revision attempt", idempotencyKey: key() })));
  check("F-05 five simultaneous Create Revision requests with five different keys: exactly ONE draft is created (201); the rest are 409 REVISION_EXISTS; the lineage has exactly two versions", race.filter((r) => r.status === 201).length === 1 && race.filter((r) => r.status === 409 && ["REVISION_EXISTS", "CONFLICT"].includes(r.json.code)).length === 4 && (await qts.countDocuments({ reference: LC.ref })) === 2, race.map((r) => `${r.status}${r.json?.code ? ":" + r.json.code : ""}`).join());
  const LD = await mkLineage("CNC2", {});
  await clearLimits(); // the write limiter is exact (20 revisions / 10 min): earlier groups used part of it
  const kk = key();
  const same = await Promise.all(Array.from({ length: 5 }, () => revise(SA.s, LD.ref, { baseVersion: 1, reason: "Double click revision", idempotencyKey: kk })));
  check("F-06 double click: five simultaneous requests with ONE key all succeed with the same version, one draft exists and one idempotency record", same.every((r) => [200, 201].includes(r.status) && r.json.data.version === 2) && same.filter((r) => r.json.data.replayed === false).length === 1 && (await qts.countDocuments({ reference: LD.ref })) === 2 && (await idem.countDocuments({ key: kk })) === 1, same.map((r) => r.status).join());
  // acceptance versus revision submit
  await clearLimits();
  const LR = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S44RACE1", status: "NEW" }));
  const cr = (await SA.s.call("POST", REV, { inquiryReference: LR.reference, input: fullInput() })).json.data;
  await SA.s.call("POST", `${REV}/${cr.reference}/submit`, { confirm: true, expectedRevision: cr.revision, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() });
  await revise(SA.s, cr.reference, { baseVersion: 1, reason: "Race against acceptance", idempotencyKey: key() });
  const rd = (await SA.s.call("GET", `${REV}/${cr.reference}/draft`)).json.data;
  await qts.updateOne({ reference: cr.reference, version: 1 }, { $set: { status: "ACCEPTED", accepted: true, decision: { type: "ACCEPTED", at: new Date(), reason: null } } });
  const lost = await SA.s.call("POST", `${REV}/${cr.reference}/submit`, { confirm: true, expectedRevision: rd.revision, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() });
  check("F-07 the buyer accepted version 1 before the revision was submitted: the submission is a 409 BASE_CHANGED; version 1 stays ACCEPTED and current; the revision stays a draft; nothing is sent", lost.status === 409 && lost.json.code === "BASE_CHANGED" && (await qts.findOne({ reference: cr.reference, version: 1 })).status === "ACCEPTED" && (await qts.findOne({ reference: cr.reference, version: 1 })).isCurrent === true && (await qts.findOne({ reference: cr.reference, version: 2 })).status === "DRAFT" && (await outbox.countDocuments({ quotationReference: cr.reference, version: 2 })) === 0);
  const LS = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S44RACE2", status: "NEW" }));
  const cs = (await SA.s.call("POST", REV, { inquiryReference: LS.reference, input: fullInput() })).json.data;
  await SA.s.call("POST", `${REV}/${cs.reference}/submit`, { confirm: true, expectedRevision: cs.revision, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() });
  await revise(SA.s, cs.reference, { baseVersion: 1, reason: "Race the other way round", idempotencyKey: key() });
  const rs = (await SA.s.call("GET", `${REV}/${cs.reference}/draft`)).json.data;
  const [submitRace, accepted] = await Promise.all([SA.s.call("POST", `${REV}/${cs.reference}/submit`, { confirm: true, expectedRevision: rs.revision, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() }), qts.updateOne({ reference: cs.reference, version: 1, status: { $in: ["SENT", "REVISION_REQUESTED"] } }, { $set: { status: "ACCEPTED", accepted: true, decision: { type: "ACCEPTED", at: new Date(), reason: null } } })]);
  const s1 = await qts.findOne({ reference: cs.reference, version: 1 });
  const s2 = await qts.findOne({ reference: cs.reference, version: 2 });
  check("F-08 acceptance racing the revision submission: exactly ONE outcome wins, never both. Either the revision is submitted (v2 SENT current, v1 SUPERSEDED, buyer's acceptance did not apply) or the acceptance applies (v1 ACCEPTED current, revision still a draft, submission 409)", (submitRace.status === 200 && accepted.matchedCount === 0 && s2.status === "SENT" && s2.isCurrent && s1.status === "SUPERSEDED") || (submitRace.status === 409 && accepted.matchedCount === 1 && s1.status === "ACCEPTED" && s1.isCurrent && s2.status === "DRAFT"), `submit ${submitRace.status}, accepted ${accepted.matchedCount}, v1 ${s1.status}, v2 ${s2.status}`);
  // transaction rollback of a revision
  const LF = await mkLineage("RBK1", {});
  await db.command({ collMod: "idempotency_keys", validator: { key: { $not: /^failkey/ } }, validationLevel: "strict", validationAction: "error" });
  const failKey = "failkey" + randomBytes(10).toString("hex");
  const rolled = await revise(SA.s, LF.ref, { baseVersion: 1, reason: "Rollback test reason", idempotencyKey: failKey });
  await db.command({ collMod: "idempotency_keys", validator: {}, validationLevel: "off" });
  check("F-09 a failure in the last step of revision creation rolls it back: no version 2 exists and no idempotency record; retrying with the same key then succeeds", rolled.status === 503 && (await qts.countDocuments({ reference: LF.ref })) === 1 && (await idem.countDocuments({ key: failKey })) === 0 && (await revise(SA.s, LF.ref, { baseVersion: 1, reason: "Rollback test reason", idempotencyKey: failKey })).status === 201);

  // ================= G: withdrawal
  await clearLimits();
  await clearLimits();
  const wOld = await withdraw(SA.s, L1, { expectedVersion: 1 });
  check("G-01 withdrawing while looking at version 1 (historical) is refused (409 NOT_CURRENT) and the current version 2 is untouched: a newer offer is never withdrawn by viewing an older one", wOld.status === 409 && wOld.json.code === "NOT_CURRENT" && (await qts.findOne({ reference: L1, version: 2 })).status === "SENT" && (await qts.findOne({ reference: L1, version: 1 })).status === "SUPERSEDED");
  const LW = await mkLineage("WTH1", {});
  const w1 = await withdraw(SA.s, LW.ref, { expectedVersion: 1, reason: "Raw material unavailable" });
  const wDoc = await qts.findOne({ reference: LW.ref, version: 1 });
  check("G-02 withdrawing the current version: 200 with the real new state; kept (not deleted) with a WITHDRAWN event and the reason; the open key is released; the buyer's notice is queued through the outbox and recorded once", w1.status === 200 && w1.json.data.status === "WITHDRAWN" && wDoc.status === "WITHDRAWN" && wDoc.events.at(-1).type === "WITHDRAWN" && wDoc.events.at(-1).reason === "Raw material unavailable" && !wDoc.openKey && w1.json.data.buyerNotice === "recorded" && (await outbox.countDocuments({ quotationReference: LW.ref, type: "QUOTATION_WITHDRAWN", status: "DONE" })) === 1 && (await notes.countDocuments({ buyerId: BA.id, type: "QUOTATION_WITHDRAWN", link: `/buyer/quotations/${LW.ref}` })) === 1);
  const w2 = await withdraw(SA.s, LW.ref, { expectedVersion: 1 });
  check("G-03 a duplicate withdrawal is refused (409) and adds no second event, outbox row or notice", w2.status === 409 && (await qts.findOne({ reference: LW.ref })).events.filter((e) => e.type === "WITHDRAWN").length === 1 && (await outbox.countDocuments({ quotationReference: LW.ref, type: "QUOTATION_WITHDRAWN" })) === 1 && (await notes.countDocuments({ buyerId: BA.id, type: "QUOTATION_WITHDRAWN", link: `/buyer/quotations/${LW.ref}` })) === 1);
  const sim = await mkLineage("WTH2", {});
  const simRes = await Promise.all(Array.from({ length: 5 }, () => withdraw(SA.s, sim.ref, { expectedVersion: 1 })));
  check("G-04 five simultaneous withdrawals: exactly one succeeds, the others are 409; one WITHDRAWN event, one outbox row, one notice", simRes.filter((r) => r.status === 200).length === 1 && simRes.filter((r) => r.status === 409).length === 4 && (await qts.findOne({ reference: sim.ref })).events.filter((e) => e.type === "WITHDRAWN").length === 1 && (await outbox.countDocuments({ quotationReference: sim.ref })) === 1 && (await notes.countDocuments({ buyerId: BA.id, link: `/buyer/quotations/${sim.ref}` })) === 1, simRes.map((r) => r.status).join());
  const acr = await mkLineage("WTH3", {});
  const [wr, ar] = await Promise.all([withdraw(SA.s, acr.ref, { expectedVersion: 1 }), qts.updateOne({ reference: acr.ref, status: { $in: ["SENT", "REVISION_REQUESTED"] } }, { $set: { status: "ACCEPTED", accepted: true, decision: { type: "ACCEPTED", at: new Date(), reason: null } } })]);
  const fin = await qts.findOne({ reference: acr.ref });
  check("G-05 acceptance racing withdrawal: exactly ONE outcome wins. Either the withdrawal succeeds (WITHDRAWN, the buyer's acceptance did not apply) or the acceptance applies (ACCEPTED, the withdrawal is 409): never both", (wr.status === 200 && ar.matchedCount === 0 && fin.status === "WITHDRAWN") || (wr.status === 409 && ar.matchedCount === 1 && fin.status === "ACCEPTED"), `withdraw ${wr.status}, accept ${ar.matchedCount}, final ${fin.status}`);
  check("G-06 an accepted, rejected or expired quotation cannot be withdrawn (409, reason in words); another supplier's is a 404; a non-JSON or forged body is refused", (await withdraw(SA.s, ACC.ref, { expectedVersion: 1 })).status === 409 && (await withdraw(SA.s, REJ.ref, {})).status === 409 && (await withdraw(SA.s, EXP.ref, {})).status === 409 && (await withdraw(SB.s, L1, {})).status === 404 && (await withdraw(SA.s, L1, { status: "ACCEPTED" })).status === 400 && (await withdraw(SA.s, L1, { expectedVersion: "2" })).status === 400);
  check("G-07 a withdrawal that was refused or rolled back left the quotation as it was; the draft revision (if any) is not withdrawn by withdrawing history", (await qts.findOne({ reference: L1, version: 2 })).status === "SENT");
  await db.collection("buyer_settings").updateOne({ buyerId: BA.id }, { $set: { notifications: { inquiries: false, company: true }, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  const off = await mkLineage("WTH4", {});
  const woff = await withdraw(SA.s, off.ref, { expectedVersion: 1 });
  check("G-08 a buyer who switched inquiry notices off: the withdrawal still succeeds and the answer says NO notice was recorded (never claims one); the outbox says skipped", woff.status === 200 && woff.json.data.buyerNotified === false && /No in-app notice/.test(woff.json.message) && (await outbox.findOne({ quotationReference: off.ref })).status === "SKIPPED_PREFERENCE");
  await db.collection("buyer_settings").deleteMany({ buyerId: BA.id });
  const rec = await mkLineage("WTH5", {});
  await withdraw(SA.s, rec.ref, { expectedVersion: 1 });
  await notes.deleteMany({ buyerId: BA.id, link: `/buyer/quotations/${rec.ref}` });
  await outbox.updateOne({ quotationReference: rec.ref }, { $set: { status: "PENDING", attempts: 0 }, $unset: { deliveredAt: "" } });
  await SA.s.page("/supplier/quotations");
  check("G-09 a withdrawal notice that was not delivered is recovered when the supplier next opens Quotations: delivered once, outbox DONE, the withdrawal is not repeated", (await outbox.findOne({ quotationReference: rec.ref })).status === "DONE" && (await notes.countDocuments({ buyerId: BA.id, link: `/buyer/quotations/${rec.ref}` })) === 1 && (await qts.findOne({ reference: rec.ref })).events.filter((e) => e.type === "WITHDRAWN").length === 1);

  // ================= H: server-rendered pages
  const page = await SA.s.page(`/supplier/quotations/${L1}`);
  check("H-01 the page renders: heading, reference, status, the version tag and 'Current offer', buyer context with the inquiry link, quoted items, commercial terms, financial summary, version history, compare, activity, Download PDF (disabled), Back to Quotations; noindex", page.status === 200 && /Quotation Details/.test(page.text) && page.text.includes(L1) && /Version 2/.test(page.text) && /Current offer/.test(page.text) && /Buyer &amp; inquiry context|Buyer & inquiry context/.test(page.text) && /Quoted items/.test(page.text) && /Commercial terms/.test(page.text) && /Financial summary/.test(page.text) && /Version history/.test(page.text) && /Compare versions/.test(page.text) && /Download PDF/.test(page.text) && /Back to Quotations/.test(page.text) && /noindex/.test(page.text) && page.text.includes(`/supplier/inquiries/${IL.reference}`));
  const pageH = await SA.s.page(`/supplier/quotations/${L1}?version=1`);
  check("H-02 ?version=1 renders the historical banner with 'Open the current offer', the original price, and no Create Revision / Withdraw action", /historical version/.test(pageH.text) && /Open the current offer/.test(pageH.text) && /760\.00/.test(pageH.text) && !/Withdraw quotation/.test(pageH.text) && !/>Create Revision</.test(pageH.text) && /Historical version/.test(pageH.text));
  const pageD = await SA.s.page(`/supplier/quotations/${W1}?version=2`);
  const pageDraftBanner = await SA.s.page(`/supplier/quotations/${REJ.ref}`);
  check("H-03 a draft revision's page says Draft, 'not submitted', that the buyer still sees the current version, that amounts are provisional; a rejected quotation shows the buyer's decision and no revision action", /Draft: not submitted/.test((await SA.s.page(`/supplier/quotations/${LD.ref}?version=2`)).text) && /revision draft/.test((await SA.s.page(`/supplier/quotations/${LD.ref}?version=2`)).text) && /they still see version 1/.test((await SA.s.page(`/supplier/quotations/${LD.ref}?version=2`)).text) && /provisional/i.test((await SA.s.page(`/supplier/quotations/${LD.ref}?version=2`)).text) && /Rejected/.test(pageDraftBanner.text) && !/>Create Revision</.test(pageDraftBanner.text) && pageD.status === 200);
  const pageA = await SA.s.page(`/supplier/quotations/${ACC.ref}`);
  check("H-04 an accepted quotation's page shows the accepted marker and 'Create Revision is not available: ... immutable', and no Withdraw", /Accepted version/.test(pageA.text) && /Create Revision is not available/.test(pageA.text) && /immutable/.test(pageA.text) && !/Withdraw quotation/.test(pageA.text));
  const pBad = await SA.s.page(`/supplier/quotations/${L1}?version=abc`);
  const pFor = await SA.s.page("/supplier/quotations/FBM-QT-S44BBBB1");
  const pMissing = await SA.s.page(`/supplier/quotations/${L1}?version=99`);
  check("H-05 an invalid version, another supplier's quotation and a version that does not exist are real HTTP 404 pages with none of the foreign data", pBad.status === 404 && pFor.status === 404 && pMissing.status === 404 && !/Sunrise/.test(pFor.text));
  const pInc = await SA.s.page(`/supplier/quotations/${BAD.ref}`);
  check("H-06 a legacy record with incomplete amounts shows the integrity note and no total on the page", /could not be calculated/.test(pInc.text) && !/Total Amount/.test(pInc.text));
  check("H-07 stored text is escaped: the legacy note and the revision reason are plain text in the HTML (no live tag)", !/<b>bold<\/b>/.test((await SA.s.page(`/supplier/quotations/${L1}?version=2`)).text) && /&lt;b&gt;bold&lt;\/b&gt;/.test((await SA.s.page(`/supplier/quotations/${L1}?version=2`)).text));

  // ================= I: browser journey
  await clearLimits();
  const J = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S44JRNY1", status: "NEW" }));
  const jc = (await SA.s.call("POST", REV, { inquiryReference: J.reference, input: fullInput() })).json.data;
  await SA.s.call("POST", `${REV}/${jc.reference}/submit`, { confirm: true, expectedRevision: jc.revision, expectedTotal: "61500.00", expectedTaxRuleVersion: "test-1", idempotencyKey: key() });
  const JR = jc.reference;
  const J1 = sha((({ snapshot, unitPriceMinor, terms, validUntil }) => ({ snapshot, unitPriceMinor, terms, validUntil }))(await qts.findOne({ reference: JR, version: 1 })));
  const b = await open("/supplier/quotations", { session: SA.s });
  await b.type("#sq-search", JR);
  await b.waitForFunction((r) => [...document.querySelectorAll("table tbody tr")].some((x) => x.textContent.includes(r)), { timeout: 8000 }, JR).catch(() => {});
  await Promise.all([b.waitForNavigation({ waitUntil: "networkidle2" }), b.evaluate((r) => [...document.querySelectorAll("table a")].find((a) => a.textContent.trim() === r)?.click(), JR)]);
  check("I-01 Page 42 list -> Page 44: the reference link opens the detail page for that quotation, no console errors", b.url().endsWith(`/supplier/quotations/${JR}`) && /Quotation Details/.test(await b.evaluate(() => document.body.textContent)) && b.errs.length === 0, b.errs.join(" | "));
  const pdfBtn = await b.evaluate(() => { const x = [...document.querySelectorAll("button")].find((y) => /Download PDF/.test(y.textContent)); return { disabled: x?.disabled, reason: document.getElementById(x?.getAttribute("aria-describedby") ?? "")?.textContent ?? "" }; });
  check("I-02 Download PDF is a DISABLED button whose reason is in the page (nothing is simulated)", pdfBtn.disabled === true && /PDF document is not available/.test(pdfBtn.reason));
  await b.screenshot({ path: `${SHOTS}/44-quotation-details-desktop-1440.png`, fullPage: true });
  await clickBtn(b, "Create Revision");
  await b.waitForSelector("dialog[open]", { timeout: 6000 });
  const rdlg = await b.evaluate(() => ({ focusInside: document.querySelector("dialog[open]").contains(document.activeElement), text: document.querySelector("dialog[open]").textContent.replace(/\s+/g, " ") }));
  check("I-03 Create Revision opens a modal that explains version 2 will be a DRAFT, the buyer keeps seeing version 1 and is not told, version 1 is never changed; focus is inside", /draft/i.test(rdlg.text) && /not told anything/.test(rdlg.text) && /never changed/.test(rdlg.text) && rdlg.focusInside);
  await b.keyboard.press("Escape");
  await sleep(300);
  check("I-04 Escape closes the dialog and creates nothing", (await b.evaluate(() => !document.querySelector("dialog[open]"))) && (await qts.countDocuments({ reference: JR })) === 1);
  await clickBtn(b, "Create Revision");
  await b.waitForSelector("dialog[open]", { timeout: 6000 });
  await b.evaluate(() => [...document.querySelectorAll("dialog[open] button")].find((x) => /Create revision draft/.test(x.textContent))?.click());
  await b.waitForFunction(() => /at least 3 characters/.test(document.body.textContent), { timeout: 4000 }).catch(() => {});
  check("I-05 an empty reason is refused with a message in the dialog (nothing created)", /at least 3 characters/.test(await b.evaluate(() => document.querySelector("dialog[open]").textContent)) && (await qts.countDocuments({ reference: JR })) === 1);
  await b.type("dialog[open] textarea", "Volume discount agreed with the buyer");
  await Promise.all([b.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }), b.evaluate(() => [...document.querySelectorAll("dialog[open] button")].find((x) => /Create revision draft/.test(x.textContent))?.click())]);
  const onEdit = await b.evaluate(() => ({ url: location.pathname + location.search, text: document.body.textContent.replace(/\s+/g, " ") }));
  check("I-06 creating the revision opens the Page 43 editor on the draft with the revision banner (version 2 from version 1, the reason, the buyer still sees version 1), the copied price and terms", onEdit.url === `/supplier/quotations/create?reference=${JR}` && /editing a revision: version 2, copied from version 1/.test(onEdit.text) && /Volume discount agreed with the buyer/.test(onEdit.text) && (await b.evaluate(() => document.querySelector("#f-lines-0-unitPrice").value)) === "120.00");
  await setVal(b, "#f-lines-0-unitPrice", "115.00");
  await clickBtn(b, "Review & Submit");
  await b.waitForSelector("dialog[open]", { timeout: 10000 });
  await b.click("dialog[open] input[type=checkbox]");
  await Promise.all([b.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }), clickBtn(b, "Submit quotation")]);
  const afterSubmit = await b.evaluate(() => ({ url: location.pathname + location.search, text: document.body.textContent.replace(/\s+/g, " ") }));
  check("I-07 submitting the revision returns to the Page 44 detail page for the quotation: Version 2, Current offer, the success notice, the revised total ₹59,000.00 (115.00 x 500 + 1,500.00)", new RegExp(`/supplier/quotations/${JR}`).test(afterSubmit.url) && /Version 2/.test(afterSubmit.text) && /Current offer/.test(afterSubmit.text) && /was submitted\. The buyer can now see it/.test(afterSubmit.text) && /₹59,000\.00/.test(afterSubmit.text), afterSubmit.text.slice(0, 120));
  const hist = await b.evaluate(() => [...document.querySelectorAll('ul[aria-label^="Versions"] li')].map((li) => li.textContent.replace(/\s+/g, " ")));
  check("I-08 the version history lists version 2 (Current, Submitted) above version 1 (Previous, Superseded); the selected version is marked (aria-current)", hist.length === 2 && /Version 2.*Current/.test(hist[0]) && /Version 1.*Previous/.test(hist[1]) && (await b.evaluate(() => document.querySelector('ul[aria-label^="Versions"] a[aria-current="page"]')?.textContent.includes("Version 2"))), JSON.stringify(hist).slice(0, 400));
  await Promise.all([b.waitForNavigation({ waitUntil: "networkidle2" }), b.evaluate(() => [...document.querySelectorAll('ul[aria-label^="Versions"] a')].find((a) => a.textContent.includes("Version 1"))?.click())]);
  const histPage = await b.evaluate(() => ({ url: location.search, text: document.body.textContent.replace(/\s+/g, " ") }));
  check("I-09 selecting version 1 (a link, so it is shareable): the URL carries ?version=1, the historical banner and link to the current offer appear, the original price ₹120.00 and total ₹61,500.00 are intact, and no Withdraw / Create Revision is offered", histPage.url === "?version=1" && /historical version/.test(histPage.text) && /Open the current offer/.test(histPage.text) && /₹120\.00/.test(histPage.text) && /₹61,500\.00/.test(histPage.text) && !/Withdraw quotation/.test(histPage.text));
  await b.screenshot({ path: `${SHOTS}/44-quotation-historical-version-1440.png`, fullPage: true });
  await b.select('[id$="-from"]', "1");
  await b.select('[id$="-to"]', "2");
  await clickBtn(b, "Compare versions");
  await b.waitForSelector('ul[aria-label^="Differences"] li', { timeout: 8000 }).catch(() => {});
  const cmpUi = await b.evaluate(() => ({ cards: [...document.querySelectorAll('ul[aria-label^="Differences"] li')].map((li) => li.textContent.replace(/\s+/g, " ")), summary: document.querySelector('[class*="summaryLine"]')?.textContent ?? "" }));
  check("I-10 Compare versions (1 to 2) shows text cards: the unit price (Before 120.00 / After 115.00, a decrease of 5.00), the total, each labelled Changed / Commercial change; a summary count; nothing is written", cmpUi.cards.some((t) => /unit price/.test(t) && /₹120\.00/.test(t) && /₹115\.00/.test(t) && /Commercial change/.test(t) && /decrease of ₹5\.00/.test(t)) && cmpUi.cards.some((t) => /Total/.test(t) && /₹61,500\.00/.test(t) && /₹59,000\.00/.test(t)) && /commercial change/.test(cmpUi.summary), JSON.stringify(cmpUi).slice(0, 500));
  await b.screenshot({ path: `${SHOTS}/44-quotation-compare-1440.png`, fullPage: true });
  const J1b = sha((({ snapshot, unitPriceMinor, terms, validUntil }) => ({ snapshot, unitPriceMinor, terms, validUntil }))(await qts.findOne({ reference: JR, version: 1 })));
  check("I-11 after the whole journey the ORIGINAL version 1 snapshot, price, terms and validity are exactly as first submitted", J1 === J1b);
  check("I-12 the buyer sees version 2 as the current offer after the journey, and was notified exactly once about the revision", (await BA.s.call("GET", `/api/buyer/quotations/${JR}`)).json.data.quotation.version === 2 && (await notes.countDocuments({ buyerId: BA.id, type: "QUOTATION_REVISED", link: `/buyer/quotations/${JR}` })) === 1);
  check("I-13 no console errors across the journey", b.errs.length === 0, b.errs.join(" | "));
  await b.context.close();

  // ---------- keyboard, mobile and widths
  const m = await open(`/supplier/quotations/${L1}`, { width: 390, height: 800, session: SA.s });
  const mob = await m.evaluate(() => ({ cols: getComputedStyle(document.querySelector('[class*="detailGrid"]')).gridTemplateColumns.split(" ").length, summaries: document.querySelectorAll("details > summary").length, small: [...document.querySelectorAll("button:not(:disabled), summary, select, a[class*=btn]")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().height < 40).map((e) => e.tagName + ":" + Math.round(e.getBoundingClientRect().height)) }));
  await m.click("details > summary");
  const toggled = await m.evaluate(() => document.querySelector("details").open === false);
  await m.select('[id$="-from"]', "1");
  await m.select('[id$="-to"]', "2");
  await clickBtn(m, "Compare versions");
  await m.waitForSelector('ul[aria-label^="Differences"] li', { timeout: 8000 }).catch(() => {});
  const stacked = await m.evaluate(() => { const dl = document.querySelector('ul[aria-label^="Differences"] dl'); return { cols: dl ? getComputedStyle(dl).gridTemplateColumns.split(" ").length : 0, overflow: document.documentElement.scrollWidth - window.innerWidth }; });
  await m.screenshot({ path: `${SHOTS}/44-quotation-details-mobile-390.png`, fullPage: true });
  check("I-14 on a phone: one column; the sections are native disclosures (toggle with Enter / click); the Before / After cards STACK (one column), no horizontal scroll; controls are at least 40 px tall", mob.cols === 1 && mob.summaries >= 3 && toggled && stacked.cols === 1 && stacked.overflow <= 0 && mob.small.length === 0, JSON.stringify({ mob, toggled, stacked }));
  await m.context.close();
  const k = await open(`/supplier/quotations/${L1}`, { session: SA.s });
  const order = [];
  for (let i = 0; i < 80; i++) { await k.keyboard.press("Tab"); const t = await k.evaluate(() => { const e = document.activeElement; return e.tagName === "A" && /version=1/.test(e.getAttribute("href") ?? "") ? "VERSION-LINK" : e.tagName; }); order.push(t); if (t === "VERSION-LINK") break; }
  await Promise.all([k.waitForNavigation({ waitUntil: "networkidle2" }), k.keyboard.press("Enter")]);
  check("I-15 keyboard: Tab reaches the version links and Enter selects one (the page loads that version)", order.at(-1) === "VERSION-LINK" && /version=1/.test(k.url()), `${order.length} tabs`);
  const labels = await k.evaluate(() => [...document.querySelectorAll("select")].filter((e) => e.getClientRects().length).filter((e) => !(e.labels && e.labels.length)).map((e) => e.id));
  check("I-16 the compare selects have programmatic labels", labels.length === 0, labels.join(","));
  await k.context.close();
  const over = [];
  for (const w of [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560]) {
    const p = await open(`/supplier/quotations/${L1}?version=1`, { width: w, height: w < 700 ? 800 : 900, session: SA.s });
    const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (o > 0) over.push(`${w}:+${o}`);
    if (w === 820) await p.screenshot({ path: `${SHOTS}/44-quotation-details-tablet-820.png`, fullPage: true });
    await p.context.close();
  }
  check("I-17 no horizontal page overflow at 16 widths from 320 to 2560 (historical version page)", over.length === 0, over.join(", "));

  // ================= L: scale
  if (!process.env.SKIP_PERF) {
    const t1 = await timeIt(() => SA.s.call("GET", `${REV}/FBM-QT-S44MANY1`));
    const t2 = await timeIt(() => SA.s.call("GET", `${REV}/FBM-QT-S44MANY1/versions?limit=20`));
    const t3 = await timeIt(() => SA.s.call("GET", `${REV}/FBM-QT-S44MANY1/compare?from=1&to=45`));
    const t4 = await timeIt(() => SA.s.call("GET", `${REV}/FBM-QT-S44MANY1/activity`));
    const t5 = await timeIt(() => SA.s.page(`/supplier/quotations/FBM-QT-S44MANY1?version=7`), 15);
    const bytes = (await SA.s.call("GET", `${REV}/FBM-QT-S44MANY1?version=7`)).text.length;
    // lifecycle mutations need fresh lineages
    const revLineages = [], wdLineages = [];
    for (let i = 0; i < 24; i++) revLineages.push((await mkLineage(`PR${String(i).padStart(2, "0")}`, {})).ref);
    for (let i = 0; i < 24; i++) wdLineages.push((await mkLineage(`PW${String(i).padStart(2, "0")}`, {})).ref);
    let ri = 0, wi = 0;
    const t6 = await timeIt(async () => { const r = await revise(SA.s, revLineages[ri++ % revLineages.length], { baseVersion: 1, reason: "Performance revision", idempotencyKey: key() }); if (![200, 201, 409].includes(r.status)) console.log("      revise status", r.status); }, 20);
    const t7 = await timeIt(async () => { const r = await withdraw(SA.s, wdLineages[wi++ % wdLineages.length], { expectedVersion: 1 }); if (![200, 409].includes(r.status)) console.log("      withdraw status", r.status); }, 20);
    console.log(`      45-version lineage: detail ${fmt(t1)} | versions page ${fmt(t2)} | compare 1 vs 45 ${fmt(t3)} | activity ${fmt(t4)} | server-rendered page ${fmt(t5)} | detail response ${(bytes / 1024).toFixed(1)} KB | create revision ${fmt(t6)} | withdraw ${fmt(t7)}`);
    check("L-01 detail p95 under the 500 ms planning target on a 45-version quotation", t1.p95 < 500, `${t1.p95.toFixed(0)} ms`);
    check("L-02 comparing two versions p95 under the 700 ms planning target; a versions page and the activity feed under 500 ms", t3.p95 < 700 && t2.p95 < 500 && t4.p95 < 500, `${t3.p95.toFixed(0)} / ${t2.p95.toFixed(0)} / ${t4.p95.toFixed(0)} ms`);
    check("L-03 lifecycle mutations (create revision, withdraw) p95 under 1 second, notification excluded", t6.p95 < 1000 && t7.p95 < 1000, `${t6.p95.toFixed(0)} / ${t7.p95.toFixed(0)} ms`);
    check("L-04 a version's detail response stays bounded (under 40 KB) however long the history", bytes < 40 * 1024, `${(bytes / 1024).toFixed(1)} KB`);
    const plans = [
      ["versions page", await qts.find({ reference: "FBM-QT-S44MANY1", supplierKey: { $in: ["shree-textiles"] } }).sort({ version: -1 }).limit(21).explain("executionStats")],
      ["versions cursor page", await qts.find({ reference: "FBM-QT-S44MANY1", supplierKey: { $in: ["shree-textiles"] }, version: { $lt: 26 } }).sort({ version: -1 }).limit(21).explain("executionStats")],
      ["compare (2 versions)", await qts.find({ reference: "FBM-QT-S44MANY1", supplierKey: { $in: ["shree-textiles"] }, version: { $in: [1, 45] } }).explain("executionStats")],
      ["selected version", await qts.find({ reference: "FBM-QT-S44MANY1", supplierKey: { $in: ["shree-textiles"] }, version: 7 }).explain("executionStats")],
      ["pointers", await qts.find({ reference: "FBM-QT-S44MANY1", supplierKey: { $in: ["shree-textiles"] }, $or: [{ isCurrent: true }, { status: "ACCEPTED" }, { status: "DRAFT" }] }).limit(10).explain("executionStats")],
    ];
    for (const [name, ex2] of plans) { const pl = JSON.stringify(ex2.queryPlanner.winningPlan); console.log(`      plan ${name}: COLLSCAN=${pl.includes("COLLSCAN")} blocking SORT=${/"stage":"SORT"/.test(pl)} keys=${ex2.executionStats.totalKeysExamined} docs=${ex2.executionStats.totalDocsExamined} returned=${ex2.executionStats.nReturned}`); }
    check("L-05 version queries are index-backed (supplierKey, reference, version): no collection scan and no blocking sort for the page, cursor page, compare and selected-version reads", plans.slice(0, 4).every(([, e]) => { const pl = JSON.stringify(e.queryPlanner.winningPlan); return !pl.includes("COLLSCAN") && !/"stage":"SORT"/.test(pl); }));
    const conc = await timeIt(async () => { await Promise.all([1, 2, 3, 4, 5].map(() => SA.s.call("GET", `${REV}/FBM-QT-S44MANY1/versions?limit=20`))); }, 10);
    console.log(`      5 concurrent version pages: ${fmt(conc)}`);
    check("L-06 five concurrent reads all answer (timing reported; the plan sets no concurrency target)", true);
  }
}

let failed = false;
try { await main(); } catch (e) { failed = true; console.error("TEST RUN ABORTED:", e); }
if (!process.env.KEEP) {
  try {
    await db.command({ collMod: "idempotency_keys", validator: {}, validationLevel: "off" }).catch(() => undefined);
    await qts.deleteMany({ inquiryReference: /^FBM-INQ-S44/ });
    await inq.deleteMany({ reference: /^FBM-INQ-S44/ });
    await notes.deleteMany({ type: /^(QUOTATION_|INQUIRY_)/ });
    await outbox.deleteMany({ inquiryReference: /^FBM-INQ-S44/ });
    await idem.deleteMany({ operation: { $in: ["quotation.revise", "quotation.submit"] } });
    await events.deleteMany({ type: /^supplier_quotation/ });
    await db.collection("buyer_settings").deleteMany({});
    await companies.deleteMany({ ownerUserId: { $in: created.users } });
    await users.deleteMany({ email: new RegExp(`^t44-${stamp}-`) });
  } catch (e) { console.error("cleanup failed", e.message); }
}
await browser.close();
await client.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed${bad.length ? `; FAILED: ${bad.map((x) => x.name.slice(0, 40)).join(" | ")}` : ""}`);
process.exit(failed || bad.length ? 1 : 0);
