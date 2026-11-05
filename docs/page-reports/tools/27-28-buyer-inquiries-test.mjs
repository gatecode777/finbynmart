import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Pages 27 and 28 (Buyer My Inquiries: /buyer/inquiries, /api/buyer/inquiries*, and Buyer Inquiry Details: /buyer/inquiries/[reference]).
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test, Chrome and puppeteer-core.
// Writes only to the throwaway database and removes its own users and inquiries at the end unless KEEP=1. SKIP_PERF=1 skips group P.
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
const users = db.collection("users"), inq = db.collection("inquiries");
const clearLimits = () => db.collection("rate_limits").deleteMany({});
await clearLimits();

const stamp = Date.now();
const emailOf = (tag) => `t2728-${stamp}-${tag}@example.test`;
let ipN = 0;
const nextIp = () => `10.28.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "inquiry test passphrase";
const DAY = 86_400_000;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const refOf = (n) => { let x = n + 1; let out = ""; for (let k = 0; k < 8; k++) { out = ALPHABET[x % 32] + out; x = Math.floor(x / 32); } return `FBM-INQ-P${out.slice(1)}`; };
const newRef = () => { const b = randomBytes(8); let s = ""; for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % 32]; return `FBM-INQ-${s}`; };

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
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Inq ${tag.toUpperCase()} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: "Inquiry Test Traders", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register ${tag}: ${r.status} ${r.text}`);
  const user = await users.findOne({ email: emailOf(tag) });
  return { s, id: user._id, email: emailOf(tag) };
};

const SUP = { s1: { supplierKey: "shree-textiles", supplierName: "Shree Textiles", supplierSlug: "shree-textiles", source: "sample" }, s2: { supplierKey: "sunrise-hub", supplierName: "Sunrise Hub", supplierSlug: "sunrise-hub", source: "sample" }, s3: { supplierKey: "SLR9999", supplierName: "Zenith Packaging", source: "catalog" } };
const doc = (buyerId, over = {}) => {
  const createdAt = over.createdAt ?? new Date(Date.now() - 86_400_000);
  const status = over.status ?? "NEW";
  return { buyerId, buyerType: "REGISTERED", reference: newRef(), ...SUP.s1, quantity: 500, unit: "Meter", message: "Private message about this requirement, for the buyer only.", inquiryType: "GET_BEST_QUOTE", deliveryLocation: { text: "Jaipur, Rajasthan 302001" }, consent: { accepted: true, at: createdAt, policyVersion: null, termsPath: "/terms-and-conditions", privacyPath: "/privacy-policy" }, notification: { status: "BLOCKED", reason: "No email or in-app notification service is configured yet.", at: createdAt }, statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: createdAt }], createdAt, updatedAt: createdAt, ...over, status };
};
const daysAgo = (n, extraMs = 0) => new Date(Date.now() - n * DAY - extraMs);

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
const rowsOf = (p) => p.evaluate(() => [...document.querySelectorAll("tbody tr")].map((tr) => tr.innerText.replace(/\s+/g, " ")));
const med = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const list = (s, q = "") => s.call("GET", `/api/buyer/inquiries${q}`);

async function main() {
  const A = await register("a");
  const B = await register("b");
  const C = await register("c");
  const SUPPLIER = new Session();
  await SUPPLIER.call("POST", "/api/auth/register/supplier", { businessName: "Inquiry Supplier Co", contactName: "Sia Rao", email: emailOf("sup"), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  const SUSP = await register("susp");
  await users.updateOne({ _id: SUSP.id }, { $set: { accountStatus: "SUSPENDED" } });

  // ---------- seed A: 12 inquiries with known statuses, types, suppliers, categories and dates
  const seedA = [
    doc(A.id, { reference: "FBM-INQ-AAAAAAA1", status: "NEW", createdAt: daysAgo(2), updatedAt: daysAgo(2), productKey: "cotton-fabric", productName: "Cotton Fabric", categoryKey: "textiles-fabrics", categoryName: "Textiles & Fabrics", inquiryType: "PRODUCT_INQUIRY" }),
    doc(A.id, { reference: "FBM-INQ-AAAAAAA2", status: "NOTIFIED", ...SUP.s2, createdAt: daysAgo(5), updatedAt: daysAgo(4), inquiryType: "GENERAL_INQUIRY", statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: daysAgo(5) }, { from: "NEW", to: "NOTIFIED", actor: "system", at: daysAgo(4) }] }),
    doc(A.id, { reference: "FBM-INQ-AAAAAAA3", status: "IN_PROGRESS", createdAt: daysAgo(10), updatedAt: daysAgo(9), inquiryType: "BULK_REQUIREMENT", quantity: 25000, unit: "Kg", statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: daysAgo(10) }, { from: "NEW", to: "IN_PROGRESS", actor: "system", at: daysAgo(9) }] }),
    doc(A.id, { reference: "FBM-INQ-AAAAAAA4", status: "REPLIED", ...SUP.s3, createdAt: daysAgo(40), updatedAt: daysAgo(30), inquiryType: "GENERAL_INQUIRY", productKey: "99999", productName: "Printed Boxes", categoryKey: "packaging", categoryName: "Packaging" }),
    doc(A.id, { reference: "FBM-INQ-AAAAAAA5", status: "QUOTED", createdAt: daysAgo(100), updatedAt: daysAgo(1), inquiryType: "PRODUCT_INQUIRY", productKey: "printed-fabric", productName: "Printed Fabric", categoryKey: "textiles-fabrics", categoryName: "Textiles & Fabrics" }),
    doc(A.id, { reference: "FBM-INQ-AAAAAAA6", status: "CLOSED", createdAt: daysAgo(60), updatedAt: daysAgo(50) }),
    doc(A.id, { reference: "FBM-INQ-AAAAAAA7", status: "CLOSED", ...SUP.s2, createdAt: daysAgo(61), updatedAt: daysAgo(51) }),
    doc(A.id, { reference: "FBM-INQ-AAAAAAA8", status: "CLOSED", ...SUP.s3, createdAt: daysAgo(62), updatedAt: daysAgo(52) }),
    doc(A.id, { reference: "FBM-INQ-AAAAAAA9", status: "CANCELLED", createdAt: daysAgo(20), updatedAt: daysAgo(19), cancelledAt: daysAgo(19), statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: daysAgo(20) }, { from: "NEW", to: "CANCELLED", actor: "buyer", at: daysAgo(19), reason: "Cancelled by the buyer" }] }),
    doc(A.id, { reference: "FBM-INQ-AAAAAABA", status: "CANCELLED", ...SUP.s2, createdAt: daysAgo(21), updatedAt: daysAgo(20), cancelledAt: daysAgo(20) }),
    doc(A.id, { reference: "FBM-INQ-AAAAAABB", status: "REJECTED", createdAt: daysAgo(22), updatedAt: daysAgo(21) }),
  ];
  // a record from before the lifecycle: status "new", no reference, no inquiryType (old two-way type)
  const legacy = doc(A.id, { status: "new", createdAt: daysAgo(3), updatedAt: undefined, type: "quote" });
  delete legacy.reference; delete legacy.inquiryType; delete legacy.updatedAt; delete legacy.statusHistory;
  seedA.push(legacy);
  await inq.insertMany(seedA);
  const sameMs = daysAgo(7); // two inquiries created at the same millisecond: the order must still be fixed
  await inq.insertMany([doc(A.id, { reference: "FBM-INQ-TIE00001", status: "NEW", createdAt: sameMs, updatedAt: sameMs }), doc(A.id, { reference: "FBM-INQ-TIE00002", status: "NEW", createdAt: sameMs, updatedAt: sameMs })]);
  // totals for A now: 14 (new 4: A1, legacy, TIE1, TIE2; notified 1; in progress 1; replied 1; quoted 1; closed 3; cancelled 2; rejected 1)
  const bDocs = [doc(B.id, { reference: "FBM-INQ-BBBBBBB1", ...SUP.s3, supplierName: "Bravo Unique Supplier", productKey: "99998", productName: "Bravo Unique Product", categoryKey: "bravo-cat", categoryName: "Bravo Category" }), doc(B.id, { reference: "FBM-INQ-BBBBBBB2" }), doc(B.id, { reference: "FBM-INQ-BBBBBBB3", status: "CLOSED" })];
  await inq.insertMany(bDocs);
  // a guest inquiry that uses A's e-mail address must never appear in A's account
  await inq.insertOne({ ...doc(A.id), buyerId: undefined, buyerType: "GUEST", reference: "FBM-INQ-GUEST001", guest: { name: "Guest", email: A.email, phone: "+91 9876543210" } });
  await inq.updateOne({ reference: "FBM-INQ-GUEST001" }, { $unset: { buyerId: "" } });

  // ================= A: access
  const un = new Session();
  const routes = [["GET", "/api/buyer/inquiries"], ["GET", "/api/buyer/inquiries/summary"], ["GET", "/api/buyer/inquiries/FBM-INQ-AAAAAAA1"], ["GET", "/api/buyer/inquiries/FBM-INQ-AAAAAAA1?view=detail"], ["PATCH", "/api/buyer/inquiries/FBM-INQ-AAAAAAA1/cancel"]];
  const unr = await Promise.all(routes.map(([m, p]) => un.call(m, p)));
  check("A-01 without a session every inquiry endpoint answers 401 (private, no-store, nothing returned)", unr.every((r) => r.status === 401 && /no-store/.test(r.headers.get("cache-control") ?? "")), unr.map((r) => r.status).join());
  const supr = await Promise.all(routes.map(([m, p]) => SUPPLIER.call(m, p)));
  check("A-02 a supplier account is refused by every inquiry endpoint (403)", supr.every((r) => r.status === 403), supr.map((r) => r.status).join());
  check("A-03 a suspended buyer's session no longer works (401)", (await SUSP.s.call("GET", "/api/buyer/inquiries")).status === 401);
  const red = await un.page("/buyer/inquiries?status=closed");
  const redD = await un.page("/buyer/inquiries/FBM-INQ-AAAAAAA1");
  check("A-04 the pages redirect a signed-out visitor to sign-in, with the page to come back to", [307, 308].includes(red.status) && /\/sign-in\?next=%2Fbuyer%2Finquiries/.test(red.location ?? "") && [307, 308].includes(redD.status) && /\/sign-in\?next=%2Fbuyer%2Finquiries%2FFBM-INQ-AAAAAAA1/.test(redD.location ?? ""), `${red.location} | ${redD.location}`);
  const supPage = await SUPPLIER.page("/buyer/inquiries");
  check("A-05 a supplier account sees 'Buyer accounts only' (no inquiries, no data)", /Buyer accounts only/.test(supPage.text) && !/FBM-INQ-/.test(supPage.text));
  const hdr = await A.s.call("GET", "/api/buyer/inquiries");
  check("A-06 a buyer's list is private: no-store, never shared", /private|no-store/.test(hdr.headers.get("cache-control") ?? "") && hdr.status === 200);

  // ================= B: ownership
  const la = (await list(A.s, "?limit=50")).json;
  const refsA = la.inquiries.map((x) => x.reference);
  check("B-01 buyer A sees exactly their own 14 inquiries (none of B's, and not the guest inquiry that uses A's e-mail)", la.meta.total === 14 && !refsA.some((r) => /BBBBBBB|GUEST001/.test(r ?? "")) && refsA.includes("FBM-INQ-AAAAAAA1"), String(la.meta.total));
  const lb = (await list(B.s)).json;
  check("B-02 buyer B sees only their 3", lb.meta.total === 3 && lb.inquiries.every((x) => /BBBBBBB/.test(x.reference)));
  const idor = await A.s.call("GET", "/api/buyer/inquiries/FBM-INQ-BBBBBBB1");
  const idorD = await A.s.call("GET", "/api/buyer/inquiries/FBM-INQ-BBBBBBB1?view=detail");
  const unknown = await A.s.call("GET", "/api/buyer/inquiries/FBM-INQ-ZZZZZZZZ?view=detail");
  const pageIdor = await A.s.page("/buyer/inquiries/FBM-INQ-BBBBBBB1");
  const pageUnknown = await A.s.page("/buyer/inquiries/FBM-INQ-ZZZZZZZZ");
  const pageBad = await A.s.page("/buyer/inquiries/not-a-reference");
  check("B-03 another buyer's reference, an unknown reference and a malformed one all end the same way (404 by API and by page, nothing of B's inquiry in the answer)", idor.status === 404 && idorD.status === 404 && unknown.status === 404 && pageIdor.status === 404 && pageUnknown.status === 404 && pageBad.status === 404 && !/Bravo/.test(pageIdor.text + idor.text + idorD.text), [idor.status, idorD.status, unknown.status, pageIdor.status, pageUnknown.status, pageBad.status].join());
  const bTarget = await inq.findOne({ reference: "FBM-INQ-BBBBBBB2" });
  const crossCancel = await A.s.call("PATCH", "/api/buyer/inquiries/FBM-INQ-BBBBBBB2/cancel");
  const crossCancelId = await A.s.call("PATCH", `/api/buyer/inquiries/${bTarget._id}/cancel`);
  check("B-04 buyer A cannot cancel buyer B's inquiry (by reference or by id): 404 and it is unchanged", crossCancel.status === 404 && crossCancelId.status === 404 && (await inq.findOne({ _id: bTarget._id })).status === "NEW");
  const spoof = (await list(A.s, `?buyerId=${B.id}&userId=${B.id}&limit=50`)).json;
  check("B-05 a buyerId in the query is ignored: still A's 14", spoof.meta.total === 14);
  const gdet = await A.s.call("GET", "/api/buyer/inquiries/FBM-INQ-GUEST001?view=detail");
  check("B-06 a guest inquiry cannot be opened through a buyer account, even with the same e-mail", gdet.status === 404);
  const byId = await A.s.page(`/buyer/inquiries/${(await inq.findOne({ reference: "FBM-INQ-AAAAAAA1" }))._id}`);
  const legacyDoc = await inq.findOne({ buyerId: A.id, reference: { $exists: false } });
  const byLegacyId = await A.s.page(`/buyer/inquiries/${legacyDoc._id}`);
  check("B-07 a raw database id is not an address for an inquiry that has a reference (404); only an old record without a reference is opened by its id", byId.status === 404 && byLegacyId.status === 200 && /Earlier inquiry/.test(byLegacyId.text), `${byId.status} ${byLegacyId.status}`);

  // ================= C: listing and status filters
  const stat = async (s) => (await list(A.s, `?status=${s}&limit=50`)).json;
  const [all, nw, ip, aw, rp, qt, cl, ca, rj] = await Promise.all(["all", "new", "in_progress", "awaiting_response", "replied", "quoted", "closed", "cancelled", "rejected"].map(stat));
  check("C-01 each status tab returns exactly its records: all 14, new 4 (the old lowercase 'new' included), in progress 1, awaiting response 6, replied 1, quoted 1, closed 3, cancelled 2, rejected 1", [all.meta.total, nw.meta.total, ip.meta.total, aw.meta.total, rp.meta.total, qt.meta.total, cl.meta.total, ca.meta.total, rj.meta.total].join() === "14,4,1,6,1,1,3,2,1", [all.meta.total, nw.meta.total, ip.meta.total, aw.meta.total, rp.meta.total, qt.meta.total, cl.meta.total, ca.meta.total, rj.meta.total].join());
  check("C-02 the counts of the tabs agree with the records they return (statusCounts)", JSON.stringify(all.data.statusCounts) === JSON.stringify({ all: 14, new: 4, in_progress: 1, awaiting_response: 6, replied: 1, quoted: 1, closed: 3, cancelled: 2, rejected: 1 }), JSON.stringify(all.data.statusCounts));
  check("C-03 awaiting response = New + Notified + In Progress (never counted twice); a Notified inquiry is shown as 'Awaiting Response'", aw.inquiries.filter((x) => x.status === "NOTIFIED").every((x) => x.statusLabel === "Awaiting Response") && aw.inquiries.every((x) => ["NEW", "NOTIFIED", "IN_PROGRESS"].includes(x.status)) && aw.meta.total === 6);
  check("C-04 status in capitals (as stored) works the same", (await list(A.s, "?status=CLOSED")).json.meta.total === 3 && (await list(A.s, "?status=NEW")).json.meta.total === 4);
  const badStatus = await list(A.s, "?status=bogus");
  check("C-05 an unsupported status is refused (400) with the field named", badStatus.status === 400 && badStatus.json.fields?.status);
  const labels = Object.fromEntries(all.inquiries.map((x) => [x.reference ?? "legacy", [x.status, x.statusLabel, x.canCancel]]));
  check("C-06 status mapping: one business label per stored status, and only New, Notified and In Progress can be cancelled by the buyer", labels["FBM-INQ-AAAAAAA1"].join() === "NEW,New,true" && labels["FBM-INQ-AAAAAAA2"].join() === "NOTIFIED,Awaiting Response,true" && labels["FBM-INQ-AAAAAAA3"].join() === "IN_PROGRESS,In Progress,true" && labels["FBM-INQ-AAAAAAA4"].join() === "REPLIED,Replied,false" && labels["FBM-INQ-AAAAAAA5"].join() === "QUOTED,Quoted,false" && labels["FBM-INQ-AAAAAAA6"].join() === "CLOSED,Closed,false" && labels["FBM-INQ-AAAAAAA9"].join() === "CANCELLED,Cancelled,false" && labels["FBM-INQ-AAAAAABB"].join() === "REJECTED,Rejected,false" && labels.legacy.join() === "NEW,New,true");
  const row1 = all.inquiries.find((x) => x.reference === "FBM-INQ-AAAAAAA1");
  check("C-07 a row carries what the table shows (reference, type, product with its saved name and link, category, supplier, quantity with unit, dates, detail link) and never the private message or delivery location", row1.inquiryTypeLabel === "Product Inquiry" && row1.product.name === "Cotton Fabric" && row1.categoryName === "Textiles & Fabrics" && row1.supplier.name === "Shree Textiles" && row1.quantity === 500 && row1.unit === "Meter" && row1.detailHref === "/buyer/inquiries/FBM-INQ-AAAAAAA1" && row1.submittedAt && row1.updatedAt && !/Private message|Jaipur|deliveryLocation|"message"/.test(JSON.stringify(row1)));
  const leg = all.inquiries.find((x) => x.reference === null);
  check("C-08 an old record (status 'new', no reference, no updatedAt) is listed as New with its type derived from the old type, last updated falling back to its submission time, addressed by its id", leg.status === "NEW" && leg.inquiryTypeLabel === "Get Best Quote" && leg.updatedAt === leg.submittedAt && /^\/buyer\/inquiries\/[a-f0-9]{24}$/.test(leg.detailHref));
  const noProduct = all.inquiries.find((x) => x.reference === "FBM-INQ-AAAAAAA2");
  const goneProduct = all.inquiries.find((x) => x.reference === "FBM-INQ-AAAAAAA4");
  check("C-09 a general inquiry has no product (not invented); a product that is no longer listed keeps its saved name and has no link", noProduct.product === null && goneProduct.product.name === "Printed Boxes" && goneProduct.product.url === null && goneProduct.product.imageSrc === null);
  check("C-10 no inquiry has a linked quotation (there is no quotation module), so no row carries one", all.inquiries.every((x) => x.quotation === null) && !/quotationId|quotations/.test(JSON.stringify(all)));
  check("C-11 the list never exposes internal or contact fields (buyer id, idempotency key, consent, notification state, guest data, e-mail, phone)", !/buyerId|idempotency|consent|notification|guest|retainUntil|example\.test|9876543210/i.test(JSON.stringify(all)));

  // ================= D: search
  const q = async (text, extra = "") => (await list(A.s, `?q=${encodeURIComponent(text)}${extra}&limit=50`));
  const [qRef, qRefLow, qProd, qSup, qCase, qNone, qRegex, qBravo] = await Promise.all([q("FBM-INQ-AAAAAAA1"), q("fbm-inq-aaaaaaa"), q("cotton"), q("sunrise"), q("SUNRISE HUB"), q("zzzzzz"), q(".*"), q("Bravo")]);
  check("D-01 search finds by reference (exact and as a lower-case prefix), product name (partial) and supplier name (partial, any case)", qRef.json.meta.total === 1 && qRefLow.json.meta.total === 9 && qProd.json.meta.total === 1 && qSup.json.meta.total === 3 && qCase.json.meta.total === 3, [qRef, qRefLow, qProd, qSup, qCase].map((x) => x.json.meta.total).join());
  check("D-02 no match is an empty list (not an error); a pattern such as '.*' is matched as plain text (nothing), not as a regular expression", qNone.status === 200 && qNone.json.meta.total === 0 && qRegex.json.meta.total === 0);
  check("D-03 search is buyer-scoped: B's unique supplier and product names are not found by A", qBravo.json.meta.total === 0);
  const qB = await B.s.call("GET", `/api/buyer/inquiries?q=Bravo`);
  check("D-04 and B finds their own by the same text", qB.json.meta.total === 1);
  const longQ = await list(A.s, `?q=${"x".repeat(61)}`);
  check("D-05 a search over 60 characters is refused (400); an empty search lists everything; spaces are collapsed", longQ.status === 400 && (await list(A.s, "?q=")).json.meta.total === 14 && (await q("  cotton   ")).json.meta.total === 1);
  const qStatus = await q("sunrise", "&status=closed");
  check("D-06 search and a status tab combine (sunrise and closed: 1), and the tab counts follow the search (closed 1, cancelled 1, in progress 0)", qStatus.json.meta.total === 1 && qStatus.json.data.statusCounts.closed === 1 && qStatus.json.data.statusCounts.cancelled === 1 && qStatus.json.data.statusCounts.in_progress === 0, JSON.stringify(qStatus.json.data.statusCounts));
  const inj = await Promise.all([list(A.s, `?q=${encodeURIComponent('{"$ne":""}')}`), list(A.s, "?q[$ne]=x"), list(A.s, "?supplierId[$ne]=x"), list(A.s, `?supplierId=${encodeURIComponent('{"$ne":""}')}`)]);
  check("D-07 operator-looking input is treated as text or ignored, never as a database operator (no records leak, no error)", inj[0].json.meta.total === 0 && inj[1].status === 200 && inj[1].json.meta.total === 14 && inj[2].status === 200 && inj[2].json.meta.total === 14 && inj[3].status === 400);

  // ================= E: filters
  const f = async (qs) => (await list(A.s, `?${qs}&limit=50`)).json;
  const [tBest, tProd, tGen, tBulk, sup1, sup2, sup3, cat1, cat2] = await Promise.all([f("inquiryType=GET_BEST_QUOTE"), f("inquiryType=PRODUCT_INQUIRY"), f("inquiryType=GENERAL_INQUIRY"), f("inquiryType=BULK_REQUIREMENT"), f("supplierId=shree-textiles"), f("supplierId=sunrise-hub"), f("supplierId=SLR9999"), f("categoryId=textiles-fabrics"), f("categoryId=packaging")]);
  check("E-01 inquiry type filters use the stored type (and the old 'quote' type of earlier records counts as Get Best Quote): best quote 9, product 2, general 2, bulk 1", [tBest, tProd, tGen, tBulk].map((x) => x.meta.total).join() === "9,2,2,1", [tBest, tProd, tGen, tBulk].map((x) => x.meta.total).join());
  check("E-02 supplier filter: only suppliers from the buyer's history (Shree 9, Sunrise 3, Zenith 2)", [sup1, sup2, sup3].map((x) => x.meta.total).join() === "9,3,2", [sup1, sup2, sup3].map((x) => x.meta.total).join());
  check("E-03 category filter uses the category saved with the inquiry: textiles 2, packaging 1; an inquiry without a category is never put in one", cat1.meta.total === 2 && cat2.meta.total === 1 && (await f("categoryId=bravo-cat")).meta.total === 0);
  const combo = await f("inquiryType=GET_BEST_QUOTE&supplierId=shree-textiles&status=closed");
  check("E-04 several filters combine (best quote + Shree + closed: 1)", combo.meta.total === 1 && combo.inquiries[0].reference === "FBM-INQ-AAAAAAA6");
  const [r7, r30, r90, rthis, rprev] = await Promise.all(["7d", "30d", "90d", "this-month", "previous-month"].map((r) => f(`range=${r}`)));
  check("E-05 date presets (India time): last 7 days 3, last 30 days 9, last 90 days 13 (the 100-day-old one is outside; days are counted in India time and include today)", r7.meta.total === 3 && r30.meta.total === 9 && r90.meta.total === 13 && rthis.status !== 400 && rprev.status !== 400 && r7.data.appliedFilters.range === "7d", [r7, r30, r90].map((x) => x.meta.total).join());
  // boundary: buyer C has one inquiry at 23:59:59.999 IST on 10 Mar 2026 and one at 00:00:00.000 IST on 11 Mar 2026
  await inq.insertMany([doc(C.id, { reference: "FBM-INQ-CBOUND01", createdAt: new Date("2026-03-10T18:29:59.999Z"), updatedAt: new Date("2026-03-10T18:29:59.999Z") }), doc(C.id, { reference: "FBM-INQ-CBOUND02", createdAt: new Date("2026-03-10T18:30:00.000Z"), updatedAt: new Date("2026-03-10T18:30:00.000Z") })]);
  const b10 = (await C.s.call("GET", "/api/buyer/inquiries?range=custom&dateFrom=2026-03-10&dateTo=2026-03-10")).json;
  const b11 = (await C.s.call("GET", "/api/buyer/inquiries?range=custom&dateFrom=2026-03-11&dateTo=2026-03-11")).json;
  const b1011 = (await C.s.call("GET", "/api/buyer/inquiries?dateFrom=2026-03-10&dateTo=2026-03-11")).json;
  check("E-06 custom range boundaries follow India midnight: 23:59:59.999 on the 10th is in the 10th and not the 11th; 00:00:00.000 on the 11th is in the 11th; both days hold both", b10.inquiries.map((x) => x.reference).join() === "FBM-INQ-CBOUND01" && b11.inquiries.map((x) => x.reference).join() === "FBM-INQ-CBOUND02" && b1011.meta.total === 2, [b10, b11, b1011].map((x) => x.meta?.total).join());
  const badF = await Promise.all(["inquiryType=OTHER", "supplierId=a%20b", "categoryId=Textiles", "range=forever", "range=custom&dateFrom=2026-05-02&dateTo=2026-05-01", "range=custom&dateFrom=2026-05-01", "range=custom&dateFrom=2026-02-31&dateTo=2026-03-01", "range=custom&dateFrom=2026-01-01&dateTo=2999-01-01", "range=custom&dateFrom=2020-01-01&dateTo=2026-01-01"].map((x) => list(A.s, `?${x}`)));
  check("E-07 every invalid filter is refused with 400 (type, supplier, category, preset, reversed dates, missing end, impossible date, future end, range over a year)", badF.every((r) => r.status === 400), badF.map((r) => r.status).join());

  // ================= F: sorting
  const newest = (await f("sort=newest")).inquiries.map((x) => x.reference ?? "legacy");
  const oldest = (await f("sort=oldest")).inquiries.map((x) => x.reference ?? "legacy");
  const upd = (await f("sort=updated")).inquiries.map((x) => x.reference ?? "legacy");
  check("F-01 newest first is the default and the exact reverse of oldest first", newest[0] === "FBM-INQ-AAAAAAA1" && newest.at(-1) === "FBM-INQ-AAAAAAA5" && JSON.stringify([...newest].reverse()) === JSON.stringify(oldest) && JSON.stringify((await f("")).inquiries.map((x) => x.reference ?? "legacy")) === JSON.stringify(newest), newest.slice(0, 3).join());
  check("F-02 recently updated puts the inquiry that changed last first (the quoted one, updated yesterday), not the newest", upd[0] === "FBM-INQ-AAAAAAA5", upd.slice(0, 3).join());
  const tieNewest = newest.filter((r) => r.startsWith("FBM-INQ-TIE"));
  const tieOldest = oldest.filter((r) => r.startsWith("FBM-INQ-TIE"));
  const oneByOne = [];
  for (let page = 1; page <= 14; page++) { const x = (await list(A.s, `?limit=1&page=${page}`)).json; oneByOne.push(x.inquiries[0].reference ?? "legacy"); }
  check("F-03 two inquiries created in the same millisecond keep a fixed order (ties broken by id), the same on every page size", tieNewest.length === 2 && JSON.stringify([...tieNewest].reverse()) === JSON.stringify(tieOldest) && JSON.stringify(oneByOne) === JSON.stringify(newest), tieNewest.join());
  const badSort = await Promise.all(["sort=reference", "sort=relevance", "sort=createdAt", "sort=-1"].map((x) => list(A.s, `?${x}`)));
  check("F-04 an invalid sort (including 'reference', which is not offered) is refused (400)", badSort.every((r) => r.status === 400));

  // ================= G: pagination
  const p1 = (await list(A.s, "?limit=5&page=1")).json, p2 = (await list(A.s, "?limit=5&page=2")).json, p3 = (await list(A.s, "?limit=5&page=3")).json, p4 = (await list(A.s, "?limit=5&page=4")).json;
  const union = [...p1.inquiries, ...p2.inquiries, ...p3.inquiries].map((x) => x.id);
  check("G-01 pagination: first 5, middle 5, last 4 of 14 with the right meta, no repeats or gaps across pages; a page past the end is an empty list with the true total", [p1, p2, p3, p4].map((x) => x.inquiries.length).join() === "5,5,4,0" && p2.meta.page === 2 && p2.meta.totalPages === 3 && p4.meta.total === 14 && new Set(union).size === 14);
  const def = (await list(A.s)).json;
  check("G-02 the default page size is 20 and the largest is 50", def.meta.limit === 20 && (await list(A.s, "?limit=50")).status === 200 && (await list(A.s, "?limit=51")).status === 400);
  const badPage = await Promise.all(["page=0", "page=1001", "page=x", "page=1.5", "limit=0", "limit=-1"].map((x) => list(A.s, `?${x}`)));
  check("G-03 an invalid page or limit is refused (400)", badPage.every((r) => r.status === 400));
  const cl2 = (await list(A.s, "?status=closed&limit=2&page=2")).json;
  const sr2 = (await list(A.s, "?q=sunrise&limit=2&page=2")).json;
  check("G-04 the filter and the search are kept while paging (closed page 2 of size 2: 1; sunrise page 2 of size 2: 1; totals unchanged)", cl2.inquiries.length === 1 && cl2.meta.total === 3 && sr2.inquiries.length === 1 && sr2.meta.total === 3 && cl2.inquiries.every((x) => x.status === "CLOSED"));

  // ================= H: summary
  const sm = (await A.s.call("GET", "/api/buyer/inquiries/summary")).json.data;
  check("H-01 the summary: total 14 (cancelled and rejected included), awaiting response 6, replied/quoted 2, closed 3; a tab count for every status", JSON.stringify(sm.summary) === '{"total":14,"awaitingResponse":6,"repliedOrQuoted":2,"closed":3}' && sm.statusCounts.cancelled === 2 && sm.statusCounts.rejected === 1, JSON.stringify(sm.summary));
  check("H-02 the filter choices are only suppliers and categories that appear in this buyer's history (3 suppliers, 2 categories), with counts; none of B's", sm.facets.suppliers.length === 3 && sm.facets.suppliers.map((s) => s.name).join() === "Shree Textiles,Sunrise Hub,Zenith Packaging" && sm.facets.categories.map((c) => c.id).join() === "packaging,textiles-fabrics" && !/Bravo/.test(JSON.stringify(sm.facets)));
  const emptySummary = (await C.s.call("GET", "/api/buyer/inquiries/summary")).json.data.summary;
  const zero = await register("zero");
  const zs = (await zero.s.call("GET", "/api/buyer/inquiries/summary")).json.data;
  check("H-03 a buyer with no inquiries gets zeros and empty filter choices (nothing invented)", JSON.stringify(zs.summary) === '{"total":0,"awaitingResponse":0,"repliedOrQuoted":0,"closed":0}' && zs.facets.suppliers.length === 0 && emptySummary.total === 2);

  // ================= J: cancellation
  const target = "FBM-INQ-AAAAAAA1";
  const before = await inq.findOne({ reference: target });
  const cnt0 = await inq.countDocuments({ buyerId: A.id });
  const c1 = await A.s.call("PATCH", `/api/buyer/inquiries/${target}/cancel`);
  const after = await inq.findOne({ reference: target });
  check("J-01 cancelling an eligible inquiry (by reference): 200, status CANCELLED, cancelledAt set, updatedAt moved, the record is kept (count unchanged), and the history gained one entry with the previous status and the buyer as actor", c1.status === 200 && after.status === "CANCELLED" && after.cancelledAt instanceof Date && after.updatedAt > before.updatedAt && (await inq.countDocuments({ buyerId: A.id })) === cnt0 && after.statusHistory.length === before.statusHistory.length + 1 && after.statusHistory.at(-1).from === "NEW" && after.statusHistory.at(-1).to === "CANCELLED" && after.statusHistory.at(-1).actor === "buyer" && c1.json.inquiry.status === "CANCELLED", JSON.stringify(c1.json).slice(0, 200));
  const c2 = await A.s.call("PATCH", `/api/buyer/inquiries/${target}/cancel`);
  check("J-02 cancelling again is refused (409) and adds nothing to the history", c2.status === 409 && (await inq.findOne({ reference: target })).statusHistory.length === after.statusHistory.length);
  const blocked = await Promise.all(["FBM-INQ-AAAAAAA6", "FBM-INQ-AAAAAAA4", "FBM-INQ-AAAAAAA5", "FBM-INQ-AAAAAABB"].map((r) => A.s.call("PATCH", `/api/buyer/inquiries/${r}/cancel`)));
  check("J-03 closed, replied, quoted and rejected inquiries cannot be cancelled (409), and are unchanged", blocked.every((r) => r.status === 409) && (await inq.findOne({ reference: "FBM-INQ-AAAAAAA6" })).status === "CLOSED" && (await inq.findOne({ reference: "FBM-INQ-AAAAAAA5" })).status === "QUOTED");
  const smAfter = (await A.s.call("GET", "/api/buyer/inquiries/summary")).json.data.summary;
  check("J-04 after the cancellation the summary moved with it: awaiting 6 to 5, total still 14, cancelled 2 to 3 (the dashboard reads the same statuses)", smAfter.awaitingResponse === 5 && smAfter.total === 14 && (await list(A.s, "?status=cancelled")).json.meta.total === 3);
  const ids = await Promise.all([A.s.call("PATCH", "/api/buyer/inquiries/abc/cancel"), A.s.call("PATCH", "/api/buyer/inquiries/FBM-INQ-ZZZZZZZZ/cancel"), A.s.call("PATCH", `/api/buyer/inquiries/${new ObjectId()}/cancel`)]);
  check("J-05 a malformed or unknown reference or id on cancel is 404", ids.every((r) => r.status === 404));
  const statusEdit = await A.s.call("PATCH", "/api/buyer/inquiries/FBM-INQ-AAAAAAA2", { status: "CLOSED" });
  check("J-06 there is no way to set a status directly: PATCH on the inquiry itself is not allowed (405) and the status is unchanged", statusEdit.status === 405 && (await inq.findOne({ reference: "FBM-INQ-AAAAAAA2" })).status === "NOTIFIED");
  const legacyCancel = await A.s.call("PATCH", `/api/buyer/inquiries/${legacyDoc._id}/cancel`);
  check("J-07 an old record (status 'new', no reference) can be cancelled by its id and its history starts with that event", legacyCancel.status === 200 && (await inq.findOne({ _id: legacyDoc._id })).status === "CANCELLED" && (await inq.findOne({ _id: legacyDoc._id })).statusHistory.at(-1).from === "NEW");

  // ================= M: detail API and page
  const det = await A.s.call("GET", "/api/buyer/inquiries/FBM-INQ-AAAAAAA3?view=detail");
  const d = det.json.data;
  check("M-01 the detail API returns the buyer's inquiry with reference, status, label, dates, supplier, quantity and a timeline from the real history, and honest capability flags (nothing that does not exist is offered)", det.status === 200 && d.reference === "FBM-INQ-AAAAAAA3" && d.status === "IN_PROGRESS" && d.businessLabel === "In Progress" && d.quantity === 25000 && d.unit === "Kg" && d.supplier.name === "Shree Textiles" && d.timeline.length >= 2 && d.capabilities.messaging === false && d.capabilities.quotations === true && d.capabilities.revisionRequests === true && d.capabilities.quotationSelection === true && Array.isArray(d.quotations) && d.quotations.length === 0 && d.capabilities.attachments === false && d.capabilities.cancellation === true && d.capabilities.pdfExport === false && d.capabilities.print === true, JSON.stringify(d.capabilities));
  check("M-02 the detail answer holds no internal or private fields (buyer id, idempotency key, consent record, notification record, guest data, e-mail or phone)", !/buyerId|idempotency|"consent"|retainUntil|"guest"|example\.test|9876543210/i.test(JSON.stringify(det.json)));
  check("M-03 the history is the saved one: submitted, then the changes with their time", d.history.length === 2 && d.history[0].to === "NEW" && d.history[1].to === "IN_PROGRESS" && d.history[1].actor === "system");
  const dpage = await open("/buyer/inquiries/FBM-INQ-AAAAAAA3", { session: A.s });
  const dt = await content(dpage);
  const dnav = await dpage.evaluate(() => ({ active: document.querySelector("nav[aria-label='Buyer navigation'] a[aria-current='page']")?.textContent.trim(), h1: document.querySelector("h1")?.textContent, crumbs: document.querySelector("p[class*=breadcrumb]")?.textContent ?? "", steps: [...document.querySelectorAll("ol[aria-label='Inquiry progress'] li")].map((li) => li.textContent.replace(/\s+/g, " ")) }));
  check("M-04 the details page: buyer shell with My Inquiries current, heading 'Inquiry Details', breadcrumb Home / Buyer Dashboard / My Inquiries / reference, no console errors", dpage.status === 200 && /My Inquiries/.test(dnav.active ?? "") && dnav.h1 === "Inquiry Details" && /My Inquiries \/ FBM-INQ-AAAAAAA3/.test(dnav.crumbs) && dpage.errs.length === 0, JSON.stringify(dnav).slice(0, 300));
  check("M-05 the overview shows the reference, the requirement and the status; the requirement details show the saved quantity with its unit, delivery location and the buyer's own message (as text)", /FBM-INQ-AAAAAAA3/.test(dt) && /Bulk Requirement/.test(dt) && /25,000 Kg/.test(dt) && /Jaipur, Rajasthan 302001/.test(dt) && /Private message about this requirement/.test(dt) && /In Progress/.test(dt));
  check("M-06 the progress timeline shows only recorded events: Inquiry Submitted and Supplier Review are done, no quotation or closing step is claimed", dnav.steps.length >= 2 && /Inquiry Submitted/.test(dnav.steps[0]) && /Completed/.test(dnav.steps[0]) && /Supplier Review/.test(dnav.steps[1]) && /Completed/.test(dnav.steps[1]) && !/Quotation Received|Closed/.test(dnav.steps.join(" ")), dnav.steps.join(" | ").slice(0, 300));
  check("M-07 what does not exist says so: responses 'Not available yet', the real quotation count (0 here), attachments 'No attachments', messages and quotations tabs explain they are not connected; no 'Select & Proceed', 'Request Revision' or 'View Quotation' button", /Responses Received\s*Not available yet/.test(dt) && /Quotations Received\s*0/.test(dt) && /No attachments/.test(dt) && !(await dpage.evaluate(() => [...document.querySelectorAll("button, a")].some((e) => /Select & Proceed|Request Revision|View Quotation|Message Supplier/.test(e.textContent)))));
  await dpage.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => /Quotations/.test(t.textContent)).click());
  await sleep(200);
  const tabState = await dpage.evaluate(() => ({ sel: [...document.querySelectorAll("[role=tab]")].map((t) => t.getAttribute("aria-selected")), panel: document.querySelector("[role=tabpanel]").textContent }));
  await dpage.focus("[role=tab][aria-selected=true]");
  await dpage.keyboard.press("ArrowRight");
  await sleep(200);
  const tabKey = await dpage.evaluate(() => ({ label: document.querySelector("[role=tab][aria-selected=true]").textContent.trim(), focus: document.activeElement.textContent.trim(), panel: document.querySelector("[role=tabpanel]").textContent }));
  check("M-08 the three tabs are real tabs: a click selects one, the arrow key moves to the next and moves focus with it; an empty quotations tab says honestly that none was received and suppliers cannot send any yet, and messaging is not connected", tabState.sel.join() === "false,true,false" && /No quotation has been received for this inquiry/.test(tabState.panel) && /cannot send quotations through Finbyn Mart yet/.test(tabState.panel) && /Messages/.test(tabKey.label) && tabKey.focus === tabKey.label && /Messaging is not available yet/.test(tabKey.panel), JSON.stringify(tabKey).slice(0, 200));
  const side = await dpage.evaluate(() => ({ next: document.querySelector("[aria-labelledby=next-title]")?.textContent ?? "", supplier: document.querySelector("[aria-labelledby=supplier-title]")?.textContent ?? "", hist: document.querySelector("[aria-labelledby=history-title]")?.textContent ?? "" }));
  check("M-09 the side panels: next steps match the status (wait for the supplier, other suppliers, cancel), the supplier is shown as the single recipient, the history lists the real events", /Wait for the supplier/.test(side.next) && /Browse suppliers/.test(side.next) && /Cancel Inquiry/.test(side.next) && /Shree Textiles/.test(side.supplier) && /sent to this one supplier/.test(side.supplier) && /In Progress/.test(side.hist) && /by the system/.test(side.hist));
  await dpage.evaluate(() => [...document.querySelectorAll("button")].find((b) => /More Actions/.test(b.textContent)).click());
  await sleep(200);
  const menu1 = await dpage.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].map((m) => m.textContent.trim()));
  check("M-10 More Actions opens a menu with only what works: Print Inquiry Details and (because it is eligible) Cancel Inquiry", menu1.join("|") === "Print Inquiry Details|Cancel Inquiry", menu1.join("|"));
  await dpage.keyboard.press("Escape");
  await dpage.emulateMediaType("print");
  const printed = await dpage.evaluate(() => ({ top: getComputedStyle(document.querySelector("header")).display, side: getComputedStyle(document.querySelector("#buyer-sidebar")).display, bar: [...document.querySelectorAll("button")].filter((b) => /Print \/ Save|Cancel Inquiry|More Actions/.test(b.textContent)).map((b) => b.closest("[class*=noPrint]") ? getComputedStyle(b.closest("[class*=noPrint]")).display : "visible") }));
  check("M-11 the print view hides the workspace (top bar, sidebar) and the action buttons, so the printout is the inquiry only", printed.top === "none" && printed.side === "none" && printed.bar.every((v) => v === "none"), JSON.stringify(printed));
  await dpage.emulateMediaType("screen");
  await dpage.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/28-buyer-inquiry-details-desktop-1440.png`, fullPage: true });
  await dpage.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Cancel Inquiry/.test(b.textContent) && b.getClientRects().length).click());
  await sleep(500);
  check("M-12 Cancel Inquiry asks first in an alert dialog (nothing changes yet); Keep inquiry closes it", (await dpage.evaluate(() => !!document.querySelector("[role=alertdialog]"))) && (await inq.findOne({ reference: "FBM-INQ-AAAAAAA3" })).status === "IN_PROGRESS");
  await dpage.keyboard.press("Escape");
  await sleep(300);
  await dpage.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Cancel Inquiry/.test(b.textContent) && b.getClientRects().length).click());
  await sleep(400);
  await dpage.evaluate(() => [...document.querySelectorAll("[role=alertdialog] button")].find((b) => /Yes, cancel inquiry/.test(b.textContent)).click());
  await sleep(3000);
  const cancelledView = await content(dpage);
  const toastText = await dpage.evaluate(() => document.querySelector("[aria-label='Notifications from the site'] [role=status]")?.textContent ?? "");
  check("M-13 confirming cancels it on the server (status CANCELLED, history entry), shows the success toast, and the page now says Cancelled with no cancel action left and a final 'Inquiry Cancelled' step", (await inq.findOne({ reference: "FBM-INQ-AAAAAAA3" })).status === "CANCELLED" && /Your inquiry was cancelled/.test(toastText) && /Cancelled/.test(cancelledView) && !(await dpage.evaluate(() => [...document.querySelectorAll("button")].some((b) => /Cancel Inquiry/.test(b.textContent)))) && /Inquiry Cancelled/.test(cancelledView), toastText);
  await dpage.context.close();
  const closedPage = await open("/buyer/inquiries/FBM-INQ-AAAAAAA6", { session: A.s });
  await closedPage.evaluate(() => [...document.querySelectorAll("button")].find((b) => /More Actions/.test(b.textContent)).click());
  await sleep(300);
  const closedMenu = await closedPage.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].map((m) => m.textContent.trim()));
  const closedText = await content(closedPage);
  check("M-14 a closed inquiry offers no cancel anywhere, says it is final, and suggests a new inquiry", closedMenu.join("|") === "Print Inquiry Details" && /nothing more can be done/.test(closedText) && /Send a new inquiry/.test(closedText) && /No supplier review was recorded/.test(closedText) && !/Waiting for the supplier to review/.test(closedText) && !(await closedPage.evaluate(() => [...document.querySelectorAll("button")].some((b) => /Cancel Inquiry/.test(b.textContent)))));
  await closedPage.context.close();
  const notFoundPage = await open("/buyer/inquiries/FBM-INQ-BBBBBBB1", { session: A.s });
  check("M-15 someone else's reference shows the site's not-found page (404) with nothing of that inquiry", notFoundPage.status === 404 && !/Bravo/.test(await notFoundPage.evaluate(() => document.body.textContent)));
  await notFoundPage.context.close();

  // ================= L: the list page in the browser
  await clearLimits();
  const lp = await open("/buyer/inquiries", { session: A.s });
  const lt = await content(lp);
  const lnav = await lp.evaluate(() => ({ active: document.querySelector("nav[aria-label='Buyer navigation'] a[aria-current='page']")?.textContent ?? "", h1: document.querySelector("h1")?.textContent, cta: [...document.querySelectorAll("a")].find((a) => /Create New Inquiry/.test(a.textContent))?.getAttribute("href"), bg: getComputedStyle(document.querySelector("nav[aria-label='Buyer navigation'] a[aria-current='page']")).backgroundColor, cards: [...document.querySelectorAll("ul[aria-label='Inquiry summary'] li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()), badge: document.querySelector("nav[aria-label='Buyer navigation'] a[aria-current='page'] span[aria-label$='active']")?.textContent }));
  check("L-01 the page: buyer shell, My Inquiries is the current (gold) sidebar item with its real badge, heading and description, 'Create New Inquiry' goes to the existing discovery flow, no console errors", lp.status === 200 && /My Inquiries/.test(lnav.active) && lnav.h1 === "My Inquiries" && /Track your supplier inquiries/.test(lt) && lnav.cta === "/products" && lnav.bg === "rgb(253, 179, 4)" && lp.errs.length === 0, JSON.stringify({ ...lnav, active: undefined }));
  check("L-02 the four summary cards come from the database (total 14, awaiting 3, replied/quoted 2, closed 3 at this point) and say what they count; replied/quoted says replies are not connected yet", /Total Inquiries\s*14/.test(lnav.cards[0]) && /Awaiting Response\s*3/.test(lnav.cards[1]) && /Replied \/ Quoted\s*2/.test(lnav.cards[2]) && /not connected yet/.test(lnav.cards[2]) && /Closed\s*3/.test(lnav.cards[3]), lnav.cards.join(" | "));
  check("L-03 the sidebar badge agrees with the awaiting-response card (the same statuses)", lnav.badge === "3", String(lnav.badge));
  const tabs = await lp.evaluate(() => [...document.querySelectorAll("[aria-label='Filter inquiries by status'] button")].map((b) => b.textContent.trim().replace(/\s+/g, " ")));
  check("L-04 status tabs with the counts of each (All 14, New 2, In Progress 0, Awaiting Response 3, Replied 1, Quoted 1, Closed 3, Cancelled 5, Rejected 1)", tabs.join("|") === "All (14)|New (2)|In Progress (0)|Awaiting Response (3)|Replied (1)|Quoted (1)|Closed (3)|Cancelled (5)|Rejected (1)", tabs.join("|"));
  const rows0 = await rowsOf(lp);
  check("L-05 the table has the eight columns and shows reference, product, supplier, quantity, both dates, a status with its words, and View Details for each row; the private message is not in it", (await lp.evaluate(() => [...document.querySelectorAll("thead th")].map((t) => t.textContent.trim()).join("|"))) === "Inquiry Reference|Product / Requirement|Supplier|Quantity|Submitted On|Last Updated|Status|Actions" && rows0.length === 14 && rows0.every((r) => /View Details/.test(r)) && !rows0.join(" ").includes("Private message"), String(rows0.length));
  await clickText(lp, "[aria-label='Filter inquiries by status'] button", "Closed");
  await sleep(1500);
  check("L-06 the Closed tab shows the 3 closed inquiries, is marked pressed, and puts status=closed in the address (the page is not reloaded)", (await rowsOf(lp)).length === 3 && new URL(lp.url()).searchParams.get("status") === "closed" && (await lp.evaluate(() => [...document.querySelectorAll("[aria-label='Filter inquiries by status'] button")].find((b) => /^Closed/.test(b.textContent.trim())).getAttribute("aria-pressed"))) === "true");
  await clickText(lp, "[aria-label='Filter inquiries by status'] button", "All");
  await sleep(1200);
  await lp.type("#inquiry-search", "sunrise");
  await sleep(1800);
  check("L-07 search is debounced and runs on the server: 'sunrise' leaves the Sunrise inquiries (3) and puts q=sunrise in the address; the tab counts follow it", (await rowsOf(lp)).length === 3 && new URL(lp.url()).searchParams.get("q") === "sunrise" && /All \(3\)/.test(await lp.evaluate(() => document.querySelector("[aria-label='Filter inquiries by status'] button").textContent)));
  await lp.evaluate(() => document.querySelector("button[aria-label='Clear search']").click());
  await sleep(1500);
  check("L-08 Clear search restores the full list and a clean address", (await rowsOf(lp)).length === 14 && new URL(lp.url()).search === "");
  await clickText(lp, "button", "Filters");
  await sleep(500);
  const fd = await lp.evaluate(() => { const d = document.querySelector("[role=dialog]"); return { ok: !!d, modal: d?.getAttribute("aria-modal"), focusIn: d?.contains(document.activeElement), suppliers: [...d.querySelectorAll("select")][1] ? [...[...d.querySelectorAll("select")][1].options].map((o) => o.textContent) : [] }; });
  check("L-09 Filters opens an accessible dialog (modal, focus inside) listing only the suppliers of this buyer's history", fd.ok && fd.modal === "true" && fd.focusIn && fd.suppliers.length === 4 && /Shree Textiles/.test(fd.suppliers.join()), JSON.stringify(fd));
  await lp.evaluate(() => { const d = document.querySelector("[role=dialog]"); const sel = d.querySelectorAll("select"); const set = (el, v) => { el.value = v; el.dispatchEvent(new Event("change", { bubbles: true })); }; set(sel[0], "GET_BEST_QUOTE"); set(sel[1], "shree-textiles"); });
  await clickText(lp, "[role=dialog] button", "Apply");
  await sleep(1800);
  const afterFilter = await lp.evaluate(() => ({ chips: [...document.querySelectorAll("ul[aria-label='Active filters'] li")].map((l) => l.textContent.trim()), badge: document.querySelector("button[aria-haspopup=dialog] span")?.textContent }));
  check("L-10 Apply filters the list on the server (best quote + Shree), shows the active filters as removable chips and the count on the button, and keeps them in the address", (await rowsOf(lp)).length === 6 && afterFilter.badge === "2" && afterFilter.chips.some((c) => /Get Best Quote/.test(c)) && new URL(lp.url()).searchParams.get("inquiryType") === "GET_BEST_QUOTE" && new URL(lp.url()).searchParams.get("supplierId") === "shree-textiles", `${(await rowsOf(lp)).length} ${JSON.stringify(afterFilter)}`);
  await lp.reload({ waitUntil: "networkidle2" });
  check("L-11 reloading restores the filters from the address (same rows, same chips)", (await rowsOf(lp)).length === 6 && (await lp.evaluate(() => document.querySelectorAll("ul[aria-label='Active filters'] li").length)) >= 2);
  await lp.evaluate(() => [...document.querySelectorAll("ul[aria-label='Active filters'] button")].find((b) => /Clear all/.test(b.textContent)).click());
  await sleep(1500);
  check("L-12 Clear all filters brings the full list back", (await rowsOf(lp)).length === 14 && new URL(lp.url()).search === "");
  await lp.select("#inquiry-sort", "oldest");
  await sleep(1500);
  const oldestRows = await rowsOf(lp);
  check("L-13 sorting runs on the server: Oldest First puts the 100-day-old quoted inquiry first and sort=oldest in the address", /FBM-INQ-AAAAAAA5/.test(oldestRows[0]) && new URL(lp.url()).searchParams.get("sort") === "oldest");
  await lp.select("#inquiry-sort", "newest");
  await sleep(1200);
  await lp.evaluate(() => document.querySelector("tbody tr button[aria-haspopup=menu]").click());
  await sleep(200);
  const rowMenu = await lp.evaluate(() => [...document.querySelectorAll("[role=menu] [role=menuitem]")].map((m) => ({ t: m.textContent.trim(), href: m.getAttribute("href") })));
  check("L-14 a row's menu offers Track Inquiry (to the details page, #progress) and, when eligible, Cancel Inquiry; there is no View Quotation (none exists)", rowMenu[0].t === "Track Inquiry" && /^\/buyer\/inquiries\/FBM-INQ-[0-9A-Z]{8}#progress$/.test(rowMenu[0].href ?? "") && !rowMenu.some((m) => /Quotation/.test(m.t)));
  await lp.keyboard.press("Escape");
  const viewHref = await lp.evaluate(() => document.querySelector("tbody tr a.btn, tbody tr a[class*=btn]")?.getAttribute("href"));
  await lp.evaluate(() => [...document.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes("FBM-INQ-AAAAAAA2")).querySelector("a[aria-label^='View details']").click());
  await lp.waitForFunction(() => location.pathname === "/buyer/inquiries/FBM-INQ-AAAAAAA2", { timeout: 15000 }).catch(() => {});
  await sleep(500);
  check("L-15 View Details opens that inquiry's details page", new URL(lp.url()).pathname === "/buyer/inquiries/FBM-INQ-AAAAAAA2" && (await lp.evaluate(() => document.querySelector("h1")?.textContent)) === "Inquiry Details" && !!viewHref, String(viewHref));
  await lp.goBack({ waitUntil: "networkidle2" });
  await lp.waitForFunction(() => document.querySelectorAll("tbody tr").length > 0, { timeout: 15000 }).catch(() => {});
  await sleep(800);
  await sleep(1500);
  check("L-15b going Back from the details page shows the list the address names (the full list, 14 rows) and not the filtered page the browser had cached", (await rowsOf(lp)).length === 14 && new URL(lp.url()).search === "", String((await rowsOf(lp)).length));
  await lp.evaluate(() => [...document.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes("FBM-INQ-AAAAAAA2")).querySelector("button[aria-haspopup=menu]").click());
  await sleep(200);
  await lp.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].find((m) => /Cancel Inquiry/.test(m.textContent)).click());
  await sleep(400);
  const dlg = await lp.evaluate(() => ({ role: document.querySelector("[role=alertdialog]") ? "alertdialog" : "", text: document.querySelector("[role=alertdialog]")?.textContent ?? "", focus: document.activeElement?.textContent }));
  check("L-16 Cancel from the list asks first in an alert dialog that explains the effect (kept in the list as Cancelled, history kept, cannot be undone), with 'Keep inquiry' focused", dlg.role === "alertdialog" && /stays in your list as Cancelled/.test(dlg.text) && /cannot be undone/.test(dlg.text) && /Keep inquiry/.test(dlg.focus ?? "") && (await inq.findOne({ reference: "FBM-INQ-AAAAAAA2" })).status === "NOTIFIED");
  await lp.keyboard.press("Escape");
  await sleep(300);
  await lp.evaluate(() => [...document.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes("FBM-INQ-AAAAAAA2")).querySelector("button[aria-haspopup=menu]").click());
  await sleep(200);
  await lp.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].find((m) => /Cancel Inquiry/.test(m.textContent)).click());
  await sleep(400);
  await lp.evaluate(() => [...document.querySelectorAll("[role=alertdialog] button")].find((b) => /Yes, cancel inquiry/.test(b.textContent)).click());
  await sleep(3000);
  const afterCancel = await lp.evaluate(() => ({ row: [...document.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes("FBM-INQ-AAAAAAA2"))?.innerText.replace(/\s+/g, " ") ?? "", cards: [...document.querySelectorAll("ul[aria-label='Inquiry summary'] li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()), toast: document.querySelector("[aria-label='Notifications from the site'] [role=status]")?.textContent ?? "" }));
  check("L-17 confirming cancels it: the database says CANCELLED with a history entry, the toast says so, the row shows Cancelled and the Awaiting Response card went down by one (3 to 2)", (await inq.findOne({ reference: "FBM-INQ-AAAAAAA2" })).status === "CANCELLED" && /Cancelled/.test(afterCancel.row) && /Your inquiry was cancelled/.test(afterCancel.toast) && /Awaiting Response\s*2/.test(afterCancel.cards[1]) && /Total Inquiries\s*14/.test(afterCancel.cards[0]), JSON.stringify(afterCancel).slice(0, 300));
  // no-match, partial failure, offline
  await lp.type("#inquiry-search", "zzzzzzzz");
  await sleep(1800);
  check("L-18 no match: 'No matching inquiries' with a Clear filters button (not the empty-history message)", /No matching inquiries/.test(await content(lp)) && !/No Inquiries Yet/.test(await content(lp)) && /Clear filters/.test(await content(lp)));
  await clickText(lp, "button", "Clear filters");
  await sleep(1500);
  await lp.setRequestInterception(true);
  lp.on("request", (r) => (/\/api\/buyer\/inquiries\/summary/.test(r.url()) ? r.abort() : r.continue()));
  await lp.evaluate(() => window.dispatchEvent(new Event("focus")));
  await sleep(2000);
  check("L-19 a failing summary does not take the page down: the key figures section says so with Try again, and the table stays usable", /key figures could not be loaded/.test(await content(lp)) && (await rowsOf(lp)).length > 0);
  await lp.setRequestInterception(false);
  lp.removeAllListeners("request");
  await lp.setOfflineMode(true);
  await clickText(lp, "[aria-label='Filter inquiries by status'] button", "Closed");
  await sleep(1500);
  check("L-20 when the server cannot be reached the list shows an error with Try again instead of old or invented rows", /could not be loaded/.test(await content(lp)) && /Try again/.test(await content(lp)));
  await lp.setOfflineMode(false);
  await lp.context.close();
  const ep = await open("/buyer/inquiries", { session: zero.s });
  const et = await content(ep);
  check("L-21 a buyer with no inquiries sees 'No Inquiries Yet', the supporting text and an Explore Products button; zero cards; no sample rows", /No Inquiries Yet/.test(et) && /Start exploring products and contact suppliers/.test(et) && (await ep.evaluate(() => [...document.querySelectorAll("a")].some((a) => /Explore Products/.test(a.textContent) && a.getAttribute("href") === "/products"))) && /Total Inquiries\s*0/.test(et) && (await rowsOf(ep)).length === 0);
  await ep.context.close();

  // pagination UI on a buyer with 45 inquiries
  const PG = await register("pages");
  await inq.insertMany(Array.from({ length: 45 }, (_, i) => doc(PG.id, { createdAt: new Date(Date.now() - i * 3600_000), updatedAt: new Date(Date.now() - i * 3600_000) })));
  const pg = await open("/buyer/inquiries", { session: PG.s });
  await clickText(pg, "nav[aria-label='Inquiry pages'] button", "2");
  await sleep(1500);
  const pgState = await pg.evaluate(() => ({ text: document.querySelector("nav[aria-label='Inquiry pages']").textContent.replace(/\s+/g, " "), rows: document.querySelectorAll("tbody tr").length, cur: document.querySelector("nav[aria-label='Inquiry pages'] [aria-current=page]")?.textContent }));
  check("L-22 the pager: page 1 shows 20, page 2 shows the next 20 ('Showing 21 - 40 of 45 inquiries', page 2 current, page=2 in the address), and changing a filter returns to page 1", pgState.rows === 20 && /Showing 21 - 40 of 45/.test(pgState.text) && pgState.cur === "2" && new URL(pg.url()).searchParams.get("page") === "2");
  await clickText(pg, "[aria-label='Filter inquiries by status'] button", "New");
  await sleep(1500);
  check("L-23 choosing a status tab resets the page to 1", !new URL(pg.url()).searchParams.get("page") && /Showing 1 - 20 of 45/.test(await pg.evaluate(() => document.querySelector("nav[aria-label='Inquiry pages']").textContent.replace(/\s+/g, " "))));
  await pg.context.close();

  // ================= O: responsive on both pages
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const wide = [];
  for (const [path, tag] of [["/buyer/inquiries", "list"], ["/buyer/inquiries/FBM-INQ-AAAAAAA6", "detail"]]) {
    for (const w of widths) {
      const p = await open(path, { session: A.s, width: w });
      const o = await overflow(p);
      const bad = await p.evaluate(() => [...document.querySelectorAll("#buyer-content button, #buyer-content a, #buyer-content select, #buyer-content input")].filter((el) => { if (!el.getClientRects().length) return false; let box = el; for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const ox = getComputedStyle(n).overflowX; if (ox === "auto" || ox === "scroll") { box = n; break; } } const r = box.getBoundingClientRect(); return r.left < -1 || r.right > window.innerWidth + 1; }).length);
      const clipped = await p.evaluate(() => [...document.querySelectorAll("#buyer-content [class*=reference]")].filter((el) => el.getClientRects().length && el.scrollWidth > el.clientWidth + 1).length);
      if (o > 0 || bad > 0 || clipped > 0) wide.push(`${tag}@${w}: overflow ${o} outside ${bad} clipped ${clipped}`);
      if ([1440, 820, 390].includes(w)) await p.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/${tag === "list" ? "27-buyer-my-inquiries" : "28-buyer-inquiry-details"}-${w === 1440 ? "desktop-1440" : w === 820 ? "tablet-820" : "mobile-390"}.png`, fullPage: true });
      await p.context.close();
    }
  }
  check("O-01 both pages at 16 widths (320 to 2560): no horizontal overflow, no control outside the viewport, no clipped reference (the table scrolls inside its own box if needed, and below 900px the list is one card per inquiry)", wide.length === 0, wide.join("; "));
  const mob = await open("/buyer/inquiries", { session: A.s, width: 390, height: 844 });
  const mobState = await mob.evaluate(() => ({ table: getComputedStyle(document.querySelector("[class*=tableWrap]")).display, cards: getComputedStyle(document.querySelector("ul[aria-label='Your inquiries']")).display, small: [...document.querySelectorAll("#buyer-content button, #buyer-content a[class*=btn], #buyer-content select, #buyer-content input")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40; }).length }));
  check("O-02 on a phone the table gives way to one card per inquiry with touch-sized buttons (none under 40px tall)", mobState.table === "none" && mobState.cards !== "none" && mobState.small === 0, JSON.stringify(mobState));
  await mob.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Filters/.test(b.textContent)).click());
  await sleep(500);
  const sheet = await mob.evaluate(() => { const r = document.querySelector("[role=dialog] > div, [role=dialog]").getBoundingClientRect(); const d = document.querySelector("[role=dialog]").getBoundingClientRect(); return { l: d.left, r: d.right, w: window.innerWidth, bottom: d.bottom, h: window.innerHeight, ov: document.documentElement.scrollWidth - window.innerWidth }; });
  check("O-03 the filters open as a sheet that fits a 390px phone (inside the screen, no sideways scroll)", sheet.l >= -1 && sheet.r <= sheet.w + 1 && sheet.ov <= 0, JSON.stringify(sheet));
  await mob.context.close();

  if (process.env.SKIP_PERF === "1") return;
  // ================= P: performance and large data
  const Q = await register("perf");
  const suppliers = [SUP.s1, SUP.s2, SUP.s3, { supplierKey: "SLR0042", supplierName: "Delta Works", source: "catalog" }, { supplierKey: "SLR0043", supplierName: "Echo Mills", source: "catalog" }];
  const statuses = ["NEW", "NEW", "NOTIFIED", "IN_PROGRESS", "REPLIED", "QUOTED", "CLOSED", "CLOSED", "CANCELLED", "REJECTED"];
  const types = ["GET_BEST_QUOTE", "PRODUCT_INQUIRY", "GENERAL_INQUIRY", "BULK_REQUIREMENT"];
  const cats = [["textiles-fabrics", "Textiles & Fabrics"], ["packaging", "Packaging"], ["machinery", "Machinery"], [null, null]];
  const make = (i) => { const at = new Date(Date.now() - i * 40_000_000); const [ck, cn] = cats[i % 4]; return { buyerId: Q.id, buyerType: "REGISTERED", reference: refOf(i), ...suppliers[i % 5], productKey: ck ? String(i) : undefined, productName: ck ? `Product ${i % 997}` : undefined, ...(ck ? { categoryKey: ck, categoryName: cn } : {}), quantity: 100 + (i % 900), unit: "Piece", message: "Perf message", inquiryType: types[i % 4], status: statuses[i % 10], statusHistory: [{ from: null, to: "NEW", actor: "buyer", at }], createdAt: at, updatedAt: new Date(at.getTime() + (i % 7) * 3_600_000) }; };
  let have = 0;
  const report = [];
  for (const size of [100, 1000, 10000, 20000]) {
    for (let from = have; from < size; from += 5000) await inq.insertMany(Array.from({ length: Math.min(5000, size - from) }, (_, k) => make(from + k)), { ordered: false });
    have = size;
    await clearLimits();
    const sample = async (fn, n = 25) => { const out = []; let bytes = 0; for (let i = 0; i < n; i++) { const t0 = performance.now(); const r = await fn(i); out.push(performance.now() - t0); if (r.status >= 400) throw new Error(`perf call failed ${r.status} ${r.text?.slice(0, 120)}`); bytes = r.text.length; } return { p50: med(out, 0.5), p95: med(out, 0.95), p99: med(out, 0.99), bytes }; };
    const get = (path) => () => Q.s.call("GET", path, undefined, { "x-forwarded-for": nextIp() });
    await get("/api/buyer/inquiries?status=all")(); // warm: loads the catalogue once
    const lastPage = Math.ceil(size / 20);
    const m = {
      size,
      list: await sample(get("/api/buyer/inquiries")),
      status: await sample(get("/api/buyer/inquiries?status=closed")),
      search: await sample(get("/api/buyer/inquiries?q=Product%2012")),
      supplier: await sample(get("/api/buyer/inquiries?supplierId=SLR0042&sort=oldest")),
      deep: await sample(get(`/api/buyer/inquiries?page=${Math.min(lastPage, 1000)}`), 15),
      summary: await sample(get("/api/buyer/inquiries/summary")),
    };
    const refs = await inq.find({ buyerId: Q.id }, { projection: { reference: 1 } }).limit(25).toArray();
    m.detail = await sample((i) => Q.s.call("GET", `/api/buyer/inquiries/${refs[i].reference}?view=detail`, undefined, { "x-forwarded-for": nextIp() }), refs.length);
    const open25 = await inq.find({ buyerId: Q.id, status: "NEW" }, { projection: { reference: 1 } }).limit(25).toArray();
    m.cancel = await sample((i) => Q.s.call("PATCH", `/api/buyer/inquiries/${open25[i].reference}/cancel`, undefined, { "x-forwarded-for": nextIp() }), open25.length);
    const t0 = performance.now();
    const parallel = await Promise.all(Array.from({ length: 10 }, () => Q.s.call("GET", "/api/buyer/inquiries", undefined, { "x-forwarded-for": nextIp() })));
    m.parallel = performance.now() - t0;
    m.parallelOk = parallel.every((r) => r.status === 200);
    report.push(m);
    await inq.updateMany({ buyerId: Q.id, reference: { $in: open25.map((x) => x.reference) } }, { $set: { status: "NEW", updatedAt: new Date() }, $unset: { cancelledAt: "" } });
  }
  for (const r of report) console.log(`  PERF ${String(r.size).padStart(5)} inquiries: list p50 ${r.list.p50.toFixed(0)} p95 ${r.list.p95.toFixed(0)} p99 ${r.list.p99.toFixed(0)} ms (${r.list.bytes} B); status p95 ${r.status.p95.toFixed(0)}; search p95 ${r.search.p95.toFixed(0)}; supplier p95 ${r.supplier.p95.toFixed(0)}; last page p95 ${r.deep.p95.toFixed(0)}; summary p95 ${r.summary.p95.toFixed(0)} (${r.summary.bytes} B); detail p95 ${r.detail.p95.toFixed(0)}; cancel p95 ${r.cancel.p95.toFixed(0)}; 10 parallel lists ${r.parallel.toFixed(0)} ms`);
  check("P-01 against the targets at 100, 1,000, 10,000 and 20,000 inquiries (p95): listing under 400 ms (also filtered, searched and on the last page), summary under 300, detail under 300, cancel under 500", report.every((r) => r.list.p95 < 400 && r.status.p95 < 400 && r.search.p95 < 400 && r.supplier.p95 < 400 && r.deep.p95 < 400 && r.summary.p95 < 300 && r.detail.p95 < 300 && r.cancel.p95 < 500), report.map((r) => `${r.size}: list ${r.list.p95.toFixed(0)} search ${r.search.p95.toFixed(0)} deep ${r.deep.p95.toFixed(0)} summary ${r.summary.p95.toFixed(0)} detail ${r.detail.p95.toFixed(0)} cancel ${r.cancel.p95.toFixed(0)}`).join(" | "));
  check("P-02 a list page is bounded (20 rows under 25 KB even with 20,000 stored) and ten simultaneous buyer requests all succeed", report.at(-1).list.bytes < 25_000 && report.every((r) => r.parallelOk), `${report.at(-1).list.bytes} B`);
}

async function cleanup() {
  if (process.env.KEEP === "1") return;
  const mine = await users.find({ email: { $regex: `^t2728-${stamp}-` } }, { projection: { _id: 1 } }).toArray();
  const ids = mine.map((u) => u._id);
  await inq.deleteMany({ $or: [{ buyerId: { $in: ids } }, { reference: "FBM-INQ-GUEST001" }] });
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
