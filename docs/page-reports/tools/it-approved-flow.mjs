// INTEGRATION test (writes to a database): approved supplier product -> public snapshot -> buyer inquiry -> the company's inbox. Runs ONLY against an explicitly
// configured, transaction-capable, isolated test database (it-guard.mjs). NOT run in the build environment (no isolated database was available).
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_catalog TEST_DB_CONFIRM=finbyn_it_catalog \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-approved-flow.mjs
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
const { refreshApproved } = await import("../../../src/lib/catalog/approvedProducts.ts");
const { getApproved } = await import("../../../src/lib/catalog/approvedStore.ts");
const { getPublicProductBySlug } = await import("../../../src/lib/catalog/productDetail.ts");
const { getPublicSupplierBySlug } = await import("../../../src/lib/catalog/supplierDetail.ts");
const { getProductListing, parseListingQuery } = await import("../../../src/lib/catalog/categoryListing.ts");
const { submitInquiry } = await import("../../../src/lib/inquiries/service.ts");
const { resolveProduct, resolveSupplier } = await import("../../../src/lib/catalog/productRef.ts");
const { resolveSupplierContext } = await import("../../../src/lib/supplier/company.ts");
const { listSupplierInbox } = await import("../../../src/lib/supplier/inquiryListService.ts");
const { findInquiryFor } = await import("../../../src/lib/leads/access.ts");

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
const created = { inquiries: [] };
const mkCompany = async (status = "ACTIVE") => {
  const ownerUserId = new ObjectId(), _id = new ObjectId();
  await t.db.collection("users").insertOne(t.tag({ _id: ownerUserId, name: "Owner", email: `${_id}@fixture.invalid`, role: "supplier", supplier: { businessName: `Fixture Fasteners ${_id.toHexString().slice(-4)}`, phone: "", city: "Pune", offering: "Bolts" } }));
  await t.db.collection("supplier_companies").insertOne(t.tag({ _id, ownerUserId, sellerKeys: [], status, verificationStatus: "UNVERIFIED", createdAt: new Date(), updatedAt: new Date() }));
  return { _id, ownerUserId };
};
const snap = (name, over = {}) => ({ name, sku: "", description: "Approved description", categoryId: "industrial-machinery", categoryName: "Industrial Machinery", pricingMode: "FIXED", currency: "INR", unitPricePaise: 12500, priceUnit: "piece", moq: 10, quantityUnit: "piece", images: [{ fileId: "f1", url: "https://ik.imagekit.io/fixture/a.jpg", name: "a.jpg" }], ...over });
const mkProduct = async (companyId, slug, fields) => {
  const _id = new ObjectId();
  await t.db.collection("supplier_products").insertOne(t.tag({ _id, companyId, slug, name: "x", sku: "", categoryName: "x", price: 0, unit: "x", stock: 0, status: "DRAFT", imageUrl: "", description: "", createdAt: new Date(), updatedAt: new Date(), ...fields }));
  return _id;
};
const now = new Date();
const co = await mkCompany();
const approvedId = await mkProduct(co._id, "fixture-bolt-aaaaaa", { publication: { state: "APPROVED", revision: 1, approvedAt: now, approvedBy: new ObjectId(), snapshot: snap("Fixture Hex Bolt") }, draft: { revision: 2, review: { state: "PENDING", submittedRevision: 2, snapshot: snap("PENDING EDIT NAME", { unitPricePaise: 99999 }) } }, name: "DRAFT EDIT NAME" });
const draftOnly = await mkProduct(co._id, "fixture-draft-bbbbbb", { draft: { revision: 1 }, name: "Only a draft" });
const rejected = await mkProduct(co._id, "fixture-rejected-cccccc", { draft: { revision: 1, review: { state: "REJECTED", snapshot: snap("Rejected thing") } } });
const archived = await mkProduct(co._id, "fixture-archived-dddddd", { archivedAt: now, publication: { state: "APPROVED", revision: 1, approvedAt: now, approvedBy: new ObjectId(), snapshot: snap("Archived bolt") } });
const badCat = await mkProduct(co._id, "fixture-nocat-eeeeee", { publication: { state: "APPROVED", revision: 1, approvedAt: now, approvedBy: new ObjectId(), snapshot: snap("No category bolt", { categoryId: "does-not-exist" }) } });
const sleeper = await mkCompany("SUSPENDED");
await mkProduct(sleeper._id, "fixture-suspended-ffffff", { publication: { state: "APPROVED", revision: 1, approvedAt: now, approvedBy: new ObjectId(), snapshot: snap("Suspended company bolt") } });
const onRequest = await mkProduct(co._id, "fixture-onreq-111111", { publication: { state: "APPROVED", revision: 1, approvedAt: now, approvedBy: new ObjectId(), snapshot: snap("Fixture Quote Bolt", { pricingMode: "ON_REQUEST", unitPricePaise: null }) } });

await check("only eligible approved products are loaded; every other state stays private", async () => {
  const rep = await refreshApproved();
  const slugs = new Set(getApproved().items.map((i) => i.slug));
  assert.ok(slugs.has("fixture-bolt-aaaaaa") && slugs.has("fixture-onreq-111111"), JSON.stringify(rep));
  for (const hidden of ["fixture-draft-bbbbbb", "fixture-rejected-cccccc", "fixture-archived-dddddd", "fixture-nocat-eeeeee", "fixture-suspended-ffffff"]) assert.ok(!slugs.has(hidden), hidden);
});
await check("a pending edit does not replace the live approved content", async () => {
  const d = getPublicProductBySlug("fixture-bolt-aaaaaa");
  assert.equal(d.name, "Fixture Hex Bolt");
  assert.equal(d.pricing.min, 125);
  assert.ok(!JSON.stringify(d).includes("PENDING EDIT") && !JSON.stringify(d).includes("DRAFT EDIT"));
});
await check("a draft, rejected, archived or unknown slug resolves to nothing (same as an unknown product)", async () => {
  for (const s of ["fixture-draft-bbbbbb", "fixture-rejected-cccccc", "fixture-archived-dddddd", "nope"]) assert.equal(getPublicProductBySlug(s), undefined);
});
await check("the product is listed, searchable, on its supplier profile, with the company identity and a price-on-request item has no price", async () => {
  const l = getProductListing(parseListingQuery({ q: "fixture hex bolt" }));
  assert.ok(l.results.items.some((i) => i.card.id === `sp-${approvedId}`));
  const s = getPublicSupplierBySlug(`c-${co._id}`);
  assert.equal(s.productCount, 2);
  assert.equal(getPublicProductBySlug("fixture-onreq-111111").pricing.type, "on_request");
});
await check("unpublishing (archivedAt) removes it after the next refresh", async () => {
  await t.db.collection("supplier_products").updateOne({ _id: approvedId }, { $set: { archivedAt: new Date() } });
  await refreshApproved();
  assert.equal(getPublicProductBySlug("fixture-bolt-aaaaaa"), undefined);
  await t.db.collection("supplier_products").updateOne({ _id: approvedId }, { $unset: { archivedAt: "" } });
  await refreshApproved();
});

const buyerId = new ObjectId().toHexString();
await check("an inquiry for an approved product goes to the OWNING company (original, direct), visible in its inbox and nowhere else", async () => {
  const p = resolveProduct(`sp-${approvedId}`);
  const s = resolveSupplier(`c-${co._id}`);
  assert.equal(p.supplierKey, s.key);
  const r = await submitInquiry({ kind: "buyer", buyerId }, { productKey: p.key, productName: p.name, supplierKey: s.key, supplierName: s.name, source: "supplier", quantity: 50, unit: "Piece", inquiryType: "PRODUCT_INQUIRY" }, crypto.randomUUID().replace(/-/g, "").padEnd(24, "x"));
  assert.ok(r.ok); created.inquiries.push(new ObjectId(r.id));
  const ctx = await resolveSupplierContext(co.ownerUserId.toHexString());
  assert.ok(ctx.company.sellerKeys.includes(`co:${co._id}`));
  const inbox = await listSupplierInbox(ctx, {});
  assert.ok(inbox.items.some((x) => x.reference === r.reference && x.kind === "DIRECT"));
  assert.ok(await findInquiryFor(ctx, { reference: r.reference }));
  const other = await mkCompany();
  const octx = await resolveSupplierContext(other.ownerUserId.toHexString());
  assert.equal(await findInquiryFor(octx, { reference: r.reference }), null);
  assert.equal(await t.db.collection("distribution_jobs").countDocuments({ inquiryId: new ObjectId(r.id) }), 0, "supplier products are not matched (catalogue products only)");
});

await t.db.collection("inquiries").deleteMany({ _id: { $in: created.inquiries } });
await t.cleanup(["supplier_companies", "users", "supplier_products"]);
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
