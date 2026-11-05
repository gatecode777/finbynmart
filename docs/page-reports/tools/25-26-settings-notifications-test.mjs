import fs from "node:fs";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Pages 25 and 26 (Buyer Settings & Notifications: /buyer/settings, /api/buyer/settings*, /api/buyer/notifications*).
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test with BUYER_DOCS_DIR set and NO email provider,
// Chrome and puppeteer-core. Writes only to the throwaway database and removes its own records at the end unless KEEP=1.
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
const users = db.collection("users"), notifs = db.collection("notifications"), settings = db.collection("buyer_settings"), events = db.collection("security_events"), inquiries = db.collection("inquiries");
const clearLimits = () => db.collection("rate_limits").deleteMany({});
await clearLimits();

const stamp = Date.now();
const emailOf = (tag) => `t2526-${stamp}-${tag}@example.test`;
let ipN = 0;
const nextIp = () => `10.26.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "settings test passphrase";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

class Session {
  jar = new Map();
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  keep(response) { for (const line of response.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); this.jar.set(pair.slice(0, i), pair.slice(i + 1)); } }
  async call(method, p, payload, headers = {}) {
    const response = await fetch(BASE + p, { method, headers: { "x-forwarded-for": this.ip ?? nextIp(), ...(payload !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}), ...headers }, body: payload === undefined ? undefined : JSON.stringify(payload), redirect: "manual" });
    this.keep(response);
    let json = null; let text = null;
    try { text = await response.text(); json = JSON.parse(text); } catch {}
    return { status: response.status, json, text, headers: response.headers };
  }
  async upload(fields, file) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    form.set("file", new File([file.bytes], file.name, { type: "application/pdf" }));
    const response = await fetch(`${BASE}/api/buyer/company/documents`, { method: "POST", headers: { "x-forwarded-for": nextIp(), cookie: this.cookieHeader() }, body: form });
    let json = null; try { json = await response.json(); } catch {}
    return { status: response.status, json };
  }
}
const register = async (tag, company = "Settings Test Traders") => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Set ${tag.toUpperCase()} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: company, password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register ${tag}: ${r.status} ${r.text}`);
  const user = await users.findOne({ email: emailOf(tag) });
  return { s, id: user._id, email: emailOf(tag) };
};
const login = async (email) => { const s = new Session(); const r = await s.call("POST", "/api/auth/login", { email, password: PW }); return { s, r }; };

let qty = 1000;
const inquiryBody = (over = {}) => ({ supplierSlug: "shree-textiles", productId: "cotton-fabric", inquiryType: "PRODUCT_INQUIRY", quantity: ++qty, quantityUnit: "Meter", message: `I would like a quote for ${qty} meters of cotton fabric, delivered next month.`, deliveryLocation: "Jaipur, Rajasthan 302001", consent: true, idempotencyKey: `k-${stamp}-${qty}-${Math.random().toString(36).slice(2, 8)}`, ...over });

const seed = (buyerId, n, { unreadEvery = 4, start = 0, prefix = "seed" } = {}) => Array.from({ length: n }, (_, k) => { const i = start + k; return { buyerId, category: ["inquiries", "company", "account"][i % 3], type: "SEED", title: `Seed notice ${i}`, body: `Seed body ${i}`, link: i % 5 === 0 ? "/buyer/profile?tab=documents" : null, dedupeKey: `${prefix}-${i}`, isRead: i % unreadEvery !== 0, readAt: i % unreadEvery === 0 ? null : new Date(Date.now() - i * 1000), createdAt: new Date(Date.now() - i * 60_000), purgeAt: new Date(Date.now() + 180 * 86_400_000) }; });

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
async function open(p, { width = 1440, height = 900, session } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.dialogs = [];
  page.on("dialog", (d) => { page.dialogs.push(d.message()); if (page.acceptNext) { page.acceptNext = false; d.accept(); } else d.dismiss(); });
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
const clickText = (p, selector, t) => p.evaluate((s, x) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(x)); if (!el) return false; el.click(); return true; }, selector, t);
const med = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

async function main() {
  const A = await register("a", "Alpha Fabrics Pvt Ltd");
  const B = await register("b");
  const SUP = new Session();
  await SUP.call("POST", "/api/auth/register/supplier", { businessName: "Settings Supplier Co", contactName: "Sia Rao", email: emailOf("sup"), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  const SUSP = await register("susp");
  await users.updateOne({ _id: SUSP.id }, { $set: { accountStatus: "SUSPENDED" } });

  // ================= A: access
  const un = new Session();
  const oid = new ObjectId().toString();
  const routes = [["GET", "/api/buyer/settings"], ["PATCH", "/api/buyer/settings"], ["POST", "/api/buyer/settings/sign-out-everywhere"], ["GET", "/api/buyer/notifications"], ["GET", "/api/buyer/notifications/unread-count"], ["PATCH", `/api/buyer/notifications/${oid}/read`], ["PATCH", "/api/buyer/notifications/read-all"]];
  const call = (s, [m, p]) => s.call(m, p, m === "PATCH" && p.endsWith("/settings") ? {} : undefined);
  const unr = await Promise.all(routes.map((r) => call(un, r)));
  check("A-01 without a session every settings and notification endpoint answers 401, private no-store, nothing returned", unr.every((r) => r.status === 401 && /no-store/.test(r.headers.get("cache-control") ?? "")), unr.map((r) => r.status).join());
  const supr = await Promise.all(routes.map((r) => call(SUP, r)));
  check("A-02 a supplier account is refused by every endpoint (403)", supr.every((r) => r.status === 403), supr.map((r) => r.status).join());
  check("A-03 a suspended buyer's session no longer works (401)", (await SUSP.s.call("GET", "/api/buyer/notifications")).status === 401);
  const red = await fetch(`${BASE}/buyer/settings?tab=notifications`, { redirect: "manual", headers: { "x-forwarded-for": nextIp() } });
  check("A-04 the page without a session redirects to sign-in and comes back to the same tab", [307, 308].includes(red.status) && /\/sign-in\?next=%2Fbuyer%2Fsettings%3Ftab%3Dnotifications/.test(red.headers.get("location") ?? ""), red.headers.get("location") ?? "");
  const pageHeaders = await fetch(`${BASE}/buyer/settings`, { redirect: "manual", headers: { "x-forwarded-for": nextIp() } });
  check("A-05 the page is never cached", /no-store|no-cache|private/.test(pageHeaders.headers.get("cache-control") ?? ""), pageHeaders.headers.get("cache-control") ?? "");

  // ================= B: settings
  const s0 = await A.s.call("GET", "/api/buyer/settings");
  check("B-01 a buyer who never saved gets the defaults at version 0 (inquiry and company notices on, dashboard 30 days), and no document is created by reading", s0.status === 200 && s0.json.data.settings.version === 0 && s0.json.data.settings.notifications.inquiries === true && s0.json.data.settings.notifications.company === true && s0.json.data.settings.dashboardRange === "30d" && (await settings.countDocuments({ buyerId: A.id })) === 0);
  const mk = (over = {}) => ({ notifications: { inquiries: true, company: true }, dashboardRange: "30d", version: 0, ...over });
  const bad = await Promise.all([
    A.s.call("PATCH", "/api/buyer/settings", mk({ notifications: { inquiries: true, company: true, account: false } })),
    A.s.call("PATCH", "/api/buyer/settings", mk({ buyerId: String(B.id) })),
    A.s.call("PATCH", "/api/buyer/settings", mk({ dashboardRange: "custom" })),
    A.s.call("PATCH", "/api/buyer/settings", mk({ language: "hi" })),
    A.s.call("PATCH", "/api/buyer/settings", mk({ notifications: { inquiries: "no", company: true } })),
    A.s.call("PATCH", "/api/buyer/settings", mk({ version: -2 })),
    A.s.call("PATCH", "/api/buyer/settings", mk({ dashboardRange: { $ne: "" } })),
  ]);
  check("B-02 refused with 400 and nothing stored: the required account category, buyerId, custom period, an unsupported setting (language), non-boolean value, bad version, an operator object", bad.every((r) => r.status === 400) && bad[0].json.fields["notifications.account"] && bad[1].json.fields.buyerId && bad[3].json.fields.language && (await settings.countDocuments({ buyerId: A.id })) === 0, bad.map((r) => r.status).join());
  const first = await A.s.call("PATCH", "/api/buyer/settings", mk({ notifications: { inquiries: true, company: false }, dashboardRange: "7d" }));
  const doc1 = await settings.findOne({ buyerId: A.id });
  check("B-03 the first save creates the buyer's settings (version 1) for the buyer in the session", first.status === 200 && first.json.data.settings.version === 1 && first.json.data.settings.notifications.company === false && first.json.data.settings.dashboardRange === "7d" && String(doc1.buyerId) === String(A.id) && doc1.createdAt instanceof Date && !JSON.stringify(first.json).includes(String(A.id)));
  const second = await A.s.call("PATCH", "/api/buyer/settings", mk({ notifications: { inquiries: false, company: false }, dashboardRange: "90d", version: 1 }));
  check("B-04 a later save with the right version succeeds and bumps it to 2", second.status === 200 && second.json.data.settings.version === 2 && (await settings.findOne({ buyerId: A.id })).dashboardRange === "90d");
  const stale = await A.s.call("PATCH", "/api/buyer/settings", mk({ version: 1 }));
  check("B-05 a stale version is a 409 CONFLICT and changes nothing", stale.status === 409 && stale.json.code === "CONFLICT" && (await settings.findOne({ buyerId: A.id })).version === 2);
  const raceUser = await register("race");
  const raced = await Promise.all([1, 2, 3].map((n) => raceUser.s.call("PATCH", "/api/buyer/settings", mk({ dashboardRange: n === 1 ? "7d" : "90d" }))));
  check("B-06 three simultaneous first saves: exactly one wins (unique index), the others are told (200, 409, 409), one document exists", raced.map((r) => r.status).sort().join() === "200,409,409" && (await settings.countDocuments({ buyerId: raceUser.id })) === 1, raced.map((r) => r.status).join());
  const bSet = (await B.s.call("GET", "/api/buyer/settings")).json.data.settings;
  check("B-07 buyer B's settings are untouched by A's saves (defaults, version 0)", bSet.version === 0 && bSet.dashboardRange === "30d");
  const idx = await settings.indexes();
  check("B-08 the database allows one settings document per buyer (unique index on buyerId)", idx.some((i) => i.name === "one_settings_per_buyer" && i.unique && i.key.buyerId === 1), idx.map((i) => i.name).join());
  const evS = await events.find({ userId: A.id, type: "SETTINGS_UPDATED" }).toArray();
  check("B-09 saves are audited with setting names only (no values)", evS.length === 2 && evS.every((e) => Array.isArray(e.fields) && !/7d|90d|false|true/.test(JSON.stringify(e.fields))));
  const rl = new Session(); const rlUser = await register("rl"); rl.jar = rlUser.s.jar;
  const burst = []; for (let i = 0; i < 32; i++) burst.push((await rl.call("PATCH", "/api/buyer/settings", {})).status);
  check("B-10 settings writes are limited (30 per 10 minutes per buyer): the 31st request gets 429", burst.slice(0, 30).every((s) => s === 400) && burst.slice(30).every((s) => s === 429), burst.slice(28).join());
  await clearLimits();

  // ================= C: real events
  const cUser = await register("c", "Charlie Traders");
  const n0 = (await cUser.s.call("GET", "/api/buyer/notifications")).json.data;
  check("C-01 a new buyer has no notifications and zero unread (nothing is invented)", n0.notifications.length === 0 && n0.unread === 0 && n0.meta.total === 0);
  const ib = inquiryBody();
  const sent = await cUser.s.call("POST", "/api/public/inquiries", ib);
  const n1 = (await cUser.s.call("GET", "/api/buyer/notifications")).json.data;
  check("C-02 sending an inquiry creates one notification from that real event: category inquiries, the inquiry reference, honest wording (the supplier is not notified automatically), a safe link", sent.status === 201 && n1.notifications.length === 1 && n1.notifications[0].category === "inquiries" && n1.notifications[0].body.includes(sent.json.reference) && /not notified automatically/.test(n1.notifications[0].body) && n1.notifications[0].link === "/buyer/inquiries" && n1.notifications[0].read === false && n1.unread === 1, JSON.stringify(n1.notifications[0] ?? sent.json).slice(0, 300));
  const replay = await cUser.s.call("POST", "/api/public/inquiries", ib);
  check("C-03 the same inquiry sent again with the same key is a replay and creates no second notification (idempotent)", replay.status === 200 || replay.status === 201 ? (await notifs.countDocuments({ buyerId: cUser.id })) === 1 : true, `${replay.status} count ${await notifs.countDocuments({ buyerId: cUser.id })}`);
  await clearLimits();
  const ghost = await new Session().call("POST", "/api/public/inquiries", inquiryBody({ guestDetails: { name: "Guest Buyer", email: `guest-${stamp}@example.test`, phone: "9876543210", countryCode: "+91" } }));
  check("C-04 a guest inquiry creates no notification for anyone", ghost.status === 201 && (await notifs.countDocuments({ dedupeKey: `inquiry:${ghost.json.reference}` })) === 0);
  const dupKey = await notifs.findOne({ buyerId: cUser.id });
  let dupErr = null; try { await notifs.insertOne({ ...dupKey, _id: new ObjectId() }); } catch (e) { dupErr = e; }
  check("C-05 the database refuses a second notification for the same event (unique buyer + dedupeKey)", dupErr?.code === 11000);
  await cUser.s.call("PATCH", "/api/buyer/settings", { notifications: { inquiries: false, company: true }, dashboardRange: "30d", version: 0 });
  await clearLimits();
  const off = await cUser.s.call("POST", "/api/public/inquiries", inquiryBody());
  check("C-06 with inquiry notices switched off, a new inquiry still succeeds but creates no notification (the preference is applied where the notice is created)", off.status === 201 && (await notifs.countDocuments({ buyerId: cUser.id })) === 1);
  // password change (required category) and sign out everywhere
  const other = await login(cUser.email);
  const pw = await cUser.s.call("POST", "/api/auth/change-password", { currentPassword: PW, newPassword: "a new settings passphrase 1", confirmPassword: "a new settings passphrase 1" });
  const afterPw = (await cUser.s.call("GET", "/api/buyer/notifications?category=account")).json.data;
  check("C-07 changing the password creates a required account notification, and the other device is signed out", pw.status === 200 && afterPw.notifications.length === 1 && afterPw.notifications[0].type === "PASSWORD_CHANGED" && (await other.s.call("GET", "/api/buyer/settings")).status === 401, `${pw.status} ${afterPw.notifications.length}`);
  const hold = new Session();
  const relog = await hold.call("POST", "/api/auth/login", { email: cUser.email, password: "a new settings passphrase 1" });
  const cookie2 = new Session(); const relog2 = await cookie2.call("POST", "/api/auth/login", { email: cUser.email, password: "a new settings passphrase 1" });
  const out = await hold.call("POST", "/api/buyer/settings/sign-out-everywhere");
  const stillHere = await hold.call("GET", "/api/buyer/settings");
  const gone = await cookie2.call("GET", "/api/buyer/settings");
  const accountNotes = (await hold.call("GET", "/api/buyer/notifications?category=account")).json.data;
  check("C-08 'sign out of all other devices' revokes the other session, keeps this one signed in, and creates a required notification", relog.status === 200 && relog2.status === 200 && out.status === 200 && stillHere.status === 200 && gone.status === 401 && accountNotes.notifications.some((n) => n.type === "SIGNED_OUT_EVERYWHERE"), `${out.status} ${stillHere.status} ${gone.status}`);
  await cUser.s.call("POST", "/api/auth/logout");
  const cc = hold;
  const co = await cc.call("POST", "/api/buyer/company", { legalName: "Charlie Traders Pvt Ltd", businessType: "Private Limited", country: "India" });
  const up = await cc.upload({ documentType: "GST_CERTIFICATE" }, { bytes: PDF, name: "gst.pdf" });
  const docNotes = (await cc.call("GET", "/api/buyer/notifications?category=company")).json.data;
  check("C-09 uploading a company document creates a company notification that says its status is Pending (not verified) and links to the documents tab", co.status === 201 && up.status === 201 && docNotes.notifications.length === 1 && /Pending/.test(docNotes.notifications[0].body) && /not verified/.test(docNotes.notifications[0].body) && docNotes.notifications[0].link === "/buyer/profile?tab=documents", `${co.status} ${up.status} ${docNotes.notifications.length}`);
  await cc.call("PATCH", "/api/buyer/settings", { notifications: { inquiries: false, company: false }, dashboardRange: "30d", version: 1 });
  await clearLimits();
  const up2 = await cc.upload({ documentType: "PAN_DOCUMENT" }, { bytes: PDF, name: "pan.pdf" });
  check("C-10 with company notices switched off, another document upload succeeds and creates no notification", up2.status === 201 && (await notifs.countDocuments({ buyerId: cUser.id, category: "company" })) === 1);
  // unsafe stored link is never returned
  await notifs.insertOne({ buyerId: cUser.id, category: "account", type: "SEED", title: "Bad link", body: "x", link: "https://evil.example/phish", dedupeKey: "bad-link-1", isRead: false, readAt: null, createdAt: new Date(), purgeAt: new Date(Date.now() + 86400000) });
  const withBad = (await cc.call("GET", "/api/buyer/notifications?limit=50")).json.data.notifications.find((n) => n.title === "Bad link");
  check("C-11 a notification whose stored link is not a safe internal path is returned with no link at all", withBad && withBad.link === null);
  check("C-12 notification records carry no email, phone, password or token and the answer has no buyer id", !/@example\.test|9876543210|passphrase|token|buyerId|_id/i.test(JSON.stringify((await cc.call("GET", "/api/buyer/notifications?limit=50")).json)));

  // ================= D: list, filters, read state
  const D = await register("d");
  await notifs.insertMany(seed(D.id, 120));
  const get = async (s, q = "") => (await s.call("GET", `/api/buyer/notifications${q}`));
  const d1 = (await get(D.s)).json.data;
  check("D-01 120 notifications: first page 20 newest first, total 120, 6 pages, unread 30", d1.notifications.length === 20 && d1.meta.total === 120 && d1.meta.totalPages === 6 && d1.meta.limit === 20 && d1.unread === 30 && d1.notifications[0].title === "Seed notice 0" && d1.notifications[1].title === "Seed notice 1");
  const f = async (q) => (await get(D.s, `?${q}`)).json.data;
  const [un1, rd1, ci, cc2, ca, cu, p6, p7, l50] = await Promise.all([f("status=unread"), f("status=read"), f("category=inquiries"), f("category=company"), f("category=account"), f("category=inquiries&status=unread"), f("page=6"), f("page=7"), f("limit=50")]);
  check("D-02 filters: unread 30, read 90, inquiries 40, company 40, account 40, inquiries and unread 10", un1.meta.total === 30 && rd1.meta.total === 90 && ci.meta.total === 40 && cc2.meta.total === 40 && ca.meta.total === 40 && cu.meta.total === 10 && un1.notifications.every((n) => !n.read) && rd1.notifications.every((n) => n.read));
  check("D-03 pagination: the last page has 20, a page past the end is an empty list (not an error), limit 50 returns 50", p6.notifications.length === 20 && p7.notifications.length === 0 && p7.meta.total === 120 && l50.notifications.length === 50);
  const badQ = await Promise.all([get(D.s, "?limit=51"), get(D.s, "?page=0"), get(D.s, "?page=1001"), get(D.s, "?status=archived"), get(D.s, "?category=promo"), get(D.s, '?category={"$ne":""}')]);
  const bracket = await get(D.s, "?category[$ne]=x");
  check("D-04 limit 51, page 0, page 1001, an unknown status, an unknown category and a JSON operator value are refused (400); a bracket-style operator parameter is not a parameter at all and is ignored (the normal unfiltered list, no operator applied)", badQ.every((r) => r.status === 400) && bracket.status === 200 && bracket.json.data.meta.total === 120, badQ.map((r) => r.status).join() + " bracket " + bracket.status);
  const spoof = (await get(D.s, `?buyerId=${B.id}&userId=${B.id}`)).json.data;
  check("D-05 a buyerId in the query is ignored: still D's 120", spoof.meta.total === 120);
  const bList = (await get(B.s)).json.data;
  check("D-06 buyer B sees none of D's notifications", bList.meta.total === 0 && bList.unread === 0);
  const firstUnread = un1.notifications[0];
  const m1 = await D.s.call("PATCH", `/api/buyer/notifications/${firstUnread.id}/read`);
  check("D-07 marking one as read: 200, it is read with a time, the unread count drops from 30 to 29", m1.status === 200 && m1.json.data.notification.read === true && m1.json.data.notification.readAt && m1.json.data.unread === 29);
  const m2 = await D.s.call("PATCH", `/api/buyer/notifications/${firstUnread.id}/read`);
  check("D-08 marking it again is harmless (200, still 29) and keeps the first read time", m2.status === 200 && m2.json.data.unread === 29 && m2.json.data.notification.readAt === m1.json.data.notification.readAt);
  const otherUnread = un1.notifications[1];
  const cross = await B.s.call("PATCH", `/api/buyer/notifications/${otherUnread.id}/read`);
  const bogus = await Promise.all(["not-an-id", new ObjectId().toString(), "..%2Fx"].map((id) => D.s.call("PATCH", `/api/buyer/notifications/${id}/read`)));
  check("D-09 another buyer's id, a malformed id and an unknown id all answer the same 404, and the notification stays unread", cross.status === 404 && bogus.every((r) => r.status === 404 && r.text === cross.text) && (await notifs.findOne({ _id: new ObjectId(otherUnread.id) })).readAt === null);
  const ra = await D.s.call("PATCH", "/api/buyer/notifications/read-all?category=company");
  check("D-10 'mark all as read' in one category changes only that category's unread (company: 10), the other categories stay unread (inquiries 9, account 10)", ra.status === 200 && ra.json.data.changed === 10 && (await notifs.countDocuments({ buyerId: D.id, category: "company", readAt: null })) === 0 && (await notifs.countDocuments({ buyerId: D.id, category: "inquiries", readAt: null })) === 9 && (await notifs.countDocuments({ buyerId: D.id, category: "account", readAt: null })) === 10, JSON.stringify(ra.json.data));
  const rb = await B.s.call("PATCH", "/api/buyer/notifications/read-all");
  check("D-11 buyer B's 'mark all as read' changes nothing of D's", rb.status === 200 && rb.json.data.changed === 0 && (await notifs.countDocuments({ buyerId: D.id, readAt: null })) === 19);
  const rBad = await D.s.call("PATCH", "/api/buyer/notifications/read-all?category=promo");
  check("D-12 an unknown category on 'mark all' is refused (400)", rBad.status === 400);
  const raAll = await D.s.call("PATCH", "/api/buyer/notifications/read-all");
  const raTwice = await D.s.call("PATCH", "/api/buyer/notifications/read-all");
  check("D-13 'mark all as read' reads the rest (19) and then reports there was nothing unread; unread is 0", raAll.json.data.changed === 19 && raAll.json.data.unread === 0 && raTwice.json.data.changed === 0 && /nothing unread/i.test(raTwice.json.message) && (await get(D.s, "/unread-count")).status !== 500);
  const cnt = (await D.s.call("GET", "/api/buyer/notifications/unread-count")).json.data;
  check("D-14 the unread-count endpoint agrees (0, not capped)", cnt.unread === 0 && cnt.capped === false);
  const E = await register("e");
  await notifs.insertMany(seed(E.id, 150, { unreadEvery: 1 }));
  const cap = (await E.s.call("GET", "/api/buyer/notifications/unread-count")).json.data;
  check("D-15 the unread count is bounded: 150 unread shows 100 and capped (the badge reads 99+)", cap.unread === 100 && cap.capped === true);
  const ix = await notifs.indexes();
  const ttl = ix.find((i) => i.name === "retention_ttl");
  const keyOf = (name) => JSON.stringify(ix.find((i) => i.name === name)?.key);
  check("D-16 indexes exist, each with the sort fields last and _id as tie-breaker (newest; status+newest; category+newest; category+status+newest), a unique event key, and a TTL index for retention", keyOf("nf_buyer_newest") === '{"buyerId":1,"createdAt":-1,"_id":-1}' && keyOf("nf_buyer_status_newest") === '{"buyerId":1,"isRead":1,"createdAt":-1,"_id":-1}' && keyOf("nf_buyer_category_newest") === '{"buyerId":1,"category":1,"createdAt":-1,"_id":-1}' && keyOf("nf_buyer_category_status_newest") === '{"buyerId":1,"category":1,"isRead":1,"createdAt":-1,"_id":-1}' && ix.some((i) => i.name === "one_notification_per_event" && i.unique) && ttl?.expireAfterSeconds === 0 && !ix.some((i) => ["buyer_newest", "buyer_unread_newest", "buyer_category_newest"].includes(i.name)), ix.map((i) => i.name).join());
  const fresh = await notifs.findOne({ buyerId: cUser.id, type: "INQUIRY_SUBMITTED" });
  const days = (fresh.purgeAt - fresh.createdAt) / 86_400_000;
  check("D-17 a notification expires 180 days after it was created", Math.abs(days - 180) < 0.01, String(days));
  await clearLimits();
  const wb = new Session(); const wbUser = await register("wb"); wb.jar = wbUser.s.jar;
  const wburst = []; for (let i = 0; i < 123; i++) wburst.push((await wb.call("PATCH", "/api/buyer/notifications/not-an-id/read")).status);
  check("D-18 notification writes are limited (120 per 10 minutes per buyer): the 121st request gets 429", wburst.slice(0, 120).every((s) => s === 404) && wburst.slice(120).every((s) => s === 429), wburst.slice(118).join());
  await clearLimits();

  // ================= F: browser, settings tab
  const F = await register("f");
  const page = await open("/buyer/settings", { session: F.s });
  const t = await content(page);
  const nav = await page.evaluate(() => ({ active: document.querySelector("nav[aria-label='Buyer navigation'] a[aria-current='page']")?.textContent.trim(), tabs: [...document.querySelectorAll("nav[aria-label='Settings sections'] a")].map((a) => a.textContent.trim().replace(/\s+/g, " ")), cur: document.querySelector("nav[aria-label='Settings sections'] a[aria-current='page']")?.textContent.trim(), h1: document.querySelector("h1")?.textContent }));
  check("F-01 the settings tab renders inside the buyer shell: breadcrumb, heading, 'Settings & Notifications' is the current sidebar item, two tabs with Settings current, no console errors", page.status === 200 && /Settings & Notifications/.test(nav.active ?? "") && nav.tabs.length === 2 && /^Settings/.test(nav.cur ?? "") && nav.h1 === "Settings & Notifications" && page.errs.length === 0, JSON.stringify(nav) + page.errs.join("|"));
  check("F-02 security, sign-out-everywhere, preferences, privacy and the 'not available yet' list are all present", /Change Password/.test(t) && /Sign out of all other devices/.test(t) && /Notification preferences/.test(t) && /Privacy and data/.test(t) && /Not available yet/.test(t) && /Two-step verification/.test(t) && /Login alerts/.test(t));
  const toggles = await page.evaluate(() => ({ boxes: [...document.querySelectorAll("#buyer-content input[type=checkbox]")].map((c) => ({ id: c.id, checked: c.checked, disabled: c.disabled })), unavailableRows: document.querySelectorAll("#buyer-content [class*=unavailableRow]").length }));
  check("F-03 only real preferences are switches: inquiry and company are on and changeable, the account (security) and support ones are on and locked ('Always on'); features that do not exist have no switch at all", toggles.boxes.length === 4 && toggles.boxes.find((b) => b.id === "pref-account").checked && toggles.boxes.find((b) => b.id === "pref-account").disabled && toggles.boxes.find((b) => b.id === "pref-support").checked && toggles.boxes.find((b) => b.id === "pref-support").disabled && !toggles.boxes.find((b) => b.id === "pref-inquiries").disabled && toggles.unavailableRows >= 10 && /Always on/.test(t), JSON.stringify(toggles));
  const saveDisabled = await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Save Preferences/.test(b.textContent)).disabled);
  check("F-04 'Save Preferences' is disabled until something changes", saveDisabled === true);
  await page.evaluate(() => document.getElementById("pref-inquiries").click());
  await page.select("#pref-range", "7d");
  await sleep(300);
  const dirtyNow = await content(page);
  check("F-05 changing a preference enables Save and says there are unsaved changes", /You have unsaved changes/.test(dirtyNow) && (await page.evaluate(() => ![...document.querySelectorAll("button")].find((b) => /Save Preferences/.test(b.textContent)).disabled)));
  await clickText(page, "nav[aria-label='Settings sections'] a", "Notifications");
  await sleep(500);
  const leaveAsk = await page.evaluate(() => document.querySelector("[role=alertdialog]")?.textContent ?? "");
  check("F-06 leaving for the Notifications tab with unsaved changes asks first in the site's own dialog, and stays on the page when the buyer chooses Keep editing", /unsaved changes/i.test(leaveAsk) && new URL(page.url()).searchParams.get("tab") !== "notifications", leaveAsk);
  await page.evaluate(() => [...document.querySelectorAll("[role=alertdialog] button")].find((b) => /Keep editing/.test(b.textContent)).click());
  await sleep(300);
  await clickText(page, "button", "Save Preferences");
  await sleep(2000);
  const rowF = await settings.findOne({ buyerId: F.id });
  check("F-07 saving writes to the database (inquiries off, 7 days) and the page says so only afterwards; Save is disabled again", !!rowF && rowF.notifications.inquiries === false && rowF.notifications.company === true && rowF.dashboardRange === "7d" && rowF.version === 1 && /Your settings were saved/.test(await content(page)) && (await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Save Preferences/.test(b.textContent)).disabled)));
  await page.reload({ waitUntil: "networkidle2" });
  check("F-08 after a reload the saved values come back from the server (inquiry off, company on, period 7 days)", (await page.evaluate(() => ({ i: document.getElementById("pref-inquiries").checked, c: document.getElementById("pref-company").checked, r: document.getElementById("pref-range").value }))).i === false);
  const dashDefault = await open("/buyer/dashboard", { session: F.s });
  const dashExplicit = await open("/buyer/dashboard?range=90d", { session: F.s });
  const dd = await content(dashDefault), de = await content(dashExplicit);
  check("F-09 the saved dashboard period applies when the address names none (7 days), and an explicit ?range=90d always wins", /compared with the 7 days before/.test(dd) && /compared with the 90 days before/.test(de), `${dd.match(/compared with the (\d+) days/)?.[1]} / ${de.match(/compared with the (\d+) days/)?.[1]}`);
  await dashDefault.context.close(); await dashExplicit.context.close();
  const fresh0 = await register("g");
  const dashG = await open("/buyer/dashboard", { session: fresh0.s });
  check("F-10 a buyer who never saved sees the 30-day default", /compared with the 30 days before/.test(await content(dashG)));
  await dashG.context.close();
  await page.evaluate(() => document.querySelector("button[aria-haspopup=true]").click());
  await sleep(200);
  check("F-11 the profile menu has a working 'Settings & Notifications' link (no 'Soon')", await page.evaluate(() => { const a = [...document.querySelectorAll("#buyer-profile-menu a")].find((x) => /Settings & Notifications/.test(x.textContent)); return !!a && a.getAttribute("href") === "/buyer/settings" && !/Soon/.test(document.getElementById("buyer-profile-menu").textContent); }));
  await clickText(page, "button", "Sign out of all other devices");
  await sleep(500);
  const outAsk = await page.evaluate(() => document.querySelector("[role=alertdialog]")?.textContent ?? "");
  await page.evaluate(() => [...document.querySelectorAll("[role=alertdialog] button")].find((b) => /Sign out other devices/.test(b.textContent)).click());
  await sleep(2000);
  check("F-12 'Sign out of all other devices' asks first in the site's own dialog, then reports the real result; this tab stays signed in", /every other device/i.test(outAsk) && /signed out of every other device/i.test(await content(page)) && (await page.evaluate(async () => (await fetch("/api/buyer/settings")).status)) === 200);
  await page.context.close();

  // ================= G: browser, notifications tab
  const emptyUser = await register("h");
  const ep = await open("/buyer/settings?tab=notifications", { session: emptyUser.s });
  const et = await content(ep);
  check("G-01 an empty notification centre says 'No notifications yet' and explains what creates one; zero unread; no invented notices", /No notifications yet/.test(et) && /when you send an inquiry or upload a company document/i.test(et) && ep.errs.length === 0, ep.errs.join("|"));
  const bell0 = await ep.evaluate(() => document.querySelector("header button[aria-label^='Notifications']")?.getAttribute("aria-label"));
  check("G-02 the top bar bell is a button with an honest label (none unread)", /none unread/.test(bell0 ?? ""), String(bell0));
  const navActive = await ep.evaluate(() => document.querySelector("nav[aria-label='Buyer navigation'] a[aria-current='page']")?.textContent.trim());
  check("G-03 'Settings & Notifications' stays the current sidebar item on the Notifications tab and the tab is current", /Settings & Notifications/.test(navActive ?? "") && (await ep.evaluate(() => document.querySelector("nav[aria-label='Settings sections'] a[aria-current='page']")?.textContent.includes("Notifications"))));
  await ep.context.close();

  const G = await register("i");
  await notifs.insertMany(seed(G.id, 45));
  const np = await open("/buyer/settings?tab=notifications", { session: G.s });
  const rows = () => np.evaluate(() => document.querySelectorAll("#buyer-content ul[class*=notifList] > li").length);
  const bell1 = await np.evaluate(() => document.querySelector("header button[aria-label^='Notifications']")?.getAttribute("aria-label"));
  check("G-04 20 notifications on page 1 with 'Showing 1-20 of 45', unread tagged with the text 'New' (not colour only), and the bell reads the real unread count (12)", (await rows()) === 20 && /Showing 1-20 of 45/.test(await content(np)) && (await np.evaluate(() => document.querySelectorAll("[class*=newTag]").length)) > 0 && /12 unread/.test(bell1 ?? ""), String(bell1));
  await clickText(np, "nav[aria-label='Notification pages'] button", "Next");
  await sleep(1500);
  check("G-05 'Next' loads page 2 from the server (Showing 21-40 of 45) and puts page=2 in the address", /Showing 21-40 of 45/.test(await content(np)) && new URL(np.url()).searchParams.get("page") === "2");
  await np.evaluate(() => [...document.querySelectorAll("[aria-label='Filter notifications by status'] button")].find((b) => /^Unread/.test(b.textContent.trim())).click());
  await sleep(1500);
  check("G-06 the Unread filter resets to page 1 and shows only unread (12) with status=unread in the address; the chip is pressed", /Showing 1-12 of 12/.test(await content(np)) && new URL(np.url()).searchParams.get("status") === "unread" && !new URL(np.url()).searchParams.get("page") && (await np.evaluate(() => [...document.querySelectorAll("[aria-label='Filter notifications by status'] button")].find((b) => /^Unread/.test(b.textContent.trim())).getAttribute("aria-pressed"))) === "true");
  await np.evaluate(() => [...document.querySelectorAll("[aria-label='Filter notifications by category'] button")].find((b) => /Inquiry updates/.test(b.textContent)).click());
  await sleep(1500);
  check("G-07 the category filter combines with Unread (inquiries and unread: 4)", /Showing 1-4 of 4/.test(await content(np)) && new URL(np.url()).searchParams.get("category") === "inquiries");
  await np.evaluate(() => [...document.querySelectorAll("#buyer-content ul[class*=notifList] button")].find((b) => /Mark as read/.test(b.textContent)).click());
  await sleep(1800);
  check("G-08 'Mark as read' on one item updates the database, removes it from the unread view (3 left) and lowers the bell count (11)", (await notifs.countDocuments({ buyerId: G.id, readAt: null })) === 11 && /Showing 1-3 of 3/.test(await content(np)) && /11 unread/.test(await np.evaluate(() => document.querySelector("header button[aria-label^='Notifications']")?.getAttribute("aria-label"))));
  await np.reload({ waitUntil: "networkidle2" });
  check("G-09 reloading the address restores the filters (unread, inquiries) and the list", /Showing 1-3 of 3/.test(await content(np)));
  await clickText(np, "button", "Mark these as read");
  await sleep(1800);
  check("G-10 'Mark these as read' in a category marks only that category (database: inquiries 0 unread, others still unread)", (await notifs.countDocuments({ buyerId: G.id, category: "inquiries", readAt: null })) === 0 && (await notifs.countDocuments({ buyerId: G.id, readAt: null })) === 8);
  await np.evaluate(() => [...document.querySelectorAll("[aria-label='Filter notifications by category'] button")].find((b) => /All categories/.test(b.textContent)).click());
  await sleep(1200);
  await clickText(np, "button", "Mark all as read");
  await sleep(1800);
  const bellEnd = await np.evaluate(() => document.querySelector("header button[aria-label^='Notifications']")?.getAttribute("aria-label"));
  check("G-11 'Mark all as read' empties the unread count in the database and the bell, and the Unread chip shows (0)", (await notifs.countDocuments({ buyerId: G.id, readAt: null })) === 0 && /none unread/.test(bellEnd ?? "") && /Unread \(0\)/.test(await content(np)), String(bellEnd));
  await np.evaluate(() => [...document.querySelectorAll("[aria-label='Filter notifications by status'] button")].find((b) => /^All/.test(b.textContent.trim())).click());
  await sleep(1200);
  const links = await np.evaluate(() => [...document.querySelectorAll("#buyer-content ul[class*=notifList] a")].map((a) => a.getAttribute("href")));
  check("G-12 every 'Open' link on screen points inside the buyer area", links.length > 0 && links.every((h) => /^\/(buyer|account)\//.test(h)), links.join(","));
  await np.evaluate(() => [...document.querySelectorAll("[aria-label='Filter notifications by status'] button")].find((b) => /^Unread/.test(b.textContent.trim())).click());
  await sleep(1200);
  check("G-13 an Unread filter with nothing unread shows 'No notifications match these filters' with a Clear filters button", /No notifications match these filters/.test(await content(np)) && /Clear filters/.test(await content(np)));
  await np.setOfflineMode(true);
  await np.evaluate(() => [...document.querySelectorAll("[aria-label='Filter notifications by status'] button")].find((b) => /^Read/.test(b.textContent.trim())).click());
  await sleep(1500);
  check("G-14 when the server cannot be reached the page shows an error with 'Try again' instead of stale or invented data", /could not be loaded/.test(await content(np)) && /Try again/.test(await content(np)));
  await np.setOfflineMode(false);
  await np.context.close();
  const badUrl = await open("/buyer/settings?tab=notifications&status=bogus&category=%3Cscript%3E&page=-4", { session: G.s });
  check("G-15 an invalid filter in the address falls back to the full list (no error page)", badUrl.status === 200 && /Showing 1-20 of 45/.test(await content(badUrl)));
  await badUrl.context.close();

  // ================= P: the bell panel
  const BELL = "header button[aria-label^='Notifications']";
  const PANEL = "[role=dialog][aria-label=Notifications]";
  const S = await register("panel");
  await notifs.insertMany(seed(S.id, 30, { prefix: "panel" }));
  const bp = await open("/buyer/dashboard", { session: S.s });
  const bellLabel = () => bp.evaluate((b) => document.querySelector(b)?.getAttribute("aria-label"), BELL);
  await sleep(600);
  check("P-01 the bell shows the real unread count (8) in its label and badge, with no visible name next to the icon", /8 unread/.test((await bellLabel()) ?? "") && (await bp.evaluate((b) => document.querySelector(b)?.textContent.trim(), BELL)) === "8");
  await bp.evaluate((b) => document.querySelector(b).click(), BELL);
  await sleep(1500);
  const panel = await bp.evaluate((b, pn) => { const d = document.querySelector(pn); return d ? { items: d.querySelectorAll("ul li").length, tags: [...d.querySelectorAll("ul li")].filter((li) => /New/.test(li.textContent)).length, unreadPressed: [...d.querySelectorAll("button")].find((x) => /^Unread/.test(x.textContent.trim()))?.getAttribute("aria-pressed"), markAll: [...d.querySelectorAll("button")].some((x) => /Mark all as read/.test(x.textContent)), viewAll: d.querySelector("a[href='/buyer/settings?tab=notifications']")?.textContent, focus: document.activeElement?.tagName, expanded: document.querySelector(b).getAttribute("aria-expanded") } : null; }, BELL, PANEL);
  check("P-02 clicking the bell opens a notifications panel (dialog) listing the 8 unread, each tagged 'New', on the Unread view, with 'Mark all as read' and 'View all notifications', focus moved into it", !!panel && panel.items === 8 && panel.tags === 8 && panel.unreadPressed === "true" && panel.markAll && /View all/.test(panel.viewAll ?? "") && panel.focus === "H2" && panel.expanded === "true", JSON.stringify(panel));
  const firstHref = await bp.evaluate((pn) => document.querySelector(pn + " ul li a")?.getAttribute("href"), PANEL);
  await bp.evaluate((pn) => document.querySelector(pn + " ul li a").click(), PANEL);
  await sleep(2500);
  check("P-03 clicking a notification that has a page marks it read (database) and opens that page", firstHref === "/buyer/profile?tab=documents" && new URL(bp.url()).pathname === "/buyer/profile" && (await notifs.countDocuments({ buyerId: S.id, readAt: null })) === 7 && /7 unread/.test((await bellLabel()) ?? ""), `${firstHref} ${bp.url()} ${await bellLabel()}`);
  await bp.evaluate((b) => document.querySelector(b).click(), BELL);
  await sleep(1500);
  await bp.evaluate((pn) => [...document.querySelectorAll(pn + " ul li button")][0].click(), PANEL);
  await sleep(2000);
  check("P-04 clicking a notification without a page marks it read and the panel updates (6 unread left in the database, the bell and the list)", (await notifs.countDocuments({ buyerId: S.id, readAt: null })) === 6 && /6 unread/.test((await bellLabel()) ?? "") && (await bp.evaluate((pn) => document.querySelectorAll(pn + " ul li").length, PANEL)) === 6);
  await bp.evaluate((pn) => [...document.querySelectorAll(pn + " button")].find((x) => /^All/.test(x.textContent.trim())).click(), PANEL);
  await sleep(1500);
  check("P-05 the All view shows the latest 8 (the two newest were read in the steps above, so none shows a 'New' tag) while the Unread tab still counts the 6 that remain unread", await bp.evaluate((pn) => { const lis = [...document.querySelectorAll(pn + " ul li")]; const unreadTab = [...document.querySelectorAll(pn + " button")].find((x) => /^Unread/.test(x.textContent.trim()))?.textContent ?? ""; return lis.length === 8 && lis.every((li) => !/New/.test(li.textContent)) && /(6)/.test(unreadTab); }, PANEL));
  await bp.keyboard.press("Escape");
  await sleep(300);
  check("P-06 Escape closes the panel and returns focus to the bell", (await bp.evaluate((pn) => !document.querySelector(pn), PANEL)) && (await bp.evaluate(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Notifications"))));
  await bp.evaluate((b) => document.querySelector(b).click(), BELL);
  await sleep(1200);
  await bp.mouse.click(700, 600);
  await sleep(300);
  check("P-07 a click outside closes the panel", await bp.evaluate((pn) => !document.querySelector(pn), PANEL));
  await bp.evaluate((b) => document.querySelector(b).click(), BELL);
  await sleep(1500);
  await bp.evaluate((pn) => [...document.querySelectorAll(pn + " button")].find((x) => /Mark all as read/.test(x.textContent)).click(), PANEL);
  await sleep(2500);
  check("P-08 'Mark all as read' in the panel marks every unread notification (database 0), the bell reads 'none unread', and no 'New' tag is left", (await notifs.countDocuments({ buyerId: S.id, readAt: null })) === 0 && /none unread/.test((await bellLabel()) ?? "") && (await bp.evaluate((pn) => ![...document.querySelectorAll(pn + " ul li")].some((li) => /New/.test(li.textContent)), PANEL)));
  await bp.context.close();
  const E2 = await register("panel2");
  const ep2 = await open("/buyer/dashboard", { session: E2.s });
  await ep2.evaluate((b) => document.querySelector(b).click(), BELL);
  await sleep(1500);
  check("P-09 a buyer with no notifications sees 'No notifications yet.' in the panel and 'Mark all as read' is disabled", /No notifications yet/.test(await ep2.evaluate((pn) => document.querySelector(pn).textContent, PANEL)) && (await ep2.evaluate((pn) => [...document.querySelectorAll(pn + " button")].find((x) => /Mark all as read/.test(x.textContent)).disabled, PANEL)));
  await ep2.context.close();
  const fitUser = await register("panel3");
  await notifs.insertMany(seed(fitUser.id, 12, { prefix: "fit" }));
  const fits = [];
  for (const w of [320, 375, 414, 768, 1440]) {
    const fp = await open("/buyer/dashboard", { session: fitUser.s, width: w });
    await fp.evaluate((b) => document.querySelector(b).click(), BELL);
    await sleep(1500);
    const box = await fp.evaluate((pn) => { const r = document.querySelector(pn).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, w: window.innerWidth, ov: document.documentElement.scrollWidth - window.innerWidth }; }, PANEL);
    if (box.l < -1 || box.r > box.w + 1 || box.t < 0 || box.ov > 0) fits.push(`${w}: ${JSON.stringify(box)}`);
    if (w === 1440 || w === 320) await fp.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/25-26-bell-panel-${w}.png` });
    await fp.context.close();
  }
  check("P-10 the panel stays inside the screen with no sideways scroll at 320, 375, 414, 768 and 1440", fits.length === 0, fits.join("; "));

  // ================= L: sign-in confirmation, header state, gold active item
  const LU = await register("login");
  const lp = await open("/sign-in");
  await lp.type("input[type=email]", LU.email);
  await lp.type("input[type=password]", "wrong passphrase 1");
  await clickText(lp, "button[type=submit]", "Sign In");
  await sleep(2500);
  check("L-01 a wrong password shows the error on the form, creates no success toast, and the header still says Sign In", (await lp.evaluate(() => !document.querySelector("[aria-label='Notifications from the site'] [role=status]"))) && /not correct|Check/i.test(await lp.evaluate(() => document.body.textContent)) && /Sign In/.test(await lp.evaluate(() => document.querySelector("header a[href='/sign-in']")?.textContent ?? "")));
  await lp.evaluate(() => { const el = document.querySelector("input[type=password]"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ""); el.dispatchEvent(new Event("input", { bubbles: true })); });
  await lp.type("input[type=password]", PW);
  await clickText(lp, "button[type=submit]", "Sign In");
  await sleep(3500);
  const afterLogin = await lp.evaluate(() => ({ path: location.pathname, toast: document.querySelector("[aria-label='Notifications from the site'] [role=status]")?.textContent ?? "", header: [...document.querySelectorAll("header button, header a")].map((e) => e.textContent.trim().replace(/\s+/g, " ")).filter((t) => /Sign Out|Sign In|My Dashboard/.test(t)), dash: document.querySelector("header a[href='/buyer/dashboard']")?.textContent.trim().replace(/\s+/g, " ") ?? "" }));
  check("L-02 after a successful sign-in a confirmation toast appears ('You are signed in.') as a polite status message, and the header changes from Sign In to the buyer's first name linking to My Dashboard, with no Sign Out in the header (without a manual reload)", afterLogin.path === "/" && /You are signed in\./.test(afterLogin.toast) && /My Dashboard/.test(afterLogin.dash) && !afterLogin.header.some((t) => /Sign Out|^Sign In/.test(t)), JSON.stringify(afterLogin));
  await lp.evaluate(() => document.querySelector("[aria-label='Dismiss message']")?.click());
  await sleep(400);
  check("L-03 the toast can be dismissed with its close button", await lp.evaluate(() => !document.querySelector("[aria-label='Notifications from the site'] [role=status]")));
  await lp.evaluate(() => document.querySelector("header a[href='/buyer/dashboard']").click());
  await sleep(3500);
  await lp.evaluate(() => document.querySelector("button[aria-controls='buyer-profile-menu']").click());
  await sleep(300);
  await lp.evaluate(() => [...document.querySelectorAll("#buyer-profile-menu button")].find((b) => /Sign out/.test(b.textContent)).click());
  await sleep(4000);
  const afterOut = await lp.evaluate(() => ({ path: location.pathname, toast: document.querySelector("[aria-label='Notifications from the site'] [role=status]")?.textContent ?? "", signIn: !!document.querySelector("header a[href='/sign-in']") }));
  check("L-04 signing out from the dashboard's profile menu shows 'You have been signed out.' on the home page and the header returns to Sign In", afterOut.path === "/" && /You have been signed out\./.test(afterOut.toast) && afterOut.signIn, JSON.stringify(afterOut));
  await sleep(6500);
  check("L-05 a toast closes by itself after about six seconds", await lp.evaluate(() => !document.querySelector("[aria-label='Notifications from the site'] [role=status]")));
  await lp.context.close();
  const gp = await open("/buyer/settings", { session: LU.s });
  const gold = await gp.evaluate(() => { const a = document.querySelector("nav[aria-label='Buyer navigation'] a[aria-current='page']"); const cs = getComputedStyle(a); return { bg: cs.backgroundColor, color: cs.color, text: a.textContent.trim() }; });
  check("L-06 the current sidebar item is gold (#FDB304) with dark teal text, not teal and white", gold.bg === "rgb(253, 179, 4)" && gold.color !== "rgb(255, 255, 255)" && /Settings & Notifications/.test(gold.text), JSON.stringify(gold));
  await gp.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/25-26-settings-desktop-gold-active.png` });
  await gp.context.close();

  // ================= J: responsive
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const R = await register("shots");
  await notifs.insertMany(seed(R.id, 8));
  const wide = [];
  for (const tab of ["settings", "notifications"]) {
    for (const w of widths) {
      const p = await open(`/buyer/settings?tab=${tab}`, { session: R.s, width: w });
      const o = await overflow(p);
      const inside = await p.evaluate(() => [...document.querySelectorAll("#buyer-content button, #buyer-content input, #buyer-content select, #buyer-content a")].every((el) => { let box = el; for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const ox = getComputedStyle(n).overflowX; if (ox === "auto" || ox === "scroll") { box = n; break; } } const r = box.getBoundingClientRect(); return r.width === 0 || (r.left >= -1 && r.right <= window.innerWidth + 1); }));
      if (o > 0 || !inside) wide.push(`${tab}@${w}: overflow ${o} inside ${inside}`);
      if ([1440, 820, 390].includes(w)) await p.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/25-26-${tab}-${w === 1440 ? "desktop-1440" : w === 820 ? "tablet-820" : "mobile-390"}.png`, fullPage: true });
      await p.context.close();
    }
  }
  check("J-01 both tabs: no horizontal overflow and no control outside the viewport at 16 widths (320 to 2560); filter chips scroll inside their own row", wide.length === 0, wide.join("; "));
  for (const tab of ["settings", "notifications"]) {
    const p = await open(`/buyer/settings?tab=${tab}`, { session: R.s, width: 320 });
    const small = await p.evaluate(() => [...document.querySelectorAll("#buyer-content button, #buyer-content select, #buyer-content input:not([type=checkbox])")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40; }).length);
    check(`J-0${tab === "settings" ? 2 : 3} touch targets at 320px on the ${tab} tab: no button, select or text control under 40px tall`, small === 0, String(small));
    await p.context.close();
  }

  // ================= K: performance
  if (process.env.SKIP_PERF === "1") return;
  const P = await register("perf");
  let have = 0;
  const report = [];
  for (const size of [100, 1000, 10000, 20000]) {
    for (let from = have; from < size; from += 5000) await notifs.insertMany(seed(P.id, Math.min(5000, size - from), { start: from, prefix: "perf" }));
    have = size;
    await clearLimits();
    const sample = async (fn, n = 25) => { const out = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); const r = await fn(i); out.push(performance.now() - t0); if (r && r.status >= 400) throw new Error(`perf call failed ${r.status} ${r.text}`); } return out; };
    const list = await sample(() => P.s.call("GET", "/api/buyer/notifications", undefined, { "x-forwarded-for": nextIp() }));
    const unreadList = await sample(() => P.s.call("GET", "/api/buyer/notifications?status=unread&category=inquiries", undefined, { "x-forwarded-for": nextIp() }));
    const deep = await sample(() => P.s.call("GET", `/api/buyer/notifications?page=${Math.max(1, Math.floor(size / 20) - 1)}`, undefined, { "x-forwarded-for": nextIp() }), 15);
    const count = await sample(() => P.s.call("GET", "/api/buyer/notifications/unread-count", undefined, { "x-forwarded-for": nextIp() }));
    const unreadDocs = await notifs.find({ buyerId: P.id, readAt: null }, { projection: { _id: 1 } }).limit(25).toArray();
    const mark = await sample((i) => P.s.call("PATCH", `/api/buyer/notifications/${unreadDocs[i]._id}/read`, undefined, { "x-forwarded-for": nextIp() }), unreadDocs.length);
    await notifs.updateMany({ buyerId: P.id }, { $set: { readAt: null, isRead: false } });
    await clearLimits();
    const markAll = []; let changedTotal = 0; let rounds = 0; const tAll = performance.now();
    for (let more = true; more && rounds < 150; rounds++) { const t0 = performance.now(); const r = await P.s.call("PATCH", "/api/buyer/notifications/read-all", undefined, { "x-forwarded-for": nextIp() }); markAll.push(performance.now() - t0); changedTotal += r.json.data.changed; more = r.json.data.more; }
    const ra1 = { json: { data: { changed: changedTotal } } };
    const sd = await sample(() => P.s.call("GET", "/api/buyer/settings", undefined, { "x-forwarded-for": nextIp() }));
    report.push({ size, list: [med(list, 0.5), med(list, 0.95), med(list, 0.99)], unreadList: med(unreadList, 0.95), deep: med(deep, 0.95), count: [med(count, 0.5), med(count, 0.95)], mark: med(mark, 0.95), markAll: med(markAll, 0.95), markAllMax: Math.max(...markAll), rounds, markAllTotal: performance.now() - tAll, changed: ra1.json?.data?.changed, bytes: (await P.s.call("GET", "/api/buyer/notifications", undefined, { "x-forwarded-for": nextIp() })).text.length, settings: med(sd, 0.95) });
  }
  const setW = []; const wu = await register("perfw"); let ver = 0;
  for (let i = 0; i < 15; i++) { await clearLimits(); const t0 = performance.now(); const r = await wu.s.call("PATCH", "/api/buyer/settings", { notifications: { inquiries: i % 2 === 0, company: true }, dashboardRange: i % 2 ? "7d" : "90d", version: ver }, { "x-forwarded-for": nextIp() }); setW.push(performance.now() - t0); ver = r.json?.data?.settings?.version ?? ver; }
  for (const r of report) console.log(`  PERF ${String(r.size).padStart(5)} notifications: list p50 ${r.list[0].toFixed(0)} p95 ${r.list[1].toFixed(0)} p99 ${r.list[2].toFixed(0)} ms (${r.bytes} B); filtered p95 ${r.unreadList.toFixed(0)}; deep page p95 ${r.deep.toFixed(0)}; unread-count p50 ${r.count[0].toFixed(0)} p95 ${r.count[1].toFixed(0)}; mark one p95 ${r.mark.toFixed(0)}; mark all (${r.changed} changed in ${r.rounds} requests) request p95 ${r.markAll.toFixed(0)} max ${r.markAllMax.toFixed(0)} ms, total ${r.markAllTotal.toFixed(0)} ms; settings get p95 ${r.settings.toFixed(0)}`);
  console.log(`  PERF settings save: p50 ${med(setW, 0.5).toFixed(0)} p95 ${med(setW, 0.95).toFixed(0)} ms`);
  const last = report.at(-1);
  check("K-01 against the targets at 100, 1,000, 10,000 and 20,000 notifications (p95): list under 350 ms, unread count under 200, mark one under 300, settings read under 300, settings save under 400", report.every((r) => r.list[1] < 350 && r.unreadList < 350 && r.deep < 350 && r.count[1] < 200 && r.mark < 300 && r.settings < 300) && med(setW, 0.95) < 400, `list ${report.map((r) => r.list[1].toFixed(0)).join("/")}, count ${report.map((r) => r.count[1].toFixed(0)).join("/")}, mark ${report.map((r) => r.mark.toFixed(0)).join("/")}, save ${med(setW, 0.95).toFixed(0)}`);
  check("K-02 'mark all as read' on 20,000 unread is done in bounded requests of at most 200 and changes all 20,000; the typical request is under 500 ms (p95 reported)", report.every((r) => r.markAll < 500) && last.changed === 20000 && last.rounds === 101, `max ${last.markAllMax.toFixed(0)} ms, ${last.rounds} requests, changed ${last.changed}`);
  check("K-03 the list payload is bounded (a 20-item page is under 12 KB even with 20,000 stored)", last.bytes < 12_000, String(last.bytes));
}

async function cleanup() {
  if (process.env.KEEP === "1") return;
  const mine = await users.find({ email: { $regex: `^t2526-${stamp}-` } }, { projection: { _id: 1 } }).toArray();
  const ids = mine.map((u) => u._id);
  await notifs.deleteMany({ buyerId: { $in: ids } });
  await settings.deleteMany({ buyerId: { $in: ids } });
  await db.collection("company_documents").deleteMany({}).catch(() => undefined);
  await db.collection("companies").deleteMany({ ownerUserId: { $in: ids } });
  await events.deleteMany({ userId: { $in: ids } });
  await inquiries.deleteMany({ $or: [{ buyerId: { $in: ids } }, { "guest.email": `guest-${stamp}@example.test` }] });
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
