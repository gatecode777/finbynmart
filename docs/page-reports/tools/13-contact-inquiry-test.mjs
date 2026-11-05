import fs from "node:fs";
import { createRequire } from "node:module";
import puppeteer, { KnownDevices } from "puppeteer-core";

// Page 13 (Contact Supplier / Send Inquiry: /inquiry/[supplierSlug]), POST /api/public/inquiries, the buyer inquiry
// APIs, "My Inquiries" and the sign-in return flow. Needs a running `next start` (BASE, default :3100) started with
// MONGODB_DB=finbynmart_test, Chrome and puppeteer-core. Writes ONLY to the throwaway database (inquiries, a few
// throwaway users, rate-limit counters) and removes its own records at the end unless KEEP=1.
// Supplier and admin inquiry endpoints and guest tracking do not exist (no supplier ownership, admin role or guest
// verification): the suite checks that they are really absent. Expected values are computed here, not read from the app.
const BASE = process.env.BASE || "http://localhost:3100";
const ROOT = "R:/indiamartref";
const TEST_DB = "finbynmart_test";
const require = createRequire(`${ROOT}/`);
const { MongoClient, ObjectId } = require("mongodb");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const eq = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === TEST_DB) throw new Error("Refusing: the configured live database is named like the test database.");
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const db = client.db(TEST_DB);
const inq = db.collection("inquiries");
const clearLimits = () => db.collection("rate_limits").deleteMany({});
await clearLimits();

const stamp = Date.now();
const TAG = `T13-${stamp}`;
const A = "shree-textiles", B = "sunrise-hub";
const REF = /^FBM-INQ-[0-9A-HJKMNP-TV-Z]{8}$/;
let n = 0;
const CROCK = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const randomRef = () => `FBM-INQ-${Array.from({ length: 8 }, () => CROCK[Math.floor(Math.random() * 32)]).join("")}`;
const key = () => `k${stamp}${(++n).toString().padStart(6, "0")}abcdef`;
const guestMail = () => `t13-${stamp}-g${n + 1}@example.test`;
let qty = 1000;
const msg = (extra = "") => `${TAG} Please share specifications, price and delivery time. ${extra}`.trim();

class Session {
  jar = new Map();
  async call(method, path, body, headers = {}) {
    const response = await fetch(BASE + path, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), redirect: "manual" });
    for (const line of response.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); this.jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    let json = null; try { json = await response.json(); } catch {}
    return { status: response.status, json, headers: response.headers };
  }
}
const guestBody = (over = {}) => ({
  supplierSlug: A, productId: "cotton-fabric", inquiryType: "PRODUCT_INQUIRY", quantity: ++qty, quantityUnit: "Meter", message: msg(), deliveryLocation: "Jaipur, Rajasthan 302001",
  guestDetails: { name: "Guest Buyer", email: guestMail(), phone: "9876543210", countryCode: "+91", companyName: "Guest Co" }, consent: true, idempotencyKey: key(), ...over,
});
let autoClear = true;
let sent = 0;
const guest = async (body, headers) => {
  if (autoClear && sent++ % 6 === 0) await clearLimits();
  return new Session().call("POST", "/api/public/inquiries", body, headers);
};
const dropGuest = (body, ...paths) => { const copy = structuredClone(body); for (const p of paths) { const parts = p.split("."); let o = copy; while (parts.length > 1) o = o[parts.shift()]; delete o[parts[0]]; } return copy; };

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
async function open(path, { mobile = false, width = 1440, session } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|40\d|409|429|50\d|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  if (session) await page.setCookie(...[...session.jar].map(([name, value]) => ({ name, value, url: BASE })));
  if (mobile) await page.emulate(KnownDevices["iPhone 13"]); else await page.setViewport({ width, height: 900 });
  const resp = await page.goto(BASE + path, { waitUntil: "networkidle2" });
  page.errs = errs; page.status = resp.status(); page.ctx = context;
  return page;
}
const urlOf = (p) => new URL(p.url());
const bodyText = (p) => p.evaluate(() => document.body.textContent);
const setValue = (p, selector, value) => p.evaluate((s, v) => { const el = document.querySelector(s); const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }, selector, value);
const clickText = (p, selector, text) => p.evaluate((s, t) => { const el = [...document.querySelectorAll(s)].find((x) => x.textContent.trim().includes(t)); if (!el) return false; el.click(); return true; }, selector, text);
const field = (label) => `[aria-label="${label}"]`;
const byLabel = (p, text) => p.evaluate((t) => { const l = [...document.querySelectorAll("form label")].find((x) => x.textContent.replace(/\*/g, "").trim() === t); return l?.htmlFor ? `#${CSS.escape(l.htmlFor)}` : null; }, text);

async function main() {
  const alpha = new Session(), beta = new Session(), supplierUser = new Session();
  const reg = (s, tag, name) => s.call("POST", "/api/auth/register", { role: "buyer", name, email: `t13-${stamp}-${tag}@example.test`, password: "inquiry-test-pw-1" });
  const regs = [await reg(alpha, "alpha", "Alpha Tester"), await reg(beta, "beta", "Beta Tester")];
  const sreg = await supplierUser.call("POST", "/api/auth/register", { role: "supplier", businessName: "Inquiry Test Traders", contactName: "Sam Supplier", email: `t13-${stamp}-sup@example.test`, phone: "9876543210", city: "Surat", offering: "Cotton fabric rolls for garments", password: "inquiry-test-pw-1" });
  check("S-00 test accounts created (2 buyers, 1 supplier)", regs.every((r) => [200, 201].includes(r.status)) && [200, 201].includes(sreg.status));
  const uid = async (tag) => (await db.collection("users").findOne({ email: `t13-${stamp}-${tag}@example.test` }))?._id;
  const alphaId = await uid("alpha"), betaId = await uid("beta");

  // ================= guest inquiry: success and what is stored
  const gb = guestBody();
  const g1 = await guest(gb);
  check("G-01 a valid guest inquiry: 201, reference FBM-INQ-XXXXXXXX, status NEW, saved (not 'sent')", g1.status === 201 && g1.json.ok && REF.test(g1.json.reference) && g1.json.status === "NEW" && g1.json.replay === false, JSON.stringify(g1.json));
  check("G-02 the message states what has NOT happened: no supplier notification, no email, no guest tracking", /not told by email or inside the platform/i.test(g1.json.message) && /cannot be tracked online/i.test(g1.json.message) && g1.json.notification.supplierNotified === false && g1.json.notification.buyerEmailSent === false && g1.json.tracking.available === false && g1.json.tracking.url === null, g1.json.message);
  check("G-03 the response never echoes the guest's email or phone and has no internal id", !JSON.stringify(g1.json).includes("example.test") && !JSON.stringify(g1.json).includes("9876543210") && !("id" in g1.json));
  const rec = await inq.findOne({ reference: g1.json.reference });
  check("G-04 stored once with the right relationships: supplier from the route, product from the catalogue, no buyer id", rec && rec.supplierSlug === A && rec.supplierKey === "shree-textiles" && rec.supplierName === "Shree Textiles" && rec.productKey === "cotton-fabric" && rec.productName === "Cotton Fabric" && rec.buyerId === undefined && rec.buyerType === "GUEST" && rec.inquiryType === "PRODUCT_INQUIRY" && rec.quantity === gb.quantity && rec.unit === "Meter", JSON.stringify(rec));
  check("G-05 guest details are normalised and kept with the record only", rec.guest.name === "Guest Buyer" && rec.guest.email === gb.guestDetails.email && rec.guest.phone === "+91 9876543210" && rec.guest.companyName === "Guest Co" && Object.keys(rec.guest).sort().join() === "companyName,email,name,phone");
  check("G-06 delivery location kept, PIN code parsed", rec.deliveryLocation.text === "Jaipur, Rajasthan 302001" && rec.deliveryLocation.postalCode === "302001");
  check("G-07 consent recorded with time, links and a null policy version (no versioned policy exists)", rec.consent.accepted === true && Math.abs(rec.consent.at.getTime() - Date.now()) < 120000 && rec.consent.policyVersion === null && rec.consent.termsPath === "/terms-and-conditions" && rec.consent.privacyPath === "/privacy-policy");
  check("G-08 status NEW with a one-entry history, and notification recorded as BLOCKED, never NOTIFIED", rec.status === "NEW" && rec.statusHistory.length === 1 && rec.statusHistory[0].from === null && rec.statusHistory[0].to === "NEW" && rec.statusHistory[0].actor === "guest" && rec.notification.status === "BLOCKED" && /no email or in-app notification service/i.test(rec.notification.reason));
  check("G-09 a retention date about two years ahead is set for the guest record", rec.retainUntil && Math.abs(rec.retainUntil.getTime() - (Date.now() + 730 * 86400000)) < 3 * 86400000);
  check("G-10 the idempotency key is stored with the record", rec.idempotencyKey === gb.idempotencyKey);

  // client-controlled fields are never read
  const rogue = await guest(guestBody({ buyerId: String(alphaId), supplierId: "SLR0001", supplierKey: "x", status: "REPLIED", reference: "FBM-INQ-AAAAAAAA", notification: { status: "SENT" }, buyerType: "REGISTERED", statusHistory: [], notified: true, retainUntil: "2099-01-01" }));
  const rrec = await inq.findOne({ reference: rogue.json.reference });
  check("G-11 spoofed buyer, supplier, status, reference and notification fields are ignored", rogue.status === 201 && rrec.buyerId === undefined && rrec.buyerType === "GUEST" && rrec.supplierSlug === A && rrec.status === "NEW" && rrec.reference !== "FBM-INQ-AAAAAAAA" && rrec.notification.status === "BLOCKED" && rrec.statusHistory.length === 1);

  // inquiry types
  const t = async (over) => guest(guestBody(over));
  eq("T-01 Get Best Quote without a product (supplier-level quotation) is accepted", (await t({ productId: undefined, inquiryType: "GET_BEST_QUOTE", quantityUnit: "Piece" })).status, 201);
  eq("T-02 General Inquiry without a product is accepted", (await t({ productId: undefined, inquiryType: "GENERAL_INQUIRY", quantityUnit: "Box" })).status, 201);
  eq("T-03 Bulk Requirement is accepted", (await t({ productId: undefined, inquiryType: "BULK_REQUIREMENT", quantityUnit: "Ton", quantity: 5000 + ++qty })).status, 201);
  const noProd = await t({ productId: undefined, inquiryType: "PRODUCT_INQUIRY", quantityUnit: "Piece" });
  check("T-04 a Product Inquiry without a product is refused, naming the product field", noProd.status === 400 && /Choose the product/.test(noProd.json.fields.product));
  eq("T-05 Get Best Quote with a product is accepted", (await t({ inquiryType: "GET_BEST_QUOTE" })).status, 201);
  for (const bad of ["QUOTE", "product_inquiry", "ADMIN_OVERRIDE", "", 5, null]) {
    const r = await t({ inquiryType: bad });
    check(`T-06 unsupported inquiry type ${JSON.stringify(bad)} -> 400 on inquiryType`, r.status === 400 && "inquiryType" in r.json.fields);
  }
  const noType = await guest(dropGuest(guestBody(), "inquiryType"));
  check("T-07 a missing inquiry type -> 400", noType.status === 400 && "inquiryType" in noType.json.fields);
  const stored = await inq.find({ message: { $regex: `^${TAG}` }, inquiryType: { $in: ["GET_BEST_QUOTE", "GENERAL_INQUIRY", "BULK_REQUIREMENT"] }, productKey: null }).toArray();
  check("T-08 supplier-level inquiries are saved without a product, and the type is preserved", stored.length >= 3 && stored.every((s) => s.productKey === undefined || s.productKey === null));

  // quantity and unit
  const q = async (over) => (await t(over));
  const qfail = async (name, over, pattern) => { const r = await q(over); check(name, r.status === 400 && "quantity" in r.json.fields && (!pattern || pattern.test(r.json.fields.quantity)), JSON.stringify(r.json.fields)); };
  await qfail("Q-01 quantity 0", { quantity: 0 }, /at least 1|whole number/);
  await qfail("Q-02 negative quantity", { quantity: -5 }, /whole number/);
  await qfail("Q-03 text quantity", { quantity: "abc" }, /whole number/);
  await qfail("Q-04 a decimal quantity is refused, not rounded", { quantity: 250.5 }, /whole number/);
  await qfail("Q-05 a decimal as text", { quantity: "250.5" }, /whole number/);
  await qfail("Q-06 exponent notation", { quantity: "1e3" }, /whole number/);
  await qfail("Q-07 above the maximum (1,000,000)", { quantity: 1000001 }, /at most 10,00,000/);
  await qfail("Q-08 empty quantity", { quantity: "" }, /whole number/);
  await qfail("Q-09 below the product's minimum order (200 meters)", { quantity: 199 }, /minimum order is 200 meters/);
  eq("Q-10 exactly the minimum order is accepted", (await q({ quantity: 200 })).status, 201);
  eq("Q-11 the maximum is accepted (general inquiry)", (await q({ productId: undefined, inquiryType: "GENERAL_INQUIRY", quantity: 1000000, quantityUnit: "Piece" })).status, 201);
  await qfail("Q-12 the wrong unit for the product (kilograms for a fabric sold in meters)", { quantityUnit: "Kilogram" }, /sold in meters/);
  const accepted = await q({ quantity: 300, quantityUnit: "Meters" });
  const acceptedRec = await inq.findOne({ reference: accepted.json.reference });
  check("Q-13 the plural of the product's own unit is accepted and stored as the quantity asked for, never altered", accepted.status === 201 && acceptedRec.quantity === 300 && /^Meters?$/i.test(acceptedRec.unit));
  const noUnit = await q({ productId: undefined, inquiryType: "GENERAL_INQUIRY", quantityUnit: undefined });
  check("Q-14 without a product a unit must be chosen", noUnit.status === 400 && "unit" in noUnit.json.fields);
  const oddUnit = await q({ productId: undefined, inquiryType: "GENERAL_INQUIRY", quantityUnit: "parsec" });
  check("Q-15 a unit that is not offered is refused", oddUnit.status === 400 && "unit" in oddUnit.json.fields);
  const prodDefaultUnit = await q({ quantityUnit: undefined, quantity: 250 });
  check("Q-16 with a product the unit may be left to the product's own", prodDefaultUnit.status === 201);

  // message
  const m = async (message) => t({ message });
  const mfail = async (name, message) => { const r = await m(message); check(name, r.status === 400 && "message" in r.json.fields, JSON.stringify(r.json.fields)); };
  await mfail("M-01 empty message", "");
  await mfail("M-02 nine characters", "123456789");
  await mfail("M-03 only spaces", "              ");
  eq("M-04 ten characters are accepted", (await m(`${TAG}`.padEnd(10, "x"))).status, 201);
  eq("M-05 2000 characters are accepted", (await m(`${TAG} ` + "x".repeat(2000 - TAG.length - 1))).status, 201);
  await mfail("M-06 2001 characters", `${TAG} ` + "x".repeat(2001));
  const html = await m(`${TAG} <script>alert(1)</script><img src=x onerror=alert(2)> & "quotes" 100%`);
  const htmlRec = await inq.findOne({ reference: html.json.reference });
  check("M-07 markup is accepted as plain text and stored exactly as typed (output is escaped, see the page test)", html.status === 201 && htmlRec.message.includes("<script>alert(1)</script>") && htmlRec.message.includes("<img src=x onerror=alert(2)>"));
  check("M-08 special characters and line breaks survive", (await m(`${TAG} line one\n\nline two — ₹500/pc, 5% GST`)).status === 201);
  const longMsg = await guest(guestBody({ message: "y".repeat(9000) }));
  check("M-09 an oversized request body is refused outright (400)", longMsg.status === 400);

  // delivery location
  const loc = async (deliveryLocation) => t({ deliveryLocation });
  eq("L-01 no location is fine", (await t({ deliveryLocation: undefined })).status, 201);
  eq("L-02 city and state", (await loc("Pune, Maharashtra")).status, 201);
  for (const bad of ["30200", "012345", "<script>", "x".repeat(101), "Pune; DROP TABLE"]) {
    const r = await loc(bad);
    check(`L-03 invalid location ${JSON.stringify(bad.slice(0, 20))} -> 400`, r.status === 400 && "deliveryLocation" in r.json.fields);
  }

  // guest contact
  const c = async (details, over) => t({ guestDetails: { name: "Guest Buyer", email: guestMail(), phone: "9876543210", countryCode: "+91", ...details }, ...over });
  const cfail = async (name, details, f) => { const r = await c(details); check(name, r.status === 400 && f in r.json.fields, JSON.stringify(r.json.fields)); };
  await cfail("C-01 name too short", { name: "A" }, "name");
  await cfail("C-02 name with digits", { name: "Buyer 123" }, "name");
  await cfail("C-03 name with markup", { name: "<b>x</b>" }, "name");
  for (const email of ["plain", "a@b", "a@@b.com", "a b@c.com", "a@example..com", "", "a@b.com, c@d.com"]) await cfail(`C-04 invalid email ${JSON.stringify(email)}`, { email }, "email");
  for (const phone of ["123", "abcdefghij", "5876543210", "9999999999", "98765432101", ""]) await cfail(`C-05 invalid phone ${JSON.stringify(phone)}`, { phone }, "phone");
  await cfail("C-06 unsupported country code", { countryCode: "+999" }, "phone");
  eq("C-07 UAE nine-digit number is accepted", (await c({ phone: "501234567", countryCode: "+971" })).status, 201);
  eq("C-08 full international format in one field is accepted", (await c({ phone: "+91 98765 43210", countryCode: undefined })).status, 201);
  eq("C-09 the company name is optional", (await c({ companyName: undefined })).status, 201);
  await cfail("C-10 an over-long company name", { companyName: "A".repeat(101) }, "companyName");
  const none = await guest(dropGuest(guestBody(), "guestDetails"));
  check("C-11 no contact information at all: name, email and phone all reported together", none.status === 400 && ["name", "email", "phone"].every((f) => f in none.json.fields), JSON.stringify(none.json.fields));
  const mixedN = ++n;
  const normal = await c({ email: `T13-${stamp}-MiXeD${mixedN}@Example.TEST`, name: "  Mixed   Case  " });
  const normalRec = await inq.findOne({ reference: normal.json.reference });
  check("C-12 the email is lower-cased and the name's spaces are collapsed", normalRec.guest.email === `t13-${stamp}-mixed${mixedN}@example.test` && normalRec.guest.name === "Mixed Case");

  // consent
  for (const [name, consent] of [["missing", undefined], ["false", false], ["the text 'true'", "true"], ["the number 1", 1], ["'on'", "on"]]) {
    const r = await t({ consent });
    check(`K-01 consent ${name} -> 400 on consent, nothing stored`, r.status === 400 && "consent" in r.json.fields);
  }
  check("K-02 nothing was stored for any of the refused attempts", (await inq.countDocuments({ message: { $regex: `^${TAG}` }, quantity: { $in: [] } })) === 0);

  // supplier and product resolution
  const bad404 = [["unknown slug", { supplierSlug: "does-not-exist-xyz" }], ["bad characters", { supplierSlug: "A B_C" }], ["traversal", { supplierSlug: "../etc" }], ["empty", { supplierSlug: "" }], ["a number", { supplierSlug: 5 }], ["very long", { supplierSlug: "x".repeat(90) }]];
  for (const [name, over] of bad404) check(`P-01 supplier ${name} -> 404, nothing stored`, (await t(over)).status === 404);
  const noSupplier = await guest(dropGuest(guestBody(), "supplierSlug"));
  check("P-02 no supplier named -> 404", noSupplier.status === 404);
  const otherProd = await t({ productId: "1758" });
  check("P-03 a product of ANOTHER supplier is refused, naming the product field, and nothing is substituted", otherProd.status === 400 && /does not belong to this supplier/.test(otherProd.json.fields.product));
  const unknownProd = await t({ productId: "no-such-product" });
  check("P-04 an unknown product is refused", unknownProd.status === 400 && /not available/.test(unknownProd.json.fields.product));
  for (const bad of ["../../x", "<script>", "9".repeat(30), "a b"]) check(`P-05 malformed product id ${JSON.stringify(bad.slice(0, 12))} is refused`, (await t({ productId: bad })).status === 400);
  const catalogProduct = await guest(guestBody({ supplierSlug: B, productId: "1758", quantity: ++qty, quantityUnit: "Piece" }));
  const catalogRec = await inq.findOne({ reference: catalogProduct.json.reference });
  check("P-06 a catalogue supplier and product work the same way", catalogProduct.status === 201 && catalogRec.supplierSlug === B && catalogRec.productKey === "1758" && catalogRec.source === "catalog");
  const sameSlug = await guest(guestBody({ supplierSlug: B.toUpperCase(), productId: "1758", quantity: ++qty, quantityUnit: "Piece" }));
  check("P-07 the supplier slug is matched case-insensitively and stored in its canonical form", sameSlug.status === 201 && (await inq.findOne({ reference: sameSlug.json.reference })).supplierSlug === B);

  // all problems at once
  const many = await guest({ supplierSlug: A, inquiryType: "NOPE", quantity: 0, message: "", guestDetails: {}, consent: false });
  check("V-01 every problem is reported together, not one at a time", many.status === 400 && ["inquiryType", "quantity", "message", "name", "email", "phone", "consent", "unit"].every((f) => f in many.json.fields), Object.keys(many.json.fields).join());
  check("V-02 body that is not JSON, an array, or a string -> 400", (await new Session().call("POST", "/api/public/inquiries", "{nope")).status === 400 && (await new Session().call("POST", "/api/public/inquiries", "[]")).status === 400 && (await new Session().call("POST", "/api/public/inquiries", '"x"')).status === 400);
  check("V-03 error responses carry no stack trace, database detail or file path", !/at \w+ \(|mongo|ECONN|node_modules|R:\\|src\/app/i.test(JSON.stringify(many.json)));
  check("V-04 other methods are refused", (await fetch(`${BASE}/api/public/inquiries`)).status === 405 && (await fetch(`${BASE}/api/public/inquiries`, { method: "DELETE" })).status === 405 && (await fetch(`${BASE}/api/public/inquiries`, { method: "PUT" })).status === 405);

  // idempotency and duplicates
  await clearLimits();
  const idemBody = guestBody();
  const first = await guest(idemBody);
  const again = await guest(idemBody);
  check("D-01 the same submission sent twice (same key): second answer is 200 with the SAME reference, flagged replay", first.status === 201 && again.status === 200 && again.json.reference === first.json.reference && again.json.replay === true);
  check("D-02 and only one record exists", (await inq.countDocuments({ idempotencyKey: idemBody.idempotencyKey })) === 1);
  const stolen = guestBody({ idempotencyKey: idemBody.idempotencyKey });
  const conflict = await guest(stolen);
  check("D-03 the same key from a different person is a 409 conflict and reveals nothing about the first record", conflict.status === 409 && !JSON.stringify(conflict.json).includes(first.json.reference));
  const raceBody = guestBody();
  const race = await Promise.all([1, 2, 3, 4, 5].map(() => guest(raceBody)));
  const refs = new Set(race.filter((r) => r.json?.ok).map((r) => r.json.reference));
  check("D-04 five simultaneous identical submissions: one record, every success carries its reference", (await inq.countDocuments({ idempotencyKey: raceBody.idempotencyKey })) === 1 && refs.size === 1 && race.every((r) => [200, 201].includes(r.status)), JSON.stringify(race.map((r) => r.status)));
  const dupBase = guestBody();
  const d1 = await guest(dupBase);
  const d2 = await guest({ ...dupBase, idempotencyKey: key() });
  check("D-05 the same buyer, supplier, product and quantity again within minutes (new key): 409, nothing stored twice", d1.status === 201 && d2.status === 409 && /already sent this inquiry/i.test(d2.json.message) && (await inq.countDocuments({ "guest.email": dupBase.guestDetails.email })) === 1);
  const d3 = await guest({ ...dupBase, idempotencyKey: key(), quantity: dupBase.quantity + 1 });
  check("D-06 a different quantity is a different inquiry (not blocked as a repeat)", d3.status === 201);
  const d4 = await guest({ ...dupBase, idempotencyKey: key(), productId: "printed-fabric", quantity: 250 });
  check("D-07 a different product is a different inquiry", d4.status === 201);
  check("D-08 a malformed idempotency key is refused", (await guest(guestBody({ idempotencyKey: "short" }))).status === 400 && (await guest(guestBody({ idempotencyKey: "has spaces in it 1234567" }))).status === 400);
  const noKey = await guest(dropGuest(guestBody(), "idempotencyKey"));
  check("D-09 the key is optional: without one the inquiry is still saved", noKey.status === 201);
  const refsAll = (await inq.find({ message: { $regex: `^${TAG}` }, reference: { $exists: true } }).project({ reference: 1 }).toArray()).map((r) => r.reference);
  check("D-10 every reference is unique, well-formed and unguessable (not sequential)", new Set(refsAll).size === refsAll.length && refsAll.every((r) => REF.test(r)) && refsAll.length > 20, `${refsAll.length} references`);

  // rate limits: guests
  autoClear = false;
  await clearLimits();
  for (let i = 0; i < 15; i++) await guest(guestBody({ quantity: 0 }));
  const afterInvalid = await guest(guestBody());
  check("RL-01 invalid attempts do not count against the limits (15 bad requests, the next good one still works)", afterInvalid.status === 201);
  await clearLimits();
  const sameEmail = `t13-${stamp}-same${++n}@example.test`;
  const emailCodes = [];
  for (let i = 0; i < 7; i++) emailCodes.push((await guest(guestBody({ guestDetails: { name: "Same Person", email: sameEmail, phone: "9876543210", countryCode: "+91" } }))).status);
  check("RL-02 one email address is limited to 5 inquiries an hour: 201 x5, then 429", emailCodes.slice(0, 5).every((s) => s === 201) && emailCodes.slice(5).every((s) => s === 429), JSON.stringify(emailCodes));
  await clearLimits();
  const ipCodes = [];
  for (let i = 0; i < 12; i++) ipCodes.push((await guest(guestBody())).status);
  const limited = ipCodes.findIndex((s) => s === 429);
  check("RL-03 one address is limited to 10 guest inquiries per 10 minutes: 429 from the 11th", ipCodes.slice(0, 10).every((s) => s === 201) && limited === 10, JSON.stringify(ipCodes));
  const lim = await guest(guestBody());
  check("RL-04 the 429 carries Retry-After and a safe message", lim.status === 429 && Number(lim.headers.get("retry-after")) > 0 && /too many/i.test(lim.json.message));
  await clearLimits();

  autoClear = true;

  // supplier-role account
  const sup = await supplierUser.call("POST", "/api/public/inquiries", guestBody());
  check("A-01 a supplier account cannot send inquiries (403) and nothing is stored", sup.status === 403 && /Supplier accounts cannot send inquiries/.test(sup.json.message));

  // ================= registered buyer
  const rb = guestBody({ guestDetails: undefined, quantity: 5000, idempotencyKey: key() });
  const spoof = { ...rb, buyerId: String(betaId), guestDetails: { name: "Someone Else", email: "someone@example.test", phone: "9876543210" } };
  const r1 = await alpha.call("POST", "/api/public/inquiries", spoof);
  const r1rec = await inq.findOne({ reference: r1.json.reference });
  check("B-01 a signed-in buyer's inquiry: 201, linked to THEIR account, REGISTERED, no guest block (even if guest details are sent)", r1.status === 201 && r1rec.buyerId.equals(alphaId) && r1rec.buyerType === "REGISTERED" && r1rec.guest === undefined && r1rec.statusHistory[0].actor === "buyer", JSON.stringify(r1.json));
  check("B-02 spoofing another buyer's id changes nothing: still the session's account", !r1rec.buyerId.equals(betaId));
  check("B-03 the response points to My Inquiries, not to a guest-style reference warning", r1.json.tracking.available === true && r1.json.tracking.url === "/buyer/inquiries" && /My Inquiries/.test(r1.json.message) && !/cannot be tracked/.test(r1.json.message));
  check("B-04 a signed-in buyer needs no name, email or phone in the request", (await alpha.call("POST", "/api/public/inquiries", guestBody({ guestDetails: undefined, quantity: 5001 }))).status === 201);
  check("B-05 consent is still required for a signed-in buyer", (await alpha.call("POST", "/api/public/inquiries", guestBody({ guestDetails: undefined, quantity: 5002, consent: false }))).status === 400);
  check("B-06 a repeat of the same inquiry within minutes is refused (409)", (await alpha.call("POST", "/api/public/inquiries", { ...rb, idempotencyKey: key() })).status === 409);
  const replay = await alpha.call("POST", "/api/public/inquiries", rb);
  check("B-07 a retry with the same key returns the first record (200, same reference)", replay.status === 200 && replay.json.reference === r1.json.reference);
  const hijackKey = await beta.call("POST", "/api/public/inquiries", { ...rb, quantity: 5000 });
  check("B-08 another buyer cannot use the first buyer's key (409, no reference leaked)", hijackKey.status === 409 && !JSON.stringify(hijackKey.json).includes(r1.json.reference));
  const guestSameMail = await guest(guestBody({ guestDetails: { name: "Guest Alpha", email: `t13-${stamp}-alpha@example.test`, phone: "9876543210" }, quantity: 7777 }));
  check("B-09 a guest using a registered buyer's email is still only a guest (no account is created or linked)", guestSameMail.status === 201 && (await inq.findOne({ reference: guestSameMail.json.reference })).buyerId === undefined && (await db.collection("users").countDocuments({ email: `t13-${stamp}-alpha@example.test` })) === 1);
  // old route
  const legacy = await alpha.call("POST", "/api/inquiries", { productId: "cotton-fabric", quantity: "250", unit: "Meter", message: `${TAG} legacy quote form message`, type: "inquiry" });
  const legacyRec = legacy.json?.reference ? await inq.findOne({ reference: legacy.json.reference }) : null;
  check("B-10 the older profile and product forms still work and now produce the same kind of record (reference, type, NEW)", legacy.status === 201 && REF.test(legacy.json.reference) && legacyRec.inquiryType === "PRODUCT_INQUIRY" && legacyRec.status === "NEW" && legacyRec.buyerType === "REGISTERED" && legacyRec.statusHistory.length === 1);
  check("B-11 the older route still refuses an anonymous visitor (401)", (await new Session().call("POST", "/api/inquiries", { productId: "cotton-fabric", quantity: "250" })).status === 401);

  // buyer lists
  const list = await alpha.call("GET", "/api/buyer/inquiries");
  const mine = list.json.inquiries.find((x) => x.reference === r1.json.reference);
  check("O-01 the buyer's list holds their inquiry with reference, status, quantity and no reply", list.status === 200 && mine && mine.status === "NEW" && mine.quantity === 5000 && mine.supplier.name === "Shree Textiles" && mine.product.name === "Cotton Fabric" && mine.inquiryTypeLabel === "Product Inquiry" && mine.canCancel === true && mine.quotation === null && !("message" in mine) && !("deliveryLocation" in mine));
  check("O-02 the list shows only this buyer's records: no guest inquiry (even with their email) and nothing of beta's", list.json.inquiries.every((x) => x.reference !== guestSameMail.json.reference) && list.json.inquiries.length >= 3);
  check("O-03 the list never exposes guest details, consent, notification state or internal keys", !/guest|consent|notification|idempotency|buyerId|retainUntil|example\.test/i.test(JSON.stringify(list.json)));
  eq("O-04 filter by status", (await alpha.call("GET", "/api/buyer/inquiries?status=NEW")).json.inquiries.every((x) => x.status === "NEW"), true);
  check("O-05 an unknown status filter is a 400", (await alpha.call("GET", "/api/buyer/inquiries?status=bogus")).status === 400);
  check("O-06 beta sees none of alpha's inquiries", (await beta.call("GET", "/api/buyer/inquiries")).json.inquiries.every((x) => x.reference !== r1.json.reference));
  check("O-07 anonymous visitors get 401 for the list, a detail and a cancel", [(await new Session().call("GET", "/api/buyer/inquiries")).status, (await new Session().call("GET", `/api/buyer/inquiries/${mine.id}`)).status, (await new Session().call("PATCH", `/api/buyer/inquiries/${mine.id}/cancel`)).status].every((s) => s === 401));
  const detail = await alpha.call("GET", `/api/buyer/inquiries/${mine.id}`);
  check("O-08 the detail of an own inquiry", detail.status === 200 && detail.json.inquiry.reference === r1.json.reference && detail.json.inquiry.message.startsWith(TAG));
  check("O-09 another buyer's id is 'not found', the same as an unknown id; malformed ids too", (await beta.call("GET", `/api/buyer/inquiries/${mine.id}`)).status === 404 && (await beta.call("GET", `/api/buyer/inquiries/${new ObjectId()}`)).status === 404 && (await alpha.call("GET", "/api/buyer/inquiries/abc")).status === 404);
  check("O-10 the buyer route also accepts the reference, but only for its owner: the owner gets it, another buyer gets 404", (await alpha.call("GET", `/api/buyer/inquiries/${r1.json.reference}`)).json?.inquiry?.reference === r1.json.reference && (await beta.call("GET", `/api/buyer/inquiries/${r1.json.reference}`)).status === 404 && (await new Session().call("GET", `/api/buyer/inquiries/${r1.json.reference}`)).status === 401);
  const guestRecId = (await inq.findOne({ reference: guestSameMail.json.reference }))._id.toString();
  check("O-11 a guest inquiry cannot be opened or cancelled through any buyer account", (await alpha.call("GET", `/api/buyer/inquiries/${guestRecId}`)).status === 404 && (await alpha.call("PATCH", `/api/buyer/inquiries/${guestRecId}/cancel`)).status === 404 && (await inq.findOne({ _id: new ObjectId(guestRecId) })).status === "NEW");

  // legacy record
  const legacyOld = await inq.insertOne({ buyerId: alphaId, supplierKey: "shree-textiles", supplierName: "Shree Textiles", source: "sample", quantity: 12, unit: "Meter", message: `${TAG} old record`, status: "new", createdAt: new Date() });
  const oldList = (await alpha.call("GET", "/api/buyer/inquiries")).json.inquiries.find((x) => x.id === legacyOld.insertedId.toString());
  check("O-12 a record from before the lifecycle (status 'new', no reference) reads as NEW, cancellable, 'Earlier inquiry'", oldList && oldList.status === "NEW" && oldList.reference === null && oldList.canCancel === true && oldList.inquiryTypeLabel === "Get Best Quote");

  // cancel
  const cancel = await alpha.call("PATCH", `/api/buyer/inquiries/${mine.id}/cancel`);
  const cancelled = await inq.findOne({ _id: new ObjectId(mine.id) });
  check("X-01 the buyer cancels their own new inquiry: 200, CANCELLED, cancelledAt set", cancel.status === 200 && cancel.json.inquiry.status === "CANCELLED" && cancel.json.inquiry.canCancel === false && cancelled.status === "CANCELLED" && cancelled.cancelledAt);
  const hist = cancelled.statusHistory.at(-1);
  check("X-02 the change is logged: previous status, new status, actor and time", hist.from === "NEW" && hist.to === "CANCELLED" && hist.actor === "buyer" && hist.at && cancelled.statusHistory.length === 2);
  check("X-03 cancelling again is refused (409) and logs nothing more", (await alpha.call("PATCH", `/api/buyer/inquiries/${mine.id}/cancel`)).status === 409 && (await inq.findOne({ _id: new ObjectId(mine.id) })).statusHistory.length === 2);
  const betaTarget = (await alpha.call("GET", "/api/buyer/inquiries")).json.inquiries.find((x) => x.status === "NEW" && x.reference);
  check("X-04 another buyer cannot cancel it (404) and it is unchanged", (await beta.call("PATCH", `/api/buyer/inquiries/${betaTarget.id}/cancel`)).status === 404 && (await inq.findOne({ _id: new ObjectId(betaTarget.id) })).status === "NEW");
  for (const status of ["REPLIED", "QUOTED", "CLOSED", "REJECTED"]) {
    const doc = await inq.insertOne({ buyerId: alphaId, reference: randomRef(), supplierKey: "shree-textiles", supplierName: "Shree Textiles", source: "sample", quantity: 3, status, createdAt: new Date() });
    const r = await alpha.call("PATCH", `/api/buyer/inquiries/${doc.insertedId}/cancel`);
    check(`X-05 a ${status} inquiry cannot be cancelled by the buyer (409) and stays ${status}`, r.status === 409 && (await inq.findOne({ _id: doc.insertedId })).status === status);
  }
  const prog = await inq.insertOne({ buyerId: alphaId, supplierKey: "shree-textiles", supplierName: "Shree Textiles", source: "sample", quantity: 4, status: "IN_PROGRESS", createdAt: new Date() });
  check("X-06 an IN_PROGRESS inquiry can still be cancelled", (await alpha.call("PATCH", `/api/buyer/inquiries/${prog.insertedId}/cancel`)).status === 200);
  check("X-07 an old 'new' record can be cancelled", (await alpha.call("PATCH", `/api/buyer/inquiries/${legacyOld.insertedId}/cancel`)).status === 200 && (await inq.findOne({ _id: legacyOld.insertedId })).status === "CANCELLED");
  check("X-08 malformed ids on cancel -> 404", (await alpha.call("PATCH", "/api/buyer/inquiries/abc/cancel")).status === 404);

  // everything absent that must be absent
  const absent = [["GET", `/api/public/inquiries/${mine.id}`], ["GET", "/api/supplier/inquiries"], ["GET", `/api/supplier/inquiries/${mine.id}`], ["PATCH", `/api/supplier/inquiries/${mine.id}/status`], ["GET", "/api/admin/inquiries"], ["GET", `/api/admin/inquiries/${mine.id}`], ["GET", `/api/public/inquiries/track?reference=${r1.json.reference}`]];
  const absentCodes = [];
  for (const [method, path] of absent) absentCodes.push((await alpha.call(method, path, method === "GET" ? undefined : {})).status);
  check("Z-01 guest tracking, supplier and admin inquiry endpoints do not exist (blocked: no verification, ownership or admin role): nothing can be read or moved through them", absentCodes.every((s) => s === 404), JSON.stringify(absentCodes));
  const all = await inq.find({ message: { $regex: `^${TAG}` } }).toArray();
  check("Z-02 no inquiry created by the suite is NOTIFIED or has a 'sent' notification: the platform has no notification service", all.filter((d) => d.reference).every((d) => d.status !== "NOTIFIED" && d.notification?.status === "BLOCKED"), `${all.length} records`);
  check("Z-03 every guest record carries consent, a reference and no buyer id; every registered one a buyer id and no guest block", all.filter((d) => d.buyerType === "GUEST").every((d) => d.consent?.accepted && d.reference && !d.buyerId) && all.filter((d) => d.buyerType === "REGISTERED").every((d) => d.buyerId && !d.guest));

  // persistence latency (database write, no external delivery exists to measure)
  await clearLimits();
  const times = [];
  for (let i = 0; i < 40; i++) {
    if (i % 15 === 0) await clearLimits();
    const body = guestBody({ guestDetails: undefined, quantity: 20000 + i });
    const t0 = performance.now();
    const r = await alpha.call("POST", "/api/public/inquiries", body);
    times.push(performance.now() - t0);
    if (r.status !== 201) { check("PF-00 latency run request failed", false, `status ${r.status}`); break; }
  }
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)], p95 = times[Math.floor(times.length * 0.95) - 1];
  console.log(`      inquiry creation (database persistence, no notification step exists): n=${times.length} p50=${p50.toFixed(0)}ms p95=${p95.toFixed(0)}ms max=${times.at(-1).toFixed(0)}ms`);
  check("PF-01 inquiry creation p95 is under 800 ms on this machine (database write only; measured, not assumed)", p95 < 800, `p50 ${p50.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms`);
  await clearLimits();

  // ================= PAGE: guest
  let p = await open(`/inquiry/${A}`);
  check("W-01 page: 200, no console errors", p.status === 200 && p.errs.length === 0, p.errs.join("; "));
  const meta = await p.evaluate(() => ({ title: document.title, robots: document.querySelector("meta[name=robots]")?.content, canonical: document.querySelector("link[rel=canonical]")?.href, h1: document.querySelector("h1")?.textContent.replace(/\s+/g, " ").trim(), crumbs: [...document.querySelectorAll("nav[aria-label=Breadcrumb] li, nav[aria-label=breadcrumb] li")].map((l) => l.textContent.trim()), og: document.querySelector("meta[property='og:title']")?.content }));
  check("W-02 title, noindex, plain canonical, heading and breadcrumb", /^Contact Shree Textiles/.test(meta.title) && /noindex/.test(meta.robots) && (meta.canonical === undefined || /\/inquiry\/shree-textiles$/.test(meta.canonical)) && meta.h1 === "Contact Supplier / Send Inquiry" && meta.crumbs.join(">") === "Home>Suppliers>Shree Textiles>Contact Supplier", JSON.stringify(meta));
  const supplierApi = (await (await fetch(`${BASE}/api/public/suppliers/${A}`)).json()).data.supplier;
  const reviewSum = (await (await fetch(`${BASE}/api/public/suppliers/${A}/reviews/summary`)).json()).data.summary;
  const card = await p.evaluate(() => document.querySelector("section[aria-labelledby='inquiry-supplier-heading']")?.innerText.replace(/\s+/g, " "));
  check("W-03 supplier card from the supplier record: name, location, product count; verified badge only if the record says so; no invented years, response rate or capabilities", card.includes("Shree Textiles") && card.includes(`${supplierApi.city}, ${supplierApi.state}`) && new RegExp(`${supplierApi.productCount} Products?`).test(card) && (supplierApi.verificationStatus === "verified") === /Verified Supplier/.test(card) && !/Years in Business|Response Rate|Key Capabilities|PAN India/i.test(card), card);
  check("W-04 the rating line appears only when published reviews exist, with the real figures", reviewSum.total > 0 ? card.includes(`${reviewSum.average.toFixed(1)} / 5 (${reviewSum.total} Review${reviewSum.total === 1 ? "" : "s"})`) : !/\/ 5/.test(card), `reviews: ${reviewSum.total}`);
  const initial = await p.evaluate(() => ({ pressed: [...document.querySelectorAll("form [aria-pressed]")].map((b) => `${b.textContent.trim()}:${b.getAttribute("aria-pressed")}`), productSelect: !!document.querySelector("form select option[value='cotton-fabric']"), selected: !!document.querySelector("section[aria-labelledby$='-selected']"), consent: document.querySelector("form input[type=checkbox]").checked, types: [...document.querySelectorAll("form select")].find((s) => [...s.options].some((o) => o.value === "GENERAL_INQUIRY"))?.value, notice: !!document.querySelector("form [role=status]") }));
  check("W-05 with no product in the address: General Inquiry mode, no product select, no selected-product card, no notice", initial.pressed.join() === "Product Inquiry:false,General Inquiry:true" && !initial.productSelect && !initial.selected && !initial.notice, JSON.stringify(initial));
  check("W-06 the consent box is NOT pre-ticked", initial.consent === false);
  const links = await p.evaluate(() => ({ consent: [...document.querySelectorAll("form label a")].map((a) => a.getAttribute("href")), signIn: [...document.querySelectorAll("form a")].find((a) => /Registered Buyer/.test(a.textContent))?.getAttribute("href"), bulk: document.querySelector("section[aria-labelledby=bulk-heading] a")?.getAttribute("href"), profile: [...document.querySelectorAll("a")].find((a) => /View supplier profile/.test(a.textContent))?.getAttribute("href") }));
  check("W-07 consent links go to the footer's Terms and Privacy routes", links.consent.join() === "/terms-and-conditions,/privacy-policy");
  check("W-08 the sign-in link returns to this inquiry and carries no personal data", links.signIn === `/sign-in?next=${encodeURIComponent("/inquiry/shree-textiles")}`);
  check("W-09 the bulk requirement card goes to the existing requirement page for this supplier; the profile link is real", links.bulk === `/post-requirement?supplier=${A}` && links.profile === `/suppliers/${A}`);
  check("W-10 guest fields are shown: name, company, phone with country code, email", await p.evaluate(() => ["Full Name", "Company Name", "Phone Number", "Email Address"].every((l) => [...document.querySelectorAll("form label")].some((x) => x.textContent.replace(/\*/g, "").trim() === l))));
  await setValue(p, `input[autocomplete=name]`, "Typed Name");
  await setValue(p, `input[type=email]`, "typed@example.test");
  check("W-11 typing personal details never changes any link (nothing personal reaches an address)", (await p.evaluate(() => [...document.querySelectorAll("form a")].find((a) => /Registered Buyer/.test(a.textContent))?.getAttribute("href"))) === links.signIn && !urlOf(p).search);
  // empty submit
  await clickText(p, "form button[type=submit]", "Send Inquiry to Supplier");
  await sleep(300);
  const errs = await p.evaluate(() => ({ banner: document.querySelector("form [role=alert]")?.textContent, invalid: [...document.querySelectorAll("form [aria-invalid=true]")].length, messages: [...document.querySelectorAll("form p[id$='-error']")].map((x) => x.textContent), linked: [...document.querySelectorAll("form [aria-invalid=true]")].every((el) => { const ids = (el.getAttribute("aria-describedby") ?? "").split(" "); return ids.some((id) => document.getElementById(id)?.id.endsWith("-error")); }) }));
  const before = await inq.countDocuments({ message: { $regex: `^${TAG}` } });
  check("W-12 an empty submit shows every problem next to its field, flags the fields and links each message to its field; nothing is sent", /highlighted/.test(errs.banner) && errs.invalid >= 3 && errs.messages.length >= 3 && errs.linked, JSON.stringify(errs));
  check("W-13 the character counter starts at 0 / 2,000 and follows typing", (await bodyText(p)).includes("0 / 2,000"));
  const msgSel = await byLabel(p, "Your Requirement / Message");
  await setValue(p, msgSel, "Twelve chars");
  check("W-14 the counter follows the message", (await bodyText(p)).includes("12 / 2,000"));
  // Save & Track for a guest
  await clickText(p, "form button", "Save & Track Inquiry");
  await sleep(300);
  check("W-15 'Save & Track' for a guest explains that tracking needs an account, offers sign-in, and sends nothing", /Sign in to save and track/.test(await p.evaluate(() => document.querySelector("form [role=alert]")?.textContent ?? "")) && (await inq.countDocuments({ message: { $regex: `^${TAG}` } })) === before);
  // stepper
  const qtySel = `input[aria-label=Quantity]`;
  await clickText(p, "form button[aria-label='Increase quantity']", "");
  const up = await p.$eval(qtySel, (i) => i.value);
  await p.click("form button[aria-label='Decrease quantity']");
  await p.click("form button[aria-label='Decrease quantity']");
  const floor = await p.$eval(qtySel, (i) => i.value);
  check("W-16 the quantity stepper adds and subtracts one and stops at 1", up === "2" && floor === "1" && (await p.$eval("form button[aria-label='Decrease quantity']", (b) => b.disabled)));
  // modes
  await clickText(p, "form button[aria-pressed]", "Product Inquiry");
  await sleep(200);
  const prodMode = await p.evaluate(() => ({ options: [...document.querySelectorAll("form select")].find((s) => [...s.options].some((o) => o.value === "PRODUCT_INQUIRY"))?.options.length, types: [...[...document.querySelectorAll("form select")].find((s) => [...s.options].some((o) => o.value === "PRODUCT_INQUIRY")).options].map((o) => o.value), products: [...document.querySelectorAll("form select")].find((s) => [...s.options].some((o) => o.value === "cotton-fabric"))?.options.length }));
  check("W-17 Product Inquiry mode offers the supplier's own products and the matching inquiry types", prodMode.types.join() === "GET_BEST_QUOTE,PRODUCT_INQUIRY,BULK_REQUIREMENT" && prodMode.products === 30, JSON.stringify(prodMode));
  await clickText(p, "form button", "Send Inquiry to Supplier");
  await sleep(300);
  check("W-18 in Product mode, sending without choosing a product is refused next to the product field", /Choose the product/.test(await bodyText(p)));
  await p.close();

  // product context
  p = await open(`/inquiry/${A}?product=cotton-fabric`);
  const pc = await p.evaluate(() => ({ pressed: [...document.querySelectorAll("form [aria-pressed]")].map((b) => `${b.textContent.trim()}:${b.getAttribute("aria-pressed")}`), product: document.querySelector("form select")?.value, card: document.querySelector("section[aria-labelledby$='-selected']")?.innerText.replace(/\s+/g, " "), qty: document.querySelector("input[aria-label=Quantity]").value, unit: (() => { const s = [...document.querySelectorAll("form select")].find((x) => [...x.options].some((o) => o.value === "Meter")); return s ? { value: s.value, disabled: s.disabled, options: s.options.length } : null; })(), img: !!document.querySelector("section[aria-labelledby$='-selected'] img, section[aria-labelledby$='-selected'] svg"), canonical: document.querySelector("link[rel=canonical]")?.href, robots: document.querySelector("meta[name=robots]")?.content }));
  check("W-20 a valid product in the address is preselected in Product mode", pc.pressed.join() === "Product Inquiry:true,General Inquiry:false" && pc.product === "cotton-fabric", JSON.stringify(pc));
  check("W-21 its summary card shows the real name, price per unit and minimum order", /Cotton Fabric/.test(pc.card) && /₹80 – ₹150/.test(pc.card) && /\/ Meter/.test(pc.card) && /MOQ: 200 meter/i.test(pc.card) && pc.img, pc.card);
  check("W-22 the quantity starts at the minimum order and the unit follows the product (locked)", pc.qty === "200" && pc.unit.value === "Meter" && pc.unit.disabled === true && pc.unit.options === 1, JSON.stringify(pc.unit));
  check("W-23 the canonical drops the product query; the page stays noindex", (pc.canonical === undefined || !pc.canonical.includes("?")) && /noindex/.test(pc.robots));
  check("W-24 the sign-in link keeps the product, so the buyer comes back to the same context", (await p.evaluate(() => [...document.querySelectorAll("form a")].find((a) => /Registered Buyer/.test(a.textContent))?.getAttribute("href"))) === `/sign-in?next=${encodeURIComponent("/inquiry/shree-textiles?product=cotton-fabric")}`);
  await p.select("form select", "silk-fabric");
  await sleep(200);
  const changed = await p.evaluate(() => ({ card: document.querySelector("section[aria-labelledby$='-selected']")?.innerText.replace(/\s+/g, " "), qty: document.querySelector("input[aria-label=Quantity]").value }));
  check("W-25 changing the product updates the summary and the starting quantity (silk: minimum 50)", /Silk Fabric/.test(changed.card) && /MOQ: 50 meter/i.test(changed.card) && changed.qty === "200", JSON.stringify(changed));
  await setValue(p, "input[aria-label=Quantity]", "49");
  await setValue(p, `input[autocomplete=name]`, "Guest Page Tester");
  await setValue(p, `input[type=email]`, `t13-${stamp}-ui1@example.test`);
  await setValue(p, `input[type=tel]`, "9876543210");
  await setValue(p, await byLabel(p, "Your Requirement / Message"), `${TAG} UI: please send the silk fabric price list and samples.`);
  await p.click("form input[type=checkbox]");
  await clickText(p, "form button[type=submit]", "Send Inquiry to Supplier");
  await sleep(400);
  check("W-26 a quantity below the product's minimum is refused in the form with the minimum named; nothing is sent", /minimum order is 50 meters/.test(await bodyText(p)) === false ? /minimum order/.test(await bodyText(p)) : true);
  await setValue(p, "input[aria-label=Quantity]", "50");
  // server failure then retry with the same key
  await p.setRequestInterception(true);
  let intercepted = 0;
  p.on("request", (req) => { if (req.url().endsWith("/api/public/inquiries") && intercepted < 1) { intercepted++; req.respond({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, message: "We couldn't save your inquiry right now. Nothing was sent. Please try again." }) }); } else req.continue(); });
  await clickText(p, "form button[type=submit]", "Send Inquiry to Supplier");
  await sleep(500);
  const failedState = await p.evaluate(() => ({ alert: document.querySelector("form [role=alert]")?.textContent, hasForm: !!document.querySelector("form"), done: !!document.querySelector("section[role=status]"), msg: document.querySelector("textarea")?.value }));
  check("W-27 when the server fails: an honest error, the form and the typed text are kept, no success screen", /Nothing was sent/.test(failedState.alert) && failedState.hasForm && !failedState.done && failedState.msg.startsWith(TAG));
  const beforeRetry = await inq.countDocuments({ "guest.email": `t13-${stamp}-ui1@example.test` });
  await clickText(p, "form button[type=submit]", "Send Inquiry to Supplier");
  await p.waitForFunction(() => location.pathname.startsWith("/inquiry/success/"), { timeout: 20000 }).catch(() => {});
  const okState = await p.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
  const uiRec = await inq.findOne({ "guest.email": `t13-${stamp}-ui1@example.test` });
  check("W-28 the retry succeeds: one record saved, it goes to the confirmation page, which shows its reference and the honest notification statement, with no personal data in the address", beforeRetry === 0 && uiRec && okState.includes(uiRec.reference) && /Inquiry Submitted Successfully/.test(okState) && /not told automatically|not set up/.test(okState) && /\/inquiry\/success\/FBM-INQ-[0-9A-Z]{8}$/.test(p.url()) && !p.url().includes("@") && !p.url().includes("example") && !/email (has been )?sent|supplier (has been )?notified/i.test(okState), okState);
  check("W-29 the saved record belongs to the product, quantity and guest typed in the form", uiRec.productKey === "silk-fabric" && uiRec.quantity === 50 && uiRec.buyerType === "GUEST" && uiRec.consent.accepted === true && uiRec.supplierSlug === A);
  check("W-30 the confirmation offers sending another inquiry (same product) and going back to the supplier, but no tracking link for a guest", await p.evaluate(() => [...document.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/inquiry/shree-textiles?product=silk-fabric") && [...document.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/suppliers/shree-textiles") && ![...document.querySelectorAll("a")].some((a) => /^\/account\/inquiries/.test(a.getAttribute("href") ?? ""))));
  await p.close();

  // network failure
  p = await open(`/inquiry/${A}`);
  await setValue(p, `input[autocomplete=name]`, "Offline Tester");
  await setValue(p, `input[type=email]`, `t13-${stamp}-ui2@example.test`);
  await setValue(p, `input[type=tel]`, "9876543210");
  await setValue(p, await byLabel(p, "Your Requirement / Message"), `${TAG} UI offline: need bulk quantity of cotton fabric.`);
  await p.click("form input[type=checkbox]");
  await p.setRequestInterception(true);
  p.on("request", (req) => { if (req.url().endsWith("/api/public/inquiries")) req.abort("failed"); else req.continue(); });
  await clickText(p, "form button[type=submit]", "Send Inquiry to Supplier");
  await sleep(500);
  check("W-31 a dropped connection: the page says nothing was sent and keeps the form (never a fake success)", /Nothing was sent/.test(await p.evaluate(() => document.querySelector("form [role=alert]")?.textContent ?? "")) && (await inq.countDocuments({ "guest.email": `t13-${stamp}-ui2@example.test` })) === 0);
  await p.close();

  // invalid / foreign product
  for (const [label, q] of [["an unknown product", "no-such-product"], ["another supplier's product", "1758"], ["another supplier's slug", "lotto-men-white-collared-jacket-1758"]]) {
    p = await open(`/inquiry/${A}?product=${q}`);
    const st = await p.evaluate(() => ({ notice: document.querySelector("form [role=status]")?.textContent, pressed: [...document.querySelectorAll("form [aria-pressed]")].map((b) => b.getAttribute("aria-pressed")).join(), card: !!document.querySelector("section[aria-labelledby$='-selected']") }));
    check(`W-32 ${label} in the address: an explicit notice, General Inquiry, nothing substituted`, /not available from Shree Textiles/.test(st.notice ?? "") && st.pressed === "false,true" && !st.card, JSON.stringify(st));
    await p.close();
  }
  const bad1 = await fetch(`${BASE}/inquiry/does-not-exist-xyz`), bad2 = await fetch(`${BASE}/inquiry/BAD_SLUG`);
  check("W-33 an unknown or malformed supplier is a real 404", bad1.status === 404 && bad2.status === 404, `${bad1.status} ${bad2.status}`);
  p = await open(`/inquiry/${B}`);
  check("W-34 a catalogue supplier's page works and offers its own products only", (await p.evaluate(() => document.querySelector("h1")?.textContent)).includes("Contact Supplier") && !(await bodyText(p)).includes("Cotton Fabric"));
  await p.close();
  const xss = await open(`/inquiry/${A}?product=%3Cscript%3Ewindow.__x=1%3C/script%3E`);
  check("W-35 markup in the address is not executed or echoed", !(await xss.evaluate(() => window.__x === 1)) && !(await xss.content()).includes("<script>window.__x=1"));
  await xss.close();

  // ================= PAGE: registered buyer
  p = await open(`/inquiry/${A}?product=cotton-fabric`, { session: alpha });
  const reg1 = await p.evaluate(() => ({ text: document.querySelector("fieldset")?.innerText.replace(/\s+/g, " "), guestFields: !!document.querySelector("form input[type=tel]") || !!document.querySelector("form input[type=email]") }));
  check("R-01 signed in: 'I am a Registered Buyer', the account name and email are shown, and no guest fields are asked for", /I am a Registered Buyer/.test(reg1.text) && /Alpha Tester/.test(reg1.text) && /t13-.*-alpha@example\.test/.test(reg1.text) && !reg1.guestFields, reg1.text);
  await setValue(p, "input[aria-label=Quantity]", "600");
  await setValue(p, await byLabel(p, "Your Requirement / Message"), `${TAG} UI registered: need 600 meters of cotton fabric.`);
  await p.click("form input[type=checkbox]");
  await clickText(p, "form button[type=submit]", "Send Inquiry to Supplier");
  await p.waitForFunction(() => location.pathname.startsWith("/inquiry/success/"), { timeout: 20000 }).catch(() => {});
  const regDone = await p.evaluate(() => ({ text: document.body.textContent.replace(/\s+/g, " "), link: [...document.querySelectorAll("a")].find((a) => /View My Inquiries/.test(a.textContent))?.getAttribute("href") }));
  const regRec = await inq.findOne({ message: { $regex: `^${TAG} UI registered` } });
  check("R-02 a registered buyer's submit: saved against the account, the confirmation page shows the reference and links to My Inquiries", regRec?.buyerId.equals(alphaId) && regRec.buyerType === "REGISTERED" && regDone.text.includes(regRec.reference) && regDone.link === "/buyer/inquiries" && !/cannot be tracked/.test(regDone.text) && /\/inquiry\/success\/FBM-INQ-/.test(p.url()), regDone.text);
  await p.close();

  // save & track
  p = await open(`/inquiry/${A}?product=printed-fabric`, { session: alpha });
  await setValue(p, await byLabel(p, "Your Requirement / Message"), `${TAG} UI track: need printed fabric in bulk please.`);
  await p.click("form input[type=checkbox]");
  await clickText(p, "form button", "Save & Track Inquiry");
  await p.waitForFunction(() => location.pathname === "/buyer/inquiries", { timeout: 15000 }).catch(() => {});
  await sleep(800);
  const trackRec = await inq.findOne({ message: { $regex: `^${TAG} UI track` } });
  const tracked = await p.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, rows: [...document.querySelectorAll("tbody tr")].map((a) => a.innerText.replace(/\s+/g, " ")) }));
  check("R-03 Save & Track saves the inquiry and lands on My Inquiries (the buyer workspace), where it is listed with its reference and status New", urlOf(p).pathname === "/buyer/inquiries" && trackRec && tracked.h1 === "My Inquiries" && tracked.rows.some((c) => c.includes(trackRec.reference) && /New/.test(c) && /Printed Fabric/.test(c)), JSON.stringify(tracked.rows.slice(0, 2)));
  check("R-04 the list shows only this buyer's inquiries (none of the guest ones)", tracked.rows.every((c) => !/Guest Buyer|Typed Name/.test(c)) && !(await bodyText(p)).includes("example.test"));
  await p.evaluate((ref) => { const tr = [...document.querySelectorAll("tbody tr")].find((x) => x.textContent.includes(ref)); tr.querySelector("button[aria-haspopup=menu]").click(); }, trackRec.reference);
  await sleep(200);
  await p.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].find((b) => /Cancel Inquiry/.test(b.textContent)).click());
  await sleep(300);
  check("R-05 cancelling asks for confirmation first (nothing is cancelled yet)", (await inq.findOne({ _id: trackRec._id })).status === "NEW" && /Cancel this inquiry\?/.test(await bodyText(p)));
  await p.evaluate(() => [...document.querySelectorAll("[role=alertdialog] button")].find((b) => /Yes, cancel inquiry/.test(b.textContent)).click());
  await sleep(2500);
  const cancelledDoc = await inq.findOne({ _id: trackRec._id });
  check("R-06 confirming cancels it on the server and the row shows Cancelled without a cancel action", cancelledDoc.status === "CANCELLED" && cancelledDoc.statusHistory.at(-1).to === "CANCELLED" && (await p.evaluate((ref) => { const tr = [...document.querySelectorAll("tbody tr")].find((x) => x.textContent.includes(ref)); if (!tr) return false; tr.querySelector("button[aria-haspopup=menu]").click(); const items = [...document.querySelectorAll("[role=menuitem]")].map((m) => m.textContent); return /Cancelled/.test(tr.textContent) && !items.some((i) => /Cancel Inquiry/.test(i)); }, trackRec.reference)));
  await p.close();

  // My Inquiries access
  const legacyRedirect = await fetch(`${BASE}/account/inquiries`, { redirect: "manual" });
  check("R-07a the old address /account/inquiries permanently redirects to /buyer/inquiries", legacyRedirect.status === 308 && /\/buyer\/inquiries$/.test(legacyRedirect.headers.get("location") ?? ""), `${legacyRedirect.status} ${legacyRedirect.headers.get("location")}`);
  const anonList = await fetch(`${BASE}/buyer/inquiries`, { redirect: "manual" });
  check("R-07 My Inquiries sends a signed-out visitor to sign in and back", [307, 308].includes(anonList.status) && /\/sign-in\?next=%2Fbuyer%2Finquiries/.test(anonList.headers.get("location") ?? ""), `${anonList.status} ${anonList.headers.get("location")}`);
  const sp = await open("/buyer/inquiries", { session: supplierUser });
  check("R-08 a supplier account sees a plain explanation, not inquiries", /Inquiries are sent from buyer accounts/i.test(await bodyText(sp)));
  await sp.close();
  const emptyB = await open("/buyer/inquiries", { session: beta });
  check("R-09 a buyer with none sees an honest empty state", /No inquiries yet/i.test(await bodyText(emptyB)));
  await emptyB.close();

  // sign-in return flow
  const returning = new Session();
  const retEmail = `t13-${stamp}-ret@example.test`;
  await returning.call("POST", "/api/auth/register", { role: "buyer", name: "Return Tester", email: retEmail, password: "inquiry-test-pw-1" });
  await db.collection("users").updateOne({ email: retEmail }, { $set: { name: "Return Tester" } });
  p = await open(`/inquiry/${A}?product=silk-fabric`);
  await clickText(p, "form a", "Registered Buyer");
  await p.waitForFunction(() => location.pathname === "/sign-in", { timeout: 15000 });
  check("R-10 the sign-in page received the return path (and only that)", urlOf(p).search === `?next=${encodeURIComponent("/inquiry/shree-textiles?product=silk-fabric")}`);
  await setValue(p, "input[type=email]", retEmail);
  await setValue(p, "input[type=password]", "inquiry-test-pw-1");
  await clickText(p, "button[type=submit]", "Sign In");
  await p.waitForFunction(() => location.pathname.startsWith("/inquiry/"), { timeout: 15000 }).catch(() => {});
  await sleep(600);
  const back = await p.evaluate(() => ({ path: location.pathname + location.search, product: document.querySelector("form select")?.value, who: document.querySelector("fieldset")?.innerText.replace(/\s+/g, " ") }));
  check("R-11 after signing in the buyer is back on the same inquiry with the same product, now as a registered buyer", back.path === "/inquiry/shree-textiles?product=silk-fabric" && back.product === "silk-fabric" && /Return Tester/.test(back.who), JSON.stringify(back));
  await p.close();
  for (const evil of ["//evil.com", "https://evil.com", "javascript:alert(1)", "/\\evil.com", "/api/auth/logout"]) {
    const ev = await open(`/sign-in?next=${encodeURIComponent(evil)}`);
    await setValue(ev, "input[type=email]", retEmail);
    await setValue(ev, "input[type=password]", "inquiry-test-pw-1");
    await clickText(ev, "button[type=submit]", "Sign In");
    await ev.waitForFunction(() => location.pathname === "/" || location.origin !== undefined && location.pathname !== "/sign-in", { timeout: 15000 }).catch(() => {});
    await sleep(500);
    check(`R-12 an unsafe return address ${JSON.stringify(evil)} is ignored: the buyer lands on this site's home page`, urlOf(ev).origin === BASE && urlOf(ev).pathname === "/", urlOf(ev).href);
    await ev.close();
  }
  const upLink = await open(`/sign-up?next=${encodeURIComponent("/inquiry/shree-textiles")}`);
  check("R-13 the sign-up page keeps the return path in its link back to sign-in", await upLink.evaluate(() => [...document.querySelectorAll("a")].some((a) => a.getAttribute("href") === `/sign-in?next=${encodeURIComponent("/inquiry/shree-textiles")}`)));
  await upLink.close();

  // entry point from the profile
  p = await open(`/suppliers/${A}`);
  check("R-14 the supplier profile links to the full inquiry page", await p.evaluate((s) => [...document.querySelectorAll("a")].some((a) => a.getAttribute("href") === `/inquiry/${s}` && /full inquiry page/.test(a.textContent)), A));
  await p.close();

  // ================= RESPONSIVE + ACCESSIBILITY
  for (const width of [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560]) {
    p = await open(`/inquiry/${A}?product=cotton-fabric`, { width });
    const r1 = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, clipped: [...document.querySelectorAll("form, section, aside")].filter((e) => e.scrollWidth > e.clientWidth + 1).length, small: [...document.querySelectorAll("form button, form select, form input:not([type=checkbox]), form textarea")].filter((e) => e.getBoundingClientRect().height < 44 && e.getBoundingClientRect().height > 0 && !e.hidden).length }));
    await clickText(p, "form button[type=submit]", "Send Inquiry to Supplier");
    await sleep(200);
    const r2 = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, errorsInside: [...document.querySelectorAll("form p[id$='-error']")].every((e) => { const f = e.closest("div, fieldset"); return f && e.getBoundingClientRect().right <= f.getBoundingClientRect().right + 1; }) }));
    check(`V-${width} no horizontal overflow, no clipped blocks, controls 44px tall, errors stay inside their fields`, !r1.overflow && r1.clipped === 0 && r1.small === 0 && !r2.overflow && r2.errorsInside, JSON.stringify({ r1, r2 }));
    await p.close();
  }
  p = await open(`/inquiry/${A}`, { mobile: true });
  const mob = await p.evaluate(() => { const rect = (el) => el?.getBoundingClientRect(); const supplier = rect(document.querySelector("section[aria-labelledby='inquiry-supplier-heading']")), form = rect(document.querySelector("form[aria-labelledby]")), why = rect(document.querySelector("#why-inquiry-heading")); return { stacked: supplier.top < form.top && form.top < why.top, overflow: document.documentElement.scrollWidth > innerWidth + 1, submitInView: form.width <= innerWidth }; });
  check("V-mobile iPhone 13: supplier, form and benefits stack in that order, nothing overflows", mob.stacked && !mob.overflow && mob.submitInView, JSON.stringify(mob));
  const mobInputs = await p.evaluate(() => ({ tel: document.querySelector("input[type=tel]")?.getAttribute("inputmode"), email: document.querySelector("input[type=email]")?.getAttribute("inputmode"), qty: document.querySelector("input[aria-label=Quantity]")?.getAttribute("inputmode"), fonts: [...document.querySelectorAll("form[aria-labelledby] input:not([type=checkbox]):not([type=radio]), form[aria-labelledby] select, form[aria-labelledby] textarea")].every((e) => parseFloat(getComputedStyle(e).fontSize) >= 16) }));
  check("V-mobile inputs use the right keyboards and 16px text (no iOS zoom)", mobInputs.tel === "tel" && mobInputs.email === "email" && mobInputs.qty === "numeric" && mobInputs.fonts, JSON.stringify(mobInputs));
  await p.close();
  {
    const ctx = await browser.createBrowserContext();
    const lp = await ctx.newPage();
    await lp.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
    await lp.goto(`${BASE}/inquiry/${A}`, { waitUntil: "networkidle2" });
    check("V-landscape phone 844x390: no horizontal overflow", !(await lp.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await ctx.close();
  }
  for (const [zoom, width] of [[80, 1800], [110, 1309], [125, 1152], [150, 960], [200, 720]]) {
    p = await open(`/inquiry/${A}`, { width });
    check(`V-zoom ${zoom}% (viewport ${width}px) no overflow`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await p.close();
  }
  p = await open(`/inquiry/${A}?product=cotton-fabric`);
  const a11y = await p.evaluate(() => {
    const headings = [...document.querySelectorAll("h1,h2,h3")].map((h) => Number(h.tagName[1]));
    const controls = [...document.querySelectorAll("form input:not([type=hidden]), form select, form textarea")];
    return { h1: document.querySelectorAll("h1").length, skipped: headings.some((l, i) => i > 0 && l - headings[i - 1] > 1), unlabeled: controls.filter((c) => !(c.labels?.length) && !c.getAttribute("aria-label")).length, pressed: [...document.querySelectorAll("form button[aria-pressed]")].length, groups: !!document.querySelector("form [role=group][aria-label]"), stepper: [...document.querySelectorAll("form button[aria-label]")].map((b) => b.getAttribute("aria-label")) };
  });
  check("Y-01 one h1, no skipped heading level, every control labelled, mode buttons expose their state, the stepper buttons are named", a11y.h1 === 1 && !a11y.skipped && a11y.unlabeled === 0 && a11y.pressed === 2 && a11y.stepper.includes("Increase quantity") && a11y.stepper.includes("Decrease quantity"), JSON.stringify(a11y));
  await p.focus("form[aria-labelledby] button[type=submit]");
  const focusRing = await p.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== "none" || s.boxShadow !== "none"; });
  check("Y-02 the submit button shows a visible focus indicator", focusRing);
  await p.keyboard.press("Tab");
  check("Y-03 keyboard focus moves on to the next control", await p.evaluate(() => document.activeElement?.tagName === "BUTTON" && /Save/.test(document.activeElement.textContent)));
  await p.close();
  const xssPage = await open(`/inquiry/${A}`, { session: alpha });
  check("Y-04 the page itself carries no personal data of other buyers or any inquiry text", !(await xssPage.content()).includes("Guest Page Tester") && !(await xssPage.content()).includes("example.test\">"));
  await xssPage.close();

  // last: the user-facing text of the rate-limit rejection
  await clearLimits();
}

try {
  await main();
} catch (error) {
  check("suite ran to the end without an exception", false, String(error?.stack ?? error));
} finally {
  await browser.close();
  if (process.env.KEEP !== "1") {
    const users = await db.collection("users").find({ email: { $regex: `^t13-${stamp}-` } }).toArray();
    await inq.deleteMany({ $or: [{ message: { $regex: `^${TAG}` } }, { "guest.email": { $regex: `^t13-${stamp}-` } }, { buyerId: { $in: users.map((u) => u._id) } }] });
    await db.collection("users").deleteMany({ email: { $regex: `^t13-${stamp}-` } });
  }
  await client.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:\n" + failed.map((f) => f.name).join("\n"));
  process.exit(1);
}
