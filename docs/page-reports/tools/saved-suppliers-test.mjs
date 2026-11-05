import fs from "node:fs";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Buyer Saved Suppliers (Page 34): /buyer/saved-suppliers, /buyer/compare-suppliers and /api/buyer/saved-suppliers*
// (saving and removing ONE supplier use the existing /api/buyer/wishlist/suppliers routes). Needs a running `next start`
// (BASE, default :3100) on MONGODB_DB=finbynmart_test, Chrome and puppeteer-core. Removes its own users and saved rows at the end
// unless KEEP=1. SKIP_PERF=1 skips group P.
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
const users = db.collection("users"), ws = db.collection("wishlist_suppliers"), audit = db.collection("security_events");
const clearLimits = () => db.collection("rate_limits").deleteMany({});
await clearLimits();

const stamp = Date.now();
const emailOf = (tag) => `tss-${stamp}-${tag}@example.test`;
let ipN = 0;
const nextIp = () => `10.31.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "saved supplier test passphrase";

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
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Saved ${tag.toUpperCase()} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: "Saved Supplier Traders", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
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
const cardsSel = "ul[aria-label='Your saved suppliers'] > li";
const cards = (p) => p.evaluate((s) => document.querySelectorAll(s).length, cardsSel);
const waitCards = (p, n) => p.waitForFunction((s, x) => document.querySelectorAll(s).length === x, { timeout: 8000 }, cardsSel, n).catch(() => {});
const list = (s, q = "") => s.call("GET", `/api/buyer/saved-suppliers${q}`);
const sum = (s) => s.call("GET", "/api/buyer/saved-suppliers/summary");
const save = (s, id) => s.call("POST", "/api/buyer/wishlist/suppliers", { supplierId: id });
const bulk = (s, ids) => s.call("POST", "/api/buyer/saved-suppliers/bulk-remove", { supplierIds: ids });
const cmp = (s, ids) => s.call("POST", "/api/buyer/saved-suppliers/compare", { supplierIds: ids });
const med = (a, q) => { const x = [...a].sort((m, n) => m - n); return x[Math.min(x.length - 1, Math.floor(q * x.length))]; };
// one untimed call first (cold caches), then n timed ones
const timeIt = async (fn, n = 15) => { await fn(); const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); await fn(); t.push(performance.now() - s); } return { p50: med(t, 0.5), p95: med(t, 0.95), p99: med(t, 0.99) }; };

async function main() {
  const A = await register("a"), B = await register("b"), C = await register("c"), D = await register("d"), F = await register("f");
  const SUPPLIER = new Session();
  await SUPPLIER.call("POST", "/api/auth/register/supplier", { businessName: "Saved Supplier Co", contactName: "Sia Rao", email: emailOf("sup"), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });

  // buyer A: the sample supplier, 15 real catalogue sellers (the seed has gaps and inactive sellers: only Active ones resolve) and one that no longer exists
  const sellerRows = fs.readFileSync(`${ROOT}/db/seed/sellers.csv`, "utf8").split(/\r?\n/).slice(1).filter((l) => l.trim().endsWith(",Active"));
  const sellerIds = sellerRows.map((l) => l.split(",")[0]).filter((id) => /^SLR\d+$/.test(id));
  const keys = ["shree-textiles", ...sellerIds.slice(0, 15)];
  const FIRST = sellerIds[0], LAST = sellerIds[14], OTHER = sellerIds[20], SPARE = sellerIds[21];
  const statuses = [];
  for (const k of keys) { statuses.push((await save(A.s, k)).status); await sleep(15); }
  await ws.insertOne({ userId: A.id, supplierKey: "gone-supplier", supplierName: "Vanished Traders", addedAt: new Date(Date.now() - 86_400_000 * 400) });
  const savedCount = keys.length + 1;
  await save(B.s, sellerIds[2]);

  // ================= A: access
  const un = new Session();
  const anon = await Promise.all([list(un), sum(un), bulk(un, [FIRST]), cmp(un, [FIRST, LAST]), un.call("DELETE", "/api/buyer/saved-suppliers", { confirm: true })]);
  check("A-01 no session: every route answers 401, private, nothing returned", anon.every((r) => r.status === 401 && /no-store/.test(r.headers.get("cache-control") ?? "") && !/Shree/.test(r.text ?? "")), anon.map((r) => r.status).join(" "));
  const sup = await Promise.all([list(SUPPLIER), sum(SUPPLIER), bulk(SUPPLIER, [FIRST]), cmp(SUPPLIER, [FIRST, LAST]), SUPPLIER.call("DELETE", "/api/buyer/saved-suppliers", { confirm: true })]);
  check("A-02 a supplier account: every route answers 403", sup.every((r) => r.status === 403), sup.map((r) => r.status).join(" "));
  const forged = new Session(); forged.jar.set("finbyn_session", "garbage.value");
  check("A-03 a forged session cookie: 401", (await list(forged)).status === 401);
  const anonPages = await Promise.all(["/buyer/saved-suppliers", `/buyer/compare-suppliers?ids=${FIRST},${LAST}`].map((p) => un.page(p)));
  check("A-04 both pages without a session redirect to sign-in and carry no supplier data", anonPages.every((r) => [302, 303, 307, 308].includes(r.status) && /sign-in/.test(r.location ?? "") && !/Shree/.test(r.text)));
  check("A-05 saving through the existing shared route works for every seeded supplier (201)", statuses.every((s) => s === 201), statuses.join(""));

  // ================= B: isolation
  const bl = (await list(B.s)).json;
  check("B-01 buyer B sees only B's one saved supplier, never A's", bl.data.total === 1 && bl.data.totalSaved === 1 && !bl.data.items.some((i) => i.key === "shree-textiles"));
  check("B-02 a buyerId in the query is ignored: the session decides", (await list(B.s, `?buyerId=${A.id}&userId=${A.id}`)).json.data.totalSaved === 1);
  const del = await B.s.call("DELETE", "/api/buyer/wishlist/suppliers/shree-textiles");
  check("B-03 B removing A's supplier through the shared route changes nothing for A (removed:false)", del.json?.removed === false && (await ws.countDocuments({ userId: A.id })) === savedCount);
  const bb = await bulk(B.s, ["shree-textiles", FIRST, LAST]);
  check("B-04 B's bulk removal of A's suppliers reports all as not saved and A keeps every one", bb.status === 200 && bb.json.removedCount === 0 && bb.json.notSaved.length === 3 && (await ws.countDocuments({ userId: A.id })) === savedCount);
  const bc = await cmp(B.s, ["shree-textiles", FIRST]);
  check("B-05 B comparing A's suppliers is 404 with nothing of them (not saved by B)", bc.status === 404 && !/Shree/.test(bc.text));
  check("B-06 B's compare page for A's suppliers is the site's 404", (await B.s.page(`/buyer/compare-suppliers?ids=shree-textiles,${FIRST}`)).status === 404);

  // ================= C: list
  const full = await list(A.s, "?limit=48");
  const d = full.json.data;
  check("C-01 A's list holds all 17 saved (16 real + 1 vanished), private no-store, newest first", full.status === 200 && d.total === savedCount && d.totalSaved === savedCount && /no-store/.test(full.headers.get("cache-control") ?? "") && d.items[0].key === LAST && d.items.at(-1).key === "gone-supplier", `${d.total} ${d.items[0]?.key}`);
  const gone = d.items.find((i) => i.key === "gone-supplier");
  check("C-02 a supplier that left the catalogue is listed as unavailable with the name it was saved under (not dropped), with no links, counts or verification", gone.available === false && gone.name === "Vanished Traders" && gone.url === null && gone.inquiryHref === null && gone.productCount === null && gone.verified === false);
  const shree = d.items.find((i) => i.key === "shree-textiles");
  check("C-03 a sample supplier shows its real public facts (name, location, counts) and a Contact link to its inquiry form", shree.available && shree.name === "Shree Textiles" && shree.location && shree.url === "/suppliers/shree-textiles" && shree.inquiryHref === "/inquiry/shree-textiles" && typeof shree.verified === "boolean" && shree.productCount > 0 && shree.categoryCount > 0, JSON.stringify({ ...shree, description: (shree.description ?? "").slice(0, 30) }));
  const real = d.items.filter((i) => i.available && i.key.startsWith("SLR"));
  check("C-04 catalogue sellers are never shown as verified and state no type or description (their records have none); they show city, state, product count, category count and a profile link", real.length === 15 && real.every((i) => i.verified === false && i.supplierType === null && i.description === null && i.city && i.state && i.productCount > 0 && i.categoryCount >= 1 && /^\/suppliers\//.test(i.url ?? "")));
  check("C-05 no contact, private or invented fields: no e-mail, phone, owner, user id, rating, review, logo or banner anywhere in the list", !/email|phone|owner|userId|rating|review|total_orders|logo|banner|@example/i.test(JSON.stringify(d.items)));
  const names = async (sort) => (await list(A.s, `?sort=${sort}&limit=48`)).json.data.items;
  const nAsc = (await names("name")).map((i) => i.name.toLowerCase()), nDesc = (await names("name-desc")).map((i) => i.name.toLowerCase());
  const asc = [...nAsc].sort((a, b) => a.localeCompare(b));
  check("C-06 sorting: Name A-Z and Z-A are true orderings; oldest saved first puts the 400-day-old one first", nAsc.join() === asc.join() && nDesc.join() === [...asc].reverse().join() && (await names("oldest"))[0].key === "gone-supplier");
  const byProducts = (await names("products")).filter((i) => i.available).map((i) => i.productCount), byCats = (await names("categories")).filter((i) => i.available).map((i) => i.categoryCount);
  check("C-07 Most Products and Most Categories are non-increasing, and the unavailable supplier goes last in both", byProducts.every((n, i, x) => i === 0 || x[i - 1] >= n) && byCats.every((n, i, x) => i === 0 || x[i - 1] >= n) && (await names("products")).at(-1).key === "gone-supplier" && (await names("categories")).at(-1).key === "gone-supplier");
  check("C-08 ties are broken the same way every time (the same query twice gives the same order)", JSON.stringify((await names("products")).map((i) => i.key)) === JSON.stringify((await names("products")).map((i) => i.key)));
  const probe = real[0];
  const keysOf = async (q) => (await list(A.s, `?limit=48&${q}`)).json.data.items.map((i) => i.key);
  check("C-09 search matches supplier name, city, state and category (case-insensitive); a regex character is taken literally", (await keysOf(`q=${encodeURIComponent(probe.name.slice(0, 8).toUpperCase())}`)).includes(probe.key) && (await keysOf(`q=${encodeURIComponent(probe.city)}`)).includes(probe.key) && (await keysOf(`q=${encodeURIComponent(probe.state)}`)).includes(probe.key) && (await keysOf(`q=${encodeURIComponent(probe.categories[0].name)}`)).includes(probe.key) && (await keysOf("q=.*")).length === 0);
  const sm0 = (await sum(A.s)).json.data;
  const cat = sm0.facets.categories[0], st = sm0.facets.states[0];
  const byCat = await keysOf(`category=${cat.id}`), bySt = await keysOf(`state=${st.id}`);
  check("C-10 category filter: exactly the suppliers that have that category (a supplier can sit under several), counted the same as the facet", byCat.length === cat.count && d.items.filter((i) => i.categories.some((c) => c.id === cat.id)).length === cat.count);
  const cityF = sm0.facets.cities[0];
  check("C-11 state and city filters: exactly that state's suppliers; a city inside a state narrows it further", bySt.length === st.count && (await keysOf(`state=${cityF.stateId}&city=${cityF.id}`)).length === cityF.count);
  const ver = d.items.filter((i) => i.verified).length;
  check("C-12 verification filter: Verified returns exactly the verified ones (Shree only if its own record says so); Not verified returns the rest that are available (never the vanished one)", (await keysOf("verification=verified")).length === ver && (await keysOf("verification=unverified")).length === 16 - ver && !(await keysOf("verification=unverified")).includes("gone-supplier"));
  const typeF = sm0.facets.types.find((t) => t.id === "not-specified");
  check("C-13 supplier type filter: 'Not specified' returns the suppliers whose record states no type (plus the vanished one, which has none); a stated type returns only those", typeF && (await keysOf("type=not-specified")).length === typeF.count + 1);
  check("C-14 filters work together: category + state + not-verified", (await keysOf(`category=${cat.id}&state=${st.id}&verification=unverified`)).every((k) => byCat.includes(k) && bySt.includes(k)));
  const p1 = (await list(A.s, "?limit=5&page=1")).json, p4 = (await list(A.s, "?limit=5&page=4")).json;
  const seen = new Set(); for (let p = 1; p <= 4; p++) for (const i of (await list(A.s, `?limit=5&page=${p}`)).json.data.items) seen.add(i.key);
  check("C-15 pagination: 5 per page over 17 gives 4 pages, the last holds 2, nobody appears twice; the default page size is 12", p1.data.items.length === 5 && p1.meta.totalPages === 4 && p4.data.items.length === 2 && seen.size === savedCount && (await list(A.s)).json.meta.limit === 12);
  const bad = await Promise.all(["?limit=500", "?page=0", "?sort=rating", "?sort=price", "?category=%3Cx%3E", "?verification=pending", "?verification=rejected", `?q=${"x".repeat(200)}`, "?limit=abc"].map((q) => list(A.s, q)));
  check("C-16 invalid filters are refused with 400: rating sort, pending or rejected verification (those do not exist), bad slugs, over-long search, bad paging", bad.every((r) => r.status === 400), bad.map((r) => r.status).join(" "));
  check("C-17 a buyer with nothing saved gets an empty list and zeros", (await list(C.s)).json.data.totalSaved === 0 && (await sum(C.s)).json.data.summary.totalSaved === 0);

  // ================= D: summary
  const s = sm0.summary;
  const live = d.items.filter((i) => i.available);
  check("D-01 the five numbers are the real ones: total saved 17, active 16, verified as the records say, categories and states as distinct counts over the active suppliers", s.totalSaved === 17 && s.active === 16 && s.verified === ver && s.categories === new Set(live.flatMap((i) => i.categories.map((c) => c.id))).size && s.states === new Set(live.map((i) => i.state)).size, JSON.stringify(s));
  const csvState = new Map(sellerRows.map((l) => { const c = l.split(","); return [c[0], c[6]]; }));
  const expectStates = new Set([...keys.slice(1).map((k) => csvState.get(k)), shree.state]);
  check("D-02 the states number agrees with the seed file (independent check) and there is NO country number: supplier records store none", s.states === expectStates.size && !("countries" in s) && !/countr/i.test(JSON.stringify(sm0)), `${s.states} vs ${expectStates.size}`);
  check("D-03 verified is not inferred: it never exceeds the active suppliers, and the verification facets add up to the active ones", s.verified <= s.active && sm0.facets.verification.verified + sm0.facets.verification.unverified === s.active);
  check("D-04 the filter choices come only from what A saved (no supplier of B or of the whole catalogue)", sm0.facets.states.every((x) => expectStates.has(x.name)) && sm0.facets.categories.every((c) => live.some((i) => i.categories.some((k) => k.id === c.id))));

  // ================= E: remove, bulk remove, clear all
  const rm = await A.s.call("DELETE", `/api/buyer/wishlist/suppliers/${FIRST}`);
  const after = (await list(A.s, "?limit=48")).json.data;
  const firstUrl = real.find((i) => i.key === FIRST)?.url ?? probe.url;
  check("E-01 removing one supplier succeeds, the list shrinks by one, and the supplier's own page still exists (only the bookmark went)", rm.status === 200 && rm.json.removed === true && after.total === savedCount - 1 && (await new Session().page(firstUrl)).status === 200);
  const bEmpty = await bulk(A.s, []); const bMany = await bulk(A.s, Array.from({ length: 21 }, (_, i) => `k${i}`)); const bBad = await bulk(A.s, ["ok-key", "<script>"]); const bNon = await A.s.call("POST", "/api/buyer/saved-suppliers/bulk-remove", { supplierIds: "all" });
  check("E-02 bulk removal input: empty, more than 20, an invalid key and a non-list are all refused (400) before anything is touched", [bEmpty, bMany, bBad, bNon].every((r) => r.status === 400) && (await ws.countDocuments({ userId: A.id })) === savedCount - 1);
  const k2 = keys[2], k3 = keys[3];
  const mix = await bulk(A.s, [k2, k3, k2, "never-saved"]);
  check("E-03 bulk removal reports the real outcome per supplier: two removed (a duplicate counts once), one not saved; the rows are gone and nothing else changed", mix.status === 200 && mix.json.removedCount === 2 && mix.json.removed.length === 2 && mix.json.notSaved.join() === "never-saved" && (await ws.countDocuments({ userId: A.id })) === savedCount - 3 && (await ws.countDocuments({ userId: B.id })) === 1);
  for (const k of keys.slice(0, 4)) await save(F.s, k);
  const noConfirm = await F.s.call("DELETE", "/api/buyer/saved-suppliers", {});
  check("E-04 Clear All needs the explicit confirmation: without it 400 and nothing is removed", noConfirm.status === 400 && (await ws.countDocuments({ userId: F.id })) === 4 && (await F.s.call("DELETE", "/api/buyer/saved-suppliers", { confirm: "yes" })).status === 400 && (await ws.countDocuments({ userId: F.id })) === 4);
  const auditBefore = await audit.countDocuments({ userId: F.id, type: "saved_suppliers_cleared" });
  const clr = await F.s.call("DELETE", "/api/buyer/saved-suppliers", { confirm: true });
  check("E-05 Clear All removes only the buyer's own bookmarks (4), reports the real count and is logged; A's and B's lists and the suppliers are untouched", clr.status === 200 && clr.json.removed === 4 && (await ws.countDocuments({ userId: F.id })) === 0 && (await ws.countDocuments({ userId: B.id })) === 1 && (await ws.countDocuments({ userId: A.id })) === savedCount - 3 && (await audit.countDocuments({ userId: F.id, type: "saved_suppliers_cleared" })) === auditBefore + 1);
  check("E-06 clearing again removes 0 and is not an error", (await F.s.call("DELETE", "/api/buyer/saved-suppliers", { confirm: true })).json?.removed === 0);
  const idx = await ws.indexes();
  check("E-07 saving the same supplier twice is harmless (200, alreadySaved) and keeps one row; the unique index and the newest-first index exist", (await save(A.s, keys[4])).json?.alreadySaved === true && (await ws.countDocuments({ userId: A.id, supplierKey: keys[4] })) === 1 && idx.some((i) => i.unique && JSON.stringify(i.key) === JSON.stringify({ userId: 1, supplierKey: 1 })) && idx.some((i) => i.name === "buyer_saved_suppliers_newest"));

  // ================= F: comparison
  await save(A.s, keys[2]); await save(A.s, keys[3]);
  const c2 = await cmp(A.s, ["shree-textiles", keys[2]]);
  const cd = c2.json?.data;
  check("F-01 comparing two saved suppliers returns both columns in the order asked with the supplier's own type, verification, categories, product count, location and member-since; private no-store", c2.status === 200 && cd.columns.map((c) => c.key).join() === `shree-textiles,${keys[2]}` && cd.fields.length === 7 && /no-store/.test(c2.headers.get("cache-control") ?? "") && cd.columns[0].values.verification && cd.columns[1].values.verification === "Not verified");
  check("F-02 differing rows are flagged; missing values are null (Not Provided), never filled in: a catalogue seller has no business type", cd.fields.find((f) => f.key === "location").differs === true && cd.columns[1].values.type === null);
  check("F-03 NO ranking or verdict: no best, top supplier, recommended, score, rank, winner or rating anywhere", !/\b(best|top supplier|recommended?|score|rank(ed|ing)?|winner|ratings?)\b/i.test(JSON.stringify({ f: cd.fields.map((x) => x.label), v: cd.columns.map((c) => c.values) })));
  const c1 = await cmp(A.s, ["shree-textiles"]), c5 = await cmp(A.s, keys.slice(0, 5)), cdup = await cmp(A.s, ["shree-textiles", "shree-textiles"]);
  check("F-04 fewer than two (also the same one twice) or more than four are refused with 400; four are allowed", c1.status === 400 && c5.status === 400 && cdup.status === 400 && (await cmp(A.s, ["shree-textiles", keys[2], keys[3], keys[4]])).status === 200, `${c1.status} ${c5.status} ${cdup.status}`);
  check("F-05 a supplier that is not saved, or that left the catalogue, makes the whole request 404 with no hint which", (await cmp(A.s, ["shree-textiles", sellerIds[30]])).status === 404 && (await cmp(A.s, ["shree-textiles", "gone-supplier"])).status === 404);
  const before = await ws.countDocuments({ userId: A.id });
  await cmp(A.s, ["shree-textiles", keys[2], keys[3]]);
  check("F-06 comparing changes nothing: the saved list is the same afterwards", before === (await ws.countDocuments({ userId: A.id })));

  // ================= G: cap
  const rows500 = Array.from({ length: 500 }, (_, i) => ({ userId: D.id, supplierKey: `cap-${i}`, supplierName: `Cap ${i}`, addedAt: new Date(Date.now() - i * 1000) }));
  await ws.insertMany(rows500);
  const over = await save(D.s, OTHER);
  check("G-01 at 500 saved suppliers a new one is refused (409) with the reason, nothing is stored", over.status === 409 && /500/.test(over.json?.message ?? "") && (await ws.countDocuments({ userId: D.id })) === 500);
  await ws.deleteOne({ userId: D.id, supplierKey: "cap-499" });
  check("G-02 once a place is free (499 saved) saving works again", (await save(D.s, SPARE)).status === 201);
  await ws.deleteMany({ userId: D.id });

  // ================= H: pages (browser)
  await clearLimits();
  const a0 = await ws.countDocuments({ userId: A.id });
  const lp = await open("/buyer/saved-suppliers", { session: A.s });
  await hydrated(lp, "#saved-supplier-search");
  await sleep(500);
  const nav = await lp.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, active: document.querySelector("#buyer-sidebar [aria-current]")?.textContent.trim() ?? null, robots: document.querySelector("meta[name=robots]")?.content, crumb: document.querySelector("#buyer-content")?.textContent.slice(0, 80), kpis: [...document.querySelectorAll("ul[aria-label='Saved supplier summary'] li")].map((li) => li.textContent.replace(/\s+/g, " ")) }));
  check("H-01 the page: buyer shell with Saved Suppliers current, heading and breadcrumb, noindex, five summary cards with the real numbers, 12 cards on the first page, no console errors", lp.status === 200 && nav.h1 === "Saved Suppliers" && /Saved Suppliers/.test(nav.active ?? "") && /Home \/ Buyer Dashboard \/ Saved Suppliers/.test(nav.crumb) && /noindex/.test(nav.robots ?? "") && nav.kpis.length === 5 && new RegExp(`Total Saved\\s*${a0}`).test(nav.kpis[0]) && /Active Suppliers\s*\d/.test(nav.kpis[2]) && /States\s*\d/.test(nav.kpis[4]) && (await cards(lp)) === 12 && lp.errs.length === 0, JSON.stringify(nav.kpis));
  const cardText = await lp.evaluate((s) => document.querySelector(s).parentElement.textContent.replace(/\s+/g, " "), cardsSel);
  check("H-02 cards show verification text (Verified supplier / Not verified), location, counts, saved date and the actions Contact Supplier and View Profile; no contact details, logo, banner or rating", /Not verified/.test(cardText) && /Contact Supplier/.test(cardText) && /View Profile/.test(cardText) && /Saved on/.test(cardText) && /categor/.test(cardText) && !/@|\+91|Phone|E-?mail|Rating|Review/i.test(cardText));
  await lp.type("#saved-supplier-search", "Shree Textiles");
  await waitCards(lp, 1);
  const sUrl = await lp.evaluate((s) => ({ n: document.querySelectorAll(s).length, url: location.search }), cardsSel);
  check("H-03 search is debounced, filters in place (1 supplier) and is kept in the address; Clear search restores the list", sUrl.n === 1 && /q=Shree/.test(sUrl.url));
  await lp.click("button[aria-label='Clear search']");
  await waitCards(lp, 12);
  await clickText(lp, "button", "Filters");
  await lp.waitForSelector("[role=dialog]");
  await lp.evaluate((v) => { const sel = [...document.querySelectorAll("[role=dialog] select")].find((x) => [...x.options].some((o) => o.value === v)); sel.value = v; sel.dispatchEvent(new Event("change", { bubbles: true })); }, st.id);
  await clickText(lp, "[role=dialog] button", "Apply");
  await waitCards(lp, Math.min(st.count, 12));
  const flt = await lp.evaluate((s) => ({ n: document.querySelectorAll(s).length, url: location.search, chips: [...document.querySelectorAll("ul[aria-label='Active filters'] li")].map((l) => l.textContent.trim()) }), cardsSel);
  check("H-04 the Filters dialog applies a state filter (the right number of suppliers), shows it as a removable chip, keeps it in the address", flt.n === Math.min(st.count, 12) && /state=/.test(flt.url) && flt.chips.some((c) => c.includes(st.name)), JSON.stringify(flt));
  await clickText(lp, "button", "Clear all filters");
  await waitCards(lp, 12);
  await lp.select("#saved-supplier-sort", "name");
  await lp.waitForFunction(() => /sort=name/.test(location.search), { timeout: 8000 }).catch(() => {});
  await sleep(500);
  const firstNames = await lp.evaluate((s) => [...document.querySelectorAll(`${s} h3`)].map((h) => h.textContent.toLowerCase()), cardsSel);
  check("H-05 sorting re-reads the server: the first page is in A-Z order", firstNames.length === 12 && firstNames.join() === [...firstNames].sort((x, y) => x.localeCompare(y)).join());
  await lp.click("button[aria-label='List view']");
  await sleep(300);
  const listView = await lp.evaluate(() => ({ cls: document.querySelector("ul[aria-label='Your saved suppliers']").className, stored: localStorage.getItem("finbyn.savedSuppliers.view"), pressed: document.querySelector("button[aria-label='List view']").getAttribute("aria-pressed") }));
  const gridCols = async () => lp.evaluate(() => getComputedStyle(document.querySelector("ul[aria-label='Your saved suppliers']")).gridTemplateColumns.split(" ").length);
  const listCols = await gridCols();
  await lp.click("button[aria-label='Grid view']");
  await sleep(300);
  check("H-06 the List view switches the layout (one column), is remembered, keeps the filters, and Grid view returns to several columns", listView.pressed === "true" && /supplierList/.test(listView.cls) && listView.stored === "list" && listCols === 1 && (await gridCols()) > 1 && /sort=name/.test(await lp.evaluate(() => location.search)));
  const boxes = await lp.$$(`${cardsSel} input[type=checkbox]`);
  await boxes[0].click();
  const one = await lp.evaluate(() => { const find = (re) => [...document.querySelectorAll("a, button")].find((e) => re.test(e.textContent)); return { cmp: find(/Compare Selected/)?.tagName, addTag: find(/Add to Inquiry/)?.tagName, href: find(/Add to Inquiry/)?.getAttribute("href") ?? null, text: document.querySelector("#buyer-content").textContent }; });
  check("H-07 selecting one supplier: the count shows, Add to Inquiry becomes a link to that supplier's inquiry form, Compare stays disabled (needs 2 to 4); selecting changes nothing saved", /1 selected/.test(one.text) && one.addTag === "A" && /^\/inquiry\//.test(one.href ?? "") && one.cmp === "BUTTON" && (await ws.countDocuments({ userId: A.id })) === a0);
  await boxes[1].click();
  const two = await lp.evaluate(() => { const find = (re) => [...document.querySelectorAll("a, button")].find((e) => re.test(e.textContent)); return { addTag: find(/Add to Inquiry/)?.tagName, cmpHref: find(/Compare Selected/)?.getAttribute("href") ?? null }; });
  check("H-08 two selected: Compare Selected becomes a link to /buyer/compare-suppliers with exactly those suppliers; Add to Inquiry is disabled (an inquiry goes to one supplier at a time, and the page says so)", /^\/buyer\/compare-suppliers\?ids=[^,]+,[^,]+$/.test(two.cmpHref ?? "") && two.addTag === "BUTTON" && /one supplier at a time/.test(await content(lp)));
  await lp.evaluate(() => [...document.querySelectorAll("input[type=checkbox]")].find((c) => /Select all on this page/.test(c.closest("label")?.textContent ?? "")).click());
  await sleep(300);
  const all12 = /12 selected/.test(await content(lp));
  await clickText(lp, "button", "Clear selection");
  await sleep(200);
  check("H-09 Select all picks every supplier on the page (12), the Clear selection link empties it", all12 && /0 selected/.test(await content(lp)));
  await boxes[0].click(); await boxes[1].click();
  await clickText(lp, "a", "Compare Selected");
  await lp.waitForFunction(() => /compare-suppliers/.test(location.pathname), { timeout: 10000 }).catch(() => {});
  await sleep(700);
  const ct = await content(lp);
  check("H-10 Compare Selected opens the supplier comparison with the two suppliers, 'Differs' words, Not Provided for missing values, no score or ranking, and a link back", /Compare Suppliers/.test(ct) && /Differs/.test(ct) && /Not Provided|Not verified/.test(ct) && !/\b(best|top supplier|recommended|winner|score)\b/i.test(await lp.evaluate(() => document.querySelector("table").textContent)) && /Back to Saved Suppliers/.test(ct) && (await lp.evaluate(() => document.querySelectorAll("table thead th[scope=col]").length)) === 3, JSON.stringify({ path: await lp.evaluate(() => location.pathname + location.search), cols: await lp.evaluate(() => document.querySelectorAll("table thead th[scope=col]").length), text: ct.slice(0, 240) }));
  await lp.context.close();

  const rp = await open("/buyer/saved-suppliers", { session: A.s });
  await hydrated(rp, "#saved-supplier-search");
  await sleep(500);
  const total1 = await ws.countDocuments({ userId: A.id });
  await rp.evaluate((s) => document.querySelector(`${s} button[aria-label^='Remove']`).click(), cardsSel);
  await rp.waitForSelector("[role=alertdialog], [role=dialog]");
  const keep = await rp.evaluate(() => document.querySelector("[role=alertdialog], [role=dialog]").textContent.replace(/\s+/g, " "));
  await clickText(rp, "[role=alertdialog] button, [role=dialog] button", "Keep them");
  check("H-11 the heart asks first; the dialog says only the bookmark goes (supplier and products unaffected); 'Keep them' closes it and nothing is removed", /Only your own bookmarks are removed/.test(keep) && !(await rp.$("[role=alertdialog], [role=dialog]")) && (await ws.countDocuments({ userId: A.id })) === total1);
  await rp.evaluate((s) => document.querySelector(`${s} button[aria-label^='Remove']`).click(), cardsSel);
  await rp.waitForSelector("[role=alertdialog], [role=dialog]");
  await clickText(rp, "[role=alertdialog] button, [role=dialog] button", "Remove");
  await rp.waitForFunction(() => !document.querySelector("[role=alertdialog], [role=dialog]"), { timeout: 10000 }).catch(() => {});
  await sleep(900);
  check("H-12 confirming removes it on the server (one row fewer), the Total Saved number follows, with a toast that gives the real count", (await ws.countDocuments({ userId: A.id })) === total1 - 1 && new RegExp(`Total Saved\\s*${total1 - 1}`).test(await content(rp)) && /Removed 1 supplier/.test(await rp.evaluate(() => document.body.textContent)));
  const boxes2 = await rp.$$(`${cardsSel} input[type=checkbox]`);
  await boxes2[0].click(); await boxes2[1].click(); await boxes2[2].click();
  await clickText(rp, "button", "Remove Selected");
  await rp.waitForSelector("[role=alertdialog], [role=dialog]");
  const bt = await rp.evaluate(() => document.querySelector("[role=alertdialog], [role=dialog]").textContent.replace(/\s+/g, " "));
  await clickText(rp, "[role=alertdialog] button, [role=dialog] button", "Remove");
  await rp.waitForFunction(() => !document.querySelector("[role=alertdialog], [role=dialog]"), { timeout: 10000 }).catch(() => {});
  await sleep(900);
  check("H-13 Remove Selected asks first naming the count, then removes exactly those 3 on the server, empties the selection, and the toast gives the real count", /Remove 3 selected suppliers/.test(bt) && (await ws.countDocuments({ userId: A.id })) === total1 - 4 && /Removed 3 suppliers/.test(await rp.evaluate(() => document.body.textContent)) && /0 selected/.test(await content(rp)));
  await clickText(rp, "button", "Clear all saved");
  await rp.waitForSelector("[role=alertdialog], [role=dialog]");
  const ca = await rp.evaluate(() => document.querySelector("[role=alertdialog], [role=dialog]").textContent.replace(/\s+/g, " "));
  await clickText(rp, "[role=alertdialog] button, [role=dialog] button", "Clear all");
  await rp.waitForFunction(() => /No Saved Suppliers Yet/.test(document.body.textContent), { timeout: 12000 }).catch(() => {});
  const t = await content(rp);
  check("H-14 Clear all saved asks first, then empties the buyer's list (and only theirs), and the page shows the honest empty state with the PRD wording and Explore Suppliers; no filler suppliers", /Only your own bookmarks are removed/.test(ca) && (await ws.countDocuments({ userId: A.id })) === 0 && (await ws.countDocuments({ userId: B.id })) === 1 && /No Saved Suppliers Yet/.test(t) && /Save suppliers you trust to quickly revisit/.test(t) && /Explore Suppliers/.test(t) && (await cards(rp)) === 0);
  await rp.context.close();
  const ep = await open("/buyer/saved-suppliers", { session: C.s });
  check("H-15 a buyer with nothing saved sees 'No Saved Suppliers Yet', zeros in the cards, and no console errors", /No Saved Suppliers Yet/.test(await content(ep)) && /Total Saved\s*0/.test(await content(ep)) && ep.errs.length === 0);
  await ep.context.close();
  const supPage = await SUPPLIER.page("/buyer/saved-suppliers");
  check("H-16 a supplier account opening the page sees no saved suppliers", supPage.status !== 200 || !/Total Saved/.test(supPage.text));
  const emptyCmp = await A.s.page("/buyer/compare-suppliers");
  check("H-17 the compare page with no selection explains what to do (no error page)", emptyCmp.status === 200 && /Choose suppliers to compare/.test(emptyCmp.text));

  // ================= R: responsive (17 saved again, so a full page of 12)
  for (const k of keys) await save(A.s, k);
  await ws.insertOne({ userId: A.id, supplierKey: "gone-supplier", supplierName: "Vanished Traders", addedAt: new Date(Date.now() - 86_400_000 * 400) });
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const bad_ = [];
  for (const mode of ["grid", "list"]) {
    for (const w of widths) {
      const p = await open("/buyer/saved-suppliers", { width: w, session: A.s });
      await hydrated(p, "#saved-supplier-search");
      if (mode === "list") { await p.click("button[aria-label='List view']"); await sleep(250); }
      const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const clipped = await p.evaluate(() => [...document.querySelectorAll("#buyer-content h1, #buyer-content h2, #buyer-content h3, #buyer-content li")].filter((e) => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1 && !/auto|scroll/.test(getComputedStyle(e).overflowX)).map((e) => `${e.tagName}:${e.textContent.slice(0, 24)}`));
      if (o > 0 || clipped.length || p.errs.length) bad_.push(`${mode}@${w}: overflow ${o}, clipped ${clipped.slice(0, 2).join("|")}, errors ${p.errs.length}`);
      if (w === 390 || w === 1440) await p.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/34-saved-suppliers-${mode}-${w}.png`, fullPage: true });
      await p.context.close();
    }
  }
  check("R-01 no horizontal overflow, clipped text or console errors at 16 widths (320 to 2560) in both Grid and List view", bad_.length === 0, bad_.join("; "));
  const kb = await open("/buyer/saved-suppliers", { session: A.s });
  await hydrated(kb, "#saved-supplier-search");
  await clickText(kb, "button", "Filters");
  await kb.waitForSelector("[role=dialog]");
  const inDialog = await kb.evaluate(() => document.querySelector("[role=dialog]").contains(document.activeElement));
  await kb.keyboard.press("Escape");
  await sleep(300);
  const tabbable = await kb.evaluate(() => { const c = document.querySelector("ul[aria-label='Your saved suppliers'] input[type=checkbox]"); c.focus(); return document.activeElement === c; });
  check("R-02 the filters dialog takes focus and closes on Escape; the selection checkboxes are keyboard-focusable and labelled", inDialog && !(await kb.$("[role=dialog]")) && tabbable && await kb.evaluate(() => [...document.querySelectorAll("ul[aria-label='Your saved suppliers'] input[type=checkbox]")].every((c) => /^Select /.test(c.getAttribute("aria-label") ?? ""))));
  await kb.context.close();

  if (process.env.SKIP_PERF === "1") return;
  // ================= P: performance with the maximum 500 saved suppliers (real catalogue sellers)
  await clearLimits();
  const P = await register("perf");
  const p500 = sellerIds.slice(0, 500).map((id, i) => ({ userId: P.id, supplierKey: id, supplierName: `x${i}`, addedAt: new Date(Date.now() - i * 1000) }));
  await ws.insertMany(p500);
  const firstCat = (await sum(P.s)).json.data.facets.categories[0].id;
  const t1 = await timeIt(() => list(P.s, "?limit=12"));
  const t2 = await timeIt(() => sum(P.s));
  const t3 = await timeIt(() => list(P.s, "?q=textiles&sort=products&page=2"));
  const t4 = await timeIt(() => list(P.s, `?category=${firstCat}&verification=unverified&sort=name`));
  const t5 = [];
  for (let i = 0; i < 8; i++) { const ids = sellerIds.slice(600 + i * 20, 620 + i * 20); await ws.insertMany(ids.map((id) => ({ userId: P.id, supplierKey: id, supplierName: "y", addedAt: new Date() }))); const s0 = performance.now(); await bulk(P.s, ids); t5.push(performance.now() - s0); }
  const bytes = (await list(P.s, "?limit=12")).text.length;
  const plan = await ws.find({ userId: P.id }).sort({ addedAt: -1, _id: -1 }).limit(500).explain("queryPlanner");
  const stages = JSON.stringify(plan.queryPlanner.winningPlan);
  const par = await Promise.all(Array.from({ length: 10 }, () => list(P.s, "?limit=12")));
  console.log(`  PERF 500 saved: list p50 ${t1.p50.toFixed(0)} p95 ${t1.p95.toFixed(0)} p99 ${t1.p99.toFixed(0)} ms (${bytes} B); summary p50 ${t2.p50.toFixed(0)} p95 ${t2.p95.toFixed(0)}; search+sort p95 ${t3.p95.toFixed(0)}; filtered p95 ${t4.p95.toFixed(0)}; bulk remove of 20 p50 ${med(t5, 0.5).toFixed(0)} p95 ${med(t5, 0.95).toFixed(0)}`);
  check("P-01 with 500 saved suppliers (p95): listing under 350 ms, summary under 300, search and filters under 400, bulk removal of 20 under 500", t1.p95 < 350 && t2.p95 < 300 && t3.p95 < 400 && t4.p95 < 400 && med(t5, 0.95) < 500, `list ${t1.p95.toFixed(0)} summary ${t2.p95.toFixed(0)} search ${t3.p95.toFixed(0)} filtered ${t4.p95.toFixed(0)} bulk ${med(t5, 0.95).toFixed(0)}`);
  check("P-02 a page is bounded (12 suppliers under 25 KB with 500 saved) and ten simultaneous requests all succeed", bytes < 25_000 && par.every((r) => r.status === 200), `${bytes} B`);
  check("P-03 the stored-relationship read uses the index (no collection scan, no blocking sort)", /IXSCAN/.test(stages) && !/COLLSCAN/.test(stages) && !/"SORT"/.test(stages), stages.slice(0, 100));
}

async function cleanup() {
  if (process.env.KEEP === "1") return;
  const mine = await users.find({ email: { $regex: `^tss-${stamp}-` } }, { projection: { _id: 1 } }).toArray();
  const ids = mine.map((u) => u._id);
  await ws.deleteMany({ userId: { $in: ids } });
  await audit.deleteMany({ userId: { $in: ids } });
  await db.collection("notifications").deleteMany({ buyerId: { $in: ids } });
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
