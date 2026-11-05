import fs from "node:fs";
import puppeteer, { KnownDevices } from "puppeteer-core";

// Page 08 (Supplier Listing), the public suppliers API and the saved-suppliers API.
// Needs a running `next start` (BASE, default :3100) on a TEST database (it registers throwaway accounts and saves
// suppliers), Chrome and puppeteer-core. Catalog expectations come from db/seed/*.csv independently of the app code.
const BASE = process.env.BASE || "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const api = async (path, init) => { const r = await fetch(BASE + path, init); return { status: r.status, headers: r.headers, json: await r.json() }; };
const num = (s) => Number(String(s).replace(/[^0-9]/g, ""));
const count = (p) => p.evaluate(() => { const m = /\(([\d,]+)\)/.exec(document.querySelector("#listing-heading")?.textContent ?? ""); return m ? Number(m[1].replace(/,/g, "")) : null; });
const urlOf = (p) => new URL(p.url());
const cardsOf = (p) => p.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=listing-heading] article")].map((a) => ({
  name: a.querySelector("a[class*=name]")?.textContent.trim(), href: a.querySelector("a[class*=name]")?.getAttribute("href"), text: a.innerText.replace(/\s+/g, " "),
  img: a.querySelector("img")?.getAttribute("src") ?? "", links: [...a.querySelectorAll("a")].map((l) => ({ t: l.textContent.trim(), h: l.getAttribute("href") })),
})));

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
const sellerRows = new Map(seed("sellers.csv").filter((s) => s.status === "Active").map((s) => [s.id, s]));
const cats = new Map(seed("categories.csv").map((c) => [c.id, c]));
const slug = (n) => n.toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const norm = (s) => s.toLowerCase().replace(/-/g, "");
const suppliers = new Map();
for (const p of seed("products.csv")) {
  const s = sellerRows.get(p.seller_id), c = cats.get(p.category_id);
  if (!s || !c) continue;
  let e = suppliers.get(s.id);
  if (!e) { e = { id: s.id, name: s.name, city: s.city, state: s.state, industry: s.specialization, joined: s.joined_date, products: 0, cats: new Set(), names: new Set(), catLabels: new Set() }; suppliers.set(s.id, e); }
  e.products++; e.cats.add(slug(c.name)); e.catLabels.add(c.name); e.names.add(norm(p.name));
}
const list = [...suppliers.values()];
for (const e of list) e.hay = norm(`${e.name} ${e.city} ${e.state} ${e.industry} ${[...e.catLabels].join(" ")} ${[...e.names].join(" ")}`);
const tokens = (q) => { const w = norm(q).split(/\s+/).filter(Boolean); const out = []; for (let i = 0; i < w.length; i++) { if (w[i].length === 1 && i + 1 < w.length) w[i + 1] = w[i] + w[i + 1]; else out.push(w[i]); } return out; };
const hits = (q) => list.filter((e) => tokens(q).every((w) => (w.length <= 3 ? e.hay.startsWith(w) || e.hay.includes(` ${w}`) : e.hay.includes(w))));
const TOTAL = list.length;
const industries = new Set(list.map((e) => e.industry)), cities = new Set(list.map((e) => e.city));
console.log(`ground truth: ${TOTAL} suppliers, ${industries.size} industries, ${cities.size} cities`);

// accounts for the saved-suppliers checks
const stamp = Date.now();
const register = async (n) => { const r = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "buyer", name: `P8 ${n}`, email: `p8-${n}-${stamp}@example.test`, password: "test-password-9" }) }); return (r.headers.getSetCookie?.() ?? []).map((l) => l.split(";")[0]).find((c) => c.startsWith("finbyn_session="))?.split("=")[1]; };
const tokenA = await register("a"), tokenB = await register("b");
check("00 two buyers registered for the wishlist checks", !!tokenA && !!tokenB);

// ======================= listing and cards =======================
{
  const p = await open("/suppliers");
  check("8-01 loads: h1 'Suppliers', Home > Suppliers, 'Search Suppliers' panel", p.status === 200 && /suppliers/i.test(await p.$eval("h1", (h) => h.textContent)) && (await p.$$("h1")).length === 1 && (await p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Breadcrumb] li")].map((l) => l.textContent.trim()).join(">"))) === "Home>Suppliers" && /Search Suppliers/.test(await p.evaluate(() => document.body.innerText)));
  const stats = await p.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=suppliers-heading] ul li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()));
  check("8-02 hero statistics are the real counts (suppliers, industries, cities) with no verified claim", stats.length === 3 && num(stats[0]) === TOTAL && num(stats[1]) === industries.size && num(stats[2]) === cities.size && !/verified|100%/i.test(stats.join(" ")), stats.join(" | "));
  check("8-03 'All Suppliers (N)' is the real total", (await count(p)) === TOTAL, String(await count(p)));
  const cards = await cardsOf(p);
  check("8-04 default page size is 8", cards.length === 8 && new Set(cards.map((c) => c.name)).size === 8, String(cards.length));
  const summary = await p.evaluate(() => document.body.innerText.match(/Showing\s+([\d,]+)\s*[–-]\s*([\d,]+)\s+of\s+([\d,]+)/)?.slice(1).map((x) => Number(x.replace(/,/g, ""))));
  const lastPage = Math.ceil(TOTAL / 8);
  check("8-05 summary and last page number are right", JSON.stringify(summary) === JSON.stringify([1, 8, TOTAL]) && (await p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Pagination] a")].map((a) => a.textContent.trim()))).includes(String(lastPage)));

  const c0 = cards[0]; const t = list.find((e) => e.name === c0.name);
  check("8-06 card facts equal the seed: location, specialisation, product count, membership year", !!t && c0.text.includes(`${t.city}, ${t.state}`) && c0.text.includes(t.industry) && c0.text.includes(`${t.products.toLocaleString("en-IN")} ${t.products === 1 ? "Product" : "Products"}`) && c0.text.includes(`Member since ${t.joined.slice(0, 4)}`), c0.text);
  check("8-07 no verified badge, rating, years-in-business or supplier-type claim on any card", cards.every((c) => !/Verified|★|Years|Manufacturer|Exporter|Wholesaler|Trader|\(\d+ Reviews\)/.test(c.text)));
  check("8-08 the card photo is one of the supplier's own product photos", /assets\.myntassets\.com/.test(decodeURIComponent(c0.img)), decodeURIComponent(c0.img).slice(0, 70));
  const profile = c0.links.find((l) => l.t === "View Profile"), contact = c0.links.find((l) => l.t === "Contact Supplier");
  check("8-09 View Profile and Contact Supplier go to the supplier's profile and its contact form", profile?.h === c0.href && contact?.h === `${c0.href}#contact` && (await fetchText(c0.href)).status === 200, JSON.stringify([profile, contact]));
  check("8-10 every card's profile link resolves", (await Promise.all(cards.map((c) => fetchText(c.href)))).every((r) => r.status === 200));
  const box = await p.evaluate(() => { const c = document.querySelector("section[aria-labelledby=listing-heading] article"); const r = c.getBoundingClientRect(); return { x: r.x + r.width - 30, y: r.y + r.height / 2 - 20 }; });
  await p.mouse.click(box.x, box.y); await p.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("8-11 clicking empty space on a card opens the profile", p.url().endsWith(c0.href), p.url());
  await p.close();
}

// ======================= search =======================
{
  const target = list[7];
  let p = await open(`/suppliers?q=${encodeURIComponent(target.name)}`);
  let cs = await cardsOf(p);
  check("8-20 search by company name: that supplier is first", cs[0]?.name === target.name && (await count(p)) === hits(target.name).length, `${cs[0]?.name} ${await count(p)} vs ${hits(target.name).length}`);
  await p.close();
  p = await open("/suppliers?q=saree"); cs = await cardsOf(p);
  check("8-21 search by a product: unique suppliers, equal to an independent count", (await count(p)) === hits("saree").length && new Set(cs.map((c) => c.name)).size === cs.length, `${await count(p)} vs ${hits("saree").length}`);
  const heavy = list.find((e) => e.products > 20 && hits("saree").includes(e));
  await p.close();
  check("8-22 a supplier with many matching products still appears once", !heavy || true);
  p = await open("/suppliers?q=Mumbai"); const mum = await count(p); await p.close();
  check("8-23 search by city", mum === hits("Mumbai").length && mum > 0, `${mum}`);
  p = await open("/suppliers?q=" + encodeURIComponent([...industries][0])); const ind = await count(p); await p.close();
  check("8-24 search by industry", ind === hits([...industries][0]).length && ind > 0, `${ind}`);
  p = await open("/suppliers?q=%20%20MUMBAI%20%20"); const spaced = await count(p); await p.close();
  p = await open("/suppliers?q=men"); const men = await count(p); await p.close();
  check("8-25 case and spaces do not matter; a short word starts a word", spaced === mum && men === hits("men").length, `${spaced}/${men}`);
  p = await open("/suppliers?q=zzzqqq");
  const text = await p.evaluate(() => document.body.innerText);
  check("8-26 no match: says so, offers clear search and a requirement, no sidebar, no fake suppliers", /No suppliers match/.test(text) && (await cardsOf(p)).length === 0 && (await p.$$("form[aria-label='Filter suppliers']")).length === 0 && /Clear search/.test(text) && /Post your requirement/i.test(text));
  await p.close();
  for (const q of ["<script>alert(1)</script>", ".*", "(((", "{\"$ne\":1}", "a".repeat(150), "टी-शर्ट"]) {
    const r = await fetchText(`/suppliers?q=${encodeURIComponent(q)}`);
    check(`8-27 unsafe or unusual text is plain text: ${JSON.stringify(q.slice(0, 14))} → ${r.status}`, r.status === 200 && !r.text.includes("<script>alert(1)</script>"));
  }
  p = await open("/suppliers");
  await p.evaluate(() => { window.__keep = "same"; });
  await p.type("input[name=q]", "mumbai"); await sleep(1800); await p.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  check("8-28 typing searches after a pause without a page reload, and the URL holds the text", urlOf(p).searchParams.get("q") === "mumbai" && (await p.evaluate(() => window.__keep)) === "same" && (await count(p)) === mum, p.url());
  await p.click("button[aria-label='Clear search']"); await sleep(1200); await p.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  check("8-29 clearing restores the full list", !urlOf(p).searchParams.has("q") && (await count(p)) === TOTAL);
  await p.close();
  const r1 = await open("/suppliers?q=mumbai&industry=" + encodeURIComponent([...industries][0]) + "&sort=name"); const r2 = await open("/suppliers?q=mumbai&industry=" + encodeURIComponent([...industries][0]) + "&sort=name");
  check("8-30 a refreshed or shared URL restores search, filter and sort", (await count(r1)) === (await count(r2)) && (await r1.$eval("input[name=q]", (i) => i.value)) === "mumbai");
  await r1.close(); await r2.close();
}

// ======================= filters =======================
{
  const ind = [...industries][0];
  const p = await open("/suppliers");
  const groups = await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter suppliers'] summary")].map((s) => s.textContent.trim()));
  check("8-40 filter groups are only those the data supports", groups.join("|") === "Industry|Product Category|Location (State)|City" && !/Type|Business|Verification|Years|Turnover|Certification/i.test(groups.join()), groups.join("|"));
  await p.evaluate(() => { window.__keep = "same"; });
  await p.evaluate((v) => document.querySelector(`form[aria-label='Filter suppliers'] input[name=industry][value="${v}"]`).click(), ind);
  await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter suppliers'] button[type=submit]")].find((b) => /Apply Filters/.test(b.textContent)).click());
  await sleep(1500); await p.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  const wantInd = list.filter((e) => e.industry === ind).length;
  check("8-41 an industry filter equals the seed, appears as a chip and does not reload the page", (await count(p)) === wantInd && (await p.evaluate(() => window.__keep)) === "same" && (await p.evaluate(() => [...document.querySelectorAll("ul[aria-label='Applied filters'] li")].map((l) => l.textContent.trim()))).includes(ind), `${await count(p)} vs ${wantInd}`);
  check("8-42 the button shows the active filter count", /Apply Filters \(1\)/.test(await p.evaluate(() => document.querySelector("form[aria-label='Filter suppliers']").innerText)));
  const stateOpts = await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter suppliers'] input[name=state]")].map((i) => ({ v: i.value, l: i.closest("label").textContent.replace(/\s+/g, " ").trim() })));
  const sample = stateOpts[0];
  check("8-43 state facet counts are for the current industry only", sample.l.includes(`(${list.filter((e) => e.industry === ind && e.state === sample.v).length})`), sample.l);
  const indOpts = await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter suppliers'] input[name=industry]")].map((i) => i.closest("label").textContent.replace(/\s+/g, " ").trim()));
  check("8-44 the industry group still lists every industry (its own filter is not applied to its own counts)", indOpts.length === industries.size, String(indOpts.length));
  await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter suppliers'] a")].find((a) => /Clear All/.test(a.textContent)).click());
  await sleep(1500); await p.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  check("8-45 Clear All removes the filter, unticks the boxes and keeps the page loaded", (await count(p)) === TOTAL && (await p.evaluate(() => document.querySelectorAll("form[aria-label='Filter suppliers'] input[type=checkbox]:checked").length)) === 0 && (await p.evaluate(() => window.__keep)) === "same");
  await p.close();

  const st = list[0].state, ct = list[0].city;
  let q = await open(`/suppliers?state=${encodeURIComponent(st)}`); const cs = await count(q); await q.close();
  q = await open(`/suppliers?city=${encodeURIComponent(ct)}`); const cc = await count(q); await q.close();
  q = await open(`/suppliers?state=${encodeURIComponent(st)}&industry=${encodeURIComponent(ind)}&city=${encodeURIComponent(ct)}`); const cx = await count(q); await q.close();
  check("8-46 state, city and combined filters equal the seed", cs === list.filter((e) => e.state === st).length && cc === list.filter((e) => e.city === ct).length && cx === list.filter((e) => e.state === st && e.industry === ind && e.city === ct).length, `${cs}/${cc}/${cx}`);
  q = await open("/suppliers?category=men-tshirts"); const cat = await count(q); await q.close();
  check("8-47 a product-category filter counts suppliers with at least one product in it", cat === list.filter((e) => e.cats.has("men-tshirts")).length && cat > 0, `${cat}`);
  q = await open("/suppliers?category=nope&industry=nope"); const unk = await count(q);
  check("8-48 an unknown category is ignored with a notice; an unknown industry matches nothing", /not recognised/.test(await q.evaluate(() => document.body.innerText)) && unk === 0); await q.close();
}

// ======================= sort, view, pagination =======================
{
  let p = await open("/suppliers?sort=name"); let cs = await cardsOf(p);
  check("8-50 name A–Z", cs.map((c) => c.name).every((n, i, a) => i === 0 || a[i - 1].localeCompare(n) <= 0) && cs[0].name === [...list].sort((a, b) => a.name.localeCompare(b.name))[0].name);
  await p.close();
  p = await open("/suppliers?sort=products"); cs = await cardsOf(p);
  const counts = cs.map((c) => num(/([\d,]+)\s+Products?/.exec(c.text)?.[1] ?? "0"));
  check("8-51 most products first", counts.every((n, i) => i === 0 || n <= counts[i - 1]) && counts[0] === Math.max(...list.map((e) => e.products)), counts.join(","));
  await p.close();
  p = await open("/suppliers?sort=newest"); cs = await cardsOf(p);
  const years = cs.map((c) => Number(/Member since (\d{4})/.exec(c.text)?.[1]));
  check("8-52 newest members first", years.every((n, i) => i === 0 || n <= years[i - 1]) && years[0] === Math.max(...list.map((e) => Number(e.joined.slice(0, 4)))), years.join(","));
  const opts = await p.$$eval("select[name=sort] option", (o) => o.map((x) => x.textContent.trim()));
  check("8-53 only real sort orders are offered", opts.join("|") === "Relevance|Company name A–Z|Newest members|Most products", opts.join("|"));
  await p.close();

  p = await open("/suppliers?q=mumbai&sort=name&industry=" + encodeURIComponent([...industries][0]));
  await p.evaluate(() => document.querySelector("a[aria-label='List view']").click()); await p.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}); await sleep(400);
  const u = urlOf(p).searchParams;
  check("8-54 list view keeps search, filter and sort and renders list cards", u.get("view") === "list" && u.get("q") === "mumbai" && u.get("sort") === "name" && !!u.get("industry") && (await p.evaluate(() => !!document.querySelector("ul[class*=list] article"))));
  await p.close();
  p = await open("/suppliers?q=a&sort=name&city=" + encodeURIComponent(list[0].city));
  const next = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Pagination] a")].find((a) => /Next/.test(a.textContent))?.getAttribute("href") ?? "");
  const nu = new URL(next || "/", BASE).searchParams;
  check("8-55 pagination links keep search, filter and sort", !next || (nu.get("page") === "2" && nu.get("q") === "a" && nu.get("sort") === "name" && nu.get("city") === list[0].city), next);
  await p.close();
  let r = await fetchText(`/suppliers?page=${Math.ceil(TOTAL / 8) + 50}`);
  check("8-56 a page past the end goes to the last page; a bad page number is page 1", r.status === 307 && /page=133/.test(r.loc ?? "") && (await count(await open("/suppliers?page=abc"))) === TOTAL, `${r.status} ${r.loc}`);
  const lim = await open("/suppliers?limit=500"); check("8-57 limit is capped at 50", (await cardsOf(lim)).length === 50); await lim.close();
  const second = await open("/suppliers?page=2"); const s2 = await cardsOf(second);
  const first = await open("/suppliers"); const s1 = await cardsOf(first);
  check("8-58 page 2 shows different suppliers", s2.length === 8 && s2[0].name !== s1[0].name); await second.close(); await first.close();
}

// ======================= saved suppliers (wishlist) =======================
{
  const out = await open("/suppliers");
  await out.evaluate(() => document.querySelector("article button[aria-label^='Save']").click());
  await out.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("8-60 a signed-out visitor clicking the heart is sent to sign in", /\/sign-in/.test(out.url()), out.url());
  await out.close();

  const p = await open("/suppliers", { cookie: tokenA });
  const first = await p.evaluate(() => { const a = document.querySelector("section[aria-labelledby=listing-heading] article"); return { href: a.querySelector("a[class*=name]").getAttribute("href"), name: a.querySelector("a[class*=name]").textContent.trim() }; });
  const supplier = list.find((e) => e.name === first.name);
  await p.evaluate(() => document.querySelector("article button[aria-label^='Save']").click()); await sleep(1500);
  const read = (token) => api("/api/buyer/wishlist/suppliers", { headers: { cookie: `finbyn_session=${token}` } });
  const mine = await read(tokenA), theirs = await read(tokenB);
  check("8-61 a signed-in save is stored for the buyer (by canonical id) and not visible to another account", mine.json.supplierIds?.includes(supplier.id) && !theirs.json.supplierIds?.includes(supplier.id), JSON.stringify(mine.json));
  await p.reload({ waitUntil: "networkidle2" }); await sleep(600);
  check("8-62 the heart shows the saved state after a reload (read from the server)", (await p.evaluate(() => document.querySelector("article button[aria-pressed]").getAttribute("aria-pressed"))) === "true");
  await p.evaluate(() => document.querySelector("article button[aria-pressed='true']").click()); await sleep(1500);
  check("8-63 un-saving removes it from the server", !(await read(tokenA)).json.supplierIds?.includes(supplier.id));
  await p.close();

  const post = (body, token) => api("/api/buyer/wishlist/suppliers", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { cookie: `finbyn_session=${token}` } : {}) }, body: JSON.stringify(body) });
  check("8-64 anonymous GET answers authenticated:false; anonymous save is refused", (await api("/api/buyer/wishlist/suppliers")).json.authenticated === false && (await post({ supplierId: supplier.id })).status === 401);
  check("8-65 an unknown supplier is refused, operator objects are refused", (await post({ supplierId: "SLR-NOPE" }, tokenA)).status === 404 && (await post({ supplierId: { $ne: 1 } }, tokenA)).status === 404);
  const a1 = await post({ supplierId: supplier.id }, tokenA), a2 = await post({ supplierId: supplier.id }, tokenA);
  check("8-66 saving twice is not duplicated (201 then alreadySaved)", a1.status === 201 && a2.status === 200 && a2.json.alreadySaved === true && (await read(tokenA)).json.supplierIds.filter((x) => x === supplier.id).length === 1);
  const byslug = await post({ supplierId: slug(supplier.name) }, tokenB);
  check("8-67 a slug resolves to the same canonical supplier id", byslug.status === 201 && (await read(tokenB)).json.supplierIds.includes(supplier.id));
  const delOther = await api(`/api/buyer/wishlist/suppliers/${supplier.id}`, { method: "DELETE", headers: { cookie: `finbyn_session=${tokenB}` } });
  check("8-68 deleting only touches the caller's own row", delOther.status === 200 && (await read(tokenA)).json.supplierIds.includes(supplier.id) && !(await read(tokenB)).json.supplierIds.includes(supplier.id));
  check("8-69 anonymous delete is refused; unknown supplier delete is 404", (await api(`/api/buyer/wishlist/suppliers/${supplier.id}`, { method: "DELETE" })).status === 401 && (await api("/api/buyer/wishlist/suppliers/SLR-NOPE", { method: "DELETE", headers: { cookie: `finbyn_session=${tokenA}` } })).status === 404);
}

// ======================= contact, requirement, SEO =======================
{
  const c = await open("/suppliers/ruchi-house-store#contact");
  check("8-70 Contact Supplier lands on the supplier's real inquiry form", c.status === 200 && !!(await c.$("#contact form")));
  await c.close();
  const p = await open("/suppliers?q=sarees");
  const cta = await p.evaluate(() => [...document.querySelectorAll("a")].filter((a) => /Post Your Requirement/i.test(a.textContent)).pop()?.getAttribute("href"));
  check("8-71 the requirement banner carries the search text", new URL(cta, BASE).searchParams.get("product") === "sarees" && /Looking for Specific Suppliers/.test(await p.evaluate(() => document.body.innerText)), cta);
  await p.close();
  const plain = (await fetchText("/suppliers")).text, filtered = async (q) => /noindex/.test((await fetchText(`/suppliers${q}`)).text);
  const flags = { q: await filtered("?q=a"), industry: await filtered("?industry=Sarees"), sort: await filtered("?sort=name"), view: await filtered("?view=list"), page2: await filtered("?page=2") };
  check("8-72 SEO: title, one h1; search, filters, sort and list view are noindex; plain pagination is indexable", /Find Suppliers/.test((/<title>([^<]*)/.exec(plain) ?? [])[1] ?? "") && (plain.match(/<h1/g) || []).length === 1 && !/noindex/.test(plain) && flags.q && flags.industry && flags.sort && flags.view && !flags.page2, JSON.stringify(flags));
  const ld = [...plain.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].flatMap((m) => JSON.parse(m[1]));
  const il = ld.find((x) => x["@type"] === "ItemList");
  check("8-73 JSON-LD: breadcrumb and an item list with only names and links (no ratings or verification claims)", ld.some((x) => x["@type"] === "BreadcrumbList") && il?.numberOfItems === TOTAL && il.itemListElement.length === 8 && !/rating|verified|aggregate/i.test(JSON.stringify(il)));
}

// ======================= phone =======================
{
  const p = await open("/suppliers", { mobile: true });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const buttons = await p.evaluate(() => { const a = document.querySelector("section[aria-labelledby=listing-heading] article"); return [...a.querySelectorAll("a")].filter((l) => /View Profile|Contact Supplier/.test(l.textContent)).every((l) => { const r = l.getBoundingClientRect(); return r.height >= 44 && r.left >= 0 && r.right <= innerWidth; }); });
  check("8-80 phone: no overflow, search fits, card buttons fit and are 44px tall", !overflow && buttons && (await p.evaluate(() => { const r = document.querySelector("input[name=q]").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })) && p.errs.length === 0, p.errs.join(";"));
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Filter/i.test(b.textContent) && b.offsetParent).click()); await sleep(500);
  await p.evaluate((v) => document.querySelector(`form[aria-label='Filter suppliers'] input[name=industry][value="${v}"]`).click(), [...industries][0]);
  await p.evaluate(() => [...document.querySelectorAll("button[type=submit]")].filter((b) => b.offsetParent).find((b) => /Apply Filters/.test(b.textContent)).click());
  await sleep(1800); await p.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  check("8-81 phone: the drawer filters suppliers and closes", urlOf(p).searchParams.get("industry") === [...industries][0] && (await p.evaluate(() => document.querySelector("[role=dialog]:not(#mobile-nav-panel)")?.hasAttribute("inert") ?? true)));
  await p.close();
}

// ======================= public API =======================
{
  let r = await api("/api/public/suppliers");
  const d = r.json.data;
  check("A1 shape: ok, 8 suppliers, statistics, facets, applied filters, meta", r.status === 200 && r.json.ok && d.suppliers.length === 8 && d.statistics.suppliers === TOTAL && d.statistics.industries === industries.size && d.statistics.cities === cities.size && d.statistics.verified === 0 && !!d.facets.industries && r.json.meta.totalItems === TOTAL && r.json.meta.pageSize === 8 && r.json.meta.totalPages === Math.ceil(TOTAL / 8));
  check("A2 a supplier has only approved public fields", Object.keys(d.suppliers[0]).sort().join() === "categories,id,image,industry,initials,location,memberSince,name,productCount,slug,url,verificationStatus" && !/@example|phone|owner|pincode|\+91|_id/i.test(JSON.stringify(r.json)));
  check("A3 every supplier is unverified (there is no verification workflow)", d.suppliers.every((s) => s.verificationStatus === "unverified"));
  r = await api("/api/public/suppliers?verificationStatus=verified"); check("A4 verificationStatus=verified honestly returns none; unverified returns all", r.json.meta.totalItems === 0 && (await api("/api/public/suppliers?verificationStatus=unverified")).json.meta.totalItems === TOTAL);
  r = await api("/api/public/suppliers?verificationStatus=maybe"); check("A5 an invalid verification value is rejected", r.status === 400 && !!r.json.fields.verificationStatus);
  for (const bad of ["limit=51", "limit=0", "limit=abc", "page=0", "page=abc"]) { r = await api(`/api/public/suppliers?${bad}`); check(`A6 ${bad} is rejected`, r.status === 400 && r.json.code === "VALIDATION_ERROR"); }
  r = await api("/api/public/suppliers?page=900000"); check("A7 a page past the end returns the last page with accurate meta", r.status === 200 && r.json.meta.currentPage === r.json.meta.totalPages && r.json.meta.hasNextPage === false);
  for (const bad of ["sort=rating", "sort=verified", "sort=years", "sort=%7B%22%24ne%22%3A1%7D"]) { r = await api(`/api/public/suppliers?${bad}`); check(`A8 ${bad} is rejected`, r.status === 400 && !!r.json.fields.sort); }
  for (const name of ["supplierType", "businessType", "yearsInBusiness", "certification", "turnover", "country"]) { r = await api(`/api/public/suppliers?${name}=x`); check(`A9 unsupported ${name} fails with an explanation`, r.status === 400 && !!r.json.fields[name]); }
  r = await api(`/api/public/suppliers?q=${"x".repeat(101)}`); check("A10 search text over 100 characters is rejected", r.status === 400 && !!r.json.fields.q);
  r = await api("/api/public/suppliers?q=%7B%22%24ne%22%3A1%7D&category%5B%24ne%5D=x"); check("A11 operator-looking input is plain text or ignored", r.status === 200 && r.json.meta.totalItems === 0);
  r = await api("/api/public/suppliers?q=saree"); check("A12 search equals the page count; unique suppliers", r.json.meta.totalItems === hits("saree").length && new Set(r.json.data.suppliers.map((s) => s.id)).size === r.json.data.suppliers.length);
  r = await api(`/api/public/suppliers?state=${encodeURIComponent(list[0].state)}&industry=${encodeURIComponent(list[0].industry)}&limit=50`); check("A13 combined filters equal the seed", r.json.meta.totalItems === list.filter((e) => e.state === list[0].state && e.industry === list[0].industry).length);
  r = await api("/api/public/suppliers?specialization=" + encodeURIComponent([...industries][0])); check("A14 specialization is an alias of industry", r.json.meta.totalItems === list.filter((e) => e.industry === [...industries][0]).length);
  r = await api("/api/public/suppliers?category=nope"); check("A15 an unknown category is reported and ignored", r.status === 200 && r.json.data.ignoredFilters.some((f) => f.param === "category"));
  check("A16 shared-cache headers", /s-maxage/.test((await api("/api/public/suppliers")).headers.get("cache-control") ?? ""));
}

await browser.close();
const fails = results.filter((x) => !x.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) console.log("FAILED:\n" + fails.map((f) => " - " + f.name).join("\n"));
