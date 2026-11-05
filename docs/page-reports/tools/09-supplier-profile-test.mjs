import fs from "node:fs";
import { createRequire } from "node:module";
import puppeteer, { KnownDevices } from "puppeteer-core";

// Page 09 (Supplier Profile) with its inquiry, saved-supplier and supplier-addressed requirement flows.
// Needs a running `next start` (BASE, default :3100) on a TEST database (MONGODB_DB=<name>_test: it registers
// throwaway accounts and stores inquiries, saved suppliers and a requirement), Chrome and puppeteer-core.
// Catalog expectations come from db/seed/*.csv independently of the application code.
const require = createRequire("R:/indiamartref/");
const { MongoClient } = require("mongodb");
const BASE = process.env.BASE || "http://localhost:3100";
const TEST_DB = process.env.TEST_DB || "finbynmart_test";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = Object.fromEntries(fs.readFileSync("R:/indiamartref/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === TEST_DB) throw new Error("Refusing: the live database is named like the test database.");
const mongo = await new MongoClient(env.MONGODB_URI).connect();
const db = mongo.db(TEST_DB);
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });

async function open(path, { mobile = false, cookie } = {}) {
  const context = await browser.createBrowserContext();
  const p = await context.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  if (mobile) await p.emulate(KnownDevices["iPhone 13"]); else await p.setViewport({ width: 1440, height: 900 });
  if (cookie) await p.setCookie({ name: "finbyn_session", value: cookie, url: BASE });
  const resp = await p.goto(BASE + path, { waitUntil: "networkidle2" });
  p.errs = errs; p.status = resp.status();
  return p;
}
const fetchText = async (path) => { const r = await fetch(BASE + path, { redirect: "manual" }); return { status: r.status, loc: r.headers.get("location"), text: await r.text() }; };
const api = async (path, init) => { const r = await fetch(BASE + path, init); return { status: r.status, json: await r.json() }; };
const clickByText = (p, sel, t) => p.evaluate((s, x) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim().startsWith(x))?.click(), sel, t);
const text = (p, sel) => p.$eval(sel, (e) => e.textContent.replace(/\s+/g, " ").trim());
const num = (s) => Number(String(s).replace(/[^0-9]/g, ""));

// ---------- independent ground truth
function parseCsv(t) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const seed = (f) => { const [h, ...r] = parseCsv(fs.readFileSync(`R:/indiamartref/db/seed/${f}`, "utf8")).filter((x) => x.length > 1); return r.map((x) => Object.fromEntries(h.map((k, i) => [k, x[i]]))); };
const sellers = seed("sellers.csv").filter((s) => s.status === "Active");
const cats = new Map(seed("categories.csv").map((c) => [c.id, c]));
const slug = (n) => n.toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const productsOf = new Map();
for (const p of seed("products.csv")) { if (!cats.has(p.category_id)) continue; productsOf.set(p.seller_id, [...(productsOf.get(p.seller_id) ?? []), { ...p, cat: cats.get(p.category_id).name }]); }
const S = sellers.find((s) => s.id === "SLR0001");
const SP = productsOf.get(S.id);
const SURL = `/suppliers/${slug(S.name)}`;
const topCats = Object.entries(SP.reduce((m, p) => ((m[p.cat] = (m[p.cat] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((e) => e[0]).slice(0, 3);
console.log(`supplier ${S.id} ${S.name}: ${SP.length} products, top categories ${topCats.join(", ")}`);

const stamp = Date.now();
const register = async (n) => { const r = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "buyer", name: `P9 ${n}`, email: `p9-${n}-${stamp}@example.test`, password: "test-password-9" }) }); return (r.headers.getSetCookie?.() ?? []).map((l) => l.split(";")[0]).find((c) => c.startsWith("finbyn_session="))?.split("=")[1]; };
const tokenA = await register("a"), tokenB = await register("b");
const userA = await db.collection("users").findOne({ email: `p9-a-${stamp}@example.test` });
check("00 two buyers registered in the test database", !!tokenA && !!tokenB && !!userA);

// ======================= catalog supplier profile =======================
{
  const p = await open(SURL);
  check("9-01 loads with the supplier name as the only h1", p.status === 200 && (await text(p, "h1")) === S.name && (await p.$$("h1")).length === 1);
  const crumbs = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Breadcrumb] li")].map((l) => ({ t: l.textContent.trim(), h: l.querySelector("a")?.getAttribute("href") ?? null })));
  check("9-02 breadcrumb Home > Suppliers > name with working links", crumbs.map((c) => c.t).join(">") === `Home>Suppliers>${S.name}` && crumbs[0].h === "/" && crumbs[1].h === "/suppliers");
  const head = await text(p, "section[aria-labelledby=supplier-heading]");
  check("9-03 header facts equal the seed: industry, location, membership year, product count", head.includes(S.specialization) && head.includes(`${S.city}, ${S.state}`) && head.includes(`Member since ${S.joined_date.slice(0, 4)}`) && head.includes(`${SP.length} ${SP.length === 1 ? "Product" : "Products"}`), head.slice(0, 160));
  check("9-04 no verified badge, rating, response rate, years-in-business or supplier-type claim", !/Verified Supplier|★|Response Rate|Years in Business|Manufacturer|Exporter/.test(head));
  const imgs = await p.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=supplier-heading] ul[aria-label^='Products from'] img")].map((i) => ({ src: decodeURIComponent(i.getAttribute("src")), alt: i.getAttribute("alt") })));
  const own = new Set(SP.map((x) => x.source_image_url.replace(/^http:/, "https:")));
  check("9-05 the photos are the supplier's own product photos with descriptive alt text", imgs.length >= 1 && imgs.length <= 3 && imgs.every((i) => [...own].some((u) => i.src.includes(u)) && i.alt.includes(S.name)), JSON.stringify(imgs.map((i) => i.alt)));

  const stats = await p.evaluate(() => [...document.querySelectorAll("ul[aria-label='Supplier at a glance'] li")].map((l) => l.textContent.replace(/\s+/g, " ").trim()));
  check("9-06 the statistics strip holds only real values (products, member since, industry, place, verification)", stats.length === 5 && stats[0].startsWith(String(SP.length)) && stats[1].includes(S.joined_date.slice(0, 4)) && stats[2].includes(S.specialization) && stats[3].includes(S.state) && /Not verified/.test(stats[4]) && !/98%|B2B Buyers|PAN India/.test(stats.join(" ")), stats.join(" | "));

  const tabs = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Supplier profile'] a")].map((a) => ({ t: a.textContent.trim(), h: a.getAttribute("href"), cur: a.getAttribute("aria-current") })));
  check("9-07 tabs: About Company is current; every destination exists (pages and in-page sections)", tabs.map((t) => t.t.replace(/\(.*\)/, "").trim()).join("|") === "About Company|Products|Certifications|Reviews|Contact & Inquiry" && tabs[0].cur === "page" && tabs[0].h === SURL && tabs[1].h === `${SURL}/products` && tabs[2].h === `${SURL}/certifications` && tabs[3].h === `${SURL}/reviews` && tabs.slice(4).every((t) => t.h.startsWith(`${SURL}#`)), JSON.stringify(tabs));
  const inPage = await p.evaluate(() => ["certifications", "reviews", "contact"].every((id) => !!document.getElementById(id)));
  const list = await open(tabs[1].h); const heading = await list.$eval("#listing-heading", (h) => h.textContent); await list.close();
  check("9-08 the Products tab opens that supplier's list with the same count; in-page sections exist", inPage && heading.includes(`(${SP.length.toLocaleString("en-IN")})`), heading);

  const about = await text(p, "#about");
  check("9-09 About says what is known (a sentence from the record's facts) and that no description was added", about.includes(`${S.name} is a ${S.specialization} supplier based in ${S.city}, ${S.state}`) && /has not added a company description yet/.test(about) && topCats.every((c) => about.includes(c)), about.slice(0, 200));
  const rows = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll("section[aria-labelledby=details-heading] tr")].map((r) => [r.querySelector("th").textContent.trim(), r.querySelector("td").textContent.trim()])));
  check("9-10 Company Details lists only known fields, none of GST, turnover, employees, website, legal entity", rows["Company Name"] === S.name && rows.Industry === S.specialization && rows.Location === `${S.city}, ${S.state}` && rows["Products Listed"] === String(SP.length) && rows.Verification === "Not verified" && !Object.keys(rows).some((k) => /GST|Turnover|Employees|Website|Legal|Established/i.test(k)), JSON.stringify(rows));
  check("9-11 certifications and reviews state honestly what is published (none, or a count that links to the page)", /No certifications have been published|\d+ certifications? (is|are) published/.test(await text(p, "#certifications")) && /No reviews have been published|\d+ reviews? (is|are) published/.test(await text(p, "#reviews")));

  const cardNames = await p.evaluate(() => [...document.querySelectorAll("#products article a[class*=name]")].map((a) => a.textContent.trim()));
  const names = new Set(SP.map((x) => x.name));
  check("9-12 the products block shows only this supplier's products (up to 8) with a View All link and count", cardNames.length === Math.min(8, SP.length) && cardNames.every((n) => names.has(n)) && (await text(p, "#products")).includes(`View All Products (${SP.length})`), cardNames.join(" | "));
  const other = await p.evaluate(() => [...document.querySelectorAll("#products article a[class*=supplierName]")].map((a) => a.textContent.trim()));
  check("9-13 every product card names this supplier (no other supplier's product)", other.every((n) => n === S.name));
  await p.close();
}

// ======================= actions: inquiry, quote, save, share, requirement =======================
{
  const qty = "#contact input[inputmode=numeric]";
  const first = SP[0];
  const p = await open(SURL, { cookie: tokenA });
  await p.evaluate(() => [...document.querySelectorAll("a")].find((a) => /^Send Inquiry/.test(a.textContent.trim())).click()); await sleep(600);
  check("9-20 the Send Inquiry button brings up the inquiry form", /Send an Inquiry/.test(await text(p, "#contact h2")) && (await p.evaluate(() => document.querySelector("#contact [aria-pressed=true]").textContent.trim())) === "Send Inquiry");
  await p.evaluate(() => [...document.querySelectorAll("a")].find((a) => /^Get Best Quote/.test(a.textContent.trim())).click()); await sleep(600);
  check("9-21 the Get Best Quote button switches to the quote form", /Get the Best Quote/.test(await text(p, "#contact h2")));

  await p.select("#contact select", first.id); await sleep(200);
  const unit = await p.$eval("#contact input[readonly]", (i) => i.value);
  check("9-22 choosing a product fixes the unit to the product's own unit", unit === "Piece", unit);
  await p.click(qty, { clickCount: 3 }); await p.type(qty, "0");
  await clickByText(p, "#contact button", "Send Quote Request"); await sleep(400);
  check("9-23 a quantity of 0 is rejected in the browser and nothing is stored", /at least 1|whole number|Quantity/.test(await text(p, "#contact")) && (await db.collection("inquiries").countDocuments({ buyerId: userA._id, productKey: first.id })) === 0);
  await p.click(qty, { clickCount: 3 }); await p.type(qty, "30");
  await clickByText(p, "#contact button", "Send Quote Request"); await sleep(1800);
  const quote = await db.collection("inquiries").findOne({ buyerId: userA._id, productKey: first.id, quantity: 30 });
  const done = await text(p, "#contact");
  check("9-24 a quote request is stored for the product and this supplier, and the confirmation shows its reference", !!quote && quote.supplierKey === S.id && quote.type === "quote" && quote.unit === "Piece" && done.includes(String(quote._id)), done.slice(-120));

  await p.evaluate(() => [...document.querySelectorAll("a")].find((a) => /^Send Inquiry/.test(a.textContent.trim())).click()); await sleep(500);
  await p.select("#contact select", "other"); await sleep(200);
  await p.click(qty, { clickCount: 3 }); await p.type(qty, "12");
  await p.evaluate(() => { const selects = [...document.querySelectorAll("#contact select")]; const unit = selects[1]; unit.value = "Pieces"; unit.dispatchEvent(new Event("change", { bubbles: true })); });
  await p.type("#contact textarea", "Short");
  await clickByText(p, "#contact form button", "Send Inquiry"); await sleep(500);
  check("9-25 an inquiry needs a real question (10+ characters) and nothing is stored without it", /at least 10 characters/.test(await text(p, "#contact")) && (await db.collection("inquiries").countDocuments({ buyerId: userA._id, quantity: 12 })) === 0);
  await p.click("#contact textarea", { clickCount: 3 }); await p.type("#contact textarea", "Do you supply in bulk for school orders across Gujarat?");
  await clickByText(p, "#contact form button", "Send Inquiry"); await sleep(1800);
  const inq = await db.collection("inquiries").findOne({ buyerId: userA._id, quantity: 12, supplierKey: S.id });
  check("9-26 a general inquiry is stored for this supplier with type inquiry, no product, and the message", !!inq && inq.type === "inquiry" && !inq.productKey && /school orders/.test(inq.message ?? ""));
  await p.close();

  const h1 = await open(`${SURL}#send-inquiry`), h2 = await open(`${SURL}#get-best-quote`);
  check("9-27 /supplier#send-inquiry and #get-best-quote open the matching form on load", /Send an Inquiry/.test(await text(h1, "#contact h2")) && /Get the Best Quote/.test(await text(h2, "#contact h2")));
  await h1.close(); await h2.close();

  // signed out
  const out = await open(SURL);
  await out.select("#contact select", first.id); await out.click(qty, { clickCount: 3 }); await out.type(qty, "31");
  const before = await db.collection("inquiries").countDocuments({ productKey: first.id, quantity: 31 });
  await clickByText(out, "#contact button", "Send Quote Request"); await sleep(1500);
  check("9-28 signed out: asked to sign in, nothing stored, no success message", /sign in/i.test(await text(out, "#contact")) && (await db.collection("inquiries").countDocuments({ productKey: first.id, quantity: 31 })) === before && !/has been sent/.test(await text(out, "#contact")));
  await out.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Save Supplier/.test(b.textContent)).click());
  await out.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("9-29 signed out: Save Supplier sends the visitor to sign in", /\/sign-in/.test(out.url()), out.url());
  await out.close();

  const s = await open(SURL, { cookie: tokenA });
  const read = (token) => api("/api/buyer/wishlist/suppliers", { headers: { cookie: `finbyn_session=${token}` } });
  await clickByText(s, "button", "Save Supplier"); await sleep(1500);
  check("9-30 Save Supplier stores the supplier for the buyer, the button says Saved, another account does not see it", (await read(tokenA)).json.supplierIds.includes(S.id) && !(await read(tokenB)).json.supplierIds.includes(S.id) && /Saved/.test(await s.evaluate(() => document.querySelector("button[aria-pressed=true]")?.textContent ?? "")));
  await s.reload({ waitUntil: "networkidle2" }); await sleep(600);
  check("9-31 the saved state survives a reload (read back from the server)", /Saved/.test(await s.evaluate(() => document.querySelector("button[aria-pressed=true]")?.textContent ?? "")));
  await clickByText(s, "button", "Saved"); await sleep(1500);
  check("9-32 un-saving removes it from the server", !(await read(tokenA)).json.supplierIds.includes(S.id));
  await s.close();

  const sh = await open(SURL);
  await sh.evaluate(() => { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); navigator.clipboard.writeText = async (t) => { window.__copied = t; }; });
  await sh.click("button[class*=share]"); await sleep(500);
  check("9-33 Share copies the profile link and says so", (await sh.evaluate(() => window.__copied)) === BASE + SURL && /Link copied/.test(await sh.evaluate(() => document.body.innerText)));
  await sh.close();
  const denied = await (async () => { const c = await browser.createBrowserContext(); await c.overridePermissions(BASE, []); const pg = await c.newPage(); await pg.goto(BASE + SURL, { waitUntil: "networkidle2" }); return pg; })();
  await denied.evaluate(() => { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); });
  await denied.click("button[class*=share]"); await sleep(500);
  check("9-34 when the clipboard refuses, the page says so and does not claim success", /Couldn.t copy the link/.test(await denied.evaluate(() => document.body.innerText)) && !/Link copied/.test(await denied.evaluate(() => document.body.innerText)));
  await denied.close();

  // supplier-addressed requirement
  const req = await open(`/post-requirement?supplier=${slug(S.name)}&product=${encodeURIComponent("School uniforms")}`, { cookie: tokenA });
  check("9-35 the requirement form says which supplier it is addressed to", new RegExp(`addressed to\\s*${S.name}`).test(await req.evaluate(() => document.body.innerText)));
  await req.type("input[placeholder='Quantity']", "300"); await req.type("input[placeholder='Enter your city']", "Rajkot");
  await clickByText(req, "button", "Submit Requirement"); await sleep(1800);
  const rdoc = await db.collection("requirements").findOne({ userId: userA._id, city: "Rajkot", quantity: 300 });
  check("9-36 the requirement is stored with the supplier resolved on the server", !!rdoc && rdoc.supplierKey === S.id && rdoc.supplierName === S.name);
  await req.close();
  const bogus = await open("/post-requirement?supplier=not-a-supplier");
  check("9-37 an unknown supplier in the link is ignored (no note, no supplier sent)", !/addressed to/.test(await bogus.evaluate(() => document.body.innerText))); await bogus.close();
  const post = (body) => api("/api/requirements", { method: "POST", headers: { "Content-Type": "application/json", cookie: `finbyn_session=${tokenA}` }, body: JSON.stringify(body) });
  const base = { product: "Probe item", quantity: "5", city: "Pune" };
  check("9-38 API: an unknown supplier is refused (404) and nothing is stored", (await post({ ...base, supplierId: "SLR-NOPE" })).status === 404 && (await db.collection("requirements").countDocuments({ userId: userA._id, product: "Probe item" })) === 0);
  const okR = await post({ ...base, product: "Probe item two", supplierId: slug(S.name), supplierName: "Forged Name", supplierKey: "SLR0009" });
  const okDoc = await db.collection("requirements").findOne({ userId: userA._id, product: "Probe item two" });
  check("9-39 API: the supplier is resolved by the server; a client-sent name or key is ignored", okR.status === 201 && okDoc?.supplierKey === S.id && okDoc?.supplierName === S.name);
}

// ======================= sample suppliers, links, collisions, not found, SEO =======================
{
  const t = await open("/suppliers/shree-textiles");
  check("9-50 the hand-written sample profile (Shree Textiles): description, verified badge from its record, its 8 listings", /Shree Textiles is a manufacturer and supplier/.test(await text(t, "#about")) && /Verified Supplier/.test(await text(t, "section[aria-labelledby=supplier-heading]")) && (await t.$$eval("#products article", (a) => a.length)) === 8);
  await t.close();
  const g = await open("/suppliers/shree-industrial-works");
  check("9-51 a supplier that only had sample listings now has a profile (it was a 404): name, type, its one product", g.status === 200 && (await text(g, "h1")) === "Shree Industrial Works" && /Manufacturer/.test(await text(g, "section[aria-labelledby=supplier-heading]")) && /Industrial Air Compressor/.test(await text(g, "#products")));
  await g.close();
  const links = [];
  for (const path of ["/", "/products?category=packaging-printing", "/products?category=industrial-machinery", "/products?category=electrical-electronics", "/products?category=construction-real-estate", "/products?category=health-pharma"]) {
    const pg = await open(path);
    links.push(...(await pg.evaluate(() => [...document.querySelectorAll("a[href^='/suppliers/']")].map((a) => a.getAttribute("href")))));
    await pg.close();
  }
  const unique = [...new Set(links)];
  const statuses = await Promise.all(unique.map((h) => fetchText(h)));
  check("9-52 every supplier link on the homepage and on sample product cards resolves", unique.length >= 8 && statuses.every((r) => r.status === 200), `${unique.length} links; bad: ${unique.filter((_, i) => statuses[i].status !== 200).join(",")}`);

  const hub = sellers.find((s) => s.name === "Fashion Hub");
  const sampleHub = await open("/suppliers/fashion-hub");
  check("9-53 a catalog seller with a sample supplier's name no longer takes over the sample supplier's page", /Fashion Hub/.test(await text(sampleHub, "h1")) && (!hub || /Tirupur|Tamil/.test(await text(sampleHub, "section[aria-labelledby=supplier-heading]"))), await text(sampleHub, "section[aria-labelledby=supplier-heading]").then((x) => x.slice(0, 120)));
  await sampleHub.close();
  if (hub) {
    const hubPage = await fetchText(`/suppliers/fashion-hub-${hub.id.toLowerCase()}`);
    check("9-54 the catalog seller keeps its own page under a suffixed slug", hubPage.status === 200 && hubPage.text.includes(hub.city));
  }

  for (const bad of ["no-such-supplier", "x".repeat(120), "..%2F..%2Fetc", "UPPER_case"]) check(`9-55 ${bad.slice(0, 18)} is a real 404`, (await fetchText(`/suppliers/${bad}`)).status === 404);

  const html = (await fetchText(SURL)).text;
  const meta = (re) => (re.exec(html) ?? [])[1];
  check("9-56 SEO: title and description name the supplier and place; one h1; Open Graph", new RegExp(`${S.name}.*${S.city}`).test(meta(/<title>([^<]*)/) ?? "") && (meta(/<meta name="description" content="([^"]*)"/) ?? "").includes(S.state) && (html.match(/<h1/g) || []).length === 1 && /og:title/.test(html));
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].flatMap((m) => JSON.parse(m[1]));
  const org = ld.find((x) => x["@type"] === "Organization");
  check("9-57 structured data: breadcrumb (3) and an Organization with name and place only (no ratings, reviews, certifications or verification)", ld.find((x) => x["@type"] === "BreadcrumbList")?.itemListElement.length === 3 && org?.name === S.name && org.address.addressLocality === S.city && !/rating|review|certif|verified/i.test(JSON.stringify(org)));
}

// ======================= phone =======================
{
  const p = await open(SURL, { mobile: true });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const actions = await p.evaluate(() => ["Send Inquiry", "Get Best Quote"].every((t) => { const el = [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === t); const r = el?.getBoundingClientRect(); return r && r.height >= 44 && r.left >= 0 && r.right <= innerWidth; }));
  const tabs = await p.evaluate(() => { const n = document.querySelector("nav[aria-label='Supplier profile']"); return n.scrollWidth >= n.clientWidth; });
  check("9-60 phone: no overflow, the actions fit and are 44px tall, the tab row scrolls", !overflow && actions && tabs && p.errs.length === 0, p.errs.join(";"));
  await p.close();
}

await browser.close();
await mongo.close();
const fails = results.filter((x) => !x.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) console.log("FAILED:\n" + fails.map((f) => " - " + f.name).join("\n"));
