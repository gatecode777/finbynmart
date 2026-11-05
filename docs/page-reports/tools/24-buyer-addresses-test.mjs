import fs from "node:fs";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Page 24 (Buyer Address Book: /buyer/addresses and /api/buyer/addresses...), plus the saved-address chooser on the inquiry form.
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test with NO email provider, Chrome and puppeteer-core.
// Writes only to the throwaway database and removes its own users and addresses at the end unless KEEP=1.
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
const users = db.collection("users"), addr = db.collection("buyer_addresses"), events = db.collection("security_events"), inquiries = db.collection("inquiries");
await db.collection("rate_limits").deleteMany({});

const stamp = Date.now();
const emailOf = (tag) => `t24-${stamp}-${tag}@example.test`;
let ipN = 0;
const nextIp = () => `10.24.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "address test passphrase";

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
}
const register = async (tag, company = "Address Test Traders") => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Addr ${tag.toUpperCase()} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: company, password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register ${tag}: ${r.status} ${r.text}`);
  const user = await users.findOne({ email: emailOf(tag) });
  return { s, id: user._id, email: emailOf(tag) };
};

const A1 = (over = {}) => ({ label: "Head Office", purposes: ["BUSINESS", "BILLING"], contactPerson: "Rahul Kumawat", companyName: "R.K. Textiles Pvt. Ltd.", phone: { countryCode: "+91", number: "98765 43210" }, addressLine1: "A-102, Mahaveer Trade Center, Tonk Road", addressLine2: "", landmark: "Near Gandhi Circle", country: "India", state: "Rajasthan", city: "Jaipur", postalCode: "302018", ...over });
const DELIVERY = (over = {}) => A1({ label: "Warehouse - Sitapura", purposes: ["DELIVERY", "GOODS_RECEIVING"], addressLine1: "Plot No. 28, Industrial Area, Sitapura", landmark: "", postalCode: "302022", phone: { countryCode: "+91", number: "98290 11223" }, ...over });

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
async function open(p, { width = 1440, height = 900, session } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.dialogs = [];
  page.on("dialog", (d) => { page.dialogs.push(d.message()); d.dismiss(); });
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
const dlgField = (p, label) => p.evaluate((x) => { const l = [...document.querySelectorAll("[role=dialog] label")].find((e) => e.textContent.replace(/\*/g, "").trim().startsWith(x)); return l?.htmlFor ? `#${CSS.escape(l.htmlFor)}` : null; }, label);
const fill = async (p, label, value) => { const sel = await dlgField(p, label); if (!sel) throw new Error(`no dialog field ${label}`); await setValue(p, sel, value); };
const clickText = (p, selector, t) => p.evaluate((s, x) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(x)); if (!el) return false; el.click(); return true; }, selector, t);
const toggleCheck = (p, label) => p.evaluate((x) => { const l = [...document.querySelectorAll("[role=dialog] label")].find((e) => e.textContent.trim().startsWith(x)); l.querySelector("input").click(); }, label);

async function main() {
  const A = await register("a", "Alpha Fabrics Pvt Ltd");
  const B = await register("b");
  const SUP = new Session();
  await SUP.call("POST", "/api/auth/register/supplier", { businessName: "Addr Supplier Co", contactName: "Sia Rao", email: emailOf("sup"), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  const SUSP = await register("susp");
  await users.updateOne({ _id: SUSP.id }, { $set: { accountStatus: "SUSPENDED" } });

  // ================= A: access
  const un = new Session();
  const ids = new ObjectId().toString();
  const routes = [["GET", "/api/buyer/addresses"], ["POST", "/api/buyer/addresses"], ["GET", `/api/buyer/addresses/${ids}`], ["PATCH", `/api/buyer/addresses/${ids}`], ["DELETE", `/api/buyer/addresses/${ids}`], ["PATCH", `/api/buyer/addresses/${ids}/default`]];
  const unr = await Promise.all(routes.map(([m, p]) => un.call(m, p, m === "GET" || m === "DELETE" ? undefined : {})));
  check("A-01 without a session every address endpoint answers 401 (private, nothing returned)", unr.every((r) => r.status === 401 && /no-store/.test(r.headers.get("cache-control") ?? "")), unr.map((r) => r.status).join());
  const supr = await Promise.all(routes.map(([m, p]) => SUP.call(m, p, m === "GET" || m === "DELETE" ? undefined : {})));
  check("A-02 a supplier account is refused by every address endpoint (403)", supr.every((r) => r.status === 403), supr.map((r) => r.status).join());
  check("A-03 a suspended buyer's session no longer works (401)", (await SUSP.s.call("GET", "/api/buyer/addresses")).status === 401);
  const red = await fetch(`${BASE}/buyer/addresses?type=delivery`, { redirect: "manual", headers: { "x-forwarded-for": nextIp() } });
  check("A-04 the page without a session redirects to sign-in and comes back to the address book", [307, 308].includes(red.status) && /\/sign-in\?next=%2Fbuyer%2Faddresses/.test(red.headers.get("location") ?? ""));
  const idxLater = async () => {
  const idx = await addr.indexes();
  check("A-05 the database itself allows one default billing and one default delivery address per buyer (two partial unique indexes)", idx.some((i) => i.name === "one_default_billing_per_buyer" && i.unique && i.partialFilterExpression?.isDefaultBilling === true) && idx.some((i) => i.name === "one_default_delivery_per_buyer" && i.unique && i.partialFilterExpression?.isDefaultDelivery === true), idx.map((i) => i.name).join());
  };

  // ================= B: create
  const empty = (await A.s.call("GET", "/api/buyer/addresses")).json.data;
  check("B-01 a new buyer has no addresses and zero statistics (no sample addresses)", empty.addresses.length === 0 && empty.statistics.total === 0 && empty.statistics.hasDefaultBilling === false && empty.statistics.hasDefaultDelivery === false);
  const c1 = await A.s.call("POST", "/api/buyer/addresses", { ...A1(), buyerId: String(B.id) });
  check("B-02 a buyerId in the body is refused (400) and nothing is created", c1.status === 400 && c1.json.fields?.buyerId && (await addr.countDocuments({ buyerId: A.id })) === 0);
  const hq = await A.s.call("POST", "/api/buyer/addresses", A1({ isDefaultBilling: true }));
  check("B-03 a valid Business + Billing address is created (201): normalised phone, version 1, default billing set", hq.status === 201 && hq.json.data.address.purposes.join() === "BUSINESS,BILLING" && hq.json.data.address.phone.normalized === "+91 9876543210" && hq.json.data.address.version === 1 && hq.json.data.address.isDefaultBilling === true && hq.json.data.address.isDefaultDelivery === false, JSON.stringify(hq.json).slice(0, 300));
  await idxLater();
  const doc = await addr.findOne({ _id: new ObjectId(hq.json.data.address.id) });
  check("B-04 stored with the buyer from the session, timestamps set by the server, no company link, nothing about verification", String(doc.buyerId) === String(A.id) && doc.createdAt instanceof Date && !doc.companyId && !("verified" in doc) && doc.version === 1);
  check("B-05 the answer has no buyer id or other private field", !/buyerId|_id|companyId/.test(hq.text));
  const wh = await A.s.call("POST", "/api/buyer/addresses", DELIVERY({ isDefaultDelivery: true }));
  check("B-06 a delivery address is created with its own default delivery; the billing default is untouched", wh.status === 201 && wh.json.data.address.isDefaultDelivery === true && (await addr.findOne({ _id: new ObjectId(hq.json.data.address.id) })).isDefaultBilling === true);
  const bads = [["label", { label: "" }], ["purposes", { purposes: [] }], ["purposes", { purposes: ["NOPE"] }], ["contactPerson", { purposes: ["DELIVERY"], contactPerson: "" }], ["phone", { phone: { countryCode: "+91", number: "12" } }], ["addressLine1", { addressLine1: "" }], ["country", { country: "Atlantis" }], ["state", { state: "" }], ["city", { city: "" }], ["postalCode", { postalCode: "012345" }], ["isDefaultDelivery", { isDefaultDelivery: true }]];
  const bres = [];
  for (const [, over] of bads) bres.push(await A.s.call("POST", "/api/buyer/addresses", A1(over)));
  check("B-07 each invalid value is refused (400) on its own field: label, purposes, unknown purpose, missing contact for delivery, phone, line 1, country, state, city, Indian PIN, default delivery without the Delivery purpose", bres.every((r, i) => r.status === 400 && r.json.fields?.[bads[i][0]]), bres.map((r, i) => `${bads[i][0]}:${r.status}`).join(" "));
  const uk = await A.s.call("POST", "/api/buyer/addresses", A1({ label: "London Office", country: "United Kingdom", state: "England", city: "London", postalCode: "SW1A 1AA", purposes: ["BRANCH_OFFICE"], phone: { countryCode: "+44", number: "7911 123456" } }));
  check("B-08 a UK postal code is accepted for a UK address (the Indian PIN rule is not applied)", uk.status === 201 && uk.json.data.address.postalCode === "SW1A 1AA");
  const inj = await A.s.call("POST", "/api/buyer/addresses", A1({ label: { $ne: "" }, city: { $gt: "" } }));
  check("B-09 operator objects in text fields are refused (400), nothing stored", inj.status === 400 && inj.json.fields?.label && inj.json.fields?.city);
  const mass = await Promise.all(["companyId", "createdAt", "updatedAt", "deletedAt", "normalizedPhone", "role", "ownerUserId", "id"].map((k) => A.s.call("POST", "/api/buyer/addresses", A1({ [k]: "x" }))));
  check("B-10 server-only fields (company id, timestamps, deleted flag, normalised phone, role, owner, id) are refused (400)", mass.every((r) => r.status === 400));
  check("B-11 the audit trail records field names only (no address, name or phone)", await (async () => { const ev = await events.find({ userId: A.id, type: "ADDRESS_CREATED" }).toArray(); return ev.length >= 3 && ev.every((e) => Array.isArray(e.fields) && !/Tonk|Rahul|98765|Jaipur|302018/.test(JSON.stringify(e))); })());

  // ================= C: list, filter, search, statistics
  await A.s.call("POST", "/api/buyer/addresses", A1({ label: "Factory - VKI", purposes: ["DELIVERY", "FACTORY"], city: "Jaipur", postalCode: "302013", addressLine1: "C-55, VKI Industrial Area, Road No. 9", contactPerson: "Mohan Lal", companyName: "", phone: { countryCode: "+91", number: "98876 55443" } }));
  await A.s.call("POST", "/api/buyer/addresses", A1({ label: "Branch - Ajmer", purposes: ["BRANCH_OFFICE", "DELIVERY"], city: "Ajmer", postalCode: "305001", addressLine1: "Shop No. 4, Pushkar Road, Civil Lines", contactPerson: "Sunita Devi", companyName: "", phone: { countryCode: "+91", number: "98281 66779" } }));
  const all = (await A.s.call("GET", "/api/buyer/addresses")).json.data;
  check("C-01 five addresses are listed; statistics count unique records: total 5, business 1, billing 1, delivery 3 (a multi-purpose address is counted once in the total and under each purpose)", all.addresses.length === 5 && all.statistics.total === 5 && all.statistics.business === 1 && all.statistics.billing === 1 && all.statistics.delivery === 3 && all.statistics.hasDefaultBilling && all.statistics.hasDefaultDelivery, JSON.stringify(all.statistics));
  check("C-02 defaults come first, then the newest", all.addresses[0].isDefaultBilling || all.addresses[0].isDefaultDelivery);
  const f = async (q) => (await A.s.call("GET", `/api/buyer/addresses?${q}`)).json.data;
  const del = await f("type=delivery"), bil = await f("type=billing"), bus = await f("type=business");
  check("C-03 filters: delivery 3, billing 1, business 1; a multi-purpose address appears in each matching filter; statistics stay those of the whole book", del.addresses.length === 3 && bil.addresses.length === 1 && bus.addresses.length === 1 && del.statistics.total === 5 && bil.addresses[0].label === "Head Office" && del.addresses.every((a) => a.purposes.includes("DELIVERY")));
  const bySearch = Object.fromEntries(await Promise.all([["label", "factory"], ["city", "ajmer"], ["state", "england"], ["pin", "302013"], ["contact", "sunita"], ["company", "textiles"], ["upper", "JAIPUR"], ["none", "zzzzz"], ["regex", ".*"], ["special", "(["]].map(async ([k, q]) => [k, await f(`q=${encodeURIComponent(q)}`)])));
  check("C-04 search matches label, city, state, PIN, contact person and company, case-insensitively", bySearch.label.addresses.length === 1 && bySearch.city.addresses.length === 1 && bySearch.state.addresses.length === 1 && bySearch.pin.addresses.length === 1 && bySearch.contact.addresses.length === 1 && bySearch.company.addresses.length >= 1 && bySearch.upper.addresses.length === 3);
  check("C-05 no match gives an empty list (not an error); regex characters in the search text are taken literally (no injection, no crash)", bySearch.none.addresses.length === 0 && bySearch.regex.addresses.length === 0 && bySearch.special.addresses.length === 0);
  const combo = await f("type=delivery&q=jaipur");
  check("C-06 filter and search combine (delivery in Jaipur: 2)", combo.addresses.length === 2 && combo.meta.total === 2);
  const badQ = await Promise.all([A.s.call("GET", "/api/buyer/addresses?type=warehouse"), A.s.call("GET", `/api/buyer/addresses?q=${"x".repeat(61)}`), A.s.call("GET", "/api/buyer/addresses?limit=51"), A.s.call("GET", "/api/buyer/addresses?page=0")]);
  check("C-07 an unknown type, a search over 60 characters, limit 51 and page 0 are refused (400)", badQ.every((r) => r.status === 400));
  const paged = await f("limit=2&page=2");
  check("C-08 pagination: limit 2, page 2 returns the next 2 of 5 with meta (total 5, 3 pages)", paged.addresses.length === 2 && paged.meta.total === 5 && paged.meta.totalPages === 3 && paged.meta.page === 2);
  const spoof = (await A.s.call("GET", `/api/buyer/addresses?buyerId=${B.id}&userId=${B.id}`)).json.data;
  check("C-09 a buyerId in the query is ignored: still A's five", spoof.addresses.length === 5);
  const bList = (await B.s.call("GET", "/api/buyer/addresses")).json.data;
  check("C-10 buyer B sees none of A's addresses and zero statistics", bList.addresses.length === 0 && bList.statistics.total === 0);

  // ================= D: read one, update
  const one = await A.s.call("GET", `/api/buyer/addresses/${wh.json.data.address.id}`);
  check("D-01 the owner reads one address by id", one.status === 200 && one.json.data.address.label === "Warehouse - Sitapura");
  const idor = await B.s.call("GET", `/api/buyer/addresses/${wh.json.data.address.id}`);
  const bogus = await Promise.all(["not-an-id", "..%2F..%2Fx", new ObjectId().toString(), "000000000000000000000000"].map((id) => A.s.call("GET", `/api/buyer/addresses/${id}`)));
  check("D-02 another buyer, a malformed id and an unknown id all answer the same 404 and reveal nothing", idor.status === 404 && !idor.text.includes("Sitapura") && bogus.every((r) => r.status === 404 && !/Sitapura/.test(r.text ?? "")));
  const full = (over = {}) => A1({ label: "Warehouse - Sitapura", purposes: ["DELIVERY", "GOODS_RECEIVING"], addressLine1: "Plot No. 28, Industrial Area, Sitapura", landmark: "", postalCode: "302022", phone: { countryCode: "+91", number: "98290 11223" }, ...over });
  const upd = await A.s.call("PATCH", `/api/buyer/addresses/${wh.json.data.address.id}`, { ...full({ addressLine2: "Gate 3" }), version: 1 });
  check("D-03 an update by the owner is saved: line 2 added, version 2, the default delivery status kept (an unrelated edit does not remove it)", upd.status === 200 && upd.json.data.address.addressLine2 === "Gate 3" && upd.json.data.address.version === 2 && upd.json.data.address.isDefaultDelivery === true && upd.json.data.clearedDefaults.length === 0, JSON.stringify(upd.json).slice(0, 250));
  const stale = await A.s.call("PATCH", `/api/buyer/addresses/${wh.json.data.address.id}`, { ...full({ city: "Stale" }), version: 1 });
  check("D-04 a stale form (old version) is a 409 and changes nothing", stale.status === 409 && stale.json.code === "CONFLICT" && (await addr.findOne({ _id: new ObjectId(wh.json.data.address.id) })).city === "Jaipur");
  const cross = await B.s.call("PATCH", `/api/buyer/addresses/${wh.json.data.address.id}`, { ...full({ city: "Hijacked" }), version: 2 });
  check("D-05 buyer B cannot update A's address (404) and it is unchanged", cross.status === 404 && (await addr.findOne({ _id: new ObjectId(wh.json.data.address.id) })).city === "Jaipur");
  const race = await Promise.all([1, 2].map((n) => A.s.call("PATCH", `/api/buyer/addresses/${wh.json.data.address.id}`, { ...full({ landmark: `Race ${n}` }), version: 2 })));
  check("D-06 two simultaneous saves from the same version: one wins, the other is told (200 and 409)", race.map((r) => r.status).sort().join() === "200,409", race.map((r) => r.status).join());
  const cur = (await A.s.call("GET", `/api/buyer/addresses/${wh.json.data.address.id}`)).json.data.address;
  const dropped = await A.s.call("PATCH", `/api/buyer/addresses/${wh.json.data.address.id}`, { ...full({ purposes: ["GOODS_RECEIVING"] }), version: cur.version });
  check("D-07 removing the Delivery purpose from the default delivery address clears that default (nothing else is promoted) and says so", dropped.status === 200 && dropped.json.data.address.isDefaultDelivery === false && dropped.json.data.clearedDefaults.join() === "DELIVERY" && /no longer your default delivery/i.test(dropped.json.message) && (await addr.countDocuments({ buyerId: A.id, isDefaultDelivery: true })) === 0);
  const noPartial = await A.s.call("PATCH", `/api/buyer/addresses/${wh.json.data.address.id}`, { label: "Only label", version: 99 });
  check("D-08 a partial body is refused (the form always sends the full address) and nothing is half-saved", noPartial.status === 400);
  const evU = await events.find({ userId: A.id, type: "ADDRESS_UPDATED" }).toArray();
  check("D-09 updates are audited by field names only", evU.length >= 2 && evU.every((e) => !/Gate 3|Race|Hijack|Sitapura/.test(JSON.stringify(e))));

  // ================= E: defaults
  await db.collection("rate_limits").deleteMany({});
  const list0 = (await A.s.call("GET", "/api/buyer/addresses")).json.data.addresses;
  const byLabel = (l) => list0.find((a) => a.label === l);
  const sd = (id, type) => A.s.call("PATCH", `/api/buyer/addresses/${id}/default`, { type });
  const factory = byLabel("Factory - VKI"), ajmer = byLabel("Branch - Ajmer"), head = byLabel("Head Office");
  const d1 = await sd(factory.id, "DELIVERY");
  check("E-01 setting a default delivery address answers with the confirmed updated list; the factory is now the only default delivery", d1.status === 200 && d1.json.data.addresses.filter((a) => a.isDefaultDelivery).length === 1 && d1.json.data.addresses.find((a) => a.isDefaultDelivery).label === "Factory - VKI" && d1.json.data.statistics.hasDefaultDelivery === true);
  check("E-02 the billing default is untouched (independent defaults)", d1.json.data.addresses.find((a) => a.isDefaultBilling)?.label === "Head Office");
  const d2 = await sd(ajmer.id, "DELIVERY");
  check("E-03 replacing the delivery default clears the previous one in the same step: exactly one default delivery (in the database too)", d2.status === 200 && (await addr.countDocuments({ buyerId: A.id, isDefaultDelivery: true })) === 1 && (await addr.findOne({ buyerId: A.id, isDefaultDelivery: true })).label === "Branch - Ajmer");
  const both = await A.s.call("POST", "/api/buyer/addresses", A1({ label: "Billing And Delivery", purposes: ["BILLING", "DELIVERY"], isDefaultBilling: true, isDefaultDelivery: true, city: "Kota", postalCode: "324001" }));
  check("E-04 one address can be the default billing AND the default delivery address; creating it replaced both previous defaults", both.status === 201 && both.json.data.address.isDefaultBilling && both.json.data.address.isDefaultDelivery && (await addr.countDocuments({ buyerId: A.id, isDefaultBilling: true })) === 1 && (await addr.countDocuments({ buyerId: A.id, isDefaultDelivery: true })) === 1);
  const wrongType = await sd(head.id, "DELIVERY");
  check("E-05 an address without the Delivery purpose cannot become the default delivery address (409 PURPOSE_MISSING); nothing changes", wrongType.status === 409 && wrongType.json.code === "PURPOSE_MISSING" && (await addr.findOne({ _id: new ObjectId(head.id) })).isDefaultDelivery === false);
  const badType = await Promise.all([sd(head.id, "SHIPPING"), A.s.call("PATCH", `/api/buyer/addresses/${head.id}/default`, {}), sd("not-an-id", "BILLING"), sd(new ObjectId().toString(), "BILLING")]);
  check("E-06 an unknown type, a missing type, a bad id and an unknown id are refused (400/404)", badType[0].status === 400 && badType[1].status === 400 && badType[2].status === 404 && badType[3].status === 404);
  const otherDefault = await B.s.call("PATCH", `/api/buyer/addresses/${head.id}/default`, { type: "BILLING" });
  check("E-07 buyer B cannot set a default on A's address (404); A's defaults are unchanged", otherDefault.status === 404 && (await addr.countDocuments({ buyerId: A.id, isDefaultBilling: true })) === 1);
  const racers = [byLabel("Factory - VKI"), byLabel("Branch - Ajmer"), both.json.data.address, byLabel("Factory - VKI"), byLabel("Branch - Ajmer")];
  await db.collection("rate_limits").deleteMany({});
  const raced = await Promise.all(racers.map((a) => sd(a.id, "DELIVERY")));
  const finalDefaults = await addr.countDocuments({ buyerId: A.id, isDefaultDelivery: true });
  check("E-08 five simultaneous 'set default delivery' requests for different addresses: no server error, and afterwards there is exactly one default delivery address (never two)", raced.every((r) => [200, 409].includes(r.status)) && finalDefaults === 1, `${raced.map((r) => r.status).join()} defaults=${finalDefaults}`);
  const raced2 = await Promise.all([1, 2, 3, 4].map(() => A.s.call("POST", "/api/buyer/addresses", A1({ label: `Racing ${Math.random()}`, purposes: ["BILLING"], isDefaultBilling: true, contactPerson: "", phone: { countryCode: "+91", number: "" } }))));
  check("E-09 four simultaneous creations that each ask to be the default billing address: no server error and exactly one default billing address remains", raced2.every((r) => [201, 409].includes(r.status)) && (await addr.countDocuments({ buyerId: A.id, isDefaultBilling: true })) === 1, `${raced2.map((r) => r.status).join()}`);
  const evD = await events.find({ userId: A.id, type: { $in: ["ADDRESS_DEFAULT_BILLING", "ADDRESS_DEFAULT_DELIVERY"] } }).toArray();
  check("E-10 default changes are audited", evD.length >= 2);

  // ================= F: delete
  await db.collection("rate_limits").deleteMany({});
  await inquiries.insertOne({ reference: "FBM-INQ-ZZZZ0001", buyerId: A.id, buyerType: "REGISTERED", supplierKey: "SLR0001", supplierName: "Seed", source: "catalog", quantity: 5, status: "NEW", deliveryLocation: { text: "Kota, Rajasthan 324001" }, createdAt: new Date() });
  const bd = both.json.data.address;
  const delOther = await B.s.call("DELETE", `/api/buyer/addresses/${bd.id}`);
  check("F-01 buyer B cannot delete A's address (404); it is still there", delOther.status === 404 && !!(await addr.findOne({ _id: new ObjectId(bd.id) })));
  const curDefaults = await addr.find({ buyerId: A.id, $or: [{ isDefaultBilling: true }, { isDefaultDelivery: true }] }).toArray();
  const target = curDefaults[0];
  const dd = await A.s.call("DELETE", `/api/buyer/addresses/${target._id}`);
  const clearedKinds = dd.json.data.clearedDefaults;
  const stillOther = await addr.countDocuments({ buyerId: A.id });
  check("F-02 deleting a default address removes it, names which default(s) are now empty, and promotes nothing else", dd.status === 200 && clearedKinds.length >= 1 && (await addr.countDocuments({ buyerId: A.id, isDefaultBilling: true })) === (target.isDefaultBilling ? 0 : 1) && (await addr.countDocuments({ buyerId: A.id, isDefaultDelivery: true })) === (target.isDefaultDelivery ? 0 : 1) && stillOther >= 3, JSON.stringify(dd.json));
  check("F-03 the deleted address is gone (404 on read) and cannot be listed", (await A.s.call("GET", `/api/buyer/addresses/${target._id}`)).status === 404 && !(await A.s.call("GET", "/api/buyer/addresses")).text.includes(target.label + "\""));
  check("F-04 deleting an address does not touch an inquiry that was sent with a location (it keeps its own text)", (await inquiries.findOne({ reference: "FBM-INQ-ZZZZ0001" })).deliveryLocation.text === "Kota, Rajasthan 324001");
  check("F-05 deleting an unknown or malformed id is a 404", (await A.s.call("DELETE", `/api/buyer/addresses/${new ObjectId()}`)).status === 404 && (await A.s.call("DELETE", "/api/buyer/addresses/xyz")).status === 404);
  const evDel = await events.find({ userId: A.id, type: "ADDRESS_DELETED" }).toArray();
  check("F-06 the deletion is audited without any address content", evDel.length === 1 && !/Kota|Jaipur|Tonk/.test(JSON.stringify(evDel[0])));
  await inquiries.deleteOne({ reference: "FBM-INQ-ZZZZ0001" });

  // ================= G: company link, cap, rate limit
  const noCo = await A.s.call("POST", "/api/buyer/addresses", A1({ label: "Company address", forCompany: true }));
  check("G-01 linking an address to 'my company' without a company is refused (409 NO_COMPANY)", noCo.status === 409 && noCo.json.code === "NO_COMPANY");
  await A.s.call("POST", "/api/buyer/company", { legalName: "Alpha Fabrics Pvt Ltd", businessType: "Private Limited", country: "India" });
  const withCo = await A.s.call("POST", "/api/buyer/addresses", A1({ label: "Company address", forCompany: true }));
  const coDoc = await db.collection("companies").findOne({ ownerUserId: A.id });
  check("G-02 with a company, the link is made to the buyer's OWN company (derived on the server); the answer says 'linked' without exposing its id", withCo.status === 201 && withCo.json.data.address.forCompany === true && String((await addr.findOne({ _id: new ObjectId(withCo.json.data.address.id) })).companyId) === String(coDoc._id) && !/companyId/.test(withCo.text));
  const bCo = await B.s.call("POST", "/api/buyer/addresses", A1({ label: "Not my company", forCompany: true, companyId: String(coDoc._id) }));
  check("G-03 buyer B cannot attach an address to A's company: the id is refused (400) and a link without their own company is refused", bCo.status === 400 && bCo.json.fields?.companyId && (await B.s.call("POST", "/api/buyer/addresses", A1({ label: "No company", forCompany: true }))).status === 409, `${bCo.status} ${String(bCo.text).slice(0, 200)}`);
  await db.collection("rate_limits").deleteMany({});
  const capUser = await register("cap");
  await addr.insertMany(Array.from({ length: 50 }, (_, i) => ({ buyerId: capUser.id, label: `Seed ${i}`, purposes: ["BUSINESS"], addressLine1: "Seed road", country: "India", state: "Rajasthan", city: "Jaipur", postalCode: "302001", isDefaultBilling: false, isDefaultDelivery: false, version: 1, createdAt: new Date(), updatedAt: new Date() })));
  const over = await capUser.s.call("POST", "/api/buyer/addresses", A1({ label: "Number 51" }));
  check("G-04 the 51st address is refused (409 LIMIT) and the book keeps exactly 50", over.status === 409 && over.json.code === "LIMIT" && (await addr.countDocuments({ buyerId: capUser.id })) === 50);
  await db.collection("rate_limits").deleteMany({});
  const burst = [];
  for (let i = 0; i < 63; i++) burst.push((await B.s.call("POST", "/api/buyer/addresses", {})).status);
  check("G-05 address writes are limited (60 per 10 minutes per buyer): the 61st request gets 429", burst.slice(0, 60).every((s) => s === 400) && burst.slice(60).every((s) => s === 429), burst.slice(58).join());
  await db.collection("rate_limits").deleteMany({});

  // ================= H: browser
  const NEW = await register("ui");
  const empt = await open("/buyer/addresses", { session: NEW.s });
  const et = await content(empt);
  check("H-01 an empty address book: 'You have no saved addresses yet.', why saved addresses help, Add New Address; zero statistics; no sample addresses", /You have no saved addresses yet/.test(et) && /without typing them again/.test(et) && /Add New Address/.test(et) && /Total Addresses\s*0/.test(et) && empt.errs.length === 0, empt.errs.join("|"));
  const sideActive = await empt.evaluate(() => document.querySelector("nav[aria-label='Buyer navigation'] a[aria-current='page']")?.textContent.trim());
  check("H-02 'Address Book' is a real link and the current sidebar item", /Address Book/.test(sideActive ?? ""));
  await clickText(empt, "button", "Add New Address");
  await sleep(500);
  const dlg = await empt.evaluate(() => { const d = document.querySelector("[role=dialog]"); return { ok: !!d, modal: d?.getAttribute("aria-modal"), labelled: !!d?.getAttribute("aria-labelledby"), focusIn: d?.contains(document.activeElement) }; });
  check("H-03 Add New Address opens an accessible dialog (modal, labelled) with focus inside", dlg.ok && dlg.modal === "true" && dlg.labelled && dlg.focusIn, JSON.stringify(dlg));
  await clickText(empt, "[role=dialog] button", "Save Address");
  await sleep(500);
  const errCount = await empt.evaluate(() => document.querySelectorAll("[role=dialog] [role=alert]").length);
  check("H-04 saving an empty form shows errors for label, purposes, line 1, state, city and PIN, moves focus to the first invalid field, and creates nothing", errCount >= 5 && (await empt.evaluate(() => document.activeElement?.getAttribute("aria-invalid"))) === "true" && (await addr.countDocuments({ buyerId: NEW.id })) === 0, String(errCount));
  await fill(empt, "Address Label", "Head Office");
  await toggleCheck(empt, "Business");
  await toggleCheck(empt, "Billing");
  await toggleCheck(empt, "Delivery");
  await fill(empt, "Contact Person", "Rahul Kumawat");
  await setValue(empt, (await dlgField(empt, "Contact Phone")), "98765 43210");
  await fill(empt, "Address Line 1", "A-102, Mahaveer Trade Center, Tonk Road");
  await fill(empt, "State / Province", "Rajasthan");
  await fill(empt, "City", "Jaipur");
  await fill(empt, "PIN Code", "01234");
  await clickText(empt, "[role=dialog] button", "Save Address");
  await sleep(400);
  check("H-05 a wrong Indian PIN is refused on its field with the rule stated", /six digits/.test(await empt.evaluate(() => document.querySelector("[role=dialog]").textContent)));
  await fill(empt, "PIN Code", "302018");
  await toggleCheck(empt, "Set as Default Billing");
  await toggleCheck(empt, "Set as Default Delivery");
  await clickText(empt, "[role=dialog] button", "Save Address");
  await sleep(2500);
  const created = await addr.findOne({ buyerId: NEW.id });
  const body1 = await content(empt);
  check("H-06 a valid address is saved from the browser: in the database for this buyer, the dialog closes, the card shows with Default Billing and Default Delivery text tags and its purposes, the statistics update", !!created && created.isDefaultBilling && created.isDefaultDelivery && !(await empt.evaluate(() => !!document.querySelector("[role=dialog]"))) && /Head Office/.test(body1) && /Default Billing/.test(body1) && /Default Delivery/.test(body1) && /Total Addresses\s*1/.test(body1) && /Default Billing\s*Set/.test(body1) && /Business/.test(body1), body1.slice(0, 200));
  check("H-07 focus returns to the button that opened the dialog", await empt.evaluate(() => /Add New Address/.test(document.activeElement?.textContent ?? "")));
  // second address
  await clickText(empt, "button", "Add New Address");
  await sleep(400);
  await fill(empt, "Address Label", "Warehouse Sitapura");
  await toggleCheck(empt, "Delivery");
  await toggleCheck(empt, "Warehouse");
  await fill(empt, "Contact Person", "Mohan Lal");
  await setValue(empt, (await dlgField(empt, "Contact Phone")), "98290 11223");
  await fill(empt, "Address Line 1", "Plot No. 28, Industrial Area, Sitapura");
  await fill(empt, "State / Province", "Rajasthan");
  await fill(empt, "City", "Jaipur");
  await fill(empt, "PIN Code", "302022");
  await clickText(empt, "[role=dialog] button", "Save Address");
  await sleep(2500);
  check("H-08 a second address is added; statistics now: total 2, delivery 2", /Total Addresses\s*2/.test(await content(empt)) && (await empt.evaluate(() => [...document.querySelectorAll("[aria-label='Filter addresses by purpose'] button")].map((b) => b.textContent.trim()).join("|"))) === "All Addresses (2)|Delivery (2)|Billing (1)|Business (1)");
  await clickText(empt, "button", "Set as Default Delivery");
  await sleep(2200);
  const defs = await addr.find({ buyerId: NEW.id }).toArray();
  check("H-09 'Set as Default Delivery' on the warehouse updates the database (the first address loses it, keeps billing) and the page shows it only afterwards", defs.find((d) => d.label === "Warehouse Sitapura").isDefaultDelivery === true && defs.find((d) => d.label === "Head Office").isDefaultDelivery === false && defs.find((d) => d.label === "Head Office").isDefaultBilling === true && /Set\./.test(await content(empt)) || /Default delivery address updated/.test(await content(empt)));
  // filters and search
  await empt.evaluate(() => [...document.querySelectorAll("[aria-label='Filter addresses by purpose'] button")].find((b) => /^Billing/.test(b.textContent.trim())).click());
  await sleep(1500);
  const billingOnly = await empt.evaluate(() => document.querySelectorAll("#buyer-content ul > li h3").length);
  check("H-10 the Billing filter shows only the billing address, is pressed (aria-pressed), and puts type=billing in the address", billingOnly === 1 && (await empt.evaluate(() => [...document.querySelectorAll("[aria-label='Filter addresses by purpose'] button")].find((b) => /^Billing/.test(b.textContent.trim())).getAttribute("aria-pressed"))) === "true" && new URL(empt.url()).searchParams.get("type") === "billing");
  await empt.evaluate(() => [...document.querySelectorAll("[aria-label='Filter addresses by purpose'] button")].find((b) => /^All/.test(b.textContent.trim())).click());
  await sleep(1000);
  await empt.type("#address-search", "sitapura");
  await sleep(1800);
  check("H-11 search is debounced and filters on the server: typing 'sitapura' leaves one card and puts q=sitapura in the address; Clear search restores both", (await empt.evaluate(() => document.querySelectorAll("#buyer-content ul > li h3").length)) === 1 && new URL(empt.url()).searchParams.get("q") === "sitapura");
  await empt.type("#address-search", "zzzz");
  await sleep(1800);
  check("H-12 no match shows the no-match message and a way to clear the filters", /No address matches/.test(await content(empt)) && /Clear filters/.test(await content(empt)));
  await clickText(empt, "button", "Clear filters");
  await sleep(1500);
  check("H-13 clearing restores the full list (2 cards) and a clean address", (await empt.evaluate(() => document.querySelectorAll("#buyer-content ul > li h3").length)) === 2 && new URL(empt.url()).search === "");
  // edit
  await empt.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Edit/.test(b.textContent.trim()) && /Warehouse/.test(b.textContent)).click());
  await sleep(500);
  check("H-14 Edit opens the same dialog filled with the saved values (label, city, PIN, purposes)", (await empt.evaluate(() => document.querySelector("#" + CSS.escape([...document.querySelectorAll("[role=dialog] label")].find((l) => l.textContent.trim().startsWith("Address Label")).htmlFor)).value)) === "Warehouse Sitapura" && (await empt.evaluate(() => [...document.querySelectorAll("[role=dialog] input[type=checkbox]:checked")].length)) >= 2);
  await fill(empt, "Landmark", "Behind the water tank");
  await empt.keyboard.press("Escape");
  await sleep(500);
  const discardAsk = await empt.evaluate(() => document.querySelector("[role=alertdialog]")?.textContent ?? "");
  check("H-15 pressing Escape with unsaved changes asks before closing (the site's own dialog), and the address form stays open when the buyer chooses Keep editing", /unsaved changes/i.test(discardAsk) && /Keep editing/.test(discardAsk) && (await empt.evaluate(() => !!document.querySelector("[role=dialog]"))), discardAsk);
  await empt.evaluate(() => [...document.querySelectorAll("[role=alertdialog] button")].find((b) => /Keep editing/.test(b.textContent)).click());
  await sleep(300);
  await clickText(empt, "[role=dialog] button", "Save Changes");
  await sleep(2500);
  check("H-16 Save Changes persists the edit (version 2 in the database) and the card shows it", (await addr.findOne({ buyerId: NEW.id, label: "Warehouse Sitapura" })).landmark === "Behind the water tank" && (await addr.findOne({ buyerId: NEW.id, label: "Warehouse Sitapura" })).version >= 2 && /Behind the water tank/.test(await content(empt)));
  // delete
  await empt.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Delete/.test(b.textContent.trim()) && /Warehouse/.test(b.textContent)).click());
  await sleep(400);
  check("H-17 Delete asks for confirmation in an alert dialog and explains that sent inquiries keep their location", await empt.evaluate(() => { const d = document.querySelector("[role=alertdialog]"); return !!d && /Inquiries you already sent keep/.test(d.textContent); }));
  await empt.keyboard.press("Escape");
  await sleep(300);
  check("H-18 Escape cancels: the address is still in the database", (await addr.countDocuments({ buyerId: NEW.id })) === 2);
  await empt.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Delete/.test(b.textContent.trim()) && /Warehouse/.test(b.textContent)).click());
  await sleep(300);
  await empt.evaluate(() => [...document.querySelectorAll("[role=alertdialog] button")].find((b) => /^Delete$/.test(b.textContent.trim())).click());
  await sleep(2500);
  check("H-19 confirming deletes it: gone from the database and the page, statistics updated, the default-delivery loss is explained", (await addr.countDocuments({ buyerId: NEW.id })) === 1 && /Total Addresses\s*1/.test(await content(empt)) && /no default delivery|You no longer have a default delivery/i.test(await content(empt)) && empt.errs.length === 0, empt.errs.join("|"));
  await empt.context.close();
  // URL state
  const restore = await open("/buyer/addresses?type=business&q=jaipur", { session: NEW.s });
  check("H-20 opening the address with ?type=business&q=jaipur restores the filter and the search box, and lists the matching address", (await restore.evaluate(() => document.querySelector("#address-search").value)) === "jaipur" && (await restore.evaluate(() => [...document.querySelectorAll("[aria-label='Filter addresses by purpose'] button")].find((b) => /^Business/.test(b.textContent.trim())).getAttribute("aria-pressed"))) === "true" && (await restore.evaluate(() => document.querySelectorAll("#buyer-content ul > li h3").length)) === 1);
  await restore.context.close();
  const bad = await open("/buyer/addresses?type=bogus&q=" + "x".repeat(80), { session: NEW.s });
  check("H-21 an invalid type or over-long search in the address falls back to the full list (no error page)", bad.status === 200 && /Total Addresses/.test(await content(bad)));
  await bad.context.close();

  // ================= I: inquiry form integration
  const inqPage = await open("/inquiry/shree-textiles", { session: NEW.s });
  const sel = await inqPage.evaluate(() => { const s = document.querySelector("select[aria-label='Use one of my saved delivery addresses']"); return s ? [...s.options].map((o) => o.textContent) : null; });
  check("I-01 on the inquiry form a signed-in buyer with a delivery address gets a chooser of their own saved delivery addresses (and no one else's)", Array.isArray(sel) && sel.length >= 1 && !sel.join().includes("Tonk"), JSON.stringify(sel));
  await addr.updateOne({ buyerId: NEW.id }, { $set: { purposes: ["BUSINESS", "BILLING", "DELIVERY"] } });
  await inqPage.reload({ waitUntil: "networkidle2" });
  const sel2 = await inqPage.evaluate(() => { const s = document.querySelector("select[aria-label='Use one of my saved delivery addresses']"); return s ? [...s.options].map((o) => ({ v: o.value, t: o.textContent })) : null; });
  if (sel2 && sel2.length > 1) {
    await inqPage.select("select[aria-label='Use one of my saved delivery addresses']", sel2[1].v);
    await sleep(500);
  }
  const locVal = await inqPage.evaluate(() => document.querySelector("input[placeholder*='city, state or PIN']")?.value);
  check("I-02 choosing a saved address fills the location field with 'City, State PIN' (the inquiry keeps only that text, not a link to the address)", locVal === "Jaipur, Rajasthan 302018", String(locVal));
  await inqPage.context.close();
  const guest = await open("/inquiry/shree-textiles");
  check("I-03 a guest sees no address chooser", (await guest.evaluate(() => document.querySelectorAll("select[aria-label*='saved']").length)) === 0);
  await guest.context.close();

  // ================= J: responsive
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const dataUser = await register("shots");
  for (const a of [A1({ isDefaultBilling: true }), DELIVERY({ isDefaultDelivery: true }), DELIVERY({ label: "Factory - VKI", landmark: "A very long landmark text that should wrap properly on narrow screens without overflow", addressLine1: "C-55, VKI Industrial Area, Road No. 9, Opposite the Extremely Long Named Industrial Estate Gate" }), A1({ label: "Branch - Ajmer", purposes: ["BRANCH_OFFICE"], city: "Ajmer", postalCode: "305001" })]) await dataUser.s.call("POST", "/api/buyer/addresses", a);
  const wide = [];
  for (const w of widths) {
    const p = await open("/buyer/addresses", { session: dataUser.s, width: w });
    const o = await overflow(p);
    const inside = await p.evaluate(() => [...document.querySelectorAll("#buyer-content button, #buyer-content input, #buyer-content select")].every((el) => { let box = el; for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const ox = getComputedStyle(n).overflowX; if (ox === "auto" || ox === "scroll") { box = n; break; } } const r = box.getBoundingClientRect(); return r.width === 0 || (r.left >= -1 && r.right <= window.innerWidth + 1); }));
    const overlap = await p.evaluate(() => [...document.querySelectorAll("#buyer-content ul > li")].some((li) => { const btns = [...li.querySelectorAll("button")].map((b) => b.getBoundingClientRect()); return btns.some((r, i) => btns.some((q, k) => k > i && r.width > 0 && q.width > 0 && r.left < q.right - 1 && q.left < r.right - 1 && r.top < q.bottom - 1 && q.top < r.bottom - 1)); }));
    if (o > 0 || !inside || overlap) wide.push(`${w}: overflow ${o} inside ${inside} overlap ${overlap}`);
    if ([1440, 820, 390].includes(w)) await p.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/24-buyer-addresses-${w === 1440 ? "desktop-1440" : w === 820 ? "tablet-820" : "mobile-390"}.png`, fullPage: true });
    await p.context.close();
  }
  check("J-01 no horizontal overflow, control outside the viewport or overlapping card buttons at 16 widths (320 to 2560); long lines wrap", wide.length === 0, wide.join("; "));
  const dl = await open("/buyer/addresses", { session: dataUser.s, width: 320 });
  await clickText(dl, "button", "Add New Address");
  await sleep(500);
  check("J-02 the dialog fits a 320px phone (no sideways scroll) and its fields are single-column", (await overflow(dl)) <= 0 && (await dl.evaluate(() => { const d = document.querySelector("[role=dialog]").getBoundingClientRect(); return d.right <= window.innerWidth + 1 && d.left >= -1; })));
  const small = await dl.evaluate(() => [...document.querySelectorAll("#buyer-content button, [role=dialog] button")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 32; }).length);
  check("J-03 touch targets: no button under 32px tall at 320px", small === 0, String(small));
  await dl.context.close();

  // ================= K: performance
  const perfUser = await register("perf");
  const med = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const report = [];
  let have = 0;
  for (const size of [5, 20, 50]) {
    const batch = [];
    for (let i = have; i < size; i++) batch.push({ buyerId: perfUser.id, label: `Perf ${i}`, purposes: i % 3 === 0 ? ["BUSINESS", "BILLING"] : ["DELIVERY"], contactPerson: "Perf Person", phone: { countryCode: "+91", number: "9876543210", normalized: "+91 9876543210" }, addressLine1: "Perf road number " + i, country: "India", state: "Rajasthan", city: ["Jaipur", "Ajmer", "Kota"][i % 3], postalCode: "302001", isDefaultBilling: false, isDefaultDelivery: false, version: 1, createdAt: new Date(Date.now() - i * 1000), updatedAt: new Date() });
    if (batch.length) await addr.insertMany(batch);
    have = size;
    await db.collection("rate_limits").deleteMany({});
    const lat = [], bytes = [];
    for (let i = 0; i < 30; i++) { const t = performance.now(); const r = await perfUser.s.call("GET", "/api/buyer/addresses", undefined, { "x-forwarded-for": nextIp() }); lat.push(performance.now() - t); bytes.push(r.text.length); }
    const one = (await addr.findOne({ buyerId: perfUser.id, label: "Perf 0" }))._id.toString();
    const lat1 = []; for (let i = 0; i < 30; i++) { const t = performance.now(); await perfUser.s.call("GET", `/api/buyer/addresses/${one}`, undefined, { "x-forwarded-for": nextIp() }); lat1.push(performance.now() - t); }
    const latS = []; for (let i = 0; i < 30; i++) { const t = performance.now(); await perfUser.s.call("GET", "/api/buyer/addresses?q=jaipur&type=delivery", undefined, { "x-forwarded-for": nextIp() }); latS.push(performance.now() - t); }
    report.push({ size, list: [med(lat, 0.5), med(lat, 0.95), med(lat, 0.99)], bytes: bytes[0], detail: [med(lat1, 0.5), med(lat1, 0.95)], search: [med(latS, 0.5), med(latS, 0.95)] });
  }
  await db.collection("rate_limits").deleteMany({});
  const w = { create: [], update: [], def: [] };
  const perfTarget = (await addr.findOne({ buyerId: perfUser.id, purposes: "BILLING" }));
  let version = perfTarget.version;
  const tid = perfTarget._id.toString();
  for (let i = 0; i < 15; i++) { await db.collection("rate_limits").deleteMany({}); const t0 = performance.now(); const r = await perfUser.s.call("PATCH", `/api/buyer/addresses/${tid}`, { ...A1({ label: "Perf 0", purposes: ["BUSINESS", "BILLING"], landmark: `v${i}` }), version }, { "x-forwarded-for": nextIp() }); w.update.push(performance.now() - t0); version = r.json?.data?.address?.version ?? version; }
  for (let i = 0; i < 15; i++) { await db.collection("rate_limits").deleteMany({}); const t0 = performance.now(); await perfUser.s.call("PATCH", `/api/buyer/addresses/${tid}/default`, { type: "BILLING" }, { "x-forwarded-for": nextIp() }); w.def.push(performance.now() - t0); }
  for (let i = 0; i < 10; i++) { await db.collection("rate_limits").deleteMany({}); await addr.deleteMany({ buyerId: perfUser.id, label: "Perf Create" }); const t0 = performance.now(); await perfUser.s.call("POST", "/api/buyer/addresses", A1({ label: "Perf Create", purposes: ["BUSINESS"], contactPerson: "", phone: { countryCode: "+91", number: "" } }), { "x-forwarded-for": nextIp() }); w.create.push(performance.now() - t0); }
  await addr.deleteMany({ buyerId: perfUser.id, label: "Perf Create" });
  for (const r of report) console.log(`  PERF ${String(r.size).padStart(3)} addresses: list p50 ${r.list[0].toFixed(0)} p95 ${r.list[1].toFixed(0)} p99 ${r.list[2].toFixed(0)} ms (${r.bytes} B); detail p95 ${r.detail[1].toFixed(0)} ms; search p95 ${r.search[1].toFixed(0)} ms`);
  console.log(`  PERF writes: create p50 ${med(w.create, 0.5).toFixed(0)} p95 ${med(w.create, 0.95).toFixed(0)}; update p50 ${med(w.update, 0.5).toFixed(0)} p95 ${med(w.update, 0.95).toFixed(0)}; set default p50 ${med(w.def, 0.5).toFixed(0)} p95 ${med(w.def, 0.95).toFixed(0)} ms`);
  check("K-01 against the targets (list 300 ms, detail 250, every write 500 as CLAUDE.md requires; p95) at 5, 20 and 50 addresses", report.every((r) => r.list[1] < 300 && r.detail[1] < 250) && med(w.create, 0.95) < 500 && med(w.update, 0.95) < 500 && med(w.def, 0.95) < 500, `list p95 ${report.map((r) => r.list[1].toFixed(0)).join("/")}, create ${med(w.create, 0.95).toFixed(0)}, update ${med(w.update, 0.95).toFixed(0)}, default ${med(w.def, 0.95).toFixed(0)}`);
  check("K-02 the list payload is bounded (50 addresses under 40 KB) and has no buyer id", report.at(-1).bytes < 40_000);
}

async function cleanup() {
  if (process.env.KEEP === "1") return;
  const mine = await users.find({ email: { $regex: `^t24-${stamp}-` } }, { projection: { _id: 1 } }).toArray();
  const ids = mine.map((u) => u._id);
  await addr.deleteMany({ buyerId: { $in: ids } });
  await db.collection("companies").deleteMany({ ownerUserId: { $in: ids } });
  await events.deleteMany({ userId: { $in: ids } });
  await inquiries.deleteMany({ buyerId: { $in: ids } });
  await users.deleteMany({ _id: { $in: ids } });
  await db.collection("rate_limits").deleteMany({});
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
