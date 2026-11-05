import fs from "node:fs";
import { createRequire } from "node:module";
import puppeteer, { KnownDevices } from "puppeteer-core";

// Page 06 (Product Details) and the public product APIs. Needs a running `next start` (BASE, default :3100) on a TEST
// database (MONGODB_DB=<name>_test: it registers throwaway accounts and stores inquiries), Chrome and puppeteer-core.
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

// ---------- independent ground truth
function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const seed = (f) => { const [h, ...r] = parseCsv(fs.readFileSync(`R:/indiamartref/db/seed/${f}`, "utf8")).filter((x) => x.length > 1); return r.map((x) => Object.fromEntries(h.map((k, i) => [k, x[i]]))); };
const sellers = new Map(seed("sellers.csv").filter((s) => s.status === "Active").map((s) => [s.id, s]));
const cats = new Map(seed("categories.csv").map((c) => [c.id, c]));
const products = seed("products.csv").filter((p) => sellers.has(p.seller_id) && cats.has(p.category_id));
const sizes = new Map(); for (const r of seed("product_sizes.csv")) sizes.set(r.product_id, [...(sizes.get(r.product_id) ?? []), r.size]);
const slug = (n) => n.toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const P = products.find((p) => p.id === "1163");
const PC = cats.get(P.category_id), PS = sellers.get(P.seller_id);
const PURL = `/products/${slug(P.name)}-${P.id}`;
const sellerProducts = products.filter((p) => p.seller_id === P.seller_id).length;
const inSub = products.filter((p) => p.category_id === P.category_id).length;
console.log(`product ${P.id} ${P.name}; seller ${PS.name} has ${sellerProducts} products; ${inSub} in ${PC.name}`);

async function open(path, { mobile = false, cookie, clipboard = false } = {}) {
  const context = await browser.createBrowserContext();
  if (clipboard === "deny") await context.overridePermissions(BASE, []);
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
const api = async (path) => { const r = await fetch(BASE + path); return { status: r.status, headers: r.headers, json: await r.json() }; };
const text = (p, sel) => p.$eval(sel, (e) => e.textContent.replace(/\s+/g, " ").trim());
const clickByText = (p, sel, t) => p.evaluate((s, x) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim().startsWith(x))?.click(), sel, t);
const crumbs = (p) => p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Breadcrumb] li")].map((l) => ({ t: l.textContent.trim(), h: l.querySelector("a")?.getAttribute("href") ?? null })));

// signed-in buyer
const stamp = Date.now();
const reg = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "buyer", name: "P6 Tester", email: `p6-${stamp}@example.test`, password: "test-password-9" }) });
const token = (reg.headers.getSetCookie?.() ?? []).map((l) => l.split(";")[0]).find((c) => c.startsWith("finbyn_session="))?.split("=")[1];
const user = await db.collection("users").findOne({ email: `p6-${stamp}@example.test` });
check("00 signed-in buyer created in the test database", !!token && !!user);

// ======================= catalog product page =======================
{
  const p = await open(PURL);
  check("6-01 loads with the product name as the only h1", p.status === 200 && (await p.$$eval("h1", (h) => h.length)) === 1 && (await text(p, "h1")) === P.name, await text(p, "h1"));
  const c = await crumbs(p);
  check("6-02 breadcrumb comes from the real category: Home > Apparel & Fashion > <category> > product", c.map((x) => x.t).join(">") === `Home>Apparel & Fashion>${PC.name}>${P.name}` && c[0].h === "/" && c[1].h === "/categories/apparel-fashion" && c[2].h === `/categories/apparel-fashion/${slug(PC.name)}`, c.map((x) => x.t).join(">"));
  check("6-03 every breadcrumb link resolves", (await Promise.all(c.filter((x) => x.h).map((x) => fetchText(x.h)))).every((r) => r.status === 200));

  const img = await p.evaluate(() => { const i = document.querySelector("section[aria-label=Product] img[src]"); return i ? { src: decodeURIComponent(i.getAttribute("src")), alt: i.getAttribute("alt"), w: i.getBoundingClientRect().width } : null; });
  check("6-04 the real product photo is shown with the product name as alt text", !!img && /assets\.myntassets\.com/.test(img.src) && img.alt === P.name && img.w > 200, JSON.stringify(img));
  check("6-05 one image: no thumbnails, no video or 360 controls", (await p.$$("ul[aria-label='Product images']")).length === 0 && !/360|video/i.test(await p.evaluate(() => document.querySelector("section[aria-label=Product]").innerText)));
  await p.click("button[aria-label='View image full screen']"); await sleep(300);
  check("6-06 the full-screen viewer opens as a dialog", await p.evaluate(() => !!document.querySelector("[role=dialog][aria-modal=true] img")));
  await p.keyboard.press("Escape"); await sleep(300);
  check("6-07 Escape closes the viewer and focus returns to the button", !(await p.$("[role=dialog][aria-modal=true]")) && (await p.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "View image full screen");

  const priceText = await text(p, "[class*=priceBlock]");
  check("6-08 price is the seed's estimate, marked Est., with the unit and a confirm-the-price note", priceText.includes(`₹${Number(P.estimated_price_inr).toLocaleString("en-IN")}`) && /Est\./.test(priceText) && /\/ Piece/.test(priceText) && /confirm the final price/.test(priceText), priceText);
  check("6-09 no MOQ in the data: shown as not specified, never as 1", /not specified by the supplier/.test(await text(p, "[class*=moq]")) && /No minimum order is listed/.test(await p.evaluate(() => document.querySelector("[id$='-help']").textContent)));
  check("6-10 no rating, no badge and no availability claim for a catalog product", !(await p.evaluate(() => /ratings\)|Bestseller|In Stock|Verified Supplier/.test(document.querySelector("section[aria-label=Product]").innerText))));

  const card = await text(p, "aside[aria-label=Supplier]");
  check("6-11 supplier card: name, location and the real product count; not verified", card.includes(PS.name) && card.includes(`${PS.city}, ${PS.state}`) && card.includes(`${sellerProducts.toLocaleString("en-IN")} products`) && !/Verified/.test(card), card);
  const links = await p.evaluate(() => [...document.querySelectorAll("aside[aria-label=Supplier] a")].map((a) => ({ t: a.textContent.trim(), h: a.getAttribute("href") })));
  const all = links.find((l) => /All Products/.test(l.t));
  check("6-12 'All Products by Supplier (N)' links to that supplier's list with the same count", all?.t.includes(`(${sellerProducts.toLocaleString("en-IN")})`) && /^\/suppliers\/[a-z0-9-]+\/products$/.test(all.h), JSON.stringify(all));
  const sp = await open(all.h); const heading = await sp.$eval("#listing-heading", (h) => h.textContent); await sp.close();
  check("6-13 and that list shows the same number of products", heading.includes(`(${sellerProducts.toLocaleString("en-IN")})`), heading);
  check("6-14 View Supplier Profile opens a real supplier page", (await fetchText(links.find((l) => /View Supplier Profile/.test(l.t)).h)).status === 200);

  // tabs
  const tabNames = await p.$$eval("[role=tab]", (t) => t.map((x) => x.textContent.trim()));
  check("6-15 tabs: only those with content (Details, Specifications, Reviews)", tabNames.join("|") === "Product Details|Specifications|Reviews", tabNames.join("|"));
  await p.focus("[role=tab][aria-selected=true]"); await p.keyboard.press("ArrowRight"); await sleep(150);
  check("6-16 arrow keys move between tabs (selection and focus)", (await p.evaluate(() => document.activeElement?.textContent.trim())) === "Specifications" && (await p.evaluate(() => document.querySelector("[role=tab][aria-selected=true]").textContent.trim())) === "Specifications");
  const specs = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll("[role=tabpanel]:not([hidden]) tr")].map((r) => [r.querySelector("th").textContent.trim(), r.querySelector("td").textContent.trim()])));
  check("6-17 specifications are the seed's real fields", specs.Category === PC.name && specs.Department === PC.department && specs.Colour === P.colour && specs["Sizes (estimated)"] === (sizes.get(P.id) ?? []).join(", "), JSON.stringify(specs));
  await p.keyboard.press("Home"); await sleep(100);
  check("6-18 Product Details says honestly that there is no description yet", /has not added a description/.test(await p.evaluate(() => document.querySelector("[role=tabpanel]:not([hidden])").textContent)));
  await p.keyboard.press("End"); await sleep(100);
  check("6-19 Reviews says honestly that none are published (no invented ratings)", /No reviews have been published/.test(await p.evaluate(() => document.querySelector("[role=tabpanel]:not([hidden])").textContent)));

  // related
  const related = await p.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=related-products-heading] article a[class*=name]")].map((a) => a.getAttribute("href")));
  const relIds = related.map((h) => h.match(/-(\d+)$/)?.[1]);
  const sameSub = relIds.filter((id) => products.find((x) => x.id === id)?.category_id === P.category_id).length;
  check("6-20 related products: real cards, never the product itself, the same subcategory first", related.length >= 4 && !relIds.includes(P.id) && new Set(relIds).size === relIds.length && sameSub === Math.min(8, inSub - 1) && relIds.slice(0, sameSub).every((id) => products.find((x) => x.id === id).category_id === P.category_id), `${related.length} cards, ${sameSub} in the same subcategory`);

  // share
  await p.close();
  // Headless Chrome denies real clipboard writes, so the success path uses a stub that records what the page copies,
  // and the failure path uses the real (denied) clipboard to confirm the page reports it instead of claiming success.
  const noShare = () => Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  const sh = await open(PURL);
  await sh.evaluate(noShare);
  await sh.evaluate(() => { navigator.clipboard.writeText = async (t) => { window.__copied = t; }; });
  await sh.click("button[class*=share]"); await sleep(500);
  check("6-21 Share copies the product link and says so (no native share in this browser)", (await sh.evaluate(() => window.__copied)) === BASE + PURL && /Link copied/.test(await sh.evaluate(() => document.body.innerText)));
  await sh.close();
  const denied = await open(PURL, { clipboard: "deny" });
  await denied.evaluate(noShare);
  await denied.click("button[class*=share]"); await sleep(500);
  check("6-22 when the clipboard refuses, the page says so and does not claim success", /Couldn.t copy the link/.test(await denied.evaluate(() => document.body.innerText)) && !/Link copied/.test(await denied.evaluate(() => document.body.innerText)));
  await denied.close();
}

// ======================= quantity, quote, inquiry =======================
{
  const p = await open(PURL);
  const qty = "input[inputmode=numeric]";
  await clickByText(p, "button", "Get Best Quote"); await sleep(300);
  check("6-30 Get Best Quote opens the form for this product", await p.evaluate(() => { const e = document.getElementById("get-best-quote"); return !!e && !e.hidden && /Get the best quote for/.test(e.innerText); }));
  await p.click(qty, { clickCount: 3 }); await p.type(qty, "0");
  await clickByText(p, "#get-best-quote button", "Send Quote Request"); await sleep(300);
  check("6-31 quantity 0 is rejected in the browser", /at least 1|whole number/.test(await p.evaluate(() => document.body.innerText)));
  await p.click(qty, { clickCount: 3 }); await p.type(qty, "40");
  const before = await db.collection("inquiries").countDocuments({ productKey: P.id, quantity: 40 });
  await clickByText(p, "#get-best-quote button", "Send Quote Request"); await sleep(1500);
  check("6-32 signed out: asked to sign in, nothing stored, no success message", /sign in/i.test(await text(p, "#get-best-quote")) && (await db.collection("inquiries").countDocuments({ productKey: P.id, quantity: 40 })) === before && !/has been sent/.test(await text(p, "#get-best-quote")));
  await p.close();

  const s = await open(PURL, { cookie: token });
  await clickByText(s, "button", "Get Best Quote"); await sleep(300);
  await s.click(qty, { clickCount: 3 }); await s.type(qty, "40");
  await clickByText(s, "#get-best-quote button", "Send Quote Request"); await sleep(1800);
  const done = await text(s, "#get-best-quote");
  const doc = await db.collection("inquiries").findOne({ buyerId: user._id, productKey: P.id, quantity: 40 });
  check("6-33 signed in: success appears only with a real reference, and the inquiry is stored for this product and its seller", /has been sent/.test(done) && !!doc && done.includes(String(doc._id)) && doc.supplierKey === P.seller_id && doc.unit === "Piece" && doc.type === "quote", done.slice(0, 120));
  await s.close();

  const i = await open(PURL, { cookie: token });
  await clickByText(i, "button", "Send Inquiry"); await sleep(300);
  await i.click(qty, { clickCount: 3 }); await i.type(qty, "12");
  await i.type("#get-best-quote textarea", "Short");
  await clickByText(i, "#get-best-quote button", "Send Inquiry"); await sleep(400);
  check("6-34 an inquiry needs a real question (10+ characters)", /at least 10 characters/.test(await text(i, "#get-best-quote")) && (await db.collection("inquiries").countDocuments({ buyerId: user._id, quantity: 12 })) === 0);
  await i.click("#get-best-quote textarea", { clickCount: 3 }); await i.type("#get-best-quote textarea", "Is this available in size XL and what is the delivery time to Kochi?");
  await clickByText(i, "#get-best-quote button", "Send Inquiry"); await sleep(1800);
  const idoc = await db.collection("inquiries").findOne({ buyerId: user._id, productKey: P.id, quantity: 12 });
  check("6-35 a valid inquiry is stored with type inquiry and the message", !!idoc && idoc.type === "inquiry" && /size XL/.test(idoc.message ?? "") && /has been sent/.test(await text(i, "#get-best-quote")));
  await i.close();

  const h1 = await open(`${PURL}#get-best-quote`); const h2 = await open(`${PURL}#send-inquiry`);
  check("6-36 /product#get-best-quote and #send-inquiry open the matching form on load (links from product cards)", (await h1.evaluate(() => /Get the best quote/.test(document.getElementById("get-best-quote").innerText))) && (await h2.evaluate(() => /Send an inquiry/.test(document.getElementById("get-best-quote").innerText))));
  await h1.close(); await h2.close();

  // sample product with a MOQ: solar panel 540W, MOQ 10 pieces
  const m = await open("/products/solar-panel-540w");
  check("6-37 sample product: price without Est., MOQ with unit, quantity starts at the MOQ", /₹12,500/.test(await text(m, "[class*=priceBlock]")) && !/Est\./.test(await text(m, "[class*=priceBlock]")) && /10 Pieces/.test(await text(m, "[class*=moq]")) && (await m.$eval(qty, (e) => e.value)) === "10");
  check("6-38 the minus button stops at the MOQ", await m.$eval("button[aria-label='Decrease quantity']", (b) => b.disabled));
  await m.click(qty, { clickCount: 3 }); await m.type(qty, "5");
  check("6-39 a quantity below the MOQ is explained", /minimum order is 10 pieces/i.test(await m.evaluate(() => document.querySelector("[id$='-help']").textContent)));
  await m.click("button[aria-label='Increase quantity']"); await sleep(100);
  check("6-40 plus never goes below the MOQ either", Number(await m.$eval(qty, (e) => e.value)) >= 10);
  const rating = await text(m, "[class*=metaRow]");
  check("6-41 sample product: rating shown from its record, supplier verified badge from its record", /4\.6 \(98 ratings\)/.test(rating) && /Verified Supplier/.test(await text(m, "aside[aria-label=Supplier]")) && /Manufacturer/.test(await text(m, "aside[aria-label=Supplier]")), rating);
  await m.close();

  // bulk price
  const b = await open(PURL);
  await b.click(qty, { clickCount: 3 }); await b.type(qty, "250");
  const bulk = await b.evaluate(() => [...document.querySelectorAll("a")].find((a) => /Request Bulk Price/.test(a.textContent)).getAttribute("href"));
  const bu = new URL(bulk, BASE);
  check("6-42 Request Bulk Price carries the product, category, subcategory, quantity and unit", bu.pathname === "/post-requirement" && bu.searchParams.get("product") === P.name && bu.searchParams.get("category") === "Apparel & Fashion" && bu.searchParams.get("subcategory") === PC.name && bu.searchParams.get("quantity") === "250" && bu.searchParams.get("unit") === "Piece", bulk);
  await b.close();
  const r = await open(bulk, { cookie: token });
  check("6-43 the requirement form opens with the product and quantity prefilled", (await r.$eval("main input[placeholder^='Enter product']", (e) => e.value)) === P.name && (await r.$eval("main input[placeholder='Quantity']", (e) => e.value)) === "250");
  await r.type("input[placeholder='Enter your city']", "Kochi");
  await clickByText(r, "button", "Submit Requirement"); await sleep(1800);
  const rdoc = await db.collection("requirements").findOne({ userId: user._id, quantity: 250, city: "Kochi" });
  check("6-44 the bulk requirement is stored with category, subcategory and unit", !!rdoc && rdoc.category === "Apparel & Fashion" && rdoc.subcategory === PC.name && rdoc.unit === "Piece");
  await r.close();
}

// ======================= wishlist =======================
{
  const out = await open(PURL);
  await out.evaluate(() => document.querySelector("button[aria-label^='Save']").click());
  await out.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("6-50 signed out: the heart sends the visitor to sign in", /\/sign-in/.test(out.url()), out.url());
  await out.close();
  const p = await open(PURL, { cookie: token });
  const pos = await p.evaluate(() => { const r = document.querySelector("[class*=metaRow] button[aria-label^='Save']").getBoundingClientRect(); return { x: r.x, y: r.y }; });
  check("6-51 the heart sits in the product's action row (not in a page corner)", pos.x < 1000 && pos.y > 200 && pos.y < 500, JSON.stringify(pos));
  await p.evaluate(() => document.querySelector("[class*=metaRow] button[aria-label^='Save']").click()); await sleep(1500);
  const saved = await fetch(`${BASE}/api/buyer/wishlist`, { headers: { cookie: `finbyn_session=${token}` } }).then((x) => x.json());
  await p.reload({ waitUntil: "networkidle2" }); await sleep(600);
  check("6-52 saving is stored for the buyer and survives a reload", saved.productIds?.includes(P.id) && (await p.evaluate(() => document.querySelector("[class*=metaRow] button[aria-pressed]").getAttribute("aria-pressed"))) === "true");
  await p.close();
}

// ======================= not found, redirects, SEO =======================
{
  let r = await fetchText("/products/does-not-exist-999999");
  check("6-60 an unknown product is a real 404", r.status === 404);
  r = await fetchText(`/products/wrong-text-${P.id}`);
  check("6-61 any text before a real id redirects to the one canonical URL", r.status === 308 && r.loc === PURL, `${r.status} ${r.loc}`);
  r = await fetchText("/products/%2e%2e%2f%2e%2e%2fetc");
  check("6-62 path-like slugs are not found", r.status === 404);
  const html = (await fetchText(PURL)).text;
  const meta = (re) => (re.exec(html) ?? [])[1];
  check("6-63 unique title and description name the product and supplier", new RegExp(`${P.name.slice(0, 20)}.*${PS.name.slice(0, 8)}`).test(meta(/<title>([^<]*)/) ?? "") && (meta(/<meta name="description" content="([^"]*)"/) ?? "").includes(PS.city));
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].flatMap((m) => JSON.parse(m[1]));
  const prod = ld.find((x) => x["@type"] === "Product"); const bc = ld.find((x) => x["@type"] === "BreadcrumbList");
  check("6-64 structured data: breadcrumb and a Product with no price, rating or availability claims", bc?.itemListElement.length === 4 && prod?.name === P.name && !("offers" in prod) && !("aggregateRating" in prod) && !/price|rating|availability/i.test(JSON.stringify(prod)));
  check("6-65 Open Graph title and image", /og:title/.test(html) && /og:image/.test(html));
}

// ======================= phone =======================
{
  const p = await open(PURL, { mobile: true });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const visible = await p.evaluate(() => { const i = document.querySelector("section[aria-label=Product] img[src]")?.getBoundingClientRect(); return !!i && i.width > 150 && i.right <= innerWidth; });
  const buttons = await p.evaluate(() => ["Get Best Quote", "Send Inquiry", "Request Bulk Price"].every((t) => { const el = [...document.querySelectorAll("button, a")].find((x) => x.textContent.trim() === t); const r = el?.getBoundingClientRect(); return r && r.height >= 44 && r.right <= innerWidth && r.left >= 0; }));
  check("6-70 phone: no overflow, the photo shows, the three actions fit and are 44px tall", !overflow && visible && buttons && p.errs.length === 0, p.errs.join(";"));
  const tabs = await p.evaluate(() => { const l = document.querySelector("[role=tablist]"); return l.scrollWidth >= l.clientWidth; });
  check("6-71 phone: the tab row scrolls instead of overflowing the page", tabs && !overflow);
  await p.close();
}

// ======================= public API =======================
{
  let r = await api(`/api/public/products/${slug(P.name)}-${P.id}`);
  const d = r.json.data?.product;
  check("A1 product detail by slug: normalised DTO with real fields", r.status === 200 && r.json.ok && d.id === P.id && d.name === P.name && d.pricing.min === Number(P.estimated_price_inr) && d.pricing.type === "estimated" && d.moq === null && d.availability === null && d.supplier.name === PS.name && d.supplier.verificationStatus === "unverified" && d.supplier.productCount === sellerProducts && d.specifications.length >= 3);
  check("A2 no private fields (emails, phones, owner, pincode, internal keys) in the response", !/@example|phone|owner|pincode|passwordHash|\+91|_id/i.test(JSON.stringify(r.json)));
  check("A3 empty sections are empty lists, never invented", d.documents.length === 0 && d.videos.length === 0 && d.applications.length === 0 && d.technicalDetails.length === 0 && d.features.length === 0 && d.description === null && d.rating === null);
  r = await api(`/api/public/products/${P.id}`); check("A4 lookup by catalog id works", r.status === 200 && r.json.data.product.slug === `${slug(P.name)}-${P.id}`);
  r = await api("/api/public/products/industrial-air-compressor"); check("A5 sample listing: MOQ, price type, rating, verified flag from its record", r.status === 200 && r.json.data.product.moq.quantity === 1 && r.json.data.product.pricing.type === "fixed" && r.json.data.product.source === "sample");
  for (const bad of ["nope-1", "..%2F..%2Fetc", "a".repeat(200), "x%00y"]) { r = await api(`/api/public/products/${bad}`); check(`A6 ${bad.slice(0, 20)} is a 404 with a safe message`, r.status === 404 && r.json.ok === false && r.json.code === "NOT_FOUND" && !/stack|node_modules|.tsx?:/.test(JSON.stringify(r.json))); }
  r = await api(`/api/public/products/${P.id}/related`);
  const ids = r.json.data.products.map((x) => x.id);
  check("A7 related: up to 8, same subcategory first, not the product itself", r.status === 200 && ids.length === 8 && !ids.includes(P.id) && r.json.data.products.every((x) => x.subcategory.id === slug(PC.name)));
  r = await api(`/api/public/products/${P.id}/related?limit=3`); check("A8 related limit", r.json.data.products.length === 3);
  for (const bad of ["limit=0", "limit=13", "limit=abc"]) { r = await api(`/api/public/products/${P.id}/related?${bad}`); check(`A9 related ${bad} is rejected`, r.status === 400 && !!r.json.fields.limit); }
  r = await api("/api/public/products/nope-1/related"); check("A10 related for an unknown product is 404", r.status === 404);
  r = await api(`/api/public/products/${P.id}/reviews`);
  check("A11 reviews: truthfully empty (no reviews system), with accurate paging meta", r.status === 200 && r.json.data.supported === false && r.json.data.reviews.length === 0 && r.json.data.summary.count === 0 && r.json.data.summary.average === null && r.json.meta.totalItems === 0);
  for (const bad of ["page=0", "limit=51", "limit=abc"]) { r = await api(`/api/public/products/${P.id}/reviews?${bad}`); check(`A12 reviews ${bad} is rejected`, r.status === 400); }
  check("A13 shared-cache headers on product detail", /s-maxage/.test((await api(`/api/public/products/${P.id}`)).headers.get("cache-control") ?? ""));
}

await browser.close();
await mongo.close();
const fails = results.filter((x) => !x.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) console.log("FAILED:\n" + fails.map((f) => " - " + f.name).join("\n"));
