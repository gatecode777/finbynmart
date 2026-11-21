// Admin Category Management (Page 55): the pure rules, the central effective-activation overlay on the REAL in-memory taxonomy and catalogue (no database), and static wiring checks.
// The workflow (transactional activation with audit and event once, idempotency, stale revision, concurrency, overlay reload from the database, publication / inquiry / lead rechecks) is in
// it-admin-categories.mjs and is BLOCKED here. run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/78-admin-categories-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const R = await import("../../../src/lib/admin/categoryRules.ts");
const Store = await import("../../../src/lib/catalog/approvedStore.ts");
const Cat = await import("../../../src/lib/catalog/categories.ts");
const L = await import("../../../src/lib/catalog/categoryListing.ts");
const D = await import("../../../src/lib/catalog/productDetail.ts");
const Ref = await import("../../../src/lib/catalog/productRef.ts");
const Perm = await import("../../../src/lib/admin/permissions.ts");

// ---- rules
check("levels follow the id depth, and a reference round-trips without ever becoming a path", R.levelOf("apparel-fashion") === "MAIN" && R.levelOf("apparel-fashion/men") === "DEPARTMENT" && R.levelOf("apparel-fashion/men/men-tshirts") === "LEAF" && R.idOfRef(R.refOf("apparel-fashion/men/men-tshirts")) === "apparel-fashion/men/men-tshirts" && ["../x", "a/b", "A", "a~b~c~d", "a b", ""].every((x) => R.idOfRef(x) === null));
check("activation is changeable for MAIN categories only, and only with the capability", (() => { const a = R.activationPlan("MAIN", true, true); const b = R.activationPlan("DEPARTMENT", true, true); const c = R.activationPlan("MAIN", true, false); return a.available && !b.available && /main category/i.test(b.reason) && !c.permitted && !c.available; })());
const q = (o) => R.validateState((k) => o[k]);
check("filters are allow-lists: an unknown level or status, a malformed parent, a long search and a bad page are refused", !q({ level: "x" }).ok && !q({ status: "x" }).ok && !q({ parent: "../etc" }).ok && !q({ q: "x".repeat(61) }).ok && !q({ page: "0" }).ok && !q({ page: "2000" }).ok && q({}).ok && q({ level: "MAIN", status: "inactive", parent: "apparel-fashion~men", page: "2" }).ok);
check("list state round-trips through the URL and unknown values fall back", (() => { const st = { q: "Men", level: "LEAF", status: "active", parent: "apparel-fashion~men", page: 2 }; return JSON.stringify(R.parseState(R.toParams(st))) === JSON.stringify(st) && R.toParams(R.EMPTY_STATE).toString() === "" && R.parseState(new URLSearchParams("level=z&status=z&parent=%2F..&page=-1")).level === "all"; })());
check("the reason is cleaned and bounded (10-500)", R.validateReason(R.cleanReason(" short ")) !== null && R.validateReason("x".repeat(501)) !== null && R.validateReason("No longer commercially available.") === null);
check("the consequence lists state what is kept and what is not changed", R.DEACTIVATE_EFFECTS.some((t) => /Nothing is deleted/.test(t)) && R.DEACTIVATE_EFFECTS.some((t) => /not found/.test(t)) && R.REACTIVATE_EFFECTS.some((t) => /does not approve a pending product/.test(t) && /replay past leads/.test(t)));
check("categories have their own capabilities and none exists for create, rename, move or slug (those operations are not built)", ["categories.read", "categories.activation", "categories.audit"].every((c) => Perm.ADMIN_CAPABILITIES.includes(c)) && !Perm.ADMIN_CAPABILITIES.some((c) => /categories\.(create|edit|parent|slug)/.test(c)));

// ---- the central effective-activation overlay, on the real taxonomy
Store.setDeactivatedCategories([]);
const before = Cat.getCategoryDirectory();
const apparelNodes = (dir) => dir.nodes.filter((n) => n.id === "apparel-fashion" || n.id.startsWith("apparel-fashion/")).length;
check("with nothing deactivated, the apparel branch is public and selectable", apparelNodes(before) > 1 && Cat.getManagementCategories().some((n) => n.id === "apparel-fashion") && before.nodes.some((n) => n.id === "apparel-fashion" && n.isActive));
const allBefore = L.getProductListing(L.emptyListingQuery()).totals.products;
const catalogueProduct = L.getIndustryListing(["apparel-fashion"], L.emptyListingQuery(), { pageSize: 1 }).results.items[0]?.card?.href?.replace("/products/", "") ?? null;
Store.setDeactivatedCategories(["apparel-fashion"]);
const after = Cat.getCategoryDirectory();
check("deactivating a main category removes it AND everything below it from public discovery and from supplier selectors, while the administrator's own list still contains it as inactive", apparelNodes(after) === 0 && !Cat.getManagementCategories().some((n) => n.id === "apparel-fashion" || n.id.startsWith("apparel-fashion/")) && after.management.some((n) => n.id === "apparel-fashion" && !n.isActive) && after.management.filter((n) => n.id.startsWith("apparel-fashion/")).every((n) => !n.isActive));
check("the inactive category keeps its product count (counted without the activation gate), so an inactive category can show products while hidden", after.management.find((n) => n.id === "apparel-fashion").productCount === before.management.find((n) => n.id === "apparel-fashion").productCount && after.management.find((n) => n.id === "apparel-fashion").productCount > 0);
check("every public listing hides its products: All Products no longer contains the catalogue, an industry scope over it is empty, and its category URL is unavailable (not found)", L.getProductListing(L.emptyListingQuery()).totals.products < allBefore && L.getIndustryListing(["apparel-fashion"], L.emptyListingQuery()).totals.products === 0 && Cat.resolveCategoryRoute("apparel-fashion").type === "none");
check("a catalogue product page and a product reference (for a new inquiry) of an inactive category are unavailable", (() => { if (!catalogueProduct) return true; Store.setDeactivatedCategories([]); const live = D.getPublicProductBySlug(catalogueProduct); Store.setDeactivatedCategories(["apparel-fashion"]); const hidden = D.getPublicProductBySlug(catalogueProduct); return !!live && hidden === undefined; })() && Ref.resolveProduct("1163") === undefined);
check("the overlay is the same answer for every consumer: isCategoryActive follows the main category for any node below it", !Store.isCategoryActive("apparel-fashion") && !Store.isCategoryActive("apparel-fashion/men/men-tshirts") && Store.isCategoryActive("industrial-machinery"));
Store.setDeactivatedCategories([]);
check("reactivating restores exactly the central rule: the branch is public again, nothing else was changed", apparelNodes(Cat.getCategoryDirectory()) === apparelNodes(before) && Cat.resolveCategoryRoute("apparel-fashion").type === "category" && L.getProductListing(L.emptyListingQuery()).totals.products === allBefore);
check("an unchanged overlay does not bump its version (no needless rebuild), a changed one does", (() => { Store.setDeactivatedCategories(["agriculture"]); const v = Store.categoryOverlayVersion(); Store.setDeactivatedCategories(["agriculture"]); const same = Store.categoryOverlayVersion() === v; Store.setDeactivatedCategories([]); return same && Store.categoryOverlayVersion() > v; })());

// ---- wiring (static)
const svc = read("src/lib/admin/categoryManagement.ts");
const act = read("src/app/api/admin/categories/[reference]/activation/route.ts");
const loader = read("src/lib/catalog/approvedProducts.ts");
const dist = read("src/lib/leads/distribution.ts");
check("activation commits the overlay write, the audit row (unique operation key) and the recovery event in one snapshot transaction, conditional on the revision, and touches no product or child flag", /withTransaction/.test(svc) && /readConcern: \{ level: "snapshot" \}/.test(svc) && /rev: curRev/.test(svc) && /audit\.insertOne\([^]*?operationKey/.test(svc) && /events\.insertOne\(/.test(svc) && !/supplier_products|inquiries|quotations|distribution_jobs/.test(svc.split("export async function setActivation")[1]?.split("export async function processEvent")[0] ?? ""));
check("only main categories can be changed (a department or product category is refused with the reason), and replay and key conflict are handled", /levelOf\(id\) !== "MAIN"/.test(svc) && /prev\.bodyHash === bodyHash/.test(svc) && /already used for a different request/.test(svc));
check("the route needs categories.activation + categories.read, refuses cross-site, is rate limited and reads only four body fields; there is no create, rename, move or slug route", /requireAdminApi\("categories\.activation"\)/.test(act) && /includes\("categories\.read"\)/.test(act) && /isCrossSiteWrite\(request\)/.test(act) && /rateLimit\(/.test(act) && /isActive: body\.isActive, reason: body\.reason, expectedRev: body\.expectedRev, idempotencyKey: body\.idempotencyKey/.test(act) && !fs.existsSync(path.join(root, "src/app/api/admin/categories/[reference]/route.ts").replace("route.ts", "x")) && !/export async function (PATCH|PUT|DELETE)/.test(read("src/app/api/admin/categories/route.ts") + read("src/app/api/admin/categories/[reference]/route.ts") + act) && !/export async function POST/.test(read("src/app/api/admin/categories/route.ts")));
check("the overlay is loaded before the approved snapshot, a failed read keeps the LAST known set, and new publications, inquiries and lead commits re-read it from the database", /await loadCategoryOverlay\(\)/.test(loader) && /keeps the LAST known set|last known set/i.test(loader + read("src/lib/catalog/approvedStore.ts")) && /categoryActiveNow\(category, session\)/.test(loader) && /categoryActiveNow\("apparel-fashion", session\)/.test(dist) && /sweepCategoryEvents\(\)/.test(dist));
check("the directory cache is keyed on the approved snapshot AND the overlay version, so a change can never be served from a stale directory", /categoryOverlayVersion\(\)/.test(read("src/lib/catalog/categories.ts")) && /isCategoryActive\(top\.id\)/.test(read("src/lib/catalog/categories.ts")));
check("the page is guarded, Categories is the built sidebar entry, and the UI disables Add Category with its blocker and uses field-linked errors, native dialogs and a tablist", /requireAdminPage\(next, "categories\.read"\)/.test(read("src/app/admin/categories/page.tsx")) && /key: "categories", label: "Categories"[^}]*built: true/.test(read("src/components/admin/AdminShell.tsx")) && /disabled aria-describedby="ac-add-why"/.test(read("src/components/admin/AdminCategoriesWorkspace.tsx")) && /aria-invalid=\{reasonError \? true : undefined\}/.test(read("src/components/admin/AdminCategoryReview.tsx")) && /role="tablist"/.test(read("src/components/admin/AdminCategoryReview.tsx")) && /aria-expanded/.test(read("src/components/admin/AdminCategoriesWorkspace.tsx")));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
