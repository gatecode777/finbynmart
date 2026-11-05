import puppeteer, { KnownDevices } from "puppeteer-core";
const BASE = "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });

async function mobile(path) {
  const p = await browser.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.emulate(KnownDevices["iPhone 13"]);
  await p.goto(BASE + path, { waitUntil: "networkidle2" });
  p.errs = errs;
  return p;
}
async function desktop(path, w = 1440, h = 900) {
  const p = await browser.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.setViewport({ width: w, height: h });
  await p.goto(BASE + path, { waitUntil: "networkidle2" });
  p.errs = errs;
  return p;
}
const visible = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== "hidden"; }, sel);
const clickByText = (p, tag, text) => p.evaluate((t, x) => { const el = [...document.querySelectorAll(t)].find((e) => e.textContent.trim().toLowerCase().startsWith(x.toLowerCase()) && e.getBoundingClientRect().width > 0); if (!el) return false; el.click(); return true; }, tag, text);

// ---- T1: mobile menu (touch)
{
  const p = await mobile("/");
  await p.tap("[aria-label='Open menu']"); await sleep(300);
  check("T1 mobile menu opens by touch", await visible(p, "[role=dialog][aria-label='Site navigation']"));
  const focusInside = await p.evaluate(() => document.querySelector("[role=dialog]")?.contains(document.activeElement));
  check("T1 focus moves into menu on open", focusInside);
  for (let i = 0; i < 25; i++) await p.keyboard.press("Tab");
  check("T1 focus stays trapped inside menu after 25 Tabs", await p.evaluate(() => document.querySelector("[role=dialog]")?.contains(document.activeElement)));
  await p.keyboard.press("Escape"); await sleep(300);
  check("T1 Escape closes menu", !(await visible(p, "[role=dialog][aria-label='Site navigation']")));
  check("T1 focus returns to menu button", await p.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Open menu"));
  await p.tap("[aria-label='Open menu']"); await sleep(300);
  await p.tap("[role=dialog] a[href='/categories/apparel-fashion']"); await sleep(1500);
  check("T1 menu link navigates (apparel → /categories/apparel-fashion)", p.url().includes("/categories/apparel-fashion"), p.url());
  await p.tap("[aria-label='Open menu']"); await sleep(300);
  await p.mouse.click(380, 400); await sleep(300);
  check("T1 overlay tap closes menu", !(await visible(p, "[role=dialog][aria-label='Site navigation']")));
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("T1 no horizontal overflow on mobile", ov <= 1, `overflow ${ov}`);
  check("T1 no console errors", p.errs.length === 0, p.errs.join(" | ").slice(0, 150));
  await p.close();
}

// ---- T2: header search (mobile) + hero search (desktop)
{
  const p = await mobile("/");
  await p.tap("header form[role=search] input[type=text]");
  await p.keyboard.type("shirt"); await p.keyboard.press("Enter"); await sleep(1500);
  check("T2 mobile header search submits to /search?q=shirt", /\/search\?.*q=shirt/.test(p.url()), p.url());
  check("T2 search results render", await p.evaluate(() => document.body.innerText.toLowerCase().includes("shirt")));
  await p.close();
  const d = await desktop("/");
  await d.click("main form[role=search] input[type=text]");
  await d.keyboard.type("pipes"); await d.keyboard.press("Enter"); await d.waitForFunction(() => location.search.includes("pipes"), { timeout: 10000 }).catch(() => {});
  check("T2 hero search submits (desktop)", /q=pipes/.test(d.url()), d.url());
  const ids = await d.evaluate(() => { const ids = [...document.querySelectorAll("[id]")].map((e) => e.id); return ids.length - new Set(ids).size; });
  check("T2 no duplicate element ids", ids === 0, `${ids} duplicates`);
  await d.close();
}

// ---- T3: products + suppliers listing filters, drawer, pagination
for (const path of ["/products", "/suppliers"]) {
  const p = await mobile(path);
  check(`T3 ${path} filter button visible on mobile`, await visible(p, "button[aria-controls]:not([aria-controls='mobile-nav-panel']):not([aria-haspopup])"));
  const inertClosed = await p.evaluate(() => document.querySelector("[role=dialog]:not(#mobile-nav-panel)")?.hasAttribute("inert"));
  check(`T3 ${path} closed drawer is inert`, !!inertClosed);
  await p.tap("button[aria-controls]:not([aria-controls='mobile-nav-panel']):not([aria-haspopup])"); await sleep(400);
  check(`T3 ${path} drawer opens`, await visible(p, "[role=dialog]:not(#mobile-nav-panel) form"));
  const input = await p.$("[role=dialog]:not(#mobile-nav-panel) input[type=search]");
  if (input) { await input.tap(); await p.keyboard.type("men"); }
  // The directory filters are checkboxes: choose the first one so Apply has something to submit.
  await p.evaluate(() => document.querySelector("[role=dialog]:not(#mobile-nav-panel) input[type=checkbox]")?.click());
  await clickByText(p, "[role=dialog]:not(#mobile-nav-panel) button", "Apply"); await sleep(1800);
  check(`T3 ${path} Apply filters via drawer updates URL`, p.url().includes("?"), p.url());
  const pag = await p.$("a[href*='page=2']");
  if (pag) {
    const before = p.url();
    await pag.tap(); await sleep(1500);
    check(`T3 ${path} pagination page 2 works`, p.url().includes("page=2") && p.url() !== before, p.url());
  } else check(`T3 ${path} pagination link present`, false, "no page=2 link after filter");
  check(`T3 ${path} no console errors`, p.errs.length === 0, p.errs.join(" | ").slice(0, 150));
  await p.close();
}

// T4 (the old client-side /category page) was replaced by Pages 03 and 04; their filters, drawer, sort and view toggle are covered by detail-test.mjs.

// ---- T5: forms (validation + honest stub)
{
  const p = await mobile("/post-requirement");
  await clickByText(p, "button", "Submit"); await sleep(400);
  const errCount = await p.evaluate(() => document.querySelectorAll("[role=alert], [class*=error]").length);
  check("T5 requirement form shows validation errors when empty", errCount > 0, `${errCount} error nodes`);
  await p.close();
  const s = await mobile("/products/nike-sahara-team-india-fanwear-round-neck-jersey-1163");
  // The quote form opens from the Get Best Quote button.
  await clickByText(s, "button", "Get Best Quote"); await sleep(400);
  const hasForm = await s.evaluate(() => !!document.querySelector("#get-best-quote form"));
  check("T5 product page has inquiry form (opens from Get Best Quote)", hasForm);
  check("T5 product page no console errors", s.errs.length === 0, s.errs.join(" | ").slice(0, 150));
  await s.close();
  const sp = await mobile("/suppliers/shree-textiles");
  const tabs = await sp.evaluate(() => [...document.querySelectorAll("nav[aria-label='Supplier profile'] a")].map((a) => a.getAttribute("href")));
  check("T5 supplier profile tabs present", tabs.length > 0, tabs.join(","));
  if (tabs[0]?.startsWith("#")) {
    const target = tabs[tabs.length - 1];
    await sp.evaluate((t) => document.querySelector(`a[href='${t}']`).click(), target); await sleep(2000);
    check("T5 supplier tab jumps to section", await sp.evaluate((t) => { const el = document.querySelector(t); return !!el && Math.abs(el.getBoundingClientRect().top) < window.innerHeight; }, target));
  }
  await sp.close();
}

// ---- T6: auth forms (no accounts created)
{
  const p = await mobile("/sign-in");
  await clickByText(p, "button", "Sign in"); await sleep(500);
  const errs = await p.evaluate(() => document.querySelectorAll("[role=alert], [class*=error]").length);
  check("T6 sign-in empty submit shows validation", errs > 0, `${errs}`);
  await p.type("input[type=email]", "nobody-responsive-test@example.invalid");
  await p.type("input[type=password]", "wrongpassword1");
  await clickByText(p, "button", "Sign in"); await sleep(2500);
  const msg = await p.evaluate(() => document.body.innerText);
  check("T6 sign-in wrong credentials → real API error shown", /incorrect|unavailable|invalid|too many/i.test(msg));
  check("T6 sign-up and register links present", await p.evaluate(() => !!document.querySelector("a[href^='/register/buyer']") && !!document.querySelector("a[href='/register-supplier']")));
  await p.close();
  const u = await mobile("/sign-up");
  await clickByText(u, "button", "Create"); await sleep(500);
  const e2 = await u.evaluate(() => document.querySelectorAll("[role=alert], [class*=error]").length);
  check("T6 sign-up empty submit shows validation", e2 > 0, `${e2}`);
  await u.close();
}

// ---- T7: scroll slider (mouse)
{
  const d = await desktop("/");
  const before = await d.evaluate(() => document.querySelector("[aria-label='featured products']").scrollLeft);
  await d.click("button[aria-label='Next featured products']"); await sleep(900);
  const after = await d.evaluate(() => document.querySelector("[aria-label='featured products']").scrollLeft);
  check("T7 featured products slider next arrow scrolls", after > before, `${before} → ${after}`);
  const prevEnabled = await d.evaluate(() => !document.querySelector("button[aria-label='Previous featured products']").disabled);
  check("T7 previous arrow enables after scrolling", prevEnabled);
  const sup = await d.evaluate(() => !!document.querySelector("[aria-label='featured suppliers']"));
  check("T7 featured suppliers slider present", sup);
  await d.close();
}

// ---- T8: keyboard reachability of header on desktop
{
  const d = await desktop("/");
  await d.keyboard.press("Tab");
  const skip = await d.evaluate(() => document.activeElement?.className.includes("skip"));
  check("T8 first Tab hits skip link", skip);
  await d.close();
}

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) console.log("FAILED:\n" + fails.map((f) => ` - ${f.name} ${f.detail}`).join("\n"));
