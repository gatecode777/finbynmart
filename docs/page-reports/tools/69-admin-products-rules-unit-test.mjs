// Admin Product Management: behaviour of the pure rules (listing status, effective visibility, supported actions, exact price text, reason validation, query filter safety,
// CSV safety, capabilities). No database. The database workflow (scoped list, unpublish transaction, concurrency, audit/outbox, public removal) is in it-admin-products.mjs (BLOCKED here).
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/69-admin-products-rules-unit-test.mjs
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const L = await import("../../../src/lib/admin/productList.ts");
const M = await import("../../../src/lib/admin/productManagement.ts");
const P = await import("../../../src/lib/admin/permissions.ts");
const { csvCell } = await import("../../../src/lib/supplier/quotationRules.ts");

// ---- status derivation: public visibility is separate from moderation state
const d = L.deriveListing;
check("approved and not unpublished = PUBLISHED, with no pending changes", JSON.stringify(d({ publicationApproved: true, archived: false, reviewState: "APPROVED" })) === JSON.stringify({ status: "PUBLISHED", pendingChanges: false }));
check("a published listing with a replacement under review stays PUBLISHED and is flagged pendingChanges (never 'unpublished because edits exist')", JSON.stringify(d({ publicationApproved: true, archived: false, reviewState: "PENDING" })) === JSON.stringify({ status: "PUBLISHED", pendingChanges: true }));
check("an unpublished listing is UNPUBLISHED whatever its review state (a later approval does not restore it)", d({ publicationApproved: true, archived: true, reviewState: "APPROVED" }).status === "UNPUBLISHED" && d({ publicationApproved: true, archived: true, reviewState: "PENDING" }).status === "UNPUBLISHED" && d({ publicationApproved: true, archived: true, reviewState: "PENDING" }).pendingChanges === false);
check("never-published products: pending and rejected are distinct, and a draft that was never submitted has no admin status at all", d({ publicationApproved: false, archived: false, reviewState: "PENDING" }).status === "PENDING_REVIEW" && d({ publicationApproved: false, archived: false, reviewState: "REJECTED" }).status === "REJECTED" && d({ publicationApproved: false, archived: false }) === null);
check("effective public visibility needs approval AND no unpublish", L.isEffectivelyPublic({ publicationApproved: true, archived: false }) && !L.isEffectivelyPublic({ publicationApproved: true, archived: true }) && !L.isEffectivelyPublic({ publicationApproved: false, archived: false }));
check("unpublish is offered only for a PUBLISHED listing and only with the capability", L.canUnpublishRow("PUBLISHED", true) && !L.canUnpublishRow("PUBLISHED", false) && ["PENDING_REVIEW", "UNPUBLISHED", "REJECTED"].every((s) => !L.canUnpublishRow(s, true)));

// ---- exact price text (integer paise, never zero for a missing price)
const pt = L.priceText;
check("fixed prices are exact with grouping and units", pt({ pricingMode: "FIXED", unitPricePaise: 12000, priceUnit: "metre" }) === "₹120 / metre" && pt({ pricingMode: "FIXED", unitPricePaise: 12050, priceUnit: "kg" }) === "₹120.50 / kg" && pt({ pricingMode: "FIXED", unitPricePaise: 123456789, priceUnit: "piece" }) === "₹1,234,567.89 / piece".replace("1,234,567", (1234567).toLocaleString("en-IN")));
check("price on request is stated; a missing, zero, negative or fractional price is null, never zero", pt({ pricingMode: "ON_REQUEST" }) === "Price on request" && [{}, { pricingMode: "FIXED" }, { pricingMode: "FIXED", unitPricePaise: 0 }, { pricingMode: "FIXED", unitPricePaise: -5 }, { pricingMode: "FIXED", unitPricePaise: 10.5 }, { pricingMode: "RANGE", unitPricePaise: 100 }].every((s) => pt(s) === null));
check("MOQ text needs a positive whole number", L.moqText({ moq: 100, quantityUnit: "metre" }) === "MOQ 100 metre" && L.moqText({ moq: 0 }) === null && L.moqText({ moq: 1.5 }) === null && L.moqText({}) === null);

// ---- reason
check("the unpublish reason is bounded after trimming", L.validateUnpublishReason("   short  ") !== null && L.validateUnpublishReason("x".repeat(501)) !== null && L.validateUnpublishReason("Listing breaks the policy.") === null);

// ---- query filter safety
const base = { ...L.EMPTY_QUERY };
const json = (q) => JSON.stringify(M.buildFilter({ ...base, ...q }));
check("the admin set excludes never-submitted drafts by construction", /"publication":\{"\$exists":true\}/.test(json({})) && /"draft\.review":\{"\$exists":true\}/.test(json({})));
check("status filters mean exactly the derived definitions", /"archivedAt":\{"\$exists":false\}/.test(json({ status: "PUBLISHED" })) && /"archivedAt":\{"\$exists":true\}/.test(json({ status: "UNPUBLISHED" })) && /"draft\.review\.state":"PENDING"/.test(json({ status: "PENDING_REVIEW" })) && /"draft\.review\.state":"REJECTED"/.test(json({ status: "REJECTED" })));
check("search text is escaped and anchored: a regex or operator payload becomes a literal prefix, never a pattern or an operator", (() => { const nameRe = (q) => M.buildFilter({ ...base, q }).$and.at(-1).$or[0].name.$regex; const dot = nameRe(".*"); const op = nameRe('{"$ne":null}'); return dot === "^\\.\\*" && op.startsWith("^") && !/(^|[^\\])\$ne/.test(op) && M.buildFilter({ ...base, q: '{"$ne":null}' }).$and.at(-1).$or[0].name.$options === "i"; })());
check("an invalid supplier id matches nothing (never everything); a valid one filters by company", (() => { const bad = M.buildFilter({ ...base, supplier: "not-an-id" }); const good = M.buildFilter({ ...base, supplier: new ObjectId().toHexString() }); return JSON.stringify(bad).includes("_id") && JSON.stringify(good).includes("companyId"); })());
check("a 24-hex search term also matches that exact product reference", /"_id"/.test(json({ q: new ObjectId().toHexString() })));

// ---- CSV
check("CSV cells that start like a formula are neutralised", ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\t=1", "\r=1"].every((v) => !/^[=+\-@\t\r]/.test(csvCell(v).replace(/^"/, ""))));

// ---- capabilities (separate boundaries)
check("product capabilities are separate and every one is a known capability", ["products.read", "products.review", "products.unpublish", "products.export"].every((c) => P.ADMIN_CAPABILITIES.includes(c)));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
