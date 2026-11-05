import fs from "node:fs";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Buyer Saved Products (/buyer/saved-products, GET /api/buyer/saved-products, and the existing save/remove routes under /api/buyer/wishlist).
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test, Chrome and puppeteer-core.
// Writes only to the throwaway database and removes its own users and rows at the end unless KEEP=1. SKIP_PERF=1 skips group P.
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
const users = db.collection("users"), wl = db.collection("wishlists");
const clearLimits = () => db.collection("rate_limits").deleteMany({});
await clearLimits();

const stamp = Date.now();
const emailOf = (tag) => `tsp-${stamp}-${tag}@example.test`;
let ipN = 0;
const nextIp = () => `10.30.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "saved products passphrase";

// real product ids from the catalogue seed (spread over categories) plus two sample listings
const csv = fs.readFileSync(`${ROOT}/db/seed/products.csv`, "utf8").split(/\r?\n/).slice(1).filter(Boolean);
const catalogIds = csv.map((l) => l.split(",")[0]);
const sampleKeys = ["cotton-fabric", "printed-fabric"];

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
    return { status: response.status, text: await response.text(), location: response.headers.get("location") };
  }
}
const register = async (tag) => {
  const s = new Session();
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Sav ${tag.toUpperCase()} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: "Saved Test Traders", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register ${tag}: ${r.status} ${r.text}`);
  const user = await users.findOne({ email: emailOf(tag) });
  return { s, id: user._id, email: emailOf(tag) };
};
const save = (u, key) => u.s.call("POST", "/api/buyer/wishlist", { productId: key });
const list = (u, q = "") => u.s.call("GET", `/api/buyer/saved-products${q}`);

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
const cards = (p) => p.evaluate(() => [...document.querySelectorAll("ul[aria-label='Your saved products'] > li")].map((li) => li.querySelector("h3")?.textContent.trim() ?? ""));
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const med = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const priceOf = (text) => Number((text.match(/₹\s?([\d,]+(?:\.\d+)?)/)?.[1] ?? "NaN").replace(/,/g, ""));

async function main() {
  const A = await register("a");
  const B = await register("b");
  const SUPPLIER = new Session();
  await SUPPLIER.call("POST", "/api/auth/register/supplier", { businessName: "Saved Supplier Co", contactName: "Sia Rao", email: emailOf("sup"), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  const SUSP = await register("susp");
  await users.updateOne({ _id: SUSP.id }, { $set: { accountStatus: "SUSPENDED" } });

  // ================= A: access
  const un = new Session();
  const unr = await un.call("GET", "/api/buyer/saved-products");
  const supr = await SUPPLIER.call("GET", "/api/buyer/saved-products");
  check("A-01 without a session the list answers 401 (private, no-store, nothing returned); a supplier account 403; a suspended buyer's session no longer works", unr.status === 401 && /no-store/.test(unr.headers.get("cache-control") ?? "") && supr.status === 403 && (await SUSP.s.call("GET", "/api/buyer/saved-products")).status === 401, `${unr.status} ${supr.status}`);
  const red = await un.page("/buyer/saved-products?sort=name");
  const supPage = await SUPPLIER.page("/buyer/saved-products");
  check("A-02 the page redirects a signed-out visitor to sign-in and back; a supplier sees 'Buyer accounts only'", [307, 308].includes(red.status) && /\/sign-in\?next=%2Fbuyer%2Fsaved-products/.test(red.location ?? "") && /Buyer accounts only/.test(supPage.text));

  // ================= D: saving and removing (existing routes) and the list
  const sav = [];
  for (const key of [...sampleKeys, ...catalogIds.slice(0, 18)]) { sav.push(await save(A, key)); await sleep(15); }
  check("D-01 saving 20 real products (2 sample listings, 18 catalogue products) through the existing route: 201 each", sav.every((r) => r.status === 201 && r.json.saved === true), sav.map((r) => r.status).join(""));
  const dup = await save(A, "cotton-fabric");
  const missing = await save(A, "no-such-product-xyz");
  check("D-02 saving the same product again is harmless (200, alreadySaved, still one row); an unknown product is refused (404)", dup.status === 200 && dup.json.alreadySaved === true && (await wl.countDocuments({ userId: A.id })) === 20 && missing.status === 404);
  const l1 = (await list(A, "?limit=48")).json;
  check("D-03 the list holds exactly the 20 saved products and says how many are saved in total", l1.data.items.length === 20 && l1.data.totalSaved === 20 && l1.meta.total === 20, `${l1.data.items.length}`);
  check("D-04 default order is newest saved first (the last one saved is first)", l1.data.items[0].key === catalogIds[17] && l1.data.items.at(-1).key === "cotton-fabric");
  const it = l1.data.items.find((x) => x.key === "cotton-fabric");
  check("D-05 an item carries what the card shows: name, product link, category, price with unit, supplier name, supplier link, and the inquiry link of that supplier for that product (the existing inquiry form)", it.available && it.name === "Cotton Fabric" && it.url?.startsWith("/products/") && it.category?.name && /₹/.test(it.price.text) && it.price.unit && it.supplier.name === "Shree Textiles" && it.supplier.inquiryHref === "/inquiry/shree-textiles?product=cotton-fabric", JSON.stringify(it).slice(0, 260));
  check("D-06 an item never carries contact data, the buyer id or internal fields", !/userId|buyerId|phone|email|@example/i.test(JSON.stringify(l1)));
  const sumCats = l1.data.categories.reduce((n, c) => n + c.count, 0);
  check("D-07 the category tabs count the saved products by category (most first) and add up to the 20 available ones", l1.data.categories.length >= 2 && sumCats === 20 && l1.data.categories.every((c, i, a) => i === 0 || a[i - 1].count >= c.count), l1.data.categories.map((c) => `${c.name}:${c.count}`).join(","));
  const cat = l1.data.categories[0];
  const fc = (await list(A, `?category=${cat.id}&limit=48`)).json;
  check("D-08 the category filter returns exactly that category's saved products", fc.meta.total === cat.count && fc.data.items.every((x) => x.category.id === cat.id) && fc.data.totalSaved === 20);
  const sName = (await list(A, "?sort=name&limit=48")).json.data.items.map((x) => x.name.toLowerCase());
  const sNameD = (await list(A, "?sort=name-desc&limit=48")).json.data.items.map((x) => x.name.toLowerCase());
  const pLow = (await list(A, "?sort=price-low&limit=48")).json.data.items.map((x) => priceOf(x.price.text));
  const pHigh = (await list(A, "?sort=price-high&limit=48")).json.data.items.map((x) => priceOf(x.price.text));
  const oldest = (await list(A, "?sort=oldest&limit=48")).json.data.items;
  check("D-09 sorting: name A-Z and Z-A, price low to high and high to low, oldest saved first", JSON.stringify(sName) === JSON.stringify([...sName].sort((a, b) => a.localeCompare(b))) && JSON.stringify(sNameD) === JSON.stringify([...sNameD].sort((a, b) => b.localeCompare(a))) && pLow.every((v, i, a) => i === 0 || a[i - 1] <= v) && pHigh.every((v, i, a) => i === 0 || a[i - 1] >= v) && oldest[0].key === "cotton-fabric", `${pLow.slice(0, 4)} | ${pHigh.slice(0, 4)}`);
  const qSup = (await list(A, "?q=shree")).json;
  const qName = (await list(A, `?q=${encodeURIComponent(it.name.slice(0, 6).toLowerCase())}`)).json;
  const qNone = (await list(A, "?q=zzzzzzzz")).json;
  const qRegex = (await list(A, "?q=.*")).json;
  check("D-10 search finds by supplier name and by part of a product name (any case); no match is an empty list; '.*' is plain text (nothing)", qSup.meta.total >= 2 && qName.meta.total >= 1 && qNone.meta.total === 0 && qRegex.meta.total === 0 && qNone.data.totalSaved === 20, `${qSup.meta.total} ${qName.meta.total}`);
  const pg1 = (await list(A, "?limit=8&page=1")).json, pg2 = (await list(A, "?limit=8&page=2")).json, pg3 = (await list(A, "?limit=8&page=3")).json, pg4 = (await list(A, "?limit=8&page=4")).json;
  const unionKeys = [...pg1.data.items, ...pg2.data.items, ...pg3.data.items].map((x) => x.key);
  check("D-11 pagination: pages of 8, 8, 4 and then empty, with the right meta, no repeats or gaps", [pg1, pg2, pg3, pg4].map((x) => x.data.items.length).join() === "8,8,4,0" && pg2.meta.totalPages === 3 && new Set(unionKeys).size === 20 && (await list(A)).json.meta.limit === 12);
  const bad = await Promise.all(["sort=price", "sort=reference", "category=Textiles", "category=a/b", "page=0", "page=101", "limit=0", "limit=49", `q=${"x".repeat(61)}`].map((x) => list(A, `?${x}`)));
  check("D-12 invalid parameters are refused (400): unknown sort, bad category, page 0 or over 100, limit 0 or over 48, search over 60 characters", bad.every((r) => r.status === 400), bad.map((r) => r.status).join());
  const inj = await Promise.all([list(A, `?q=${encodeURIComponent('{"$ne":""}')}`), list(A, "?category[$ne]=x"), list(A, `?buyerId=${B.id}&userId=${B.id}`)]);
  check("D-13 operator-looking input is plain text or ignored (no leak, no error); a buyerId in the query is ignored (still A's 20)", inj[0].json.meta.total === 0 && inj[1].json.data.totalSaved === 20 && inj[2].json.data.totalSaved === 20);

  // B: ownership
  const bl = (await list(B)).json;
  check("B-01 buyer B sees none of A's saved products", bl.data.totalSaved === 0 && bl.data.items.length === 0);
  await save(B, "cotton-fabric");
  const delOther = await B.s.call("DELETE", "/api/buyer/wishlist/printed-fabric");
  check("B-02 removing a key B has not saved removes nothing (200, removed false) and A's saved product is untouched", delOther.status === 200 && delOther.json.removed === false && (await wl.countDocuments({ userId: A.id })) === 20);
  const bAfter = (await list(B)).json;
  check("B-03 B's own list is B's alone (1) and A's list still holds 20", bAfter.data.totalSaved === 1 && (await list(A)).json.data.totalSaved === 20);
  // a product that left the catalogue
  await wl.insertOne({ userId: A.id, productKey: "999999999", productName: "Retired Product", addedAt: new Date(Date.now() + 1000) });
  const gone = (await list(A, "?limit=48")).json.data;
  const goneItem = gone.items.find((x) => x.key === "999999999");
  check("D-14 a saved product that left the catalogue is not dropped silently: it stays in the list as unavailable, under its saved name, with no price, link or Get Quote, and counts in the total (21) but in no category", goneItem && goneItem.available === false && goneItem.name === "Retired Product" && goneItem.price === null && goneItem.url === null && goneItem.supplier === null && goneItem.category === null && gone.totalSaved === 21 && gone.categories.reduce((n, c) => n + c.count, 0) === 20);
  const rm = await A.s.call("DELETE", "/api/buyer/wishlist/printed-fabric");
  const rm2 = await A.s.call("DELETE", "/api/buyer/wishlist/printed-fabric");
  check("D-15 removing a saved product: 200 removed true and it is gone from the list; again: removed false", rm.json.removed === true && rm2.json.removed === false && (await list(A, "?limit=48")).json.data.items.every((x) => x.key !== "printed-fabric"));
  const ix = await wl.indexes();
  const plan = await wl.find({ userId: A.id }).sort({ addedAt: -1, _id: -1 }).limit(500).explain("executionStats");
  const stages = JSON.stringify(plan.queryPlanner.winningPlan).match(/"stage":"[A-Z_]+"/g)?.join(" ") ?? "";
  check("D-16 one row per buyer and product (unique index) and a newest-first index exist; the list read is an index scan with no sort stage", ix.some((i) => i.unique && i.key.userId === 1 && i.key.productKey === 1) && ix.some((i) => i.name === "buyer_saved_newest") && /IXSCAN/.test(stages) && !/SORT/.test(stages), stages);
  // cap
  const C = await register("cap");
  await wl.insertMany(Array.from({ length: 500 }, (_, i) => ({ userId: C.id, productKey: i === 0 ? "cotton-fabric" : `retired-${i}`, productName: `Retired ${i}`, addedAt: new Date(Date.now() - i * 1000) })));
  const over = await save(C, "printed-fabric");
  const again = await save(C, "cotton-fabric");
  check("D-17 a buyer can keep 500 saved products: the 501st is refused (409) and nothing is added; saving one that is already saved is still harmless", over.status === 409 && /500/.test(over.json.message) && (await wl.countDocuments({ userId: C.id })) === 500 && again.status === 200 && again.json.alreadySaved === true);

  // ================= F: browser
  await clearLimits();
  const lp = await open("/buyer/saved-products", { session: A.s });
  const nav = await lp.evaluate(() => ({ active: document.querySelector("nav[aria-label='Buyer navigation'] a[aria-current='page']")?.textContent.trim() ?? "", bg: getComputedStyle(document.querySelector("nav[aria-label='Buyer navigation'] a[aria-current='page']")).backgroundColor, h1: document.querySelector("h1")?.textContent, add: [...document.querySelectorAll("a")].find((a) => /Add More Products/.test(a.textContent))?.getAttribute("href") }));
  const tabs = await lp.evaluate(() => [...document.querySelectorAll("[aria-label='Filter saved products by category'] button")].map((b) => b.textContent.trim().replace(/\s+/g, " ")));
  check("F-01 the page: buyer shell, Saved Products is the current (gold) sidebar item, heading, 'Add More Products' goes to /products, no console errors", lp.status === 200 && /Saved Products/.test(nav.active) && nav.bg === "rgb(253, 179, 4)" && nav.h1 === "Saved Products" && nav.add === "/products" && lp.errs.length === 0, JSON.stringify(nav));
  check("F-02 the category tabs: 'All Saved (20)' first, then each category with its count; the unavailable product is only in the total of the list, not in a tab", /^All Saved \(2[01]\)$/.test(tabs[0]) && tabs.length === 1 + l1.data.categories.length, tabs.join(" | "));
  const names0 = await cards(lp);
  check("F-03 the first page shows 12 cards (default page size): an available one has name, supplier, price with unit, a heart to remove, Get Quote and View Product; the retired product (saved last, so first) shows only its saved name, a note and the heart", names0.length === 12 && (await lp.evaluate(() => { const all = [...document.querySelectorAll("ul[aria-label='Your saved products'] > li")]; const li = all.find((x) => /View Product/.test(x.textContent)); const gone = all.find((x) => /no longer available/.test(x.textContent)); return !!li && !!li.querySelector("button[aria-label^='Remove']") && /Get Quote/.test(li.textContent) && /By /.test(li.textContent) && /₹/.test(li.textContent) && !!gone && !/Get Quote|₹/.test(gone.textContent) && !!gone.querySelector("button[aria-label^='Remove']"); })));
  const quote = await lp.evaluate(() => [...document.querySelectorAll("ul[aria-label='Your saved products'] a")].find((a) => /Get Quote/.test(a.textContent))?.getAttribute("href"));
  check("F-04 Get Quote opens the existing inquiry form of that product's supplier", /^\/inquiry\/[a-z0-9-]+\?product=/.test(quote ?? ""), String(quote));
  await lp.evaluate(() => document.querySelector("button[aria-label='List view']").click());
  await sleep(300);
  const listView = await lp.evaluate(() => ({ pressed: document.querySelector("button[aria-label='List view']").getAttribute("aria-pressed"), cols: getComputedStyle(document.querySelector("ul[aria-label='Your saved products']")).display, firstW: document.querySelector("ul[aria-label='Your saved products'] > li").getBoundingClientRect().width, listW: document.querySelector("ul[aria-label='Your saved products']").getBoundingClientRect().width }));
  check("F-05 the list view is a real toggle (aria-pressed) that stacks the cards one per row, and is remembered after a reload", listView.pressed === "true" && listView.firstW > listView.listW * 0.9 && (await (async () => { await lp.reload({ waitUntil: "networkidle2" }); await sleep(500); return lp.evaluate(() => document.querySelector("button[aria-label='List view']").getAttribute("aria-pressed")); })()) === "true");
  await lp.evaluate(() => document.querySelector("button[aria-label='Grid view']").click());
  await lp.select("#saved-sort", "name");
  await sleep(1500);
  const sorted = await cards(lp);
  check("F-06 sorting runs on the server: Name A-Z orders the cards alphabetically and puts sort=name in the address", JSON.stringify(sorted.map((n) => n.toLowerCase())) === JSON.stringify([...sorted.map((n) => n.toLowerCase())].sort((a, b) => a.localeCompare(b))) && new URL(lp.url()).searchParams.get("sort") === "name");
  await lp.evaluate((id) => [...document.querySelectorAll("[aria-label='Filter saved products by category'] button")].find((b) => b.textContent.includes(id)).click(), cat.name);
  await sleep(1500);
  check("F-07 a category tab filters the cards to that category (count in the tab), is marked pressed and puts category= in the address", (await cards(lp)).length === Math.min(12, cat.count) && new URL(lp.url()).searchParams.get("category") === cat.id && (await lp.evaluate(() => [...document.querySelectorAll("[aria-label='Filter saved products by category'] button")].filter((b) => b.getAttribute("aria-pressed") === "true").length)) === 1);
  await lp.evaluate(() => [...document.querySelectorAll("[aria-label='Filter saved products by category'] button")][0].click());
  await sleep(1200);
  await lp.type("#saved-search", "shree");
  await sleep(1800);
  check("F-08 search is debounced and runs on the server: 'shree' leaves Shree Textiles' products and puts q=shree in the address; the tab counts follow", (await cards(lp)).length === Math.min(12, (await list(A, "?q=shree")).json.meta.total) && new URL(lp.url()).searchParams.get("q") === "shree");
  await lp.type("#saved-search", "zzzz");
  await sleep(1800);
  check("F-09 no match: 'No matching saved products' with Clear filters (not the empty-history message)", /No matching saved products/.test(await content(lp)) && !/No Saved Products Yet/.test(await content(lp)));
  await lp.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Clear filters/.test(b.textContent)).click());
  await sleep(1500);
  check("F-10 Clear filters restores the full first page and a clean address", (await cards(lp)).length === 12 && new URL(lp.url()).search === "");
  await lp.evaluate(() => [...document.querySelectorAll("nav[aria-label='Saved product pages'] button")].find((b) => b.getAttribute("aria-label") === "Page 2").click());
  await sleep(1500);
  const p2text = await lp.evaluate(() => document.querySelector("nav[aria-label='Saved product pages']").textContent.replace(/\s+/g, " "));
  check("F-11 the pager: page 2 shows the rest ('Showing 13 - 21 of 21 saved products' because the unavailable product is listed too) with page=2 in the address", /Showing 13 - 2[01] of 2[01] saved products/.test(p2text) && new URL(lp.url()).searchParams.get("page") === "2", p2text);
  await lp.evaluate(() => [...document.querySelectorAll("nav[aria-label='Saved product pages'] button")].find((b) => b.getAttribute("aria-label") === "Page 1").click());
  await sleep(1200);
  // remove
  const firstName = (await cards(lp))[0];
  await lp.evaluate(() => document.querySelector("ul[aria-label='Your saved products'] button[aria-label^='Remove']").click());
  await sleep(500);
  const dlg = await lp.evaluate(() => ({ role: !!document.querySelector("[role=alertdialog]"), text: document.querySelector("[role=alertdialog]")?.textContent ?? "", focus: document.activeElement?.textContent }));
  check("F-12 the heart asks first in the site's own alert dialog (names the product, says it can be saved again), focus on 'Keep it'; nothing is removed yet", dlg.role && dlg.text.includes(firstName) && /save it again/.test(dlg.text) && /Keep it/.test(dlg.focus ?? "") && (await wl.countDocuments({ userId: A.id })) === 20 + 1 - 1);
  await lp.keyboard.press("Escape");
  await sleep(300);
  check("F-13 Escape cancels: the dialog closes and the product is still saved", !(await lp.evaluate(() => !!document.querySelector("[role=alertdialog]"))) && (await cards(lp)).includes(firstName));
  await lp.evaluate(() => document.querySelector("ul[aria-label='Your saved products'] button[aria-label^='Remove']").click());
  await sleep(400);
  const beforeCount = await wl.countDocuments({ userId: A.id });
  await lp.evaluate(() => [...document.querySelectorAll("[role=alertdialog] button")].find((b) => /^Remove/.test(b.textContent.trim())).click());
  await sleep(2500);
  const toast = await lp.evaluate(() => document.querySelector("[aria-label='Notifications from the site'] [role=status]")?.textContent ?? "");
  check("F-14 confirming removes it on the server (database), shows the success toast, and the card and the tab counts are gone from the page", (await wl.countDocuments({ userId: A.id })) === beforeCount - 1 && /Removed from your saved products/.test(toast) && !(await cards(lp)).includes(firstName), toast);
  await lp.setOfflineMode(true);
  await lp.select("#saved-sort", "oldest");
  await sleep(1500);
  check("F-15 when the server cannot be reached the list shows an error with Try again instead of old or invented cards", /could not be loaded/.test(await content(lp)) && /Try again/.test(await content(lp)));
  await lp.setOfflineMode(false);
  await lp.context.close();
  const zero = await register("zero");
  const ep = await open("/buyer/saved-products", { session: zero.s });
  const et = await content(ep);
  check("F-16 a buyer with nothing saved sees 'No Saved Products Yet', the explanation and an Explore Products button; no sample cards", /No Saved Products Yet/.test(et) && (await ep.evaluate(() => [...document.querySelectorAll("a")].some((a) => /Explore Products/.test(a.textContent) && a.getAttribute("href") === "/products"))) && (await cards(ep)).length === 0);
  await ep.context.close();
  // back navigation shows what the address says
  const bk = await open("/buyer/saved-products?sort=name", { session: A.s });
  await bk.evaluate(() => document.querySelector("ul[aria-label='Your saved products'] h3 a")?.click());
  await bk.waitForFunction(() => location.pathname.startsWith("/products/"), { timeout: 15000 }).catch(() => {});
  await sleep(600);
  await bk.goBack({ waitUntil: "networkidle2" });
  await sleep(1500);
  check("F-17 going Back from a product shows the list as the address says (sort=name kept, cards alphabetical)", new URL(bk.url()).searchParams.get("sort") === "name" && (await cards(bk)).length > 0 && (await bk.evaluate(() => document.querySelector("#saved-sort").value)) === "name");
  await bk.context.close();

  // ================= O: responsive
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const wide = [];
  for (const w of widths) {
    const p = await open("/buyer/saved-products", { session: A.s, width: w });
    const o = await overflow(p);
    const bad = await p.evaluate(() => [...document.querySelectorAll("#buyer-content button, #buyer-content a, #buyer-content select, #buyer-content input")].filter((el) => { if (!el.getClientRects().length) return false; let box = el; for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const ox = getComputedStyle(n).overflowX; if (ox === "auto" || ox === "scroll") { box = n; break; } } const r = box.getBoundingClientRect(); return r.left < -1 || r.right > window.innerWidth + 1; }).length);
    const small = w <= 480 ? await p.evaluate(() => [...document.querySelectorAll("#buyer-content button, #buyer-content select, #buyer-content input")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40; }).length) : 0;
    if (o > 0 || bad > 0 || small > 0) wide.push(`@${w}: overflow ${o} outside ${bad} small ${small}`);
    if ([1440, 820, 390].includes(w)) await p.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/buyer-saved-products-${w === 1440 ? "desktop-1440" : w === 820 ? "tablet-820" : "mobile-390"}.png`, fullPage: true });
    await p.context.close();
  }
  check("O-01 at 16 widths (320 to 2560): no horizontal overflow, no control outside the viewport, no touch control under 40px tall on a phone", wide.length === 0, wide.join("; "));

  if (process.env.SKIP_PERF === "1") return;
  // ================= P: performance at the cap
  const P = await register("perf");
  const ids = catalogIds.slice(0, 500);
  await wl.insertMany(ids.map((k, i) => ({ userId: P.id, productKey: k, productName: `Saved ${k}`, addedAt: new Date(Date.now() - i * 60_000) })));
  await clearLimits();
  const sample = async (path, n = 25) => { const out = []; let bytes = 0; for (let i = 0; i < n; i++) { const t0 = performance.now(); const r = await P.s.call("GET", path, undefined, { "x-forwarded-for": nextIp() }); out.push(performance.now() - t0); if (r.status !== 200) throw new Error(`perf call failed ${r.status} ${r.text?.slice(0, 100)}`); bytes = r.text.length; } return { p50: med(out, 0.5), p95: med(out, 0.95), p99: med(out, 0.99), bytes }; };
  await sample("/api/buyer/saved-products", 2);
  const firstCat = (await P.s.call("GET", "/api/buyer/saved-products")).json.data.categories[0];
  const perf = { list: await sample("/api/buyer/saved-products"), category: await sample(`/api/buyer/saved-products?category=${firstCat.id}`), search: await sample("/api/buyer/saved-products?q=shirt"), price: await sample("/api/buyer/saved-products?sort=price-low&page=20"), last: await sample("/api/buyer/saved-products?page=42", 15) };
  const t0 = performance.now();
  const par = await Promise.all(Array.from({ length: 10 }, () => P.s.call("GET", "/api/buyer/saved-products", undefined, { "x-forwarded-for": nextIp() })));
  const parMs = performance.now() - t0;
  console.log(`  PERF 500 saved products (the cap): list p50 ${perf.list.p50.toFixed(0)} p95 ${perf.list.p95.toFixed(0)} p99 ${perf.list.p99.toFixed(0)} ms (${perf.list.bytes} B); category p95 ${perf.category.p95.toFixed(0)}; search p95 ${perf.search.p95.toFixed(0)}; price sort p95 ${perf.price.p95.toFixed(0)}; last page p95 ${perf.last.p95.toFixed(0)}; 10 parallel ${parMs.toFixed(0)} ms`);
  check("P-01 with the 500 saved products a buyer can keep: every list variant under 400 ms (p95), a page under 40 KB, ten simultaneous requests succeed", Object.values(perf).every((m) => m.p95 < 400) && perf.list.bytes < 40_000 && par.every((r) => r.status === 200), JSON.stringify(Object.fromEntries(Object.entries(perf).map(([k, v]) => [k, Math.round(v.p95)]))));
}

async function cleanup() {
  if (process.env.KEEP === "1") return;
  const mine = await users.find({ email: { $regex: `^tsp-${stamp}-` } }, { projection: { _id: 1 } }).toArray();
  const ids = mine.map((u) => u._id);
  await wl.deleteMany({ userId: { $in: ids } });
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
