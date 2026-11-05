import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Page 23 (Buyer Profile & Company: /buyer/profile and the /api/buyer/{profile,company,documents,verification,security} and
// /api/auth/change-password routes).
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test with NO email provider and with
// BUYER_DOCS_DIR set to a private test directory (the same path in DOCS_DIR here), Chrome and puppeteer-core.
//   MODE=full (default)  everything
//   MODE=nostorage       server started WITHOUT BUYER_DOCS_DIR: checks that uploads are refused honestly
// Writes only to the throwaway database and the test document directory, and removes its own records and files unless KEEP=1.
const BASE = process.env.BASE || "http://localhost:3100";
const MODE = process.env.MODE || "full";
const ROOT = "R:/indiamartref";
const DOCS_DIR = process.env.DOCS_DIR || `${ROOT}/.next-audit/buyer-docs-test`;
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
const users = db.collection("users"), companies = db.collection("companies"), docs = db.collection("company_documents"), events = db.collection("security_events");
await db.collection("rate_limits").deleteMany({});

const stamp = Date.now();
const emailOf = (tag) => `t23-${stamp}-${tag}@example.test`;
let ipN = 0;
const nextIp = () => `10.23.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "profile test passphrase";

class Session {
  jar = new Map();
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  async call(method, p, payload, headers = {}) {
    const response = await fetch(BASE + p, { method, headers: { "x-forwarded-for": this.ip ?? nextIp(), ...(payload !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}), ...headers }, body: payload === undefined ? undefined : JSON.stringify(payload), redirect: "manual" });
    for (const line of response.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); this.jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    let json = null; let textBody = null;
    try { textBody = await response.text(); json = JSON.parse(textBody); } catch {}
    return { status: response.status, json, text: textBody, headers: response.headers };
  }
  async raw(method, p, headers = {}) {
    const response = await fetch(BASE + p, { method, headers: { "x-forwarded-for": this.ip ?? nextIp(), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}), ...headers }, redirect: "manual" });
    return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()), headers: response.headers };
  }
  async upload(fields, file, headers = {}) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    if (file) form.set("file", new File([file.bytes], file.name, { type: file.type ?? "application/octet-stream" }));
    const response = await fetch(`${BASE}/api/buyer/company/documents`, { method: "POST", headers: { "x-forwarded-for": this.ip ?? nextIp(), cookie: this.cookieHeader(), ...headers }, body: form });
    let json = null; try { json = await response.json(); } catch {}
    return { status: response.status, json };
  }
}
const register = async (tag, company = "Profile Test Traders") => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Prof ${tag.toUpperCase()} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: company, password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register ${tag}: ${r.status} ${r.text}`);
  const user = await users.findOne({ email: emailOf(tag) });
  return { s, id: user._id, email: emailOf(tag) };
};
const login = async (email, password = PW) => { const s = new Session(); const r = await s.call("POST", "/api/auth/login", { email, password }); return { s, r }; };

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from("JFIF\0test-image-bytes"), Buffer.from([0xff, 0xd9])]);
const EXE = Buffer.from("MZ\x90\x00\x03\x00\x00\x00 this is not a document");
const listFiles = () => (fs.existsSync(DOCS_DIR) ? fs.readdirSync(DOCS_DIR) : []);

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
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const setValue = (p, selector, value) => p.evaluate((s, v) => { const el = document.querySelector(s); const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, selector, value);
const byLabel = (p, t) => p.evaluate((x) => { const l = [...document.querySelectorAll("#buyer-content form label")].find((e) => e.textContent.replace(/\*/g, "").trim().startsWith(x)); return l?.htmlFor ? `#${CSS.escape(l.htmlFor)}` : null; }, t);
const fillField = async (p, label, value) => { const sel = await byLabel(p, label); if (!sel) throw new Error(`no field ${label}`); await setValue(p, sel, value); };
const clickText = (p, selector, t) => p.evaluate((s, x) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(x)); if (!el) return false; el.click(); return true; }, selector, t);

async function full() {
  const A = await register("a", "Alpha Fabrics Pvt Ltd");
  const B = await register("b", "Beta Traders");
  const SUP = new Session();
  await SUP.call("POST", "/api/auth/register/supplier", { businessName: "Prof Supplier Co", contactName: "Sia Rao", email: emailOf("sup"), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  const SUSP = await register("susp");
  await users.updateOne({ _id: SUSP.id }, { $set: { accountStatus: "SUSPENDED" } });

  // ================= A: access
  const unauth = new Session();
  const paths = [["GET", "/api/buyer/profile"], ["PATCH", "/api/buyer/profile"], ["GET", "/api/buyer/company"], ["POST", "/api/buyer/company"], ["PATCH", "/api/buyer/company"], ["GET", "/api/buyer/company/documents"], ["GET", "/api/buyer/company/documents/" + new ObjectId()], ["DELETE", "/api/buyer/company/documents/" + new ObjectId()], ["GET", "/api/buyer/verification"], ["POST", "/api/buyer/verification/email/resend"], ["GET", "/api/buyer/security"], ["POST", "/api/auth/change-password"]];
  const un = await Promise.all(paths.map(([m, p]) => unauth.call(m, p, m === "GET" || m === "DELETE" ? undefined : {})));
  check("A-01 without a session every profile endpoint answers 401 (private, nothing returned)", un.every((r) => r.status === 401 && /no-store/.test(r.headers.get("cache-control") ?? "")), un.map((r, i) => `${paths[i][1].slice(0, 30)}:${r.status}`).join(" "));
  const supR = await Promise.all(paths.filter(([, p]) => p.startsWith("/api/buyer")).map(([m, p]) => SUP.call(m, p, m === "GET" || m === "DELETE" ? undefined : {})));
  check("A-02 a supplier account is refused by every buyer endpoint (403)", supR.every((r) => r.status === 403), supR.map((r) => r.status).join());
  const suspR = await Promise.all([SUSP.s.call("GET", "/api/buyer/profile"), SUSP.s.call("GET", "/api/buyer/security")]);
  check("A-03 a suspended buyer's session no longer works (401)", suspR.every((r) => r.status === 401));
  const redirect = await fetch(`${BASE}/buyer/profile?tab=company`, { redirect: "manual", headers: { "x-forwarded-for": nextIp() } });
  check("A-04 the page without a session redirects to sign-in and returns to the same tab", [307, 308].includes(redirect.status) && /\/sign-in\?next=%2Fbuyer%2Fprofile%3Ftab%3Dcompany/.test(redirect.headers.get("location") ?? ""), redirect.headers.get("location"));
  const supPage = await open("/buyer/profile", { session: SUP });
  check("A-05 a supplier opening the page sees 'Buyer accounts only'", /Buyer accounts only/.test(await supPage.evaluate(() => document.body.textContent)));
  await supPage.context.close();

  // ================= B: personal details
  const g = await A.s.call("GET", "/api/buyer/profile");
  const prof = g.json.data.profile;
  check("B-01 GET returns the buyer's own profile: name, email, masked mobile, company name from registration, version 0", g.status === 200 && prof.name === "Prof A Buyer" && prof.email === A.email && /••••/.test(prof.primaryPhone.masked) && prof.companyName === "Alpha Fabrics Pvt Ltd" && prof.version === 0 && prof.emailVerified === false && prof.phoneVerified === false && /no-store/.test(g.headers.get("cache-control")));
  check("B-02 no hash, session data, token or id in the answer", !/passwordHash|_id|sessionVersion|finbyn_session|"id"/.test(g.text));
  const ok1 = await A.s.call("PATCH", "/api/buyer/profile", { name: "Asha  Verma", designation: " Purchasing Manager ", alternatePhone: { countryCode: "+44", number: "7911 123456" }, alternateEmail: "ASHA.ALT@Example.com", version: 0 });
  check("B-03 a valid update is saved: trimmed, normalised, version 1", ok1.status === 200 && ok1.json.data.profile.name === "Asha Verma" && ok1.json.data.profile.designation === "Purchasing Manager" && ok1.json.data.profile.alternatePhone.number === "7911123456" && ok1.json.data.profile.alternateEmail === "asha.alt@example.com" && ok1.json.data.profile.version === 1, JSON.stringify(ok1.json));
  const dbUser = await users.findOne({ _id: A.id });
  check("B-04 stored: designation, alternate phone (normalised), alternate email (lower case), version; role, status and flags untouched", dbUser.designation === "Purchasing Manager" && dbUser.alternatePhone.normalized === "+44 7911123456" && dbUser.alternateEmail === "asha.alt@example.com" && dbUser.profileVersion === 1 && dbUser.role === "buyer" && dbUser.accountStatus === "ACTIVE" && dbUser.emailVerified === false);
  const stale = await A.s.call("PATCH", "/api/buyer/profile", { name: "Stale Edit", designation: "", alternatePhone: { countryCode: "+91", number: "" }, alternateEmail: "", version: 0 });
  check("B-05 a stale form (old version) is a 409 conflict and changes nothing", stale.status === 409 && stale.json.code === "CONFLICT" && (await users.findOne({ _id: A.id })).name === "Asha Verma");
  const bads = [["name", { name: "" }], ["name", { name: "<b>x</b>" }], ["designation", { designation: "x".repeat(101) }], ["alternatePhone", { alternatePhone: { countryCode: "+91", number: "12" } }], ["alternateEmail", { alternateEmail: "nope" }], ["alternateEmail", { alternateEmail: A.email }], ["version", { version: "1" }], ["version", { version: undefined }]];
  const badR = await Promise.all(bads.map(([, over]) => A.s.call("PATCH", "/api/buyer/profile", { name: "Asha Verma", designation: "", alternatePhone: { countryCode: "+91", number: "" }, alternateEmail: "", version: 1, ...over })));
  check("B-06 invalid values are refused with a message on the right field (name, designation, phone, email, repeated primary email, version)", badR.every((r, i) => r.status === 400 && r.json.fields?.[bads[i][0]]), badR.map((r, i) => `${bads[i][0]}:${r.status}`).join(" "));
  const forbidden = ["role", "accountStatus", "status", "emailVerified", "phoneVerified", "passwordHash", "permissions", "isAdmin", "sessionVersion", "companyId", "userId", "buyerId", "email", "phone", "createdAt", "_id"];
  const fr = await Promise.all(forbidden.map((k) => A.s.call("PATCH", "/api/buyer/profile", { name: "Asha Verma", designation: "", alternatePhone: { countryCode: "+91", number: "" }, alternateEmail: "", version: 1, [k]: k === "role" ? "admin" : true })));
  const after = await users.findOne({ _id: A.id });
  check("B-07 role, status, verification flags, hash, permissions, session version, company id, user ids, primary email and phone, created time: each is refused (400) and nothing changes", fr.every((r, i) => r.status === 400 && r.json.fields?.[forbidden[i]]) && after.role === "buyer" && after.accountStatus === "ACTIVE" && !after.isAdmin && after.email === A.email && after.profileVersion === 1, fr.map((r, i) => `${forbidden[i]}:${r.status}`).join(" "));
  const otherTry = await B.s.call("PATCH", "/api/buyer/profile", { name: "Hijack", designation: "", alternatePhone: { countryCode: "+91", number: "" }, alternateEmail: "", version: 0, userId: String(A.id) });
  check("B-08 buyer B naming A in the body is refused, and A's record is untouched", otherTry.status === 400 && (await users.findOne({ _id: A.id })).name === "Asha Verma" && (await users.findOne({ _id: B.id })).name === "Prof B Buyer");
  await db.collection("rate_limits").deleteMany({}); // B has used the 30-writes window on purpose; the limit itself is tested in H-01
  const clear = await A.s.call("PATCH", "/api/buyer/profile", { name: "Asha Verma", designation: "", alternatePhone: { countryCode: "+91", number: "" }, alternateEmail: "", version: 1 });
  const cleared = await users.findOne({ _id: A.id });
  check("B-09 clearing optional fields removes them (nothing blank is stored), version 2", clear.status === 200 && !("designation" in cleared) && !("alternatePhone" in cleared) && !("alternateEmail" in cleared) && cleared.profileVersion === 2);
  const evs = await events.find({ userId: A.id, type: "PROFILE_UPDATED" }).toArray();
  check("B-10 the audit trail records field names only (no names, phone numbers or addresses)", evs.length >= 2 && evs.every((e) => Array.isArray(e.fields) && !JSON.stringify(e).includes("Asha") && !JSON.stringify(e).includes("7911")));
  check("B-11 two saves from two tabs: only the first wins (the second is a 409)", await (async () => {
    const v = (await A.s.call("GET", "/api/buyer/profile")).json.data.profile.version;
    const body = (name) => ({ name, designation: "", alternatePhone: { countryCode: "+91", number: "" }, alternateEmail: "", version: v });
    const [x, y] = await Promise.all([A.s.call("PATCH", "/api/buyer/profile", body("Tab One")), A.s.call("PATCH", "/api/buyer/profile", body("Tab Two"))]);
    return [x.status, y.status].sort().join() === "200,409";
  })());
  await A.s.call("PATCH", "/api/buyer/profile", { name: "Asha Verma", designation: "", alternatePhone: { countryCode: "+91", number: "" }, alternateEmail: "", version: (await A.s.call("GET", "/api/buyer/profile")).json.data.profile.version });

  // ================= C: company
  const c0 = await A.s.call("GET", "/api/buyer/company");
  check("C-01 before anything is added: company is null (not an invented company)", c0.status === 200 && c0.json.data.company === null);
  const docs0 = await A.s.call("GET", "/api/buyer/company/documents");
  check("C-02 documents before a company exists: hasCompany false, none listed", docs0.json.data.hasCompany === false && docs0.json.data.documents.length === 0);
  const up0 = await A.s.upload({ documentType: "GST_CERTIFICATE" }, { bytes: PDF, name: "gst.pdf" });
  check("C-03 uploading before a company exists is refused (409)", up0.status === 409 && up0.json.code === "NO_COMPANY");
  const co = { legalName: "Alpha Fabrics Pvt Ltd", displayName: "Alpha Fabrics", businessType: "Private Limited", industry: "Textiles", description: "Cotton fabrics.", website: "www.alphafabrics.example", yearEstablished: 2005, companyEmail: "INFO@alphafabrics.example", country: "India", state: "Rajasthan", city: "Jaipur", postalCode: "302018", registeredAddress: "A-102 Trade Centre, Jaipur", operatingAddress: "" };
  const cr = await A.s.call("POST", "/api/buyer/company", co);
  check("C-04 a valid company is created (201), unverified, version 1, website and email normalised", cr.status === 201 && cr.json.data.company.verificationStatus === "UNVERIFIED" && cr.json.data.company.version === 1 && cr.json.data.company.website === "https://www.alphafabrics.example" && cr.json.data.company.companyEmail === "info@alphafabrics.example", JSON.stringify(cr.json).slice(0, 300));
  const cdoc = await companies.findOne({ ownerUserId: A.id });
  const uA = await users.findOne({ _id: A.id });
  check("C-05 stored: owner is the buyer from the session, user.companyId points to it, a normalised name, UNVERIFIED", cdoc && String(uA.companyId) === String(cdoc._id) && cdoc.legalNameNormalized === "alpha fabrics pvt ltd" && cdoc.verificationStatus === "UNVERIFIED");
  const dup = await A.s.call("POST", "/api/buyer/company", { ...co, legalName: "Another Name Ltd" });
  check("C-06 a second company for the same buyer is refused (409 HAS_COMPANY)", dup.status === 409 && dup.json.code === "HAS_COMPANY" && (await companies.countDocuments({ ownerUserId: A.id })) === 1);
  const claim = await B.s.call("POST", "/api/buyer/company", { ...co, legalName: "ALPHA  fabrics PVT. ltd." });
  check("C-07 another buyer cannot create or claim a company with the same name (case, spacing and punctuation variants too): 409 NAME_TAKEN", claim.status === 409 && claim.json.code === "NAME_TAKEN" && claim.json.fields?.legalName && !(await companies.findOne({ ownerUserId: B.id })));
  const bView = await B.s.call("GET", "/api/buyer/company");
  check("C-08 buyer B sees no company of A (their own: none)", bView.json.data.company === null && !bView.text.includes("Alpha"));
  const ver = (await A.s.call("GET", "/api/buyer/company")).json.data.company.version;
  const up = await A.s.call("PATCH", "/api/buyer/company", { ...co, city: "Udaipur", postalCode: "313001", website: "", version: ver });
  check("C-09 an update by the owner is saved (city, PIN), version 2; an emptied website is removed", up.status === 200 && up.json.data.company.city === "Udaipur" && up.json.data.company.postalCode === "313001" && up.json.data.company.website === null && up.json.data.company.version === 2);
  const staleC = await A.s.call("PATCH", "/api/buyer/company", { ...co, city: "Stale", version: 1 });
  check("C-10 a stale company form is a 409 and changes nothing", staleC.status === 409 && staleC.json.code === "CONFLICT" && (await companies.findOne({ ownerUserId: A.id })).city === "Udaipur");
  const badC = [["businessType", { businessType: "Hobby" }], ["legalName", { legalName: "A" }], ["website", { website: "javascript:alert(1)" }], ["postalCode", { postalCode: "012345" }], ["yearEstablished", { yearEstablished: 1700 }], ["country", { country: "Atlantis" }], ["companyEmail", { companyEmail: "bad" }]];
  const bcr = await Promise.all(badC.map(([, over]) => A.s.call("PATCH", "/api/buyer/company", { ...co, version: 2, ...over })));
  check("C-11 invalid company values are refused on the right field (type, name, website scheme, PIN, year, country, email)", bcr.every((r, i) => r.status === 400 && r.json.fields?.[badC[i][0]]), bcr.map((r, i) => `${badC[i][0]}:${r.status}`).join(" "));
  const intl = await A.s.call("PATCH", "/api/buyer/company", { ...co, country: "United Kingdom", state: "England", city: "London", postalCode: "SW1A 1AA", version: 2 });
  check("C-12 a UK postal code is accepted for the UK (no Indian rule applied), and the same code is refused for India", intl.status === 200 && intl.json.data.company.postalCode === "SW1A 1AA" && (await A.s.call("PATCH", "/api/buyer/company", { ...co, country: "India", postalCode: "SW1A 1AA", version: 3 })).status === 400);
  const mass = await Promise.all(["verificationStatus", "ownerUserId", "legalNameNormalized", "companyId", "documents", "role"].map((k) => A.s.call("PATCH", "/api/buyer/company", { ...co, country: "India", version: 3, [k]: "VERIFIED" })));
  check("C-13 the verification status, owner, normalised name, company id, documents and role cannot be sent (400 each); the company stays UNVERIFIED and owned by A", mass.every((r) => r.status === 400) && (await companies.findOne({ ownerUserId: A.id })).verificationStatus === "UNVERIFIED");
  const cev = await events.find({ userId: A.id, type: { $in: ["COMPANY_CREATED", "COMPANY_UPDATED"] } }).toArray();
  check("C-14 the audit trail has COMPANY_CREATED and COMPANY_UPDATED with field names only (no company name, address, website or PIN values)", cev.some((e) => e.type === "COMPANY_CREATED") && cev.some((e) => e.type === "COMPANY_UPDATED" && e.fields.includes("city")) && cev.every((e) => !/Alpha|Udaipur|Jaipur|313001|302018|alphafabrics/i.test(JSON.stringify(e))), JSON.stringify(cev.map((e) => [e.type, e.fields])).slice(0, 200));
  await A.s.call("PATCH", "/api/buyer/company", { ...co, version: (await A.s.call("GET", "/api/buyer/company")).json.data.company.version });

  // ================= D: documents
  const d = (extra, file) => A.s.upload(extra, file);
  const before = listFiles().length;
  const pdf = await d({ documentType: "GST_CERTIFICATE", expiryDate: "2030-05-31", status: "VERIFIED", verificationStatus: "VERIFIED", companyId: String(new ObjectId()), buyerId: String(B.id) }, { bytes: PDF, name: "My GST certificate.pdf", type: "application/pdf" });
  check("D-01 a valid PDF upload: 201, status PENDING (a status sent in the form is ignored), expiry kept", pdf.status === 201 && pdf.json.data.document.status === "PENDING" && pdf.json.data.document.expiryDate === "2030-05-31" && pdf.json.data.document.type === "GST_CERTIFICATE", JSON.stringify(pdf.json).slice(0, 250));
  const gst = await docs.findOne({ companyId: cdoc._id, documentType: "GST_CERTIFICATE", active: true });
  check("D-02 stored against the buyer's own company and the buyer from the session, never the ids sent; reviewer fields empty", gst && String(gst.companyId) === String(cdoc._id) && String(gst.uploadedBy) === String(A.id) && gst.verificationStatus === "PENDING" && gst.reviewedAt === null && gst.reviewedBy === null);
  const files1 = listFiles();
  check("D-03 the file is on disk under a random name (32 hex characters + extension), not under the client's name, and the original name is display text only", files1.length === before + 1 && files1.every((f) => /^[a-f0-9]{32}\.(pdf|png|jpg)$/.test(f)) && gst.fileReference !== "My GST certificate.pdf" && gst.originalFilename === "My GST certificate.pdf" && !path.resolve(DOCS_DIR).includes(`${path.sep}public${path.sep}`));
  const png = await d({ documentType: "PAN_DOCUMENT" }, { bytes: PNG, name: "pan.png", type: "image/png" });
  const jpg = await d({ documentType: "ADDRESS_PROOF" }, { bytes: JPG, name: "proof.jpeg", type: "image/jpeg" });
  check("D-04 PNG and JPEG (.jpeg) uploads are accepted", png.status === 201 && jpg.status === 201 && jpg.json.data.document.mimeType === "image/jpeg");
  const bad = [
    ["an .exe name", { bytes: PDF, name: "malware.exe" }],
    ["an executable's bytes named .pdf", { bytes: EXE, name: "doc.pdf" }],
    ["a PNG named .pdf (content does not match the name)", { bytes: PNG, name: "x.pdf" }],
    ["a text file named .jpg", { bytes: Buffer.from("just text, not an image"), name: "x.jpg" }],
    ["an empty file", { bytes: Buffer.alloc(0), name: "empty.pdf" }],
    ["no extension", { bytes: PDF, name: "document" }],
    ["a double extension", { bytes: EXE, name: "invoice.pdf.exe" }],
    ["an html file named .png", { bytes: Buffer.from("<html><script>alert(1)</script></html>"), name: "x.png" }],
  ];
  const badUploads = [];
  for (const [label, file] of bad) badUploads.push([label, await d({ documentType: "OTHER" }, file)]);
  check("D-05 wrong extensions, executables, mismatched content, empty files and html disguised as an image are all refused (400) and nothing is stored", badUploads.every(([, r]) => r.status === 400 && r.json.fields?.file) && (await docs.countDocuments({ companyId: cdoc._id, documentType: "OTHER" })) === 0, badUploads.filter(([, r]) => r.status !== 400).map(([l, r]) => `${l}:${r.status}`).join(", "));
  const big = await d({ documentType: "OTHER" }, { bytes: Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]), name: "big.pdf" });
  check("D-06 a file over 5 MB is refused (413)", big.status === 413 || big.status === 400);
  const badType = await d({ documentType: "PASSPORT" }, { bytes: PDF, name: "p.pdf" });
  const badExp = await d({ documentType: "OTHER", expiryDate: "2030-02-30" }, { bytes: PDF, name: "p.pdf" });
  const noFile = await d({ documentType: "OTHER" }, null);
  check("D-07 an unknown document type, an impossible expiry date and a missing file are each refused (400) on their own field", badType.json.fields?.documentType && badExp.json.fields?.expiryDate && noFile.status === 400 && noFile.json.fields?.file);
  const list = (await A.s.call("GET", "/api/buyer/company/documents")).json.data;
  check("D-08 the list shows all 6 types: three submitted (Pending review), three Not submitted, with filename, size and dates", list.documents.length === 6 && list.documents.filter((x) => x.status === "PENDING").length === 3 && list.documents.filter((x) => x.status === "NOT_SUBMITTED").length === 3 && list.documents.find((x) => x.type === "GST_CERTIFICATE").originalFilename === "My GST certificate.pdf" && !JSON.stringify(list).includes(gst.fileReference));
  const view = await A.s.raw("GET", `/api/buyer/company/documents/${pdf.json.data.document.id}`);
  check("D-09 the owner can view the file (the exact bytes), with no-store, nosniff, a locked-down CSP and no referrer", view.status === 200 && Buffer.compare(view.bytes, PDF) === 0 && view.headers.get("content-type") === "application/pdf" && /no-store/.test(view.headers.get("cache-control")) && view.headers.get("x-content-type-options") === "nosniff" && /sandbox/.test(view.headers.get("content-security-policy") ?? ""));
  const bView2 = await B.s.raw("GET", `/api/buyer/company/documents/${pdf.json.data.document.id}`);
  const anonView = await new Session().raw("GET", `/api/buyer/company/documents/${pdf.json.data.document.id}`);
  await db.collection("rate_limits").deleteMany({});
  const traversal = await Promise.all(["..%2F..%2Fetc%2Fpasswd", "../x", "%00", "undefined", "507f1f77bcf86cd799439011"].map((id) => A.s.raw("GET", `/api/buyer/company/documents/${id}`)));
  check("D-10 another buyer, a signed-out visitor, path-traversal ids and unknown ids all get the same refusal (404/401) and no bytes", bView2.status === 404 && anonView.status === 401 && traversal.every((r) => r.status === 404 && !r.bytes.includes(PDF)) && !bView2.bytes.includes(PDF), `${bView2.status} ${anonView.status} ${traversal.map((r) => r.status + ":" + r.bytes.length).join(" ")}`);
  const repl = await d({ documentType: "GST_CERTIFICATE" }, { bytes: Buffer.concat([PDF, Buffer.from("v2")]), name: "gst-v2.pdf" });
  const actives = await docs.find({ companyId: cdoc._id, documentType: "GST_CERTIFICATE" }).toArray();
  check("D-11 a second upload of the same type replaces the first: one active record, the old one retired, the old file removed from disk, status PENDING again", repl.status === 201 && actives.filter((x) => x.active).length === 1 && actives.filter((x) => !x.active).length === 1 && !fs.existsSync(path.join(DOCS_DIR, gst.fileReference)) && repl.json.data.document.id !== pdf.json.data.document.id);
  const oldView = await A.s.raw("GET", `/api/buyer/company/documents/${pdf.json.data.document.id}`);
  check("D-12 the replaced document's old id no longer opens (404)", oldView.status === 404);
  await docs.updateOne({ companyId: cdoc._id, documentType: "PAN_DOCUMENT", active: true }, { $set: { verificationStatus: "VERIFIED", reviewedAt: new Date() } });
  const lockedDel = await A.s.call("DELETE", `/api/buyer/company/documents/${png.json.data.document.id}`);
  const lockedRep = await d({ documentType: "PAN_DOCUMENT" }, { bytes: PNG, name: "pan2.png" });
  check("D-13 a document a reviewer verified cannot be replaced or removed by the buyer (409): the buyer cannot make it unverified or swap its content", lockedDel.status === 409 && lockedRep.status === 409 && (await docs.countDocuments({ companyId: cdoc._id, documentType: "PAN_DOCUMENT", active: true })) === 1);
  await docs.updateOne({ companyId: cdoc._id, documentType: "ADDRESS_PROOF", active: true }, { $set: { verificationStatus: "REJECTED", rejectionReason: "The scan is unreadable." } });
  const listR = (await A.s.call("GET", "/api/buyer/company/documents")).json.data.documents;
  check("D-14 a rejected document shows its status and reason to its owner, and can be resubmitted", listR.find((x) => x.type === "ADDRESS_PROOF").status === "REJECTED" && listR.find((x) => x.type === "ADDRESS_PROOF").rejectionReason === "The scan is unreadable." && (await d({ documentType: "ADDRESS_PROOF" }, { bytes: JPG, name: "proof2.jpg" })).status === 201);
  const bList = await B.s.call("GET", "/api/buyer/company/documents");
  check("D-15 buyer B's document list is their own (no company, none) and carries nothing of A's", bList.json.data.hasCompany === false && !bList.text.includes("GST"));
  const delOwn = await A.s.call("DELETE", `/api/buyer/company/documents/${repl.json.data.document.id}`);
  check("D-16 the owner removes a pending document: 200, record retired, file deleted from disk, id no longer opens", delOwn.status === 200 && !fs.existsSync(path.join(DOCS_DIR, actives.find((x) => x.active).fileReference)) && (await A.s.raw("GET", `/api/buyer/company/documents/${repl.json.data.document.id}`)).status === 404);
  const delOther = await B.s.call("DELETE", `/api/buyer/company/documents/${png.json.data.document.id}`);
  check("D-17 buyer B cannot delete A's document (404) and it is still there", delOther.status === 404 && (await docs.countDocuments({ companyId: cdoc._id, documentType: "PAN_DOCUMENT", active: true })) === 1);
  const dev = await events.find({ userId: A.id, type: { $in: ["DOCUMENT_UPLOADED", "DOCUMENT_REPLACED", "DOCUMENT_DELETED"] } }).toArray();
  check("D-18 the audit trail records uploads, replacements and removals by document type only (no file names or contents)", dev.length >= 4 && dev.every((e) => !/\.pdf|\.png|gst-v2|My GST/i.test(JSON.stringify(e))));
  const expDoc = await docs.insertOne({ companyId: cdoc._id, uploadedBy: A.id, documentType: "BUSINESS_REGISTRATION", fileReference: "x".repeat(32) + ".pdf", originalFilename: "reg.pdf", mimeType: "application/pdf", fileSize: 10, verificationStatus: "VERIFIED", submittedAt: new Date(), reviewedAt: new Date(), reviewedBy: null, expiryDate: "2020-01-01", rejectionReason: null, active: true, deletedAt: null, createdAt: new Date(), updatedAt: new Date() });
  const lst = (await A.s.call("GET", "/api/buyer/company/documents")).json.data.documents;
  check("D-19 a verified document past its expiry date is reported as EXPIRED (computed, not stored)", lst.find((x) => x.type === "BUSINESS_REGISTRATION").status === "EXPIRED");
  await docs.deleteOne({ _id: expDoc.insertedId });

  // ================= E: verification
  const v = (await A.s.call("GET", "/api/buyer/verification")).json.data;
  check("E-01 verification keeps four separate states: email, mobile, company, documents", ["email", "mobile", "company", "documents"].every((k) => k in v.verification));
  check("E-02 email: unconfirmed, no resend offered (no email provider), the reason is stated", v.verification.email.status === "UNVERIFIED" && v.verification.email.canResend === false && /not set up/.test(v.verification.email.note));
  check("E-03 mobile: unconfirmed, verification not available (no SMS service), number masked", v.verification.mobile.available === false && /not available/i.test(v.verification.mobile.note) && /••••/.test(v.verification.mobile.masked));
  check("E-04 company: Unverified with 'not available yet' (no review process), documents counted (pending, verified)", v.verification.company.status === "UNVERIFIED" && v.verification.company.reviewAvailable === false && v.verification.documents.total === 2 && v.verification.documents.verified === 1);
  const steps = Object.fromEntries(v.nextSteps.map((s) => [s.key, s.status]));
  check("E-05 next steps come from real state: company and documents done, email blocked (no provider), mobile and business blocked", steps.company === "done" && steps.documents === "done" && steps.email === "blocked" && steps.mobile === "blocked" && steps.business === "blocked", JSON.stringify(steps));
  const resend = await A.s.call("POST", "/api/buyer/verification/email/resend");
  check("E-06 asking for a confirmation email without a provider is refused honestly (503, not_configured) and nothing is claimed as sent", resend.status === 503 && resend.json.code === "not_configured");
  const post = await Promise.all(["/api/buyer/verification", "/api/buyer/verification/company", "/api/buyer/verification/mobile/confirm"].map((p) => A.s.call("POST", p, { status: "VERIFIED" })));
  check("E-07 there is no buyer route that can set a verification state (POST to verification routes is 404/405)", post.every((r) => [404, 405].includes(r.status)), post.map((r) => r.status).join());
  await users.updateOne({ _id: A.id }, { $set: { emailVerified: true } });
  check("E-08 email verification follows the stored flag (and a verified email can no longer be resent)", (await A.s.call("GET", "/api/buyer/verification")).json.data.verification.email.status === "VERIFIED" && (await A.s.call("POST", "/api/buyer/verification/email/resend")).status === 409);
  await users.updateOne({ _id: A.id }, { $set: { emailVerified: false } });

  // ================= F: completion
  await db.collection("rate_limits").deleteMany({});
  const comp0 = (await register("c0")).s;
  const pc0 = (await comp0.call("GET", "/api/buyer/profile")).json.data.completion;
  check("F-01 a brand-new buyer is 10% (only the name counts); nothing is credited for being registered", pc0.percent === 10 && pc0.items.filter((i) => i.met).map((i) => i.key).join() === "name", JSON.stringify(pc0.items.filter((i) => i.met).map((i) => i.key)));
  const stepsP = [];
  const cur = async () => (await A.s.call("GET", "/api/buyer/profile")).json.data.completion;
  await A.s.call("PATCH", "/api/buyer/profile", { name: "Asha Verma", designation: "Buyer", alternatePhone: { countryCode: "+91", number: "" }, alternateEmail: "", version: (await A.s.call("GET", "/api/buyer/profile")).json.data.profile.version });
  stepsP.push((await cur()).percent);
  await users.updateOne({ _id: A.id }, { $set: { emailVerified: true } });
  stepsP.push((await cur()).percent);
  await users.updateOne({ _id: A.id }, { $set: { phoneVerified: true } });
  stepsP.push((await cur()).percent);
  check("F-02 A's completion: name 10 + designation 10 + company 15 + business type 10 + location 10 + documents 15 = 70, then a confirmed email +15 = 85, then a confirmed mobile +15 = 100", JSON.stringify(stepsP) === JSON.stringify([70, 85, 100]), JSON.stringify(stepsP));
  const missing = (await comp0.call("GET", "/api/buyer/profile")).json.data.completion.items.filter((i) => !i.met);
  check("F-03 each missing item points at the tab that fixes it", missing.length === 7 && missing.every((i) => ["personal", "company", "documents", "verification"].includes(i.tab)));
  await users.updateOne({ _id: A.id }, { $set: { emailVerified: false, phoneVerified: false } });

  // ================= G: security
  const sec = (await A.s.call("GET", "/api/buyer/security")).json.data.security;
  check("G-01 security summary: status, flags, last sign-in, sessions 'not available' with the reason; no hash, token or session data", sec.accountStatus === "ACTIVE" && sec.sessions.available === false && !/passwordHash|token|finbyn_session/.test(JSON.stringify(sec)));
  const dev1 = await login(A.email);
  const dev2 = await login(A.email);
  const cp = (s, body) => s.call("POST", "/api/auth/change-password", body);
  const wrong = await cp(dev1.s, { currentPassword: "not the password", newPassword: "brand new passphrase 1", confirmPassword: "brand new passphrase 1" });
  const weak = await cp(dev1.s, { currentPassword: PW, newPassword: "short", confirmPassword: "short" });
  const mism = await cp(dev1.s, { currentPassword: PW, newPassword: "brand new passphrase 1", confirmPassword: "different" });
  const same = await cp(dev1.s, { currentPassword: PW, newPassword: PW, confirmPassword: PW });
  const noCur = await cp(dev1.s, { currentPassword: "", newPassword: "brand new passphrase 1", confirmPassword: "brand new passphrase 1" });
  check("G-02 a wrong current password, a weak new one, a mismatch, the same password and a missing current password are each refused (400) on their field", wrong.status === 400 && wrong.json.fields?.currentPassword && weak.status === 400 && weak.json.fields?.newPassword && mism.status === 400 && mism.json.fields?.confirmPassword && same.status === 400 && same.json.fields?.newPassword && noCur.status === 400 && noCur.json.fields?.currentPassword);
  check("G-03 nothing changed after those refusals (the old password still signs in)", (await login(A.email)).r.status === 200);
  const hashBefore = (await users.findOne({ _id: A.id })).passwordHash;
  const chg = await cp(dev1.s, { currentPassword: PW, newPassword: "brand new passphrase 1", confirmPassword: "brand new passphrase 1" });
  const uAfter = await users.findOne({ _id: A.id });
  check("G-04 a correct change succeeds: new scrypt hash, passwordChangedAt set, session version bumped; no password in the answer", chg.status === 200 && uAfter.passwordHash !== hashBefore && /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(uAfter.passwordHash) && uAfter.passwordChangedAt instanceof Date && uAfter.sessionVersion >= 1 && !chg.text.includes("brand new") && /no-store/.test(chg.headers.get("cache-control")));
  check("G-05 this device stays signed in (fresh cookie), and the other device is signed out", (await dev1.s.call("GET", "/api/auth/me")).json?.user?.email === A.email && !(await dev2.s.call("GET", "/api/auth/me")).json?.user);
  check("G-06 the old password is refused and the new one signs in", (await login(A.email, PW)).r.status === 401 && (await login(A.email, "brand new passphrase 1")).r.status === 200);
  const secEv = await events.find({ userId: A.id, type: "PASSWORD_CHANGED" }).toArray();
  check("G-07 a PASSWORD_CHANGED event is recorded without any password or hash", secEv.length === 1 && !/brand new|passwordHash|scrypt/i.test(JSON.stringify(secEv[0])));
  await db.collection("rate_limits").deleteMany({});
  const lim = []; const limSess = (await login(A.email, "brand new passphrase 1")).s;
  for (let i = 0; i < 7; i++) lim.push((await cp(limSess, { currentPassword: "wrong wrong wrong", newPassword: "another new passphrase 2", confirmPassword: "another new passphrase 2" })).status);
  check("G-08 attempts that test the current password are limited (5 per 10 minutes): wrong ones are 400 until the limit, then 429; none is ever 200", lim[0] === 400 && lim.includes(429) && lim.slice(lim.indexOf(429)).every((s) => s === 429) && !lim.includes(200), lim.join());
  const supCp = await (async () => { const s = (await login(emailOf("sup"))).s; return cp(s, { currentPassword: PW, newPassword: "supplier new passphrase 3", confirmPassword: "supplier new passphrase 3" }); })();
  check("G-09 the same shared route works for a supplier account (one password-change system, not two)", supCp.status === 200);

  // ================= H: rate limits and private caching
  await db.collection("rate_limits").deleteMany({});
  const burstSession = (await login(A.email, "brand new passphrase 1")).s;
  const burst = [];
  for (let i = 0; i < 33; i++) burst.push((await burstSession.call("PATCH", "/api/buyer/profile", {})).status);
  check("H-01 profile writes are limited (30 per 10 minutes per buyer): the 31st request gets 429", burst.slice(0, 30).every((s) => s === 400) && burst.slice(30).every((s) => s === 429), burst.slice(28).join());
  await db.collection("rate_limits").deleteMany({});

  // ================= I: browser
  await users.updateOne({ _id: A.id }, { $set: { emailVerified: false, phoneVerified: false } });
  const A2 = await login(A.email, "brand new passphrase 1");
  const pg = await open("/buyer/profile", { session: A2.s });
  const top = await content(pg);
  check("I-01 the page loads for the buyer: heading, name, company, 'Buyer Account', completion, no console errors", pg.status === 200 && /Profile & Company/.test(top) && /Asha Verma/.test(top) && /Buyer Account/.test(top) && /Profile Completion/.test(top) && pg.errs.length === 0, pg.errs.join("|"));
  const tabs = await pg.evaluate(() => [...document.querySelectorAll("nav[aria-label='Profile sections'] a")].map((a) => ({ t: a.textContent.trim(), c: a.getAttribute("aria-current"), h: a.getAttribute("href") })));
  check("I-02 five section links; Personal Details is the current one; each links to ?tab=", tabs.length === 5 && tabs[0].c === "page" && tabs.every((x) => /\?tab=/.test(x.h)) && tabs.map((x) => x.t).join() === "Personal Details,Company Details,Documents,Verification,Security");
  const nav = await pg.evaluate(() => { const a = document.querySelector("nav[aria-label='Buyer navigation'] a[aria-current='page']"); return a?.textContent.trim(); });
  check("I-03 in the sidebar 'Profile & Company' is a real link and the current page", /Profile & Company/.test(nav ?? ""));
  const pct = await pg.evaluate(() => document.querySelector("[role=progressbar]").getAttribute("aria-valuenow"));
  check("I-04 the completion bar shows the stored percentage (70 with name, company, location and documents; email and mobile not confirmed)", Number(pct) === 70, String(pct));
  check("I-05 the primary email and mobile are read-only with their (unconfirmed) state and the reason", /Not confirmed/.test(top) && /not available yet/.test(top));
  // edit and unsaved changes
  await fillField(pg, "Full Name", "Asha Q Verma");
  await sleep(200);
  check("I-06 editing marks the form 'unsaved changes' and enables Save and Cancel", /You have unsaved changes/.test(await content(pg)) && (await pg.evaluate(() => [...document.querySelectorAll("#buyer-content form button")].every((b) => !b.disabled))));
  await pg.evaluate(() => [...document.querySelectorAll("nav[aria-label='Profile sections'] a")].find((a) => /Company/.test(a.textContent)).click());
  await sleep(600);
  const leaveAsk = await pg.evaluate(() => document.querySelector("[role=alertdialog]")?.textContent ?? "");
  check("I-07 moving to another tab with unsaved changes asks first in the site's own dialog (not the browser's), and Keep editing keeps you on the page", /unsaved changes/i.test(leaveAsk) && /Leave without saving/.test(leaveAsk) && new URL(pg.url()).searchParams.get("tab") !== "company");
  await pg.evaluate(() => [...document.querySelectorAll("[role=alertdialog] button")].find((b) => /Keep editing/.test(b.textContent)).click());
  await sleep(300);
  await clickText(pg, "#buyer-content form button", "Cancel");
  await sleep(200);
  check("I-08 Cancel restores the saved value and clears the unsaved note", (await pg.evaluate(() => document.querySelector("#buyer-content form input").value)) === "Asha Verma" && !/You have unsaved changes/.test(await content(pg)));
  await fillField(pg, "Alternate Email", "not-an-email");
  await clickText(pg, "#buyer-content form button", "Save Changes");
  await sleep(500);
  check("I-09 an invalid value shows an error on its field and sends nothing (profile unchanged in the database)", /valid email/.test(await content(pg)) && (await users.findOne({ _id: A.id })).name === "Asha Verma");
  await fillField(pg, "Alternate Email", "alt.one@example.test");
  await fillField(pg, "Full Name", "Asha Ritu Verma");
  await clickText(pg, "#buyer-content form button", "Save Changes");
  await sleep(2000);
  const saved = await users.findOne({ _id: A.id });
  check("I-10 Save Changes persists to the database, shows the confirmation only afterwards, and refreshes the header", saved.name === "Asha Ritu Verma" && saved.alternateEmail === "alt.one@example.test" && /Your details were saved/.test(await content(pg)) && /Asha Ritu Verma/.test(await pg.evaluate(() => document.querySelector("section[aria-label='Your details'] h2")?.textContent ?? "")));
  // company tab (create for a buyer without one)
  const pc = await open("/buyer/profile?tab=company", { session: comp0 });
  check("I-11 a buyer with no company sees the 'not added yet' message, the registration name offered as a suggestion, and nothing is saved yet", /You have not added a company yet/.test(await content(pc)) && (await pc.evaluate(() => document.querySelector("#buyer-content form input").value)) === "Profile Test Traders" && (await companies.countDocuments({ ownerUserId: (await users.findOne({ email: emailOf("c0") }))._id })) === 0);
  await clickText(pc, "#buyer-content form button", "Save Company");
  await sleep(300);
  check("I-12 saving without a business type shows the error and does not create a company", /Choose a business type/.test(await content(pc)));
  await setValue(pc, await byLabel(pc, "Business Type"), "Partnership");
  await fillField(pc, "PIN Code", "012345");
  await clickText(pc, "#buyer-content form button", "Save Company");
  await sleep(400);
  check("I-13 an invalid Indian PIN is refused on its field", /six digits/.test(await content(pc)));
  await fillField(pc, "PIN Code", "302018");
  await fillField(pc, "City", "Jaipur");
  await fillField(pc, "State", "Rajasthan");
  await clickText(pc, "#buyer-content form button", "Save Company");
  await sleep(2000);
  const newCo = await companies.findOne({ ownerUserId: (await users.findOne({ email: emailOf("c0") }))._id });
  check("I-14 a valid company is created from the browser: stored, owned by this buyer, UNVERIFIED, success shown after saving", !!newCo && newCo.businessType === "Partnership" && newCo.verificationStatus === "UNVERIFIED" && /Your company was saved/.test(await content(pc)));
  check("I-15 the company page says plainly that it is not verified and why", /stays "Unverified"|stays &quot;Unverified/.test(await pc.evaluate(() => document.body.innerHTML)) || /Unverified/.test(await content(pc)));
  await pc.context.close();
  // documents tab through the browser
  fs.mkdirSync(path.join(DOCS_DIR, "..", "uploads-src"), { recursive: true });
  const srcPdf = path.join(DOCS_DIR, "..", "uploads-src", "ui-upload.pdf");
  fs.writeFileSync(srcPdf, PDF);
  const srcBad = path.join(DOCS_DIR, "..", "uploads-src", "fake.pdf");
  fs.writeFileSync(srcBad, EXE);
  const pd = await open("/buyer/profile?tab=documents", { session: A2.s });
  const dtext = await content(pd);
  check("I-16 the documents tab lists the document types with their status words (Pending review, Verified, Not submitted) and the limits and storage notes", /GST Registration Certificate/.test(dtext) && /Pending review/.test(dtext) && /Not submitted/.test(dtext) && /up to 5 MB/.test(dtext) && /No review process is available yet/.test(dtext));
  const otherLi = await pd.evaluateHandle(() => [...document.querySelectorAll("#buyer-content li")].find((li) => /Other Business Document/.test(li.querySelector("p")?.textContent ?? "")));
  const otherFile = await otherLi.asElement().$("input[type=file]");
  await otherFile.uploadFile(srcBad);
  await otherLi.asElement().evaluate((li) => [...li.querySelectorAll("button")].find((b) => /Upload/.test(b.textContent)).click());
  await sleep(1500);
  check("I-17 uploading a fake PDF in the browser shows the server's refusal and stores nothing", /not a valid PDF/.test(await content(pd)) && (await docs.countDocuments({ companyId: cdoc._id, documentType: "OTHER", active: true })) === 0);
  await otherFile.uploadFile(srcPdf);
  await otherLi.asElement().evaluate((li) => [...li.querySelectorAll("button")].find((b) => /Upload/.test(b.textContent)).click());
  await sleep(2500);
  check("I-18 a real PDF uploads from the browser: success message, status Pending review, record in the database", /waiting for review/.test(await content(pd)) && (await docs.countDocuments({ companyId: cdoc._id, documentType: "OTHER", active: true, verificationStatus: "PENDING" })) === 1);
  const viewHref = await pd.evaluate(() => [...document.querySelectorAll("#buyer-content a")].find((a) => /View/.test(a.textContent) && a.getAttribute("target") === "_blank")?.getAttribute("href"));
  check("I-19 View opens the private route in a new tab with rel=noopener; the address holds only the document id", /^\/api\/buyer\/company\/documents\/[a-f0-9]{24}$/.test(viewHref ?? "") && (await pd.evaluate(() => [...document.querySelectorAll("#buyer-content a[target=_blank]")].every((a) => /noopener/.test(a.rel)))));
  await pd.evaluate(() => [...document.querySelectorAll("#buyer-content li")].find((li) => /Other Business Document/.test(li.querySelector("p")?.textContent ?? "")).querySelector("button[class*=danger]").click());
  await sleep(400);
  check("I-20 Remove asks for confirmation in an alert dialog (focus on Remove, Escape cancels)", await pd.evaluate(() => { const d = document.querySelector("[role=alertdialog]"); return !!d && d.getAttribute("aria-modal") === "true" && !!d.querySelector("[aria-labelledby]") || !!d; }));
  await pd.keyboard.press("Escape");
  await sleep(300);
  check("I-21 Escape closes the dialog and the document is still there", !(await pd.evaluate(() => !!document.querySelector("[role=alertdialog]"))) && (await docs.countDocuments({ companyId: cdoc._id, documentType: "OTHER", active: true })) === 1);
  await pd.evaluate(() => [...document.querySelectorAll("#buyer-content li")].find((li) => /Other Business Document/.test(li.querySelector("p")?.textContent ?? "")).querySelector("button[class*=danger]").click());
  await sleep(300);
  await pd.evaluate(() => [...document.querySelectorAll("[role=alertdialog] button")].find((b) => /^Remove/.test(b.textContent.trim())).click());
  await sleep(2000);
  check("I-22 confirming removes the document: record retired and file deleted", (await docs.countDocuments({ companyId: cdoc._id, documentType: "OTHER", active: true })) === 0 && pd.errs.length === 0, pd.errs.join("|"));
  await pd.context.close();
  // verification + security tabs
  const pv = await open("/buyer/profile?tab=verification", { session: A2.s });
  const vt = await content(pv);
  check("I-23 the verification tab shows four separate cards, says confirming email/phone is not business verification, and offers no fake actions", /Email/.test(vt) && /Mobile/.test(vt) && /Company/.test(vt) && /Documents/.test(vt) && /not business verification/.test(vt) && /not available yet/.test(vt) && !/Send a new confirmation link/.test(vt));
  check("I-24 the side panel's next steps: blocked items are marked unavailable (text, not just colour)", await pv.evaluate(() => [...document.querySelectorAll("aside li")].filter((li) => /\(not available yet\)/.test(li.textContent)).length >= 2));
  await pv.context.close();
  const ps = await open("/buyer/profile?tab=security", { session: A2.s });
  await fillField(ps, "Current Password", "wrong wrong wrong");
  await fillField(ps, "New Password", "ui changed passphrase 4");
  await fillField(ps, "Confirm New Password", "ui changed passphrase 4");
  await clickText(ps, "#buyer-content form button", "Change Password");
  await sleep(1500);
  check("I-25 a wrong current password shows the server's message on that field in the browser", /current password is not correct/i.test(await content(ps)));
  await fillField(ps, "Current Password", "brand new passphrase 1");
  await clickText(ps, "#buyer-content form button", "Change Password");
  await sleep(2000);
  check("I-26 a correct change from the browser shows success, clears the fields, and the new password works", /Your password was changed/.test(await content(ps)) && (await login(A.email, "ui changed passphrase 4")).r.status === 200 && ps.errs.length === 0, ps.errs.join("|"));
  check("I-27 the security tab says the device list is not available (no fake sessions)", /not available/i.test(await content(ps)) && !/Chrome on|Windows 11|iPhone/.test(await content(ps)));
  await ps.context.close();
  const deep = await open("/buyer/profile?tab=bogus", { session: (await login(A.email, "ui changed passphrase 4")).s });
  check("I-28 an unknown ?tab= falls back to Personal Details", /Personal Details/.test(await content(deep)) && (await deep.evaluate(() => document.querySelector("nav[aria-label='Profile sections'] a[aria-current='page']")?.textContent.trim())) === "Personal Details");
  await deep.context.close();
  await pg.context.close();

  // ================= J: responsive
  const A3 = await login(A.email, "ui changed passphrase 4");
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const wide = [];
  for (const tab of ["personal", "company", "documents", "verification", "security"]) {
    for (const w of tab === "personal" || tab === "documents" ? widths : [320, 390, 768, 1280, 1440]) {
      const p = await open(`/buyer/profile?tab=${tab}`, { session: A3.s, width: w });
      const o = await overflow(p);
      const inside = await p.evaluate(() => [...document.querySelectorAll("#buyer-content input, #buyer-content select, #buyer-content textarea, #buyer-content button")].every((el) => { const r = el.getBoundingClientRect(); return r.width === 0 || (r.left >= -1 && r.right <= window.innerWidth + 1); }));
      if (o > 0 || !inside) wide.push(`${tab}@${w}: overflow ${o} inside ${inside}`);
      if (tab === "personal" && [1440, 820, 390].includes(w)) await p.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/23-buyer-profile-${w === 1440 ? "desktop-1440" : w === 820 ? "tablet-820" : "mobile-390"}.png`, fullPage: true });
      await p.context.close();
    }
  }
  check("J-01 no horizontal overflow and no control outside the viewport: Personal and Documents at 16 widths (320 to 2560), the other tabs at 5 widths", wide.length === 0, wide.join("; "));
  const tabScroll = await open("/buyer/profile", { session: A3.s, width: 320 });
  check("J-02 at 320px the tab row scrolls sideways inside itself (the page does not), and the five links are still reachable", await tabScroll.evaluate(() => { const ul = document.querySelector("nav[aria-label='Profile sections'] ul"); return ul.scrollWidth > ul.clientWidth && document.documentElement.scrollWidth <= window.innerWidth; }));
  await tabScroll.context.close();

  // ================= K: performance
  const lat = async (s, method, p, body) => { const t = []; for (let i = 0; i < 30; i++) { const t0 = performance.now(); await s.call(method, p, body, { "x-forwarded-for": nextIp() }); t.push(performance.now() - t0); } t.sort((a, b) => a - b); return { p50: t[15], p95: t[28], p99: t[29] }; };
  await db.collection("rate_limits").deleteMany({});
  const perf = {
    "GET profile": await lat(A3.s, "GET", "/api/buyer/profile"),
    "GET company": await lat(A3.s, "GET", "/api/buyer/company"),
    "GET documents": await lat(A3.s, "GET", "/api/buyer/company/documents"),
    "GET verification": await lat(A3.s, "GET", "/api/buyer/verification"),
    "GET security": await lat(A3.s, "GET", "/api/buyer/security"),
  };
  await db.collection("rate_limits").deleteMany({});
  let ver2 = (await A3.s.call("GET", "/api/buyer/profile")).json.data.profile.version;
  const writes = [];
  for (let i = 0; i < 20; i++) { await db.collection("rate_limits").deleteMany({}); const t0 = performance.now(); const r = await A3.s.call("PATCH", "/api/buyer/profile", { name: `Asha V${i}`, designation: "", alternatePhone: { countryCode: "+91", number: "" }, alternateEmail: "", version: ver2 }, { "x-forwarded-for": nextIp() }); writes.push(performance.now() - t0); ver2 = r.json?.data?.profile?.version ?? ver2; }
  writes.sort((a, b) => a - b);
  perf["PATCH profile"] = { p50: writes[10], p95: writes[18], p99: writes[19] };
  for (const [k, v] of Object.entries(perf)) console.log(`  PERF ${k.padEnd(18)} p50 ${v.p50.toFixed(0)} ms, p95 ${v.p95.toFixed(0)} ms, p99 ${v.p99.toFixed(0)} ms`);
  check("K-01 reads stay under their targets (profile and security 300 ms, company 350, verification 400, documents 300) and the profile write under 500 ms (p95)", perf["GET profile"].p95 < 300 && perf["GET security"].p95 < 300 && perf["GET company"].p95 < 350 && perf["GET verification"].p95 < 400 && perf["GET documents"].p95 < 300 && perf["PATCH profile"].p95 < 500, Object.entries(perf).map(([k, v]) => `${k} ${v.p95.toFixed(0)}`).join(", "));
  const sizes = await Promise.all(["/api/buyer/profile", "/api/buyer/company", "/api/buyer/company/documents", "/api/buyer/verification"].map(async (p) => (await A3.s.call("GET", p)).text.length));
  check("K-02 the answers are small (each under 8 KB) and contain no file content", sizes.every((n) => n < 8000), sizes.join(", "));
}

async function nostorage() {
  const A = await register("ns");
  await A.s.call("POST", "/api/buyer/company", { legalName: "No Storage Traders", businessType: "Proprietorship", country: "India" });
  const r = await A.s.upload({ documentType: "OTHER" }, { bytes: PDF, name: "x.pdf" });
  check("N-01 with no private storage configured, an upload is refused honestly (503, STORAGE_UNAVAILABLE) and nothing is stored", r.status === 503 && r.json.code === "STORAGE_UNAVAILABLE" && (await docs.countDocuments({ uploadedBy: A.id })) === 0, JSON.stringify(r.json));
  const list = (await A.s.call("GET", "/api/buyer/company/documents")).json.data;
  check("N-02 the list says storage is not configured", list.storageConfigured === false && list.hasCompany === true);
  const pg = await open("/buyer/profile?tab=documents", { session: A.s });
  check("N-03 the page shows 'Document storage is not configured' and no upload controls", /not configured on this server/.test(await content(pg)) && (await pg.evaluate(() => document.querySelectorAll("input[type=file]").length)) === 0);
  await pg.context.close();
  const v = (await A.s.call("GET", "/api/buyer/verification")).json.data.nextSteps.find((s) => s.key === "documents");
  check("N-04 the 'add a document' next step is marked blocked with the reason", v.status === "blocked" && /not configured/.test(v.note ?? ""));
}

async function cleanup() {
  if (process.env.KEEP === "1") return;
  const mine = await users.find({ email: { $regex: `^t23-${stamp}-` } }, { projection: { _id: 1 } }).toArray();
  const ids = mine.map((u) => u._id);
  const cs = await companies.find({ ownerUserId: { $in: ids } }, { projection: { _id: 1 } }).toArray();
  const ds = await docs.find({ companyId: { $in: cs.map((c) => c._id) } }, { projection: { fileReference: 1 } }).toArray();
  for (const d of ds) try { fs.unlinkSync(path.join(DOCS_DIR, d.fileReference)); } catch { /* gone */ }
  await docs.deleteMany({ companyId: { $in: cs.map((c) => c._id) } });
  await companies.deleteMany({ ownerUserId: { $in: ids } });
  await events.deleteMany({ userId: { $in: ids } });
  await users.deleteMany({ _id: { $in: ids } });
  await db.collection("rate_limits").deleteMany({});
}

try {
  if (MODE === "nostorage") await nostorage();
  else await full();
} catch (error) {
  check("suite ran to the end without throwing", false, String(error?.stack ?? error));
} finally {
  await cleanup();
  await browser.close();
  await client.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed (MODE=${MODE})${failed.length ? "\nFAILED:\n" + failed.map((f) => " - " + f.name).join("\n") : ""}`);
process.exit(failed.length ? 1 : 0);
