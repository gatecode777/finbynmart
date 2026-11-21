import puppeteer from "puppeteer-core";
import fs from "node:fs";
const out = "docs/page-reports/screenshots"; fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
const sizes = [[320, 640], [360, 740], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [844, 390], [640, 360]];
const targets = [["78-maintenance", "http://localhost:3100/products?page=2"], ["76-unauthorized", "http://localhost:3101/unauthorized?next=/buyer/orders"]];
const res = [];
for (const [name, url] of targets) for (const [w, h] of sizes) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: h });
  const r = await p.goto(url, { waitUntil: "networkidle0" });
  const m = await p.evaluate(() => ({ h1: document.querySelectorAll("h1").length, over: document.documentElement.scrollWidth > innerWidth, btn: [...document.querySelectorAll("a")].map((a) => a.textContent.trim() + "→" + a.getAttribute("href")).slice(0, 6), imgOk: [...document.images].every((i) => i.complete && i.naturalWidth > 0) }));
  await p.keyboard.press("Tab"); const focus = await p.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 30));
  if ([320, 390, 1440, 844].includes(w)) await p.screenshot({ path: `${out}/${name}-${w}x${h}.png` });
  res.push({ name, w, h, status: r.status(), ...m, focus }); await p.close();
}
// 200% zoom simulation: 640 css px wide viewport at dsf 2 ~ same layout as 640; plus 320 at 200% => 160 css px is below spec; check 640->320 covered above.
for (const r of res) console.log(JSON.stringify(r));
console.log("problems:", res.filter((r) => r.h1 !== 1 || r.over || !r.imgOk).length);
await b.close();
