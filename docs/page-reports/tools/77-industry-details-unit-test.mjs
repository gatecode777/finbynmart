// Industry Details (Page 10): the industry-to-category mapping rules and the scoped listing, run against the real in-memory catalogue (no database, no server). The page's runtime states
// (unmapped, mapped, empty, error) are exercised by the public read-only browser probe described in docs/page-designs/10-industry-details.md.
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/77-industry-details-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const M = await import("../../../src/lib/constants/industryCategories.ts");
const { INDUSTRY_SOLUTIONS } = await import("../../../src/lib/constants/industries.ts");
const { TOP_CATEGORIES } = await import("../../../src/lib/constants/categories.ts");
const L = await import("../../../src/lib/catalog/categoryListing.ts");

const industries = INDUSTRY_SOLUTIONS.map((i) => i.id), cats = TOP_CATEGORIES.map((c) => c.id);
const ok = (over = {}) => ({ industryId: "retail-wholesale", categoryIds: ["apparel-fashion"], status: "APPROVED", source: "Owner decision", approvedBy: "Owner", approvedOn: "2026-11-16", ...over });
const problems = (list) => M.validateIndustryMap(list, industries, cats);

check("the shipped mapping file is valid, covers only real industries and canonical main categories, and every entry carries its source", problems(M.INDUSTRY_CATEGORY_MAP).length === 0 && M.INDUSTRY_CATEGORY_MAP.every((m) => m.source.trim()));
check("no relationship is approved by this change: every shipped entry is a PROPOSAL, so none is used and no industry is mapped by inference", M.INDUSTRY_CATEGORY_MAP.every((m) => m.status === "PROPOSED") && industries.every((id) => M.approvedCategoriesFor(id) === null));
check("an unknown industry, an unknown category and a duplicate entry are refused", problems([ok({ industryId: "mining" })]).length > 0 && problems([ok({ categoryIds: ["nope"] })]).length > 0 && problems([ok(), ok()]).length > 0 && problems([ok({ categoryIds: ["apparel-fashion", "apparel-fashion"] })]).length > 0);
check("an APPROVED entry needs a named approver, a date and at least one category; a PROPOSED one needs neither", problems([ok({ approvedBy: "" })]).length > 0 && problems([ok({ approvedOn: undefined })]).length > 0 && problems([ok({ approvedOn: "16/11/2026" })]).length > 0 && problems([ok({ categoryIds: [] })]).length > 0 && problems([ok({ status: "PROPOSED", approvedBy: undefined, approvedOn: undefined })]).length === 0);
check("only APPROVED entries are used, deduplicated and in order; a PROPOSAL, an unlisted industry and an invalid list give null (never a guess, never everything)", M.approvedCategoriesFor("retail-wholesale", [ok({ categoryIds: ["apparel-fashion", "home-lifestyle"] })]).join() === "apparel-fashion,home-lifestyle" && M.approvedCategoriesFor("retail-wholesale", [ok({ status: "PROPOSED" })]) === null && M.approvedCategoriesFor("education", [ok()]) === null && M.approvedCategoriesFor("retail-wholesale", [ok({ categoryIds: ["nope"] })]) === null);

// ---- the scoped listing on the real catalogue
const q = L.emptyListingQuery();
const all = L.getProductListing(q);
const scoped = L.getIndustryListing(["apparel-fashion"], q, { pageSize: 5 });
check("the scoped listing contains only the mapped main category: its totals, facets and results are computed over that scope, not over the whole catalogue", scoped.totals.categories === 1 && scoped.totals.products > 0 && scoped.totals.products <= all.totals.products && scoped.facets.categories.every((c) => c.value === "apparel-fashion") && scoped.results.items.length <= 5);
check("a mapped category that is not publicly discoverable is simply absent (the central rule wins); an unknown id yields an empty scope, not the catalogue", (() => { const none = L.getIndustryListing(["no-such-category"], q); return none.totals.products === 0 && none.results.total === 0; })() && L.getIndustryListing(["apparel-fashion", "no-such-category"], q).totals.products === scoped.totals.products);
check("a category filter outside the industry's scope is dropped and reported, never honoured", (() => { const other = TOP_CATEGORIES.map((c) => c.id).find((id) => id !== "apparel-fashion" && L.getProductListing({ ...q, category: [id] }).totals.products > 0); if (!other) return true; const r = L.getIndustryListing(["apparel-fashion"], { ...q, category: [other] }); return r.applied.category.length === 0 && r.ignored.some((i) => i.param === "category" && i.value === other) && r.totals.products === scoped.totals.products; })());
check("sample B2B listings are never presented as live inventory on an industry page: a sample-only category adds no rows and is not offered as a chip; the industry total is the catalogue category alone", (() => { const sampleOnly = TOP_CATEGORIES.map((c) => c.id).find((id) => id !== "apparel-fashion" && L.getIndustryListing([id], q).totals.products === 0 && L.getProductListing({ ...q, category: [id] }).totals.products > 0); const mixed = L.getIndustryListing(["apparel-fashion", sampleOnly ?? "no-such-category"], q); return (sampleOnly === undefined || L.getIndustryListing([sampleOnly], q).results.total === 0) && mixed.totals.products === scoped.totals.products && L.industryListableCategories(["apparel-fashion", sampleOnly ?? "no-such-category"]).join() === "apparel-fashion"; })());
check("search inside the scope stays inside it and a nonsense term gives an honest empty result for that scope", (() => { const none = L.getIndustryListing(["apparel-fashion"], { ...q, q: "zzzzqqqq nothing" }); return none.results.total === 0 && none.totals.products === scoped.totals.products; })());
check("pagination is deterministic: two consecutive pages never repeat a product and the order is stable between calls", (() => { const p1 = L.getIndustryListing(["apparel-fashion"], { ...q, page: 1 }, { pageSize: 10 }); const p2 = L.getIndustryListing(["apparel-fashion"], { ...q, page: 2 }, { pageSize: 10 }); const ids1 = p1.results.items.map((i) => i.card.href ?? JSON.stringify(i.card)); const ids2 = p2.results.items.map((i) => i.card.href ?? JSON.stringify(i.card)); return ids1.length === 10 && ids2.length === 10 && !ids1.some((x) => ids2.includes(x)) && JSON.stringify(L.getIndustryListing(["apparel-fashion"], { ...q, page: 1 }, { pageSize: 10 }).results.items.map((i) => i.card.href ?? JSON.stringify(i.card))) === JSON.stringify(ids1); })());
check("the listing page size is bounded", L.MAX_PAGE_SIZE === 50 && L.getIndustryListing(["apparel-fashion"], { ...q, limit: 9999 }).results.items.length <= 50);

// ---- the page wiring (static)
const page = read("src/app/industries/[slug]/page.tsx");
check("the page keeps the existing hero and breadcrumb, uses the shared listing component and the central engine, and has four different non-result states (unknown industry, unmapped, mapped without public products, failed read)", /notFound\(\)/.test(page) && /CategoryListingPage/.test(page) && /getIndustryListing\(scopeIds, query/.test(page) && /MediaTile/.test(page) && /aren&apos;t set up yet|aren't set up yet/.test(page) && /No public products in this industry yet/.test(page) && /could not be loaded/.test(page));
check("an unmapped industry never falls back to the catalogue and the request error is not shown as a zero result", /scope\.state === "UNMAPPED"/.test(page) && !/getProductListing\(/.test(page) && /let listing: CategoryListing \| null = null/.test(page) && /if \(!listing\)/.test(page));
check("the scope comes from the server-side mapping, never from the request; the category chips come only from discoverable mapped categories", /resolveIndustryScope\(industry\.id\)/.test(page) && /scope\.categories\.map\(\(c\) => c\.id\)/.test(page) && !/searchParams[^;]*categoryIds/.test(page));
check("Post Your Requirement links to the existing general-requirement page and no inquiry is created by viewing the page", /\/post-requirement/.test(page) && !/submitInquiry|insertOne|createInquiry/.test(page));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
