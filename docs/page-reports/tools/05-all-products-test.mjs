import puppeteer, { KnownDevices } from "puppeteer-core";
import fs from "node:fs";

// Page 05 (All Products) and GET /api/public/products. Needs a running `next start` (BASE, default :3100), Chrome and
// puppeteer-core. Catalog expectations are computed from db/seed/*.csv independently of the application code.
// The wishlist check registers one throwaway account through the real API, so run it against a test database.
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
const fetchText = async (path) => { const r = await fetch(BASE + path, { redirect: "manual" }); return { status: r.status, loc: r.headers.get("location"), text: await r.text(), headers: r.headers }; };
const api = async (qs = "") => { const r = await fetch(`${BASE}/api/public/products${qs ? "?" + qs : ""}`); return { status: r.status, headers: r.headers, json: await r.json(), raw: null }; };
const num = (s) => Number(String(s).replace(/[^0-9.]/g, ""));
const count = (p) => p.evaluate(() => { const t = document.querySelector("#listing-heading")?.textContent ?? ""; const m = /\(([\d,]+)\)/.exec(t); return m ? Number(m[1].replace(/,/g, "")) : null; });
const cards = (p) => p.evaluate(() => [...document.querySelectorAll("ul[class*=grid] article, ul[class*=list] article")].map((a) => ({
  name: a.querySelector("a[class*=name]")?.textContent.trim(), href: a.querySelector("a[class*=name]")?.getAttribute("href"),
  price: Number((/₹\s*([\d,]+)/.exec(a.querySelector("[class*=price]")?.textContent ?? "")?.[1] ?? "NaN").replace(/,/g, "")),
  moq: /MOQ:\s*([\d,]+)\s*([A-Za-z]+)/.exec(a.innerText), img: a.querySelector("img")?.getAttribute("src") ?? "", text: a.innerText,
})));
const urlOf = (p) => new URL(p.url());

// ---------- independent ground truth from the seed files
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
const seed = (f) => { const [h, ...r] = parseCsv(fs.readFileSync(`R:/indiamartref/db/seed/${f}`, "utf8")).filter((x) => x.length > 1); const rows = r.map((x) => Object.fromEntries(h.map((k, i) => [k, x[i]])));
  // Shree Textiles (SLR0216) is the seed catalogue of the sample supplier of that name and takes its location (ADOPTED_SELLERS).
  return f === "sellers.csv" ? rows.map((s) => (s.id === "SLR0216" ? { ...s, city: "Surat", state: "Gujarat" } : s)) : rows; };
const allSellers = seed("sellers.csv");
const sellers = new Map(allSellers.filter((s) => s.status === "Active").map((s) => [s.id, s]));
const cats = new Map(seed("categories.csv").map((c) => [c.id, c]));
const allProducts = seed("products.csv");
const slug = (n) => n.toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const norm = (s) => s.toLowerCase().replace(/-/g, "");
const truth = allProducts.filter((p) => sellers.has(p.seller_id) && cats.has(p.category_id)).map((p) => {
  const c = cats.get(p.category_id), s = sellers.get(p.seller_id);
  return { id: p.id, name: p.name, cat: c.name, sub: slug(c.name), dept: c.department, price: Number(p.estimated_price_inr), colour: p.colour, seller: s.id, sellerName: s.name, state: s.state, city: s.city,
    hay: norm(`${p.name} ${c.name} ${p.colour} ${c.department} Apparel & Fashion`) };
});
const tokens = (q) => { const w = norm(q).split(/\s+/).filter(Boolean); const out = []; for (let i = 0; i < w.length; i++) { if (w[i].length === 1 && i + 1 < w.length) w[i + 1] = w[i] + w[i + 1]; else out.push(w[i]); } return out; };
const matchesText = (t, q) => tokens(q).every((w) => (w.length <= 3 ? t.hay.startsWith(w) || t.hay.includes(` ${w}`) : t.hay.includes(w)));
console.log(`ground truth: ${truth.length} catalog products (of ${allProducts.length} rows), ${new Set(truth.map((t) => t.cat)).size} categories`);

const OTHER = ["packaging-printing", "industrial-machinery", "electrical-electronics", "construction-real-estate", "health-pharma"];
let sampleTotal = 0;
for (const c of OTHER) { const p = await open(`/categories/${c}`); sampleTotal += (await count(p)) ?? 0; await p.close(); }
const TOTAL = truth.length + sampleTotal;
console.log(`sample listings across other categories: ${sampleTotal}; expected total ${TOTAL}`);

// ======================= listing, hero, pagination =======================
{
  const p = await open("/products");
  check("5-01 heading count = catalog products + sample listings", (await count(p)) === TOTAL, `${await count(p)} vs ${TOTAL}`);
  const stats = await p.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=products-heading] ul li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()));
  check("5-02 hero shows computed Products, Suppliers, Categories and no verified or invented figures", stats.length === 3 && num(stats[0]) === TOTAL && /Suppliers/.test(stats[1]) && num(stats[1]) >= new Set(truth.map((t) => t.seller)).size && num(stats[2]) === 6 && !/verified|100%/i.test(stats.join(" ")), stats.join(" | "));
  check("5-03 h1 and breadcrumb", (await p.$eval("h1", (h) => h.textContent.replace(/\s+/g, " ").trim())) === "All Products" && (await p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Breadcrumb] li")].map((l) => l.textContent.trim()).join(">"))) === "Home>Products");
  const first = await cards(p);
  check("5-04 default page size is 10", first.length === 10, String(first.length));
  const summary = await p.evaluate(() => document.querySelector("main")?.innerText.match(/Showing\s+([\d,]+)\s*[–-]\s*([\d,]+)\s+of\s+([\d,]+)/)?.slice(1).map((x) => Number(x.replace(/,/g, ""))));
  check("5-05 summary reads Showing 1–10 of total", JSON.stringify(summary) === JSON.stringify([1, 10, TOTAL]), JSON.stringify(summary));
  const lastPage = Math.ceil(TOTAL / 10);
  const pageNums = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Pagination] a, nav[aria-label=Pagination] span")].map((e) => e.textContent.trim()));
  check("5-06 pagination shows Previous, numbers, the last page and Next", pageNums.some((t) => /Next/.test(t)) && pageNums.includes(String(lastPage)) && pageNums.some((t) => /Previous/.test(t)), pageNums.join(" "));
  await p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Pagination] a")].find((a) => /Next/.test(a.textContent))?.click());
  await p.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  const second = await cards(p);
  check("5-07 Next goes to page 2 with different products and ?page=2", urlOf(p).searchParams.get("page") === "2" && second.length === 10 && second[0].href !== first[0].href, p.url());
  await p.close();

  let r = await fetchText(`/products?page=${lastPage + 50}`);
  check("5-08 out-of-range page redirects to the last page", r.status === 307 && /page=/.test(r.loc ?? ""), `${r.status} ${r.loc}`);
  const bad = await open("/products?page=abc");
  check("5-09 a non-numeric page falls back to page 1", (await cards(bad)).length === 10 && bad.status === 200);
  await bad.close();
  const l25 = await open("/products?limit=25"); const l500 = await open("/products?limit=500");
  check("5-10 limit=25 shows 25 and limit=500 is capped at 50", (await cards(l25)).length === 25 && (await cards(l500)).length === 50);
  await l25.close(); await l500.close();
  const last = await open(`/products?page=${lastPage}`);
  check("5-11 the last page holds the remainder", (await cards(last)).length === TOTAL - (lastPage - 1) * 10, String((await cards(last)).length));
  await last.close();
}

// ======================= search =======================
{
  let p = await open("/products?q=tshirt");
  const want = truth.filter((t) => matchesText(t, "tshirt")).length;
  check("5-20 search 'tshirt' equals an independent text match", (await count(p)) === want, `${await count(p)} vs ${want}`);
  check("5-21 query is kept in the input and the URL after load", (await p.$eval("main input[name=q], input[type=search][name=q]", (i) => i.value)) === "tshirt");
  await p.close();

  p = await open("/products?q=t%20shirt"); const spaced = await count(p); await p.close();
  p = await open("/products?q=%20%20TSHIRT%20%20"); const upper = await count(p); await p.close();
  check("5-22 'a lone letter joins the next word', case and extra spaces do not matter", spaced === want && upper === want, `${spaced} / ${upper}`);

  p = await open("/products?q=men"); const men = await count(p); const menCards = await cards(p);
  const wantMen = truth.filter((t) => matchesText(t, "men")).length;
  const substringMen = truth.filter((t) => t.hay.includes("men")).length;
  check("5-23 a short word must start a word: 'men' does not match 'women'", men === wantMen && men < substringMen && menCards.every((c) => !/^women/i.test(c.name ?? "") || /\bmen/i.test(c.text)), `${men} (substring would be ${substringMen})`);
  await p.close();

  p = await open("/products?q=air%20compressor"); let c = await cards(p);
  check("5-24 sample B2B products are searchable and rank first", c[0]?.name === "Industrial Air Compressor", c.map((x) => x.name).join(" | "));
  await p.close();
  p = await open("/products?q=solar%20panel"); c = await cards(p);
  check("5-25 'solar panel' finds Solar Panel 540W", c[0]?.name === "Solar Panel 540W", c[0]?.name);
  await p.close();

  p = await open("/products?q=nike%20jersey"); c = await cards(p);
  check("5-26 every result contains every word and a name that starts with the phrase ranks first", c.length > 0 && c.every((x) => /nike/i.test(x.text) && /jersey/i.test(x.text)), c.slice(0, 3).map((x) => x.name).join(" | "));
  await p.close();

  p = await open("/products?q=zzzqqq");
  const emptyText = await p.evaluate(() => document.querySelector("main")?.innerText ?? "");
  check("5-27 no match: count 0, no cards, clear actions and no unrelated products", (await count(p)) === 0 && (await cards(p)).length === 0 && /Nothing matches/.test(emptyText) && (await p.evaluate(() => [...document.querySelectorAll("main a")].some((a) => /Clear search/.test(a.textContent)))));
  await p.close();

  for (const q of [".*", "(((", "$where", "{\"$ne\":1}", "<script>alert(1)</script>", "a".repeat(150)]) {
    const r = await fetchText(`/products?q=${encodeURIComponent(q)}`);
    check(`5-28 unsafe or long query is plain text: ${JSON.stringify(q.slice(0, 18))} → ${r.status}`, r.status === 200 && !r.text.includes("<script>alert(1)</script>"));
  }
  p = await open(`/products?q=${"a".repeat(150)}`);
  check("5-29 the input never holds more than 100 characters", (await p.$eval("input[name=q]", (i) => i.value.length)) <= 100);
  await p.close();

  // interactive behaviour
  p = await open("/products");
  await p.evaluate(() => { window.__keep = "same-document"; });
  await p.type("input[name=q]", "puma"); await sleep(1800); await p.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  const wantPuma = truth.filter((t) => matchesText(t, "puma")).length;
  check("5-30 typing updates the results after a pause without a page reload", urlOf(p).searchParams.get("q") === "puma" && (await p.evaluate(() => window.__keep)) === "same-document" && (await count(p)) === wantPuma, `${p.url()} ${await count(p)} vs ${wantPuma}`);
  await p.click("input[name=q]", { clickCount: 3 }); await p.type("input[name=q]", "kurta"); await p.keyboard.press("Enter");
  await sleep(1200); await p.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  check("5-31 Enter applies the search at once", urlOf(p).searchParams.get("q") === "kurta", p.url());
  await p.click("button[aria-label='Clear search']"); await sleep(1200); await p.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  check("5-32 the clear button removes the search from the URL and restores all products", !urlOf(p).searchParams.has("q") && (await count(p)) === TOTAL && (await p.$eval("input[name=q]", (i) => i.value)) === "");
  await p.close();
}

// ======================= filters =======================
{
  let p = await open("/products?category=packaging-printing");
  const packaging = await count(p);
  const boxChecked = await p.evaluate(() => [...document.querySelectorAll("input[name=category]")].filter((i) => i.checked).map((i) => i.value));
  check("5-40 category filter equals the category page and its checkbox is ticked", packaging === 8 && boxChecked.join() === "packaging-printing", `${packaging} ${boxChecked}`);
  await p.close();
  p = await open("/products?category=packaging-printing&category=industrial-machinery"); const two = await count(p); await p.close();
  check("5-41 two categories add up", two === 9, String(two));
  p = await open("/products?sub=men-tshirts"); const mt = await count(p);
  check("5-42 subcategory filter equals the seed", mt === truth.filter((t) => t.sub === "men-tshirts").length, `${mt}`);
  await p.close();
  p = await open("/products?category=packaging-printing&sub=men-tshirts"); const conflict = await count(p);
  check("5-43 a subcategory from another category gives an honest empty result", conflict === 0 && p.status === 200); await p.close();

  const inApparel = (f) => truth.filter(f).length;
  p = await open("/products?category=apparel-fashion&minPrice=500&maxPrice=1000"); const price = await count(p);
  check("5-44 price range equals the seed", price === inApparel((t) => t.price >= 500 && t.price <= 1000), `${price}`);
  const prices = (await cards(p)).map((x) => x.price); check("5-45 every shown price is inside the range", prices.length > 0 && prices.every((x) => x >= 500 && x <= 1000)); await p.close();
  p = await open("/products?category=apparel-fashion&state=Gujarat"); const st = await count(p); await p.close();
  check("5-46 state filter equals the seed", st === inApparel((t) => t.state === "Gujarat"), `${st}`);
  const aCity = truth[0].city;
  p = await open(`/products?category=apparel-fashion&city=${encodeURIComponent(aCity)}`); const ci = await count(p); await p.close();
  check(`5-47 city filter equals the seed (${aCity})`, ci === inApparel((t) => t.city === aCity), `${ci}`);
  p = await open("/products?category=apparel-fashion&colour=Blue"); const col = await count(p); await p.close();
  check("5-48 colour filter equals the seed", col === inApparel((t) => t.colour === "Blue"), `${col}`);
  p = await open("/products?department=Men"); const dep = await count(p); await p.close();
  check("5-49 department link (from the category directory) equals the seed", dep === inApparel((t) => t.dept === "Men"), `${dep}`);
  p = await open("/products?category=Men%20Tshirts"); const legacy = await count(p); const legacyNotice = await p.evaluate(() => /not recognised/.test(document.body.innerText)); await p.close();
  check("5-50 an old ?category=<product category name> link still works", legacy === mt && !legacyNotice, `${legacy}`);
  const oneSeller = truth[5];
  p = await open(`/products?seller=${encodeURIComponent(slug(oneSeller.sellerName))}`); const sel = await count(p);
  const selChip = await p.evaluate(() => [...document.querySelectorAll("ul[aria-label='Applied filters'] li")].map((l) => l.textContent.trim()));
  check("5-51 supplier filter equals the seed and the chip names the supplier", sel === inApparel((t) => t.seller === oneSeller.seller) && selChip.some((t) => t.includes(oneSeller.sellerName)), `${sel} ${selChip}`); await p.close();

  p = await open("/products?type=Manufacturer"); const man = await count(p); const manCards = await cards(p);
  const typeGroup = await p.evaluate(() => /Supplier Type/.test(document.querySelector("form[aria-label='Filter products']")?.innerText ?? ""));
  check("5-52 supplier type filters only products that carry a type (no apparel product matches)", man > 0 && man < sampleTotal + 1 && typeGroup && manCards.every((x) => !/Est\./.test(x.text)), `${man}`); await p.close();

  p = await open("/products");
  const moqLabels = await p.evaluate(() => [...document.querySelectorAll("input[name=moq]")].map((i) => ({ v: i.value, l: i.closest("label")?.textContent.replace(/\s+/g, " ").trim() })));
  const withUnit = moqLabels.filter((o) => o.v);
  const units = new Set(withUnit.map((o) => o.v.split(":")[0]));
  check("5-53 MOQ options are per unit and there is more than one unit", units.size >= 2 && withUnit.every((o) => /\b(pieces?|boxes|box|rolls?|kg|meters?|units?)\b/i.test(o.l ?? "")), moqLabels.map((o) => o.l).join(" | "));
  await p.close();
  const pick = moqLabels.find((o) => o.v.startsWith("piece:"));
  if (pick) {
    p = await open(`/products?moq=${encodeURIComponent(pick.v)}`); const mc = await cards(p); const bucket = pick.v.split(":")[1];
    const inB = (n) => (bucket === "1-10" ? n <= 10 : bucket === "11-50" ? n >= 11 && n <= 50 : bucket === "51-100" ? n >= 51 && n <= 100 : n > 100);
    check(`5-54 MOQ ${pick.l}: only that unit and range, products without MOQ are excluded`, mc.length > 0 && mc.every((x) => x.moq && /^piece/i.test(x.moq[2]) && inB(Number(x.moq[1].replace(/,/g, "")))), JSON.stringify(mc.map((x) => x.moq?.[0])));
    await p.close();
  } else check("5-54 MOQ per-unit filter", false, "no piece option");

  p = await open("/products?category=apparel-fashion&state=Gujarat&minPrice=300&colour=Blue&sort=price-asc"); const combo = await cards(p);
  check("5-55 combined filters equal the seed and respect the sort", (await count(p)) === inApparel((t) => t.state === "Gujarat" && t.price >= 300 && t.colour === "Blue") && combo.every((x, i) => i === 0 || x.price >= combo[i - 1].price));
  await p.close();
  p = await open("/products?category=nope&sub=nope&seller=nope");
  check("5-56 unknown category, subcategory and supplier ids are ignored with a notice", (await count(p)) === TOTAL && (await p.evaluate(() => /not recognised/.test(document.body.innerText))));
  await p.close();

  p = await open("/products?category=apparel-fashion");
  const catOpts = await p.evaluate(() => [...document.querySelectorAll("input[name=category]")].map((i) => i.closest("label")?.innerText.replace(/\s+/g, " ").trim()));
  check("5-57 facet counts exclude the group's own filter (other categories keep their counts)", catOpts.some((t) => /Packaging & Printing.*8/.test(t ?? "")), catOpts.join(" | "));
  await p.close();
  p = await open("/products?category=packaging-printing");
  const subOpts = await p.evaluate(() => [...document.querySelectorAll("input[name=sub]")].map((i) => i.value));
  check("5-58 subcategory options follow the selected category", subOpts.length > 0 && !subOpts.includes("men-tshirts"), subOpts.join(","));
  await p.close();
  p = await open("/products");
  const sidebar = await p.evaluate(() => document.querySelector("form[aria-label='Filter products']")?.innerText ?? "");
  check("5-59 groups: Category, Subcategory, Supplier Type, Colour, MOQ, Price, Location, City; no Brand or Availability", ["Category", "Subcategory", "Supplier Type", "Colour", "MOQ", "Price Range", "Location", "City"].every((g) => sidebar.includes(g)) && !/Brand|Availability/.test(sidebar));
  await p.close();
}

// ======================= sidebar behaviour (client navigation, no reload) =======================
{
  const p = await open("/products");
  await p.evaluate(() => { window.__keep = "same-document"; });
  await p.evaluate(() => document.querySelector("input[name=category][value=packaging-printing]").click());
  await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter products'] button[type=submit]")].find((b) => /Apply Filters/.test(b.textContent)).click());
  await sleep(1500); await p.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  check("5-60 Apply Filters updates the page without a full reload", (await p.evaluate(() => window.__keep)) === "same-document" && urlOf(p).searchParams.get("category") === "packaging-printing" && (await count(p)) === 8, p.url());
  const badge = await p.evaluate(() => document.querySelector("form[aria-label='Filter products']")?.innerText.match(/Apply Filters \((\d+)\)/)?.[1]);
  check("5-61 the button and badge show the active filter count", badge === "1", String(badge));
  await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter products'] a")].find((a) => /Clear All/.test(a.textContent)).click());
  await sleep(1500); await p.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  const ticked = await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter products'] input[type=checkbox]:checked")].length);
  check("5-62 Clear All removes the filters, unticks the boxes and keeps the page loaded", (await count(p)) === TOTAL && ticked === 0 && (await p.evaluate(() => window.__keep)) === "same-document");
  await p.evaluate(() => { const i = document.querySelector("input[name=minPrice]"); i.focus(); });
  await p.type("input[name=minPrice]", "500"); await p.type("input[name=maxPrice]", "800");
  await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter products'] button[type=submit]")].find((b) => /Apply Range/.test(b.textContent)).click());
  await sleep(1500); await p.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  check("5-63 Apply Range filters by price", urlOf(p).searchParams.get("minPrice") === "500" && urlOf(p).searchParams.get("maxPrice") === "800");
  const priceChip = await p.evaluate(() => [...document.querySelectorAll("ul[aria-label='Applied filters'] li")].map((l) => l.textContent.trim()));
  check("5-64 an applied-filter chip shows the price range and removes only it", priceChip.some((t) => /500/.test(t) && /800/.test(t)));
  await p.close();

  // sort, view, pagination keep search + filters
  const s = await open("/products?q=tshirt&category=apparel-fashion&state=Gujarat");
  await s.select("select[name=sort]", "price-desc"); await sleep(1500); await s.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  const u = urlOf(s).searchParams;
  const sorted = (await cards(s)).map((x) => x.price);
  check("5-65 changing the sort keeps the search and filters and orders descending", u.get("sort") === "price-desc" && u.get("q") === "tshirt" && u.get("state") === "Gujarat" && sorted.every((x, i) => i === 0 || x <= sorted[i - 1]), s.url());
  await s.evaluate(() => document.querySelector("a[aria-label='List view']").click()); await s.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}); await sleep(500);
  const uv = urlOf(s).searchParams;
  check("5-66 list view keeps everything and renders list cards", uv.get("view") === "list" && uv.get("q") === "tshirt" && uv.get("sort") === "price-desc" && (await s.evaluate(() => !!document.querySelector("ul[class*=list] article"))), s.url());
  const nextHref = await s.evaluate(() => [...document.querySelectorAll("nav[aria-label=Pagination] a")].find((a) => /Next/.test(a.textContent))?.getAttribute("href") ?? "");
  const nh = new URL(nextHref, BASE).searchParams;
  check("5-67 pagination links keep search, filters, sort and view", nh.get("page") === "2" && nh.get("q") === "tshirt" && nh.get("state") === "Gujarat" && nh.get("sort") === "price-desc" && nh.get("view") === "list", nextHref);
  await s.close();

  const sortOptions = await (async () => { const q = await open("/products"); const o = await q.$$eval("select[name=sort] option", (os) => os.map((x) => x.textContent.trim())); await q.close(); return o; })();
  check("5-68 only real sort orders are offered", sortOptions.join("|") === "Relevance|Price: Low to High|Price: High to Low", sortOptions.join("|"));
  const asc = await open("/products?sort=price-asc"); const ascP = (await cards(asc)).map((x) => x.price); await asc.close();
  const min = Math.min(...truth.map((t) => t.price));
  check("5-69 low→high starts at or below the cheapest catalog product and is ordered", ascP[0] <= min && ascP.every((x, i) => i === 0 || x >= ascP[i - 1]), ascP.join(","));
}

// ======================= cards, images, links, wishlist =======================
{
  const p = await open("/products?q=nike");
  const cs = await cards(p);
  check("5-70 catalog card: https image from the dataset host, estimated price, no MOQ, no verified badge", cs.every((x) => /^https:\/\/assets\.myntassets\.com\//.test(x.img) && /Est\./.test(x.text) && !x.moq && !/Verified/.test(x.text)), cs[0]?.img);
  const sample = await open("/products?category=industrial-machinery"); const sc = await cards(sample);
  check("5-71 sample card: local image, MOQ with unit, supplier and city", sc.length === 1 && decodeURIComponent(sc[0].img).includes("/images/") && !!sc[0].moq && /Ahmedabad|Gujarat/.test(sc[0].text), sc[0]?.text.replace(/\s+/g, " "));
  await sample.close();
  const href = cs[0].href;
  const r = await fetchText(href);
  check("5-72 the card link opens a real product page", r.status === 200 && new Set(cs.map((x) => x.href)).size === cs.length, `${href} ${r.status}`);
  const supplierHref = await p.evaluate(() => document.querySelector("article a[class*=supplierName]")?.getAttribute("href"));
  check("5-73 the supplier link opens a real supplier page", (await fetchText(supplierHref)).status === 200, supplierHref);
  const quoteHref = await p.evaluate(() => document.querySelector("article a[class*=cta]")?.getAttribute("href"));
  check("5-74 Get Best Quote opens the product's quote section", quoteHref === `${href}#get-best-quote`, quoteHref);
  const box = await p.evaluate(() => { const r = document.querySelector("article img").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.mouse.click(box.x, box.y); await p.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("5-75 clicking the card image opens the product", p.url().includes("/products/"), p.url());
  await p.close();

  // wishlist: signed out is sent to sign in; signed in persists on the server
  const out = await open("/products");
  await out.evaluate(() => document.querySelector("article button[aria-label^='Save']").click());
  await out.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("5-76 a signed-out visitor clicking the heart is sent to sign in", /\/sign-in/.test(out.url()), out.url());
  await out.close();
  const reg = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "buyer", name: "P5 Tester", email: `p5-${Date.now()}@example.test`, password: "test-password-9" }) });
  const token = (reg.headers.getSetCookie?.() ?? []).map((l) => l.split(";")[0]).find((c) => c.startsWith("finbyn_session="))?.split("=")[1];
  const inn = await open("/products?q=nike", { cookie: token });
  const key = (await inn.evaluate(() => document.querySelector("article a[class*=name]").getAttribute("href"))).match(/-(\d+)$/)[1];
  await inn.evaluate(() => document.querySelector("article button[aria-label^='Save']").click()); await sleep(1500);
  const saved = await fetch(`${BASE}/api/buyer/wishlist`, { headers: { cookie: `finbyn_session=${token}` } }).then((x) => x.json());
  check("5-77 a signed-in save is stored for the buyer and the heart shows it after reload", saved.productIds?.includes(key) && (await (async () => { await inn.reload({ waitUntil: "networkidle2" }); await sleep(600); return inn.evaluate(() => document.querySelector("article button[aria-pressed]").getAttribute("aria-pressed")); })()) === "true", `${key} in ${saved.productIds}`);
  await inn.close();

  // requirement banner carries the search and the single selected category
  const b = await open("/products?q=tshirt&category=apparel-fashion");
  const cta = await b.evaluate(() => [...document.querySelectorAll("a")].filter((a) => /Post Your Requirement/i.test(a.textContent)).pop()?.getAttribute("href"));
  const cu = new URL(cta, BASE);
  check("5-78 the requirement banner passes the search text and the category", cu.pathname === "/post-requirement" && cu.searchParams.get("product") === "tshirt" && cu.searchParams.get("category") === "Apparel & Fashion", cta);
  await b.goto(BASE + cta, { waitUntil: "networkidle2" });
  check("5-79 the requirement form opens with the product prefilled", (await b.$eval("main input[placeholder^='Enter product']", (i) => i.value)) === "tshirt");
  await b.close();
}

// ======================= SEO =======================
{
  const plain = await fetchText("/products");
  const meta = (html, re) => (re.exec(html) ?? [])[1];
  check("5-80 unique title and description, one h1, indexable plain page", /All Products/.test(meta(plain.text, /<title>([^<]*)/) ?? "") && !!meta(plain.text, /<meta name="description" content="([^"]*)"/) && (plain.text.match(/<h1/g) || []).length === 1 && !/noindex/.test(plain.text));
  const noindex = async (q) => /noindex/.test((await fetchText(`/products${q}`)).text);
  const flags = { q: await noindex("?q=a"), category: await noindex("?category=packaging-printing"), sort: await noindex("?sort=price-asc"), view: await noindex("?view=list"), limit: await noindex("?limit=20"), page2: await noindex("?page=2") };
  check("5-81 search, filters, sort, list view and page size are noindex; plain pagination stays indexable", flags.q && flags.category && flags.sort && flags.view && flags.limit && !flags.page2, JSON.stringify(flags));
  const ld = [...plain.text.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].flatMap((m) => JSON.parse(m[1]));
  const list = ld.find((x) => x["@type"] === "ItemList"); const crumb = ld.find((x) => x["@type"] === "BreadcrumbList");
  check("5-82 JSON-LD: ItemList total and a two-level BreadcrumbList", list?.numberOfItems === TOTAL && list.itemListElement.length === 10 && crumb?.itemListElement.length === 2);
  check("5-83 product links are in the server HTML", (plain.text.match(/href="\/products\//g) || []).length >= 10);
}

// ======================= mobile =======================
{
  const p = await open("/products", { mobile: true });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const searchFits = await p.evaluate(() => { const r = document.querySelector("input[name=q]").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
  check("5-90 phone: no horizontal overflow and the search field fits", !overflow && searchFits);
  const drawerBtn = await p.evaluate(() => !![...document.querySelectorAll("button")].find((b) => /Filter/i.test(b.textContent) && b.offsetParent));
  check("5-91 phone: filters open from a button, not inline", drawerBtn);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Filter/i.test(b.textContent) && b.offsetParent).click());
  await sleep(500);
  await p.evaluate(() => document.querySelector("dialog input[name=category][value=packaging-printing], [role=dialog] input[name=category][value=packaging-printing], input[name=category][value=packaging-printing]").click());
  await p.evaluate(() => [...document.querySelectorAll("button[type=submit]")].filter((b) => b.offsetParent).find((b) => /Apply Filters/.test(b.textContent)).click());
  await sleep(1800); await p.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  const drawerClosed = await p.evaluate(() => document.querySelector("[role=dialog]:not(#mobile-nav-panel)")?.hasAttribute("inert") ?? true);
  check("5-92 phone: applying in the drawer filters the results and closes it", urlOf(p).searchParams.get("category") === "packaging-printing" && (await count(p)) === 8 && p.errs.length === 0 && drawerClosed, `${p.url()} ${p.errs.join(";")}`);
  await p.close();
}

// ======================= API =======================
{
  let r = await api();
  const j = r.json;
  check("A1 default response shape: ok, 10 products, facets, appliedFilters, meta", r.status === 200 && j.ok === true && j.data.products.length === 10 && !!j.data.facets && !!j.data.appliedFilters && j.meta.pageSize === 10 && j.meta.currentPage === 1 && j.meta.totalItems === TOTAL && j.meta.totalPages === Math.ceil(TOTAL / 10) && j.meta.hasNextPage === true && j.meta.hasPreviousPage === false);
  const text = JSON.stringify(j);
  check("A2 no private fields: no emails, phones, owner names, pincodes or internal keys", !/@example|phone|owner|pincode|passwordHash|\+91|_id/i.test(text));
  r = await api("limit=50"); check("A3 limit=50 returns 50 products", r.json.data.products.length === 50 && r.json.meta.pageSize === 50);
  for (const bad of ["limit=51", "limit=0", "limit=abc", "limit=-1", "page=0", "page=abc", "page=1.5"]) { r = await api(bad); check(`A4 ${bad} is rejected (400 with a field message)`, r.status === 400 && r.json.ok === false && r.json.code === "VALIDATION_ERROR" && Object.keys(r.json.fields).length === 1); }
  r = await api("page=900000"); check("A5 a page past the end returns the last page with accurate meta", r.status === 200 && r.json.meta.currentPage === r.json.meta.totalPages && r.json.meta.hasNextPage === false && r.json.meta.hasPreviousPage === true);
  for (const bad of ["sort=newest", "sort=popularity", "sort=name", "sort=%7B%22%24ne%22%3A1%7D"]) { r = await api(bad); check(`A6 ${bad} is rejected`, r.status === 400 && !!r.json.fields.sort); }
  for (const bad of ["minPrice=-5", "minPrice=abc", "minPrice=500&maxPrice=100", "maxPrice=1e9x"]) { r = await api(bad); check(`A7 ${bad} is rejected`, r.status === 400); }
  for (const [p, name] of [["brand=Nike", "brand"], ["availability=in_stock", "availability"], ["attributes=size", "attributes"], ["country=India", "country"], ["currency=USD", "currency"]]) { r = await api(p); check(`A8 unsupported ${p} fails with an explanation`, r.status === 400 && !!r.json.fields[name]); }
  r = await api("currency=INR"); check("A9 currency=INR is accepted", r.status === 200);
  r = await api(`q=${"x".repeat(101)}`); check("A10 search text over 100 characters is rejected", r.status === 400 && !!r.json.fields.q);
  r = await api("q=%7B%22%24ne%22%3A1%7D"); check("A11 operator-looking search text is plain text", r.status === 200 && r.json.meta.totalItems === 0);
  r = await api("category%5B%24ne%5D=x&q%5B%24gt%5D="); check("A12 bracket/operator parameter names are ignored", r.status === 200 && r.json.meta.totalItems === TOTAL);
  r = await api("minMOQ=10"); check("A13 minMOQ without moqUnit is rejected", r.status === 400 && !!r.json.fields.moqUnit);
  r = await api("moqUnit=pieces&minMOQ=101&category=packaging-printing");
  check("A14 unit-aware MOQ range: only that unit, above the minimum", r.status === 200 && r.json.data.products.length > 0 && r.json.data.products.every((x) => x.moq.unit === "piece" && x.moq.quantity >= 101), JSON.stringify(r.json.data.products.map((x) => x.moq)));
  r = await api("q=tshirt"); check("A15 search equals the page count", r.json.meta.totalItems === truth.filter((t) => matchesText(t, "tshirt")).length);
  r = await api("category=apparel-fashion&state=Gujarat&minPrice=500&maxPrice=1000"); check("A16 combined filters equal the seed", r.json.meta.totalItems === truth.filter((t) => t.state === "Gujarat" && t.price >= 500 && t.price <= 1000).length, String(r.json.meta.totalItems));
  r = await api("category=apparel-fashion&limit=50"); const imgs = r.json.data.products.map((x) => x.image);
  check("A17 images are normalised: allowed https host or local path, never another product's", imgs.every((i) => i && (/^https:\/\/assets\.myntassets\.com\//.test(i.src) ? i.remote === true : i.src.startsWith("/images/") && i.remote === false)));
  check("A18 catalog suppliers are never verified; supplier carries only public fields", r.json.data.products.every((x) => x.supplier.verificationStatus === "unverified" && x.source === "catalog" && Object.keys(x.supplier).sort().join() === "city,id,name,slug,state,url,verificationStatus"));
  r = await api("q=zzzqqq"); check("A19 empty result: ok, no products, one page", r.status === 200 && r.json.data.products.length === 0 && r.json.meta.totalItems === 0 && r.json.meta.totalPages === 1);
  r = await api("category=nope"); check("A20 unknown category id is reported and ignored", r.status === 200 && r.json.data.ignoredFilters.some((f) => f.param === "category" && f.value === "nope"));
  const excluded = allProducts.length - truth.length;
  check("A21 products of inactive sellers or with unknown categories are excluded", (await api("category=apparel-fashion")).json.meta.totalItems === truth.length, `${excluded} seed rows excluded (${allSellers.filter((s) => s.status !== "Active").length} inactive sellers)`);
  check("A22 shared caches may keep a response", /s-maxage/.test((await api()).headers.get("cache-control") ?? ""));
  r = await api("sort=price-asc&limit=5"); const pr = r.json.data.products.map((x) => x.price.min); check("A23 sort=price-asc is ordered", pr.every((x, i) => i === 0 || x >= pr[i - 1]));
  r = await api("supplierType=Manufacturer&subcategory=air-compressors"); check("A24 aliases supplierType and subcategory work", r.status === 200 && r.json.meta.totalItems === 1);

  // last: rate limit (120 per minute per address) — blocks this address for the rest of the minute
  let blocked = null;
  for (let i = 0; i < 260; i++) { const x = await api("limit=1"); if (x.status === 429) { blocked = x; break; } }
  check("A25 the public API is rate-limited (429, Retry-After, safe message)", !!blocked && Number(blocked.headers.get("retry-after")) > 0 && blocked.json.code === "RATE_LIMITED" && blocked.json.ok === false);
}

await browser.close();
const fails = results.filter((x) => !x.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) console.log("FAILED:\n" + fails.map((f) => " - " + f.name).join("\n"));
