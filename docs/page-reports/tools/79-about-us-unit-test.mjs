// About Us (Page 13): focused checks of the content module and the page source. Static reads (no browser, no server): they guard the honesty rules (no invented facts, numbers or guarantees),
// that every call to action resolves to an existing route, and that the page stays a static server component. The rendered page, responsive layout and keyboard behaviour were checked
// separately in a real browser (see docs/page-designs/PAGE_13_ABOUT_US.md). run: node docs/page-reports/tools/79-about-us-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };

const content = read("src/lib/constants/aboutUs.ts");
const page = read("src/app/about-us/page.tsx");
const copy = content.split("export const ABOUT_US")[1] ?? "";
const strings = [...copy.matchAll(/"([^"]{3,})"/g)].map((m) => m[1]).filter((s) => !/^\/|^(search|requirements|conversations|compare|primary|secondary)$/.test(s));

check("the page is a static server component: no client directive, no fetch, no database, no session, no API", !/["']use client["']/.test(page) && !/fetch\(|getDb|getCurrentUser|cookies\(|headers\(|\/api\//.test(page));
check("the placeholder is replaced: a real /about-us route exists (a static route outranks the placeholder template) and the footer links to it", exists("src/app/about-us/page.tsx") && /href: "\/about-us"/.test(read("src/lib/constants/footer.ts")));
check("every call to action points to an existing public route", [...copy.matchAll(/href: "(\/[a-z-]+)"/g)].map((m) => m[1]).every((h) => exists(`src/app${h}/page.tsx`)) && [...copy.matchAll(/href: "(\/[a-z-]+)"/g)].length === 4);
check("the required copy is present: the hero heading, the introduction, three purpose items, the buyer and supplier lists, three steps and the closing heading", /Connecting businesses\. Simplifying sourcing\./.test(content) && /Finbyn Mart is a B2B marketplace designed to help businesses discover products, connect with relevant suppliers and discuss their sourcing requirements\./.test(content) && (copy.match(/icon: "/g) ?? []).length === 6 && /Find the right starting point\./.test(content) && /Review supplier responses and quotations\./.test(content) && /Respond to buyers and prepare quotations\./.test(content));
check("no invented fact: the copy contains no digits (counts, years), no superlative or leadership claim, no certification, award, partnership, testimonial, guarantee, verification, payment or shipping promise", !/\d/.test(strings.join(" ").replace(/B2B/g, "B-to-B")) && !/\b(leading|largest|best|number one|#1|trusted|verified|certified|award|partner|guarantee|guaranteed|secure|safe|protection|escrow|delivery|shipping|free|instant|within \w+ (hours|minutes))\b/i.test(strings.join(" ")));
check("no placeholder text or design-board annotation is rendered (no 'insert', lorem, 'illustrative', 'design reference', 'draft' on the page)", !/\[Insert|lorem|illustrative|design reference|coming soon|TODO/i.test(strings.join(" ") + page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
check("one H1 and a logical heading order in the source (h1, then h2 sections, h3 only inside the audience cards)", (page.match(/<h1/g) ?? []).length === 1 && (page.match(/<h2/g) ?? []).length === 5 && (page.match(/<h3/g) ?? []).length === 2 && page.indexOf("<h1") < page.indexOf("<h2"));
check("the illustration is decorative (aria-hidden), icons are hidden from assistive technology, and links are links (no buttons, no dead hrefs)", /className=\{styles\.art\} aria-hidden/.test(page) && !/<button/.test(page) && !/href="#"/.test(page) && !/<img/.test(page) && (page.match(/<Image/g) ?? []).length === (page.match(/<Image[^>]*alt=""/g) ?? []).length);
check("metadata: an accurate title and description, and a canonical URL only when the site origin is configured (nothing hard-coded, no structured business facts)", /title: TITLE/.test(page) && /description: DESCRIPTION/.test(page) && /siteUrl\(\)/.test(page) && !/https?:\/\//.test(page.replace(/\/\*[\s\S]*?\*\//g, "")) && !/application\/ld\+json/.test(page));
check("the stylesheet uses the project's tokens, has no fixed heights that could clip text, and respects reduced motion", /var\(--primary\)/.test(read("src/app/about-us/about-us.module.css")) && !/[^-]height:\s*\d+px/.test(read("src/app/about-us/about-us.module.css").replace(/min-height:[^;]*;/g, "").replace(/^\.iconBadge .*$/m, "") /* the icon circle holds an icon, never text */) && /prefers-reduced-motion/.test(read("src/app/about-us/about-us.module.css")));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
