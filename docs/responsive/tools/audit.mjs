import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = process.argv[2] || "run";
const SHOTS = process.argv[3] !== "noshots";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const ROUTES = process.env.ROUTES ? JSON.parse(process.env.ROUTES) : [
  "/", "/categories", "/categories/apparel-fashion", "/categories/apparel-fashion/men-tshirts",
  "/categories/packaging-printing", "/categories/packaging-printing/corrugated-boxes", "/categories/home-lifestyle",
  "/how-it-works", "/industries",
  "/industries/manufacturing", "/post-requirement", "/products",
  "/products/nike-sahara-team-india-fanwear-round-neck-jersey-1163", "/products/industrial-air-compressor",
  "/search?q=shirt", "/suppliers", "/suppliers/ruchi-house-store", "/suppliers/shree-textiles",
  "/sign-in", "/sign-up", "/register-supplier", "/sitemap", "/help", "/does-not-exist",
];

const listed = [320, 344, 360, 375, 390, 393, 414, 430, 480, 540, 600, 640, 667, 720, 768, 800, 820, 834, 900, 912, 960,
  1024, 1152, 1280, 1366, 1440, 1536, 1600, 1680, 1920, 2048, 2560, 3440];
const landscape = [844, 932, 568, 740, 915];
const zoomWidths = [];
for (const base of [1440, 1920]) for (const z of [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]) zoomWidths.push(Math.round(base / z));
const WIDTHS = [...new Set([...listed, ...landscape, ...zoomWidths])].sort((a, b) => a - b);

const SHOT_SIZES = [[320, 640], [360, 800], [390, 844], [414, 896], [768, 1024], [820, 1180], [1024, 768], [1280, 800], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440]];

const measure = () => {
  const vw = window.innerWidth;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  };
  const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}`;
  const clippedByScroller = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) {
        const r = a.getBoundingClientRect();
        if (r.right <= vw + 1 && r.left >= -1) return true;
      }
    }
    return false;
  };
  const all = [...document.body.querySelectorAll("*")].filter((e) => visible(e) && !e.closest("[inert]"));
  const overflow = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !clippedByScroller(el) && !el.closest("[aria-hidden='true']")) {
      overflow.push(`${label(el)} L${Math.round(r.left)} R${Math.round(r.right)}`);
    }
  }
  const small = [];
  if (vw <= 1024) {
    for (const el of document.querySelectorAll("a[href], button, input, select, textarea, summary")) {
      if (!visible(el) || el.type === "hidden") continue;
      // A checkbox or radio is tapped through its label, so the label is the touch target.
      // A stretched link (its ::after covers the card) is tapped anywhere on the card, so the card is the target.
      const stretched = getComputedStyle(el, "::after").position === "absolute" && el.closest("article");
      const r = ((el.matches("input[type=checkbox], input[type=radio]") && el.closest("label")) || stretched || el).getBoundingClientRect();
      const inline = getComputedStyle(el).display === "inline" && el.closest("p, li, span");
      if (!inline && (r.height < 32 || r.width < 32)) small.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 20)}"`);
    }
  }
  const clipped = [];
  for (const el of all) {
    const s = getComputedStyle(el);
    if (el.clientWidth > 4 && el.scrollWidth > el.clientWidth + 2 && /(hidden|clip)/.test(s.overflowX) && s.textOverflow !== "ellipsis" && el.children.length === 0 && (el.textContent || "").trim()) {
      clipped.push(`${label(el)} "${el.textContent.trim().slice(0, 24)}" ${el.scrollWidth}>${el.clientWidth}`);
    }
  }
  const distorted = [];
  for (const img of document.querySelectorAll("img")) {
    if (!visible(img) || !img.naturalWidth) continue;
    const r = img.getBoundingClientRect();
    const fit = getComputedStyle(img).objectFit;
    const nat = img.naturalWidth / img.naturalHeight;
    const disp = r.width / r.height;
    if (fit === "fill" && Math.abs(nat - disp) / nat > 0.06) distorted.push(`${(img.getAttribute("src") || "").slice(-40)} nat${nat.toFixed(2)} disp${disp.toFixed(2)}`);
  }
  const layout = [];
  const hs = document.querySelector("header form[role=search]");
  if (hs && vw >= 1024 && hs.getBoundingClientRect().width < 240) layout.push(`header search only ${Math.round(hs.getBoundingClientRect().width)}px`);
  if (hs && vw < 1024 && hs.getBoundingClientRect().width < Math.min(280, vw - 40)) layout.push(`mobile search only ${Math.round(hs.getBoundingClientRect().width)}px`);
  const navList = document.querySelector("nav[aria-label='Product categories'] ul");
  if (navList && navList.offsetParent !== null && navList.scrollWidth > navList.clientWidth + 2) layout.push(`category nav cut off ${navList.scrollWidth}>${navList.clientWidth}`);
  const bg = getComputedStyle(document.body).backgroundColor;
  const fg = getComputedStyle(document.querySelector("main h1, main h2") || document.body).color;
  const lum = (c) => { if (!c || !/\d/.test(c)) return 0; const m = c.match(/\d+(\.\d+)?/g).map(Number).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  const pageBg = (() => { let e = document.querySelector("main") || document.body; while (e) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(.*, 0\)|transparent/.test(c)) return c; e = e.parentElement; } return bg; })();
  const L1 = lum(fg), L2 = lum(pageBg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  if (ratio < 3) layout.push(`heading contrast ${ratio.toFixed(1)}:1`);
  const escapes = [];
  for (const el of document.querySelectorAll("input, select, textarea, button, img")) {
    if (!el.getBoundingClientRect().width || el.closest("[inert], [aria-hidden='true']")) continue;
    const pos = getComputedStyle(el).position;
    if (pos === "absolute" || pos === "fixed") continue;
    const p = el.parentElement;
    if (!p) continue;
    const ps = getComputedStyle(p);
    if (/(auto|scroll|hidden|clip)/.test(ps.overflowX)) continue;
    const r = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
    if (r.right > pr.right + 2 || r.left < pr.left - 2) escapes.push(el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0] + " escapes " + p.tagName.toLowerCase() + "." + String(p.className).split(" ")[0] + " by " + Math.round(Math.max(r.right - pr.right, pr.left - r.left)) + "px");
  }
  layout.push(...[...new Set(escapes)].slice(0, 3));
  const broken = [];
  for (const img of document.querySelectorAll("img")) {
    if (img.getAttribute("src") && img.complete && img.naturalWidth === 0) broken.push((img.getAttribute("src") || "").slice(-50));
  }
  let tinyText = 0;
  for (const el of all) {
    if (el.children.length === 0 && (el.textContent || "").trim() && parseFloat(getComputedStyle(el).fontSize) < 11) tinyText++;
  }
  return {
    docOverflow: Math.max(0, document.documentElement.scrollWidth - vw),
    overflow: [...new Set(overflow)].slice(0, 6),
    small: small.length, smallEx: small.slice(0, 4),
    clipped: [...new Set(clipped)].slice(0, 4),
    distorted: distorted.slice(0, 3),
    tinyText,
    broken: [...new Set(broken)].slice(0, 4),
    layout,
  };
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const results = [];
const consoleErrors = {};
fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });

for (const route of ROUTES) {
  const page = await browser.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 160)));
  page.on("requestfailed", (r) => { if (!r.url().includes("_rsc=") && !String(r.failure()?.errorText).includes("ABORTED")) errs.push("reqfailed: " + r.url().slice(-80)); });
  await page.setViewport({ width: 1440, height: 900 });
  const resp = await page.goto(BASE + route, { waitUntil: "networkidle2", timeout: 60000 }).catch((e) => ({ status: () => "ERR " + e.message }));
  const status = resp.status();
  await page.evaluate(async () => { await new Promise((res) => { let y = 0; const t = setInterval(() => { window.scrollBy(0, 350); y += 350; if (y >= document.body.scrollHeight + 350) { clearInterval(t); window.scrollTo(0, 0); setTimeout(res, 1200); } }, 220); }); });
  for (const w of WIDTHS) {
    await page.setViewport({ width: w, height: w < 600 ? 800 : 900 });
    await new Promise((r) => setTimeout(r, 120));
    const m = await page.evaluate(measure);
    results.push({ route, width: w, status, ...m });
  }
  if (SHOTS) {
    for (const [w, h] of SHOT_SIZES) {
      await page.setViewport({ width: w, height: h });
      await new Promise((r) => setTimeout(r, 200));
      const name = `${route === "/" ? "home" : route.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}__${w}x${h}.jpg`;
      await page.screenshot({ path: path.join(OUT, "shots", name), fullPage: true, type: "jpeg", quality: 55 });
    }
  }
  consoleErrors[route] = [...new Set(errs)].slice(0, 6);
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ results, consoleErrors, widths: WIDTHS }, null, 1));

// summary
const byRoute = {};
for (const r of results) {
  const b = (byRoute[r.route] ??= { status: r.status, overflowW: [], clippedW: [], distortedW: [], smallMax: 0, tinyMax: 0, ex: {} });
  if (r.docOverflow > 1) b.overflowW.push(r.width);
  if (r.overflow.length) { b.ex.overflow ??= r.overflow; }
  if (r.clipped.length) { b.clippedW.push(r.width); b.ex.clipped ??= r.clipped; }
  if (r.distorted.length) { b.distortedW.push(r.width); b.ex.distorted ??= r.distorted; }
  if (r.layout?.length) { (b.layoutW ??= []).push(r.width); b.ex.layout ??= r.layout; }
  if (r.broken?.length) { (b.brokenW ??= []).push(r.width); b.ex.broken ??= r.broken; }
  if (r.small > b.smallMax) { b.smallMax = r.small; b.ex.small = r.smallEx; }
  b.tinyMax = Math.max(b.tinyMax, r.tinyText);
}
for (const [route, b] of Object.entries(byRoute)) {
  console.log(`\n${route}  [${b.status}]`);
  console.log(`  doc-overflow widths: ${b.overflowW.join(",") || "none"}`);
  if (b.ex.overflow) console.log(`  offenders: ${b.ex.overflow.join(" | ")}`);
  console.log(`  clipped-text widths: ${b.clippedW.join(",") || "none"} ${b.ex.clipped ? JSON.stringify(b.ex.clipped) : ""}`);
  console.log(`  distorted-img widths: ${b.distortedW.join(",") || "none"} ${b.ex.distorted ? JSON.stringify(b.ex.distorted) : ""}`);
  if (b.layoutW) console.log(`  LAYOUT problems at widths: ${b.layoutW.join(",")} ${JSON.stringify(b.ex.layout)}`);
  if (b.brokenW) console.log(`  BROKEN images at widths: ${b.brokenW.join(",")} ${JSON.stringify(b.ex.broken)}`);
  console.log(`  small targets (max): ${b.smallMax} ${b.ex.small ? JSON.stringify(b.ex.small) : ""}; tiny text elems (max): ${b.tinyMax}`);
  if (consoleErrors[route].length) console.log(`  console: ${JSON.stringify(consoleErrors[route])}`);
}
