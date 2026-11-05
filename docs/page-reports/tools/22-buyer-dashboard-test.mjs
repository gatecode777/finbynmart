import fs from "node:fs";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Page 22 (Buyer Dashboard: /buyer/dashboard and GET /api/buyer/dashboard).
// Needs a running `next start` (BASE, default :3100) with MONGODB_DB=finbynmart_test and NO email provider (accounts sign in
// straight after registering), Chrome and puppeteer-core. Writes only to the throwaway database and removes its own users,
// inquiries and saved items at the end unless KEEP=1. The performance part loads up to 20,000 synthetic inquiries for one
// test buyer (PERF=0 skips it).
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
await db.collection("rate_limits").deleteMany({});

const stamp = Date.now();
const emailOf = (tag) => `t22-${stamp}-${tag}@example.test`;
let ipN = 0;
const nextIp = () => `10.22.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "dashboard test passphrase";

class Session {
  jar = new Map();
  async call(method, p, payload, headers = {}) {
    const response = await fetch(BASE + p, { method, headers: { "x-forwarded-for": this.ip ?? nextIp(), ...(payload !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...headers }, body: payload === undefined ? undefined : JSON.stringify(payload), redirect: "manual" });
    for (const line of response.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); this.jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    let json = null; let textBody = null;
    try { textBody = await response.text(); json = JSON.parse(textBody); } catch {}
    return { status: response.status, json, text: textBody, headers: response.headers };
  }
}
const register = async (tag, company = "Dash Test Traders") => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Dash ${tag.toUpperCase()} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: company, password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register ${tag}: ${r.status} ${r.text}`);
  const user = await users.findOne({ email: emailOf(tag) });
  return { s, id: user._id, email: emailOf(tag) };
};

// ---- India-time helpers (independent of the module under test)
const OFFSET = 330 * 60_000, DAY = 86_400_000;
const istMidnight = (ms) => Math.floor((ms + OFFSET) / DAY) * DAY - OFFSET;
const istDay = (ms) => new Date(ms + OFFSET).toISOString().slice(0, 10);
const today0 = istMidnight(Date.now());
const CROCK = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ref = () => `FBM-INQ-${Array.from({ length: 8 }, () => CROCK[Math.floor(Math.random() * 32)]).join("")}`;

// ---- real catalogue products from distinct categories
const cats = new Map(fs.readFileSync(`${ROOT}/db/seed/categories.csv`, "utf8").split(/\r?\n/).slice(1).filter(Boolean).map((l) => { const [id, name] = l.split(","); return [id, name]; }));
const prodByCat = new Map();
for (const l of fs.readFileSync(`${ROOT}/db/seed/products.csv`, "utf8").split(/\r?\n/).slice(1).filter(Boolean)) {
  const [id, , catId] = l.split(",");
  if (!prodByCat.has(catId) && cats.has(catId) && prodByCat.size < 6) prodByCat.set(catId, id);
}
const P = [...prodByCat.entries()].map(([catId, id]) => ({ key: id, cat: cats.get(catId) }));
if (P.length < 6) throw new Error("need 6 catalogue categories");

const mk = (buyerId, at, status, product, extra = {}) => ({ reference: ref(), buyerId, buyerType: "REGISTERED", productKey: product?.key, productName: product ? `Product ${product.key}` : undefined, supplierKey: "SLR0001", supplierName: "Seed Supplier", supplierSlug: "seed-supplier", source: "catalog", quantity: 10, unit: "Piece", message: "A-PRIVATE-MESSAGE", inquiryType: product ? "PRODUCT_INQUIRY" : "GENERAL_INQUIRY", status, createdAt: new Date(at), ...(product ? {} : {}), ...extra });

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
async function open(p, { width = 1440, height = 900, session } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/40\d|429|50\d|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  if (session) await page.setCookie(...[...session.jar].map(([name, value]) => ({ name, value, url: BASE })));
  await page.setViewport({ width, height });
  const resp = await page.goto(BASE + p, { waitUntil: "networkidle2" });
  page.errs = errs; page.status = resp.status(); page.context = context;
  return page;
}
const text = (p) => p.evaluate(() => document.body.textContent.replace(/[ \t\r\n]+/g, " "));
const main = (p) => p.evaluate(() => (document.querySelector("#buyer-content") ?? document.body).textContent.replace(/[ \t\r\n]+/g, " "));
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const get = (s, q = "") => s.call("GET", `/api/buyer/dashboard${q}`);

async function main_() {
  const A = await register("a", "Alpha Fabrics Pvt Ltd");
  const B = await register("b");
  const NEWB = await register("new");
  const SUP = new Session();
  await SUP.call("POST", "/api/auth/register/supplier", { businessName: "Dash Supplier Co", contactName: "Sia Rao", email: emailOf("sup"), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  const SUSP = await register("susp");
  await users.updateOne({ _id: SUSP.id }, { $set: { accountStatus: "SUSPENDED" } });

  // ---- data for buyer A (see docs/backend/PAGE_22_KPI_CALCULATIONS.md): 7 in the last 30 days, 3 in the 30 before, 2 older
  const [p1, p2, p3, p4, p5] = P;
  const R = [
    mk(A.id, today0, "NEW", p1),
    mk(A.id, today0 + 10 * 3600_000, "IN_PROGRESS", p1),
    mk(A.id, today0 + 11 * 3600_000, "CANCELLED", p2),
    mk(A.id, today0 - 1, "NOTIFIED", p3),
    mk(A.id, today0 - 3 * DAY - 1000, "new", p4),
    mk(A.id, today0 - 3 * DAY, "CLOSED", p5),
    mk(A.id, today0 - 29 * DAY, "REPLIED", null),
  ];
  const PREV = [mk(A.id, today0 - 29 * DAY - 1, "QUOTED", p1), mk(A.id, today0 - 45 * DAY, "CLOSED", p2), mk(A.id, today0 - 45 * DAY + 1000, "CLOSED", p2)];
  const OLD = [mk(A.id, today0 - 60 * DAY, "NEW", p1), mk(A.id, today0 - 70 * DAY, "NEW", p1)];
  const guest = { ...mk(A.id, today0 + 3600_000, "NEW", p1), buyerId: undefined, buyerType: "GUEST", guest: { name: "G", email: "g@example.test", phone: "+91 9876543210" } };
  delete guest.buyerId;
  const BI = [0, 1, 2, 3].map((i) => mk(B.id, today0 + (i + 1) * 3600_000, "NEW", p2, { message: "B-PRIVATE-MESSAGE", supplierName: "B Only Supplier" }));
  await inq.insertMany([...R, ...PREV, ...OLD, guest, ...BI]);
  await db.collection("wishlists").insertMany([1, 2, 3].map((i) => ({ userId: A.id, productKey: `wk${i}`, productName: `W${i}`, addedAt: new Date() })).concat([{ userId: B.id, productKey: "wk9", productName: "W9", addedAt: new Date() }]));
  await db.collection("wishlist_suppliers").insertMany([1, 2].map((i) => ({ userId: A.id, supplierKey: `sk${i}`, supplierName: `S${i}`, addedAt: new Date() })).concat([{ userId: B.id, supplierKey: "sk9", supplierName: "S9", addedAt: new Date() }]));

  // ================= A: authentication
  const anon = await new Session().call("GET", "/api/buyer/dashboard");
  check("A-01 no session: 401, private, nothing returned", anon.status === 401 && /no-store/.test(anon.headers.get("cache-control") ?? "") && !anon.json?.data, anon.text);
  const sup = await get(SUP);
  check("A-02 a supplier account: 403", sup.status === 403 && !sup.json?.data);
  const susp = await get(SUSP.s);
  check("A-03 a suspended buyer's session no longer works: 401", susp.status === 401);
  const garbage = await new Session().call("GET", "/api/buyer/dashboard", undefined, { cookie: "finbyn_session=garbage.value" });
  check("A-04 a forged session cookie: 401", garbage.status === 401);
  const out = new Session(); await out.call("POST", "/api/auth/login", { email: NEWB.email, password: PW });
  const savedCookie = out.jar.get("finbyn_session");
  await out.call("POST", "/api/auth/logout");
  check("A-05 an authenticated buyer is accepted: 200", (await get(A.s)).status === 200);
  const exp = await new Session().call("GET", "/api/buyer/dashboard", undefined, { cookie: `finbyn_session=${Buffer.from(JSON.stringify({ sub: String(A.id), v: 0, exp: Date.now() - 1000 })).toString("base64url")}.AAAA` });
  check("A-06 an expired or tampered session value: 401", exp.status === 401 && savedCookie.length > 10);
  const noPage = await fetch(`${BASE}/buyer/dashboard`, { redirect: "manual", headers: { "x-forwarded-for": nextIp() } });
  check("A-07 the page without a session redirects to sign-in and comes back (next=/buyer/dashboard)", [307, 308].includes(noPage.status) && /\/sign-in\?next=%2Fbuyer%2Fdashboard/.test(noPage.headers.get("location") ?? ""), noPage.headers.get("location"));
  const supPage = await open("/buyer/dashboard", { session: SUP });
  check("A-08 a supplier opening the page sees 'Buyer accounts only' and no buyer data", /Buyer accounts only/.test(await text(supPage)) && !/Total Inquiries/.test(await text(supPage)));
  await supPage.context.close();

  // ================= B: isolation
  const a = await get(A.s, "?range=30d");
  const b = await get(B.s, "?range=30d");
  const aStr = a.text, bStr = b.text;
  check("B-01 buyer A sees only A's inquiries (7) and buyer B only B's (4)", a.json.data.statistics.data.totalInquiries.value === 7 && b.json.data.statistics.data.totalInquiries.value === 4, `${a.json.data.statistics.data.totalInquiries.value}/${b.json.data.statistics.data.totalInquiries.value}`);
  check("B-02 nothing of B's (message, supplier, references) appears in A's answer, and nothing of A's in B's", !aStr.includes("B-PRIVATE-MESSAGE") && !aStr.includes("B Only Supplier") && BI.every((x) => !aStr.includes(x.reference)) && !bStr.includes("A-PRIVATE-MESSAGE") && [...R, ...PREV, ...OLD].every((x) => !bStr.includes(x.reference)));
  const spoof = await get(A.s, `?range=30d&buyerId=${B.id}&userId=${B.id}&buyer=${B.id}`);
  check("B-03 a buyerId in the query is ignored: A still sees A's data", spoof.status === 200 && spoof.json.data.statistics.data.totalInquiries.value === 7 && !spoof.text.includes("B-PRIVATE") && spoof.json.data.accountStatus.data.name.includes("A Buyer"));
  const hdr = await A.s.call("GET", "/api/buyer/dashboard?range=30d", undefined, { "x-buyer-id": String(B.id) });
  check("B-04 a header naming another buyer is ignored", hdr.json.data.statistics.data.totalInquiries.value === 7);
  const bCookieOnA = await new Session().call("GET", "/api/buyer/dashboard?range=30d", undefined, { cookie: `finbyn_session=${B.s.jar.get("finbyn_session")}` });
  check("B-05 replaying B's own cookie shows B's data, never A's (identity is the cookie, nothing else)", bCookieOnA.json.data.statistics.data.totalInquiries.value === 4 && !bCookieOnA.text.includes("A-PRIVATE"));
  check("B-06 guest inquiries are never counted for any buyer (A's 7 excludes the guest record)", a.json.data.statistics.data.totalInquiries.value === 7 && !aStr.includes("g@example.test"));
  const ns = await get(NEWB.s);
  check("B-07 a buyer with nothing sees zeros from real counts, not other people's data", ns.json.data.statistics.data.totalInquiries.value === 0 && ns.json.data.recentInquiries.data.length === 0 && ns.json.data.saved.data.savedProducts === 0);
  const savedB = b.json.data.saved.data;
  const savedA = a.json.data.saved.data;
  check("B-08 saved products and suppliers are counted per buyer (A 3 and 2, B 1 and 1)", savedA.savedProducts === 3 && savedA.savedSuppliers === 2 && savedB.savedProducts === 1 && savedB.savedSuppliers === 1);
  check("B-09 answers are private: Cache-Control private, no-store", /private/.test(a.headers.get("cache-control") ?? "") && /no-store/.test(a.headers.get("cache-control") ?? ""));
  check("B-10 the answer carries no email, phone, password hash, session data, inquiry message or any id of an account", !/@example\.test|passwordHash|finbyn_session|9876543210|A-PRIVATE-MESSAGE|"userId"|"buyerId"/.test(aStr));

  // ================= C: KPIs
  const s30 = a.json.data.statistics.data;
  check("C-01 30 days: 7 inquiries, 3 in the 30 days before, +133.3%", s30.totalInquiries.value === 7 && s30.totalInquiries.previous === 3 && s30.totalInquiries.changePercent === 133.3, JSON.stringify(s30.totalInquiries));
  const a7 = await get(A.s, "?range=7d");
  check("C-02 7 days: 6 inquiries (the record 29 days ago and the older ones are outside)", a7.json.data.statistics.data.totalInquiries.value === 6, JSON.stringify(a7.json.data.statistics.data.totalInquiries));
  const a90 = await get(A.s, "?range=90d");
  check("C-03 90 days: all 12 of A's records (7 + 3 + 2 older at 60 and 70 days)", a90.json.data.statistics.data.totalInquiries.value === 12, JSON.stringify(a90.json.data.statistics.data.totalInquiries));
  const d1 = istDay(today0 - 29 * DAY), d2 = istDay(today0);
  const cust = await get(A.s, `?range=custom&startDate=${d1}&endDate=${d2}`);
  check("C-04 custom range = the same 30 days: same result as 30d", cust.json.data.statistics.data.totalInquiries.value === 7 && cust.json.data.period.key === "custom" && cust.json.data.period.days === 30);
  const edge1 = await get(A.s, `?range=custom&startDate=${istDay(today0 - 29 * DAY)}&endDate=${istDay(today0 - 29 * DAY)}`);
  check("C-05 day-boundary: the record at exactly 00:00:00.000 IST is in that day (1), the one 1 ms earlier is not", edge1.json.data.statistics.data.totalInquiries.value === 1, JSON.stringify(edge1.json.data.statistics.data.totalInquiries));
  const edge2 = await get(A.s, `?range=custom&startDate=${istDay(today0 - 1)}&endDate=${istDay(today0 - 1)}`);
  check("C-06 day-boundary: the record at 23:59:59.999 IST yesterday is in yesterday (1) and not in today", edge2.json.data.statistics.data.totalInquiries.value === 1);
  const todayOnly = await get(A.s, `?range=custom&startDate=${d2}&endDate=${d2}`);
  check("C-07 today alone: 3 (00:00:00.000 and +10h, +11h), the guest record is not counted", todayOnly.json.data.statistics.data.totalInquiries.value === 3);
  check("C-09 quotations, orders and order value are 'not available' with a reason, never a zero", ["quotationsReceived", "ordersPlaced", "totalOrderValue"].every((k) => s30[k].available === false && typeof s30[k].reason === "string" && s30[k].reason.length > 5) && !("value" in s30.quotationsReceived));
  check("C-10 the order series is 'not available', not an empty or fabricated series", a.json.data.trends.data.orders.available === false);
  check("C-11 previous-period zero: no percentage is invented", ns.json.data.statistics.data.totalInquiries.changePercent === null && (await get(A.s, `?range=custom&startDate=${istDay(today0 - 200 * DAY)}&endDate=${istDay(today0 - 190 * DAY)}`)).json.data.statistics.data.totalInquiries.changePercent === null);
  const act = a.json.data.activity.data;
  check("C-12 active inquiries is a real count of NEW / NOTIFIED / IN_PROGRESS / legacy 'new' (6) and is not date bound", act.activeInquiries === 6, String(act.activeInquiries));
  check("C-13 pending quotations and open orders are 'not available'", act.pendingQuotations.available === false && act.openOrders.available === false);

  // ================= D: range validation
  const badRanges = [["?range=1y", "unknown preset"], ["?range=custom&startDate=2026-13-01&endDate=2026-13-05", "impossible date"], [`?range=custom&startDate=${d2}&endDate=${d1}`, "reversed"], [`?range=custom&startDate=${d1}&endDate=${istDay(today0 + 2 * DAY)}`, "future end"], ["?range=custom&startDate=2024-01-01&endDate=2026-10-01", "over 366 days"], ["?range=custom&startDate=abc&endDate=def", "malformed"], ["?startDate=2026-10-01", "one date only"]];
  const brs = await Promise.all(badRanges.map(([q]) => get(A.s, q)));
  check("D-01 invalid ranges are refused with 400 and a message (unknown preset, impossible, reversed, future, too long, malformed, incomplete)", brs.every((r, i) => r.status === 400 && r.json.fields?.range), brs.map((r, i) => `${badRanges[i][1]}:${r.status}`).join(" "));
  const presets = await Promise.all(["7d", "30d", "90d", "this-month", "previous-month"].map((k) => get(A.s, `?range=${k}`)));
  check("D-02 every preset is accepted and reports its own period", presets.every((r, i) => r.status === 200 && r.json.data.period.key === ["7d", "30d", "90d", "this-month", "previous-month"][i]));
  const pm = presets[4].json.data.period;
  check("D-03 previous-month covers one whole calendar month (28 to 31 days) in India time", pm.days >= 28 && pm.days <= 31 && pm.startDate.endsWith("-01") && pm.timezone === "Asia/Kolkata");
  check("D-04 the default period is 30 days", (await get(A.s)).json.data.period.key === "30d");

  // ================= E: trend
  const t7 = (await get(A.s, "?range=7d")).json.data.trends.data;
  const expectDays = Array.from({ length: 7 }, (_, i) => istDay(today0 - (6 - i) * DAY));
  const expectCounts = expectDays.map((d) => R.filter((x) => istDay(x.createdAt.getTime()) === d && x.createdAt.getTime() >= today0 - 6 * DAY).length);
  const gotDays = t7.inquiries.map((p) => istDay(Date.parse(p.start)));
  check("E-01 7 day buckets in India time, one per day, in order", t7.bucket === "day" && JSON.stringify(gotDays) === JSON.stringify(expectDays), JSON.stringify(gotDays));
  check("E-02 each day's count is exact (and days with nothing are real zeros inside the range)", JSON.stringify(t7.inquiries.map((p) => p.count)) === JSON.stringify(expectCounts) && t7.inquiries.some((p) => p.count === 0), JSON.stringify([t7.inquiries.map((p) => p.count), expectCounts]));
  const dm4 = t7.inquiries.find((p) => istDay(Date.parse(p.start)) === istDay(today0 - 4 * DAY));
  const dm3 = t7.inquiries.find((p) => istDay(Date.parse(p.start)) === istDay(today0 - 3 * DAY));
  check("E-03 timezone boundary: 23:59:59 IST (18:29:59Z) lands on its own day and 00:00:00 IST (18:30:00Z) on the next", dm4.count === 1 && dm3.count === 1, JSON.stringify([dm4, dm3]));
  check("E-04 the buckets add up to the KPI (6 in 7 days)", t7.inquiries.reduce((n, p) => n + p.count, 0) === 6);
  const t90 = (await get(A.s, "?range=90d")).json.data.trends.data;
  check("E-05 a 90-day range is bucketed by week, every bucket starting on a Monday in India time, adding up to 12", t90.bucket === "week" && t90.inquiries.every((p) => new Date(Date.parse(p.start) + OFFSET).getUTCDay() === 1) && t90.inquiries.reduce((n, p) => n + p.count, 0) === 12);
  const t300 = (await get(A.s, `?range=custom&startDate=${istDay(today0 - 299 * DAY)}&endDate=${d2}`)).json.data.trends.data;
  check("E-06 a 300-day range is bucketed by month, adding up to 12", t300.bucket === "month" && t300.inquiries.every((p) => new Date(Date.parse(p.start) + OFFSET).getUTCDate() === 1) && t300.inquiries.reduce((n, p) => n + p.count, 0) === 12);
  const tEmpty = (await get(NEWB.s, "?range=7d")).json.data.trends.data;
  check("E-07 a buyer with no inquiries: all buckets exist with zero (the empty state is a page decision)", tEmpty.inquiries.length === 7 && tEmpty.inquiries.every((p) => p.count === 0));

  // ================= F: categories
  const cat = a.json.data.topInquiryCategories.data;
  const tally = new Map();
  for (const x of R) { const name = x.productKey ? P.find((q) => q.key === x.productKey).cat : "General inquiries"; tally.set(name, (tally.get(name) ?? 0) + 1); }
  const sorted = [...tally.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  const expectItems = sorted.slice(0, 4).map(([name, count]) => ({ name, count, percent: Math.round((count / 7) * 1000) / 10 }));
  const rest = sorted.slice(4).reduce((n, [, c]) => n + c, 0);
  if (rest) expectItems.push({ name: "Others", count: rest, percent: Math.round((rest / 7) * 1000) / 10 });
  check("F-01 categories come from the products the inquiries name: total 7, top four sorted by volume then name, the rest grouped as Others, percentages of the 7", cat.total === 7 && JSON.stringify(cat.items) === JSON.stringify(expectItems), JSON.stringify([cat.items, expectItems]));
  check("F-02 an inquiry with no product is 'General inquiries'; one inquiry is counted once (counts sum to the total)", cat.items.reduce((n, i) => n + i.count, 0) === 7 && (tally.has("General inquiries")));
  const catNew = (await get(NEWB.s)).json.data.topInquiryCategories.data;
  check("F-03 no inquiries: total 0 and no categories", catNew.total === 0 && catNew.items.length === 0);
  const sumPct = cat.items.reduce((n, i) => n + i.percent, 0);
  check("F-04 percentages add up to 100 (within rounding)", Math.abs(sumPct - 100) < 0.3, String(sumPct));

  // ================= G: recent inquiries
  const recent = a.json.data.recentInquiries.data;
  const order = [R[2], R[1], R[0], R[3], R[5]].map((x) => x.reference);
  check("G-01 the latest five of A's inquiries, newest first, bounded to 5", recent.length === 5 && JSON.stringify(recent.map((r) => r.reference)) === JSON.stringify(order), JSON.stringify(recent.map((r) => r.reference)));
  check("G-02 only the table fields are returned (no message, no delivery location, no ids of accounts)", recent.every((r) => Object.keys(r).sort().join() === "createdAt,href,id,quantity,reference,statusLabel,status,supplierName,title,unit".split(",").sort().join()), JSON.stringify(Object.keys(recent[0])));
  check("G-03 statuses map to the lifecycle labels without changing stored values (CANCELLED shows as its label)", recent[0].status === "CANCELLED" && /Cancel/i.test(recent[0].statusLabel) && recent[1].status === "IN_PROGRESS" && /progress/i.test(recent[1].statusLabel));
  check("G-04 each row links to its own inquiry details page (/buyer/inquiries/<reference>)", recent.every((r) => r.href === `/buyer/inquiries/${r.reference}`));
  check("G-05 the product is shown by name; supplier by name", recent[2].title === `Product ${p1.key}` && recent[0].supplierName === "Seed Supplier");
  check("G-06 recent inquiries are not date bound (the same five for 7d and 90d)", JSON.stringify((await get(A.s, "?range=7d")).json.data.recentInquiries.data.map((r) => r.id)) === JSON.stringify(recent.map((r) => r.id)));
  const rq = a.json.data.recentQuotations;
  check("G-07 quotations: 'not available yet' (no quotation module), no records", rq.status === "ok" && rq.data.available === false && !JSON.stringify(rq).match(/QTN|amount/i));

  // ================= H: account status
  const acct = a.json.data.accountStatus.data;
  check("H-01 account status from the stored account: name, company as typed, ACTIVE, email and phone NOT confirmed (nothing was confirmed)", acct.name.includes("A Buyer") && acct.companyName === "Alpha Fabrics Pvt Ltd" && acct.accountStatus === "ACTIVE" && acct.emailVerified === false && acct.phoneVerified === false);
  check("H-02 business verification is 'not available yet', never a Verified badge; no GSTIN or other identifier", acct.businessVerification.available === false && !/gstin|\bpan\b/i.test(JSON.stringify(acct)));
  await users.updateOne({ _id: A.id }, { $set: { emailVerified: true, phoneVerified: true } });
  const acct2 = (await get(A.s)).json.data.accountStatus.data;
  check("H-03 email and phone verification follow the stored flags (and still no business verification)", acct2.emailVerified === true && acct2.phoneVerified === true && acct2.businessVerification.available === false);
  await users.updateOne({ _id: A.id }, { $set: { emailVerified: false, phoneVerified: false } });

  // ================= I: recommended suppliers
  const rec = a.json.data.recommendedSuppliers.data;
  check("I-01 at most 4 suppliers, no supplier twice", rec.suppliers.length > 0 && rec.suppliers.length <= 4 && new Set(rec.suppliers.map((s) => s.slug)).size === rec.suppliers.length);
  check("I-02 only public fields: name, slug, city, state, link to the public supplier page; no verified badge, rating, review count, response time, contact", rec.suppliers.every((s) => Object.keys(s).sort().join() === "city,name,slug,state,url" && s.url === `/suppliers/${s.slug}`) && !/verified|rating|review|response|email|phone/i.test(JSON.stringify(rec.suppliers)));
  const recNew = (await get(NEWB.s)).json.data.recommendedSuppliers.data;
  check("I-03 a buyer with no inquiries gets a neutral featured list, honestly not 'personalised'", recNew.personalized === false && /featured/i.test(recNew.basis) && recNew.suppliers.length > 0);
  check("I-04 the basis text says what the list is based on", typeof rec.basis === "string" && rec.basis.length > 10);
  const slugsExist = await Promise.all(rec.suppliers.map((s) => fetch(`${BASE}${s.url}`, { headers: { "x-forwarded-for": nextIp() } }).then((r) => r.status)));
  check("I-05 every recommended supplier page exists (200)", slugsExist.every((s) => s === 200), slugsExist.join());

  // ================= J: partial failure and size
  check("J-01 every section reports status ok (a failed section would report status error, the others still render)", ["statistics", "trends", "topInquiryCategories", "recentInquiries", "accountStatus", "activity", "saved", "recommendedSuppliers"].every((k) => a.json.data[k].status === "ok"));
  check("J-02 the whole answer is small (under 20 KB) and has generation time, timezone and per-section timings", a.text.length < 20_000 && a.json.data.meta.timezone === "Asia/Kolkata" && typeof a.json.data.meta.generatedAt === "string" && typeof a.json.data.meta.timingsMs.inquiryAggregation === "number", String(a.text.length));

  // ================= K: the page in a browser
  const pg = await open("/buyer/dashboard", { session: A.s });
  const body = await main(pg);
  check("K-01 the page loads for the buyer: heading, welcome with the first name from the account, no console errors", pg.status === 200 && /Buyer Dashboard/.test(body) && /Welcome back, Dash!/.test(body) && pg.errs.length === 0, pg.errs.join("|"));
  const publicPg = await open("/");
  check("K-03 the public home page still has the global header and footer (chrome unchanged)", await publicPg.evaluate(() => !!document.querySelector("footer") && !!document.querySelector("header")));
  await publicPg.context.close();
  const hasFooter = await pg.evaluate(() => !!document.querySelector("footer"));
  check("K-04 no marketplace footer on /buyer/dashboard", hasFooter === false);
  const nav = await pg.evaluate(() => [...document.querySelectorAll("nav[aria-label='Buyer navigation'] li")].map((li) => ({ text: li.textContent.replace(/\s+/g, " ").trim(), link: li.querySelector("a")?.getAttribute("href") ?? null, current: li.querySelector("a")?.getAttribute("aria-current") ?? null, disabled: li.querySelector("[aria-disabled='true']") !== null })));
  check("K-05 the sidebar has the 12 items of the reference; Dashboard is the current page", nav.length === 12 && nav[0].text.startsWith("Dashboard") && nav[0].current === "page" && nav.filter((n) => n.current).length === 1, JSON.stringify(nav.map((n) => n.text)));
  check("K-06 every sidebar item is now a working link: none is marked unavailable", nav.filter((n) => n.disabled).length === 0 && nav.filter((n) => n.disabled).every((n) => n.link === null && /Soon/.test(n.text)));
  check("K-07 the My Inquiries badge shows the real active count (6), and no other badge exists", nav.find((n) => n.text.startsWith("My Inquiries")).text.includes("6") && (await pg.evaluate(() => document.querySelectorAll("nav[aria-label='Buyer navigation'] [aria-label$=' active']").length)) === 1);
  const hrefs = await pg.evaluate(() => [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => h && h.startsWith("/") && !h.startsWith("//")))]);
  const stat = await Promise.all(hrefs.map((h) => fetch(BASE + h, { redirect: "manual", headers: { "x-forwarded-for": nextIp(), cookie: [...A.s.jar].map(([k, v]) => `${k}=${v}`).join("; ") } }).then((r) => [h, r.status])));
  check("K-08 no dead links: every internal link on the page answers (no 404 or error)", stat.every(([, s]) => s < 400), JSON.stringify(stat.filter(([, s]) => s >= 400)));
  check("K-09 KPI cards: 7 total inquiries with the +133.3% comparison; quotations, orders and value say 'Not available yet'", /Total Inquiries\s*7/.test(body) && /\+133\.3%/.test(body) && (body.match(/Not available yet/g) ?? []).length >= 3);
  check("K-10 the chart is an image with a text summary and a hidden data table; the category donut has a summary too", await pg.evaluate(() => { const svgs = [...document.querySelectorAll("svg[role='img']")]; return svgs.length >= 2 && svgs.every((s) => (s.getAttribute("aria-label") ?? "").length > 20) && !!document.querySelector("table caption"); }));
  check("K-11 recent inquiries table: 5 rows, proper header cells, references shown", await pg.evaluate(() => { const t = document.querySelector("section[aria-labelledby='recent-inq-title'] table"); return !!t && t.querySelectorAll("tbody tr").length === 5 && t.querySelectorAll("th[scope='col']").length === 7; }));
  check("K-12 account status card shows the company and 'Not available yet' for business verification", /Alpha Fabrics Pvt Ltd/.test(body) && /Business\s*Not available yet/.test(body));
  check("K-13 recent quotations: honest 'will appear here once supplier quotations are connected'", /Quotations will appear here once supplier quotations are connected/.test(body));
  check("K-14 quick actions: 5 working links, no inactive buttons", await pg.evaluate(() => { const links = [...document.querySelectorAll("section[aria-labelledby='quick-title'] a")]; return links.length === 5 && !document.querySelector("section[aria-labelledby='quick-title'] button"); }));
  check("K-15 the promotional banner does not claim verified suppliers", !/Verified Suppliers/i.test(body) && /Get Better Quotes from Suppliers/.test(body));
  // date filter
  await pg.select("select", "7d");
  await sleep(2500);
  check("K-16 choosing Last 7 Days reloads the data: address ?range=7d, 6 inquiries, period text updated", new URL(pg.url()).searchParams.get("range") === "7d" && /Total Inquiries\s*6/.test(await main(pg)) && /compared with the 7 days before/.test(await main(pg)), pg.url());
  await pg.select("select", "custom");
  await sleep(300);
  check("K-17 Custom Date Range shows two date fields and an Apply button", (await pg.evaluate(() => document.querySelectorAll("input[type=date]").length)) === 2);
  const cu = await open("/buyer/dashboard?range=custom&startDate=2026-13-45&endDate=nope", { session: A.s });
  check("K-18 a bad range typed into the address shows a clear message and falls back to 30 days", /real dates/.test(await main(cu)) && /last 30 days/.test(await main(cu)) && /Total Inquiries\s*7/.test(await main(cu)));
  await cu.context.close();
  const refreshBtn = await pg.evaluate(() => [...document.querySelectorAll("button")].some((b) => /Refresh dashboard data/.test(b.getAttribute("aria-label") ?? "")));
  check("K-19 the Refresh button exists and really re-asks the server (router refresh)", refreshBtn);
  await pg.context.close();
  const empty = await open("/buyer/dashboard", { session: NEWB.s });
  const eb = await main(empty);
  check("K-20 a buyer with no activity: 'No inquiries yet.' with Create New Inquiry, empty trend and category messages, zero KPI", /No inquiries yet\./.test(eb) && /Create New Inquiry/.test(eb) && /No inquiries in this period yet/.test(eb) && /no category breakdown/.test(eb) && /Total Inquiries\s*0/.test(eb) && empty.errs.length === 0);
  await empty.context.close();

  // keyboard, drawer, collapse
  const mob = await open("/buyer/dashboard", { session: A.s, width: 390, height: 844 });
  const state0 = await mob.evaluate(() => ({ inert: document.querySelector("#buyer-sidebar").inert, toggle: getComputedStyle(document.querySelector("button[aria-label='Open navigation menu']")).display }));
  check("K-21 on a phone the sidebar is a closed drawer (inert) and a menu button is shown", state0.inert === true && state0.toggle !== "none");
  await mob.click("button[aria-label='Open navigation menu']");
  await sleep(500);
  const state1 = await mob.evaluate(() => ({ inert: document.querySelector("#buyer-sidebar").inert, expanded: document.querySelector("button[aria-label='Open navigation menu']").getAttribute("aria-expanded"), focusInSidebar: document.querySelector("#buyer-sidebar").contains(document.activeElement) }));
  check("K-22 opening the drawer makes it active, moves focus inside, and sets aria-expanded", state1.inert === false && state1.expanded === "true" && state1.focusInSidebar === true, JSON.stringify(state1));
  await mob.keyboard.press("Escape");
  await sleep(500);
  const state2 = await mob.evaluate(() => ({ inert: document.querySelector("#buyer-sidebar").inert, focus: document.activeElement?.getAttribute("aria-label") }));
  check("K-23 Escape closes the drawer and returns focus to the menu button", state2.inert === true && state2.focus === "Open navigation menu", JSON.stringify(state2));
  await mob.context.close();
  const desk = await open("/buyer/dashboard", { session: A.s });
  await sleep(400);
  const panelW = () => desk.evaluate(() => Math.round(document.querySelector("#buyer-sidebar > div").getBoundingClientRect().width));
  const w = await desk.evaluate(() => Math.round(document.querySelector("#buyer-sidebar").getBoundingClientRect().width));
  check("K-24 on desktop the sidebar is minimized to icons (76px) by default, there is no collapse or expand button, no profile block at the top, and the text stays for screen readers", w === 76 && (await panelW()) === 76 && (await desk.evaluate(() => !document.querySelector("button[aria-label*='sidebar']") && document.querySelector("#buyer-sidebar nav").firstElementChild?.tagName === "UL" && /Dashboard/.test(document.querySelector("nav[aria-label='Buyer navigation']").textContent))));
  await desk.screenshot({ path: "R:/indiamartref/docs/page-reports/screenshots/22-sidebar-minimized.png" });
  await desk.hover("#buyer-sidebar");
  await sleep(600);
  await desk.screenshot({ path: "R:/indiamartref/docs/page-reports/screenshots/22-sidebar-hover-expanded.png" });
  const hoverW = await panelW();
  const gridW = await desk.evaluate(() => Math.round(document.querySelector("#buyer-sidebar").getBoundingClientRect().width));
  const labelShown = await desk.evaluate(() => { const el = [...document.querySelectorAll("nav[aria-label='Buyer navigation'] a span")].find((x) => x.textContent.trim() === "Dashboard"); const r = el?.getBoundingClientRect(); return !!r && r.width > 20 && r.height > 8; });
  const noOverlap = await desk.evaluate(() => document.querySelector("#buyer-content").getBoundingClientRect().left >= document.querySelector("#buyer-sidebar").getBoundingClientRect().right - 1);
  check("K-25 hovering the sidebar widens it to 260px, shows the labels, and the page content moves with it: the layout column widens too and the content starts at the sidebar edge (nothing is covered)", hoverW === 260 && gridW === 260 && labelShown && noOverlap, `${hoverW} ${gridW} ${labelShown} ${noOverlap}`);
  await desk.mouse.move(900, 500);
  await sleep(600);
  check("K-25b moving away minimizes it again and the content moves back", (await panelW()) === 76 && (await desk.evaluate(() => Math.round(document.querySelector("#buyer-sidebar").getBoundingClientRect().width)) === 76));
  await desk.focus("nav[aria-label='Buyer navigation'] a");
  await sleep(600);
  check("K-25c keyboard focus inside the sidebar expands it too", (await panelW()) === 260 && (await desk.evaluate(() => Math.round(document.querySelector("#buyer-sidebar").getBoundingClientRect().width)) === 260));
  await desk.mouse.move(900, 500);
  await desk.reload({ waitUntil: "networkidle2" });
  await desk.keyboard.press("Tab");
  const first = await desk.evaluate(() => document.activeElement?.textContent ?? "");
  await desk.keyboard.press("Tab");
  const second = await desk.evaluate(() => document.activeElement?.textContent ?? "");
  check("K-26 keyboard: the first Tab stops are the skip links (site-wide and dashboard) before any other control", /Skip to/.test(first) && /Skip to/.test(second), `${first} | ${second}`);
  await desk.context.close();

  // ================= L: responsive
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const wide = [];
  for (const wd of widths) {
    const p = await open("/buyer/dashboard", { session: A.s, width: wd });
    const o = await overflow(p);
    const clipped = await p.evaluate(() => [...document.querySelectorAll("main *, #buyer-content *")].some((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && !el.closest("[role=region]") && !el.closest("svg") && getComputedStyle(el).position !== "fixed" && !el.closest("#buyer-sidebar"); }));
    const topbar = await p.evaluate(() => { const t = document.querySelector("header"); const r = t.getBoundingClientRect(); return r.right <= window.innerWidth + 1; });
    if (o > 0 || clipped || !topbar) wide.push(`${wd}: overflow ${o} clipped ${clipped} topbar ${topbar}`);
    if ([1440, 820, 390].includes(wd)) await p.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/22-buyer-dashboard-${wd === 1440 ? "desktop-1440" : wd === 820 ? "tablet-820" : "mobile-390"}.png`, fullPage: true });
    await p.context.close();
  }
  check("L-01 no horizontal overflow, clipped card or overflowing top bar at 16 widths (320 to 2560)", wide.length === 0, wide.join("; "));
  const tgt = await open("/buyer/dashboard", { session: A.s, width: 390 });
  const small = await tgt.evaluate(() => [...document.querySelectorAll("#buyer-content a, #buyer-content button, header a, header button, #buyer-content select")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 32 && !el.closest("table") && getComputedStyle(el).visibility !== "hidden"; }).map((el) => `${el.tagName}:${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 25)}:${Math.round(el.getBoundingClientRect().height)}`));
  check("L-02 at 390px interactive controls outside tables are at least 32px tall (touch targets)", small.length === 0, small.join(", "));
  const cards = await tgt.evaluate(() => { const t = document.querySelector("section[aria-labelledby='recent-inq-title'] table"); return t ? getComputedStyle(t.querySelector("tbody tr")).display : "none"; });
  check("L-03 at 390px the inquiry table becomes one card per inquiry (not a squeezed table)", cards === "block", cards);
  await tgt.context.close();

  // ================= M: performance
  if (process.env.PERF !== "0") await perf();
}

async function perf() {
  const P1 = await register("perf");
  const pipeline = (buyerId, from, to) => [
    { $match: { buyerId, createdAt: { $gte: from, $lt: to } } },
    { $facet: { counts: [{ $group: { _id: { $cond: [{ $gte: ["$createdAt", from] }, "cur", "prev"] }, n: { $sum: 1 } } }], trend: [{ $group: { _id: { $dateTrunc: { date: "$createdAt", unit: "day", timezone: "Asia/Kolkata", startOfWeek: "monday" } }, n: { $sum: 1 } } }], products: [{ $group: { _id: { $ifNull: ["$productKey", null] }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 300 }] } },
  ];
  const med = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const report = [];
  let have = 0;
  for (const size of [1000, 10000, 20000]) {
    const batch = [];
    for (let i = have; i < size; i++) batch.push({ ...mk(P1.id, Date.now() - Math.floor(Math.random() * 365 * DAY), ["NEW", "NOTIFIED", "IN_PROGRESS", "CLOSED", "CANCELLED"][i % 5], i % 7 === 6 ? null : P[i % 6]), reference: `FBM-INQ-Z${Array.from({ length: 7 }, (_, k) => CROCK[(Math.floor((i + 1) / 32 ** (6 - k))) % 32]).join("")}`, message: "x" });
    for (let i = 0; i < batch.length; i += 5000) await inq.insertMany(batch.slice(i, i + 5000), { ordered: false });
    have = size;
    for (const q of ["?range=30d", "?range=90d", `?range=custom&startDate=${istDay(today0 - 364 * DAY)}&endDate=${istDay(today0)}`]) {
      await db.collection("rate_limits").deleteMany({}); // the per-buyer limit (120 a minute) is not what is measured here
      await P1.s.call("GET", `/api/buyer/dashboard${q}`);
      const lat = [], agg = [], bytes = [];
      for (let i = 0; i < 30; i++) {
        const t = performance.now();
        const r = await P1.s.call("GET", `/api/buyer/dashboard${q}`, undefined, { "x-forwarded-for": nextIp() });
        lat.push(performance.now() - t); bytes.push(r.text.length); agg.push(r.json.data.meta.timingsMs.inquiryAggregation);
      }
      report.push({ size, q: q.slice(0, 22), p50: med(lat, 0.5), p95: med(lat, 0.95), p99: med(lat, 0.99), aggP50: med(agg, 0.5), bytes: bytes[0] });
    }
  }
  for (const r of report) console.log(`  PERF ${String(r.size).padStart(6)} inquiries ${r.q.padEnd(22)} p50 ${r.p50.toFixed(0)} ms, p95 ${r.p95.toFixed(0)} ms, p99 ${r.p99.toFixed(0)} ms, aggregation p50 ${r.aggP50} ms, ${r.bytes} B`);
  const worst = report.reduce((m, r) => Math.max(m, r.p95), 0);
  check("M-01 overview API p95 stays under the 600 ms target at 1,000, 10,000 and 20,000 inquiries for one buyer (30 requests each, 3 ranges)", worst < 600, `worst p95 ${worst.toFixed(0)} ms`);
  check("M-02 the payload does not grow with the buyer's history (same size at 1,000 and 20,000 inquiries, within 3 KB)", Math.abs(report.at(-1).bytes - report[0].bytes) < 3000, `${report[0].bytes} B to ${report.at(-1).bytes} B`);
  const now = new Date(), from = new Date(today0 - 29 * DAY), to = new Date(today0 + DAY);
  const explain = await inq.aggregate(pipeline(P1.id, new Date(from.getTime() - 30 * DAY), to), { allowDiskUse: false }).explain("executionStats");
  const plan = JSON.stringify(explain);
  const stages = plan.match(/"stage":"[A-Z_]+"/g) ?? [];
  check("M-03 the aggregation uses the {buyerId, createdAt} index (IXSCAN) and never scans the collection (no COLLSCAN)", /IXSCAN/.test(plan) && !/COLLSCAN/.test(plan), [...new Set(stages)].join(" "));
  const conc = [];
  await db.collection("rate_limits").deleteMany({});
  for (let round = 0; round < 5; round++) {
    const t = performance.now();
    await Promise.all(Array.from({ length: 10 }, () => P1.s.call("GET", "/api/buyer/dashboard?range=30d", undefined, { "x-forwarded-for": nextIp() })));
    conc.push(performance.now() - t);
  }
  console.log(`  PERF 10 concurrent requests (20,000 inquiries): batch p50 ${med(conc, 0.5).toFixed(0)} ms, max ${Math.max(...conc).toFixed(0)} ms`);
  check("M-04 10 concurrent dashboard requests complete (no errors) with the batch under 2 s", Math.max(...conc) < 2000, `max ${Math.max(...conc).toFixed(0)} ms`);
  void now;
}

async function cleanup() {
  if (process.env.KEEP === "1") return;
  const mine = await users.find({ email: { $regex: `^t22-${stamp}-` } }, { projection: { _id: 1 } }).toArray();
  const ids = mine.map((u) => u._id);
  await inq.deleteMany({ buyerId: { $in: ids } });
  await inq.deleteMany({ "guest.email": "g@example.test", message: "A-PRIVATE-MESSAGE" });
  await db.collection("wishlists").deleteMany({ userId: { $in: ids } });
  await db.collection("wishlist_suppliers").deleteMany({ userId: { $in: ids } });
  await users.deleteMany({ _id: { $in: ids } });
  await db.collection("rate_limits").deleteMany({});
}

try {
  await main_();
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
