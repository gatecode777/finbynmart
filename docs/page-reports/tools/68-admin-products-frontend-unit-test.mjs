// Admin Product Management frontend: the contract helpers, the demo fixtures and STATIC structure checks (no database, no browser).
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/68-admin-products-frontend-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const L = await import("../../../src/lib/admin/productList.ts");
const D = await import("../../../src/lib/admin/productListDemo.ts");

const qs = (o) => new URLSearchParams(o);
check("URL state is parsed with allow-lists (unknown status or sort and bad pages fall back)", (() => { const q = L.parseQuery(qs({ status: "HACKED", sort: "price", page: "-3", q: "x".repeat(200) })); return q.status === "" && q.sort === "updated" && q.page === 1 && q.q.length === 80; })());
check("only non-default values reach the URL and a round trip is stable", (() => { const q = { q: "cotton", status: "PUBLISHED", category: "", supplier: "", sort: "name", page: 2 }; const p = L.toParams(q); return p.toString() === "q=cotton&status=PUBLISHED&sort=name&page=2" && JSON.stringify(L.parseQuery(p)) === JSON.stringify(q) && L.toParams(L.EMPTY_QUERY).toString() === ""; })());
check("the unpublish reason is required and bounded", L.validateUnpublishReason("") !== null && L.validateUnpublishReason("short") !== null && L.validateUnpublishReason("x".repeat(501)) !== null && L.validateUnpublishReason("Listing violates the policy.") === null);
check("listing statuses are derived concepts, not new persisted states (exactly four, no draft)", L.LISTING_STATUSES.map((s) => s.value).join() === "PUBLISHED,PENDING_REVIEW,UNPUBLISHED,REJECTED");

const all = await D.demoList({ ...L.EMPTY_QUERY });
check("demo fixtures filter, sort and page like the contract", all.items.length === 6 && all.meta.total === 6 && !all.meta.hasMore);
check("demo search, status, supplier and category filters work locally", (await D.demoList({ ...L.EMPTY_QUERY, q: "denim" })).items.length === 1 && (await D.demoList({ ...L.EMPTY_QUERY, status: "PUBLISHED" })).items.every((p) => p.status === "PUBLISHED") && (await D.demoList({ ...L.EMPTY_QUERY, supplier: "Example Mills" })).items.length === 2 && (await D.demoList({ ...L.EMPTY_QUERY, q: "no such product" })).items.length === 0);
check("demo sort by name is alphabetical and page two is empty when there are fewer than a page", (() => true)() && (await D.demoList({ ...L.EMPTY_QUERY, sort: "name" })).items.map((p) => p.name).join("|") === [...all.items.map((p) => p.name)].sort((a, b) => a.localeCompare(b)).join("|") && (await D.demoList({ ...L.EMPTY_QUERY, page: 2 })).items.length === 0);
check("demo data covers the awkward states: long names, missing SKU/price/MOQ/specifications and a published listing with pending changes", D.DEMO_PRODUCTS.some((p) => p.name.length > 80) && D.DEMO_PRODUCTS.some((p) => p.sku === null && p.moqText === null && p.specifications.length === 0) && D.DEMO_PRODUCTS.some((p) => p.priceText === null) && D.DEMO_PRODUCTS.some((p) => p.status === "PUBLISHED" && p.pendingChanges));

const page = read("src/app/admin/products/page.tsx");
const ui = read("src/components/admin/AdminProductsWorkspace.tsx");
const shell = read("src/components/admin/AdminShell.tsx");
check("the page is guarded by products.read and keeps the breadcrumb", /requireAdminPage\("\/admin\/products", "products\.read"\)/.test(page) && /Admin<\/Link> \/ Products/.test(page));
check("demo mode can never be switched on in production or without an admin session", /process\.env\.NODE_ENV !== "production" && sp\.preview === "demo"/.test(page) && page.indexOf("requireAdminPage") < page.indexOf("const demo"));
check("demo fixtures are loaded only by dynamic import in demo mode", /await import\("@\/lib\/admin\/productListDemo"\)/.test(ui) && !/^import .*productListDemo/m.test(ui));
check("normal mode talks only to the future read API; 404, 405 and 501 are 'unavailable', never an empty list", /\/api\/admin\/products\?/.test(ui) && /\[404, 405, 501\]\.includes\(res\.status\)/.test(ui) && /The product list isn&apos;t available yet/.test(ui) && /This is not an empty catalogue/.test(ui));
check("a failed request shows an error with Retry and 'No products' appears only for a real empty result", /kind: "error"/.test(ui) && /Retry<\/button>/.test(ui) && /data && data\.items\.length === 0/.test(ui));
check("search is debounced and stale requests are cancelled", /setTimeout\(\(\) => go\(\{ \.\.\.query, q: qInput, page: 1 \}\), 300\)/.test(ui) && /abort\.current\?\.abort\(\)/.test(ui));
check("the only state-changing requests are the unpublish and export endpoints; success is shown only after the server confirmed, and demo mode sends nothing", (ui.match(/method: "POST"/g) ?? []).length === 2 && /\/unpublish`/.test(ui) && /\/api\/admin\/products\/export/.test(ui) && /if \(res\?\.ok && json\.ok\) \{/.test(ui) && /if \(demo\) \{ setDemoNote\(true\); return; \}/.test(ui));
check("a row is never removed or re-statused locally after confirming (the table renders from the response and is reloaded after a confirmed success)", !/setView\(\(v\) =>/.test(ui) && /setTick\(\(t\) => t \+ 1\)/.test(ui) && /Demo preview only: the reason is valid, but nothing was changed or saved/.test(ui));
check("the reason field is labelled, required and its error is linked", /aria-required="true"/.test(ui) && /aria-describedby=\{reasonError \?/.test(ui) && /role="alert">\{reasonError\}/.test(ui));
check("the drawer and dialog are native modal dialogs (focus trap, Escape, focus return) with labelled titles and a close button", (ui.match(/<dialog /g) ?? []).length === 2 && /aria-labelledby=\{`\$\{uid\}-dt`\}/.test(ui) && /aria-label="Close product details"/.test(ui));
check("desktop is a semantic table (caption and column/row headers) and mobile uses stacked cards from the existing admin styles", /<caption className=\{s\.sr\}>/.test(ui) && /<th scope="col">/.test(ui) && /<th scope="row">/.test(ui) && /className=\{s\.cards\}/.test(ui));
check("review decisions are not duplicated: only links to Product Review", /href="\/admin\/product-review"/.test(ui) && !/>\s*(Approve|Reject)\b/.test(ui) && !/product-review\/\$\{/.test(ui));
check("Products is its own sidebar entry using the existing shell, and no Delete Product exists", /key: "products", label: "Products"[^}]*href: "\/admin\/products", built: true/.test(shell) && !/delete product/i.test(ui));
check("no hardcoded KPI counts and no fabricated fields in the live path", !/KPI|metric/i.test(ui));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
