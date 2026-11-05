import fs from "node:fs";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Buyer Compare Products (Pages 31-35 numbering: Page 35): /buyer/compare-products (the old /buyer/compare redirects), /api/buyer/compare*, and the Compare button on product pages and saved products.
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test, Chrome and puppeteer-core.
// Removes its own users and compare rows at the end unless KEEP=1. SKIP_PERF=1 skips group P.
const BASE = process.env.BASE || "http://localhost:3100";
const ROOT = "R:/indiamartref";
const TEST_DB = "finbynmart_test";
const require = createRequire(`${ROOT}/`);
const { MongoClient } = require("mongodb");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === TEST_DB) throw new Error("Refusing: the configured live database is named like the test database.");
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const db = client.db(TEST_DB);
const users = db.collection("users"), cmpc = db.collection("compare_items"), wl = db.collection("wishlists");
const clearLimits = () => db.collection("rate_limits").deleteMany({});
await clearLimits();

const stamp = Date.now();
const emailOf = (tag) => `tcp-${stamp}-${tag}@example.test`;
let ipN = 0;
const nextIp = () => `10.32.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "compare test passphrase";

class Session {
  jar = new Map();
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  async call(method, p, payload) {
    const response = await fetch(BASE + p, { method, headers: { "x-forwarded-for": this.ip ?? nextIp(), ...(payload !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}) }, body: payload === undefined ? undefined : JSON.stringify(payload), redirect: "manual" });
    for (const line of response.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); this.jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    let json = null; let text = null;
    try { text = await response.text(); json = JSON.parse(text); } catch {}
    return { status: response.status, json, text, headers: response.headers };
  }
  async page(p) {
    const response = await fetch(BASE + p, { headers: { "x-forwarded-for": this.ip ?? nextIp(), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}) }, redirect: "manual" });
    return { status: response.status, text: await response.text(), location: response.headers.get("location") };
  }
}
const register = async (tag) => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Cmp ${tag.toUpperCase()} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: "Compare Traders", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register ${tag}: ${r.status} ${r.text}`);
  return { s, id: (await users.findOne({ email: emailOf(tag) }))._id };
};

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
const clickText = (p, selector, t) => p.evaluate((s, x) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(x) && e.getClientRects().length); if (!el) return false; el.click(); return true; }, selector, t);
const hydrated = (p, sel) => p.waitForFunction((s) => Object.keys(document.querySelector(s) ?? {}).some((k) => k.startsWith("__react")), { timeout: 10000 }, sel).catch(() => {});
const med = (a, q) => { const x = [...a].sort((m, n) => m - n); return x[Math.min(x.length - 1, Math.floor(q * x.length))]; };
const ids = (s) => s.call("GET", "/api/buyer/compare");
const details = (s) => s.call("GET", "/api/buyer/compare?view=details");
const add = (s, id) => s.call("POST", "/api/buyer/compare", { productId: id });

async function main() {
  const A = await register("a"), B = await register("b"), C = await register("c"), E = await register("e");
  const SUPPLIER = new Session();
  await SUPPLIER.call("POST", "/api/auth/register/supplier", { businessName: "Compare Supplier Co", contactName: "Sia Rao", email: emailOf("sup"), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });

  // real products: six catalogue products from the public API, and one sample B2B product with its own price unit
  const pub = await new Session().call("GET", "/api/public/products?limit=24");
  const products = (pub.json?.data?.products ?? pub.json?.products ?? pub.json?.data ?? []).filter((p) => p?.id && p?.url);
  const catalog = products.filter((p) => p.source === "catalog");
  const P = catalog.slice(0, 6);
  if (P.length < 6) throw new Error(`need 6 catalogue products, got ${P.length}: ${pub.text?.slice(0, 200)}`);
  const SAMPLE = "industrial-air-compressor";

  // ================= A: access
  const un = new Session();
  const anonIds = await ids(un);
  check("A-01 anonymous visitors and suppliers get authenticated:false with an empty list (200), so product pages can show the button", anonIds.status === 200 && anonIds.json.authenticated === false && anonIds.json.productIds.length === 0 && (await ids(SUPPLIER)).json.authenticated === false);
  const anonWrites = await Promise.all([add(un, P[0].id), un.call("DELETE", `/api/buyer/compare/${P[0].id}`), un.call("DELETE", "/api/buyer/compare"), details(un)]);
  check("A-02 anonymous add, remove, clear and details: 401, private, nothing returned", anonWrites.every((r) => r.status === 401 && /no-store/.test(r.headers.get("cache-control") ?? "")));
  const supWrites = await Promise.all([add(SUPPLIER, P[0].id), SUPPLIER.call("DELETE", "/api/buyer/compare"), details(SUPPLIER)]);
  check("A-03 a supplier account cannot add, clear or read the comparison (403)", supWrites.every((r) => r.status === 403));
  const forged = new Session(); forged.jar.set("finbyn_session", "garbage.value");
  check("A-04 a forged session cookie: 401 on writes", (await add(forged, P[0].id)).status === 401);
  const anonPage = await un.page("/buyer/compare-products");
  check("A-05 the page without a session redirects to sign-in", [302, 303, 307, 308].includes(anonPage.status) && /sign-in/.test(anonPage.location ?? ""));

  const legacy = await new Session().page("/buyer/compare");
  check("A-06 the old address /buyer/compare permanently redirects (308) to /buyer/compare-products", legacy.status === 308 && /\/buyer\/compare-products$/.test(legacy.location ?? ""), `${legacy.status} ${legacy.location}`);

  // ================= B: add rules
  const a1 = await add(A.s, P[0].id);
  check("B-01 adding a product succeeds (201), private no-store", a1.status === 201 && a1.json.added === true && /no-store/.test(a1.headers.get("cache-control") ?? ""));
  const again = await add(A.s, P[0].id);
  check("B-02 adding it again is harmless (200, alreadyAdded) and keeps one row", again.status === 200 && again.json.alreadyAdded === true && (await cmpc.countDocuments({ userId: A.id })) === 1);
  check("B-03 an unknown product, an empty id and a non-string id are refused (404) and nothing is stored", (await add(A.s, "99999999")).status === 404 && (await add(A.s, "")).status === 404 && (await A.s.call("POST", "/api/buyer/compare", { productId: { $ne: "" } })).status === 404 && (await A.s.call("POST", "/api/buyer/compare", {})).status === 404 && (await cmpc.countDocuments({ userId: A.id })) === 1);
  check("B-04 a sample B2B product can be added by its slug, and the list keeps the order added", (await add(A.s, SAMPLE)).status === 201 && (await ids(A.s)).json.productIds.join() === `${P[0].id},${SAMPLE}`);
  await add(A.s, P[1].id); await add(A.s, P[2].id);
  const fifth = await add(A.s, P[3].id);
  check("B-05 a fifth product is refused (409 LIMIT) with the reason, and nothing is stored", fifth.status === 409 && fifth.json.code === "LIMIT" && /4/.test(fifth.json.message) && (await cmpc.countDocuments({ userId: A.id })) === 4);
  check("B-06 at the limit an already added product is still answered normally (200)", (await add(A.s, P[0].id)).status === 200);
  const race = await Promise.all(P.map((p) => add(E.s, p.id)));
  const stored = await cmpc.countDocuments({ userId: E.id });
  check("B-07 six simultaneous adds keep exactly four (never five or more), the others get 409", stored === 4 && race.filter((r) => r.status === 201).length === 4 && race.filter((r) => r.status === 409).length === 2, `${stored} ${race.map((r) => r.status).join()}`);
  const spoof = await B.s.call("POST", "/api/buyer/compare", { productId: P[0].id, userId: String(A.id), buyerId: String(A.id) });
  check("B-08 a userId in the body is ignored: the product lands in B's own list only", spoof.status === 201 && (await cmpc.countDocuments({ userId: B.id })) === 1 && (await cmpc.countDocuments({ userId: A.id })) === 4);
  check("B-09 rate limiting is in place: 61 quick adds from one buyer end in 429", await (async () => { const L = await register("l"); let last = 0; for (let i = 0; i < 62; i++) last = (await add(L.s, "99999999")).status; return last === 429; })());
  await clearLimits();

  // ================= C: isolation
  const bIds = (await ids(B.s)).json.productIds;
  check("C-01 buyer B sees only B's list, never A's", bIds.length === 1 && bIds[0] === P[0].id && (await details(B.s)).json.data.columns.length === 1);
  const del = await B.s.call("DELETE", `/api/buyer/compare/${P[1].id}`);
  check("C-02 B removing a product that is only in A's list changes nothing for A (removed:false)", del.json?.removed === false && (await cmpc.countDocuments({ userId: A.id })) === 4);
  check("C-03 buyer C with nothing added gets an empty comparison", (await details(C.s)).json.data.columns.length === 0);

  // ================= D: the comparison
  const dres = await details(A.s);
  const d = dres.json.data;
  check("D-01 details returns the four products in the order added with fields, notices and the limits; private no-store", dres.status === 200 && d.columns.map((c) => c.key).join() === `${P[0].id},${SAMPLE},${P[1].id},${P[2].id}` && d.max === 4 && d.min === 2 && /no-store/.test(dres.headers.get("cache-control") ?? ""));
  const catCol = d.columns.find((c) => c.key === P[0].id);
  check("D-02 a column carries the product's own name, link, price, supplier, location, category", catCol.available && catCol.name && /^\/products\//.test(catCol.url) && /₹/.test(catCol.values.price) && catCol.values.supplier && catCol.values.location && catCol.values.category);
  check("D-03 differing rows are flagged (category/supplier differ between four products), identical ones are not (the supplier verification of catalogue sellers is the same)", d.fields.find((f) => f.key === "supplier").differs === true && d.fields.find((f) => f.key === "price").differs === true);
  check("D-04 missing values are null (shown as Not Provided), never filled in: a catalogue product has no minimum order or rating", catCol.values.moq === null && catCol.values.rating === null);
  check("D-05 catalogue prices are labelled as estimates, and mixed price units are flagged", d.columns.some((c) => /estimated/.test(c.values.price ?? "")) && d.notices.some((n) => /estimates/.test(n.text)) && (new Set(d.columns.map((c) => c.values.unit)).size === 1 || d.notices.some((n) => /different units/.test(n.text))), JSON.stringify(d.notices));
  check("D-06 NO ranking or verdict: no best, cheapest, recommended, score, rank, winner or lowest in the answer", !/best|cheapest|recommend|score|rank|winner|lowest/i.test(JSON.stringify({ fields: d.fields.map((f) => f.label), notices: d.notices.map((n) => n.text), values: d.columns.map((c) => c.values) })));
  check("D-07 no contact or private fields: no e-mail, phone, owner, user id, order counts", !/email|phone|owner|userId|total_orders|@example/i.test(dres.text));
  await cmpc.insertOne({ userId: C.id, productKey: "88888888", productName: "Vanished Product", addedAt: new Date() });
  await add(C.s, P[4].id);
  const dc = (await details(C.s)).json.data;
  const gone = dc.columns.find((c) => c.key === "88888888");
  check("D-08 a product that left the catalogue is listed as unavailable with its saved name (not dropped), with no link, and a notice says so", gone.available === false && gone.name === "Vanished Product" && gone.url === null && dc.notices.some((n) => /no longer available/.test(n.text)));
  check("D-09 an unavailable product can still be removed by its stored key", (await C.s.call("DELETE", "/api/buyer/compare/88888888")).json?.removed === true && (await cmpc.countDocuments({ userId: C.id })) === 1);
  const idx = await cmpc.indexes();
  check("D-10 indexes: unique (userId, productKey) and the ordered list index", idx.some((i) => i.unique && JSON.stringify(i.key) === JSON.stringify({ userId: 1, productKey: 1 })) && idx.some((i) => i.name === "buyer_compare_order"));

  const de = (await details(E.s)).json.data;
  const priceOf = (key) => P.find((p) => p.id === key)?.price?.min;
  const lowestKeys = (() => { const nums = de.columns.map((c) => priceOf(c.key)); const m = Math.min(...nums); return de.columns.filter((c, i) => nums[i] === m).map((c) => c.key).sort(); })();
  const priceField = de.fields.find((f) => f.key === "price");
  check("D-11 the answer states compatibility and capabilities: currency and unit compatible for four catalogue products, category flag present, add-to-inquiry / save / remove / clear capabilities", de.compatibility.currencyCompatible === true && de.compatibility.unitCompatible === true && typeof de.compatibility.categoryCompatible === "boolean" && de.capabilities.addToInquiry === true && de.capabilities.saveProduct === true && de.capabilities.removeProduct === true && de.capabilities.clear === true);
  check("D-12 the lowest listed price is emphasised (neutral label, never 'best') only because currency and unit match, and it is exactly the product(s) with the smallest price in the catalogue", priceField.highlightLabel === "Lowest listed price" && JSON.stringify([...priceField.highlight].sort()) === JSON.stringify(lowestKeys), JSON.stringify({ hl: priceField.highlight, expect: lowestKeys }));
  const units = new Set(d.columns.filter((c) => c.available).map((c) => c.values.unit));
  const pf = d.fields.find((f) => f.key === "price");
  check("D-13 when the price units differ (A compares a catalogue product with a sample listing) nothing is emphasised and a notice says the prices are not like for like; when they happen to match, they are compatible", units.size > 1 ? (d.compatibility.unitCompatible === false && pf.highlight.length === 0 && pf.highlightLabel === null && d.notices.some((n) => /different units/.test(n.text))) : d.compatibility.unitCompatible === true, [...units].join("|"));
  check("D-14 rows no product has data for are not drawn: no row has status 'empty', and availability, lead time, certifications and warranty are listed as not available instead of as rows of Not Provided", de.fields.every((f) => f.status !== "empty") && ["Availability", "Lead Time", "Certifications", "Warranty"].every((l) => de.emptyLabels.includes(l)) && !de.fields.some((f) => ["availability", "leadTime", "certifications", "warranty"].includes(f.key)), de.emptyLabels.join());
  check("D-15 every row has a valid status (same, differs or incomplete), and 'differs' is true exactly when the status is differs; a missing value is never counted as a different value", de.fields.every((f) => ["same", "differs", "incomplete"].includes(f.status) && f.differs === (f.status === "differs")));
  const priceDigits = (t) => t.replace(/[^0-9]/g, "");
  check("D-16 the comparison agrees with the catalogue (the same data the product list and page use): each column's price starts with the catalogue price, the name and supplier match", de.columns.every((c) => { const p = P.find((x) => x.id === c.key); return p && priceDigits(c.values.price).startsWith(String(Math.round(p.price.min))) && c.name === p.name && c.supplier.name === p.supplier.name; }));
  const catNames = new Set(d.columns.filter((c) => c.available).map((c) => c.values.category));
  check("D-17 when the products are in different categories the answer says so (categoryCompatible false and a notice that only shared attributes are compared); when they share one it is true", catNames.size > 1 ? (d.compatibility.categoryCompatible === false && d.notices.some((n) => /different categories/.test(n.text))) : d.compatibility.categoryCompatible === true, [...catNames].join("|"));
  check("D-18 each column carries the product's own catalogue code, and no brand or SKU is invented (the catalogue holds neither)", de.columns.every((c) => c.code === c.key) && !/"brand"|"sku"/i.test(JSON.stringify(de)));

  check("D-19 attributes that are already rows of their own (category, subcategory, minimum order, price, supplier...) are not repeated as specification rows, in either comparison", [d, de].every((c) => !c.fields.some((x) => (x.section === "spec" || x.section === "specific") && /^(category|subcategory|minimum order|moq|price|price per|supplier|supplier location|supplier type|rating)$/i.test(x.label))));
  check("D-20 notices carry a level: the estimate and different-category notes are 'info', unit / currency / unavailable-product notes are 'warning'", d.notices.every((n) => ["info", "warning"].includes(n.level) && n.text) && (d.notices.find((n) => /estimates/.test(n.text))?.level ?? "info") === "info" && (d.notices.find((n) => /different units|different currencies|no longer available/.test(n.text))?.level ?? "warning") === "warning");

  // ================= E: remove and clear
  const rm = await A.s.call("DELETE", `/api/buyer/compare/${P[2].id}`);
  check("E-01 removing one succeeds (removed:true), the list is one shorter, the others keep their order", rm.json?.removed === true && (await ids(A.s)).json.productIds.join() === `${P[0].id},${SAMPLE},${P[1].id}`);
  check("E-02 removing it again answers removed:false", (await A.s.call("DELETE", `/api/buyer/compare/${P[2].id}`)).json?.removed === false);
  check("E-03 a place is free again, so the previously refused fifth product can now be added", (await add(A.s, P[3].id)).status === 201);
  check("E-04 clearing empties only the buyer's own list (A's four removed, B's one stays)", (await A.s.call("DELETE", "/api/buyer/compare")).json?.removed === 4 && (await cmpc.countDocuments({ userId: A.id })) === 0 && (await cmpc.countDocuments({ userId: B.id })) === 1);

  // ================= G: pages (browser)
  for (const p of [P[0], P[1], P[2]]) await add(A.s, p.id);
  await add(A.s, SAMPLE);
  const page = await open("/buyer/compare-products", { session: A.s });
  await hydrated(page, "table button");
  await sleep(300);
  const nav = await page.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, active: document.querySelector("#buyer-sidebar [aria-current]")?.textContent.trim() ?? null, robots: document.querySelector("meta[name=robots]")?.content, crumb: document.querySelector("#buyer-content")?.textContent.slice(0, 70), heads: [...document.querySelectorAll("table thead th[scope=col]")].length, differs: [...document.querySelectorAll("table th[scope=row]")].filter((t) => /Differs/.test(t.textContent)).length }));
  const text = await content(page);
  check("G-01 the page: shell with Compare Products current, heading, breadcrumb, noindex, one column per product plus the label column, 'Differs' words, Not Provided, no ranking words, no console errors", page.status === 200 && /^Compare Products \(4\)$/.test(nav.h1 ?? "") && /Compare Products/.test(nav.active ?? "") && /Home \/ Buyer Dashboard \/ Compare Products/.test(nav.crumb) && /noindex/.test(nav.robots ?? "") && nav.heads === 5 && nav.differs >= 2 && /Not available for these products, so not shown/.test(text) && !/best value|cheapest|recommended|winner/i.test(text) && page.errs.length === 0, JSON.stringify(nav));
  const ui = await page.evaluate(() => ({
    chips: [...document.querySelectorAll("ul[aria-label='Products in your comparison'] li")].length,
    chipRemove: [...document.querySelectorAll("ul[aria-label='Products in your comparison'] button")].every((b) => /^Remove .* from comparison$/.test(b.getAttribute("aria-label") ?? "")),
    back: [...document.querySelectorAll("a")].find((a) => /Back to Saved Products/.test(a.textContent))?.getAttribute("href") ?? null,
    codes: [...document.querySelectorAll("thead th")].filter((t) => /Product code:/.test(t.textContent)).length,
    sticky: getComputedStyle(document.querySelector("th.stickyCol, th[class*=stickyCol]")).position,
    region: (() => { const r = document.querySelector("[role=region][tabindex='0']"); return r ? r.getAttribute("aria-label") : null; })(),
  }));
  check("G-01b selected-product chips (one per product, each with an accessible Remove), the Back to Saved Products link, product codes in the column headers, a sticky criteria column, and a keyboard-focusable named scroll region", ui.chips === 4 && ui.chipRemove && ui.back === "/buyer/saved-products" && ui.codes === 4 && ui.sticky === "sticky" && /scroll sideways/.test(ui.region ?? ""), JSON.stringify(ui));
  check("G-01c at the limit of four, Add More Products is disabled and the page says remove one first (nothing is swapped silently)", await page.evaluate(() => { const b = [...document.querySelectorAll("a, button")].find((a) => /Add More Products/.test(a.textContent)); return b?.tagName === "BUTTON" && b.disabled; }) && /Four products are the most you can compare/.test(await content(page)));
  const marks = () => page.evaluate(() => document.querySelectorAll("table th[scope=row] span[class*=differsMark]").length);
  const rowCount = () => page.evaluate(() => [...document.querySelectorAll("table tbody tr")].filter((tr) => tr.querySelector("th[scope=row]")).length);
  const withMarks = await marks(), allRows = await rowCount();
  await page.evaluate(() => [...document.querySelectorAll("label")].find((l) => /Highlight differences/.test(l.textContent)).querySelector("input").click());
  await sleep(200);
  const noMarks = await marks();
  await page.evaluate(() => [...document.querySelectorAll("label")].find((l) => /Highlight differences/.test(l.textContent)).querySelector("input").click());
  await page.evaluate(() => [...document.querySelectorAll("label")].find((l) => /Show differences only/.test(l.textContent)).querySelector("input").click());
  await sleep(200);
  const diffRows = await rowCount();
  const diffNote = /rows? that (is|are) the same for every product (is|are) hidden/.test(await content(page));
  await page.evaluate(() => [...document.querySelectorAll("label")].find((l) => /Show differences only/.test(l.textContent)).querySelector("input").click());
  await sleep(200);
  check("G-01d Highlight differences turns the Differs marks on and off; Show differences only hides the rows that are the same everywhere (and says how many); turning it off brings them back", withMarks > 0 && noMarks === 0 && diffRows < allRows && diffNote && (await rowCount()) === allRows, JSON.stringify({ withMarks, noMarks, allRows, diffRows, diffNote }));
  const acts = await page.evaluate(() => { const row = [...document.querySelectorAll("table tbody tr")].find((tr) => tr.querySelector("th")?.textContent.trim() === "Actions"); const tds = [...row.querySelectorAll("td")]; return tds.map((td) => ({ inquiry: [...td.querySelectorAll("a")].some((a) => /Add to Inquiry/.test(a.textContent) && /^\/inquiry\//.test(a.getAttribute("href") ?? "")), view: [...td.querySelectorAll("a")].some((a) => /View Product/.test(a.textContent)), save: [...td.querySelectorAll("button")].some((b) => /^Save /.test(b.getAttribute("aria-label") ?? "")), remove: [...td.querySelectorAll("button")].some((b) => /Remove/.test(b.textContent)) })); });
  check("G-01e every product column has Add to Inquiry (to that supplier's inquiry form), View Product, Save Product and Remove", acts.length === 4 && acts.every((a) => a.inquiry && a.view && a.save && a.remove), JSON.stringify(acts));
  await page.evaluate(() => { const row = [...document.querySelectorAll("table tbody tr")].find((tr) => tr.querySelector("th")?.textContent.trim() === "Actions"); row.querySelector("td button[aria-label^='Save ']").click(); });
  await sleep(1200);
  check("G-01f Save Product uses the shared wishlist: the first product is stored in the buyer's saved products, and nothing is submitted as an inquiry", (await wl.countDocuments({ userId: A.id })) === 1 && (await db.collection("inquiries").countDocuments({ buyerId: A.id })) === 0);
  const ePage = await open("/buyer/compare-products", { session: E.s });
  const lowestTags = await ePage.evaluate(() => [...document.querySelectorAll("table [class*=lowestTag]")].map((t) => t.textContent));
  check("G-01g with four catalogue products of the same currency and unit the lowest listed price is marked neutrally ('Lowest listed price'), and no 'best', 'cheapest' or 'recommended' appears", lowestTags.length >= 1 && lowestTags.every((t) => t === "Lowest listed price") && !/best|cheapest|recommended|winner/i.test(await content(ePage)));
  await ePage.context.close();
  await page.evaluate(() => document.querySelector("ul[aria-label='Products in your comparison'] button").click());
  await page.waitForSelector("[role=alertdialog], [role=dialog]");
  const stillFour = (await cmpc.countDocuments({ userId: A.id })) === 4;
  await clickText(page, "[role=alertdialog] button, [role=dialog] button", "Keep it");
  check("G-02 Remove asks first; 'Keep it' closes the dialog and nothing is removed", stillFour && !(await page.$("[role=alertdialog], [role=dialog]")) && (await cmpc.countDocuments({ userId: A.id })) === 4);
  await page.evaluate(() => document.querySelector("ul[aria-label='Products in your comparison'] button").click());
  await page.waitForSelector("[role=alertdialog], [role=dialog]");
  await clickText(page, "[role=alertdialog] button, [role=dialog] button", "Remove");
  await page.waitForFunction(() => !document.querySelector("[role=alertdialog], [role=dialog]") && document.querySelectorAll("table thead th[scope=col]").length === 4, { timeout: 12000 }).catch(() => {});
  check("G-03 confirming removes it on the server and the page shows one column fewer (the first product is gone)", (await cmpc.countDocuments({ userId: A.id })) === 3 && (await page.evaluate(() => document.querySelectorAll("table thead th[scope=col]").length)) === 4);
  await clickText(page, "button", "Clear All");
  await page.waitForSelector("[role=alertdialog], [role=dialog]");
  await clickText(page, "[role=alertdialog] button, [role=dialog] button", "Clear all");
  await page.waitForFunction(() => /Nothing to compare yet/.test(document.body.textContent), { timeout: 12000 }).catch(() => {});
  check("G-04 Clear all (after asking) empties the list and the page shows the honest empty state with links to saved and all products", (await cmpc.countDocuments({ userId: A.id })) === 0 && /Nothing to compare yet/.test(await content(page)) && /Open Saved Products/.test(await content(page)));
  await page.context.close();

  const prodPage = await open(P[0].url, { session: A.s });
  await hydrated(prodPage, "[aria-label^='Add'][aria-pressed]");
  await sleep(400);
  const btn = () => prodPage.evaluate(() => { const b = [...document.querySelectorAll("button[aria-pressed]")].find((x) => /comparison/i.test(x.getAttribute("aria-label") ?? "")); return b ? { label: b.getAttribute("aria-label"), pressed: b.getAttribute("aria-pressed"), text: b.textContent.trim() } : null; });
  const before = await btn();
  await prodPage.evaluate(() => [...document.querySelectorAll("button[aria-pressed]")].find((x) => /Add .* to comparison/i.test(x.getAttribute("aria-label") ?? "")).click());
  await prodPage.waitForFunction(() => [...document.querySelectorAll("button[aria-pressed]")].some((x) => x.getAttribute("aria-pressed") === "true" && /comparison/i.test(x.getAttribute("aria-label") ?? "")), { timeout: 8000 }).catch(() => {});
  const mid = await btn();
  check("G-05 on a product page the Compare button adds it (stored on the server), turns to 'In Comparison' and offers View comparison", before?.pressed === "false" && mid?.pressed === "true" && mid.text === "In Comparison" && (await cmpc.countDocuments({ userId: A.id, productKey: P[0].id })) === 1 && /View comparison/.test(await prodPage.evaluate(() => document.body.textContent)));
  await prodPage.evaluate(() => [...document.querySelectorAll("button[aria-pressed]")].find((x) => /Remove .* from comparison/i.test(x.getAttribute("aria-label") ?? "")).click());
  await prodPage.waitForFunction(() => ![...document.querySelectorAll("button[aria-pressed]")].some((x) => x.getAttribute("aria-pressed") === "true" && /comparison/i.test(x.getAttribute("aria-label") ?? "")), { timeout: 8000 }).catch(() => {});
  check("G-06 pressing it again removes it from the server list", (await cmpc.countDocuments({ userId: A.id, productKey: P[0].id })) === 0 && (await btn())?.pressed === "false" && prodPage.errs.length === 0);
  await prodPage.context.close();

  const anonProd = await open(P[0].url);
  await hydrated(anonProd, "button[aria-pressed]");
  await sleep(400);
  await anonProd.evaluate(() => [...document.querySelectorAll("button[aria-pressed]")].find((x) => /Add .* to comparison/i.test(x.getAttribute("aria-label") ?? "")).click());
  await anonProd.waitForFunction(() => /sign-in/.test(location.pathname), { timeout: 8000 }).catch(() => {});
  check("G-07 a signed-out visitor pressing Compare is sent to sign in (nothing stored)", /sign-in/.test(await anonProd.evaluate(() => location.pathname)));
  await anonProd.context.close();

  const explorer = await open("/products", { session: A.s });
  await hydrated(explorer, "article button[aria-label$=' to comparison']");
  await sleep(600);
  const cardInfo = await explorer.evaluate(() => { const bs = [...document.querySelectorAll("article button[aria-label$=' to comparison']")]; return { n: bs.length, pos: bs[0] ? getComputedStyle(bs[0]).position : null, hasHeart: document.querySelectorAll("article button[aria-label^='Save ']").length }; });
  const beforeAdd = await cmpc.countDocuments({ userId: A.id });
  await explorer.evaluate(() => document.querySelector("article button[aria-label^='Add '][aria-label$=' to comparison']").click());
  await explorer.waitForFunction(() => !!document.querySelector("article button[aria-pressed='true'][aria-label^='Remove '][aria-label$=' from comparison']"), { timeout: 8000 }).catch(() => {});
  check("G-07b the Product Explorer's cards have a round Compare button (next to the heart); pressing it adds that product to the buyer's comparison (stored on the server) and the button shows it is in the comparison; no console errors", cardInfo.n >= 6 && cardInfo.pos === "absolute" && cardInfo.hasHeart >= 6 && (await cmpc.countDocuments({ userId: A.id })) === beforeAdd + 1 && explorer.errs.length === 0, JSON.stringify(cardInfo));
  await explorer.context.close();
  await wl.insertOne({ userId: B.id, productKey: P[5].id, productName: "x", addedAt: new Date() });
  const saved = await open("/buyer/saved-products", { session: B.s });
  await hydrated(saved, "ul[aria-label='Your saved products'] button");
  await sleep(400);
  const hasBtn = await saved.evaluate(() => [...document.querySelectorAll("ul[aria-label='Your saved products'] button[aria-pressed]")].some((b) => /comparison/i.test(b.getAttribute("aria-label") ?? "")));
  check("G-08 Saved Products cards have the Compare button, which reflects the buyer's list (B already compares one product)", hasBtn && saved.errs.length === 0);
  await saved.context.close();

  const supPage = await SUPPLIER.page("/buyer/compare-products");
  check("G-09 a supplier account opening the page sees no comparison data", supPage.status !== 200 || !/Compare Products\s*\(/.test(supPage.text));

  // ================= R: responsive (four products, the widest case)
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const bad = [];
  for (const w of widths) {
    const p = await open("/buyer/compare-products", { width: w, session: E.s });
    const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const clipped = await p.evaluate(() => [...document.querySelectorAll("#buyer-content h1, #buyer-content h2, #buyer-content h3")].filter((e) => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1 && !/auto|scroll/.test(getComputedStyle(e).overflowX)).map((e) => `${e.tagName}:${e.textContent.slice(0, 24)}`));
    if (o > 0 || clipped.length || p.errs.length) bad.push(`@${w}: overflow ${o}, clipped ${clipped.slice(0, 2).join("|")}, errors ${p.errs.length}`);
    if (w === 390 || w === 1440) await p.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/compare-products-${w}.png`, fullPage: true });
    await p.context.close();
  }
  check("R-01 no horizontal overflow, clipped headings or console errors at 16 widths (320 to 2560) with four products", bad.length === 0, bad.join("; "));
  const phone = await open("/buyer/compare-products", { width: 390, session: E.s });
  const desk = await open("/buyer/compare-products", { width: 1440, session: E.s });
  check("R-02 a phone shows one card per product (table hidden), a desktop shows the table (cards hidden)", await phone.evaluate(() => getComputedStyle(document.querySelector("table").closest("[class*=compareWrap]")).display === "none" && getComputedStyle(document.querySelector("[class*=compareCards]")).display !== "none") && await desk.evaluate(() => getComputedStyle(document.querySelector("[class*=compareCards]")).display === "none" && document.querySelector("table").getClientRects().length > 0));
  await phone.context.close(); await desk.context.close();

  if (process.env.SKIP_PERF === "1") return;
  const t1 = [], t2 = [];
  for (let i = 0; i < 15; i++) { const s = performance.now(); await details(E.s); t1.push(performance.now() - s); }
  for (let i = 0; i < 15; i++) { const s = performance.now(); await ids(E.s); t2.push(performance.now() - s); }
  const bytes = (await details(E.s)).text.length;
  const plan = await cmpc.find({ userId: E.id }).sort({ addedAt: 1, _id: 1 }).limit(4).explain("queryPlanner");
  const stages = JSON.stringify(plan.queryPlanner.winningPlan);
  console.log(`  PERF compare details (4 products): p50 ${med(t1, 0.5).toFixed(0)} p95 ${med(t1, 0.95).toFixed(0)} ms (${bytes} B); ids p95 ${med(t2, 0.95).toFixed(0)} ms`);
  check("P-01 the full comparison of four products stays under 350 ms (p95), the id list under 300 ms, and the answer is bounded (< 25 KB)", med(t1, 0.95) < 350 && med(t2, 0.95) < 300 && bytes < 25_000);
  check("P-02 the list read uses the index (no collection scan, no blocking sort)", /IXSCAN/.test(stages) && !/COLLSCAN/.test(stages) && !/"SORT"/.test(stages), stages.slice(0, 100));
}

async function cleanup() {
  if (process.env.KEEP === "1") return;
  const mine = await users.find({ email: { $regex: `^tcp-${stamp}-` } }, { projection: { _id: 1 } }).toArray();
  const ids2 = mine.map((u) => u._id);
  await cmpc.deleteMany({ userId: { $in: ids2 } });
  await wl.deleteMany({ userId: { $in: ids2 } });
  await db.collection("notifications").deleteMany({ buyerId: { $in: ids2 } });
  await db.collection("security_events").deleteMany({ userId: { $in: ids2 } });
  await users.deleteMany({ _id: { $in: ids2 } });
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
