// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/40-product-draft-rules-unit-test.mjs
import assert from "node:assert/strict";
const r = await import("../../../src/lib/supplier/productDraftRules.ts");
assert.equal(r.parsePaise("120"), 12000);
assert.equal(r.parsePaise("120.5"), 12050);
assert.equal(r.parsePaise("0.07"), 7);
for (const bad of ["", "-1", "1e3", "1.234", "abc", "1234567890", "Infinity"]) assert.equal(r.parsePaise(bad), null, bad);
assert.equal(r.formatPaise(12050), "120.50");
assert.equal(r.parseMoq("0"), null);
assert.equal(r.parseMoq("100"), 100);
assert.equal(r.normalizeSku(" cot 015 "), "COT-015");
const base = { ...r.EMPTY_DRAFT };
assert.ok(r.validateDraftShape({ ...base, price: "0" }).price, "zero price rejected");
assert.ok(r.validateDraftShape({ ...base, description: "<script>x</script>" }).description);
const rev = r.reviewDraft({ ...base, name: "A", description: "d", pricingMode: "ON_REQUEST", moq: "5", quantityUnit: "kg" }, true, 1);
assert.deepEqual(rev.missing, []);
assert.equal(rev.canPublish, false);
assert.ok(r.reviewDraft({ ...base, pricingMode: "FIXED", price: "1", priceUnit: "kg", moq: "1", quantityUnit: "metre", name: "A", description: "d" }, true, 1).missing.some((m) => m.includes("match")));
console.log("ok");
