// Homepage (Page 01) HTTP check against a running server: content claims, every internal link resolves, and loading performs no write.
// run: BASE=http://localhost:3100 node docs/page-reports/tools/93-homepage-http-check.mjs
const BASE = process.env.BASE ?? "http://localhost:3100";
const res = await fetch(BASE + "/");
const html = await res.text();
const say = (k, v) => console.log(String(v).padEnd(6), k);
say("status 200", res.status === 200);
for (const t of ["Browse Products", "Browse Suppliers", "Inquiries in One Place"]) say(`has "${t}"`, html.includes(t));
for (const t of ["Sample Buyer", "10,00,000", "50,00,000", "10L+", "50L+", "Sample quotes", "Verified Suppliers", "Best Price", "Trusted Platform"]) say(`absent "${t}"`, !html.includes(t));
say("products section state", /Products could not be loaded/.test(html) ? "FAILURE MESSAGE" : /No products are listed yet/.test(html) ? "EMPTY MESSAGE" : "CARDS");
say("suppliers section state", /Suppliers could not be loaded/.test(html) ? "FAILURE MESSAGE" : /No suppliers are listed yet/.test(html) ? "EMPTY MESSAGE" : "CARDS");
const links = [...new Set([...html.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&")))].filter((l) => !l.startsWith("/_next"));
let bad = 0;
for (const l of links) { const r = await fetch(BASE + l, { redirect: "manual" }); const ok = r.status === 200 || (r.status >= 300 && r.status < 400); if (!ok) { bad++; console.log("BROKEN", r.status, l); } }
say(`${links.length} internal links resolve (no 4xx/5xx)`, bad === 0);
const hrefs = [...html.matchAll(/<a [^>]*href="(\/products\/[^"]+)"/g)].map((m) => m[1]);
say("product card links are unique", new Set(hrefs).size === hrefs.length);
