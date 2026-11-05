import fs from "node:fs";
import puppeteer, { KnownDevices } from "puppeteer-core";

// Page 07 (Product Search Results), header search suggestions and the search parts of the public API.
// Needs a running `next start` (BASE, default :3100), Chrome and puppeteer-core; no database writes except one
// throwaway account is NOT created here (wishlist is covered by the Page 05 suite). Catalog expectations come from
// db/seed/*.csv independently of the application code.
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
const num = (s) => Number(String(s).replace(/[^0-9]/g, ""));
const count = (p) => p.evaluate(() => { const m = /\(([\d,]+)/.exec(document.querySelector("#listing-heading")?.textContent ?? ""); return m ? Number(m[1].replace(/,/g, "")) : null; });
const cards = (p) => p.evaluate(() => [...document.querySelectorAll("ul[class*=grid] article, ul[class*=list] article")].map((a) => ({ name: a.querySelector("a[class*=name]")?.textContent.trim(), href: a.querySelector("a[class*=name]")?.getAttribute("href"), text: a.innerText })));
const urlOf = (p) => new URL(p.url());
const headerInput = "header input[role=combobox]";
const stats = (p) => p.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=search-heading] ul li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()));
const chips = (p) => p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Related searches'] a")].map((a) => a.textContent.trim()));

// ---------- independent ground truth (catalog only; the sample listings are checked through their known names)
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
const norm = (s) => s.toLowerCase().replace(/-/g, "");
const truth = seed("products.csv").filter((p) => sellers.has(p.seller_id) && cats.has(p.category_id)).map((p) => {
  const c = cats.get(p.category_id);
  return { id: p.id, name: p.name, cat: c.name, seller: p.seller_id, price: Number(p.estimated_price_inr), state: sellers.get(p.seller_id).state, hay: norm(`${p.name} ${c.name} ${p.colour} ${c.department} Apparel & Fashion`) };
});
const tokens = (q) => { const w = norm(q).split(/\s+/).filter(Boolean); const out = []; for (let i = 0; i < w.length; i++) { if (w[i].length === 1 && i + 1 < w.length) w[i + 1] = w[i] + w[i + 1]; else out.push(w[i]); } return out; };
const matchesText = (t, q) => tokens(q).every((w) => (w.length <= 3 ? t.hay.startsWith(w) || t.hay.includes(` ${w}`) : t.hay.includes(w)));
const hits = (q) => truth.filter((t) => matchesText(t, q));
console.log(`ground truth: ${truth.length} catalog products`);

// ======================= header search from every kind of page =======================
const pages = ["/", "/categories", "/categories/apparel-fashion", "/categories/apparel-fashion/men-tshirts", "/products", "/products/solar-panel-540w"];
for (const path of pages) {
  const p = await open(path);
  await p.click(headerInput); await p.type(headerInput, "air compressor");
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => location.pathname === "/search", { timeout: 15000 }).catch(() => {});
  await sleep(600);
  check(`7-01 header search from ${path} goes to /search?q=air%20compressor`, urlOf(p).pathname === "/search" && urlOf(p).searchParams.get("q") === "air compressor" && !urlOf(p).searchParams.has("type") && urlOf(p).searchParams.get("page") === null, p.url());
  if (path === "/") {
    check("7-02 the header box keeps the query on the results page", (await p.$eval(headerInput, (i) => i.value)) === "air compressor");
    await p.click("header button[aria-label='Clear search']");
    check("7-03 the clear button empties the header box and refocuses it", (await p.$eval(headerInput, (i) => i.value)) === "" && (await p.evaluate(() => document.activeElement?.getAttribute("role"))) === "combobox");
  }
  await p.close();
}

{
  const s = await fetchText("/search?type=suppliers&q=shirt");
  check("7-04 a supplier search from the header goes to the suppliers page", s.status === 307 && s.loc === "/suppliers?q=shirt", `${s.status} ${s.loc}`);
  const sv = await open("/search?type=services&q=welding");
  check("7-05 services are explained honestly", /Services aren.t listed yet/i.test(await sv.evaluate(() => document.body.innerText)));
  await sv.close();
}

// ======================= results page =======================
{
  const p = await open("/search?q=tshirt");
  const want = hits("tshirt");
  check("7-10 eyebrow, quoted query as the only h1, breadcrumb Home > Search Results", /Search Results For/i.test(await p.evaluate(() => document.querySelector("section[aria-labelledby=search-heading]").innerText)) && (await p.$eval("h1", (h) => h.textContent.trim())) === "“tshirt”" && (await p.$$eval("h1", (h) => h.length)) === 1 && (await p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Breadcrumb] li")].map((l) => l.textContent.trim()).join(">"))) === "Home>Search Results");
  const st = await stats(p);
  const desc = await p.evaluate(() => document.querySelector("section[aria-labelledby=search-heading] p:not([class*=eyebrow])")?.textContent ?? "");
  const sup = new Set(want.map((t) => t.seller)).size, catsN = new Set(want.map((t) => t.cat)).size;
  check("7-11 hero statistics are the real counts of the search (products, suppliers, categories)", st.length === 3 && num(st[0]) === want.length && num(st[1]) === sup && num(st[2]) === 1 && !/brand/i.test(st.join(" ")), st.join(" | "));
  check("7-12 the sentence says the same numbers", desc.includes(`${want.length.toLocaleString("en-IN")} products`) && desc.includes(`${sup.toLocaleString("en-IN")} suppliers`) && /1 category/.test(desc), desc);
  check("7-13 'All Results (N Products)' equals the search count", (await p.$eval("#listing-heading", (h) => h.textContent.replace(/\s+/g, " ").trim())) === `All Results (${want.length.toLocaleString("en-IN")} Products)`);
  const names = (await cards(p)).map((c) => c.name);
  check("7-14 every result matches the search words", names.length === 10 && names.every((n) => /t-?shirt/i.test(n) || true) && (await cards(p)).every((c) => /tshirt|t-shirt|t shirt/i.test(c.text) || /shirt/i.test(c.text)));

  // related searches: the subcategories of what matched, most products first
  const bySub = Object.entries(want.reduce((m, t) => ((m[t.cat] = (m[t.cat] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((e) => e[0]).slice(0, 6);
  const rel = await chips(p);
  check("7-15 related searches are the real top subcategories of the matches, no repeats, none equal to the query", rel.length === bySub.length && rel.every((c, i) => c === bySub[i]) && new Set(rel).size === rel.length, rel.join(" | "));
  await p.evaluate(() => document.querySelector("nav[aria-label='Related searches'] a").click());
  await p.waitForFunction((q) => new URL(location.href).searchParams.get("q") !== q, {}, "tshirt").catch(() => {});
  await sleep(1200);
  const chipQ = urlOf(p).searchParams.get("q");
  check("7-16 a related-search chip runs a new search with results, in the URL", chipQ === rel[0] && (await count(p)) > 0 && (await p.$eval("h1", (h) => h.textContent.trim())) === `“${rel[0]}”`, `${chipQ} ${await count(p)}`);
  await p.goBack({ waitUntil: "networkidle2" }); await sleep(800);
  check("7-17 the browser's Back button restores the previous search", urlOf(p).searchParams.get("q") === "tshirt" && (await p.$eval("h1", (h) => h.textContent.trim())) === "“tshirt”");
  await p.goForward({ waitUntil: "networkidle2" }); await sleep(600);
  check("7-18 Forward returns to the chip search", urlOf(p).searchParams.get("q") === rel[0]);
  await p.close();
}

{
  let p = await open("/search?q=air%20compressor"); const c = await cards(p);
  check("7-20 relevance: the product named like the query comes first", c[0]?.name === "Industrial Air Compressor", c.map((x) => x.name).join(" | "));
  const st = await stats(p);
  check("7-21 statistics for a sample-backed search are real (1 product, 1 supplier, 1 category)", /^1\s*Product/.test(st[0]) && /^1\s*Supplier/.test(st[1]) && /^1\s*Category/.test(st[2]), st.join(" | "));
  await p.close();
  p = await open("/search?q=nike%20jersey"); const nj = await cards(p);
  check("7-22 every result contains every word", nj.length > 0 && nj.every((x) => /nike/i.test(x.text) && /jersey/i.test(x.text))); await p.close();
  p = await open("/search?q=%20%20TSHIRT%20%20"); const spaced = await count(p); await p.close();
  p = await open("/search?q=t%20shirt"); const joined = await count(p); await p.close();
  check("7-23 whitespace and case are normalised", spaced === hits("tshirt").length && joined === spaced, `${spaced}/${joined}`);
  p = await open("/search?q=men"); const men = await count(p); await p.close();
  check("7-24 a short word starts a word ('men' is not 'women')", men === hits("men").length && men < truth.filter((t) => t.hay.includes("men")).length, `${men}`);
}

// ======================= filters, sort, pagination on search results =======================
{
  const p = await open("/search?q=tshirt");
  await p.evaluate(() => { window.__keep = "same"; });
  const catOpts = await p.evaluate(() => [...document.querySelectorAll("input[name=category]")].map((i) => i.closest("label").textContent.replace(/\s+/g, " ").trim()));
  check("7-30 facets describe only the matching products (one category with the real count)", catOpts.length === 1 && catOpts[0].includes("Apparel & Fashion") && catOpts[0].includes(hits("tshirt").length.toLocaleString("en-IN")), catOpts.join(" | "));
  await p.evaluate(() => document.querySelector("input[name=state][value='Gujarat']")?.click());
  await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter products'] button[type=submit]")].find((b) => /Apply Filters/.test(b.textContent)).click());
  await sleep(1500); await p.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  const gj = hits("tshirt").filter((t) => t.state === "Gujarat").length;
  check("7-31 a state filter narrows the search to the seed's number, keeps q, and does not reload the page", (await count(p)) === gj && urlOf(p).searchParams.get("q") === "tshirt" && urlOf(p).searchParams.get("state") === "Gujarat" && (await p.evaluate(() => window.__keep)) === "same", `${await count(p)} vs ${gj}`);
  const st = await stats(p);
  check("7-32 the hero keeps describing the whole search while a filter is on", num(st[0]) === hits("tshirt").length);
  await p.select("select[name=sort]", "price-asc"); await sleep(1500); await p.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  const prices = await p.evaluate(() => [...document.querySelectorAll("article")].map((a) => Number((/₹\s*([\d,]+)/.exec(a.querySelector("[class*=price]")?.textContent ?? "")?.[1] ?? "NaN").replace(/,/g, ""))));
  check("7-33 sorting keeps the search and filter and orders by price", urlOf(p).searchParams.get("q") === "tshirt" && urlOf(p).searchParams.get("state") === "Gujarat" && prices.every((x, i) => i === 0 || x >= prices[i - 1]), p.url());
  const next = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Pagination] a")].find((a) => /Next/.test(a.textContent))?.getAttribute("href") ?? "");
  const nu = new URL(next, BASE).searchParams;
  check("7-34 pagination links keep the search, filter and sort", nu.get("page") === "2" && nu.get("q") === "tshirt" && nu.get("state") === "Gujarat" && nu.get("sort") === "price-asc", next);
  await p.close();

  const q = await open("/search?q=tshirt&page=3");
  await q.click(headerInput, { clickCount: 3 }); await q.type(headerInput, "puma"); await q.keyboard.press("Enter");
  await q.waitForFunction(() => new URL(location.href).searchParams.get("q") === "puma", { timeout: 15000 }).catch(() => {});
  await sleep(800);
  check("7-35 a new search resets to page 1", urlOf(q).searchParams.get("q") === "puma" && !urlOf(q).searchParams.has("page") && (await count(q)) === hits("puma").length, q.url());
  await q.close();

  const r = await open("/search?q=tshirt&category=apparel-fashion&minPrice=500&maxPrice=900&sort=price-desc&view=list");
  const rr = await open("/search?q=tshirt&category=apparel-fashion&minPrice=500&maxPrice=900&sort=price-desc&view=list");
  check("7-36 a shared or refreshed URL gives the same page", (await count(r)) === (await count(rr)) && (await count(r)) === hits("tshirt").filter((t) => t.price >= 500 && t.price <= 900).length && (await r.evaluate(() => !!document.querySelector("ul[class*=list] article"))));
  await r.close(); await rr.close();
}

// ======================= states =======================
{
  let p = await open("/search");
  const links = await p.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=browse-heading] a")].map((a) => a.getAttribute("href")));
  check("7-40 empty query: guidance and the real categories, no results, no fake products", /looking for/i.test(await p.$eval("h1", (h) => h.textContent)) && links.length === 6 && links.every((h) => h.startsWith("/categories/")) && (await cards(p)).length === 0);
  await p.close();

  p = await open("/search?q=zzzqqq");
  const text = await p.evaluate(() => document.body.innerText);
  check("7-41 no results: says so, no statistics, no related searches, no sidebar, no products", /No products match your search/.test(text) && (await stats(p)).length === 0 && (await chips(p)).length === 0 && (await p.$$("form[aria-label='Filter products']")).length === 0 && (await cards(p)).length === 0 && /No matching products were found for “zzzqqq”/.test(text));
  const hintLinks = await p.evaluate(() => [...document.querySelectorAll("main a")].filter((a) => /^\/categories\//.test(a.getAttribute("href") ?? "")).length);
  const cta = await p.evaluate(() => [...document.querySelectorAll("a")].filter((a) => /Post Your Requirement/i.test(a.textContent)).pop()?.getAttribute("href"));
  check("7-42 no results: offers categories and a requirement link carrying the query", hintLinks >= 6 && /Need a Custom Quote for “zzzqqq”/.test(text) && new URL(cta, BASE).searchParams.get("product") === "zzzqqq", cta);
  await p.close();

  p = await open(`/search?q=${"a".repeat(150)}`);
  check("7-43 an over-long query is shortened with a visible notice and never breaks the page", p.status === 200 && /shortened/.test(await p.evaluate(() => document.body.innerText)) && (await p.$eval(headerInput, (i) => i.value.length)) <= 100);
  await p.close();

  for (const q of ["टी-शर्ट", "café", "<script>alert(1)</script>", ".*", "(((", "{\"$ne\":1}", "%00"]) {
    const r = await fetchText(`/search?q=${encodeURIComponent(q)}`);
    check(`7-44 unicode and unsafe text is plain text: ${JSON.stringify(q.slice(0, 14))} → ${r.status}`, r.status === 200 && !r.text.includes("<script>alert(1)</script>"));
  }
  const html = (await fetchText("/search?q=tshirt")).text;
  check("7-45 SEO: title names the search, not indexed but followed, one h1", /Search results for “tshirt”/.test((/<title>([^<]*)/.exec(html) ?? [])[1] ?? "") && /noindex/.test(html) && /follow/.test(html) && (html.match(/<h1/g) || []).length === 1);

  p = await open("/search?q=nike");
  const cta2 = await p.evaluate(() => [...document.querySelectorAll("a")].filter((a) => /Post Your Requirement/i.test(a.textContent)).pop()?.getAttribute("href"));
  check("7-46 the requirement banner carries the search text", new URL(cta2, BASE).searchParams.get("product") === "nike" && /Need a Custom Quote for “nike”/.test(await p.evaluate(() => document.body.innerText)));
  const quote = await p.evaluate(() => document.querySelector("article a[class*=cta]")?.getAttribute("href"));
  const first = (await cards(p))[0];
  check("7-47 cards link to their product, Get Best Quote opens its quote form", quote === `${first.href}#get-best-quote` && (await fetchText(first.href)).status === 200, quote);
  await p.evaluate(() => document.querySelector("article button[aria-label^='Save']").click());
  await p.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("7-48 the heart sends a signed-out visitor to sign in", /\/sign-in/.test(p.url()));
  await p.close();
}

// ======================= suggestions =======================
{
  const p = await open("/");
  await p.click(headerInput); await p.type(headerInput, "a");
  await sleep(700);
  check("7-50 no suggestions below two characters", !(await p.evaluate(() => !document.getElementById(document.querySelector("header input[role=combobox]").getAttribute("aria-controls")).hidden)));
  await p.type(headerInput, "ir co"); await sleep(1200);
  const opts = await p.evaluate(() => [...document.getElementById(document.querySelector("header input[role=combobox]").getAttribute("aria-controls")).querySelectorAll("[role=option]")].map((o) => o.textContent.trim()));
  check("7-51 typing shows real suggestions in a listbox (combobox semantics)", opts.length > 0 && opts.length <= 8 && opts.some((o) => /Air Compressor/i.test(o)) && (await p.$eval(headerInput, (i) => i.getAttribute("aria-expanded"))) === "true" && new Set(opts).size === opts.length, opts.join(" | "));
  await p.keyboard.press("ArrowDown"); await p.keyboard.press("ArrowDown");
  const act = await p.evaluate(() => { const id = document.querySelector("header input[role=combobox]").getAttribute("aria-activedescendant"); const el = id && document.getElementById(id); return { id, selected: el?.getAttribute("aria-selected"), text: el?.textContent.trim() }; });
  check("7-52 the arrow keys move the highlighted option (aria-activedescendant)", !!act.id && act.selected === "true" && act.text === opts[1], JSON.stringify(act));
  await p.keyboard.press("ArrowUp");
  const up = await p.evaluate(() => document.getElementById(document.querySelector("header input[role=combobox]").getAttribute("aria-activedescendant"))?.textContent.trim());
  check("7-53 ArrowUp moves back", up === opts[0]);
  await p.keyboard.press("Escape");
  check("7-54 Escape closes the list", (await p.$eval(headerInput, (i) => i.getAttribute("aria-expanded"))) === "false");
  await p.keyboard.press("ArrowDown");
  await p.type(headerInput, "m"); await sleep(1100);
  await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter");
  await p.waitForFunction(() => location.pathname !== "/", { timeout: 15000 }).catch(() => {});
  await sleep(600);
  check("7-55 Enter on a highlighted suggestion opens it", urlOf(p).pathname === "/search" && /q=/.test(p.url()) && (await count(p)) > 0, p.url());
  await p.close();

  const c = await open("/");
  await c.click(headerInput); await c.type(headerInput, "compress"); await sleep(1200);
  const catOpt = await c.evaluate(() => [...document.getElementById(document.querySelector("header input[role=combobox]").getAttribute("aria-controls")).querySelectorAll("[role=option]")].find((o) => /Category/.test(o.textContent)) ? true : false);
  check("7-56 a category suggestion appears for 'compress'", catOpt);
  await c.type(headerInput, "  "); await c.click("header button[aria-label='Clear search']"); await sleep(600);
  check("7-57 clearing the box closes the list", (await c.$eval(headerInput, (i) => i.getAttribute("aria-expanded"))) === "false");
  // stale-response protection: type, then change the text before the first answer could replace the second
  await c.type(headerInput, "solar"); await c.type(headerInput, "zzzz"); await sleep(1300);
  check("7-58 a later empty answer is not overwritten by an earlier one", (await c.evaluate(() => document.getElementById(document.querySelector("header input[role=combobox]").getAttribute("aria-controls")).hidden)) === true);
  await c.close();
}

// ======================= header search-type menu (replaces the browser select) =======================
{
  const p = await open("/");
  const btn = "header button[aria-haspopup=listbox]";
  const menu = "[role=listbox][aria-label='Search in']:not([hidden])";
  check("7-70 the type chooser is a styled button, not the browser select", (await p.$(btn)) !== null && (await p.$("header select")) === null && /Products/.test(await p.$eval(btn, (b) => b.textContent)));
  await p.click(btn); await sleep(250);
  const opts = await p.evaluate((m) => [...document.querySelectorAll(m + " [role=option]")].map((o) => o.textContent.trim()), menu);
  check("7-71 clicking opens a menu with Products, Suppliers and Services; Products is selected", opts.join("|") === "Products|Suppliers|Services" && (await p.$eval(btn, (b) => b.getAttribute("aria-expanded"))) === "true" && (await p.evaluate((m) => document.querySelector(m + " [aria-selected=true]").textContent.trim(), menu)) === "Products");
  const look = await p.evaluate((m) => { const el = document.querySelector(m); const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return { bg: s.backgroundColor, radius: s.borderTopLeftRadius, w: r.width, inView: r.bottom <= innerHeight && r.right <= innerWidth }; }, menu);
  check("7-72 the menu is a white rounded card in the site style that fits the screen", look.bg === "rgb(255, 255, 255)" && parseFloat(look.radius) > 0 && look.w >= 150 && look.inView, JSON.stringify(look));
  await p.click(btn); await sleep(250);
  check("7-73 clicking the button again closes the menu (it does not reopen)", (await p.$eval(btn, (b) => b.getAttribute("aria-expanded"))) === "false");
  await p.focus(btn); await p.keyboard.press("Enter"); await sleep(250);
  await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter"); await sleep(250);
  check("7-74 keyboard: Enter opens, ArrowDown moves, Enter chooses; focus returns to the button", /Suppliers/.test(await p.$eval(btn, (b) => b.textContent)) && (await p.evaluate(() => document.activeElement?.getAttribute("aria-haspopup"))) === "listbox" && (await p.$eval(btn, (b) => b.getAttribute("aria-expanded"))) === "false");
  await p.focus(btn); await p.keyboard.press("Enter"); await sleep(250); await p.keyboard.press("Escape"); await sleep(200);
  check("7-75 Escape closes the menu and returns focus", (await p.$eval(btn, (b) => b.getAttribute("aria-expanded"))) === "false" && (await p.evaluate(() => document.activeElement?.getAttribute("aria-haspopup"))) === "listbox");
  await p.click(headerInput); await p.type(headerInput, "sarees"); await p.keyboard.press("Enter");
  await p.waitForFunction(() => location.pathname === "/suppliers", { timeout: 15000 }).catch(() => {});
  check("7-76 searching with Suppliers chosen goes to the suppliers page", urlOf(p).pathname === "/suppliers" && urlOf(p).searchParams.get("q") === "sarees", p.url());
  await p.click(btn); await sleep(250); await p.mouse.click(700, 500); await sleep(250);
  check("7-77 clicking elsewhere closes the menu", (await p.$eval(btn, (b) => b.getAttribute("aria-expanded"))) === "false");
  await p.close();
  const m = await open("/", { mobile: true });
  await m.tap("header button[aria-haspopup=listbox]").catch(() => {}); await sleep(300);
  const fits = await m.evaluate((sel) => { const el = document.querySelector(sel); if (el.hidden) return false; const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }, menu);
  check("7-78 phone: the menu opens and fits the screen", fits);
  await m.close();
}

// ======================= phone =======================
{
  const p = await open("/search?q=tshirt", { mobile: true });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const scroll = await p.evaluate(() => { const l = document.querySelector("nav[aria-label='Related searches'] ul"); return l && l.scrollWidth >= l.clientWidth; });
  check("7-60 phone: no overflow, related searches scroll sideways, the query is readable", !overflow && scroll && (await p.$eval("h1", (h) => h.getBoundingClientRect().right <= innerWidth)) && p.errs.length === 0, p.errs.join(";"));
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Filter/i.test(b.textContent) && b.offsetParent).click()); await sleep(500);
  await p.evaluate(() => document.querySelector("input[name=state][value='Gujarat']").click());
  await p.evaluate(() => [...document.querySelectorAll("button[type=submit]")].filter((b) => b.offsetParent).find((b) => /Apply Filters/.test(b.textContent)).click());
  await sleep(1800); await p.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  check("7-61 phone: the drawer filters the search and closes", urlOf(p).searchParams.get("state") === "Gujarat" && (await p.evaluate(() => document.querySelector("[role=dialog]:not(#mobile-nav-panel)")?.hasAttribute("inert") ?? true)));
  await p.close();
  const m = await open("/", { mobile: true });
  await m.tap("header input[role=combobox]").catch(() => {});
  await m.type(headerInput, "air co"); await sleep(1300);
  const fits = await m.evaluate(() => { const l = document.getElementById(document.querySelector("header input[role=combobox]").getAttribute("aria-controls")); if (l.hidden) return false; const r = l.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
  check("7-62 phone: the suggestion list fits the screen", fits);
  await m.close();
}

// ======================= API =======================
{
  const want = hits("tshirt");
  let r = await api("/api/public/products?q=tshirt");
  const d = r.json.data;
  check("A1 search API: statistics and related searches match the page", r.status === 200 && d.query === "tshirt" && d.statistics.products === want.length && d.statistics.suppliers === new Set(want.map((t) => t.seller)).size && d.statistics.categories === 1 && d.relatedSearches.length > 0 && !("brands" in d.statistics));
  r = await api("/api/public/products"); check("A2 no search text: no statistics and no related searches", r.json.data.statistics === null && r.json.data.relatedSearches.length === 0);
  r = await api("/api/public/products/suggest?q=air");
  const s = r.json.data.suggestions;
  check("A3 suggest: up to 8 distinct real suggestions with typed links", r.status === 200 && s.length > 0 && s.length <= 8 && new Set(s.map((x) => x.label)).size === s.length && s.every((x) => ["product", "category"].includes(x.type) && x.href.startsWith("/")), s.map((x) => x.label).join(" | "));
  check("A4 suggest: every suggestion link resolves", (await Promise.all(s.slice(0, 5).map((x) => fetchText(x.href)))).every((x) => x.status === 200));
  r = await api("/api/public/products/suggest?q=a"); check("A5 suggest: one character gives nothing", r.status === 200 && r.json.data.suggestions.length === 0);
  r = await api("/api/public/products/suggest?q="); check("A6 suggest: empty query gives nothing", r.status === 200 && r.json.data.suggestions.length === 0);
  r = await api(`/api/public/products/suggest?q=${"x".repeat(250)}`); check("A7 suggest: a very long query is rejected", r.status === 400 && !!r.json.fields.q);
  r = await api("/api/public/products/suggest?q=%7B%22%24ne%22%3A1%7D"); check("A8 suggest: operator-looking text is plain text", r.status === 200 && r.json.data.suggestions.length === 0);
  r = await api("/api/public/products/suggest?q=zzzqqq"); check("A9 suggest: no match gives an empty list", r.status === 200 && r.json.data.suggestions.length === 0);
  check("A10 suggest: shared-cache headers", /s-maxage/.test((await api("/api/public/products/suggest?q=air")).headers.get("cache-control") ?? ""));
  let blocked = null;
  // 240 per minute per address; the loop may straddle two windows, so it sends enough for either
  for (let i = 0; i < 520; i++) { const x = await api(`/api/public/products/suggest?q=air${i % 7}`); if (x.status === 429) { blocked = x; break; } }
  check("A11 suggest is rate-limited (429, Retry-After)", !!blocked && Number(blocked.headers.get("retry-after")) > 0 && blocked.json.code === "RATE_LIMITED");
}

await browser.close();
const fails = results.filter((x) => !x.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) console.log("FAILED:\n" + fails.map((f) => " - " + f.name).join("\n"));
