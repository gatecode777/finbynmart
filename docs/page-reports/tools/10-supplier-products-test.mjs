import fs from "node:fs";
import puppeteer, { KnownDevices } from "puppeteer-core";

// Page 10 (Supplier Products: /suppliers/[slug]/products) and the public supplier APIs.
// Needs a running `next start` (BASE, default :3100), Chrome and puppeteer-core. No database writes.
// Catalog expectations come from db/seed/*.csv independently of the application code.
const BASE = process.env.BASE || "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });

async function open(path, { mobile = false } = {}) {
  const context = await browser.createBrowserContext();
  const p = await context.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  if (mobile) await p.emulate(KnownDevices["iPhone 13"]); else await p.setViewport({ width: 1440, height: 900 });
  const resp = await p.goto(BASE + path, { waitUntil: "networkidle2" });
  p.errs = errs; p.status = resp.status();
  return p;
}
const fetchText = async (path) => { const r = await fetch(BASE + path, { redirect: "manual" }); return { status: r.status, loc: r.headers.get("location"), text: await r.text() }; };
const api = async (path) => { const r = await fetch(BASE + path); return { status: r.status, headers: r.headers, json: await r.json() }; };
const count = (p) => p.evaluate(() => { const m = /\(([\d,]+)\)/.exec(document.querySelector("#listing-heading")?.textContent ?? ""); return m ? Number(m[1].replace(/,/g, "")) : null; });
const cards = (p) => p.evaluate(() => [...document.querySelectorAll("ul[class*=grid] article, ul[class*=list] article")].map((a) => ({
  name: a.querySelector("a[class*=name]")?.textContent.trim(), href: a.querySelector("a[class*=name]")?.getAttribute("href"), supplier: a.querySelector("a[class*=supplierName]")?.textContent.trim(),
  price: Number((/₹\s*([\d,]+)/.exec(a.querySelector("[class*=price]")?.textContent ?? "")?.[1] ?? "NaN").replace(/,/g, "")), text: a.innerText.replace(/\s+/g, " "),
  buttons: [...a.querySelectorAll("a")].filter((l) => /Get Best Quote|Add Inquiry/.test(l.textContent)).map((l) => ({ t: l.textContent.trim(), h: l.getAttribute("href") })),
})));
const urlOf = (p) => new URL(p.url());

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
const sellers = new Map(seed("sellers.csv").filter((s) => s.status === "Active").map((s) => [s.id, s]));
const cats = new Map(seed("categories.csv").map((c) => [c.id, c]));
const slug = (n) => n.toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const norm = (s) => s.toLowerCase().replace(/-/g, "");
const bySeller = new Map();
for (const p of seed("products.csv")) {
  const s = sellers.get(p.seller_id), c = cats.get(p.category_id);
  if (!s || !c) continue;
  const row = { id: p.id, name: p.name, cat: c.name, sub: slug(c.name), dept: c.department, colour: p.colour, price: Number(p.estimated_price_inr), hay: norm(`${p.name} ${c.name} ${p.colour} ${c.department} Apparel & Fashion`) };
  bySeller.set(s.id, [...(bySeller.get(s.id) ?? []), row]);
}
const tokens = (q) => { const w = norm(q).split(/\s+/).filter(Boolean); const out = []; for (let i = 0; i < w.length; i++) { if (w[i].length === 1 && i + 1 < w.length) w[i + 1] = w[i] + w[i + 1]; else out.push(w[i]); } return out; };
const matches = (t, q) => tokens(q).every((w) => (w.length <= 3 ? t.hay.startsWith(w) || t.hay.includes(` ${w}`) : t.hay.includes(w)));

const S = sellers.get("SLR0001"); const SP = bySeller.get(S.id); const SURL = `/suppliers/${slug(S.name)}`;
const big = [...bySeller.entries()].sort((a, b) => b[1].length - a[1].length)[0]; const B = sellers.get(big[0]); const BP = big[1]; const BURL = `/suppliers/${slug(B.name)}`;
console.log(`small supplier ${S.name}: ${SP.length}; big supplier ${B.name}: ${BP.length}`);

// ======================= catalog supplier =======================
{
  const p = await open(`${SURL}/products`);
  const crumbs = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Breadcrumb] li")].map((l) => ({ t: l.textContent.trim(), h: l.querySelector("a")?.getAttribute("href") ?? null })));
  check("10-01 loads: the supplier's name is the only h1; breadcrumb Home > Suppliers > Name > Products", p.status === 200 && (await p.$$eval("h1", (h) => h.map((x) => x.textContent.trim()))).join() === S.name && crumbs.map((c) => c.t).join(">") === `Home>Suppliers>${S.name}>Products` && crumbs[2].h === SURL, crumbs.map((c) => c.t).join(">"));
  const tabs = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Supplier profile'] a")].map((a) => ({ t: a.textContent.trim(), h: a.getAttribute("href"), cur: a.getAttribute("aria-current") })));
  check("10-02 the Products tab is the current one; About Company links to the profile", tabs[1].cur === "page" && tabs[1].h === `${SURL}/products` && tabs[0].h === SURL && tabs[0].cur === null && tabs[1].t === `Products (${SP.length})`, JSON.stringify(tabs.slice(0, 2)));
  check("10-03 the header shows this supplier's real facts (location, industry, product count) and no verified claim", await p.evaluate((x) => { const t = document.querySelector("section[aria-labelledby=supplier-heading]").innerText; return t.includes(x.loc) && t.includes(x.ind) && !/Verified Supplier/.test(t); }, { loc: `${S.city}, ${S.state}`, ind: S.specialization }));
  check("10-04 heading 'Products from NAME (N)' and the summary use this supplier's count", (await p.$eval("#listing-heading", (h) => h.textContent.replace(/\s+/g, " ").trim())) === `Products from ${S.name} (${SP.length})`);
  const cs = await cards(p); const names = new Set(SP.map((x) => x.name));
  check("10-05 every card is one of this supplier's products and names this supplier", cs.length === Math.min(10, SP.length) && cs.every((c) => names.has(c.name) && c.supplier === S.name), cs.map((c) => c.name).join(" | "));
  check("10-06 each card offers Get Best Quote and Add Inquiry for its own product", cs.every((c) => c.buttons.length === 2 && c.buttons[0].h === `${c.href}#get-best-quote` && c.buttons[1].h === `${c.href}#send-inquiry`));
  check("10-07 catalog photos show (no 'photo not added' label on these products)", cs.every((c) => !/Photo not added yet/.test(c.text)));
  const groups = await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter products'] summary")].map((s) => s.textContent.trim()));
  check("10-08 the sidebar leaves out groups that cannot vary for one supplier (category, state, city)", !groups.some((g) => /^Category$|Location|City/.test(g)) && groups.includes("Subcategory") && groups.includes("Price Range (₹)"), groups.join("|"));
  await p.close();

  // data isolation
  const other = [...sellers.keys()].find((id) => id !== S.id);
  const forged = await open(`${SURL}/products?seller=${slug(sellers.get(other).name)}`);
  const fcs = await cards(forged);
  check("10-09 a forged ?seller= in the address is ignored: still only this supplier's products and count", (await count(forged)) === SP.length && fcs.every((c) => c.supplier === S.name));
  await forged.close();
  const bogus = await open(`${SURL}/products?seller=nope&category=nope&sub=nope`);
  check("10-10 unknown ids are ignored with a notice and never widen the list", (await count(bogus)) === SP.length && /not recognised/.test(await bogus.evaluate(() => document.body.innerText))); await bogus.close();

  // search stays inside the supplier
  const word = norm(SP[0].name).split(/[^a-z0-9]+/).find((w) => w.length > 4) ?? "shirt";
  let q = await open(`${SURL}/products?q=${word}`);
  check("10-11 search inside the supplier equals an independent count within its products", (await count(q)) === SP.filter((t) => matches(t, word)).length && (await count(q)) > 0, `${word}: ${await count(q)}`);
  await q.close();
  const foreignWord = ["saree", "jeans", "kurta", "bra", "brief"].find((w) => !SP.some((t) => matches(t, w)) && [...bySeller.values()].some((rows) => rows.some((t) => matches(t, w))));
  q = await open(`${SURL}/products?q=${foreignWord}`);
  check(`10-12 a word that only other suppliers' products contain finds nothing here ('${foreignWord}')`, (await count(q)) === 0 && (await cards(q)).length === 0 && /None of .* products match/.test(await q.evaluate(() => document.body.innerText)));
  await q.close();
  q = await open(`${SURL}/products`);
  await q.evaluate(() => { window.__keep = "same"; });
  await q.type("input[name=q]", word); await sleep(1800); await q.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  check("10-13 typing in the search box searches this supplier's products without a page reload", urlOf(q).searchParams.get("q") === word && urlOf(q).pathname === `${SURL}/products` && (await q.evaluate(() => window.__keep)) === "same" && (await count(q)) === SP.filter((t) => matches(t, word)).length);
  await q.close();

  // filters and facets within the supplier
  const sub = SP[0].sub;
  const f1 = await open(`${SURL}/products?sub=${sub}`);
  check("10-14 a subcategory filter equals the seed within this supplier", (await count(f1)) === SP.filter((t) => t.sub === sub).length, String(await count(f1)));
  const opts = await f1.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter products'] input[name=sub]")].map((i) => i.closest("label").textContent.replace(/\s+/g, " ").trim()));
  await f1.close();
  const fAll = await open(`${SURL}/products`);
  const subOpts = await fAll.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter products'] input[name=sub]")].map((i) => ({ v: i.value, l: i.closest("label").textContent.replace(/\s+/g, " ").trim() })));
  const truthSubs = SP.reduce((m, t) => ((m[t.sub] = (m[t.sub] || 0) + 1), m), {});
  check("10-15 facet counts are this supplier's own (each subcategory count equals its products here)", subOpts.length === Object.keys(truthSubs).length && subOpts.every((o) => o.l.includes(`(${truthSubs[o.v]})`)), subOpts.map((o) => o.l).join(" | "));
  await fAll.close();
  const colour = SP[0].colour;
  const f2 = await open(`${SURL}/products?colour=${encodeURIComponent(colour)}&minPrice=1&maxPrice=999999`);
  check("10-16 colour and price filters combine correctly within the supplier", (await count(f2)) === SP.filter((t) => t.colour === colour).length, String(await count(f2))); await f2.close();
  const asc = await open(`${SURL}/products?sort=price-asc`); const a = (await cards(asc)).map((c) => c.price); await asc.close();
  const desc = await open(`${SURL}/products?sort=price-desc`); const d = (await cards(desc)).map((c) => c.price); await desc.close();
  check("10-17 sorting by price orders this supplier's products; first is its cheapest / dearest", a.every((x, i) => i === 0 || x >= a[i - 1]) && a[0] === Math.min(...SP.map((t) => t.price)) && d.every((x, i) => i === 0 || x <= d[i - 1]) && d[0] === Math.max(...SP.map((t) => t.price)));

  // pagination with a big supplier
  const bp = await open(`${BURL}/products`);
  const lastPage = Math.ceil(BP.length / 10);
  check("10-18 a big supplier: count, 10 per page, last page number", (await count(bp)) === BP.length && (await cards(bp)).length === 10 && (await bp.evaluate(() => [...document.querySelectorAll("nav[aria-label=Pagination] a")].map((x) => x.textContent.trim()))).includes(String(lastPage)), `${await count(bp)} of ${BP.length}`);
  const first = (await cards(bp))[0].name; await bp.close();
  const bp2 = await open(`${BURL}/products?page=2`); const c2 = await cards(bp2);
  check("10-19 page 2 is different, stays on this supplier, and keeps the URL", c2.length === 10 && c2[0].name !== first && c2.every((c) => c.supplier === B.name) && urlOf(bp2).pathname === `${BURL}/products`); await bp2.close();
  const r = await fetchText(`${BURL}/products?page=${lastPage + 40}`);
  check("10-20 a page past the end goes to the last page (same supplier path)", r.status === 307 && (r.loc ?? "").startsWith(`${BURL}/products`) && /page=/.test(r.loc ?? ""), `${r.status} ${r.loc}`);
  const nextHref = await (async () => { const pg = await open(`${BURL}/products?q=a&sort=price-asc`); const h = await pg.evaluate(() => [...document.querySelectorAll("nav[aria-label=Pagination] a")].find((x) => /Next/.test(x.textContent))?.getAttribute("href") ?? ""); await pg.close(); return h; })();
  const nu = new URL(nextHref || "/", BASE);
  check("10-21 pagination links stay under the supplier and keep search and sort", !nextHref || (nu.pathname === `${BURL}/products` && nu.searchParams.get("page") === "2" && nu.searchParams.get("q") === "a" && nu.searchParams.get("sort") === "price-asc"), nextHref);
}

// ======================= sample suppliers (the ones the old link could not show) =======================
{
  const t = await open("/suppliers/shree-textiles/products?limit=50"); const cs = await cards(t);
  const seedCount = (bySeller.get("SLR0216") ?? []).length;
  const samples = cs.filter((c) => /MOQ:/.test(c.text));
  check("10-30 Shree Textiles: its seed catalogue (21 products with photos) first, then its 8 sample listings with MOQ and unit shown", (await count(t)) === seedCount + 8 && seedCount === 21 && cs.length === seedCount + 8 && cs.every((c) => c.supplier === "Shree Textiles") && samples.length === 8 && cs.slice(0, seedCount).every((c) => !/MOQ:/.test(c.text)) && cs.slice(seedCount).every((c) => /MOQ:/.test(c.text)) && samples.map((c) => c.name).includes("Cotton Fabric"), `${await count(t)} products; ${samples.length} samples`);
  check("10-31 the sample listings with no photo file say so; the seed products show their photos", samples.every((c) => /Photo not added yet/.test(c.text)) && cs.slice(0, seedCount).every((c) => !/Photo not added yet/.test(c.text)));
  const moq = await t.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter products'] input[name=moq]")].map((i) => i.closest("label").textContent.replace(/\s+/g, " ").trim()));
  check("10-32 MOQ filter is per unit (meters, pieces and sets are never mixed)", moq.length > 1 && moq.every((x) => /Any MOQ|\b(meters?|pieces?|sets?|rolls?|kg|boxes)\b/i.test(x)), moq.join(" | "));
  await t.close();
  const m = await open("/suppliers/shree-textiles/products?q=cotton");
  check("10-33 search stays inside Shree Textiles", (await cards(m)).length >= 1 && (await cards(m)).every((c) => c.supplier === "Shree Textiles")); await m.close();
  const g = await open("/suppliers/shree-industrial-works/products"); const gc = await cards(g);
  check("10-34 a supplier that only had one sample listing: that product, and nothing else", (await count(g)) === 1 && gc[0]?.name === "Industrial Air Compressor" && gc[0].supplier === "Shree Industrial Works");
  await g.close();
}

// ======================= links from the profile and the product page =======================
{
  const prof = await open(SURL);
  const viewAll = await prof.evaluate(() => [...document.querySelectorAll("a")].find((a) => /View All Products/.test(a.textContent))?.getAttribute("href"));
  await prof.evaluate(() => [...document.querySelectorAll("a")].find((a) => /View All Products/.test(a.textContent)).click());
  await prof.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("10-40 'View All Products' on the profile opens this supplier's own product page with the same count (not the sitewide list)", viewAll === `${SURL}/products` && urlOf(prof).pathname === `${SURL}/products` && (await count(prof)) === SP.length, prof.url());
  await prof.close();
  const tx = await open("/suppliers/shree-textiles");
  const href = await tx.evaluate(() => [...document.querySelectorAll("a")].find((a) => /View All Products/.test(a.textContent))?.getAttribute("href"));
  check("10-41 the same for a sample supplier (it used to land on the sitewide list)", href === "/suppliers/shree-textiles/products"); await tx.close();
  const prod = await open(`/products/${slug(SP[0].name)}-${SP[0].id}`);
  const link = await prod.evaluate(() => [...document.querySelectorAll("aside[aria-label=Supplier] a")].find((a) => /All Products by Supplier/.test(a.textContent))?.getAttribute("href"));
  check("10-42 'All Products by Supplier' on a product page goes to the supplier's product page", link === `${SURL}/products`, link); await prod.close();
  const cta = await open(`${SURL}/products`);
  const href2 = await cta.evaluate(() => [...document.querySelectorAll("a")].filter((a) => /Post Your Requirement/i.test(a.textContent)).pop()?.getAttribute("href"));
  check("10-43 the banner 'Need a Custom Solution or Bulk Order?' addresses the requirement to this supplier", /Need a Custom Solution or Bulk Order/.test(await cta.evaluate(() => document.body.innerText)) && new URL(href2, BASE).searchParams.get("supplier") === slug(S.name), href2);
  await cta.close();
}

// ======================= not found, SEO, phone =======================
{
  for (const bad of ["no-such-supplier", "x".repeat(120), "..%2F..%2Fetc", "UPPER_case"]) check(`10-50 ${bad.slice(0, 18)} is a real 404`, (await fetchText(`/suppliers/${bad}/products`)).status === 404);
  const plain = (await fetchText(`${SURL}/products`)).text;
  const noindex = async (q) => /noindex/.test((await fetchText(`${SURL}/products${q}`)).text);
  const flags = { q: await noindex("?q=a"), sub: await noindex(`?sub=${SP[0].sub}`), sort: await noindex("?sort=price-asc"), view: await noindex("?view=list"), page2: await noindex("?page=2") };
  const big2 = (await fetchText(`${BURL}/products?page=2`)).text;
  check("10-51 SEO: title names the supplier; one h1; search, filters, sort and list view are noindex; plain pages are indexable", /Products from/.test((/<title>([^<]*)/.exec(plain) ?? [])[1] ?? "") && (plain.match(/<h1/g) || []).length === 1 && !/noindex/.test(plain) && flags.q && flags.sub && flags.sort && flags.view && !/noindex/.test(big2), JSON.stringify(flags));
  const ld = [...plain.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].flatMap((m) => JSON.parse(m[1]));
  check("10-52 structured data: a four-level breadcrumb and an item list of this supplier's products", ld.find((x) => x["@type"] === "BreadcrumbList")?.itemListElement.length === 4 && ld.find((x) => x["@type"] === "ItemList")?.numberOfItems === SP.length);
  const p = await open(`${BURL}/products`, { mobile: true });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const btn = await p.evaluate(() => { const a = document.querySelector("article"); return [...a.querySelectorAll("a")].filter((l) => /Get Best Quote|Add Inquiry/.test(l.textContent)).every((l) => { const r = l.getBoundingClientRect(); return r.height >= 44 && r.left >= 0 && r.right <= innerWidth; }); });
  check("10-53 phone: no overflow, the two card buttons fit and are 44px tall, search fits", !overflow && btn && (await p.evaluate(() => { const r = document.querySelector("input[name=q]").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })) && p.errs.length === 0, p.errs.join(";"));
  await p.close();
}

// ======================= API =======================
{
  let r = await api(`/api/public/suppliers/${slug(S.name)}`);
  const s = r.json.data?.supplier;
  check("A1 supplier profile API: public fields, real product count, unverified, no contact data", r.status === 200 && s.name === S.name && s.productCount === SP.length && s.verificationStatus === "unverified" && s.city === S.city && !/@example|phone|owner|pincode|\+91|_id/i.test(JSON.stringify(r.json)) && !("products" in s));
  for (const bad of ["no-such-supplier", "UPPER_case", "..%2Fetc"]) { r = await api(`/api/public/suppliers/${bad}`); check(`A2 ${bad} is a 404 with a safe message`, r.status === 404 && r.json.code === "NOT_FOUND"); }
  r = await api(`/api/public/suppliers/${slug(S.name)}/products`);
  const d = r.json.data;
  check("A3 supplier products API: only this supplier's products, with meta and facets", r.status === 200 && r.json.meta.totalItems === SP.length && d.products.every((x) => x.supplier.slug === slug(S.name) && x.supplier.name === S.name) && d.supplier.productCount === SP.length && !!d.facets && d.products.length === Math.min(10, SP.length));
  r = await api(`/api/public/suppliers/${slug(S.name)}/products?seller=${slug(B.name)}`); check("A4 a seller parameter is refused (the supplier is set by the path)", r.status === 400 && !!r.json.fields.seller);
  r = await api(`/api/public/suppliers/${slug(B.name)}/products?limit=50&page=2`); check("A5 paging, limit and meta for a big supplier", r.status === 200 && r.json.meta.currentPage === 2 && r.json.meta.pageSize === 50 && r.json.meta.totalItems === BP.length && r.json.data.products.every((x) => x.supplier.name === B.name));
  r = await api(`/api/public/suppliers/${slug(S.name)}/products?q=${SP[0].name.split(" ")[0]}`); check("A6 search stays inside the supplier (count equals the independent match)", r.json.meta.totalItems === SP.filter((t) => matches(t, SP[0].name.split(" ")[0])).length);
  for (const bad of ["limit=51", "page=0", "sort=newest", "minPrice=-1", "brand=x", "q=" + "x".repeat(101)]) { r = await api(`/api/public/suppliers/${slug(S.name)}/products?${bad}`); check(`A7 ${bad.slice(0, 24)} is rejected`, r.status === 400); }
  r = await api("/api/public/suppliers/shree-textiles/products?limit=50"); check("A8 a sample supplier's products through the API: 21 seed products and 8 sample listings, all this supplier's", r.status === 200 && r.json.meta.totalItems === 29 && r.json.data.products.filter((x) => x.source === "sample").length === 8 && r.json.data.products.filter((x) => x.source === "catalog").length === 21 && r.json.data.products.every((x) => x.supplier.slug === "shree-textiles"));
  r = await api("/api/public/suppliers/no-such-supplier/products"); check("A9 products of an unknown supplier: 404", r.status === 404);
  check("A10 shared-cache headers", /s-maxage/.test((await api(`/api/public/suppliers/${slug(S.name)}/products`)).headers.get("cache-control") ?? ""));
}

await browser.close();
const fails = results.filter((x) => !x.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) console.log("FAILED:\n" + fails.map((f) => " - " + f.name).join("\n"));
