// Recently Viewed (Page 32): rules and code contracts (no database). Persistence, concurrency and the cap are covered by it-recently-viewed.mjs (BLOCKED without an isolated database).
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/83-recently-viewed-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let n = 0; const check = (name, ok) => { assert.ok(ok, name); n++; console.log("PASS ", name); };
const R = await import("../../../src/lib/recentlyViewed/rules.ts");
const PD = await import("../../../src/lib/catalog/productDetail.ts");
const PR = await import("../../../src/lib/catalog/productRef.ts");

const id = "64b7f0c2a1b2c3d4e5f60718";
check("defaults are the documented ones: 100 retained, 20 per page", R.RECENT_CAP === 100 && R.RECENT_PAGE === 20);
check("cursor round-trips and rejects anything malformed", (() => { const c = { ms: 1763000000000, id }; const e = R.encodeCursor(c); return JSON.stringify(R.decodeCursor(e)) === JSON.stringify(c) && ["", "x", "1_2", `abc_${id}`, `1763000000000_${id}zz`, `1763000000000;${id}`].every((v) => R.decodeCursor(v) === null); })());
check("list query: defaults, bounds, unknown parameters (a buyerId in the query) and bad cursor are refused", (() => { const ok = R.parseListQuery({}); const bad = [{ limit: "0" }, { limit: "21" }, { limit: "abc" }, { limit: "1e1" }, { cursor: "nope" }, { buyerId: id }, { userId: id }, { page: "2" }]; return ok.ok && ok.value.limit === 20 && ok.value.cursor === null && R.parseListQuery({ limit: "5", cursor: `1763000000000_${id}` }).ok && bad.every((q) => !R.parseListQuery(q).ok); })());
check("entry ids must be 24 hex characters", R.isEntryId(id) && ![undefined, "", "abc", id + "0", id.toUpperCase(), "../x", `${id}/x`].some(R.isEntryId));
check("viewed labels: today, yesterday, then a date", (() => { const now = new Date(2026, 10, 20, 15); return R.viewedLabel(new Date(2026, 10, 20, 1).toISOString(), now) === "Viewed today" && R.viewedLabel(new Date(2026, 10, 19, 23).toISOString(), now) === "Viewed yesterday" && /^Viewed 1 Nov 2026$/.test(R.viewedLabel(new Date(2026, 10, 1, 9).toISOString(), now)) && R.viewedLabel("garbage", now) === "Viewed recently"; })());

// every public product type already browsable round-trips through the one canonical key
const ids = [PD.getPublicProductByKey("1163"), PD.getPublicProductByKey("industrial-air-compressor")];
check("a catalogue product and a sample product resolve through the single resolver and back to the same detail URL (key = product.id)", ids.every((p) => p && PR.resolveProduct(p.id) && PD.getPublicProductByKey(p.id)?.url === p.url) && ids[0].id !== ids[1].id);
check("approved supplier products use the same path: keys 'sp-<id>' are accepted by resolveProduct and getPublicProductByKey (code contract)", /key\.startsWith\("sp-"\)/.test(read("src/lib/catalog/productRef.ts")) && /key\.startsWith\("sp-"\)/.test(read("src/lib/catalog/productDetail.ts")) && /resolveProduct\(clean\(body\.productId, 80\)\)/.test(read("src/app/api/buyer/recently-viewed/route.ts")));
check("an unknown, malformed or oversized key resolves to nothing, so nothing is recorded", ["", "nope-not-a-product", "x".repeat(81), "sp-doesnotexist", "99999999"].every((k) => PR.resolveProduct(k) === undefined));

// service and route contracts
const svc = read("src/lib/recentlyViewed/service.ts");
const coll = read("src/app/api/buyer/recently-viewed/route.ts");
const one = read("src/app/api/buyer/recently-viewed/[entryId]/route.ts");
check("storage: unique (buyer, product) and newest-first indexes; one atomic upsert with $max; duplicate-key race retried; only buyer, key and time are stored", /recent_per_buyer_product/.test(svc) && /unique: true/.test(svc) && /recent_newest/.test(svc) && /lastViewedAt: -1, _id: -1/.test(svc) && /\$max: \{ lastViewedAt: now \}/.test(svc) && /code !== 11000/.test(svc) && /\$setOnInsert: \{ userId: uid\(userId\), productKey \}/.test(svc) && !/productName|snapshot|supplierName: row|query:/.test(svc.split("function toItem")[0]));
check("every query names the buyer: list, remove, clear and the trim all carry userId", /\{ userId: uid\(userId\), \$or:/.test(svc) && /deleteOne\(\{ _id: new ObjectId\(entryId\), userId: uid\(userId\) \}\)/.test(svc) && /deleteMany\(\{ userId: uid\(userId\) \}\)/.test(svc) && /deleteMany\(\{ userId: uid\(userId\), _id: \{ \$in:/.test(svc));
check("cap enforced by trimming beyond RECENT_CAP in index order; listing is limit + 1 bounded, resolved in memory (no query per entry)", /skip\(RECENT_CAP\)/.test(svc) && /limit\(limit \+ 1\)/.test(svc) && !/for \(const .* of .*\) \{?\s*await/.test(svc.split("export async function listRecent")[1] ?? ""));
check("routes: buyer role from the session only, cross-site refusal and rate limits on every write, JSON content type and a 500-character body limit, private no-store, no buyerId read", [coll, one].every((s) => /requireBuyerApi\(\)/.test(s)) && (coll.match(/isCrossSiteWrite\(request\)/g) ?? []).length === 2 && /isCrossSiteWrite\(request\)/.test(one) && /application\/json/.test(coll) && /text\.length > 500/.test(coll) && /k !== "productId"/.test(coll) && /private, no-store/.test(coll + one) && !/body\.(buyerId|userId|role)|searchParams\.get\("(buyerId|userId)/.test(coll + one) && (coll.match(/rateLimit(Reserved)?\(/g) ?? []).length === 3 && /rateLimit\(/.test(one));
check("GET never writes (no record, remove or clear on the read paths) and the page only lists", !/recordView|removeEntry|clearHistory/.test(read("src/app/buyer/recently-viewed/page.tsx")) && /async function handleGET[\s\S]*?\n}\n/.exec(coll)[0].indexOf("recordView") === -1);

// recorder and product page
const rec = read("src/components/product/RecentlyViewedRecorder.tsx");
const prod = read("src/app/products/[slug]/page.tsx");
check("the recorder is a client effect after display: it asks who is signed in, posts only for a buyer, once per product per mount, ignores failures, renders nothing", /^"use client"/.test(rec) && /useEffect/.test(rec) && /await fetchMe\(\)/.test(rec) && /me\?\.role !== "buyer"\) return/.test(rec) && /done\.current === productKey/.test(rec) && /catch \{/.test(rec) && /return null/.test(rec) && /JSON\.stringify\(\{ productId: productKey \}\)/.test(rec));
check("the product page renders the recorder only after a resolved product (after notFound) and records nothing on the server; the page stays user-independent (no cookies or session)", prod.indexOf("notFound()") < prod.indexOf("<RecentlyViewedRecorder") && /productKey=\{product\.id\}/.test(prod) && !/recordView|getCurrentUser|cookies\(\)/.test(prod));
check("no prefetch, listing or search code records a view", !/recently-viewed|RecentlyViewed/.test(read("src/lib/catalog/categoryListing.ts")) && !/recently-viewed/.test(read("src/components/layout/MainHeader/HeaderActions.tsx")));

// navigation and UI
const ws = read("src/components/buyer/recent/RecentlyViewedWorkspace.tsx");
check("navigation: the buyer sidebar links to /buyer/recently-viewed and the page is protected by requireBuyerPage with its own path as the sign-in return", /key: "recently-viewed".*href: "\/buyer\/recently-viewed"/.test(read("src/components/buyer/buyerNav.ts")) && /requireBuyerPage\("\/buyer\/recently-viewed"\)/.test(read("src/app/buyer/recently-viewed/page.tsx")));
check("UI: no optimistic update (state changes only after a successful response), failure keeps entries and shows a message, load failure shows Retry not empty, clear needs the shared confirm dialog and is disabled while pending, account change drops the data", /if \(!result\.ok\) \{ setError\("We couldn't remove/.test(ws) && /if \(!result\.ok\) \{ setError\("We couldn't clear/.test(ws) && /status === "error" \? \(/.test(ws) && /Retry/.test(ws) && /We couldn&rsquo;t load your recently viewed products\./.test(ws) && /ConfirmDialog/.test(ws) && /disabled=\{items\.length === 0 \|\| clearing\}/.test(ws) && /AUTH_EVENT/.test(ws) && /setItems\(\[\]\)/.test(ws));
check("UI: copy per brief, accessible remove label includes the product name, unavailable entries show no private detail and no link, no nested interactive controls (remove button is a sibling of the links)", /No recently viewed products yet\./.test(ws) && /Explore products to start your history\./.test(ws) && /href="\/products"/.test(ws) && /aria-label=\{item\.name \? `Remove \$\{item\.name\} from recently viewed`/.test(ws) && /Product no longer available/.test(ws) && /Price on request/.test(ws) && !/<button[^>]*>[^<]*<Link/.test(ws));
console.log(`\n${n} passed, 0 failed`);
