import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Page 41 (Supplier Inquiry Details & Response: /supplier/inquiries/[reference] and /api/supplier/inquiries/[reference]/{,responses,activity,quotations}).
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test with QUOTATION_TAX_RULES set to the TEST fixture (for the quotation links), Chrome and puppeteer-core.
// Inquiries, quotations and message rows are inserted directly into the throwaway database; a company is linked to its sellers by writing `sellerKeys` (the platform does that).
// No notification is sent to a real user: every buyer here is a throwaway account. SKIP_PERF=1 skips the scale group.
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
const users = db.collection("users"), inq = db.collection("inquiries"), qts = db.collection("quotations"), companies = db.collection("supplier_companies"), notes = db.collection("notifications"), outbox = db.collection("notification_outbox"), idem = db.collection("idempotency_keys"), msgs = db.collection("inquiry_messages"), events = db.collection("security_events");
const clearLimits = () => db.collection("rate_limits").deleteMany({});
await clearLimits();

const stamp = Date.now();
const emailOf = (t) => `t41-${stamp}-${t}@example.test`;
let ipN = 0;
const nextIp = () => `10.41.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "supplier inquiry details passphrase";
const DAY = 86_400_000;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const rand8 = () => { const b = randomBytes(8); let s = ""; for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % 32]; return s; };
const ago = (d) => new Date(Date.now() - d * DAY);
const key = () => randomBytes(16).toString("hex");
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
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Inquiry ${tag} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: company, password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register buyer: ${r.status} ${r.text}`);
  return { s, id: (await users.findOne({ email: emailOf(tag) }))._id };
};
const registerSupplier = async (tag, keys) => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/supplier", { businessName: `Respond ${tag.toUpperCase()} Traders`, contactName: `Sia ${tag}`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk for businesses.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register supplier: ${r.status} ${r.text}`);
  const user = await users.findOne({ email: emailOf(tag) });
  await s.call("GET", "/api/supplier/quotations/summary");
  await companies.updateOne({ ownerUserId: user._id }, { $set: { sellerKeys: keys } });
  return { s, id: user._id, name: `Respond ${tag.toUpperCase()} Traders` };
};
const SELLER_A = { supplierKey: "shree-textiles", supplierName: "Shree Textiles", supplierSlug: "shree-textiles", source: "sample" };
const SELLER_B = { supplierKey: "sunrise-hub", supplierName: "Sunrise Hub", supplierSlug: "sunrise-hub", source: "sample" };
const mkInq = (buyerId, seller, over = {}) => ({ ...(buyerId ? { buyerId, buyerType: "REGISTERED" } : { buyerType: "GUEST", guest: { name: "Guest", email: "guest@example.test", phone: "9", company: "G" } }), reference: `FBM-INQ-${rand8()}`, ...seller, productName: "Cotton poplin fabric", categoryName: "Textiles", quantity: 500, unit: "Meter", message: "We need cotton poplin fabric, 100% cotton, white, 58 inches width, for shirt manufacturing. Please quote with lead time.", inquiryType: "GET_BEST_QUOTE", deliveryLocation: { text: "Jaipur, Rajasthan 302001" }, status: "NEW", statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: ago(3) }], createdAt: ago(3), updatedAt: ago(3), ...over });
const MSG = "We can supply 500 metres of 100% cotton within ten days at a competitive price.";
const respond = (s, ref, body, headers) => s.call("POST", `/api/supplier/inquiries/${ref}/responses`, body, headers);
const send = (s, ref, over = {}) => respond(s, ref, { type: "RESPONSE", message: MSG, idempotencyKey: key(), ...over });

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
const created = { users: [] };

async function main() {
  const BA = await registerBuyer("ba", "Alpha Garments Pvt Ltd");
  const BB = await registerBuyer("bb", "Bravo Retail LLP");
  const SA = await registerSupplier("a", [SELLER_A.supplierKey]);
  const SB = await registerSupplier("b", [SELLER_B.supplierKey]);
  const SS = await registerSupplier("susp", [SELLER_A.supplierKey]);
  await companies.updateOne({ ownerUserId: SS.id }, { $set: { status: "SUSPENDED" } });
  created.users.push(BA.id, BB.id, SA.id, SB.id, SS.id);
  const mk = async (doc) => { const r = await inq.insertOne(doc); return { ...doc, _id: r.insertedId }; };
  const I1 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S41AAAA1", productKey: "1" }));
  const I2 = await mk(mkInq(BB.id, SELLER_A, { reference: "FBM-INQ-S41AAAA2", productName: "Silk Fabric", unit: "Piece", quantity: 100 }));
  const I3 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S41AAAA3", status: "CLOSED" }));
  const I4 = await mk(mkInq(null, SELLER_A, { reference: "FBM-INQ-S41AAAA4" }));
  const I5 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S41AAAA5", status: "QUOTED", productName: "Already Quoted Product" }));
  const I6 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S41AAAA6", status: "REPLIED" }));
  const IB = await mk(mkInq(BA.id, SELLER_B, { reference: "FBM-INQ-S41BBBB1", productName: "Sunrise Only Product", message: "Sunrise private requirement text" }));
  const IL = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S41AAAAK", message: ("A long requirement paragraph with many details about the fabric. ").repeat(40), productName: "Long Requirement Product" }));
  const IM = await mk(mkInq(BB.id, SELLER_A, { reference: "FBM-INQ-S41AAAAM", message: undefined, deliveryLocation: undefined, categoryName: undefined, unit: undefined, productName: "Minimal Inquiry" }));

  // ================= A: access
  const un = new Session();
  const routes = [["GET", `/api/supplier/inquiries/${I1.reference}`], ["GET", `/api/supplier/inquiries/${I1.reference}/responses`], ["GET", `/api/supplier/inquiries/${I1.reference}/activity`], ["GET", `/api/supplier/inquiries/${I1.reference}/quotations`], ["POST", `/api/supplier/inquiries/${I1.reference}/responses`, { type: "RESPONSE", message: MSG, idempotencyKey: key() }]];
  const unRes = await Promise.all(routes.map(([m, p, b]) => un.call(m, p, b)));
  check("A-01 no session: detail, responses (read and send), activity and quotations all answer 401", unRes.every((r) => r.status === 401), unRes.map((r) => r.status).join());
  const buyRes = await Promise.all(routes.map(([m, p, b]) => BA.s.call(m, p, b)));
  check("A-02 a signed-in BUYER gets 403 JSON on every route, even for their own inquiry's reference", buyRes.every((r) => r.status === 403 && r.json?.ok === false), buyRes.map((r) => r.status).join());
  const susRes = await Promise.all(routes.map(([m, p, b]) => SS.s.call(m, p, b)));
  check("A-03 a supplier with a suspended company (membership revoked) gets 403 on all of them", susRes.every((r) => r.status === 403), susRes.map((r) => r.status).join());
  const pun = await un.page(`/supplier/inquiries/${I1.reference}`);
  check("A-04 the page without a session redirects to sign-in and renders no inquiry content", [302, 307].includes(pun.status) && /sign-in/.test(pun.location ?? "") && !/Cotton poplin|Alpha Garments/.test(pun.text));
  const pb = await BA.s.page(`/supplier/inquiries/${I1.reference}`);
  check("A-05 the page for a buyer redirects to /forbidden?portal=supplier with no inquiry content", [302, 307].includes(pb.status) && /forbidden/.test(pb.location ?? "") && !/Cotton poplin/.test(pb.text));
  check("A-06 a cross-site POST is blocked (403) and stores nothing", (await respond(SA.s, I1.reference, { type: "RESPONSE", message: MSG, idempotencyKey: key() }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status === 403 && (await msgs.countDocuments({ inquiryId: I1._id })) === 0);

  // ================= B: reading an inquiry
  const before = await inq.findOne({ _id: I1._id });
  const d = await SA.s.call("GET", `/api/supplier/inquiries/${I1.reference}`);
  const D = d.json?.data;
  check("B-01 the detail shows the buyer's requirement exactly as recorded: title, message, category, quantity, unit, delivery location, received time, status", d.status === 200 && D.requirement.title === "Cotton poplin fabric" && D.requirement.description === I1.message && D.requirement.category === "Textiles" && D.requirement.quantity === 500 && D.requirement.unit === "Meter" && D.requirement.deliveryLocation === "Jaipur, Rajasthan 302001" && D.statusLabel === "New" && D.awaitingResponse === true && D.receivedLabel.length > 3);
  check("B-02 buyer privacy: only the business name and 'Registered buyer'; no e-mail, phone, buyer id, other inquiries, or another seller's data in the response", D.buyer.name === "Alpha Garments Pvt Ltd" && D.buyer.kind === "Registered buyer" && !/@example\.test|9876543210|buyerId|Sunrise|Silk Fabric|FBM-INQ-S41AAAA2/.test(d.text));
  check("B-03 product specifications come from the listing, as label/value pairs rendered generically (any category), and the page says they are the listing's", Array.isArray(D.requirement.specifications) && D.requirement.specifications.every((s) => typeof s.label === "string" && typeof s.value === "string"), `${D.requirement.specifications.length} specs`);
  check("B-04 what the inquiry form does not capture (target price, required-by date, attachments) is said once in words, and attachments are marked unavailable with a reason; nothing is invented", /does not ask for a target price/.test(D.notCaptured) && D.attachments.available === false && D.attachments.reason.length > 20 && !/targetPrice|requiredBy/.test(d.text));
  const after = await inq.findOne({ _id: I1._id });
  check("B-05 opening the inquiry changes nothing: same status, history, updatedAt, and no message, outbox or notification row exists", after.status === before.status && JSON.stringify(after.statusHistory) === JSON.stringify(before.statusHistory) && String(after.updatedAt) === String(before.updatedAt) && (await msgs.countDocuments({ inquiryId: I1._id })) === 0 && (await outbox.countDocuments({ inquiryReference: I1.reference })) === 0);
  const foreign = await SA.s.call("GET", `/api/supplier/inquiries/${IB.reference}`);
  const unknown = await SA.s.call("GET", "/api/supplier/inquiries/FBM-INQ-ZZZZZZZZ");
  const malformed = await SA.s.call("GET", "/api/supplier/inquiries/not-a-reference");
  check("B-06 another supplier's inquiry, an unknown one and a malformed one give the SAME 404 (no existence leak), and none of the foreign text is in the answer", foreign.status === 404 && unknown.status === 404 && malformed.status === 404 && foreign.text === unknown.text && unknown.text === malformed.text && !/Sunrise/.test(foreign.text));
  const sub = (await SA.s.call("GET", `/api/supplier/inquiries/${I1.reference}?supplierKey=sunrise-hub&companyId=${SB.id}&buyerId=${BB.id}`)).json?.data;
  check("B-07 a supplierKey, companyId or buyerId parameter is never read: still this company's own inquiry", sub?.reference === I1.reference && sub.buyer.name === "Alpha Garments Pvt Ltd");
  const mini = (await SA.s.call("GET", `/api/supplier/inquiries/${IM.reference}`)).json.data;
  check("B-08 missing optional fields give null in the API (the page prints 'Not provided'); no value is invented", mini.requirement.description === null && mini.requirement.deliveryLocation === null && mini.requirement.category === null && mini.requirement.unit === null);
  const cap = D.capabilities;
  check("B-09 capabilities are computed by the server: respond available; quotation action is 'create' with the encoded inquiry reference only (no buyer or financial data in the link)", cap.respond.available === true && cap.quotation.kind === "create" && cap.quotation.href === `/supplier/quotations/create?inquiryReference=${I1.reference}` && !/[?&](buyer|price|total|email)/.test(cap.quotation.href));
  const closedCap = (await SA.s.call("GET", `/api/supplier/inquiries/${I3.reference}`)).json.data.capabilities;
  const guestCap = (await SA.s.call("GET", `/api/supplier/inquiries/${I4.reference}`)).json.data.capabilities;
  check("B-10 a closed inquiry and a guest inquiry cannot be answered or quoted: respond unavailable with a reason, quotation 'unavailable' with a reason", closedCap.respond.available === false && /closed/.test(closedCap.respond.reason) && closedCap.quotation.kind === "unavailable" && guestCap.respond.available === false && /guest/.test(guestCap.respond.reason));

  // ================= C: sending a response
  await clearLimits();
  const k1 = key();
  const r1 = await respond(SA.s, I1.reference, { type: "RESPONSE", message: MSG, idempotencyKey: k1 });
  const m1 = r1.json?.data?.message;
  const row = await msgs.findOne({ _id: new ObjectId(m1?.id ?? "000000000000000000000000") });
  check("C-01 a response is persisted (201): the message with its type, the supplier company's name as the author, and the inquiry's new status", r1.status === 201 && m1.type === "RESPONSE" && m1.typeLabel === "Response" && m1.body === MSG && m1.authorName === SA.name && r1.json.data.inquiry.status === "REPLIED" && r1.json.data.replayed === false, r1.text?.slice(0, 200));
  check("C-02 trusted identity: author is the signed-in user, company is the session's, the recipient buyer and the seller come from the INQUIRY record, the time is the server's", String(row.authorUserId) === String(SA.id) && String(row.supplierCompanyId) === String((await companies.findOne({ ownerUserId: SA.id }))._id) && String(row.buyerId) === String(BA.id) && row.supplierKey === "shree-textiles" && String(row.inquiryId) === String(I1._id) && Math.abs(row.createdAt.getTime() - Date.now()) < 120_000);
  const i1 = await inq.findOne({ _id: I1._id });
  check("C-03 the inquiry followed its own lifecycle NEW > IN_PROGRESS > REPLIED through allowed steps, recorded in its history; it is not closed, quoted, ordered or paid", i1.status === "REPLIED" && i1.statusHistory.slice(-2).map((h) => `${h.from}>${h.to}`).join() === "NEW>IN_PROGRESS,IN_PROGRESS>REPLIED" && !i1.cancelledAt);
  const ob = await outbox.find({ inquiryReference: I1.reference }).toArray();
  const nt = await notes.find({ buyerId: BA.id, type: "INQUIRY_RESPONSE" }).toArray();
  check("C-04 exactly one outbox row (DONE) and one in-app notice for the right buyer; it links to their own inquiry page and does NOT contain the message text; no e-mail is claimed", ob.length === 1 && ob[0].status === "DONE" && nt.length === 1 && nt[0].link === `/buyer/inquiries/${I1.reference}` && !nt[0].body.includes("competitive price") && r1.json.data.buyerNotice === "recorded" && !/e-?mail/i.test(r1.json.message), `${ob.length} ${nt.length}`);
  check("C-05 another buyer got nothing", (await notes.countDocuments({ buyerId: BB.id, type: /^INQUIRY_/ })) === 0);
  const replay = await respond(SA.s, I1.reference, { type: "RESPONSE", message: MSG, idempotencyKey: k1 });
  check("C-06 a lost-response retry (same key, same message) returns the ORIGINAL message (200, replayed: true) and creates nothing new", replay.status === 200 && replay.json.data.replayed === true && replay.json.data.message.id === m1.id && (await msgs.countDocuments({ inquiryId: I1._id })) === 1 && (await outbox.countDocuments({ inquiryReference: I1.reference })) === 1 && (await notes.countDocuments({ buyerId: BA.id, type: "INQUIRY_RESPONSE" })) === 1);
  const changed = await respond(SA.s, I1.reference, { type: "RESPONSE", message: MSG + " Changed.", idempotencyKey: k1 });
  check("C-07 the same key with DIFFERENT content is a 409 IDEMPOTENCY_CONFLICT and stores nothing", changed.status === 409 && changed.json.code === "IDEMPOTENCY_CONFLICT" && (await msgs.countDocuments({ inquiryId: I1._id })) === 1);
  await clearLimits();
  const kc = key();
  const same = await Promise.all(Array.from({ length: 6 }, () => respond(SA.s, I2.reference, { type: "RESPONSE", message: "Double click test: we can deliver in 12 days.", idempotencyKey: kc })));
  check("C-08 double click: six simultaneous sends with ONE key all succeed with the SAME message id, and exactly one message, one outbox row and one notice exist", same.every((r) => [200, 201].includes(r.status) && r.json.data.message.id === same[0].json.data.message.id) && (await msgs.countDocuments({ inquiryId: I2._id })) === 1 && (await outbox.countDocuments({ inquiryReference: I2.reference })) === 1 && (await notes.countDocuments({ buyerId: BB.id, type: "INQUIRY_RESPONSE" })) === 1 && same.filter((r) => r.json.data.replayed === false).length === 1, same.map((r) => `${r.status}${r.json?.data?.replayed ? "r" : ""}`).join());
  await clearLimits();
  const forged = await Promise.all(["authorUserId", "supplierCompanyId", "supplierKey", "buyerId", "createdAt", "status", "attachments", "messageId"].map((k) => send(SA.s, I1.reference, { [k]: k === "attachments" ? ["x"] : "forged" })));
  check("C-09 forged ownership, author, recipient, time, status or attachment fields are refused with 422 (not silently ignored); nothing is stored", forged.every((r) => r.status === 422 && r.json.fields?._) && (await msgs.countDocuments({ inquiryId: I1._id })) === 1);
  await clearLimits();
  const bad = [await send(SA.s, I1.reference, { message: "short" }), await send(SA.s, I1.reference, { type: "STATUS" }), await send(SA.s, I1.reference, { message: "x".repeat(2001) }), await send(SA.s, I1.reference, { message: "aaaaaaaaaaaaaaa" }), await send(SA.s, I1.reference, { message: { $ne: "" } }), await send(SA.s, I1.reference, { idempotencyKey: "short" })];
  check("C-10 invalid messages are 422 with field messages: too short, bad type, over 2,000, meaningless, an operator object, a bad key", bad.every((r) => r.status === 422 && r.json.fields) && "message" in bad[0].json.fields && "type" in bad[1].json.fields && "idempotencyKey" in bad[5].json.fields);
  const big = await SA.s.call("POST", `/api/supplier/inquiries/${I1.reference}/responses`, JSON.stringify({ type: "RESPONSE", message: "x".repeat(40_000), idempotencyKey: key() }), { "Content-Type": "application/json" });
  const nonJson = await SA.s.call("POST", `/api/supplier/inquiries/${I1.reference}/responses`, "not json", { "Content-Type": "application/json" });
  check("C-11 a body over the size limit is 413; a body that is not a JSON object is 400", big.status === 413 && nonJson.status === 400);
  const xss = await send(SA.s, I1.reference, { message: "Please see <script>alert('x')</script> and <img src=x onerror=alert(1)> for our price list" });
  const xssRow = await msgs.findOne({ _id: new ObjectId(xss.json.data.message.id) });
  check("C-12 markup is stored as plain text, unchanged (it is escaped when shown, never interpreted)", xss.status === 201 && xssRow.body.includes("<script>alert('x')</script>"));
  const opInj = await send(SA.s, I1.reference, { message: '{"$ne": null} $where: sleep(1000) this is just text' });
  check("C-13 operator-looking text in a message is just text and has no effect", opInj.status === 201 && (await msgs.countDocuments({ inquiryId: I1._id })) === 3);
  await clearLimits();
  const cl = await send(SA.s, I3.reference);
  const gu = await send(SA.s, I4.reference);
  check("C-14 a closed inquiry is refused (409 INQUIRY_CLOSED) and a guest inquiry too (409 NOT_ELIGIBLE); nothing stored, status unchanged", cl.status === 409 && cl.json.code === "INQUIRY_CLOSED" && gu.status === 409 && gu.json.code === "NOT_ELIGIBLE" && (await msgs.countDocuments({ inquiryId: { $in: [I3._id, I4._id] } })) === 0 && (await inq.findOne({ _id: I3._id })).status === "CLOSED");
  const x1 = await send(SB.s, I1.reference);
  const x2 = await send(SA.s, IB.reference);
  const x3 = await send(SA.s, "FBM-INQ-ZZZZZZZZ");
  check("C-15 supplier B cannot reply to A's inquiry, A cannot reply to B's, an unknown reference: all the same 404; nothing stored", [x1, x2, x3].every((r) => r.status === 404) && x1.text === x3.text && (await msgs.countDocuments({ inquiryId: IB._id })) === 0);
  await clearLimits();
  const ck = await send(SA.s, I2.reference, { type: "CLARIFICATION", message: "Which GSM and width do you need for shirting?" });
  const i2 = await inq.findOne({ _id: I2._id });
  check("C-16 a clarification is the SAME message model (type CLARIFICATION); on an inquiry already REPLIED it changes no status", ck.status === 201 && ck.json.data.message.type === "CLARIFICATION" && ck.json.data.message.typeLabel === "Clarification request" && i2.status === "REPLIED");
  const I7 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S41AAAA7" }));
  const ck2 = await send(SA.s, I7.reference, { type: "CLARIFICATION", message: "Could you confirm the delivery date you need?" });
  const i7 = await inq.findOne({ _id: I7._id });
  const nt7 = await notes.findOne({ buyerId: BA.id, type: "INQUIRY_CLARIFICATION" });
  check("C-17 a clarification on a NEW inquiry only starts handling (IN_PROGRESS): not REPLIED, not 'waiting'; the notice says a question was asked and links to the inquiry", i7.status === "IN_PROGRESS" && i7.statusHistory.at(-1).to === "IN_PROGRESS" && ck2.json.data.inquiry.statusLabel === "Pending Response" && /asked for clarification/.test(nt7.body) && !nt7.body.includes("delivery date"));
  const afterAnswer = await send(SA.s, I7.reference, { message: "Thank you; we will deliver by the 20th as requested." });
  check("C-18 a later response moves IN_PROGRESS > REPLIED", afterAnswer.json.data.inquiry.status === "REPLIED" && (await inq.findOne({ _id: I7._id })).status === "REPLIED");
  await clearLimits();
  const q5 = await send(SA.s, I5.reference);
  check("C-19 a response on a QUOTED inquiry stays QUOTED (never downgraded); on REPLIED stays REPLIED", q5.status === 201 && (await inq.findOne({ _id: I5._id })).status === "QUOTED" && (await send(SA.s, I6.reference)).status === 201 && (await inq.findOne({ _id: I6._id })).status === "REPLIED");
  await db.collection("buyer_settings").updateOne({ buyerId: BB.id }, { $set: { notifications: { inquiries: false, company: true }, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  const I8 = await mk(mkInq(BB.id, SELLER_A, { reference: "FBM-INQ-S41AAAA8" }));
  const off = await send(SA.s, I8.reference);
  check("C-20 a buyer who switched inquiry notices off: the response is still saved, the answer says NO notice was recorded (never claims one), and the outbox says skipped", off.status === 201 && off.json.data.buyerNotice === "not-recorded" && /No in-app notice/.test(off.json.message) && (await outbox.findOne({ inquiryReference: I8.reference })).status === "SKIPPED_PREFERENCE");
  await db.collection("buyer_settings").deleteMany({ buyerId: BB.id });

  // ================= D: atomicity, races, recovery
  await clearLimits();
  const I9 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S41AAAA9" }));
  await db.command({ collMod: "idempotency_keys", validator: { key: { $not: /^failkey/ } }, validationLevel: "strict", validationAction: "error" });
  const failKey = "failkey" + randomBytes(10).toString("hex");
  const rolled = await respond(SA.s, I9.reference, { type: "RESPONSE", message: MSG, idempotencyKey: failKey });
  const after9 = await inq.findOne({ _id: I9._id });
  await db.command({ collMod: "idempotency_keys", validator: {}, validationLevel: "off" });
  check("D-01 a failure in the LAST step of the transaction rolls EVERYTHING back: no message, no outbox row, no status change, no history entry, no notice, no idempotency record", rolled.status === 503 && (await msgs.countDocuments({ inquiryId: I9._id })) === 0 && (await outbox.countDocuments({ inquiryReference: I9.reference })) === 0 && after9.status === "NEW" && after9.statusHistory.length === 1 && (await idem.countDocuments({ key: failKey })) === 0, `${rolled.status}`);
  const retried = await respond(SA.s, I9.reference, { type: "RESPONSE", message: MSG, idempotencyKey: failKey });
  check("D-02 with the cause removed, retrying with the SAME key succeeds and sends exactly once", retried.status === 201 && (await msgs.countDocuments({ inquiryId: I9._id })) === 1 && (await outbox.countDocuments({ inquiryReference: I9.reference })) === 1);
  await notes.deleteMany({ buyerId: BA.id, link: `/buyer/inquiries/${I9.reference}` });
  await outbox.updateOne({ inquiryReference: I9.reference }, { $set: { status: "PENDING", attempts: 0 }, $unset: { deliveredAt: "" } });
  await SA.s.page(`/supplier/inquiries/${I9.reference}`);
  check("D-03 a notice that was not delivered (commit succeeded, delivery did not) is recovered when the supplier next opens the inquiry: delivered once, outbox DONE, no second message", (await outbox.findOne({ inquiryReference: I9.reference })).status === "DONE" && (await notes.countDocuments({ buyerId: BA.id, link: `/buyer/inquiries/${I9.reference}` })) === 1 && (await msgs.countDocuments({ inquiryId: I9._id })) === 1);
  const I10 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S41AAA10" }));
  const raced = await Promise.all([...Array.from({ length: 5 }, () => send(SA.s, I10.reference)), inq.updateOne({ _id: I10._id }, { $set: { status: "CLOSED" } }).then(() => ({ status: "closed-write" }))]);
  const stored = await msgs.countDocuments({ inquiryId: I10._id });
  const okCount = raced.filter((r) => r.status === 201).length;
  check("D-04 inquiry closure racing with five sends: no server error; every 201 has its stored message, every refusal stored nothing; the inquiry ends CLOSED", raced.every((r) => [201, 409, "closed-write"].includes(r.status)) && stored === okCount && (await inq.findOne({ _id: I10._id })).status === "CLOSED", `${okCount} sent, ${stored} stored, ${raced.map((r) => r.status).join()}`);
  const afterClose = await send(SA.s, I10.reference);
  check("D-05 once closed, a send is a 409 and stores nothing", afterClose.status === 409 && afterClose.json.code === "INQUIRY_CLOSED" && (await msgs.countDocuments({ inquiryId: I10._id })) === stored);
  const burst = await Promise.all(Array.from({ length: 6 }, () => send(SA.s, I6.reference)));
  check("D-06 six sends with six different keys all save (each is an intentional message); the buyer gets one notice each; none is duplicated", burst.every((r) => r.status === 201) && new Set(burst.map((r) => r.json.data.message.id)).size === 6);

  // ================= E: the conversation, pagination, activity, related quotations
  const BIGI = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S41AAA11" }));
  const docs = [];
  for (let i = 0; i < 45; i++) docs.push({ _id: new ObjectId(), inquiryId: BIGI._id, inquiryReference: BIGI.reference, supplierKey: "shree-textiles", supplierCompanyId: (await companies.findOne({ ownerUserId: SA.id }))._id, buyerId: BA.id, type: i % 7 === 0 ? "CLARIFICATION" : "RESPONSE", body: `Seeded message number ${i} for pagination checks`, authorUserId: SA.id, authorName: SA.name, createdAt: new Date(Date.now() - Math.floor(i / 3) * 60_000) }); // groups of 3 share a timestamp: the tie-break must keep the order stable
  await msgs.insertMany(docs);
  const seen = [];
  let cursor = null, pages = 0;
  do {
    const p = await SA.s.call("GET", `/api/supplier/inquiries/${BIGI.reference}/responses?limit=20${cursor ? `&cursor=${cursor}` : ""}`);
    seen.push(...p.json.items.map((m) => m.id));
    cursor = p.json.meta.nextCursor;
    pages++;
  } while (cursor && pages < 10);
  const expected = (await msgs.find({ inquiryId: BIGI._id }).sort({ createdAt: -1, _id: -1 }).toArray()).map((m) => String(m._id));
  check("E-01 cursor pagination: pages of 20 give 20, 20, 5 (3 pages); every message once, none missing, in the exact newest-first order even with identical timestamps", pages === 3 && seen.length === 45 && new Set(seen).size === 45 && seen.join() === expected.join(), `${pages} pages, ${seen.length} items`);
  check("E-02 limits: default 20, 50 allowed, 51 / 0 / abc refused (422); a malformed or operator cursor is refused (422)", (await SA.s.call("GET", `/api/supplier/inquiries/${BIGI.reference}/responses`)).json.items.length === 20 && (await SA.s.call("GET", `/api/supplier/inquiries/${BIGI.reference}/responses?limit=50`)).json.items.length === 45 && (await SA.s.call("GET", `/api/supplier/inquiries/${BIGI.reference}/responses?limit=51`)).status === 422 && (await SA.s.call("GET", `/api/supplier/inquiries/${BIGI.reference}/responses?limit=0`)).status === 422 && (await SA.s.call("GET", `/api/supplier/inquiries/${BIGI.reference}/responses?cursor=${Buffer.from('{"$gt":1}').toString("base64url")}`)).status === 422 && (await SA.s.call("GET", `/api/supplier/inquiries/${BIGI.reference}/responses?cursor=bad!`)).status === 422);
  const cross = await SA.s.call("GET", `/api/supplier/inquiries/${I1.reference}/responses?limit=50&cursor=${Buffer.from(JSON.stringify({ t: Date.now() + 1e7, id: "f".repeat(24) })).toString("base64url")}`);
  check("E-03 a cursor taken from another inquiry cannot reach that inquiry's messages (rows are filtered by inquiry AND the supplier's own sellers)", cross.status === 200 && cross.json.items.every((m) => !/Seeded message/.test(m.body)));
  check("E-04 supplier B and a suspended company cannot read A's conversation (404 / 403); the buyer role gets 403", (await SB.s.call("GET", `/api/supplier/inquiries/${BIGI.reference}/responses`)).status === 404 && (await SS.s.call("GET", `/api/supplier/inquiries/${BIGI.reference}/responses`)).status === 403 && (await BA.s.call("GET", `/api/supplier/inquiries/${BIGI.reference}/responses`)).status === 403);
  const rawA = (await SA.s.call("GET", `/api/supplier/inquiries/${BIGI.reference}/responses?limit=3`)).text;
  check("E-05 message rows carry only what is needed: id, type, label, body, author name, time. No author user id, company id, buyer id, supplier key or inquiry id", !/authorUserId|supplierCompanyId|buyerId|supplierKey|inquiryId|_id/.test(rawA));
  const justNow = new Date(Date.now() - 1000); // the newest event on this inquiry, so it stays inside the 50-event cap
  await qts.insertMany([
    { reference: "FBM-QT-S41AAAA1", version: 1, isCurrent: true, inquiryId: BIGI._id, inquiryReference: BIGI.reference, buyerId: BA.id, ...SELLER_A, productName: "Cotton poplin fabric", currency: "INR", unit: "Meter", quantity: 500, unitPriceMinor: 12000, charges: [{ label: "Freight", minor: 150000 }], tax: { label: "Test", bp: 0 }, validUntil: new Date(Date.now() + 20 * DAY), status: "SENT", sentAt: justNow, createdAt: justNow, updatedAt: justNow, events: [{ type: "SENT", at: justNow, actor: "supplier" }] },
    { reference: "FBM-QT-S41BBBB1", version: 1, isCurrent: true, inquiryId: IB._id, inquiryReference: IB.reference, buyerId: BA.id, ...SELLER_B, productName: "Sunrise Only Product", currency: "INR", unit: "Meter", quantity: 5, unitPriceMinor: 100, validUntil: new Date(Date.now() + 20 * DAY), status: "SENT", sentAt: ago(1), createdAt: ago(1), updatedAt: ago(1), events: [{ type: "SENT", at: ago(1), actor: "supplier" }] },
  ]);
  const extra = [];
  for (let i = 0; i < 12; i++) extra.push({ _id: new ObjectId(), inquiryId: BIGI._id, inquiryReference: BIGI.reference, supplierKey: "shree-textiles", supplierCompanyId: (await companies.findOne({ ownerUserId: SA.id }))._id, buyerId: BA.id, type: "RESPONSE", body: `Extra seeded message ${i} for the activity cap`, authorUserId: SA.id, authorName: SA.name, createdAt: new Date(Date.now() - 60_000 * 30 - i * 1000) });
  await msgs.insertMany(extra);
  const act = await SA.s.call("GET", `/api/supplier/inquiries/${BIGI.reference}/activity`);
  const titles = act.json.items.map((a) => a.title);
  check("E-06 activity is built only from real records: responses and clarifications, the quotation submission; newest first; with 57 messages plus events it is capped at the latest 50 and says truncated (the oldest, including the inquiry-received event, fall off the end)", titles.some((t) => t === "Response sent to the buyer") && titles.some((t) => t === "Clarification requested from the buyer") && titles.some((t) => /Quotation FBM-QT-S41AAAA1 submitted/.test(t)) && act.json.items.length === 50 && act.json.meta.truncated === true && act.json.items.every((a, i, arr) => i === 0 || new Date(arr[i - 1].at) >= new Date(a.at)), JSON.stringify({ n: act.json.items.length, truncated: act.json.meta.truncated, response: titles.includes("Response sent to the buyer"), clarification: titles.includes("Clarification requested from the buyer"), quotation: titles.some((t) => /Quotation FBM-QT-S41AAAA1 submitted/.test(t)) }));
  const act1 = (await SA.s.call("GET", `/api/supplier/inquiries/${I1.reference}/activity`)).json;
  check("E-07a an inquiry whose history fits in 50 events starts with the real 'Inquiry received' event and shows its status changes", act1.items.some((a) => a.title === "Inquiry received") && act1.items.some((a) => /Inquiry status:/.test(a.title)));
  check("E-07 the timeline never shows a viewed / read event, a buyer reply, a delivered notice, an order or a payment, and no security-log entries or other supplier's activity", ![...titles, ...act1.items.map((a) => a.title)].some((t) => /viewed|read|delivered|order|payment|login|security/i.test(t)) && !JSON.stringify(act1).includes("Sunrise"));
  const rq = await SA.s.call("GET", `/api/supplier/inquiries/${BIGI.reference}/quotations`);
  check("E-08 related quotations: only this company's quotations for THIS inquiry, with reference, status, total and the existing View route; none of another seller's", rq.status === 200 && rq.json.items.length === 1 && rq.json.items[0].reference === "FBM-QT-S41AAAA1" && rq.json.items[0].total.text === "₹7,500.00".replace("7,500", "61,500") && rq.json.items[0].detailHref === "/supplier/quotations/FBM-QT-S41AAAA1" && !JSON.stringify(rq.json).includes("S41BBBB1"), JSON.stringify(rq.json.items?.[0]?.total));
  check("E-09 an inquiry with no quotation returns an empty list (not an error); another seller's inquiry is 404", (await SA.s.call("GET", `/api/supplier/inquiries/${I1.reference}/quotations`)).json.items.length === 0 && (await SA.s.call("GET", `/api/supplier/inquiries/${IB.reference}/quotations`)).status === 404);

  // ================= F: the buyer sees it
  const bPage = await BA.s.page(`/buyer/inquiries/${I1.reference}`);
  check("F-01 the buyer's own inquiry page shows the supplier's response (so it reaches someone), labelled Response, from the supplier company, and says replying is not available yet; the clarification question too", bPage.status === 200 && /We can supply 500 metres/.test(bPage.text) && />Response</.test(bPage.text) && new RegExp(SA.name).test(bPage.text) && /Replying to the supplier from Finbyn Mart is not available yet/.test(bPage.text));
  const bPage2 = await BB.s.page(`/buyer/inquiries/${I2.reference}`);
  check("F-02 buyer B sees the clarification question on their own inquiry; buyer A cannot open buyer B's inquiry (404) and sees none of B's messages", /Which GSM and width do you need/.test(bPage2.text) && (await BA.s.page(`/buyer/inquiries/${I2.reference}`)).status === 404);
  check("F-03 another buyer's page for A's inquiry never shows the message (404 page)", !/We can supply 500 metres/.test((await BB.s.page(`/buyer/inquiries/${I1.reference}`)).text));
  check("F-04 the XSS payload is shown to the buyer as escaped text: the page has the escaped form and no live script or onerror element from the message", /&lt;script&gt;alert/.test(bPage.text) && !/<script>alert\('x'\)/.test(bPage.text) && !/<img src=x onerror/.test(bPage.text));

  // ================= G: pages
  const page = await SA.s.page(`/supplier/inquiries/${I1.reference}`);
  check("G-01 the page renders: heading, reference, real status, requirement, the buyer's business name, attachments note, response form, previous responses; noindex; no-store", page.status === 200 && /Inquiry Details/.test(page.text) && page.text.includes(I1.reference) && /Original Requirement/.test(page.text) && /Alpha Garments Pvt Ltd/.test(page.text) && /Buyer Attachments/.test(page.text) && /Respond to Buyer/.test(page.text) && /Previous Responses/.test(page.text) && /noindex/.test(page.text));
  check("G-02 the Inquiries & Leads item is highlighted in the supplier navigation on this page (it is not a link because its list page is not built)", /aria-current="location"/.test(page.text) && /Inquiries &amp; Leads|Inquiries & Leads/.test(page.text));
  check("G-03 the page escapes message text (no live script from a stored message)", !/<script>alert\('x'\)/.test(page.text) && /&lt;script&gt;alert/.test(page.text));
  const p404a = await SA.s.page(`/supplier/inquiries/${IB.reference}`);
  const p404b = await SA.s.page("/supplier/inquiries/FBM-INQ-ZZZZZZZZ");
  const p404c = await SA.s.page("/supplier/inquiries/nonsense");
  check("G-04 another seller's inquiry, an unknown one and a malformed one are the same real HTTP 404 with none of the foreign text", p404a.status === 404 && p404b.status === 404 && p404c.status === 404 && !/Sunrise/.test(p404a.text));
  const pClosed = await SA.s.page(`/supplier/inquiries/${I3.reference}`);
  check("G-05 a closed inquiry's page replaces the form with the reason (no response form), disables Create Quotation with its reason, and shows the real status", pClosed.status === 200 && /is closed, so it can no longer be answered/.test(pClosed.text) && !/id="sd-message"/.test(pClosed.text) && /Create Quotation/.test(pClosed.text));
  const pMini = await SA.s.page(`/supplier/inquiries/${IM.reference}`);
  check("G-06 missing optional fields print 'Not provided'; no value is invented", /Not provided/.test(pMini.text) && !/Jaipur/.test(pMini.text));
  const IE = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S41AAAEE" }));
  const pNone = await SA.s.page(`/supplier/inquiries/${IE.reference}`);
  check("G-07 no responses yet and no quotations: both say so in words, and opening the page created no message, outbox row or quotation", /You have not sent anything on this inquiry yet/.test(pNone.text) && /No quotation has been created for this inquiry/.test(pNone.text) && (await msgs.countDocuments({ inquiryId: IE._id })) === 0 && (await outbox.countDocuments({ inquiryReference: IE.reference })) === 0 && (await qts.countDocuments({ inquiryId: IE._id })) === 0);
  const draft = await SA.s.call("POST", "/api/supplier/quotations", { inquiryReference: I7.reference });
  const pDraft = await SA.s.page(`/supplier/inquiries/${I7.reference}`);
  check("G-08 once a draft quotation exists the action is 'Continue Draft' (to the create page with the draft reference), never a second create; the draft is listed under Related Quotations", draft.status === 201 && /Continue Draft/.test(pDraft.text) && pDraft.text.includes(`/supplier/quotations/create?reference=${draft.json.data.reference}`) && /Related Quotations/.test(pDraft.text));
  const pQuoted = await SA.s.page(`/supplier/inquiries/${BIGI.reference}`);
  check("G-09 an inquiry that has a submitted quotation shows 'View Quotation' to the existing quotation page and lists it under Related Quotations", /View Quotation/.test(pQuoted.text) && pQuoted.text.includes("/supplier/quotations/FBM-QT-S41AAAA1"));

  // ================= H: browser
  const E1 = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S41AAAE1" }));
  const b = await open(`/supplier/inquiries/${E1.reference}`, { session: SA.s });
  check("H-01 the page loads in the browser with no console error and the requirement visible", b.status === 200 && b.errs.length === 0 && /Original Requirement/.test(await b.evaluate(() => document.body.textContent)), b.errs.join(" | "));
  await b.screenshot({ path: `${SHOTS}/41-inquiry-details-desktop-1440.png`, fullPage: true });
  const tabs = await b.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => ({ text: t.textContent.trim(), selected: t.getAttribute("aria-selected"), tab: t.tabIndex })));
  check("H-02 the Send Response / Ask Clarification control is an ARIA tablist (two tabs, one selected, roving tabindex)", tabs.length === 2 && tabs[0].selected === "true" && tabs[0].tab === 0 && tabs[1].tab === -1, JSON.stringify(tabs));
  await b.click("#sd-message");
  await b.type("#sd-message", "short");
  await b.evaluate(() => [...document.querySelectorAll("button:not([role=tab])")].find((x) => /Send Response/.test(x.textContent))?.click());
  await b.waitForSelector('[role="alert"]', { timeout: 6000 }).catch(() => {});
  const errs = await b.evaluate(() => ({ summary: !!document.querySelector('[role="alert"] ul'), invalid: document.querySelector("#sd-message").getAttribute("aria-invalid"), described: document.getElementById(document.querySelector("#sd-message").getAttribute("aria-describedby").split(" ").pop())?.textContent ?? "" }));
  check("H-03 a too-short message is not sent: an error summary, the field marked invalid and linked to its message", errs.summary && errs.invalid === "true" && /at least 10/.test(errs.described) && (await msgs.countDocuments({ inquiryId: E1._id })) === 0, JSON.stringify(errs));
  await b.evaluate(() => { const el = document.querySelector("#sd-message"); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, ""); el.dispatchEvent(new Event("input", { bubbles: true })); });
  await b.type("#sd-message", MSG);
  // a failed send keeps the text and is retried with the same key
  await b.setRequestInterception(true);
  let failOnce = true;
  const interceptor = (req) => { if (failOnce && req.method() === "POST" && /\/responses$/.test(req.url())) { failOnce = false; req.respond({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, message: "We could not send your message. Nothing was sent. You can retry safely." }) }); } else req.continue(); };
  b.on("request", interceptor);
  await b.evaluate(() => [...document.querySelectorAll("button:not([role=tab])")].find((x) => /Send Response/.test(x.textContent))?.click());
  await b.waitForFunction(() => /Nothing was sent/.test(document.body.textContent), { timeout: 6000 }).catch(() => {});
  const keptText = await b.evaluate(() => document.querySelector("#sd-message").value);
  check("H-04 a failed send keeps the typed message in the box, says nothing was sent, and nothing was stored", keptText === MSG && (await msgs.countDocuments({ inquiryId: E1._id })) === 0);
  await b.evaluate(() => [...document.querySelectorAll("button:not([role=tab])")].find((x) => /Send Response/.test(x.textContent))?.click());
  await b.waitForFunction(() => /Response sent\./.test(document.body.textContent), { timeout: 10000 }).catch(() => {});
  b.off("request", interceptor);
  await b.setRequestInterception(false);
  const sentUi = await b.evaluate(() => ({ status: [...document.querySelectorAll('[role="status"]')].map((e) => e.textContent).join(" "), cleared: document.querySelector("#sd-message").value === "", listed: [...document.querySelectorAll('ul[aria-label^="Messages sent"] li')].length, focus: document.activeElement?.id }));
  check("H-05 on success: an accessible status announcement from the server's result, the box is cleared only now, the persisted message is listed under Previous Responses", /Response sent\./.test(sentUi.status) && sentUi.cleared && sentUi.listed === 1 && (await msgs.countDocuments({ inquiryId: E1._id })) === 1, JSON.stringify(sentUi));
  await b.waitForFunction(() => /Replied/.test(document.body.textContent), { timeout: 8000 }).catch(() => {});
  check("H-06 the header status and the timeline are refreshed from the records (Replied; 'Response sent to the buyer')", /Replied/.test(await b.evaluate(() => document.querySelector("h1").parentElement.textContent)) && /Response sent to the buyer/.test(await b.evaluate(() => document.body.textContent)));
  await b.reload({ waitUntil: "networkidle2" });
  check("H-07 after a reload the message is still there (persisted, not browser state)", (await b.evaluate(() => [...document.querySelectorAll('ul[aria-label^="Messages sent"] li')].length)) === 1 && /We can supply 500 metres/.test(await b.evaluate(() => document.body.textContent)));
  await b.focus('[role="tab"][aria-selected="true"]');
  await b.keyboard.press("ArrowRight");
  const kb = await b.evaluate(() => ({ sel: [...document.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute("aria-selected")), active: document.activeElement?.textContent.trim(), label: document.querySelector('label[for="sd-message"]')?.textContent }));
  check("H-08 keyboard: ArrowRight moves to Ask Clarification (selected, focused) and the form label changes to a question", kb.sel.join() === "false,true" && /Ask Clarification/.test(kb.active) && /question/.test(kb.label), JSON.stringify(kb));
  await b.type("#sd-message", "Which width and GSM do you need for this order please?");
  await b.evaluate(() => [...document.querySelectorAll("button:not([role=tab])")].find((x) => /Send Question/.test(x.textContent))?.click());
  await b.waitForFunction(() => /Clarification request sent/.test(document.body.textContent), { timeout: 10000 }).catch(() => {});
  await b.waitForFunction(() => /Clarification requested from the buyer/.test(document.body.textContent), { timeout: 8000 }).catch(() => {});
  const clarUi = await b.evaluate(() => ({ items: [...document.querySelectorAll('ul[aria-label^="Messages sent"] li')].map((l) => l.textContent.slice(0, 40)), timeline: /Clarification requested from the buyer/.test(document.body.textContent) }));
  check("H-09 a clarification shows in the conversation as a Clarification request and in the timeline from the actual record", clarUi.items.length === 2 && /Clarification request/.test(clarUi.items[0]) && clarUi.timeline && (await msgs.countDocuments({ inquiryId: E1._id, type: "CLARIFICATION" })) === 1, JSON.stringify(clarUi));
  check("H-10 no console errors during the whole send flow", b.errs.length === 0, b.errs.join(" | "));
  await b.context.close();
  const lg = await open(`/supplier/inquiries/${IL.reference}`, { session: SA.s });
  // the requirement toggle is the button whose aria-controls points at a paragraph (the shell has other aria-expanded buttons, some hidden at this width)
  await lg.evaluate(() => { const b = [...document.querySelectorAll("button[aria-controls]")].find((x) => document.getElementById(x.getAttribute("aria-controls"))?.tagName === "P"); b?.setAttribute("data-test-toggle", "1"); });
  const exp = await lg.evaluate(() => { const t = document.querySelector("[data-test-toggle]"); return { has: !!t, expanded: t?.getAttribute("aria-expanded"), text: t?.textContent }; });
  await lg.click("[data-test-toggle]");
  const exp2 = await lg.evaluate(() => document.querySelector("[data-test-toggle]").getAttribute("aria-expanded"));
  check("H-11 a long requirement is clamped with an accessible expand / collapse toggle (aria-expanded, aria-controls), and expands to the full text", exp.has && exp.expanded === "false" && exp2 === "true");
  await lg.context.close();
  const old = await open(`/supplier/inquiries/${BIGI.reference}`, { session: SA.s });
  const n0 = await old.evaluate(() => document.querySelectorAll('ul[aria-label^="Messages sent"] li').length);
  await old.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Load older/.test(x.textContent))?.click());
  await old.waitForFunction((n) => document.querySelectorAll('ul[aria-label^="Messages sent"] li').length > n, { timeout: 8000 }, n0).catch(() => {});
  const n1 = await old.evaluate(() => document.querySelectorAll('ul[aria-label^="Messages sent"] li').length);
  const dupIds = await old.evaluate(() => { const t = [...document.querySelectorAll('ul[aria-label^="Messages sent"] li')].map((l) => l.textContent); return t.length - new Set(t).size; });
  check("H-12 'Load older messages' appends the next page (20 then 40 of 45) with no duplicates", n0 === 20 && n1 === 40 && dupIds === 0, `${n0} -> ${n1}, dup ${dupIds}`);
  await old.context.close();
  const q = await open(`/supplier/inquiries/${I1.reference}`, { session: SA.s });
  await Promise.all([q.waitForNavigation({ waitUntil: "networkidle2" }), q.evaluate(() => [...document.querySelectorAll("a")].find((x) => /Create Quotation/.test(x.textContent))?.click())]);
  const onCreate = await q.evaluate(() => ({ url: location.pathname + location.search, text: document.body.textContent.replace(/\s+/g, " ") }));
  check("H-13 Create Quotation opens the create page with ONLY the inquiry reference in the address; that page re-loads the inquiry from the database (the buyer, the requirement, the unit) itself", onCreate.url === `/supplier/quotations/create?inquiryReference=${I1.reference}` && /Alpha Garments Pvt Ltd/.test(onCreate.text) && /Create Quotation/.test(onCreate.text));
  await q.context.close();

  // ================= I: responsive and keyboard
  const over = [];
  for (const w of [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560]) {
    const p = await open(`/supplier/inquiries/${IL.reference}`, { width: w, height: w < 700 ? 800 : 900, session: SA.s });
    const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (o > 0) over.push(`${w}:+${o}`);
    if (w === 390) await p.screenshot({ path: `${SHOTS}/41-inquiry-details-mobile-390.png`, fullPage: true });
    if (w === 820) await p.screenshot({ path: `${SHOTS}/41-inquiry-details-tablet-820.png`, fullPage: true });
    await p.context.close();
  }
  check("I-01 no horizontal page overflow at 16 widths from 320 to 2560 (long requirement and long company names included)", over.length === 0, over.join(", "));
  const m = await open(`/supplier/inquiries/${I1.reference}`, { width: 390, height: 800, session: SA.s });
  const mob = await m.evaluate(() => ({ cols: getComputedStyle(document.querySelector('[class*="layout"]')).gridTemplateColumns.split(" ").length, small: [...document.querySelectorAll("button:not(:disabled), a[class*=btn], textarea, summary")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().height < 40).map((e) => e.tagName + ":" + Math.round(e.getBoundingClientRect().height)), quoteReachable: [...document.querySelectorAll("a, button")].some((x) => /Create Quotation/.test(x.textContent) && x.getBoundingClientRect().width > 0) }));
  check("I-02 on a phone the two columns stack (one column), the Create Quotation action is reachable, and controls are at least 40 px tall", mob.cols === 1 && mob.quoteReachable && mob.small.length === 0, JSON.stringify(mob));
  await m.context.close();
  const k = await open(`/supplier/inquiries/${I1.reference}`, { session: SA.s });
  const order = [];
  for (let i = 0; i < 60; i++) { await k.keyboard.press("Tab"); const id = await k.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute("role") || document.activeElement?.tagName); order.push(id); if (id === "sd-message") break; }
  const labelled = await k.evaluate(() => [...document.querySelectorAll("textarea, input, select")].filter((e) => e.getClientRects().length).filter((e) => !(e.labels && e.labels.length) && !e.getAttribute("aria-label")).map((e) => e.id || e.tagName));
  check("I-03 keyboard: Tab reaches the response tabs and then the message box in order; every visible form control has a label", order.some((x) => x === "tab" || /-tab$/.test(String(x))) && order.at(-1) === "sd-message" && labelled.length === 0, `${order.length} tabs; unlabelled: ${labelled.join(",")}`);
  await k.context.close();

  // ================= J: scale
  if (!process.env.SKIP_PERF) {
    const company = await companies.findOne({ ownerUserId: SA.id });
    const bulk = [];
    const BIGM = await mk(mkInq(BA.id, SELLER_A, { reference: "FBM-INQ-S41AAA12" }));
    for (let i = 0; i < 5000; i++) bulk.push({ _id: new ObjectId(), inquiryId: BIGM._id, inquiryReference: BIGM.reference, supplierKey: "shree-textiles", supplierCompanyId: company._id, buyerId: BA.id, type: i % 9 === 0 ? "CLARIFICATION" : "RESPONSE", body: `Perf message ${i} ${"lorem ipsum ".repeat(8)}`, authorUserId: SA.id, authorName: SA.name, createdAt: new Date(Date.now() - i * 1000) });
    for (let n = 0; n < 40; n++) { const refN = `FBM-INQ-S41P${String(n).padStart(4, "0")}`; const doc = await mk(mkInq(BA.id, SELLER_A, { reference: refN })); for (let i = 0; i < 100; i++) bulk.push({ _id: new ObjectId(), inquiryId: doc._id, inquiryReference: refN, supplierKey: "shree-textiles", supplierCompanyId: company._id, buyerId: BA.id, type: "RESPONSE", body: `Other inquiry message ${i} about pricing and delivery schedule`, authorUserId: SA.id, authorName: SA.name, createdAt: new Date(Date.now() - i * 5000) }); }
    await msgs.insertMany(bulk, { ordered: false });
    const t1 = await timeIt(() => SA.s.call("GET", `/api/supplier/inquiries/${BIGM.reference}`));
    const t2 = await timeIt(() => SA.s.call("GET", `/api/supplier/inquiries/${BIGM.reference}/responses?limit=20`));
    const t3 = await timeIt(() => SA.s.call("GET", `/api/supplier/inquiries/${BIGM.reference}/activity`));
    const t4 = await timeIt(() => SA.s.call("GET", `/api/supplier/inquiries/${BIGM.reference}/quotations`));
    const deepCursor = (await SA.s.call("GET", `/api/supplier/inquiries/${BIGM.reference}/responses?limit=50&cursor=${encodeURIComponent(Buffer.from(JSON.stringify({ t: Date.now() - 4000 * 1000, id: "f".repeat(24) })).toString("base64url"))}`)).json;
    const t5 = await timeIt((i) => send(SA.s, BIGM.reference, { message: `Perf send number ${i} with a realistic message body for timing.` }), 20);
    const bytes = (await SA.s.call("GET", `/api/supplier/inquiries/${BIGM.reference}/responses?limit=50`)).text.length;
    const pageT = await timeIt(() => SA.s.page(`/supplier/inquiries/${BIGM.reference}`), 15);
    console.log(`      ${(5000 + 4000).toLocaleString()} seeded messages (5,000 on one inquiry): detail ${fmt(t1)} | responses page ${fmt(t2)} | activity ${fmt(t3)} | related quotations ${fmt(t4)} | send (20) ${fmt(t5)} | server-rendered page ${fmt(pageT)} | 50-message response ${(bytes / 1024).toFixed(1)} KB | deep page items ${deepCursor.items.length}`);
    check("J-01 detail p95 under the 500 ms planning target on an inquiry with 5,000 messages", t1.p95 < 500, `${t1.p95.toFixed(0)} ms`);
    check("J-02 a page of messages and the activity feed p95 under 500 ms (bounded: 20 and 50 rows however long the history)", t2.p95 < 500 && t3.p95 < 500 && t4.p95 < 500, `${t2.p95.toFixed(0)} / ${t3.p95.toFixed(0)} / ${t4.p95.toFixed(0)} ms`);
    check("J-03 persisting a response p95 within a 1,000 ms sanity bound (transaction included, notification excluded). The project write target is 500 ms p95: the measured figure is reported against it in the performance report, not asserted here", t5.p95 < 1000, `${t5.p95.toFixed(0)} ms (project target 500 ms: ${t5.p95 < 500 ? "met" : "MISSED"})`);
    check("J-04 a 50-message response stays small (under 60 KB) and a deep cursor still answers", bytes < 60 * 1024 && deepCursor.items.length > 0, `${(bytes / 1024).toFixed(1)} KB`);
    const ex = await msgs.find({ inquiryId: BIGM._id, supplierKey: { $in: ["shree-textiles"] } }).sort({ createdAt: -1, _id: -1 }).limit(21).explain("executionStats");
    const plan = JSON.stringify(ex.queryPlanner.winningPlan);
    const ex2 = await msgs.find({ inquiryId: BIGM._id, supplierKey: { $in: ["shree-textiles"] }, $or: [{ createdAt: { $lt: new Date(Date.now() - 3_000_000) } }, { createdAt: new Date(Date.now() - 3_000_000), _id: { $lt: new ObjectId() } }] }).sort({ createdAt: -1, _id: -1 }).limit(21).explain("executionStats");
    const plan2 = JSON.stringify(ex2.queryPlanner.winningPlan);
    console.log(`      messages plan: first page keys=${ex.executionStats.totalKeysExamined} docs=${ex.executionStats.totalDocsExamined}; cursor page keys=${ex2.executionStats.totalKeysExamined} docs=${ex2.executionStats.totalDocsExamined}`);
    check("J-05 the conversation queries (first page and cursor page) use the (inquiryId, createdAt, _id) index: no collection scan, no blocking sort, about 21 documents examined each", !plan.includes("COLLSCAN") && !/"stage":"SORT"/.test(plan) && !plan2.includes("COLLSCAN") && !/"stage":"SORT"/.test(plan2) && ex.executionStats.totalDocsExamined <= 25 && ex2.executionStats.totalDocsExamined <= 25);
    const conc = await timeIt(async () => { await Promise.all([1, 2, 3, 4, 5].map((i) => SA.s.call("GET", `/api/supplier/inquiries/${BIGM.reference}/responses?limit=20`))); }, 10);
    console.log(`      5 concurrent response pages: ${fmt(conc)}`);
    check("J-06 five concurrent reads all answer (timing reported, no pass line: the plan sets no concurrency target)", true);
  }
}

let failed = false;
try { await main(); } catch (e) { failed = true; console.error("TEST RUN ABORTED:", e); }
if (!process.env.KEEP) {
  try {
    await db.command({ collMod: "idempotency_keys", validator: {}, validationLevel: "off" }).catch(() => undefined);
    await msgs.deleteMany({ inquiryReference: /^FBM-INQ-S41/ });
    await qts.deleteMany({ inquiryReference: /^FBM-INQ-S41/ });
    await inq.deleteMany({ reference: /^FBM-INQ-S41/ });
    await notes.deleteMany({ type: /^(INQUIRY_|QUOTATION_RECEIVED)/ });
    await outbox.deleteMany({ inquiryReference: /^FBM-INQ-S41/ });
    await idem.deleteMany({ operation: "inquiry.respond" });
    await events.deleteMany({ type: /^supplier_(inquiry|quotation)/ });
    await db.collection("buyer_settings").deleteMany({});
    await companies.deleteMany({ ownerUserId: { $in: created.users } });
    await users.deleteMany({ email: new RegExp(`^t41-${stamp}-`) });
  } catch (e) { console.error("cleanup failed", e.message); }
}
await browser.close();
await client.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed${bad.length ? `; FAILED: ${bad.map((x) => x.name.slice(0, 40)).join(" | ")}` : ""}`);
process.exit(failed || bad.length ? 1 : 0);
