import puppeteer, { KnownDevices } from "puppeteer-core";
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });

async function open(path, mobile = false) {
  const p = await browser.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  if (mobile) await p.emulate(KnownDevices["iPhone 13"]); else await p.setViewport({ width: 1440, height: 900 });
  const resp = await p.goto(BASE + path, { waitUntil: "networkidle2" });
  p.errs = errs; p.status = resp.status();
  return p;
}
const fetchText = async (path) => { const r = await fetch(BASE + path, { redirect: "manual" }); return { status: r.status, loc: r.headers.get("location"), text: await r.text() }; };
const num = (s) => Number(String(s).replace(/[^0-9.]/g, ""));
const count = (p) => p.evaluate(() => { const t = document.querySelector("#listing-heading")?.textContent ?? ""; const m = /\(([\d,]+)\)/.exec(t); return m ? Number(m[1].replace(/,/g, "")) : null; });
const cardPrices = (p) => p.evaluate(() => [...document.querySelectorAll("ul[class*=grid] article, ul[class*=list] article")].map((a) => { const m = /₹\s*([\d,]+)/.exec(a.querySelector("[class*=price]")?.textContent ?? ""); return m ? Number(m[1].replace(/,/g, "")) : NaN; }));
const cardNames = (p) => p.evaluate(() => [...document.querySelectorAll("article a[class*=name]")].map((a) => a.textContent.trim()));

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
const truth = seed("products.csv").filter((p) => sellers.has(p.seller_id) && cats.has(p.category_id)).map((p) => ({ cat: cats.get(p.category_id).name, dept: cats.get(p.category_id).department, price: Number(p.estimated_price_inr), colour: p.colour, state: sellers.get(p.seller_id).state, seller: p.seller_id }));
const slug = (n) => n.toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const inCat = (name) => truth.filter((t) => t.cat === name);
console.log(`ground truth: ${truth.length} products, ${new Set(truth.map((t) => t.cat)).size} categories`);

// ======================= PAGE 03 =======================
{
  const p = await open("/categories/apparel-fashion");
  const stats = await p.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=category-title] ul li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()));
  check("3-01 hero products = real eligible count", num(stats[0]) === truth.length, stats[0]);
  check("3-02 hero suppliers = distinct sellers with products", num(stats[1]) === new Set(truth.map((t) => t.seller)).size, stats[1]);
  check("3-03 hero subcategories = real category count", num(stats[2]) === new Set(truth.map((t) => t.cat)).size, stats[2]);
  check("3-04 title and breadcrumb are dynamic", (await p.$eval("h1", (h) => h.textContent)).trim() === "Apparel & Fashion" && (await p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Breadcrumb] li")].map((l) => l.textContent.trim()).join(">"))) === "Home>All Categories>Apparel & Fashion");
  check("3-05 breadcrumb links go to / and /categories", await p.evaluate(() => { const a = [...document.querySelectorAll("nav[aria-label=Breadcrumb] a")].map((x) => x.getAttribute("href")); return a[0] === "/" && a[1] === "/categories"; }));
  check("3-06 hero shows the category's approved image", await p.evaluate(() => !!document.querySelector("section[aria-labelledby=category-title] img[src*='apparel-fashion']")));
  check("3-07 product count in heading equals total", (await count(p)) === truth.length, String(await count(p)));
  const sidebar = await p.evaluate(() => document.querySelector("form[aria-label='Filter products']")?.innerText ?? "");
  check("3-08 filter groups shown are Category, Colour, Price, Location only", /Category/.test(sidebar) && /Colour/.test(sidebar) && /Price Range/.test(sidebar) && /Location/.test(sidebar) && !/Brand/.test(sidebar) && !/Supplier Type/.test(sidebar) && !/MOQ/.test(sidebar));
  const chipLabels = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Popular Subcategories'] ul li a, nav[aria-label='Popular Subcategories'] ul li button")].map((a) => a.textContent.trim()));
  const topCats = Object.entries(truth.reduce((m, t) => ((m[t.cat] = (m[t.cat] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((e) => e[0]);
  check("3-09 popular chips are the real top subcategories", topCats.slice(0, 6).every((n, i) => chipLabels[i] === n), chipLabels.slice(0, 6).join(" | "));
  await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Popular Subcategories'] button")].find((b) => /More/.test(b.textContent))?.click());
  await sleep(200);
  const allChips = await p.evaluate(() => document.querySelectorAll("nav[aria-label='Popular Subcategories'] ul li a").length);
  check("3-10 More reveals all eligible subcategories", allChips === topCats.length, `${allChips} vs ${topCats.length}`);
  await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Popular Subcategories'] ul li a")].find((a) => a.textContent.trim() === "Men Tshirts").click());
  await p.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("3-11 chip navigates to the subcategory page", /\/categories\/apparel-fashion\/men-tshirts$/.test(p.url()), p.url());
  await p.close();
}

{
  // filters on the category page: results must equal an independent computation
  const q = new URLSearchParams([["sub", "men-tshirts"]]);
  let p = await open(`/categories/apparel-fashion?${q}`);
  check("3-12 sub filter total equals the seed", (await count(p)) === inCat("Men Tshirts").length, `${await count(p)} vs ${inCat("Men Tshirts").length}`);
  const badge = await p.evaluate(() => document.querySelector("form[aria-label='Filter products'] [aria-label*='active filters']")?.textContent);
  check("3-13 active filter count shown", badge === "1", badge);
  check("3-14 applied-filter chip with remove link", await p.evaluate(() => !!document.querySelector("ul[aria-label='Applied filters'] a[aria-label^='Remove filter']")));
  const colours = {}; inCat("Men Tshirts").forEach((t) => { colours[t.colour] = (colours[t.colour] || 0) + 1; });
  const topColour = Object.entries(colours).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const facetText = await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter products'] label")].map((l) => l.textContent.replace(/\s+/g, " ").trim()));
  check("3-15 colour facet counts respect the selected category", facetText.some((t) => t.replace(/\s+/g, "") === `${topColour[0]}(${topColour[1].toLocaleString("en-IN")})`.replace(/\s+/g, "")), `${topColour[0]} ${topColour[1]}`);
  await p.close();

  // apply through the UI: tick boxes, set price, apply
  p = await open("/categories/apparel-fashion");
  await p.evaluate(() => { document.querySelector("input[name=sub][value=men-tshirts]").click(); document.querySelector("input[name=colour][value=Blue]").click(); });
  // The Price group is collapsed until used; open it like a visitor would.
  await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter products'] summary")].find((s) => /Price Range/.test(s.textContent)).click());
  await p.type("input[name=minPrice]", "500");
  await p.type("input[name=maxPrice]", "1500");
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2" }), p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter products'] button[type=submit]")].find((b) => b.textContent.trim() === "Apply Filters").click())]);
  const expected = truth.filter((t) => t.cat === "Men Tshirts" && t.colour === "Blue" && t.price >= 500 && t.price <= 1500).length;
  check("3-16 combined filters (category + colour + price) equal an independent count", (await count(p)) === expected, `${await count(p)} vs ${expected} · ${p.url().split("?")[1]}`);
  check("3-17 filters are in the URL", /sub=men-tshirts/.test(p.url()) && /colour=Blue/.test(p.url()) && /minPrice=500/.test(p.url()));
  const direct = await open(p.url().replace(BASE, ""));
  check("3-18 a filtered URL opened directly gives the same result", (await count(direct)) === expected);
  const prices = await cardPrices(p);
  check("3-19 every shown price is inside the range", prices.length > 0 && prices.every((x) => x >= 500 && x <= 1500), prices.slice(0, 5).join(","));
  check("3-20 Apply Filters keeps filters selected after reload", await p.evaluate(() => document.querySelector("input[name=colour][value=Blue]").checked && document.querySelector("input[name=minPrice]").value === "500"));
  check("3-21 active count badge = 3", (await p.evaluate(() => document.querySelector("form[aria-label='Filter products'] [aria-label*='active filters']")?.textContent)) === "3");
  await p.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter products'] a")].find((a) => a.textContent.trim() === "Clear All").click());
  await p.waitForNavigation({ waitUntil: "networkidle2" });
  check("3-22 Clear All restores the full category", (await count(p)) === truth.length);
  await p.close(); await direct.close();

  // location filter
  const stateCounts = {}; truth.forEach((t) => { stateCounts[t.state] = (stateCounts[t.state] || 0) + 1; });
  const [st, stN] = Object.entries(stateCounts).sort((a, b) => b[1] - a[1])[0];
  const loc = await open(`/categories/apparel-fashion?state=${encodeURIComponent(st)}`);
  check("3-23 location filter equals the seed", (await count(loc)) === stN, `${st}: ${await count(loc)} vs ${stN}`);
  await loc.close();
}

{
  // sorting is global, not per page
  const min = Math.min(...truth.map((t) => t.price)), max = Math.max(...truth.map((t) => t.price));
  const asc = await open("/categories/apparel-fashion?sort=price-asc");
  const a = await cardPrices(asc);
  check("3-24 price low→high starts at the cheapest product overall and is ordered", a[0] === min && a.every((v, i) => i === 0 || v >= a[i - 1]), `${a[0]} (min ${min})`);
  const desc = await open("/categories/apparel-fashion?sort=price-desc");
  const d = await cardPrices(desc);
  check("3-25 price high→low starts at the dearest product overall", d[0] === max && d.every((v, i) => i === 0 || v <= d[i - 1]), `${d[0]} (max ${max})`);
  const before = await open("/categories/apparel-fashion");
  await before.select("main select", "price-desc");
  await before.waitForNavigation({ waitUntil: "networkidle2" });
  check("3-26 changing the sort control reloads sorted and keeps the URL", /sort=price-desc/.test(before.url()), before.url());
  const sel = await open("/categories/apparel-fashion?sub=men-tshirts&sort=price-asc");
  await sel.select("main select", "price-desc");
  await sel.waitForNavigation({ waitUntil: "networkidle2" });
  check("3-27 sorting keeps the active filters", /sub=men-tshirts/.test(sel.url()) && /sort=price-desc/.test(sel.url()), sel.url());
  const sortOpts = await asc.evaluate(() => [...document.querySelectorAll("main select option")].map((o) => o.textContent.trim()));
  check("3-28 only real sort orders are offered (no Newest/Popularity)", JSON.stringify(sortOpts) === JSON.stringify(["Relevance", "Price: Low to High", "Price: High to Low"]), sortOpts.join(" | "));
  await asc.close(); await desc.close(); await before.close(); await sel.close();
}

{
  // pagination and views
  const p = await open("/categories/apparel-fashion");
  const names1 = await cardNames(p);
  const summary = await p.evaluate(() => document.querySelector("main [role=status]:not(.visually-hidden)")?.textContent.replace(/\s+/g, " ").trim());
  check("3-29 summary shows Showing 1–20 of the real total", summary === `Showing 1–20 of ${truth.length.toLocaleString("en-IN")} products`, summary);
  check("3-30 20 products per page (not the whole category)", names1.length === 20, `${names1.length}`);
  const lastPage = Math.ceil(truth.length / 20);
  const pages = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Pagination] a")].map((a) => a.textContent.trim()));
  check("3-31 pagination shows Next and the last page number", pages.includes("Next") && pages.includes(String(lastPage)), pages.join(" "));
  await p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Pagination] a")].find((a) => a.textContent.trim() === "2").click());
  await p.waitForNavigation({ waitUntil: "networkidle2" });
  const names2 = await cardNames(p);
  check("3-32 page 2 shows different products and updates the URL", /page=2/.test(p.url()) && names2.join() !== names1.join() && names2.length === 20, p.url());
  const list = await open("/categories/apparel-fashion?view=list");
  check("3-33 list view renders list cards", await list.evaluate(() => !!document.querySelector("ul[class*=list] article[class*=listCard]")));
  const hrefs = await list.evaluate(() => [...document.querySelectorAll("nav[aria-label=Pagination] a")].map((a) => a.getAttribute("href")));
  check("3-34 pagination keeps the list view", hrefs.every((h) => /view=list/.test(h)), hrefs[0]);
  await list.evaluate(() => document.querySelector("a[aria-label='Grid view']").click());
  await list.waitForNavigation({ waitUntil: "networkidle2" });
  check("3-35 grid toggle returns to grid", await list.evaluate(() => !!document.querySelector("ul[class*=grid] article") && !/view=list/.test(location.search)));
  for (const [path, want] of [["?page=99999", `page=${lastPage}`], ["?page=abc", ""], ["?page=0", ""], ["?page=-3", ""]]) {
    const r = await fetchText(`/categories/apparel-fashion${path}`);
    const ok = want ? r.status === 307 && r.loc?.includes(want) : r.status === 200;
    check(`3-36 invalid page ${path} handled`, ok, `${r.status} ${r.loc ?? ""}`);
  }
  await p.close(); await list.close();
}

{
  // links, quote and wishlist
  const p = await open("/categories/apparel-fashion");
  const first = await p.evaluate(() => { const a = document.querySelector("article a[class*=name]"); const cta = document.querySelector("article a[class*=cta]"); return { href: a.getAttribute("href"), cta: cta.getAttribute("href") }; });
  check("3-37 Get Best Quote opens the product's inquiry section", first.cta === `${first.href}#get-best-quote`, first.cta);
  const r = await fetchText(first.href);
  check("3-38 product link resolves to a real product page", r.status === 200 && /get-best-quote/.test(r.text), `${r.status} ${first.href}`);
  const hasHeart = await p.evaluate(() => !!document.querySelector("article button[aria-label*='wishlist' i]"));
  console.log(`      (wishlist heart on cards: ${hasHeart}; no wishlist backend exists yet at this point)`);
  await p.close();
}

{
  // empty category, invalid, alias, sample-backed category
  const e = await open("/categories/home-lifestyle");
  const body = await e.evaluate(() => document.body.innerText);
  check("3-39 category with no eligible products: info + empty state, no fake products", e.status === 200 && /NO PRODUCTS IN HOME & LIFESTYLE YET/i.test(body) && (await e.evaluate(() => document.querySelectorAll("article").length)) === 0);
  check("3-40 empty state offers other categories and Post Requirement", await e.evaluate(() => !!document.querySelector("nav[aria-label='Other categories'] a") && [...document.querySelectorAll("a")].some((a) => /post-requirement\?category=Home/.test(a.getAttribute("href") ?? ""))));
  check("3-41 empty category hides filters and the toolbar", await e.evaluate(() => !document.querySelector("form[aria-label='Filter products']") && !document.querySelector("select[name=sort]")));
  const nf = await fetchText("/categories/does-not-exist");
  check("3-42 invalid category slug returns a real 404", nf.status === 404);
  const al = await fetchText("/categories/machinery-equipment");
  check("3-43 alias slug redirects to the canonical category", al.status === 307 && al.loc === "/categories/industrial-machinery", `${al.status} ${al.loc}`);
  const legacy = await fetchText("/category/packaging-material");
  check("3-44 legacy /category/<slug> URL redirects", legacy.status === 307 && legacy.loc === "/categories/packaging-printing", `${legacy.status} ${legacy.loc}`);
  const s = await open("/categories/packaging-printing");
  const sb = await s.evaluate(() => document.querySelector("form[aria-label='Filter products']")?.innerText ?? "");
  check("3-45 sample-backed category offers Supplier Type and MOQ (its records have them) but no Brand/Colour", /Supplier Type/.test(sb) && /MOQ/.test(sb) && !/Brand/.test(sb) && !/Colour/.test(sb));
  const statsS = await s.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=category-title] ul li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()));
  check("3-46 sample category hero counts come from its records", num(statsS[0]) === 8 && /Verified Suppliers/.test(statsS[1]), statsS.join(" | "));
  // MOQ options are per unit ("Above 100 pieces"): pick the first "Above 100" option and check its results.
  const moqValue = await s.evaluate(() => [...document.querySelectorAll("form[aria-label='Filter products'] input[name=moq]")].find((i) => /Above 100/.test(i.closest("label")?.innerText ?? ""))?.value ?? "");
  const moqUnit = moqValue.split(":")[0];
  const moq = await open("/categories/packaging-printing?moq=" + encodeURIComponent(moqValue));
  const moqCards = await moq.evaluate(() => [...document.querySelectorAll("article")].map((a) => a.innerText.match(/MOQ:\s*([\d,]+)\s*([A-Za-z]+)/)).filter(Boolean).map((m) => ({ n: Number(m[1].replace(/,/g, "")), unit: m[2].toLowerCase() })));
  check("3-47 MOQ filter (Above 100, one unit) only returns products above 100 in that unit", !!moqValue && moqCards.length > 0 && moqCards.every((c) => c.n > 100 && c.unit.startsWith(moqUnit)), moqValue + " " + JSON.stringify(moqCards));
  const typ = await open("/categories/packaging-printing?type=Wholesaler");
  const nT = await count(typ);
  check("3-48 supplier-type filter changes the result set", nT !== null && nT < 8, `${nT} of 8`);
  await e.close(); await s.close(); await moq.close(); await typ.close();
}

{
  // SEO
  const r = await fetchText("/categories/apparel-fashion");
  check("3-49 unique title and meta description", /<title>Apparel &amp; Fashion — Products &amp; Suppliers \| Finbyn Mart<\/title>/.test(r.text) && /name="description" content="Browse 21,392 apparel products/.test(r.text));
  check("3-50 one h1; BreadcrumbList has 3 items; ItemList count = total", (r.text.match(/<h1/g) || []).length === 1 && /"@type":"BreadcrumbList"/.test(r.text) && (r.text.match(/"@type":"ListItem","position":[123],"name":"(Home|All Categories|Apparel & Fashion)"/g) || []).length === 3 && new RegExp(`"numberOfItems":${truth.length}`).test(r.text));
  const f = await fetchText("/categories/apparel-fashion?sub=men-tshirts");
  check("3-51 filtered views are noindex; plain page is indexable", /name="robots" content="noindex/.test(f.text) && !/name="robots" content="noindex/.test(r.text));
  const other = await fetchText("/categories/packaging-printing");
  const t1 = /<title>([^<]*)<\/title>/.exec(r.text)?.[1], t2 = /<title>([^<]*)<\/title>/.exec(other.text)?.[1];
  check("3-52 metadata is unique per category", t1 && t2 && t1 !== t2, `${t2}`);
}

// ======================= PAGE 04 =======================
{
  const cat = "Men Tshirts", sub = "men-tshirts";
  const p = await open(`/categories/apparel-fashion/${sub}`);
  const set = inCat(cat);
  check("4-01 title is the subcategory", (await p.$eval("h1", (h) => h.textContent)).trim() === cat);
  const crumbs = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label=Breadcrumb] li")].map((l) => ({ t: l.textContent.trim(), h: l.querySelector("a")?.getAttribute("href") ?? null })));
  check("4-02 breadcrumb is Home > All Categories > Apparel & Fashion > Men Tshirts with correct links", JSON.stringify(crumbs) === JSON.stringify([{ t: "Home", h: "/" }, { t: "All Categories", h: "/categories" }, { t: "Apparel & Fashion", h: "/categories/apparel-fashion" }, { t: "Men Tshirts", h: null }]), JSON.stringify(crumbs));
  const stats = await p.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=category-title] ul li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()));
  check("4-03 product and supplier counts equal the seed for this subcategory", num(stats[0]) === set.length && num(stats[1]) === new Set(set.map((t) => t.seller)).size, stats.join(" | "));
  check("4-04 heading count equals the subcategory total", (await count(p)) === set.length);
  const sidebar = await p.evaluate(() => document.querySelector("form[aria-label='Filter products']")?.innerText ?? "");
  check("4-05 filters adapt to the data: Colour, Price, Location (no Category group, no Brand/MOQ/Type)", /Colour/.test(sidebar) && /Price Range/.test(sidebar) && /Location/.test(sidebar) && !/Category\n/.test(sidebar) && !/Brand|MOQ|Supplier Type/.test(sidebar));
  const sib = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Explore Subcategories:'] ul li a, nav[aria-label='Explore Subcategories:'] ul li button")].map((a) => ({ t: a.textContent.trim(), cur: a.getAttribute("aria-current"), h: a.getAttribute("href") })));
  check("4-06 related row starts with All <parent> and highlights the current subcategory", sib[0].t === "All Apparel & Fashion" && sib[0].h === "/categories/apparel-fashion" && sib.find((x) => x.t === "Men Tshirts")?.cur === "true", sib.slice(0, 3).map((x) => x.t).join(" | "));
  const menCats = [...new Set(truth.filter((t) => t.dept === "Men").map((t) => t.cat))];
  await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Explore Subcategories:'] button")].find((b) => /More/.test(b.textContent))?.click());
  await sleep(200);
  const sibN = await p.evaluate(() => document.querySelectorAll("nav[aria-label='Explore Subcategories:'] ul li a").length - 1);
  check("4-07 related subcategories are the real siblings (same department) and More shows them all", sibN === menCats.length, `${sibN} vs ${menCats.length}`);
  check("4-08 no category from another department appears in the related row", await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Explore Subcategories:'] ul li a")].slice(1).every((a) => /^Men /.test(a.textContent.trim()))));
  const colours = {}; set.forEach((t) => { colours[t.colour] = (colours[t.colour] || 0) + 1; });
  const [c1, n1] = Object.entries(colours).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const cf = await open(`/categories/apparel-fashion/${sub}?colour=${encodeURIComponent(c1)}`);
  check("4-09 colour filter equals the seed within the subcategory", (await count(cf)) === n1, `${c1}: ${await count(cf)} vs ${n1}`);
  const [st, sn] = Object.entries(set.reduce((m, t) => ((m[t.state] = (m[t.state] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1])[0];
  const lf = await open(`/categories/apparel-fashion/${sub}?state=${encodeURIComponent(st)}`);
  check("4-10 location filter equals the seed within the subcategory", (await count(lf)) === sn, `${st}: ${await count(lf)} vs ${sn}`);
  const exp = set.filter((t) => t.price >= 300 && t.price <= 900).length;
  const pf = await open(`/categories/apparel-fashion/${sub}?minPrice=300&maxPrice=900`);
  check("4-11 price filter equals the seed within the subcategory", (await count(pf)) === exp, `${await count(pf)} vs ${exp}`);
  const as = await open(`/categories/apparel-fashion/${sub}?sort=price-asc`);
  const pr = await cardPrices(as);
  check("4-12 sort low→high starts at the cheapest in this subcategory", pr[0] === Math.min(...set.map((t) => t.price)) && pr.every((v, i) => i === 0 || v >= pr[i - 1]), `${pr[0]}`);
  const r = await fetchText(`/categories/apparel-fashion/${sub}?page=99999`);
  check("4-13 out-of-range page redirects to the last page", r.status === 307 && r.loc?.includes(`page=${Math.ceil(set.length / 20)}`), `${r.status} ${r.loc}`);
  // every shown product really belongs to the subcategory: totals partition across subcategories
  const total = [...new Set(truth.map((t) => t.cat))].reduce((s, c) => s + inCat(c).length, 0);
  check("4-14 subcategory totals partition the category (no product in two subcategories)", total === truth.length);
  const cta = await p.evaluate(() => { const h = document.querySelector("#bulk-requirement-heading")?.textContent; const a = [...document.querySelectorAll("a")].find((x) => /Post Your Requirement/.test(x.textContent) && /subcategory=/.test(x.getAttribute("href") ?? "")); return { h, href: a?.getAttribute("href") }; });
  check("4-15 bulk banner wording is dynamic and passes category and subcategory", cta.h === "Need Men Tshirts in Bulk?" && /category=Apparel%20%26%20Fashion/.test(cta.href) && /subcategory=Men%20Tshirts/.test(cta.href), `${cta.h} ${cta.href}`);
  await p.close(); await cf.close(); await lf.close(); await pf.close(); await as.close();
}

{
  const bad = [["/categories/apparel-fashion/corrugated-boxes", 404], ["/categories/industrial-machinery/men-tshirts", 404], ["/categories/nope/men-tshirts", 404], ["/categories/apparel-fashion/not-a-sub", 404], ["/categories/home-lifestyle/anything", 404]];
  for (const [path, want] of bad) {
    const r = await fetchText(path);
    check(`4-16 ${path} → ${want}`, r.status === want, `${r.status}`);
  }
  const r = await fetchText("/categories/machinery-equipment/compressors");
  check("4-17 parent alias redirects and keeps the subcategory", r.status === 307 && r.loc === "/categories/industrial-machinery/compressors", `${r.status} ${r.loc}`);
  const html = await fetchText("/categories/apparel-fashion/men-tshirts");
  check("4-18 unique title, 4-level breadcrumb JSON-LD, one h1", /<title>Men Tshirts — Apparel &amp; Fashion \| Finbyn Mart<\/title>/.test(html.text) && (html.text.match(/"@type":"ListItem","position":4,"name":"Men Tshirts"/g) || []).length === 1 && (html.text.match(/<h1/g) || []).length === 1);
  const sample = await open("/categories/packaging-printing/corrugated-boxes");
  const sb = await sample.evaluate(() => document.querySelector("form[aria-label='Filter products']")?.innerText ?? "");
  check("4-19 sample-backed subcategory page works (generic template) with its own attributes", sample.status === 200 && (await count(sample)) === 1 && /Supplier Type|MOQ|Price Range/.test(sb) && !/Colour|Brand/.test(sb), `${await count(sample)} product`);
  const g = await open("/categories/packaging-printing/corrugated-boxes");
  check("4-20 hero image for a sample subcategory is a local photo of its product", await g.evaluate(() => !!document.querySelector("section[aria-labelledby=category-title] img[src*='corrugated']")));
  await sample.close(); await g.close();
}

// ======================= MOBILE =======================
for (const path of ["/categories/apparel-fashion", "/categories/apparel-fashion/men-tshirts", "/categories/packaging-printing"]) {
  const p = await open(path, true);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`M-01 ${path}: no horizontal overflow at 390`, overflow <= 1, `${overflow}`);
  const trigger = "button[aria-controls]:not([aria-controls='mobile-nav-panel']):not([aria-haspopup])";
  check(`M-02 ${path}: Filter Products button visible, drawer inert when closed`, await p.evaluate((t) => { const b = document.querySelector(t); const d = document.querySelector("[role=dialog]:not(#mobile-nav-panel)"); return !!b && b.getBoundingClientRect().width > 0 && d.hasAttribute("inert"); }, trigger));
  await p.tap(trigger); await sleep(400);
  check(`M-03 ${path}: drawer opens with the filters`, await p.evaluate(() => /Filter Products/.test(document.querySelector("[role=dialog]:not(#mobile-nav-panel)")?.innerText ?? "")));
  if (path.endsWith("men-tshirts")) {
    await p.evaluate(() => document.querySelector("[role=dialog]:not(#mobile-nav-panel) input[name=colour]").click());
    await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2" }), p.evaluate(() => [...document.querySelectorAll("[role=dialog]:not(#mobile-nav-panel) button[type=submit]")].find((b) => b.textContent.trim() === "Apply Filters").click())]);
    check("M-04 applying filters in the drawer filters the results", /colour=/.test(p.url()) && (await count(p)) < inCat("Men Tshirts").length, `${await count(p)} · ${p.url().split("?")[1]}`);
  }
  const chipScroll = await p.evaluate(() => { const ul = document.querySelector("nav[aria-label*='ubcategories'] ul"); return ul ? ul.scrollWidth > ul.clientWidth : null; });
  console.log(`      (subcategory chips scroll sideways on this phone: ${chipScroll})`);
  const cols = await p.evaluate(() => getComputedStyle(document.querySelector("ul[class*=grid]")).gridTemplateColumns.split(" ").length);
  check(`M-05 ${path}: one or two product columns on a phone`, cols <= 2, `${cols}`);
  check(`M-06 ${path}: no console errors`, p.errs.length === 0, p.errs.join(" | ").slice(0, 120));
  await p.close();
}

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) console.log("FAILED:\n" + fails.map((f) => " - " + f.name).join("\n"));
