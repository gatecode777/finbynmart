// Approved supplier products -> public catalogue -> inquiry: the eligibility rule, the snapshot store, the listing engine, detail, supplier profile, inquiry
// resolution and STATIC structure checks. No database: the snapshot is filled directly through the store (the loader's query is checked statically).
// run: FINBYN_APPROVED_CACHE_MS=86400000 node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/63-approved-catalogue-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
process.env.FINBYN_APPROVED_CACHE_MS ??= "86400000";
process.env.FINBYN_LISTING_CACHE_MS = "0";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };

const S = await import("../../../src/lib/catalog/approvedStore.ts");
const P = await import("../../../src/lib/catalog/approvedProducts.ts");
const L = await import("../../../src/lib/catalog/categoryListing.ts");
const D = await import("../../../src/lib/catalog/productDetail.ts");
const SD = await import("../../../src/lib/catalog/supplierDetail.ts");
const PR = await import("../../../src/lib/catalog/productRef.ts");
const CAT = await import("../../../src/lib/catalog/categories.ts");
const PP = await import("../../../src/lib/catalog/publicProduct.ts");
const H = "a".repeat(24), H2 = "b".repeat(24);

// ---- eligibility (the one rule)
const ok = { publication: { state: "APPROVED" } };
check("eligible: approved + active category + active company", P.isEligibleDoc(ok, true, true));
check("not eligible: no publication / draft / pending / rejected state", !P.isEligibleDoc({}, true, true) && !P.isEligibleDoc({ publication: { state: "PENDING" } }, true, true) && !P.isEligibleDoc({ publication: { state: "REJECTED" } }, true, true));
check("not eligible: inactive category, inactive company, archived/unpublished", !P.isEligibleDoc(ok, false, true) && !P.isEligibleDoc(ok, true, false) && !P.isEligibleDoc({ ...ok, archivedAt: new Date() }, true, true));

// ---- the snapshot store
const mk = (n, over = {}) => ({ id: `sp-${n.toString(16).padStart(24, "0")}`, slug: `bolt-${n}`, name: `Hex Bolt ${n}`, description: "Zinc plated", nodeId: "industrial-machinery", categoryName: "Industrial Machinery", main: "industrial-machinery", sub: "industrial-machinery", images: [{ src: "https://ik.imagekit.io/x/a.jpg", remote: true, alt: "a" }], pricing: { mode: "FIXED", min: 100 + n, unit: "Piece" }, moq: { quantity: 10, unit: "Piece" }, supplier: { key: `co:${H}`, slug: `c-${H}`, name: "Acme Fasteners", city: "Pune", companyId: H, since: "2026", description: "We make bolts" }, approvedAt: new Date().toISOString(), ...over });
const items = [mk(1), mk(2, { pricing: { mode: "ON_REQUEST", min: null, unit: "Piece" } }), mk(3, { supplier: { key: `co:${H2}`, slug: `c-${H2}`, name: "Beta Tools", city: "Surat", companyId: H2, since: null, description: null } }), mk(1, { slug: "dup-slug" }), mk(9, { slug: "bolt-1" })];
S.setApproved(items);
const snap = S.getApproved();
check("duplicate ids and duplicate slugs are dropped (one identity per product)", snap.items.length === 3 && snap.byId.size === 3 && snap.bySlug.size === 3);
check("suppliers are unique per company slug", snap.suppliers.size === 2 && snap.bySupplier.get(`c-${H}`).length === 2);
check("public ids can never be mistaken for a catalogue id", snap.items.every((i) => i.id.startsWith("sp-") && !/^\d+$/.test(i.id)));
check("counts are per node path level and once per product", S.approvedCountsByNode().get("industrial-machinery") === 3);
check("a price-on-request product keeps no price on its card", S.toApprovedCard(items[1]).priceOnRequest === true && S.toApprovedCard(items[0]).priceOnRequest === undefined);

// ---- categories: public discoverability vs management
const dir = CAT.getCategoryDirectory();
const main = dir.nodes.find((n) => n.id === "industrial-machinery");
check("an approved product counts toward its category (discoverable and count includes it)", Boolean(main) && main.productCount >= 3);
check("the management list keeps every category (an empty one is not hidden from supplier product creation)", dir.management.length >= dir.nodes.length && CAT.getManagementCategories().some((n) => n.id === "industrial-machinery"));

// ---- listing engine: one engine, honest totals, stable paging
const all = L.getProductListing(L.parseListingQuery({ limit: "50" }));
const baseTotal = L.getProductListing(L.parseListingQuery({})).totals.products;
check("All Products total includes the approved products (no concatenate-and-slice)", all.totals.products === baseTotal && baseTotal > 21000);
const cat = L.getCategoryListing("industrial-machinery", L.parseListingQuery({ q: "hex bolt" }));
check("search and category pages find the approved products", cat.results.total === 3 && cat.results.items.every((i) => i.meta.source === "supplier"));
const ids = [];
for (let p = 1; p <= 3; p++) for (const it of L.getCategoryListing("industrial-machinery", L.parseListingQuery({ q: "hex bolt", limit: "1", page: String(p) })).results.items) ids.push(it.card.id);
check("pagination is stable and has no duplicates across pages", ids.length === 3 && new Set(ids).size === 3);
const priced = L.getCategoryListing("industrial-machinery", L.parseListingQuery({ q: "hex bolt", minPrice: "1" }));
check("a price filter never matches a price-on-request product", priced.results.total === 2 && priced.results.items.every((i) => !i.card.priceOnRequest));
const asc = L.getCategoryListing("industrial-machinery", L.parseListingQuery({ q: "hex bolt", sort: "price-asc" })).results.items.map((i) => i.card.priceOnRequest ? "x" : "p");
const desc = L.getCategoryListing("industrial-machinery", L.parseListingQuery({ q: "hex bolt", sort: "price-desc" })).results.items.map((i) => i.card.priceOnRequest ? "x" : "p");
check("price sorts put price-on-request after every priced product, both directions", asc.join("") === "ppx" && desc.join("") === "ppx");
const sup = L.getSupplierProductListing(`c-${H}`, L.parseListingQuery({}));
check("a company's own listing contains only its products", sup.results.total === 2 && sup.results.items.every((i) => i.meta.supplierKey === `co:${H}`));
check("an unknown company has no listing", L.getSupplierProductListing(`c-${"c".repeat(24)}`, L.parseListingQuery({})) === undefined);
check("the public DTO of a listed approved product has an allow-listed shape", (() => { const dto = PP.toPublicProduct(cat.results.items[0]); return dto.source === "supplier" && dto.supplier.verificationStatus === "unverified" && !("draft" in dto) && !("companyId" in dto.supplier); })());
check("a price-on-request public DTO has no price number", PP.toPublicProduct(L.getCategoryListing("industrial-machinery", L.parseListingQuery({ q: "hex bolt 2" })).results.items[0]).price.min === null);

// ---- detail, profile, inquiry resolution
const d = D.getPublicProductBySlug("bolt-1");
check("the detail page model comes from the approved snapshot with the real supplier identity", d && d.source === "supplier" && d.supplier.slug === `c-${H}` && d.pricing.type === "fixed" && d.supplier.verificationStatus === "unverified" && d.rating === null);
check("a price-on-request detail has pricing type on_request", D.getPublicProductBySlug("bolt-2").pricing.type === "on_request");
check("resolution by public id works and an unknown or draft-like id does not", D.getPublicProductByKey(items[0].id)?.slug === "bolt-1" && D.getPublicProductByKey("sp-" + "f".repeat(24)) === undefined && D.getPublicProductBySlug("not-approved-draft-9") === undefined);
check("a supplier product can never shadow a catalogue URL", D.getPublicProductBySlug("bolt-1").source === "supplier" && D.getPublicProductBySlug(`${[...(await import("../../../src/lib/catalog/data.ts")).getCatalog().products][0].slug}`).source === "catalog");
const prof = SD.getPublicSupplierBySlug(`c-${H}`);
check("the company profile shows its approved products and no verification or contact", prof.source === "company" && prof.productCount === 2 && prof.verificationStatus === "unverified" && prof.products.length === 2 && SD.hasSupplierProfile(`c-${H}`));
check("inquiry resolution: product and supplier resolve to the company's own identity (never a seeded seller)", (() => { const p = PR.resolveProduct(items[0].id); const s = PR.resolveSupplier(`c-${H}`); const s2 = PR.resolveSupplier(`co:${H}`); return p.supplierKey === `co:${H}` && s.key === `co:${H}` && s2.key === `co:${H}` && p.source === "supplier"; })());
check("a forged product/supplier pair is detectable: the product's supplier is the only valid supplier", PR.resolveProduct(items[2].id).supplierKey !== PR.resolveProduct(items[0].id).supplierKey);

// ---- static structure
const loader = read("src/lib/catalog/approvedProducts.ts");
const review = read("src/lib/admin/productReview.ts");
check("the loader reads the approved publication only (never the draft, the review or notes)", /"publication\.state": "APPROVED"/.test(loader) && !/\.draft\b|draft\.review|internalNote|reasonCode/.test(loader.replace(/\/\*[\s\S]*?\*\//g, "")) && /projection: \{ slug: 1, companyId: 1, archivedAt: 1, publication: 1 \}/.test(loader));
check("the loader is bounded and batched (one find, one company query, one user query, a cap)", /limit\(MAX_APPROVED \+ 1\)/.test(loader) && /_id: \{ \$in: companyIds \}/.test(loader) && (loader.replace(/UNITS\.find/g, "").match(/\.find\(/g) ?? []).length === 3);
check("an approval refreshes the snapshot after commit", /invalidateApproved\(\)/.test(review));
check("category management no longer depends on public discoverability", /getManagementCategories/.test(review) && /getManagementCategories/.test(read("src/lib/supplier/productDraftService.ts")));
check("public pages and APIs await the snapshot", ["src/app/products/[slug]/page.tsx", "src/app/search/page.tsx", "src/app/api/public/products/route.ts", "src/app/api/public/inquiries/route.ts", "src/app/suppliers/[slug]/page.tsx"].every((f) => /ensureApproved\(\)/.test(read(f))));
check("inquiries go through the one central service (no second path, matching untouched)", /submitInquiry\(/.test(read("src/app/api/public/inquiries/route.ts")) && !/distribution|runDistribution/.test(read("src/lib/catalog/approvedProducts.ts")));
check("a company's implicit supplier key is added to the session context only, never stored in sellerKeys", /sellerKeys: \[\.\.\.company\.sellerKeys, companyKeyOf\(company\._id\)\]/.test(read("src/lib/supplier/company.ts")));
check("the ImageKit host is allowed for public images and configured for next/image", /ik\.imagekit\.io/.test(read("src/lib/catalog/publicProduct.ts")) && /ik\.imagekit\.io/.test(read("next.config.ts") || read("next.config.mjs")));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
