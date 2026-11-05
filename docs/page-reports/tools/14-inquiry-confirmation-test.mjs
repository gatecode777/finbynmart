import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import puppeteer, { KnownDevices } from "puppeteer-core";

// Page 14 (Inquiry Confirmation: /inquiry/success/[reference]) and GET /api/public/inquiries/[reference].
// Needs a running `next start` (BASE, default :3100) started with MONGODB_DB=finbynmart_test, Chrome and puppeteer-core.
// Writes ONLY to the throwaway database (inquiries, a few throwaway users, rate-limit counters) and removes its own
// records at the end unless KEEP=1. Guest cookies are signed here with the same AUTH_SECRET the server reads, through the
// project's own guestAccess module, so the "expired window" and "forged cookie" cases are real. Supplier and admin
// views and guest tracking do not exist (no ownership, admin role or guest verification): the suite checks they are absent.
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
const { grantAccess, GUEST_ACCESS_COOKIE } = await import(pathToFileURL(path.join(ROOT, "src/lib/inquiries/guestAccess.ts")).href);
const SECRET = env.AUTH_SECRET;
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const db = client.db(TEST_DB);
const inq = db.collection("inquiries");
const clearLimits = () => db.collection("rate_limits").deleteMany({});
await clearLimits();

const stamp = Date.now();
const TAG = `T14-${stamp}`;
const A = "shree-textiles";
const REF = /^FBM-INQ-[0-9A-HJKMNP-TV-Z]{8}$/;
const CROCK = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const randomRef = () => `FBM-INQ-${Array.from({ length: 8 }, () => CROCK[Math.floor(Math.random() * 32)]).join("")}`;
let n = 0, qty = 3000;
const key = () => `k14${stamp}${(++n).toString().padStart(6, "0")}abcdef`;

class Session {
  jar = new Map();
  async call(method, p, body, headers = {}) {
    const response = await fetch(BASE + p, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), redirect: "manual" });
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const line of setCookies) { const [pair] = line.split(";"); const i = pair.indexOf("="); this.jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    let json = null; try { json = await response.json(); } catch {}
    return { status: response.status, json, headers: response.headers, setCookies };
  }
}
const guestBody = (over = {}) => ({
  supplierSlug: A, productId: "cotton-fabric", inquiryType: "PRODUCT_INQUIRY", quantity: ++qty, quantityUnit: "Meter", message: `${TAG} Please share specifications, price and delivery time for this fabric.`, deliveryLocation: "Jaipur, Rajasthan 302001",
  guestDetails: { name: "Confirm Guest", email: `t14-${stamp}-g${++n}@example.test`, phone: "9876543210", countryCode: "+91", companyName: "Guest Co" }, consent: true, idempotencyKey: key(), ...over,
});
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
async function open(p, { mobile = false, width = 1440, session, cookies = [], permissions = false } = {}) {
  const context = await browser.createBrowserContext();
  if (permissions) await context.overridePermissions(BASE, ["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|40\d|409|429|50\d|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  const jar = session ? [...session.jar].map(([name, value]) => ({ name, value, url: BASE })) : [];
  await page.setCookie(...jar, ...cookies.map((c) => ({ ...c, url: BASE })));
  if (mobile) await page.emulate(KnownDevices["iPhone 13"]); else await page.setViewport({ width, height: 900 });
  const resp = await page.goto(BASE + p, { waitUntil: "networkidle2" });
  page.errs = errs; page.status = resp.status(); page.resp = resp; page.context = context;
  return page;
}
const text = (p) => p.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
const urlOf = (p) => new URL(p.url());
const get = (reference, session, cookie) => fetch(`${BASE}/api/public/inquiries/${reference}`, { headers: { ...(session?.jar.size ? { cookie: [...session.jar].map(([k, v]) => `${k}=${v}`).join("; ") } : cookie ? { cookie: `${GUEST_ACCESS_COOKIE}=${cookie}` } : {}) } }).then(async (r) => ({ status: r.status, headers: r.headers, json: await r.json().catch(() => null) }));
const setValue = (p, selector, value) => p.evaluate((s, v) => { const el = document.querySelector(s); const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }, selector, value);
const clickText = (p, selector, t) => p.evaluate((s, x) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(x)); if (!el) return false; el.click(); return true; }, selector, t);
const byLabel = (p, t) => p.evaluate((x) => { const l = [...document.querySelectorAll("form label")].find((e) => e.textContent.replace(/\*/g, "").trim() === x); return l?.htmlFor ? `#${CSS.escape(l.htmlFor)}` : null; }, t);

async function main() {
  const alpha = new Session(), beta = new Session(), supplierUser = new Session();
  const reg = (s, tag, name) => s.call("POST", "/api/auth/register", { role: "buyer", name, email: `t14-${stamp}-${tag}@example.test`, password: "confirm-test-pw-1" });
  const regs = [await reg(alpha, "alpha", "Alpha Confirm"), await reg(beta, "beta", "Beta Confirm")];
  const sreg = await supplierUser.call("POST", "/api/auth/register", { role: "supplier", businessName: "Confirm Test Traders", contactName: "Sam Supplier", email: `t14-${stamp}-sup@example.test`, phone: "9876543210", city: "Surat", offering: "Cotton fabric rolls for garments", password: "confirm-test-pw-1" });
  check("S-00 test accounts created", regs.every((r) => [200, 201].includes(r.status)) && [200, 201].includes(sreg.status));
  const alphaId = (await db.collection("users").findOne({ email: `t14-${stamp}-alpha@example.test` }))._id;

  // ================= how a guest gets in: the signed cookie from the submission
  const guestSession = new Session();
  const gb = guestBody();
  const g1 = await guestSession.call("POST", "/api/public/inquiries", gb);
  check("A-01 a guest submission returns the confirmation address (just the reference, nothing personal)", g1.status === 201 && g1.json.confirmationUrl === `/inquiry/success/${g1.json.reference}` && REF.test(g1.json.reference), JSON.stringify(g1.json?.confirmationUrl));
  const sc = g1.setCookies.find((c) => c.startsWith(`${GUEST_ACCESS_COOKIE}=`)) ?? "";
  check("A-02 the cookie is httpOnly, SameSite=Lax, path /, one day, and signed", /HttpOnly/i.test(sc) && /SameSite=Lax/i.test(sc) && /Path=\//i.test(sc) && /Max-Age=86400/i.test(sc) && /^[^=]+=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+;/.test(sc), sc.slice(0, 80));
  const cookieValue = guestSession.jar.get(GUEST_ACCESS_COOKIE);
  const body = JSON.parse(Buffer.from(cookieValue.split(".")[0], "base64url").toString());
  check("A-03 the cookie holds only the reference and an expiry: no name, email or phone", Array.isArray(body) && body.length === 1 && body[0].r === g1.json.reference && Object.keys(body[0]).sort().join() === "e,r" && !cookieValue.includes("example"));
  const registered = await alpha.call("POST", "/api/public/inquiries", guestBody({ guestDetails: undefined, quantity: ++qty }));
  check("A-04 a signed-in buyer gets no guest cookie (their session is the proof)", registered.status === 201 && !registered.setCookies.some((c) => c.startsWith(GUEST_ACCESS_COOKIE)) && registered.json.confirmationUrl === `/inquiry/success/${registered.json.reference}`);
  const replay = await guestSession.call("POST", "/api/public/inquiries", gb);
  check("A-05 a retry (same key) renews access to the same reference and creates nothing new", replay.status === 200 && replay.json.reference === g1.json.reference && (await inq.countDocuments({ idempotencyKey: gb.idempotencyKey })) === 1);

  // ================= the API: who may read a confirmation
  const own = await get(g1.json.reference, undefined, cookieValue);
  const d = own.json?.data;
  check("B-01 the guest with the cookie gets the confirmation", own.status === 200 && own.json.ok && d.reference === g1.json.reference && d.viewer === "guest", JSON.stringify(own.json).slice(0, 200));
  check("B-02 the answer is private: never cached or stored by a shared cache", /private/.test(own.headers.get("cache-control")) && /no-store/.test(own.headers.get("cache-control")));
  const dump = JSON.stringify(own.json);
  check("B-03 no contact details or internal fields in the answer (no email, phone, name, ids, consent, idempotency key, notification record)", !/example\.test|9876543210|Confirm Guest|Guest Co|"_id"|buyerId|idempotency|consent|retainUntil|"guest":|statusHistory|supplierKey|internal/i.test(dump), dump.slice(0, 160));
  eq("B-04 exactly the documented fields", Object.keys(d).sort(), ["deliveryLocation", "inquiryType", "inquiryTypeLabel", "message", "notification", "product", "quantity", "reference", "status", "statusLabel", "statusText", "submittedAt", "submittedLabel", "supplier", "timeline", "unit", "viewer"]);
  const record = await inq.findOne({ reference: g1.json.reference });
  check("B-05 the saved values: type, quantity, unit, location, message, supplier, product", d.inquiryType === "PRODUCT_INQUIRY" && d.inquiryTypeLabel === "Product Inquiry" && d.quantity === record.quantity && d.unit === record.unit && d.deliveryLocation === "Jaipur, Rajasthan 302001" && d.message === record.message && d.supplier.slug === A && d.supplier.name === "Shree Textiles" && d.product.name === "Cotton Fabric" && d.product.available === true && d.product.slug === "cotton-fabric");
  check("B-06 the product summary: price range per unit and the minimum order", /₹80/.test(d.product.price) && /₹150/.test(d.product.price) && d.product.unit === "Meter" && /200/.test(d.product.moq));
  check("B-07 submitted time: ISO and India-time text agree", d.submittedAt === record.createdAt.toISOString() && /^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} (AM|PM)$/.test(d.submittedLabel), d.submittedLabel);
  check("B-08 status NEW with its sentence; notification says it is not set up (never 'sent')", d.status === "NEW" && d.statusLabel === "New" && d.notification.state === "not_configured" && /not set up/.test(d.notification.label) && !/received/i.test(d.notification.label));
  eq("B-09 the timeline of a new inquiry", d.timeline.map((s) => `${s.key}:${s.state}`), ["submitted:done", "review:current", "response:upcoming"]);
  check("B-10 supplier summary comes from the supplier record: no invented response rate or years", d.supplier.available && /Surat/.test(d.supplier.location) && !JSON.stringify(d.supplier).match(/responseRate|yearsIn/i));

  // reference alone, wrong holders, forged and expired cookies
  const none = await get(g1.json.reference);
  const unknown = await get(randomRef());
  check("C-01 the reference alone opens nothing: 404, the same body as an unknown reference", none.status === 404 && unknown.status === 404 && JSON.stringify(none.json) === JSON.stringify(unknown.json) && none.json.code === "NOT_FOUND");
  const other = await new Session().call("POST", "/api/public/inquiries", guestBody());
  const otherCookie = (await (async () => null)()) ?? null;
  const otherSession = new Session(); await otherSession.call("POST", "/api/public/inquiries", guestBody());
  const wrongCookie = otherSession.jar.get(GUEST_ACCESS_COOKIE);
  check("C-02 another guest's cookie does not open this reference", (await get(g1.json.reference, undefined, wrongCookie)).status === 404);
  const forgedPayload = Buffer.from(JSON.stringify([{ r: g1.json.reference, e: Date.now() + 1e9 }])).toString("base64url");
  check("C-03 a forged cookie (right shape, wrong signature) is refused", (await get(g1.json.reference, undefined, `${forgedPayload}.${cookieValue.split(".")[1]}`)).status === 404 && (await get(g1.json.reference, undefined, `${forgedPayload}.AAAA`)).status === 404 && (await get(g1.json.reference, undefined, "garbage")).status === 404);
  const expiredCookie = grantAccess(undefined, g1.json.reference, Date.now() - 2 * 3600 * 1000, SECRET);
  const expired = await get(g1.json.reference, undefined, expiredCookie);
  check("C-04 a genuine cookie whose hour has passed: 403 GUEST_ACCESS_EXPIRED, no details", expired.status === 403 && expired.json.code === "GUEST_ACCESS_EXPIRED" && !expired.json.data && !JSON.stringify(expired.json).includes("Cotton"));
  const expiredOther = await get(randomRef(), undefined, grantAccess(undefined, randomRef(), Date.now() - 7200000, SECRET));
  check("C-05 an expired cookie for a reference that does not exist reveals nothing (404)", expiredOther.status === 404);
  const freshCookie = grantAccess(undefined, g1.json.reference, Date.now(), SECRET);
  check("C-06 a cookie the test signs with the real secret works, proving the cookie format is the server's", (await get(g1.json.reference, undefined, freshCookie)).status === 200);
  const aRef = registered.json.reference;
  check("C-07 a registered buyer reads their own confirmation (viewer buyer)", (await get(aRef, alpha)).json?.data?.viewer === "buyer");
  check("C-08 another buyer, a signed-out visitor and a guest cookie cannot read it (404)", (await get(aRef, beta)).status === 404 && (await get(aRef)).status === 404 && (await get(aRef, undefined, grantAccess(undefined, aRef, Date.now(), SECRET))).status === 404);
  check("C-09 a signed-in buyer cannot read a GUEST inquiry by its reference (404)", (await get(g1.json.reference, alpha)).status === 404);
  check("C-10 a supplier account cannot read either (404): there is no supplier view yet", (await get(aRef, supplierUser)).status === 404 && (await get(g1.json.reference, supplierUser)).status === 404);
  const bad = ["abc", "fbm-inq-aaaaaaaa", "FBM-INQ-AAAAAAA", "FBM-INQ-AAAAAAAAA", "FBM-INQ-AAAAAAAI", "FBM-INQ-AAAAAAAO", "..%2F..%2Fetc", "%00", "FBM-INQ-AAAA%20AAA", "x".repeat(200), "FBM-INQ-AAAAAAAA' OR '1'='1", `${g1.json.reference}x`, ` ${g1.json.reference}`];
  const badBodies = new Set();
  let badOk = true;
  for (const b of bad) { const r = await get(encodeURIComponent(decodeURIComponent(b.includes("%") ? b : b)).slice(0, 400), undefined, cookieValue); badBodies.add(JSON.stringify(r.json)); if (![404, 400].includes(r.status)) badOk = false; }
  check("C-11 malformed references are refused without an error (404), with one and the same body", badOk && badBodies.size === 1, [...badBodies].join("|").slice(0, 100));
  const enumerated = new Set();
  for (let i = 0; i < 25; i++) { const r = await get(randomRef(), alpha); enumerated.add(`${r.status}:${JSON.stringify(r.json)}`); }
  check("C-12 25 random well-formed references all get the identical 404 (nothing to enumerate)", enumerated.size === 1 && [...enumerated][0].startsWith("404:"));
  check("C-13 the supplier and admin inquiry routes do not exist (blocked: no ownership or admin role)", (await alpha.call("GET", `/api/supplier/inquiries/${aRef}`)).status === 404 && (await alpha.call("GET", `/api/admin/inquiries/${aRef}`)).status === 404 && (await alpha.call("GET", "/api/supplier/inquiries")).status === 404 && (await alpha.call("GET", "/api/admin/inquiries")).status === 404);
  const before = await inq.countDocuments({ message: { $regex: `^${TAG}` } });
  for (let i = 0; i < 10; i++) await get(g1.json.reference, undefined, cookieValue);
  check("C-14 reading a confirmation never creates, changes or duplicates anything", (await inq.countDocuments({ message: { $regex: `^${TAG}` } })) === before && JSON.stringify((await inq.findOne({ reference: g1.json.reference })).statusHistory) === JSON.stringify(record.statusHistory));
  check("C-15 only GET is allowed", (await fetch(`${BASE}/api/public/inquiries/${aRef}`, { method: "POST" })).status === 405 && (await fetch(`${BASE}/api/public/inquiries/${aRef}`, { method: "DELETE" })).status === 405 && (await fetch(`${BASE}/api/public/inquiries/${aRef}`, { method: "PATCH" })).status === 405);
  await clearLimits();
  let limited = 0;
  for (let i = 0; i < 130; i++) { const r = await fetch(`${BASE}/api/public/inquiries/${randomRef()}`); if (r.status === 429) limited++; }
  const lr = await fetch(`${BASE}/api/public/inquiries/${randomRef()}`);
  check("C-16 the lookup is rate limited (60/min/IP): 429 appears within 130 requests, with Retry-After", limited > 0 && lr.status === 429 && Number(lr.headers.get("retry-after")) > 0, `${limited} limited`);
  await clearLimits();

  // the buyer route also takes the reference (owner only)
  check("C-17 the buyer route returns the owner's inquiry by reference, and 404 for another buyer", (await alpha.call("GET", `/api/buyer/inquiries/${aRef}`)).json?.inquiry?.reference === aRef && (await beta.call("GET", `/api/buyer/inquiries/${aRef}`)).status === 404);

  // ================= content cases through the database (statuses, notification states, missing product/supplier)
  const doc = (over) => ({ reference: randomRef(), buyerId: alphaId, buyerType: "REGISTERED", supplierKey: "shree-textiles", supplierSlug: A, supplierName: "Shree Textiles", source: "sample", quantity: 12, unit: "Meter", message: `${TAG} fixture message for a status case`, inquiryType: "GENERAL_INQUIRY", status: "NEW", statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: new Date(Date.now() - 3600_000) }], notification: { status: "BLOCKED", reason: "x", at: new Date() }, createdAt: new Date(Date.now() - 3600_000), updatedAt: new Date(), ...over });
  const at = (m) => new Date(Date.now() - m * 60_000);
  const mk = async (over) => { const x = doc(over); await inq.insertOne(x); return x; };
  const states = async (x) => (await get(x.reference, alpha)).json.data.timeline.map((s) => `${s.key}:${s.state}`).join(",");
  const progress = await mk({ status: "IN_PROGRESS", statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: at(60) }, { from: "NEW", to: "IN_PROGRESS", actor: "system", at: at(30) }] });
  eq("D-01 IN_PROGRESS", await states(progress), "submitted:done,review:done,response:current");
  const replied = await mk({ status: "REPLIED", statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: at(90) }, { from: "NEW", to: "IN_PROGRESS", actor: "system", at: at(60) }, { from: "IN_PROGRESS", to: "REPLIED", actor: "system", at: at(30) }] });
  eq("D-02 REPLIED", await states(replied), "submitted:done,review:done,response:done");
  const quoted = await mk({ status: "QUOTED", statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: at(90) }, { from: "NEW", to: "IN_PROGRESS", actor: "system", at: at(60) }, { from: "IN_PROGRESS", to: "QUOTED", actor: "system", at: at(30) }] });
  const qd = (await get(quoted.reference, alpha)).json.data;
  check("D-03 QUOTED: Quotation Received, timed at the quotation", qd.timeline[2].title === "Quotation Received" && qd.timeline[2].at === at(30).toISOString().slice(0, 16) + qd.timeline[2].at.slice(16) && qd.statusLabel === "Quoted");
  const closed = await mk({ status: "CLOSED", statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: at(90) }, { from: "NEW", to: "IN_PROGRESS", actor: "system", at: at(60) }, { from: "IN_PROGRESS", to: "CLOSED", actor: "system", at: at(30) }] });
  eq("D-04 CLOSED", await states(closed), "submitted:done,review:done,response:stopped,outcome:done");
  const cancelled = await mk({ status: "CANCELLED", cancelledAt: at(30), statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: at(60) }, { from: "NEW", to: "CANCELLED", actor: "buyer", at: at(30) }] });
  eq("D-05 CANCELLED before any review", await states(cancelled), "submitted:done,review:stopped,response:stopped,outcome:done");
  const rejected = await mk({ status: "REJECTED", statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: at(60) }, { from: "NEW", to: "REJECTED", actor: "system", at: at(30) }] });
  eq("D-06 REJECTED", await states(rejected), "submitted:done,review:stopped,response:stopped,outcome:done");
  const notified = await mk({ status: "NOTIFIED", statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: at(60) }, { from: "NEW", to: "NOTIFIED", actor: "system", at: at(30) }], notification: { status: "SENT", at: at(30) } });
  const nd = (await get(notified.reference, alpha)).json.data;
  check("D-07 NOTIFIED does not complete the review step; a SENT notification reads as handed to a provider", `${nd.timeline[1].state}` === "current" && nd.notification.state === "sent" && /does not confirm/.test(nd.notification.label) && nd.statusLabel === "Supplier notified");
  const claimed = await mk({ status: "REPLIED", statusHistory: [{ from: null, to: "NEW", actor: "buyer", at: at(60) }] });
  eq("D-08 a status with no recorded event completes nothing (the record says REPLIED but there is no reply event)", await states(claimed), "submitted:done,review:current,response:upcoming");
  const legacy = await mk({ status: "new", statusHistory: undefined, inquiryType: undefined, type: "quote" });
  const ld = (await get(legacy.reference, alpha)).json.data;
  check("D-09 an older record (status 'new', no type, no history) still shows: Get Best Quote, NEW, a submitted step", ld.status === "NEW" && ld.inquiryTypeLabel === "Get Best Quote" && ld.timeline.length === 3 && ld.timeline[0].state === "done");
  for (const [stored, state] of [["PENDING", "pending"], ["PROCESSING", "processing"], ["SENT", "sent"], ["FAILED", "failed"], ["RETRY", "retry"]]) {
    const x = await mk({ notification: { status: stored, at: new Date() } });
    const nn = (await get(x.reference, alpha)).json.data.notification;
    check(`D-10 notification ${stored} -> ${state}, and a persisted inquiry is still shown`, nn.state === state && nn.label.length > 10);
  }
  const noProduct = await mk({ productKey: "no-such-product", productName: "Discontinued Fabric", inquiryType: "PRODUCT_INQUIRY" });
  const np = (await get(noProduct.reference, alpha)).json.data.product;
  check("D-11 a product that no longer exists keeps its saved name, with no image, price or link, and is not replaced", np.name === "Discontinued Fabric" && np.available === false && np.imageSrc === null && np.price === null && np.url === null);
  const foreign = await mk({ productKey: "1758", productName: "Foreign Jacket", inquiryType: "PRODUCT_INQUIRY" });
  const fp = (await get(foreign.reference, alpha)).json.data.product;
  check("D-12 a product that is no longer this supplier's is treated as gone, never shown under it", fp.available === false && fp.url === null && fp.imageSrc === null && fp.name === "Foreign Jacket");
  const noSupplier = await mk({ supplierSlug: "vanished-supplier", supplierKey: "vanished-supplier", supplierName: "Vanished Supplier" });
  const ns = (await get(noSupplier.reference, alpha)).json.data.supplier;
  check("D-13 a supplier without a public page keeps its saved name and offers no profile link", ns.name === "Vanished Supplier" && ns.available === false && ns.url === null && ns.slug === null);
  const general = await mk({});
  check("D-14 a general inquiry has no product block", (await get(general.reference, alpha)).json.data.product === null);
  const catalog = await mk({ supplierSlug: "sunrise-hub", supplierKey: "SLR0001", supplierName: "Sunrise Hub", source: "catalog", productKey: "1758", productName: "Lotto Men White Collared Jacket", inquiryType: "PRODUCT_INQUIRY", unit: "Piece" });
  const cp = (await get(catalog.reference, alpha)).json.data.product;
  check("D-15 a catalogue product shows its photo, estimated price and no minimum order", cp.available === true && /^https:\/\//.test(cp.imageSrc) && /₹/.test(cp.price) && cp.moq === null);
  const noLoc = await mk({ deliveryLocation: undefined });
  check("D-16 a missing delivery location is null, not an invented place", (await get(noLoc.reference, alpha)).json.data.deliveryLocation === null);

  // ================= the page
  let p = await open(`/inquiry/${A}?product=cotton-fabric`);
  const uiMail = `t14-${stamp}-ui1@example.test`;
  await setValue(p, "input[autocomplete=name]", "UI Confirm Guest");
  await setValue(p, "input[type=email]", uiMail);
  await setValue(p, "input[type=tel]", "9876543210");
  const longMsg = `${TAG} UI long message: ${"We need this fabric in several shades and finishes, with test certificates and sample swatches before the order. ".repeat(4)} <b>bold</b> <script>window.__x=1</script>`;
  await setValue(p, await byLabel(p, "Your Requirement / Message"), longMsg);
  await setValue(p, "input[aria-label=Quantity]", "250");
  await setValue(p, await byLabel(p, "Expected Delivery Location"), "Pune, Maharashtra");
  await p.click("form input[type=checkbox]");
  await clickText(p, "form button[type=submit]", "Send Inquiry to Supplier");
  await p.waitForFunction(() => location.pathname.startsWith("/inquiry/success/"), { timeout: 20000 }).catch(() => {});
  await sleep(500);
  const uiRec = await inq.findOne({ "guest.email": uiMail });
  check("P-01 sending from the form lands on the confirmation page of the saved inquiry", !!uiRec && urlOf(p).pathname === `/inquiry/success/${uiRec.reference}` && p.status === 200, p.url());
  check("P-02 nothing personal in the address (no name, email, phone, message, token)", urlOf(p).search === "" && !p.url().match(/example|UI%20Confirm|9876|T14-|token/i));
  check("P-03 no console errors", p.errs.length === 0, p.errs.join("; "));
  const meta = await p.evaluate(() => ({ title: document.title, robots: document.querySelector("meta[name=robots]")?.content, canonical: document.querySelector("link[rel=canonical]")?.href ?? null, og: [...document.querySelectorAll("meta[property^='og:']")].map((m) => m.content).join("|"), h1: document.querySelector("h1")?.textContent.trim(), crumbs: [...document.querySelectorAll("nav[aria-label=Breadcrumb] li, nav[aria-label=breadcrumb] li")].map((l) => l.textContent.trim()) }));
  check("P-04 title, noindex, no canonical, nothing about the inquiry in the metadata", meta.title === "Inquiry Confirmation | Finbyn Mart" && /noindex/.test(meta.robots) && meta.canonical === null && !meta.title.includes(uiRec.reference) && !meta.og.includes(uiRec.reference), JSON.stringify(meta));
  check("P-05 heading, breadcrumb to the supplier", meta.h1 === "Inquiry Submitted Successfully!" && meta.crumbs.join(">") === "Home>Suppliers>Shree Textiles>Inquiry Confirmation", JSON.stringify(meta.crumbs));
  const hero = await p.evaluate(() => ({ lead: document.querySelector("h1").parentElement.querySelector("p")?.textContent.replace(/\s+/g, " "), ref: document.querySelector("[data-testid=reference]")?.textContent }));
  check("P-06 the hero shows the saved reference and says 'saved', not that the supplier received it", hero.ref === uiRec.reference && /has been saved/.test(hero.lead) && /not told automatically/.test(hero.lead) && !/has received|have received|sent to Shree/i.test(hero.lead), hero.lead);
  const details = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll("section[aria-labelledby=details-heading] dl > div")].map((d) => [d.querySelector("dt").textContent.trim(), d.querySelector("dd").textContent.replace(/\s+/g, " ").trim()])));
  check("P-07 the details are the saved ones: reference, type, supplier, product with price, quantity, location", details["Inquiry Reference"] === uiRec.reference && details["Inquiry Type"] === "Get Best Quote" && details.Supplier === "Shree Textiles" && /Cotton Fabric/.test(details.Product) && /₹80/.test(details.Product) && /MOQ 200/.test(details.Product) && /^250 Meter/.test(details.Quantity) && details["Expected Delivery"] === "Pune, Maharashtra", JSON.stringify(details));
  check("P-08 submitted time and status", /\(IST\)/.test(details["Submitted On"]) && details["Submitted On"].startsWith((await (async () => { const r = await get(uiRec.reference, undefined, p.cookiesForCheck ?? undefined); return null; })()) ?? "") && /^New/.test(details.Status), details["Submitted On"]);
  const longBlock = await p.evaluate(() => { const d = document.querySelector("section[aria-labelledby=details-heading] details"); return d ? { open: d.open, summary: d.querySelector("summary").textContent.replace(/\s+/g, " "), full: d.querySelector("p")?.textContent, preview: d.querySelector("summary span")?.textContent } : null; });
  check("P-09 a long message starts collapsed with a 'Show the full message' control", longBlock && longBlock.open === false && /Show the full message/.test(longBlock.summary) && longBlock.preview.endsWith("…"));
  await p.evaluate(() => document.querySelector("section[aria-labelledby=details-heading] summary").click());
  const opened = await p.evaluate(() => ({ text: document.querySelector("section[aria-labelledby=details-heading] details p")?.textContent, injected: !!document.querySelector("section[aria-labelledby=details-heading] b, section[aria-labelledby=details-heading] script"), flag: window.__x === 1 }));
  check("P-10 expanded, the full saved message appears, and the markup in it is shown as text and never runs", opened.text.includes("<b>bold</b>") && opened.text.includes("<script>window.__x=1</script>") && !opened.injected && !opened.flag);
  const steps = await p.evaluate(() => [...document.querySelectorAll("ol[aria-label='Inquiry progress'] li")].map((li) => ({ t: li.querySelector("h3").textContent.replace(/\s+/g, " "), cur: li.getAttribute("aria-current"), time: li.querySelector("time")?.getAttribute("datetime") ?? null })));
  check("P-11 the timeline: three steps, the first completed with its time, the second marked current, each state spelled out for screen readers", steps.length === 3 && /Inquiry Submitted \(Completed\)/.test(steps[0].t) && steps[0].time === uiRec.createdAt.toISOString() && /Supplier Review \(Current step\)/.test(steps[1].t) && steps[1].cur === "step" && /Not reached yet/.test(steps[2].t) && steps[1].time === null, JSON.stringify(steps));
  check("P-12 the notification line states exactly what is true", /Supplier notification is not set up yet/.test(await p.evaluate(() => document.querySelector("section[aria-labelledby=next-heading] p[role=note]")?.textContent ?? "")));
  const acts = await p.evaluate(() => ({ links: [...document.querySelectorAll("main a")].map((a) => ({ t: a.textContent.trim(), h: a.getAttribute("href") })), tracking: document.body.textContent.includes("guest inquiries cannot be tracked online yet") }));
  const link = (t) => acts.links.find((l) => l.t.includes(t))?.h;
  check("P-13 a guest sees the honest tracking note instead of Track/View buttons", acts.tracking && !link("Track This Inquiry") && !link("View My Inquiries") && /^\/sign-in\?next=%2Fbuyer%2Finquiries$/.test(link("Sign in or create an account") ?? ""));
  check("P-14 Send Another Inquiry returns to the same supplier and product; the supplier profile and requirement links are real", link("Send Another Inquiry") === "/inquiry/shree-textiles?product=cotton-fabric" && link("View Supplier Profile") === "/suppliers/shree-textiles" && link("Post Your Requirement") === "/post-requirement?supplier=shree-textiles");
  const help = await p.evaluate(() => document.querySelector("section[aria-labelledby=help-heading]")?.textContent.replace(/\s+/g, " "));
  check("P-15 the help panel invents no support button, phone number or email, and says what is not available", /not available yet/.test(help) && !/\+91|@|\b\d{10}\b/.test(help) && !(await p.evaluate(() => !!document.querySelector("section[aria-labelledby=help-heading] a, section[aria-labelledby=help-heading] button"))) && help.includes(uiRec.reference));
  const sup = await p.evaluate(() => document.querySelector("section[aria-labelledby=supplier-summary-heading]")?.textContent.replace(/\s+/g, " "));
  check("P-16 supplier summary from the record: name, type and place; no invented response rate, years in business or product count", /Shree Textiles/.test(sup) && /Surat, Gujarat/.test(sup) && !/Response Rate|Years in Business|Products/i.test(sup), sup);
  // copy
  const cp2 = await open(`/inquiry/success/${uiRec.reference}`, { permissions: true, cookies: [{ name: GUEST_ACCESS_COOKIE, value: grantAccess(undefined, uiRec.reference, Date.now(), SECRET) }] });
  await cp2.click("button[aria-label^='Copy inquiry reference']");
  await sleep(300);
  const copied = await cp2.evaluate(async () => ({ clip: await navigator.clipboard.readText().catch(() => null), status: document.querySelector("button[aria-label^='Copy inquiry reference']").parentElement.querySelector("[role=status]")?.textContent, label: document.querySelector("button[aria-label^='Copy inquiry reference'] span")?.textContent }));
  check("P-17 Copy puts the saved reference on the clipboard, says so on screen and to screen readers", copied.clip === uiRec.reference && /copied/i.test(copied.status) && copied.label === "Copied", JSON.stringify(copied));
  await cp2.close();
  // refresh and direct visits
  const countBefore = await inq.countDocuments({ message: { $regex: `^${TAG}` } });
  await p.reload({ waitUntil: "networkidle2" });
  check("P-18 refreshing shows the same confirmation (the database is the source) and creates nothing", (await p.evaluate(() => document.querySelector("[data-testid=reference]")?.textContent)) === uiRec.reference && (await inq.countDocuments({ message: { $regex: `^${TAG}` } })) === countBefore);
  const html = await p.content();
  check("P-19 the page source holds no email, phone, internal id or guest name", !/example\.test|9876543210|UI Confirm Guest|buyerId|"_id"|idempotency/i.test(html));
  const cacheHeader = p.resp.headers()["cache-control"] ?? "";
  check("P-20 the page itself is not cacheable by a shared cache", !/public|s-maxage|max-age=[1-9]/.test(cacheHeader) && /no-store|no-cache|private/.test(cacheHeader), cacheHeader);
  await p.close();

  // other browsers
  const stranger = await open(`/inquiry/success/${uiRec.reference}`);
  check("Q-01 the same address in a browser without the cookie is a real 404 that says nothing about the inquiry", stranger.status === 404 && !/Cotton|Shree|UI Confirm|Pune/.test(await text(stranger)));
  await stranger.close();
  const wrongHolder = await open(`/inquiry/success/${uiRec.reference}`, { cookies: [{ name: GUEST_ACCESS_COOKIE, value: wrongCookie }] });
  check("Q-02 another guest's cookie gets the same 404", wrongHolder.status === 404);
  await wrongHolder.close();
  const old = await open(`/inquiry/success/${uiRec.reference}`, { cookies: [{ name: GUEST_ACCESS_COOKIE, value: grantAccess(undefined, uiRec.reference, Date.now() - 3 * 3600 * 1000, SECRET) }] });
  const oldText = await text(old);
  check("Q-03 a guest whose hour has passed sees 'This confirmation has expired', offers sign-in, and no inquiry details", old.status === 200 && /This confirmation has expired/.test(oldText) && /Sign in to see your inquiries/.test(oldText) && !/Cotton|Pune|UI Confirm/.test(oldText) && /noindex/.test(await old.evaluate(() => document.querySelector("meta[name=robots]")?.content)));
  await old.close();
  for (const badRef of ["abc", "FBM-INQ-AAAAAAAI", randomRef(), "fbm-inq-aaaaaaaa"]) {
    const r = await fetch(`${BASE}/inquiry/success/${encodeURIComponent(badRef)}`);
    check(`Q-04 ${badRef} is a real 404`, r.status === 404);
  }
  const forgedPage = await open(`/inquiry/success/${uiRec.reference}`, { cookies: [{ name: GUEST_ACCESS_COOKIE, value: `${forgedPayload}.AAAA` }] });
  check("Q-05 a forged cookie gets the 404 too", forgedPage.status === 404);
  await forgedPage.close();
  check("Q-06 /inquiry/success on its own is not a confirmation (no reference)", (await fetch(`${BASE}/inquiry/success`)).status === 404);

  // registered buyer
  p = await open(`/inquiry/${A}?product=printed-fabric`, { session: alpha });
  await setValue(p, await byLabel(p, "Your Requirement / Message"), `${TAG} UI registered: need printed fabric for a new range.`);
  await setValue(p, "input[aria-label=Quantity]", "400");
  await p.click("form input[type=checkbox]");
  await clickText(p, "form button[type=submit]", "Send Inquiry to Supplier");
  await p.waitForFunction(() => location.pathname.startsWith("/inquiry/success/"), { timeout: 20000 }).catch(() => {});
  await sleep(500);
  const regRec = await inq.findOne({ message: { $regex: `^${TAG} UI registered` } });
  const regLinks = await p.evaluate(() => [...document.querySelectorAll("main a")].map((a) => ({ t: a.textContent.trim(), h: a.getAttribute("href") })));
  const rl = (t) => regLinks.find((l) => l.t.includes(t))?.h;
  check("R-01 a registered buyer lands on their confirmation (no cookie involved) with Track and View My Inquiries", regRec && urlOf(p).pathname === `/inquiry/success/${regRec.reference}` && rl("Track This Inquiry") === `/buyer/inquiries#ref-${regRec.reference}` && rl("View My Inquiries") === "/buyer/inquiries" && rl("Send Another Inquiry") === "/inquiry/shree-textiles?product=printed-fabric", JSON.stringify(regLinks.filter((l) => /Track|View My|Another/.test(l.t))));
  check("R-02 no guest tracking note for a registered buyer", !(await text(p)).includes("guest inquiries cannot be tracked"));
  await clickText(p, "a", "Track This Inquiry");
  await p.waitForFunction(() => location.pathname === "/buyer/inquiries", { timeout: 15000 }).catch(() => {});
  await sleep(500);
  check("R-03 Track This Inquiry opens My Inquiries at that inquiry's card", urlOf(p).hash === `#ref-${regRec.reference}` && (await p.evaluate((r) => !!document.getElementById(`ref-${r}`), regRec.reference)));
  await p.close();
  const asBeta = await open(`/inquiry/success/${regRec.reference}`, { session: beta });
  check("R-04 another signed-in buyer gets a 404 for it", asBeta.status === 404);
  await asBeta.close();
  const anon = await open(`/inquiry/success/${regRec.reference}`);
  check("R-05 a signed-out visitor gets a 404 for it", anon.status === 404);
  await anon.close();
  const asSupplier = await open(`/inquiry/success/${regRec.reference}`, { session: supplierUser });
  check("R-06 a supplier account gets a 404 for it", asSupplier.status === 404);
  await asSupplier.close();
  // the page of an inquiry in each state
  for (const [x, expectText, bad] of [[cancelled, "Cancelled", false], [quoted, "Quoted", false], [closed, "Closed", false]]) {
    const sp = await open(`/inquiry/success/${x.reference}`, { session: alpha });
    const t = await text(sp);
    check(`R-07 a ${expectText} inquiry shows its real status and timeline`, sp.status === 200 && t.includes(expectText) && (x === cancelled ? /Inquiry Cancelled/.test(t) && /Not applicable/.test(t) : true) && (x === quoted ? /Quotation Received/.test(t) : true), expectText);
    await sp.close();
  }
  const gp = await open(`/inquiry/success/${general.reference}`, { session: alpha });
  const gt = await text(gp);
  check("R-08 a general inquiry says 'General Supplier Inquiry' and shows no product card", gt.includes("General Supplier Inquiry") && !(await gp.evaluate(() => !!document.querySelector("section[aria-labelledby=details-heading] img"))));
  await gp.close();
  const gone = await open(`/inquiry/success/${noProduct.reference}`, { session: alpha });
  const goneText = await text(gone);
  check("R-09 a removed product is named with a note that it is no longer listed; no broken image, no substitute; Send Another goes to the supplier without the product", goneText.includes("Discontinued Fabric") && /no longer listed/.test(goneText) && !(await gone.evaluate(() => !!document.querySelector("section[aria-labelledby=details-heading] img"))) && (await gone.evaluate(() => [...document.querySelectorAll("a")].find((a) => /Send Another/.test(a.textContent))?.getAttribute("href"))) === "/inquiry/shree-textiles");
  await gone.close();
  const vanished = await open(`/inquiry/success/${noSupplier.reference}`, { session: alpha });
  check("R-10 a supplier that vanished is still named, without a dead profile link", /Vanished Supplier/.test(await text(vanished)) && !(await vanished.evaluate(() => [...document.querySelectorAll("a")].some((a) => /View Supplier Profile/.test(a.textContent)))) && (await vanished.evaluate(() => [...document.querySelectorAll("a")].find((a) => /Send Another/.test(a.textContent))?.getAttribute("href"))) === "/suppliers");
  await vanished.close();
  const failedN = await mk({ notification: { status: "FAILED", at: new Date() } });
  const fp2 = await open(`/inquiry/success/${failedN.reference}`, { session: alpha });
  const ft = await text(fp2);
  check("R-11 after a failed notification the page still confirms the saved inquiry and says the notification failed (never that the supplier was told)", /could not be sent/.test(ft) && /Inquiry Submitted Successfully/.test(ft) && !/has been sent|supplier was told|received your inquiry/i.test(ft));
  await fp2.close();
  const expl = await mk({});
  const rr = await open(`/inquiry/success/${expl.reference}`, { session: alpha });
  check("R-12 a new inquiry confirmed over a refresh does not duplicate", (await rr.reload({ waitUntil: "networkidle2" }), (await inq.countDocuments({ reference: expl.reference })) === 1));
  await rr.close();

  // ================= performance (authorized lookup, database + supplier/product lookups)
  const times = [];
  for (let i = 0; i < 40; i++) { if (i % 30 === 0) await clearLimits(); const t0 = performance.now(); const r = await get(aRef, alpha); times.push(performance.now() - t0); if (r.status !== 200) { check("PF-00 a timed request failed", false, `status ${r.status}`); break; } }
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)], p95 = times[Math.floor(times.length * 0.95) - 1];
  console.log(`      authorized confirmation lookup: n=${times.length} p50=${p50.toFixed(0)}ms p95=${p95.toFixed(0)}ms max=${times.at(-1).toFixed(0)}ms`);
  check("PF-01 authorized confirmation lookup p95 is under 800 ms on this machine (measured)", p95 < 800, `p50 ${p50.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms`);
  const plan = await inq.find({ reference: aRef }).explain("queryPlanner");
  const winning = JSON.stringify(plan.queryPlanner.winningPlan);
  check("PF-02 the lookup by reference uses the unique reference index (no collection scan)", /IXSCAN/.test(winning) && /reference_1/.test(winning) && !/COLLSCAN/.test(winning));
  await clearLimits();

  // ================= responsive + accessibility
  const guestRef = uiRec.reference;
  const guestCookie = [{ name: GUEST_ACCESS_COOKIE, value: grantAccess(undefined, guestRef, Date.now(), SECRET) }];
  for (const width of [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560]) {
    const v = await open(`/inquiry/success/${guestRef}`, { width, cookies: guestCookie });
    const r = await v.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, clipped: [...document.querySelectorAll("section, h1, [data-testid=reference]")].filter((e) => e.scrollWidth > e.clientWidth + 1).length, small: [...document.querySelectorAll("main a, main button")].filter((e) => { const b = e.getBoundingClientRect(); return b.height > 0 && b.height < 44 && !e.closest("nav") && !e.closest("details summary") && !e.closest("dd, p"); }).length, refIn: (() => { const el = document.querySelector("[data-testid=reference]").getBoundingClientRect(); return el.right <= innerWidth + 1 && el.left >= 0; })() }));
    check(`V-${width} no overflow, no clipped blocks, the reference stays on screen, targets 44px`, !r.overflow && r.clipped === 0 && r.refIn && r.small === 0, JSON.stringify(r));
    await v.close();
  }
  const mob = await open(`/inquiry/success/${guestRef}`, { mobile: true, cookies: guestCookie });
  const mm = await mob.evaluate(() => { const top = (s) => document.querySelector(s)?.getBoundingClientRect().top; return { order: top("#details-heading") < top("#next-heading") && top("#next-heading") < top("#supplier-summary-heading") && top("#supplier-summary-heading") < top("#help-heading"), overflow: document.documentElement.scrollWidth > innerWidth + 1, copy: (() => { const b = document.querySelector("button[aria-label^='Copy inquiry reference']").getBoundingClientRect(); return b.width >= 44 && b.height >= 44 && b.right <= innerWidth; })() }; });
  check("V-mobile iPhone 13: details, timeline, supplier and help stack in that order; the Copy button is usable; no overflow", mm.order && !mm.overflow && mm.copy, JSON.stringify(mm));
  await mob.close();
  { const ctx = await browser.createBrowserContext(); const lp = await ctx.newPage(); await lp.setCookie(...guestCookie.map((c) => ({ ...c, url: BASE }))); await lp.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true }); await lp.goto(`${BASE}/inquiry/success/${guestRef}`, { waitUntil: "networkidle2" }); check("V-landscape phone 844x390: no horizontal overflow", !(await lp.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))); await ctx.close(); }
  for (const [zoom, width] of [[80, 1800], [110, 1309], [125, 1152], [150, 960], [200, 720]]) {
    const v = await open(`/inquiry/success/${guestRef}`, { width, cookies: guestCookie });
    check(`V-zoom ${zoom}% (viewport ${width}px) no overflow`, !(await v.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await v.close();
  }
  const a11 = await open(`/inquiry/success/${guestRef}`, { cookies: guestCookie });
  const ax = await a11.evaluate(() => {
    const headings = [...document.querySelectorAll("h1,h2,h3")].map((h) => Number(h.tagName[1]));
    return { h1: document.querySelectorAll("h1").length, skipped: headings.some((l, i) => i > 0 && l - headings[i - 1] > 1), ol: document.querySelectorAll("ol[aria-label] li").length, sections: [...document.querySelectorAll("main section[aria-labelledby]")].every((s) => document.getElementById(s.getAttribute("aria-labelledby"))), dl: document.querySelectorAll("dl dt").length === document.querySelectorAll("dl dd").length, time: [...document.querySelectorAll("time")].every((t) => !Number.isNaN(Date.parse(t.getAttribute("datetime")))), icons: [...document.querySelectorAll("svg")].filter((s) => !s.closest("[aria-hidden=true]") && s.getAttribute("aria-hidden") !== "true").length };
  });
  check("Y-01 one h1, no skipped level, a real ordered list for the steps, labelled sections, paired term/definition list, machine-readable times, decorative icons hidden", ax.h1 === 1 && !ax.skipped && ax.ol === 3 && ax.sections && ax.dl && ax.time && ax.icons === 0, JSON.stringify(ax));
  await a11.focus("button[aria-label^='Copy inquiry reference']");
  check("Y-02 the Copy button shows a visible focus indicator", await a11.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== "none" || s.boxShadow !== "none"; }));
  await a11.keyboard.press("Enter");
  await sleep(300);
  check("Y-03 it works from the keyboard", /Copied|Could not copy/.test(await a11.evaluate(() => document.querySelector("button[aria-label^='Copy inquiry reference']").textContent)));
  await a11.close();
}

try {
  await main();
} catch (error) {
  check("suite ran to the end without an exception", false, String(error?.stack ?? error));
} finally {
  await browser.close();
  if (process.env.KEEP !== "1") {
    const users = await db.collection("users").find({ email: { $regex: `^t14-${stamp}-` } }).toArray();
    await inq.deleteMany({ $or: [{ message: { $regex: `^${TAG}` } }, { "guest.email": { $regex: `^t14-${stamp}-` } }, { buyerId: { $in: users.map((u) => u._id) } }] });
    await db.collection("users").deleteMany({ email: { $regex: `^t14-${stamp}-` } });
  }
  await client.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:\n" + failed.map((f) => f.name).join("\n"));
  process.exit(1);
}
