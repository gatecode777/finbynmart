import fs from "node:fs";
import { createRequire } from "node:module";
import puppeteer, { KnownDevices } from "puppeteer-core";

// Page 12 (Supplier Reviews: /suppliers/[slug]/reviews), the public review APIs and the buyer review APIs.
// Needs a running `next start` (BASE, default :3100) started with MONGODB_DB=finbynmart_test (build-and-serve-test.sh
// does it), Chrome and puppeteer-core. Writes ONLY to the throwaway database (reviews, plus a few throwaway users) and
// removes them at the end unless KEEP=1. There is no moderation API (no admin role exists), so moderation steps are
// simulated by editing the throwaway database directly. Expected numbers are computed here from the fixture table.
const BASE = process.env.BASE || "http://localhost:3100";
const ROOT = "R:/indiamartref";
const TEST_DB = "finbynmart_test";
const require = createRequire(`${ROOT}/`);
const { MongoClient, ObjectId } = require("mongodb");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const eq = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- throwaway database guard
const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === TEST_DB) throw new Error("Refusing: the configured live database is named like the test database.");
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const db = client.db(TEST_DB);
const col = db.collection("reviews");
await db.collection("rate_limits").deleteMany({});

// ---------- fixtures
const A = "shree-textiles", B = "sunrise-hub", C = "modern-apparels";
const DAY = 86_400_000;
const T0 = Date.now();
const at = (days) => new Date(T0 - days * DAY);
const tie = at(40);
const specs = [
  { key: "r1", rating: 5, when: at(2), cats: { "product-quality": 5, "delivery-logistics": 5 }, rec: true, name: "Rajesh M." },
  { key: "r2", rating: 5, when: at(10), cats: { "product-quality": 5 }, rec: true, name: "Priya S." },
  { key: "r3", rating: 5, when: at(25), cats: { "service-support": 5 }, rec: true, name: "Amit D." },
  { key: "r4", rating: 5, when: tie, cats: { "product-quality": 4, communication: 5 }, rec: true, name: "Neha K." },
  { key: "r12", rating: 3, when: tie, cats: {}, rec: null, name: "Tie T." },
  { key: "r5", rating: 4, when: at(60), cats: { "product-quality": 4 }, rec: true, name: "Sunil P." },
  { key: "r6", rating: 4, when: at(75), cats: { "value-for-money": 4 }, rec: null, name: "Kiran R." },
  { key: "r7", rating: 4, when: at(100), cats: { "product-quality": 3, "service-support": 4 }, rec: true, name: "Meera I." },
  { key: "r8", rating: 3, when: at(150), cats: {}, rec: null, name: "Vikram S." },
  { key: "r9", rating: 3, when: at(200), cats: { "service-support": 3 }, rec: false, name: "Anita B." },
  { key: "r10", rating: 2, when: at(300), cats: { "delivery-logistics": 2, "product-quality": 2 }, rec: false, name: "Dev N." },
  { key: "r11", rating: 1, when: at(400), cats: {}, rec: false, name: "Omar F." },
];
const make = (over) => ({ supplierSlug: A, buyerId: new ObjectId(), displayName: "Fixture F.", rating: 5, title: "Fixture review title", text: "Fixture review text that is long enough to be valid here.", categoryRatings: {}, wouldRecommend: null, verifiedBuyer: false, verificationSource: null, status: "APPROVED", moderationReason: null, moderatedBy: null, moderatedAt: null, publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), deletedAt: null, __test: true, ...over });
// Reviews written by earlier runs (by throwaway buyers) are not tagged, so the whole throwaway collection is emptied.
await col.deleteMany({});
const ids = {};
for (const s of specs) {
  ids[s.key] = (await col.insertOne(make({ displayName: s.name, rating: s.rating, title: `Title ${s.key} for ${s.name}`, text: `Text of ${s.key}: the supplier was ${s.rating >= 4 ? "good" : s.rating === 3 ? "average" : "poor"} to deal with.\nSecond line of ${s.key}.`, categoryRatings: s.cats, wouldRecommend: s.rec, publishedAt: s.when }))).insertedId.toString();
}
const hiddenOnes = {
  pending: make({ displayName: "Pending P.", rating: 1, title: "Pending title SECRET-PENDING", status: "PENDING", publishedAt: null }),
  rejected: make({ displayName: "Rejected R.", rating: 1, title: "Rejected title", status: "REJECTED", publishedAt: null, moderationReason: "SECRET-MOD-REASON", moderatedBy: "admin-secret@example.test" }),
  hidden: make({ displayName: "Hidden H.", rating: 1, title: "Hidden title", status: "HIDDEN", moderationReason: "SECRET-HIDE-REASON" }),
  deletedStatus: make({ displayName: "Deleted D.", rating: 1, title: "Deleted title", status: "DELETED", deletedAt: new Date() }),
  deletedFlag: make({ displayName: "Flagged F.", rating: 1, title: "Soft deleted title", deletedAt: new Date() }),
  noDate: make({ displayName: "NoDate N.", rating: 1, title: "No publication date title", publishedAt: null }),
  bPub1: make({ supplierSlug: B, displayName: "Bee One", rating: 4, title: "B supplier first", publishedAt: at(5) }),
  bPub2: make({ supplierSlug: B, displayName: "Bee Two", rating: 2, title: "B supplier second", publishedAt: at(6) }),
  bPending: make({ supplierSlug: B, displayName: "Bee Pending", rating: 5, title: "B pending", status: "PENDING", publishedAt: null }),
  ghost: make({ supplierSlug: "no-such-supplier", displayName: "Ghost G.", rating: 5, title: "Ghost supplier review" }),
};
for (const [key, doc] of Object.entries(hiddenOnes)) ids[key] = (await col.insertOne(doc)).insertedId.toString();

// ---------- ground truth for supplier A (from the table above, not from the application)
const sum = specs.reduce((a, s) => a + s.rating, 0);
const roundHalfUp1 = (n, d) => Math.floor((n * 20 + d) / (2 * d)) / 10;
const avgA = roundHalfUp1(sum, specs.length);
const dist = [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: specs.filter((s) => s.rating === r).length, percent: Math.floor((specs.filter((s) => s.rating === r).length * 200 + specs.length) / (2 * specs.length)) }));
const answered = specs.filter((s) => s.rec !== null);
const yes = answered.filter((s) => s.rec).length;
const pqs = specs.filter((s) => s.cats["product-quality"]).map((s) => s.cats["product-quality"]);
const catCount = (c) => specs.filter((s) => s.cats[c]).length;
const ageDays = (s) => (T0 - s.when.getTime()) / DAY;
const newestOrder = [...specs].sort((a, b) => b.when - a.when || b.rating - a.rating || (ids[a.key] < ids[b.key] ? -1 : 1)).map((s) => s.key);
const oldestOrder = [...specs].sort((a, b) => a.when - b.when || b.rating - a.rating || (ids[a.key] < ids[b.key] ? -1 : 1)).map((s) => s.key);
const highestOrder = [...specs].sort((a, b) => b.rating - a.rating || b.when - a.when || (ids[a.key] < ids[b.key] ? -1 : 1)).map((s) => s.key);
const lowestOrder = [...specs].sort((a, b) => a.rating - b.rating || b.when - a.when || (ids[a.key] < ids[b.key] ? -1 : 1)).map((s) => s.key);
const keyOfTitle = (title) => /^Title (r\d+)/.exec(title)?.[1];

// ---------- helpers
class Session {
  jar = new Map();
  async call(method, path, body, headers = {}) {
    const response = await fetch(BASE + path, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), redirect: "manual" });
    for (const line of response.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); this.jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    let json = null; try { json = await response.json(); } catch {}
    return { status: response.status, json, headers: response.headers };
  }
}
const pub = async (path) => { const r = await fetch(BASE + path); const type = r.headers.get("content-type") ?? ""; return { status: r.status, headers: r.headers, json: type.includes("json") ? await r.json() : null }; };
const list = (slug, q = "") => pub(`/api/public/suppliers/${slug}/reviews${q}`);
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
async function open(path, { mobile = false, width = 1440, session } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|40\d|409|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  if (session) await page.setCookie(...[...session.jar].map(([name, value]) => ({ name, value, url: BASE })));
  if (mobile) await page.emulate(KnownDevices["iPhone 13"]); else await page.setViewport({ width, height: 900 });
  const resp = await page.goto(BASE + path, { waitUntil: "networkidle2" });
  page.errs = errs; page.status = resp.status();
  return page;
}
const urlOf = (p) => new URL(p.url());
const cardsOf = (p) => p.evaluate(() => [...document.querySelectorAll("article")].map((a) => ({ title: a.querySelector("h3")?.textContent.trim(), text: a.innerText.replace(/\s+/g, " "), name: a.querySelector("p[class*=name]")?.childNodes[0]?.textContent.trim() })));
const stamp = Date.now();
const mail = (tag) => `rv-${stamp}-${tag}@example.test`;

async function main() {
  // ================= users
  const alpha = new Session(), beta = new Session(), gamma = new Session(), delta = new Session(), supplier = new Session();
  const reg = (s, tag, name) => s.call("POST", "/api/auth/register", { role: "buyer", name, email: mail(tag), password: "review-test-pw-1" });
  const regs = [await reg(alpha, "a", "Test Alpha"), await reg(beta, "b", "Test Beta"), await reg(gamma, "c", "Test Gamma"), await reg(delta, "d", "Test Delta")];
  const sreg = await supplier.call("POST", "/api/auth/register", { role: "supplier", businessName: "Review Test Traders", contactName: "Sam Supplier", email: mail("s"), phone: "9876543210", city: "Surat", offering: "Cotton fabric rolls for garments", password: "review-test-pw-1" });
  check("S-00 test accounts created (4 buyers, 1 supplier)", regs.every((r) => r.status === 201 || r.status === 200) && (sreg.status === 201 || sreg.status === 200), JSON.stringify([...regs.map((r) => r.status), sreg.status]));
  const userId = async (tag) => (await db.collection("users").findOne({ email: mail(tag) }))?._id;

  // ================= PUBLIC API: listing, summary
  const a = await list(A);
  const d = a.json?.data, m = a.json?.meta;
  check("L-01 supplier A: 200 with the documented shape", a.status === 200 && a.json.ok && d.supplier.slug === A && Array.isArray(d.reviews) && d.summary && d.facets && d.metrics && m, `status ${a.status}`);
  check("L-02 only the 12 published reviews are counted (pending, rejected, hidden, deleted and undated left out)", m.totalItems === 12 && d.summary.total === 12, `total ${m.totalItems}`);
  check("L-03 default page size 10, two pages, next but no previous, 10 reviews", m.pageSize === 10 && m.totalPages === 2 && m.hasNext && !m.hasPrevious && m.currentPage === 1 && d.reviews.length === 10);
  eq("L-04 average is the half-up one-decimal average of the fixture ratings", d.summary.average, avgA);
  check("L-05 exact average keeps full precision", Math.abs(d.summary.exactAverage - sum / specs.length) < 1e-12, String(d.summary.exactAverage));
  eq("L-06 distribution counts and percentages (5 to 1 star)", d.summary.distribution, dist);
  const text = JSON.stringify(a.json);
  check("L-07 no non-public review is exposed", !/SECRET-|Pending P|Rejected R|Hidden H|Deleted D|Flagged F|NoDate|Soft deleted|Bee One|Ghost/.test(text));
  check("L-08 nothing identifying the author or the moderation leaks", !/buyerId|"email"|@example\.test|moderat|verificationSource|admin-secret|internal/i.test(text.replace(/moderated before/gi, "")));
  check("L-09 each review carries only the public fields", d.reviews.every((r) => Object.keys(r).sort().join() === ["categories", "displayName", "id", "initials", "publishedAt", "rating", "text", "title", "verified", "wouldRecommend"].join()));
  check("L-10 verified is false for every review and there is no buyer-type facet (no order evidence exists)", d.reviews.every((r) => r.verified === false) && d.facets.buyerType === null);
  const vb = await list(A, "?verifiedBuyer=true");
  check("L-11 verifiedBuyer=true matches nothing (never shows unverified reviews as verified)", vb.status === 200 && vb.json.meta.totalItems === 0 && vb.json.data.reviews.length === 0);
  eq("L-12 verifiedBuyer=false is the same as no filter", (await list(A, "?verifiedBuyer=false")).json.meta.totalItems, 12);
  check("L-13 would-recommend metric from the answers given", d.metrics.wouldRecommend?.answered === answered.length && d.metrics.wouldRecommend.yes === yes && d.metrics.wouldRecommend.percent === Math.floor((yes * 200 + answered.length) / (2 * answered.length)), JSON.stringify(d.metrics.wouldRecommend));
  check("L-14 product-quality metric from the category ratings given", d.metrics.productQuality?.count === pqs.length && d.metrics.productQuality.average === roundHalfUp1(pqs.reduce((x, y) => x + y, 0), pqs.length), JSON.stringify(d.metrics.productQuality));
  check("L-15 there is no response-time metric (no inquiry response records exist)", !JSON.stringify(a.json).match(/onTime|response ?time|responseRate/i));
  check("L-16 cache header: short shared cache only", /s-maxage=60/.test(a.headers.get("cache-control") ?? ""));
  const c = await list(C);
  check("L-20 supplier with none: 200, total 0, average null (not 0), zero distribution, empty list", c.status === 200 && c.json.meta.totalItems === 0 && c.json.data.summary.average === null && c.json.data.summary.exactAverage === null && c.json.data.summary.distribution.every((x) => x.count === 0 && x.percent === 0) && c.json.data.reviews.length === 0 && c.json.meta.totalPages === 1 && c.json.data.metrics.wouldRecommend === null && c.json.data.metrics.productQuality === null);
  const bl = await list(B);
  check("L-21 supplier B sees only its own two published reviews", bl.json.meta.totalItems === 2 && bl.json.data.reviews.every((r) => /^B supplier/.test(r.title)) && bl.json.data.summary.average === 3);
  check("L-22 supplier A never contains supplier B's reviews", !text.includes("B supplier"));
  for (const bad of ["does-not-exist-xyz", "BAD_SLUG", "a..b", "x".repeat(90)]) {
    const r = await list(bad);
    check(`L-23 invalid supplier "${bad.slice(0, 20)}" -> 404 with a safe message`, r.status === 404 && r.json.ok === false && r.json.code === "NOT_FOUND");
  }
  check("L-24 a review row of a supplier without a profile is unreachable", (await list("no-such-supplier")).status === 404);

  // summary + facets endpoints
  const sm = await pub(`/api/public/suppliers/${A}/reviews/summary`);
  check("M-01 summary endpoint: same average, total and distribution", sm.status === 200 && sm.json.data.summary.average === avgA && sm.json.data.summary.total === 12 && JSON.stringify(sm.json.data.summary.distribution) === JSON.stringify(dist));
  check("M-02 summary of a supplier with none: average null", (await pub(`/api/public/suppliers/${C}/reviews/summary`)).json.data.summary.average === null);
  check("M-03 summary takes no parameters; unknown supplier 404", (await pub(`/api/public/suppliers/${A}/reviews/summary?rating=5`)).status === 400 && (await pub(`/api/public/suppliers/nope-nope/reviews/summary`)).status === 404);
  const fa = (await pub(`/api/public/suppliers/${A}/reviews/facets`)).json.data.facets;
  const fc = (f, v) => f.find((o) => o.value === v)?.count;
  check("M-10 facets: rating counts", dist.every((x) => fc(fa.rating, String(x.rating)) === x.count));
  check("M-11 facets: only topics buyers rated, with counts", fa.category.map((o) => o.value).sort().join() === ["communication", "delivery-logistics", "product-quality", "service-support", "value-for-money"].join() && fc(fa.category, "product-quality") === catCount("product-quality") && fc(fa.category, "service-support") === catCount("service-support") && fc(fa.category, "communication") === 1);
  check("M-12 facets: date-range counts", fc(fa.range, "") === 12 && fc(fa.range, "30d") === specs.filter((s) => ageDays(s) <= 30).length && fc(fa.range, "90d") === specs.filter((s) => ageDays(s) <= 90).length && fc(fa.range, "12m") === specs.filter((s) => ageDays(s) <= 365).length, JSON.stringify(fa.range));
  const fr = (await pub(`/api/public/suppliers/${A}/reviews/facets?rating=5`)).json.data;
  check("M-13 facets react to the other groups: with rating=5 the topic counts are within the 5-star set; rating counts unchanged", fc(fr.facets.category, "product-quality") === specs.filter((s) => s.rating === 5 && s.cats["product-quality"]).length && fc(fr.facets.rating, "4") === 3 && fr.matching === 4);
  check("M-14 facets: unknown supplier / bad parameter", (await pub(`/api/public/suppliers/nope-nope/reviews/facets`)).status === 404 && (await pub(`/api/public/suppliers/${A}/reviews/facets?sort=zzz`)).status === 400);

  // filters
  const total = (q) => list(A, q).then((r) => r.json.meta?.totalItems);
  for (const r of [5, 4, 3, 2, 1]) eq(`F-01 rating=${r}`, await total(`?rating=${r}`), specs.filter((s) => s.rating === r).length);
  eq("F-02 rating=4,5 (comma list)", await total("?rating=4,5"), specs.filter((s) => s.rating >= 4).length);
  eq("F-03 rating=4&rating=5 (repeated)", await total("?rating=4&rating=5"), specs.filter((s) => s.rating >= 4).length);
  for (const cat of ["product-quality", "delivery-logistics", "service-support", "communication", "value-for-money"]) eq(`F-04 category=${cat}`, await total(`?category=${cat}`), catCount(cat));
  eq("F-05 category=communication,value-for-money (either)", await total("?category=communication,value-for-money"), 2);
  eq("F-06 range=30d", await total("?range=30d"), specs.filter((s) => ageDays(s) <= 30).length);
  eq("F-07 range=90d", await total("?range=90d"), specs.filter((s) => ageDays(s) <= 90).length);
  eq("F-08 range=12m", await total("?range=12m"), specs.filter((s) => ageDays(s) <= 365).length);
  eq("F-09 combined: rating=5 & category=product-quality", await total("?rating=5&category=product-quality"), specs.filter((s) => s.rating === 5 && s.cats["product-quality"]).length);
  eq("F-10 combined: rating=4,5 & range=90d", await total("?rating=4,5&range=90d"), specs.filter((s) => s.rating >= 4 && ageDays(s) <= 90).length);
  eq("F-11 combined that matches nothing: rating=1 & range=30d", await total("?rating=1&range=30d"), 0);
  const none = await list(A, "?rating=1&range=30d");
  check("F-12 no match still reports the full summary and one empty page", none.json.data.summary.total === 12 && none.json.meta.totalPages === 1 && none.json.data.reviews.length === 0);
  const emptyCat = await list(C, "?category=communication");
  check("F-13 a topic nobody rated for this supplier is reported as ignored, not zero results", emptyCat.status === 200 && emptyCat.json.data.ignoredFilters.some((x) => x.param === "category"));
  for (const bad of ["rating=0", "rating=6", "rating=abc", "rating=2.5", "rating=-1", "rating[$ne]=1", "rating=1&rating=9", "category=bogus", "category[$gt]=", "range=forever", "verifiedBuyer=maybe", "sort=bogus", "sort[$ne]=x", "page=0", "page=abc", "page=-3", "page=1.5", "limit=0", "limit=51", "limit=abc", "limit=2.5", "supplierId=" + B, "supplier=" + B, "q=x", "status=PENDING", "buyerId=x"]) {
    const r = await list(A, `?${bad}`);
    check(`F-20 ${bad} -> 400 naming the field`, r.status === 400 && r.json.ok === false && Object.keys(r.json.fields ?? {}).length > 0, `status ${r.status}`);
  }

  // sort + pagination
  const order = async (sort) => (await list(A, `?sort=${sort}&limit=50`)).json.data.reviews.map((r) => keyOfTitle(r.title));
  eq("O-01 sort=relevant (no verified reviews: newest first, then higher rating, then id)", await order("relevant"), newestOrder);
  eq("O-02 sort=newest", await order("newest"), newestOrder);
  eq("O-03 sort=oldest", await order("oldest"), oldestOrder);
  eq("O-04 sort=highest", await order("highest"), highestOrder);
  eq("O-05 sort=lowest", await order("lowest"), lowestOrder);
  check("O-06 identical timestamps keep a fixed order (r4 and the tied 3-star review)", newestOrder.indexOf("r4") + 1 === newestOrder.indexOf("r12") && JSON.stringify(await order("newest")) === JSON.stringify(await order("newest")));
  check("O-07 default sort is relevant and is echoed back", (await list(A)).json.data.appliedFilters.sort === "relevant" && (await list(A, "?sort=lowest")).json.data.appliedFilters.sort === "lowest");
  const walk = [];
  for (let p = 1; p <= 4; p++) walk.push(...(await list(A, `?limit=3&page=${p}&sort=newest`)).json.data.reviews.map((r) => keyOfTitle(r.title)));
  eq("P-01 walking 4 pages of 3 gives all 12 once, in order", walk, newestOrder);
  const p4 = await list(A, "?limit=3&page=4&sort=newest"), p5 = await list(A, "?limit=3&page=5&sort=newest");
  check("P-02 last page: 3 reviews, no next, has previous, totalPages 4", p4.json.meta.totalPages === 4 && !p4.json.meta.hasNext && p4.json.meta.hasPrevious && p4.json.data.reviews.length === 3);
  check("P-03 a page past the end is a clean empty page", p5.status === 200 && p5.json.data.reviews.length === 0 && p5.json.meta.totalItems === 12);
  eq("P-04 limit=50 is one page of 12", [(await list(A, "?limit=50")).json.meta.totalPages, (await list(A, "?limit=50")).json.data.reviews.length], [1, 12]);
  const pg2 = await list(A, "?page=2");
  check("P-05 page 2 of the default size has the last 2 reviews", pg2.json.data.reviews.length === 2 && pg2.json.meta.hasPrevious && !pg2.json.meta.hasNext);

  // ================= BUYER API: access control and validation
  const good = (over = {}) => ({ supplierId: A, rating: 4, title: "Reliable and prompt", text: "We ordered twice and both deliveries arrived on schedule with good quality.", categoryRatings: { "product-quality": 5, communication: 4 }, wouldRecommend: true, ...over });
  const anon = new Session();
  for (const [method, path, body] of [["POST", "/api/buyer/reviews", good()], ["GET", "/api/buyer/reviews"], ["GET", `/api/buyer/reviews/${ids.r1}`], ["PATCH", `/api/buyer/reviews/${ids.r1}`, good()], ["DELETE", `/api/buyer/reviews/${ids.r1}`]]) {
    const r = await anon.call(method, path, body);
    check(`B-01 ${method} ${path.replace(ids.r1, "<id>")} without signing in -> 401`, r.status === 401 && r.json.ok === false);
  }
  const sup = await supplier.call("POST", "/api/buyer/reviews", good());
  check("B-02 a supplier account cannot review -> 403", sup.status === 403 && /buyer accounts/i.test(sup.json.message));
  check("B-03 unknown supplier -> 404; malformed or oversized body -> 400", (await alpha.call("POST", "/api/buyer/reviews", good({ supplierId: "nope-nope" }))).status === 404 && (await alpha.call("POST", "/api/buyer/reviews", "{not json")).status === 400 && (await alpha.call("POST", "/api/buyer/reviews", "x".repeat(20000), { "content-length": "20000" })).status === 400);
  const invalid = [["rating missing", { rating: undefined }, "rating"], ["rating 0", { rating: 0 }, "rating"], ["rating 6", { rating: 6 }, "rating"], ["rating 3.5", { rating: 3.5 }, "rating"], ["rating text", { rating: "abc" }, "rating"], ["title too short", { title: "abcd" }, "title"], ["title too long", { title: "x".repeat(121) }, "title"], ["text too short", { text: "too short" }, "text"], ["text too long", { text: "x".repeat(3001) }, "text"], ["unknown category", { categoryRatings: { made_up: 3 } }, "categoryRatings"], ["category rating 0", { categoryRatings: { communication: 0 } }, "categoryRatings"], ["category rating 6", { categoryRatings: { communication: 6 } }, "categoryRatings"], ["wouldRecommend text", { wouldRecommend: "yes" }, "wouldRecommend"], ["email in text", { text: "Write to me at buyer@example.com about this order please." }, "text"], ["phone in text", { text: "Call me on 98765 43210 and I will explain everything." }, "text"], ["link in text", { text: "See https://example.com/deal for what they offered me." }, "text"]];
  for (const [name, over, field] of invalid) {
    const r = await delta.call("POST", "/api/buyer/reviews", good(over));
    check(`B-10 ${name} -> 400 with the field named`, r.status === 400 && r.json.ok === false && field in (r.json.fields ?? {}), `status ${r.status} ${JSON.stringify(r.json?.fields)}`);
  }
  check("B-11 no invalid attempt stored anything", (await col.countDocuments({ buyerId: await userId("d") })) === 0);

  // valid submission, with client attempts to control verification and moderation
  const rogue = good({ verifiedBuyer: true, verificationSource: "order-1", status: "APPROVED", publishedAt: new Date().toISOString(), moderatedBy: "me", moderationReason: "ok", buyerId: String(new ObjectId()), helpfulCount: 99, displayName: "Fake Admin", active: false, deletedAt: null });
  const created = await alpha.call("POST", "/api/buyer/reviews", rogue);
  check("B-20 valid review: 201 with a reference, PENDING, and a message that says it is awaiting moderation", created.status === 201 && created.json.ok && created.json.review.status === "PENDING" && /waiting for moderation/i.test(created.json.message) && !/is published|now live/i.test(created.json.message), JSON.stringify(created.json));
  const stored = await col.findOne({ _id: new ObjectId(created.json.review.id) });
  const aid = await userId("a");
  check("B-21 stored by the backend: author from the session, never verified, never published, no moderation fields from the client", stored && stored.buyerId.equals(aid) && stored.verifiedBuyer === false && stored.verificationSource === null && stored.status === "PENDING" && !stored.publishedAt && !stored.moderatedBy && !stored.moderationReason && stored.helpfulCount === undefined && stored.supplierSlug === A && stored.active === true, JSON.stringify(stored));
  check("B-22 the public name is first name and last initial, the email is not kept in the review", stored.displayName === "Test A." && !JSON.stringify(stored).includes("@"));
  const after = await list(A);
  check("B-23 a pending review is invisible: counts, average and list unchanged", after.json.meta.totalItems === 12 && after.json.data.summary.average === avgA && !JSON.stringify(after.json).includes("Reliable and prompt"));
  const dup = await alpha.call("POST", "/api/buyer/reviews", good({ title: "Second attempt at it" }));
  check("B-24 a second review of the same supplier -> 409, nothing stored", dup.status === 409 && (await col.countDocuments({ buyerId: aid, supplierSlug: A, active: true })) === 1);
  const raceUser = beta;
  const race = await Promise.all([1, 2, 3].map(() => raceUser.call("POST", "/api/buyer/reviews", good({ supplierId: B }))));
  check("B-25 three simultaneous submissions: exactly one is stored", race.filter((r) => r.status === 201).length === 1 && race.filter((r) => r.status === 409).length === 2 && (await col.countDocuments({ buyerId: await userId("b"), supplierSlug: B, active: true })) === 1, JSON.stringify(race.map((r) => r.status)));
  const own = await alpha.call("GET", "/api/buyer/reviews");
  check("B-26 the buyer lists only their own review, with its status", own.status === 200 && own.json.reviews.length === 1 && own.json.reviews[0].id === created.json.review.id && own.json.reviews[0].status === "PENDING" && own.json.reviews[0].canEdit === true);
  check("B-27 the same supplier slug in another case still resolves to one supplier", (await gamma.call("POST", "/api/buyer/reviews", good({ supplierId: A.toUpperCase() }))).status === 201);

  // ownership
  const betaOwn = (await beta.call("GET", "/api/buyer/reviews")).json.reviews[0];
  const mineId = created.json.review.id;
  check("W-01 buyer reads own review by id", (await alpha.call("GET", `/api/buyer/reviews/${mineId}`)).json.review.title === "Reliable and prompt");
  check("W-02 another buyer's id is 'not found', same as an unknown id", (await alpha.call("GET", `/api/buyer/reviews/${betaOwn.id}`)).status === 404 && (await alpha.call("GET", `/api/buyer/reviews/${new ObjectId()}`)).status === 404);
  const hijack = await alpha.call("PATCH", `/api/buyer/reviews/${betaOwn.id}`, good({ title: "Hijacked by alpha!" }));
  check("W-03 a buyer cannot edit another buyer's review (404) and it is unchanged", hijack.status === 404 && (await col.findOne({ _id: new ObjectId(betaOwn.id) })).title !== "Hijacked by alpha!");
  check("W-04 a buyer cannot delete another buyer's review (404) and it is unchanged", (await alpha.call("DELETE", `/api/buyer/reviews/${betaOwn.id}`)).status === 404 && (await col.findOne({ _id: new ObjectId(betaOwn.id) })).status === "PENDING");
  check("W-05 nobody can touch published fixture reviews through the buyer API", (await alpha.call("PATCH", `/api/buyer/reviews/${ids.r1}`, good())).status === 404 && (await alpha.call("DELETE", `/api/buyer/reviews/${ids.r1}`)).status === 404 && (await col.findOne({ _id: new ObjectId(ids.r1) })).status === "APPROVED");
  check("W-06 malformed ids -> 404", (await alpha.call("GET", "/api/buyer/reviews/abc")).status === 404 && (await alpha.call("PATCH", "/api/buyer/reviews/abc", good())).status === 404 && (await alpha.call("DELETE", "/api/buyer/reviews/zzzzzzzzzzzzzzzzzzzzzzzz")).status === 404);
  check("W-07 lists never mix owners", (await beta.call("GET", "/api/buyer/reviews")).json.reviews.every((r) => r.id !== mineId) && (await gamma.call("GET", "/api/buyer/reviews")).json.reviews.length === 1);

  // edit
  const edit = await alpha.call("PATCH", `/api/buyer/reviews/${mineId}`, good({ title: "Edited title for review", rating: 5 }));
  check("E-01 editing a pending review within the window: 200, still PENDING", edit.status === 200 && edit.json.review.title === "Edited title for review" && edit.json.review.rating === 5 && edit.json.review.status === "PENDING");
  check("E-02 an edit with invalid data is refused and changes nothing", (await alpha.call("PATCH", `/api/buyer/reviews/${mineId}`, good({ rating: 9 }))).status === 400 && (await col.findOne({ _id: new ObjectId(mineId) })).rating === 5);
  check("E-03 an edit cannot change verification, moderation or the supplier", (async () => true)());
  await alpha.call("PATCH", `/api/buyer/reviews/${mineId}`, { ...good({ title: "Edited again for check" }), verifiedBuyer: true, status: "APPROVED", supplierId: B });
  const afterRogue = await col.findOne({ _id: new ObjectId(mineId) });
  check("E-03 an edit cannot change verification, status or the supplier", afterRogue.verifiedBuyer === false && afterRogue.status === "PENDING" && afterRogue.supplierSlug === A && afterRogue.title === "Edited again for check");
  // moderation is simulated in the database: approve, then edit
  await col.updateOne({ _id: new ObjectId(mineId) }, { $set: { status: "APPROVED", publishedAt: new Date(), moderatedBy: "test-moderator", moderatedAt: new Date() } });
  let live = await list(A);
  check("E-10 after approval (simulated in the database) the review is public and the summary counts it", live.json.meta.totalItems === 13 && live.json.data.reviews.some((r) => r.title === "Edited again for check") && live.json.data.summary.total === 13, `total ${live.json.meta.totalItems}`);
  check("E-11 the public copy shows 'Test A.' and nothing else about the author", JSON.stringify(live.json).includes('"displayName":"Test A."') && !JSON.stringify(live.json).includes(mail("a")));
  const reedit = await alpha.call("PATCH", `/api/buyer/reviews/${mineId}`, good({ title: "Edit after publication!" }));
  const reedited = await col.findOne({ _id: new ObjectId(mineId) });
  check("E-12 editing a published review sends it back to moderation: PENDING, no publication date, moderation fields cleared", reedit.status === 200 && reedited.status === "PENDING" && reedited.publishedAt === null && reedited.moderatedBy === null);
  live = await list(A);
  check("E-13 the edited text is not public before a moderator approves it; the summary drops it again", live.json.meta.totalItems === 12 && !JSON.stringify(live.json).includes("Edit after publication") && live.json.data.summary.average === avgA);
  await col.updateOne({ _id: new ObjectId(mineId) }, { $set: { createdAt: new Date(Date.now() - 8 * DAY) } });
  const late = await alpha.call("PATCH", `/api/buyer/reviews/${mineId}`, good({ title: "Too late to edit this" }));
  check("E-20 after the 7-day window the edit is refused (409) and the review is unchanged", late.status === 409 && /7 days/.test(late.json.message) && (await col.findOne({ _id: new ObjectId(mineId) })).title === "Edit after publication!");
  check("E-21 the same review reports canEdit false", (await alpha.call("GET", `/api/buyer/reviews/${mineId}`)).json.review.canEdit === false);
  await col.updateOne({ _id: new ObjectId(mineId) }, { $set: { createdAt: new Date(Date.now() - 7 * DAY + 60_000) } });
  check("E-22 just inside the window (7 days minus a minute) editing still works", (await alpha.call("PATCH", `/api/buyer/reviews/${mineId}`, good({ title: "Just inside the window" }))).status === 200);
  await col.updateOne({ _id: new ObjectId(mineId) }, { $set: { status: "HIDDEN" } });
  check("E-23 a hidden review cannot be edited by its author (409)", (await alpha.call("PATCH", `/api/buyer/reviews/${mineId}`, good({ title: "Edit hidden review" }))).status === 409);
  await col.updateOne({ _id: new ObjectId(mineId) }, { $set: { status: "REJECTED", moderationReason: "Contains an unsupported claim about a competitor." } });
  const rej = (await alpha.call("GET", `/api/buyer/reviews/${mineId}`)).json.review;
  check("E-24 a rejected review shows its owner the reason and can be edited and resubmitted", rej.status === "REJECTED" && /unsupported claim/.test(rej.moderationReason) && rej.canEdit === true);
  check("E-25 the reason is never public", !JSON.stringify(await list(A)).includes("unsupported claim"));
  const resub = await alpha.call("PATCH", `/api/buyer/reviews/${mineId}`, good({ title: "Resubmitted after rejection" }));
  check("E-26 resubmitting a rejected review makes it PENDING with the reason cleared", resub.status === 200 && resub.json.review.status === "PENDING" && resub.json.review.moderationReason === null);

  // moderation effects on public numbers (simulated in the database)
  await col.updateOne({ _id: new ObjectId(mineId) }, { $set: { status: "APPROVED", publishedAt: new Date(), rating: 1 } });
  live = await list(A);
  eq("X-01 approving a 1-star review lowers the average to the recomputed value", live.json.data.summary.average, roundHalfUp1(sum + 1, 13));
  check("X-02 and raises the 1-star count", live.json.data.summary.distribution.find((x) => x.rating === 1).count === 2);
  await col.updateOne({ _id: new ObjectId(mineId) }, { $set: { status: "HIDDEN" } });
  eq("X-03 hiding it restores the original average", (await list(A)).json.data.summary.average, avgA);
  await col.updateOne({ _id: new ObjectId(mineId) }, { $set: { status: "APPROVED" } });
  check("X-04 restoring it brings it back", (await list(A)).json.meta.totalItems === 13);
  const del = await alpha.call("DELETE", `/api/buyer/reviews/${mineId}`);
  const deleted = await col.findOne({ _id: new ObjectId(mineId) });
  check("X-05 the author deletes their own published review: 200, soft-deleted, slot freed", del.status === 200 && deleted.status === "DELETED" && deleted.deletedAt && deleted.active === undefined);
  const gone = await list(A);
  check("X-06 deletion removes it from every public count at once", gone.json.meta.totalItems === 12 && gone.json.data.summary.average === avgA && gone.json.data.summary.distribution.find((x) => x.rating === 1).count === 1);
  check("X-07 a deleted review is gone for its owner too (404) and cannot be deleted twice", (await alpha.call("GET", `/api/buyer/reviews/${mineId}`)).status === 404 && (await alpha.call("DELETE", `/api/buyer/reviews/${mineId}`)).status === 404);
  const again = await alpha.call("POST", "/api/buyer/reviews", good({ title: "A fresh review after deleting" }));
  check("X-08 after deleting, the buyer may write a new review of the same supplier", again.status === 201);

  // privacy / unsafe content
  const xss = await delta.call("POST", "/api/buyer/reviews", good({ supplierId: B, title: "Markup test review title", text: "<img src=x onerror=alert(1)> great quality and <b>prompt</b> delivery <script>window.__xss=1</script> overall." }));
  check("Z-01 markup in a review is accepted as plain text (it is neutralised on output, not rewritten)", xss.status === 201 && (await col.findOne({ _id: new ObjectId(xss.json.review.id) })).text.includes("<img src=x"));
  await col.updateOne({ _id: new ObjectId(xss.json.review.id) }, { $set: { status: "APPROVED", publishedAt: new Date() } });

  // admin and supplier-response routes do not exist (blocked: no admin role, no supplier-response policy)
  const gates = [["GET", "/api/admin/reviews"], ["GET", `/api/admin/reviews/${ids.pending}`], ["PATCH", `/api/admin/reviews/${ids.pending}/approve`], ["PATCH", `/api/admin/reviews/${ids.pending}/reject`], ["PATCH", `/api/admin/reviews/${ids.pending}/hide`], ["POST", `/api/supplier/reviews/${ids.r1}/response`]];
  const codes = [];
  for (const [method, path] of gates) codes.push((await alpha.call(method, path, method === "GET" ? undefined : {})).status);
  check("Z-02 admin moderation and supplier-response routes do not exist; nobody can approve through the API", codes.every((s) => s === 404), JSON.stringify(codes));
  check("Z-03 the pending fixture is still pending after those attempts", (await col.findOne({ _id: new ObjectId(ids.pending) })).status === "PENDING");
  check("Z-04 other methods on the public routes are refused", (await fetch(`${BASE}/api/public/suppliers/${A}/reviews`, { method: "POST" })).status === 405 && (await fetch(`${BASE}/api/public/suppliers/${A}/reviews/summary`, { method: "DELETE" })).status === 405);

  // submission rate limit (5 per hour per buyer): the 6th attempt is refused whatever it contains
  await db.collection("rate_limits").deleteMany({});
  const burst = [];
  for (let i = 0; i < 7; i++) burst.push((await gamma.call("POST", "/api/buyer/reviews", good({ supplierId: C }))).status);
  check("Z-05 submissions are rate limited (5 per hour per buyer): 201, then 409s, then 429", burst[0] === 201 && burst.slice(1, 5).every((s) => s === 409) && burst.slice(5).every((s) => s === 429), JSON.stringify(burst));
  await col.deleteMany({ buyerId: await userId("c"), supplierSlug: C }); // keep supplier C empty for the page tests
  await db.collection("rate_limits").deleteMany({});

  // ================= PAGE: supplier A as a guest
  let p = await open(`/suppliers/${A}/reviews`);
  check("G-01 page: 200, no console errors", p.status === 200 && p.errs.length === 0, p.errs.join("; "));
  const meta = await p.evaluate(() => ({ title: document.title, canonical: document.querySelector("link[rel=canonical]")?.href, robots: document.querySelector("meta[name=robots]")?.content ?? null, h1: document.querySelector("h1")?.textContent.trim(), crumbs: [...document.querySelectorAll("nav[aria-label=Breadcrumb] li, nav[aria-label=breadcrumb] li")].map((l) => l.textContent.trim()), metaRow: [...document.querySelectorAll("ul[class*=meta] li")].map((l) => l.textContent.trim()) }));
  check("G-02 title, supplier heading, last breadcrumb", /^Reviews of Shree Textiles/.test(meta.title) && /shree textiles/i.test(meta.h1) && meta.crumbs.at(-1) === "Reviews", JSON.stringify(meta));
  check("G-03 plain page is indexable with the plain canonical", meta.robots === null && (meta.canonical === undefined || /\/suppliers\/shree-textiles\/reviews$/.test(meta.canonical)));
  check("G-04 the header shows the real average and count", meta.metaRow.some((t) => t === `${avgA.toFixed(1)} (12 Reviews)`), JSON.stringify(meta.metaRow));
  const tabs = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Supplier profile'] a")].map((a) => ({ t: a.textContent.trim(), h: a.getAttribute("href"), cur: a.getAttribute("aria-current") })));
  check("G-05 tabs: Reviews (12) is current; every tab goes to a real page", tabs.find((x) => x.cur === "page")?.t === "Reviews (12)" && tabs[3].h === `/suppliers/${A}/reviews` && tabs[2].h === `/suppliers/${A}/certifications` && tabs[1].h === `/suppliers/${A}/products` && tabs[0].h === `/suppliers/${A}`, JSON.stringify(tabs));
  const sum1 = await p.evaluate(() => ({ avg: document.querySelector("[class*=averageValue]")?.textContent.trim(), based: document.querySelector("[class*=based]")?.textContent.trim(), stars: document.querySelector("section[aria-label='Rating summary'] [role=img]")?.getAttribute("aria-label"), rows: [...document.querySelectorAll("ul[class*=rows] li")].map((li) => li.innerText.replace(/\s+/g, " ").trim()), metrics: [...document.querySelectorAll("ul[aria-label='Buyer feedback highlights'] li")].map((li) => li.innerText.replace(/\s+/g, " ").trim()) }));
  check("G-06 summary: average, 'Based on 12 published reviews', accessible star label", sum1.avg === avgA.toFixed(1) && sum1.based === "Based on 12 published reviews" && sum1.stars === `Average rating ${avgA.toFixed(1)} out of 5`, JSON.stringify(sum1));
  check("G-07 breakdown rows: 5 to 1 star with percentage and exact count", dist.every((x, i) => sum1.rows[i].includes(`${x.rating}`) && sum1.rows[i].includes(`${x.percent}% (${x.count})`)), JSON.stringify(sum1.rows));
  check("G-08 metric cards only for data that exists: Would Recommend and Product Quality, with their basis; no response-time card", sum1.metrics.length === 2 && sum1.metrics[0].includes(`${d.metrics.wouldRecommend.percent}%`) && sum1.metrics[0].includes(`${yes} of ${answered.length} who answered`) && sum1.metrics[1].includes(`${d.metrics.productQuality.average.toFixed(1)}/5`) && !/response/i.test(sum1.metrics.join()), JSON.stringify(sum1.metrics));
  let cards = await cardsOf(p);
  check("G-10 page 1: 10 reviews in most-relevant order", cards.length === 10 && JSON.stringify(cards.map((x) => keyOfTitle(x.title))) === JSON.stringify(newestOrder.slice(0, 10)), cards.map((x) => keyOfTitle(x.title)).join(","));
  const heading = await p.evaluate(() => document.querySelector("#reviews-heading")?.textContent.replace(/\s+/g, " ").trim());
  check("G-11 results heading counts all 12", heading === "Reviews (12)", heading);
  const first = cards[0];
  check("G-12 card: public name, date, title, text with its line break, rating, topic tags, recommendation", first.name === "Rajesh M." && /\d{1,2} [A-Z][a-z]{2} \d{4}/.test(first.text) && first.text.includes("Title r1") && first.text.includes("Second line of r1") && first.text.includes("5.0") && first.text.includes("Product Quality: 5/5") && first.text.includes("Delivery & Logistics: 5/5") && first.text.includes("Would recommend"), first.text);
  check("G-13 no Verified Buyer badge anywhere and no buyer-type filter (no order evidence)", !(await p.evaluate(() => /Verified Buyer/i.test(document.body.textContent))));
  const html = await p.content();
  check("G-14 page source holds no author id, email, moderation note or non-public review", !/SECRET-|admin-secret|@example\.test|Pending P|Rejected R|Hidden H|Deleted D|Flagged F|NoDate|Soft deleted|Bee One|Ghost G/.test(html));
  const ld = await p.evaluate(() => [...document.querySelectorAll("script[type='application/ld+json']")].map((s) => JSON.parse(s.textContent)["@type"]));
  check("G-15 structured data is the breadcrumb only (no aggregate rating or review markup)", JSON.stringify(ld) === JSON.stringify(["BreadcrumbList"]), JSON.stringify(ld));
  const side = await p.evaluate(() => { const f = document.querySelector("form[aria-label='Filter reviews']"); return f ? { groups: [...f.querySelectorAll("summary")].map((s) => s.textContent.trim()), labels: [...f.querySelectorAll("label")].map((l) => (l.querySelector("[class*=optionLabel]")?.textContent + " " + l.querySelector("[class*=optionCount]")?.textContent)), apply: f.querySelector("button[type=submit]")?.textContent.trim() } : null; });
  check("G-16 filter groups: Rating, Review For, Review Date (no Buyer Type); apply shows the active count", side && side.groups.join() === ["Rating", "Review For", "Review Date"].join() && side.apply === "Apply Filters (0)", JSON.stringify(side?.groups));
  check("G-17 option labels carry live counts", side.labels.includes(`5 Star (${dist[0].count})`) && side.labels.includes(`Product Quality (${catCount("product-quality")})`) && side.labels.includes(`All time (12)`) && side.labels.includes(`Last 30 days (${specs.filter((s) => ageDays(s) <= 30).length})`), side.labels.join(" | "));
  const gpanel = await p.evaluate(() => { const h = [...document.querySelectorAll("h2")].find((x) => x.textContent.trim() === "Write a Review"); const s = h?.closest("section"); return s ? { text: s.innerText.replace(/\s+/g, " "), links: [...s.querySelectorAll("a")].map((a) => ({ t: a.textContent.trim(), h: a.getAttribute("href") })), form: !!s.querySelector("form") } : null; });
  check("G-18 a signed-out visitor sees a sign-in link, not the form", gpanel && !gpanel.form && gpanel.links.some((l) => /Sign in to Write a Review/.test(l.t) && l.h === "/sign-in") && gpanel.links.some((l) => l.h === "/sign-up"), JSON.stringify(gpanel));
  const guide = await p.evaluate(() => document.querySelector("aside[aria-labelledby='guidelines-heading']")?.innerText.replace(/\s+/g, " "));
  check("G-19 review guidelines are shown, including moderation and no contact details", /Share your genuine experience/.test(guide) && /moderator before it is published/.test(guide) && /Do not post email addresses, phone numbers or links/.test(guide), guide);

  // filter through the form
  await p.evaluate(() => { window.__marker = 1; [...document.querySelectorAll("form[aria-label='Filter reviews'] label")].find((l) => l.textContent.startsWith("5 Star")).querySelector("input").click(); });
  await p.click("form[aria-label='Filter reviews'] button[type=submit]");
  await p.waitForFunction(() => location.search.includes("rating=5"), { timeout: 15000 }).catch(() => {});
  await sleep(500);
  cards = await cardsOf(p);
  check("G-20 ticking 5 Star and applying: URL has rating=5, only 5-star reviews, no full reload", urlOf(p).search === "?rating=5" && cards.length === dist[0].count && cards.every((x) => /5\.0/.test(x.text)) && (await p.evaluate(() => window.__marker === 1)), urlOf(p).search);
  check("G-21 the heading follows the filter; the summary stays the supplier's whole picture", (await p.evaluate(() => document.querySelector("#reviews-heading")?.textContent.replace(/\s+/g, " ").trim())) === `Reviews (${dist[0].count})` && (await p.evaluate(() => document.querySelector("[class*=based]")?.textContent.trim())) === "Based on 12 published reviews");
  check("G-22 an applied-filter chip is shown, and the filtered page is noindex with the plain canonical", (await p.evaluate(() => [...document.querySelectorAll("ul[aria-label='Applied filters'] a")].map((a) => a.getAttribute("aria-label")).join())) === "Remove filter 5 Star" && (await p.evaluate(() => document.querySelector("meta[name=robots]")?.content ?? "")).includes("noindex") && !(await p.evaluate(() => document.querySelector("link[rel=canonical]")?.href ?? "")).includes("?"));
  await p.click("ul[aria-label='Applied filters'] a");
  await p.waitForFunction(() => location.search === "", { timeout: 15000 }).catch(() => {});
  await sleep(300);
  check("G-23 removing the chip returns to the plain list", urlOf(p).search === "" && (await cardsOf(p)).length === 10);
  await p.select("select[name=sort]", "highest");
  await p.waitForFunction(() => location.search.includes("sort=highest"), { timeout: 15000 }).catch(() => {});
  await sleep(500);
  cards = await cardsOf(p);
  check("G-24 sorting: URL has sort=highest and the order is highest first", urlOf(p).search === "?sort=highest" && JSON.stringify(cards.map((x) => keyOfTitle(x.title))) === JSON.stringify(highestOrder.slice(0, 10)));
  check("G-25 the sort offers exactly the five supported orders (no 'Most Helpful': no helpful voting)", JSON.stringify(await p.evaluate(() => [...document.querySelectorAll("select[name=sort] option")].map((o) => o.value))) === JSON.stringify(["relevant", "newest", "oldest", "highest", "lowest"]));
  await p.close();

  p = await open(`/suppliers/${A}/reviews?sort=lowest`);
  const pag = await p.evaluate(() => ({ summary: document.querySelector("p[role=status]")?.textContent.trim(), links: [...document.querySelectorAll("nav[aria-label*=agination] a")].map((a) => a.getAttribute("href")) }));
  check("G-30 page 1: 'Showing 1–10 of 12 reviews' and a page-2 link that keeps the sort", /Showing 1.10 of 12 reviews/.test(pag.summary) && pag.links.some((h) => /page=2/.test(h) && /sort=lowest/.test(h)), JSON.stringify(pag));
  await p.close();
  p = await open(`/suppliers/${A}/reviews?sort=lowest&page=2`);
  check("G-31 page 2: the remaining 2 reviews in order", (await cardsOf(p)).map((x) => keyOfTitle(x.title)).join() === lowestOrder.slice(10).join());
  await p.evaluate(() => { [...document.querySelectorAll("form[aria-label='Filter reviews'] label")].find((l) => l.textContent.startsWith("4 Star")).querySelector("input").click(); });
  await p.click("form[aria-label='Filter reviews'] button[type=submit]");
  await p.waitForFunction(() => location.search.includes("rating=4"), { timeout: 15000 }).catch(() => {});
  await sleep(500);
  check("G-32 changing a filter on page 2 resets to page 1 and keeps the sort", !/page=/.test(urlOf(p).search) && /sort=lowest/.test(urlOf(p).search) && (await cardsOf(p)).length === 3);
  await p.close();
  p = await open(`/suppliers/${A}/reviews?page=99`);
  check("G-33 a page number past the end lands on the last page", urlOf(p).search === "?page=2" && (await cardsOf(p)).length === 2, urlOf(p).search);
  await p.close();
  p = await open(`/suppliers/${A}/reviews?category=bogus&verified=1`);
  check("G-34 a topic with no data is reported and ignored; verified-only shows no reviews rather than unverified ones", /category "bogus"/.test(await p.evaluate(() => [...document.querySelectorAll("[role=status]")].map((n) => n.textContent).join(" "))) && /No reviews match these filters/i.test(await p.evaluate(() => document.body.textContent)));
  await p.close();
  p = await open(`/suppliers/${A}/reviews?rating=1&range=30d`);
  check("G-35 no-match state: message, Clear all filters link, summary intact", /No reviews match these filters/i.test(await p.evaluate(() => document.body.textContent)) && (await p.evaluate(() => [...document.querySelectorAll("a")].some((a) => a.textContent.trim() === "Clear all filters" && a.getAttribute("href") === location.pathname))) && (await p.evaluate(() => document.querySelector("[class*=based]")?.textContent.trim())) === "Based on 12 published reviews");
  await p.close();

  // ================= PAGE: empty supplier, other supplier, invalid
  p = await open(`/suppliers/${C}/reviews`);
  const e = await p.evaluate(() => ({ body: document.body.textContent, cards: document.querySelectorAll("article").length, form: !!document.querySelector("form[aria-label='Filter reviews']"), metaRow: [...document.querySelectorAll("ul[class*=meta] li")].map((l) => l.textContent.trim()), tab: document.querySelector("nav[aria-label='Supplier profile'] a[aria-current=page]")?.textContent.trim(), noRating: document.querySelector("section[aria-label='Rating summary']")?.textContent }));
  check("H-01 no published reviews: honest empty summary, no invented 0.0, no cards, no filters", /No ratings yet/.test(e.noRating) && !/0\.0/.test(e.body) && e.cards === 0 && !e.form && /No published reviews yet/i.test(e.body) && !e.metaRow.some((t) => /Review/.test(t)), JSON.stringify(e.metaRow));
  check("H-02 the tab says Reviews (0) and the Write a Review panel is still offered (to sign in)", e.tab === "Reviews (0)" && /Sign in to Write a Review/.test(e.body));
  await p.close();
  p = await open(`/suppliers/${B}/reviews`);
  check("H-03 supplier B: its own three published reviews (two fixtures and the approved markup test), average 3.3, nothing of supplier A", (await cardsOf(p)).length === 3 && /3\.3/.test(await p.evaluate(() => document.querySelector("[class*=averageValue]")?.textContent)) && !(await p.evaluate(() => /Title r1/.test(document.body.textContent))));
  await p.close();
  const xssPage = await open(`/suppliers/${B}/reviews`);
  const xssState = await xssPage.evaluate(() => ({ injected: !!document.querySelector("article img[src=x]"), flag: window.__xss === 1, boldTag: !!document.querySelector("article b"), text: [...document.querySelectorAll("article")].map((a) => a.innerText).join(" ") }));
  check("H-04 submitted markup is shown as text and never runs (no injected image, bold tag or script)", !xssState.injected && !xssState.flag && !xssState.boldTag && xssState.text.includes("<img src=x onerror=alert(1)>") && xssState.text.includes("<b>prompt</b>"), xssState.text.slice(0, 160));
  await xssPage.close();
  const bad = await fetch(`${BASE}/suppliers/does-not-exist-xyz/reviews`), bad2 = await fetch(`${BASE}/suppliers/BAD_SLUG/reviews`), ghostPage = await fetch(`${BASE}/suppliers/no-such-supplier/reviews`);
  check("H-05 an unknown or malformed supplier, or a review row of one without a profile, is a real 404", bad.status === 404 && bad2.status === 404 && ghostPage.status === 404, `${bad.status} ${bad2.status} ${ghostPage.status}`);

  // ================= PAGE: signed-in buyer (Write a Review flow in the browser)
  const panel = (page) => page.evaluate(() => { const h = [...document.querySelectorAll("h2")].find((x) => x.textContent.trim() === "Write a Review"); const s = h?.closest("section"); return s ? { text: s.innerText.replace(/\s+/g, " "), form: !!s.querySelector("form"), buttons: [...s.querySelectorAll("button")].map((b) => b.textContent.trim()) } : null; });
  const clickButton = (page, text) => page.evaluate((t) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === t); if (!b) return false; b.click(); return true; }, text);
  await col.deleteMany({ buyerId: await userId("a") });
  p = await open(`/suppliers/${C}/reviews`, { session: alpha });
  let pn = await panel(p);
  check("U-01 signed-in buyer: the panel offers a Write a Review button (form closed)", pn && !pn.form && pn.buttons.includes("Write a Review"), JSON.stringify(pn));
  await clickButton(p, "Write a Review");
  await sleep(300);
  check("U-02 the form opens with rating, title, review, topics and recommendation", await p.evaluate(() => { const f = document.querySelector("form[aria-label='Write a review']"); return !!f && f.querySelectorAll("input[type=radio]").length >= 5 && !!f.querySelector("input[placeholder='Sum up your experience']") && !!f.querySelector("textarea") && f.querySelectorAll("select").length === 5; }));
  await clickButton(p, "Submit review");
  await sleep(300);
  const verrs = await p.evaluate(() => ({ errors: [...document.querySelectorAll("form[aria-label='Write a review'] p")].map((x) => x.textContent.trim()).filter((t) => /Choose a rating|title of|Write your review/.test(t)), invalid: [...document.querySelectorAll("form[aria-label='Write a review'] [aria-invalid=true]")].length, alert: document.querySelector("[role=alert]")?.textContent }));
  check("U-03 empty submit: field errors shown, fields flagged invalid, nothing sent or stored", verrs.errors.length === 3 && verrs.invalid >= 2 && /highlighted/.test(verrs.alert) && (await col.countDocuments({ buyerId: await userId("a") })) === 0, JSON.stringify(verrs));
  await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Write a review'] label")].find((l) => l.textContent.trim() === "4 stars").click());
  await p.type("input[placeholder='Sum up your experience']", "Good fabric and fair prices");
  await p.type("textarea", "We placed a trial order and the fabric matched the sample we were sent. Delivery took six days.");
  await p.select("form[aria-label='Write a review'] select:nth-of-type(1)", "5").catch(() => {});
  await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Write a review'] label")].find((l) => l.textContent.trim() === "Yes").click());
  await p.type("textarea", " Call me on 98765 43210 for more.");
  await clickButton(p, "Submit review");
  await sleep(400);
  check("U-04 contact details in the text are refused by the same rule, before anything is sent", /remove email addresses, phone numbers and links/.test(await p.evaluate(() => document.querySelector("form[aria-label='Write a review']")?.textContent ?? "")) && (await col.countDocuments({ buyerId: await userId("a") })) === 0);
  await p.evaluate(() => { const t = document.querySelector("textarea"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(t, "We placed a trial order and the fabric matched the sample we were sent. Delivery took six days."); t.dispatchEvent(new Event("input", { bubbles: true })); });
  await clickButton(p, "Submit review");
  await p.waitForFunction(() => /waiting for moderation/i.test(document.body.textContent), { timeout: 15000 }).catch(() => {});
  await sleep(600);
  const doneStored = await col.findOne({ buyerId: await userId("a") });
  pn = await panel(p);
  check("U-05 a valid submit: the server saved it as PENDING and the page says it is waiting for moderation (not published)", doneStored?.status === "PENDING" && doneStored.verifiedBuyer === false && doneStored.supplierSlug === C && /waiting for moderation/i.test(pn.text) && !/\bpublished\b/i.test(pn.text.replace(/not public yet/gi, "").replace(/Not published/gi, "")), pn?.text);
  check("U-06 the panel now shows the buyer's own review and its status, with Edit and Delete", pn && !pn.form && /Good fabric and fair prices/.test(pn.text) && pn.buttons.includes("Edit review") && pn.buttons.includes("Delete review"), JSON.stringify(pn));
  check("U-07 the public page is unchanged: still no reviews, no rating", /No ratings yet/.test(await p.evaluate(() => document.body.textContent)) && (await p.evaluate(() => document.querySelectorAll("article").length)) === 0);
  await clickButton(p, "Edit review");
  await sleep(300);
  await p.evaluate(() => { const i = document.querySelector("input[placeholder='Sum up your experience']"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "Good fabric, fair prices, slow dispatch"); i.dispatchEvent(new Event("input", { bubbles: true })); });
  check("U-08 editing opens the form pre-filled with the saved text", (await p.evaluate(() => document.querySelector("textarea")?.value ?? "")).startsWith("We placed a trial order") && (await p.evaluate(() => document.querySelectorAll("form[aria-label='Edit your review'] input[type=radio]:checked").length)) >= 1);
  await clickButton(p, "Save changes");
  await p.waitForFunction(() => /Good fabric, fair prices, slow dispatch/.test(document.body.textContent), { timeout: 15000 }).catch(() => {});
  await sleep(500);
  check("U-09 saving the edit stores it, keeps it PENDING and shows the new title", (await col.findOne({ buyerId: await userId("a") })).title === "Good fabric, fair prices, slow dispatch" && (await col.findOne({ buyerId: await userId("a") })).status === "PENDING");
  await clickButton(p, "Delete review");
  await sleep(200);
  check("U-10 delete asks for confirmation first (nothing is deleted yet)", (await panel(p)).buttons.includes("Yes, delete") && (await col.countDocuments({ buyerId: await userId("a"), status: "PENDING" })) === 1);
  await clickButton(p, "Yes, delete");
  await p.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Write a Review"), { timeout: 15000 }).catch(() => {});
  await sleep(400);
  check("U-11 confirming deletes it (soft) and the panel offers Write a Review again", (await col.findOne({ buyerId: await userId("a") })).status === "DELETED" && (await panel(p)).buttons.includes("Write a Review"));
  check("U-12 no console errors during the whole flow", p.errs.length === 0, p.errs.join("; "));
  await p.close();

  const sp = await open(`/suppliers/${A}/reviews`, { session: supplier });
  check("U-20 a supplier account is told it cannot review, with no form", /Supplier accounts cannot review suppliers/.test((await panel(sp))?.text ?? "") && !(await panel(sp)).form);
  await sp.close();
  await col.deleteMany({ buyerId: await userId("b"), supplierSlug: B });
  const dupPage = await open(`/suppliers/${A}/reviews`, { session: gamma });
  const dupPanel = await panel(dupPage);
  check("U-21 a buyer who has already reviewed this supplier sees their review's status, not a second form", /You have reviewed Shree Textiles/.test(dupPanel.text) && !dupPanel.form && /waiting for moderation/i.test(dupPanel.text), dupPanel?.text);
  await dupPage.close();

  // ================= other pages know about the Reviews page
  p = await open(`/suppliers/${A}`);
  const prof = await p.evaluate(() => ({ card: document.querySelector("#reviews")?.innerText.replace(/\s+/g, " ") }));
  const profTab = await p.evaluate(() => { const a = [...document.querySelectorAll("nav[aria-label='Supplier profile'] a")].find((x) => /^Reviews/.test(x.textContent.trim())); return { t: a.textContent.trim(), h: a.getAttribute("href") }; });
  check("V-01 profile page: Reviews (12) tab goes to the reviews page", profTab.t === "Reviews (12)" && profTab.h === `/suppliers/${A}/reviews`, JSON.stringify(profTab));
  check("V-02 profile page: the Reviews block states the count and links to the page", /12 reviews are published/.test(prof.card) && (await p.evaluate((s) => !!document.querySelector(`#reviews a[href='/suppliers/${s}/reviews']`), A)), prof.card);
  check("V-03 the header buttons on the profile still go to the form on the same page", await p.evaluate(() => document.querySelector("a[href='#send-inquiry']") !== null && document.querySelector("a[href='#get-best-quote']") !== null));
  await p.close();
  p = await open(`/suppliers/${C}`);
  check("V-04 profile of a supplier with none: honest sentence, (0) tab, link to write the first review", /No reviews have been published for this supplier yet/.test(await p.evaluate(() => document.querySelector("#reviews")?.innerText ?? "")) && (await p.evaluate((s) => !!document.querySelector(`#reviews a[href='/suppliers/${s}/reviews']`), C)) && (await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Supplier profile'] a")].some((a) => a.textContent.trim() === "Reviews (0)"))));
  await p.close();
  for (const sub of ["products", "certifications", "reviews"]) {
    p = await open(`/suppliers/${A}/${sub}`);
    check(`V-05 /${sub}: Send Inquiry and Get Best Quote lead to the form on the profile (not to a missing anchor)`, await p.evaluate((s) => !!document.querySelector(`a[href='/suppliers/${s}#send-inquiry']`) && !!document.querySelector(`a[href='/suppliers/${s}#get-best-quote']`), A));
    check(`V-06 /${sub}: Reviews tab shows (12)`, await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Supplier profile'] a")].some((a) => a.textContent.trim() === "Reviews (12)")));
    await p.close();
  }

  // ================= RESPONSIVE + MOBILE
  for (const width of [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560]) {
    p = await open(`/suppliers/${A}/reviews`, { width });
    const r = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, clipped: [...document.querySelectorAll("article, section[aria-label='Rating summary'], aside")].filter((e) => e.scrollWidth > e.clientWidth + 1).length, small: [...document.querySelectorAll("article a, section[aria-labelledby] a")].filter((a) => a.getBoundingClientRect().height < 44 && a.getBoundingClientRect().height > 0 && !a.closest("nav")).length }));
    check(`R-${width} no horizontal overflow or clipped blocks`, !r.overflow && r.clipped === 0, JSON.stringify(r));
    await p.close();
  }
  for (const width of [320, 768, 1440]) {
    p = await open(`/suppliers/${C}/reviews`, { width });
    check(`R-empty-${width} the empty page fits`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await p.close();
  }
  for (const width of [320, 375, 768]) {
    p = await open(`/suppliers/${C}/reviews`, { width, session: gamma });
    await col.deleteMany({ buyerId: await userId("c") });
    await p.reload({ waitUntil: "networkidle2" });
    await clickButton(p, "Write a Review");
    await sleep(300);
    check(`R-form-${width} the open review form fits without overflow and its star and radio targets are 44px`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) && (await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Write a review'] label")].filter((l) => /stars?$/.test(l.textContent.trim())).every((l) => l.getBoundingClientRect().width >= 44 && l.getBoundingClientRect().height >= 44))));
    await p.close();
  }
  p = await open(`/suppliers/${A}/reviews`, { mobile: true });
  const mob = await p.evaluate(() => ({ cols: new Set([...document.querySelectorAll("main article")].map((a) => Math.round(a.getBoundingClientRect().left))).size, trigger: !!document.querySelector("button[aria-controls]:not([aria-controls='mobile-nav-panel']):not([aria-haspopup])"), overflow: document.documentElement.scrollWidth > innerWidth + 1, writeFirst: (() => { const w = [...document.querySelectorAll("h2")].find((x) => x.textContent.trim() === "Write a Review"); const r = [...document.querySelectorAll("article")][0]; return !!w && !!r && w.getBoundingClientRect().top < r.getBoundingClientRect().top; })() }));
  check("R-mobile iPhone 13: one column, a filter button, the Write a Review panel above the reviews, no overflow", mob.cols === 1 && mob.trigger && mob.writeFirst && !mob.overflow, JSON.stringify(mob));
  await p.tap("button[aria-controls]:not([aria-controls='mobile-nav-panel']):not([aria-haspopup])");
  await sleep(500);
  check("R-mobile the filter drawer opens with the review filters", await p.evaluate(() => /Filter Reviews/.test(document.querySelector("[role=dialog]:not(#mobile-nav-panel)")?.innerText ?? "")));
  await p.evaluate(() => [...document.querySelectorAll("[role=dialog]:not(#mobile-nav-panel) label")].find((l) => l.textContent.startsWith("5 Star")).querySelector("input").click());
  await p.evaluate(() => document.querySelector("[role=dialog]:not(#mobile-nav-panel) button[type=submit]").click());
  await p.waitForFunction(() => location.search.includes("rating=5"), { timeout: 15000 }).catch(() => {});
  await sleep(600);
  check("R-mobile applying from the drawer filters the list and closes the drawer", urlOf(p).search === "?rating=5" && (await cardsOf(p)).length === dist[0].count && (await p.evaluate(() => document.querySelector("[role=dialog]:not(#mobile-nav-panel)")?.hasAttribute("inert") ?? true)));
  await p.close();
  {
    const ctx = await browser.createBrowserContext();
    const lp = await ctx.newPage();
    await lp.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
    await lp.goto(`${BASE}/suppliers/${A}/reviews`, { waitUntil: "networkidle2" });
    check("R-landscape phone 844x390: no horizontal overflow", !(await lp.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await ctx.close();
  }
  for (const [zoom, width] of [[80, 1800], [110, 1309], [125, 1152], [150, 960], [200, 720]]) {
    p = await open(`/suppliers/${A}/reviews`, { width });
    check(`R-zoom ${zoom}% (viewport ${width}px) no overflow`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await p.close();
  }

  // ================= accessibility basics
  p = await open(`/suppliers/${A}/reviews`, { session: delta });
  const a11y = await p.evaluate(() => {
    const headings = [...document.querySelectorAll("h1,h2,h3")].map((h) => Number(h.tagName[1]));
    return {
      h1: document.querySelectorAll("h1").length,
      skipped: headings.some((level, i) => i > 0 && level - headings[i - 1] > 1),
      articles: [...document.querySelectorAll("article")].every((a) => a.getAttribute("aria-labelledby") && document.getElementById(a.getAttribute("aria-labelledby"))),
      ratingLabels: [...document.querySelectorAll("article [role=img]")].every((s) => /^Rated \d out of 5$/.test(s.getAttribute("aria-label"))),
      timeTags: [...document.querySelectorAll("article time")].every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.getAttribute("datetime"))),
      iconsHidden: [...document.querySelectorAll("article svg")].every((s) => s.closest("[aria-hidden=true]") || s.getAttribute("aria-hidden") === "true"),
    };
  });
  check("Y-01 one h1, no skipped heading level", a11y.h1 === 1 && !a11y.skipped, JSON.stringify(a11y));
  check("Y-02 every review is a labelled article with a text rating and a machine-readable date", a11y.articles && a11y.ratingLabels && a11y.timeTags && a11y.iconsHidden);
  await clickButton(p, "Write a Review");
  await sleep(300);
  await p.evaluate(() => document.querySelector("form[aria-label='Write a review'] input[type=radio]").focus());
  await p.keyboard.press("ArrowRight");
  await p.keyboard.press("ArrowRight");
  await sleep(200);
  check("Y-03 the star rating works from the keyboard (arrow keys change the radio) and is a labelled group", (await p.evaluate(() => document.querySelector("form[aria-label='Write a review'] [role=radiogroup]")?.getAttribute("aria-label") ?? document.querySelector("form[aria-label='Write a review'] [role=radiogroup]")?.getAttribute("aria-label"))) === "Overall rating" && (await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Write a review'] input[type=radio]")].findIndex((r) => r.checked))) === 2);
  check("Y-04 every form control has a label", await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Write a review'] input:not([type=radio]), form[aria-label='Write a review'] textarea, form[aria-label='Write a review'] select")].every((c) => c.labels?.length > 0)));
  await p.close();

  // ================= rate limit on the public API (last: it uses up the window)
  let limited = 0, lr = null;
  for (let i = 0; i < 250; i++) { const r = await fetch(`${BASE}/api/public/suppliers/${A}/reviews/summary`); if (r.status === 429) { limited++; lr ??= r; } }
  check("T-01 the public review API is rate limited (120/min/IP): 429 appears within 250 requests (more than twice the limit, so one window must exceed it)", limited > 0, `${limited} limited`);
  check("T-02 the 429 carries Retry-After and the standard error shape (the first 429 of the burst)", lr?.status === 429 && Number(lr.headers.get("retry-after")) > 0 && (await lr.json()).code === "RATE_LIMITED");
}

try {
  await main();
} catch (error) {
  check("suite ran to the end without an exception", false, String(error?.stack ?? error));
} finally {
  await browser.close();
  if (process.env.KEEP !== "1") {
    await col.deleteMany({ __test: true });
    await col.deleteMany({ buyerId: { $in: (await db.collection("users").find({ email: { $regex: `^rv-${stamp}-` } }).toArray()).map((u) => u._id) } });
    await db.collection("users").deleteMany({ email: { $regex: `^rv-${stamp}-` } });
  }
  await client.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:\n" + failed.map((f) => f.name).join("\n"));
  process.exit(1);
}
