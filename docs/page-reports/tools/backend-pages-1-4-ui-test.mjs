import fs from "node:fs";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

const require = createRequire("R:/indiamartref/");
const { MongoClient } = require("mongodb");
const BASE = "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = Object.fromEntries(fs.readFileSync("R:/indiamartref/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const mongo = await new MongoClient(env.MONGODB_URI).connect();
const db = mongo.db("finbynmart_test");

// A signed-in buyer: register through the real API and reuse the session cookie in the browser.
const stamp = Date.now();
const reg = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "buyer", name: "UI Tester", email: `ui-${stamp}@example.test`, password: "test-password-9" }) });
const cookie = (reg.headers.getSetCookie?.() ?? []).map((l) => l.split(";")[0]).find((c) => c.startsWith("finbyn_session="));
const token = cookie?.split("=")[1];
const user = await db.collection("users").findOne({ email: `ui-${stamp}@example.test` });

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
async function page(path, signedIn) {
  // Each page gets its own cookie jar, so a signed-out page is really signed out.
  const context = await browser.createBrowserContext();
  const p = await context.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  if (signedIn) await p.setCookie({ name: "finbyn_session", value: token, url: BASE });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(BASE + path, { waitUntil: "networkidle2" });
  p.errs = errs;
  return p;
}
const fill = async (p, label, value) => { const el = await p.evaluateHandle((l) => [...document.querySelectorAll("label")].find((x) => x.textContent.trim().startsWith(l))?.querySelector("input,textarea") ?? document.querySelector(`input[placeholder^="${l}"]`), label); await el.asElement().type(value); };
const clickButton = (p, text) => p.evaluate((t) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(t))?.click(), text);

check("00 signed-in session created for the browser tests", !!token && !!user);

// ---------- requirement form (post-requirement page, with category context)
{
  // Count before, so the checks also hold when the throwaway database already holds rows from an earlier run.
  const reqBefore = await db.collection("requirements").countDocuments({ city: "Jaipur" });
  const out = await page("/post-requirement?category=Apparel%20%26%20Fashion&subcategory=Men%20Tshirts&product=Men%20Tshirts", false);
  const prefilled = await out.$eval("main input[placeholder^='Enter product']", (i) => i.value);
  check("F1 product field is prefilled from the page link", prefilled === "Men Tshirts", prefilled);
  await out.type("input[placeholder='Quantity']", "120");
  await out.type("input[placeholder='Enter your city']", "Jaipur");
  await clickButton(out, "Submit Requirement"); await sleep(1200);
  const msg = await out.evaluate(() => document.querySelector("form [role=status]")?.textContent ?? "");
  check("F2 signed-out visitor is told to sign in (no fake success) and given links", /sign in/i.test(msg) && !/submitted/i.test(msg) && (await out.evaluate(() => !!document.querySelector("form a[href='/sign-in']"))), msg);
  check("F3 nothing was stored for the signed-out attempt", (await db.collection("requirements").countDocuments({ city: "Jaipur" })) === reqBefore);
  await out.close();

  const inn = await page("/post-requirement?category=Apparel%20%26%20Fashion&subcategory=Men%20Tshirts&product=Men%20Tshirts", true);
  await inn.type("input[placeholder='Quantity']", "120");
  await inn.type("input[placeholder='Enter your city']", "Jaipur");
  await clickButton(inn, "Submit Requirement"); await sleep(1500);
  const ok = await inn.evaluate(() => document.querySelector("form [role=status]")?.textContent ?? "");
  const doc = await db.collection("requirements").findOne({ userId: user._id, city: "Jaipur" });
  check("F4 signed-in submit shows success only after the server stored it", /submitted/i.test(ok) && !!doc, ok);
  check("F5 stored with the category and subcategory from the link", doc?.category === "Apparel & Fashion" && doc?.subcategory === "Men Tshirts" && doc?.quantity === 120 && doc?.product === "Men Tshirts");
  await inn.close();
}

// ---------- product page "Get Best Quote" (the form opens from the button; the quantity selector feeds it)
{
  const qty = "input[inputmode=numeric]";
  const inqBefore = await db.collection("inquiries").countDocuments({ productKey: "1163", quantity: 40 });
  const anon = await page("/products/nike-sahara-team-india-fanwear-round-neck-jersey-1163", false);
  await clickButton(anon, "Get Best Quote"); await sleep(300);
  await anon.click(qty, { clickCount: 3 }); await anon.type(qty, "40");
  await clickButton(anon, "Send Quote Request"); await sleep(1200);
  const m = await anon.evaluate(() => document.querySelector("#get-best-quote")?.textContent ?? "");
  check("Q1 signed-out quote request asks to sign in and stores nothing", /sign in/i.test(m) && (await db.collection("inquiries").countDocuments({ productKey: "1163", quantity: 40 })) === inqBefore, m.slice(0, 80));
  await anon.close();

  const p = await page("/products/nike-sahara-team-india-fanwear-round-neck-jersey-1163", true);
  await clickButton(p, "Get Best Quote"); await sleep(300);
  await p.click(qty, { clickCount: 3 }); await p.type(qty, "0");
  await clickButton(p, "Send Quote Request"); await sleep(400);
  check("Q2 a quantity of 0 is rejected in the browser before any request", await p.evaluate(() => /at least 1|whole number/i.test(document.body.innerText)));
  await p.click(qty, { clickCount: 3 }); await p.type(qty, "40");
  await clickButton(p, "Send Quote Request"); await sleep(1500);
  const done = await p.evaluate(() => document.querySelector("#get-best-quote [role=status]")?.textContent ?? "");
  const inq = await db.collection("inquiries").findOne({ buyerId: user._id, productKey: "1163", quantity: 40 });
  check("Q3 signed-in quote request is stored for this product and its real supplier", /has been sent/.test(done) && !!inq && inq.unit === "Piece" && !!inq.supplierKey, `${inq?.supplierKey}`);
  await p.close();
}

// ---------- wishlist heart + whole-card click on a listing page
{
  const anon = await page("/categories/apparel-fashion/men-tshirts", false);
  await anon.evaluate(() => document.querySelector("article button[aria-label^='Save']").click());
  await anon.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("H1 a signed-out visitor clicking the heart is sent to sign in", /\/sign-in/.test(anon.url()), anon.url());
  await anon.close();

  const p = await page("/categories/apparel-fashion/men-tshirts", true);
  await sleep(500);
  const first = await p.evaluate(() => { const a = document.querySelector("article"); const heart = a.querySelector("button[aria-label^='Save'], button[aria-label^='Remove']"); return { label: heart.getAttribute("aria-label"), pressed: heart.getAttribute("aria-pressed"), href: a.querySelector("a[class*=name]").getAttribute("href") }; });
  const key = first.href.match(/-(\d+)$/)[1];
  check("H2 an unsaved product shows an unpressed heart", first.pressed === "false", first.label);
  await p.evaluate(() => document.querySelector("article button[aria-label^='Save']").click());
  await sleep(1200);
  check("H3 after the server confirms, the heart is pressed and the entry is stored", (await p.evaluate(() => document.querySelector("article button[aria-pressed]").getAttribute("aria-pressed"))) === "true" && (await db.collection("wishlists").countDocuments({ userId: user._id, productKey: key })) === 1);
  check("H4 clicking the heart did not navigate away", /men-tshirts/.test(p.url()) && !/\/products\//.test(p.url()));
  await p.reload({ waitUntil: "networkidle2" }); await sleep(600);
  check("H5 the saved state survives a reload (read back from the server)", (await p.evaluate(() => document.querySelector("article button[aria-pressed]").getAttribute("aria-pressed"))) === "true");
  await p.evaluate(() => document.querySelector("article button[aria-pressed='true']").click());
  await sleep(1200);
  check("H6 un-saving removes it from the database", (await db.collection("wishlists").countDocuments({ userId: user._id, productKey: key })) === 0);

  // whole-card click: click the product image area (not a link) and expect the product page
  const box = await p.evaluate(() => { const r = document.querySelector("article img").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.mouse.click(box.x, box.y);
  await p.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("C1 clicking the card image (not a link) opens the product page", /\/products\//.test(p.url()), p.url());
  await p.goBack({ waitUntil: "networkidle2" });
  const body = await p.evaluate(() => { const r = document.querySelector("article [class*=body]").getBoundingClientRect(); return { x: r.x + r.width - 8, y: r.y + 6 }; });
  await p.mouse.click(body.x, body.y);
  await p.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("C2 clicking empty space inside the card text area also opens the product", /\/products\//.test(p.url()), p.url());
  await p.goBack({ waitUntil: "networkidle2" });
  await p.evaluate(() => document.querySelector("article a[class*=supplierName]").click());
  await p.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("C3 the supplier link inside the card still goes to the supplier", /\/suppliers\//.test(p.url()), p.url());
  await p.goBack({ waitUntil: "networkidle2" });
  await p.evaluate(() => document.querySelector("article a[class*=cta]").click());
  await p.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("C4 the Get Best Quote button still goes to the product's quote section", /\/products\/.*#get-best-quote/.test(p.url()), p.url());
  await p.close();

  const home = await page("/", false);
  await home.evaluate(() => document.querySelector("[aria-label='featured suppliers'] article").scrollIntoView({ block: "center", behavior: "instant" }));
  await sleep(500);
  const supplierCard = await home.evaluate(() => { const c = document.querySelector("[aria-label='featured suppliers'] article"); const r = c.querySelector("img")?.getBoundingClientRect() ?? c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, href: c.querySelector("a[class*=name]").getAttribute("href") }; });
  await home.mouse.click(supplierCard.x, supplierCard.y);
  await home.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("C5 a homepage supplier card opens its supplier when clicked anywhere", home.url().endsWith(supplierCard.href), `${home.url()} vs ${supplierCard.href}`);
  await home.close();

  const sup = await page("/suppliers", false);
  const sc = await sup.evaluate(() => { const c = document.querySelector("article"); const r = c.getBoundingClientRect(); return { x: r.x + r.width - 12, y: r.y + r.height / 2 - 20, href: c.querySelector("a[class*=name]").getAttribute("href") }; });
  await sup.mouse.click(sc.x, sc.y);
  await sup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  check("C6 a supplier-list card opens the supplier when clicked on empty space", sup.url().endsWith(sc.href), `${sup.url()} vs ${sc.href}`);
  await sup.close();
}

await browser.close();
await mongo.close();
const fails = results.filter((x) => !x.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) console.log("FAILED:\n" + fails.map((f) => " - " + f.name).join("\n"));
