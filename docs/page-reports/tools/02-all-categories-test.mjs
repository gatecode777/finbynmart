import puppeteer, { KnownDevices } from "puppeteer-core";
import fs from "node:fs";

const BASE = "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });

async function open(path, mobile = false, hook) {
  const p = await browser.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  if (hook) await hook(p);
  if (mobile) await p.emulate(KnownDevices["iPhone 13"]); else await p.setViewport({ width: 1440, height: 900 });
  await p.goto(BASE + path, { waitUntil: "networkidle2" });
  p.errs = errs;
  return p;
}
const cards = (p) => p.evaluate(() => [...document.querySelectorAll("main ul li a[aria-label]")].map((a) => a.getAttribute("aria-label")));
const heading = (p) => p.evaluate(() => document.querySelector("#category-grid-heading")?.textContent.replace(/\s+/g, " ").trim());
const num = (s) => Number(String(s).replace(/[^0-9]/g, ""));
// "Apparel & Fashion, 21,392 products. Browse subcategories" -> 21392 (counts contain commas)
const countOf = (label) => Number(/,\s*([\d,]+)\s+products?/.exec(label)[1].replace(/,/g, ""));

// ---------- Independent ground truth (not read from the page's own code path)
function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur.replace(/\r$/, "")); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const seed = (f) => { const [h, ...r] = parseCsv(fs.readFileSync(`R:/indiamartref/db/seed/${f}`, "utf8")).filter((x) => x.length > 1); return r.map((x) => Object.fromEntries(h.map((k, i) => [k, x[i]]))); };
const activeSellers = new Set(seed("sellers.csv").filter((s) => s.status === "Active").map((s) => s.id));
const cats = new Map(seed("categories.csv").map((c) => [c.id, c]));
const truth = seed("products.csv").filter((p) => activeSellers.has(p.seller_id) && cats.has(p.category_id));
const truthByDept = {}; const truthByCat = {};
for (const p of truth) { const c = cats.get(p.category_id); truthByDept[c.department] = (truthByDept[c.department] || 0) + 1; truthByCat[c.name] = (truthByCat[c.name] || 0) + 1; }
console.log(`ground truth: ${truth.length} eligible products, ${Object.keys(truthByDept).length} departments, ${Object.keys(truthByCat).length} categories`);

// ---------- 1. Data and counts
{
  const p = await open("/categories");
  const stats = await p.evaluate(() => [...document.querySelectorAll("section[aria-labelledby=categories-heading] ul li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()));
  const mainCount = await p.evaluate(() => document.querySelectorAll("main ul li a[aria-label]").length);
  check("1a main category cards rendered from data", mainCount === 6, `${mainCount} cards`);
  check("1b hero shows main-category count equal to cards", stats[0]?.startsWith(String(mainCount)), stats[0]);
  check("1c hero subcategory count = departments + categories from the seed", num(stats[1]) === Object.keys(truthByDept).length + Object.keys(truthByCat).length, `${stats[1]} vs ${Object.keys(truthByDept).length + Object.keys(truthByCat).length}`);
  const list = await cards(p);
  const apparel = list.find((l) => l.startsWith("Apparel & Fashion"));
  check("1d Apparel count equals independently computed eligible products", countOf(apparel) === truth.length, `${apparel} vs ${truth.length}`);
  // each non-apparel card must equal the product listings shown on its destination page
  for (const [slug, label] of [["industrial-machinery", "Industrial Machinery"], ["electrical-electronics", "Electrical & Electronics"], ["packaging-material", "Packaging & Printing"], ["construction-real-estate", "Construction & Real Estate"], ["health-pharma", "Health & Pharma"]]) {
    const cardLabel = list.find((l) => l.startsWith(label));
    const q = await open(`/categories/${slug === "packaging-material" ? "packaging-printing" : slug}`);
    const dest = await q.evaluate(() => document.body.innerText);
    const m = /(\d[\d,]*)\s*\n?\s*Products\b/i.exec(dest);
    check(`1e ${label}: card count equals its page's listings`, m && countOf(cardLabel) === Number(m[1].replace(/,/g, "")), `${cardLabel} vs ${m?.[1]}`);
    await q.close();
  }
  const total = num(stats[2]);
  const sum = (await cards(p)).reduce((s, l) => s + countOf(l), 0);
  check("1f product total equals the sum of main categories (no double counting)", total === sum, `${total} vs ${sum}`);
  const hidden = ["Home & Lifestyle", "Food & Beverages", "Agriculture", "Chemicals & Dyes"];
  const shownNames = list.map((l) => l.split(",")[0]);
  check("1g categories without eligible products are not discoverable", hidden.every((h) => !shownNames.includes(h)), hidden.join(", "));
  const sidebarText = await p.evaluate(() => document.querySelector("nav[aria-label='Browse categories']").innerText);
  check("1h sidebar lists the same discoverable categories", hidden.every((h) => !sidebarText.includes(h)) && sidebarText.includes("Apparel & Fashion"));
  // department / category truth
  const q2 = await open("/categories?c=apparel-fashion");
  const depts = await cards(q2);
  check("1i departments come from data with true counts", depts.length === Object.keys(truthByDept).length && depts.every((l) => { const d = l.split(" Apparel")[0]; return countOf(l) === truthByDept[d]; }), depts.join(" | ").slice(0, 120));
  const q3 = await open("/categories?c=apparel-fashion/men");
  const menCards = await cards(q3);
  const menTruth = Object.entries(truthByCat).filter(([n]) => cats && [...cats.values()].find((c) => c.name === n)?.department === "Men");
  check("1j Men categories match the seed (names and counts)", menCards.slice(0, 15).every((l) => truthByCat[l.split(",")[0]] === countOf(l)) && (await heading(q3)).includes(`(${menTruth.length})`), await heading(q3));
  await p.close(); await q2.close(); await q3.close();
}

// ---------- 2. Search
{
  const p = await open("/categories");
  await p.click("input[type=search]");
  await p.keyboard.type("tshirt");
  await sleep(500);
  const r = await cards(p);
  const expected = Object.keys(truthByCat).filter((n) => n.toLowerCase().replace(/-/g, "").includes("tshirt")).length;
  check("2a typing filters live (debounced) and matches the seed", r.length > 0 && r.length === expected && r.every((l) => /tshirt/i.test(l)), `${r.length} vs ${expected}`);
  check("2b heading reflects the search", /Results for/.test(await heading(p)), await heading(p));
  const url = p.url();
  check("2c search is mirrored in the URL", /q=tshirt/.test(url), url);
  await p.click("input[type=search]", { clickCount: 3 });
  await p.keyboard.type("machinery");
  await p.keyboard.press("Enter");
  await sleep(100);
  const r2 = await cards(p);
  check("2d Enter submits immediately and finds Industrial Machinery", r2.some((l) => l.startsWith("Industrial Machinery")), r2.join(" | "));
  await p.click("input[type=search]", { clickCount: 3 });
  await p.keyboard.type("zzzzqq");
  await sleep(500);
  const empty = await p.evaluate(() => /no categories match/i.test(document.body.innerText));
  check("2e no-results state", empty);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Clear search")?.click());
  await sleep(300);
  check("2f clearing restores all categories", (await cards(p)).length === 6 && (await p.$eval("input[type=search]", (i) => i.value)) === "");
  await p.type("input[type=search]", "a");
  await p.click("button[aria-label='Clear search']");
  check("2g clear (x) button empties the field", (await p.$eval("input[type=search]", (i) => i.value)) === "");
  const noSvc = await open("/categories?q=packag");
  check("2h server renders a shared ?q= link", (await cards(noSvc)).some((l) => l.startsWith("Packaging")), (await cards(noSvc)).join(" | "));
  await p.close(); await noSvc.close();
}

// ---------- 3. Sidebar and navigation
{
  const p = await open("/categories");
  await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Browse categories'] a")].find((a) => a.textContent.includes("Apparel & Fashion")).click());
  await sleep(300);
  check("3a clicking a parent shows its children", (await heading(p)).startsWith("Apparel & Fashion (5)"), await heading(p));
  const active = await p.evaluate(() => document.querySelector("nav[aria-label='Browse categories'] [aria-current]")?.textContent);
  check("3b active category is highlighted", /Apparel & Fashion/.test(active), active);
  const exp = await p.evaluate(() => document.querySelector("nav[aria-label='Browse categories'] button[aria-expanded]")?.getAttribute("aria-expanded"));
  check("3c parent expands to reveal child categories", exp === "true" && (await p.evaluate(() => document.querySelectorAll("nav[aria-label='Browse categories'] ul ul li").length)) === 5);
  await p.click("nav[aria-label='Browse categories'] button[aria-expanded]");
  check("3d toggle collapses", (await p.evaluate(() => document.querySelectorAll("nav[aria-label='Browse categories'] ul ul li").length)) === 0);
  await p.click("nav[aria-label='Browse categories'] button[aria-expanded]");
  await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Browse categories'] ul ul a")].find((a) => a.textContent.includes("Men Apparel")).click());
  await sleep(300);
  const n = await cards(p);
  check("3e child selection shows its categories, first batch of 15", n.length === 16 || n.length === 15, `${n.length} links`);
  const tile = await p.$("button[class*=viewAllTile]");
  check("3f View All tile is present and functional", !!tile);
  await tile.click(); await sleep(200);
  const n2 = await cards(p);
  const menCount = [...cats.values()].filter((c) => c.department === "Men").length;
  check("3g View All loads the rest", n2.length === menCount, `${n2.length} vs ${menCount}`);
  check("3h View-all-products link targets the real listing", await p.evaluate(() => [...document.querySelectorAll("main a")].some((a) => a.getAttribute("href") === "/products?department=Men")));
  // leaf card navigates to a filtered product list
  await p.evaluate(() => [...document.querySelectorAll("main ul li a")].find((a) => /Men Tshirts/.test(a.getAttribute("aria-label")))?.click());
  await p.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("3i category card opens its subcategory page (Page 04)", /\/categories\/apparel-fashion\/men-tshirts$/.test(p.url()), p.url());
  const shown = await p.evaluate(() => document.querySelector("#listing-heading")?.textContent.match(/\(([\d,]+)\)/)?.[1]);
  check("3j listing count equals the card count", num(shown) === truthByCat["Men Tshirts"], `${shown} vs ${truthByCat["Men Tshirts"]}`);
  const q = await open("/categories");
  await q.evaluate(() => [...document.querySelectorAll("ul[class*=grid] li a")].find((a) => a.getAttribute("aria-label").startsWith("Packaging"))?.click());
  await q.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("3k main category card opens its category page", /\/categories\/packaging-printing$/.test(q.url()), q.url());
  const bad = await open("/categories?c=bogus");
  check("3l invalid ?c= falls back to All Categories", (await heading(bad)).startsWith("All Categories (6)"), await heading(bad));
  const leaf = await open("/categories?c=apparel-fashion/men/men-tshirts");
  check("3m a leaf in ?c= falls back safely", (await heading(leaf)).startsWith("All Categories"), await heading(leaf));
  const sorted = await open("/categories");
  const before = await cards(sorted);
  await sorted.select("main select", "name");
  await sleep(200);
  const after = await cards(sorted);
  check("3n sort A–Z reorders by name", JSON.stringify(after.map((l) => l.split(",")[0])) === JSON.stringify([...after.map((l) => l.split(",")[0])].sort((a, b) => a.localeCompare(b))) && JSON.stringify(before) !== JSON.stringify(after));
  const hrefOk = await p.evaluate(() => true);
  await p.close(); await q.close(); await bad.close(); await leaf.close(); await sorted.close();
}

// ---------- 4. Image fallback, keyboard, SEO
{
  const p = await open("/categories?c=apparel-fashion", false, async (page) => {
    await page.setRequestInterception(true);
    page.on("request", (req) => (req.url().includes("myntassets") ? req.abort() : req.continue()));
  });
  await sleep(1200);
  const fallbacks = await p.evaluate(() => document.querySelectorAll("main [role=img]").length);
  check("4a failed remote images fall back to the branded tile", fallbacks >= 5, `${fallbacks} fallback tiles`);
  const kb = await open("/categories");
  await kb.keyboard.press("Tab");
  let reachedSearch = false;
  for (let i = 0; i < 40 && !reachedSearch; i++) { await kb.keyboard.press("Tab"); reachedSearch = await kb.evaluate(() => document.activeElement?.type === "search"); }
  check("4b search input reachable by keyboard", reachedSearch);
  let reachedCard = false;
  for (let i = 0; i < 30 && !reachedCard; i++) { await kb.keyboard.press("Tab"); reachedCard = await kb.evaluate(() => /Apparel/.test(document.activeElement?.getAttribute?.("aria-label") ?? "")); }
  check("4c category cards reachable by keyboard", reachedCard);
  const html = await (await fetch(BASE + "/categories")).text();
  check("4d unique title and meta description", /<title>All Categories \| Finbyn Mart<\/title>/.test(html) && /name="description" content="Browse every product category/.test(html));
  check("4e one h1", (html.match(/<h1/g) || []).length === 1);
  check("4f breadcrumb JSON-LD present", /"@type":"BreadcrumbList"/.test(html));
  const viewHtml = await (await fetch(BASE + "/categories?c=apparel-fashion/men")).text();
  check("4g selected-category view is noindex (no duplicate metadata)", /name="robots" content="noindex/.test(viewHtml));
  check("4h plain /categories is indexable", !/name="robots" content="noindex/.test(html));
  check("4i internal links to category pages in the server HTML", ["packaging-printing", "industrial-machinery", "electrical-electronics", "construction-real-estate", "health-pharma"].every((s) => html.includes(`href="/categories/${s}"`)) && html.includes('href="/categories?c=apparel-fashion"'));
  const canon = /rel="canonical"/.test(html);
  console.log(`      (canonical tag present: ${canon}; only emitted when NEXT_PUBLIC_SITE_URL or a Vercel production URL is configured)`);
  await p.close(); await kb.close();
}

// ---------- 5. Mobile
{
  const p = await open("/categories", true);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check("5a no horizontal overflow at 390", overflow <= 1, `${overflow}`);
  const searchW = await p.evaluate(() => document.querySelector("main form[role=search], form[role=search][class*=search]")?.getBoundingClientRect().width);
  check("5b category search fits the viewport", searchW > 0 && searchW <= 390, `${Math.round(searchW)}px`);
  const trigger = "button[aria-controls]:not([aria-controls='mobile-nav-panel']):not([aria-haspopup])";
  check("5c Browse Categories button visible", await p.evaluate((s) => !!document.querySelector(s) && document.querySelector(s).getBoundingClientRect().width > 0, trigger));
  check("5d closed drawer is inert", await p.evaluate(() => document.querySelector("[role=dialog]:not(#mobile-nav-panel)")?.hasAttribute("inert")));
  await p.tap(trigger); await sleep(400);
  check("5e drawer opens with the category list", await p.evaluate(() => document.querySelector("[role=dialog]:not(#mobile-nav-panel)")?.innerText.includes("All Categories")));
  await p.evaluate(() => [...document.querySelectorAll("[role=dialog]:not(#mobile-nav-panel) a")].find((a) => a.textContent.includes("Apparel & Fashion")).click());
  await sleep(500);
  check("5f choosing a category closes the drawer and updates the grid", (await heading(p)).startsWith("Apparel & Fashion (5)") && !(await p.evaluate(() => document.querySelector("[role=dialog]:not(#mobile-nav-panel)") && !document.querySelector("[role=dialog]:not(#mobile-nav-panel)").hasAttribute("inert"))), await heading(p));
  await p.tap(trigger); await sleep(300);
  await p.keyboard.press("Escape"); await sleep(300);
  check("5g Escape closes the drawer", await p.evaluate(() => document.querySelector("[role=dialog]:not(#mobile-nav-panel)")?.hasAttribute("inert")));
  const cols = await p.evaluate(() => getComputedStyle(document.querySelector("main ul[class*=grid]")).gridTemplateColumns.split(" ").length);
  check("5h two-column grid on phones", cols === 2, `${cols}`);
  check("5i no console errors", p.errs.length === 0, p.errs.join(" | ").slice(0, 160));
  await p.close();
}

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) console.log("FAILED:\n" + fails.map((f) => " - " + f.name).join("\n"));
