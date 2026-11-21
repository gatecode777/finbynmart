// INTEGRATION test (writes to a database): structured specifications through draft -> review -> approval -> public snapshot, and attribute matching (policy match-2) for approved
// supplier products as requirement references (general requirement and direct inquiry). Runs ONLY against an explicitly configured, transaction-capable, isolated test database
// (it-guard.mjs). NOT run in the build environment (no isolated database).
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_spec TEST_DB_CONFIRM=finbyn_it_spec AUTH_SECRET=<any test value> \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-specifications-flow.mjs
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
process.env.AUTH_SECRET ??= "integration-test-secret-integration";
const { decide } = await import("../../../src/lib/admin/productReview.ts");
const { refreshApproved } = await import("../../../src/lib/catalog/approvedProducts.ts");
const { getApproved } = await import("../../../src/lib/catalog/approvedStore.ts");
const { submitInquiry } = await import("../../../src/lib/inquiries/service.ts");
const { runDistribution, distributionCollections } = await import("../../../src/lib/leads/distribution.ts");
const { findInquiryFor } = await import("../../../src/lib/leads/access.ts");
const { resolveSupplierContext } = await import("../../../src/lib/supplier/company.ts");
const { listSupplierInbox } = await import("../../../src/lib/supplier/inquiryListService.ts");

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
const k = () => crypto.randomUUID().replace(/-/g, "").padEnd(24, "x");
const cell = (value, unit) => ({ value, ...(unit ? { unit } : {}) });
const owners = [];
const mkCompany = async (sellerKeys = []) => {
  const ownerUserId = new ObjectId(), _id = new ObjectId();
  await t.db.collection("users").insertOne(t.tag({ _id: ownerUserId, name: "Owner", email: `${_id}@fixture.invalid`, role: "supplier", supplier: { businessName: `Fixture Mills ${_id.toHexString().slice(-5)}`, phone: "", city: "Surat", offering: "" } }));
  await t.db.collection("supplier_companies").insertOne(t.tag({ _id, ownerUserId, sellerKeys, status: "ACTIVE", verificationStatus: "UNVERIFIED", createdAt: new Date(), updatedAt: new Date() }));
  owners.push(ownerUserId);
  return { _id, uid: ownerUserId.toHexString() };
};
const SNAP = (name, attributes, over = {}) => ({ name, sku: "", description: "Fixture fabric", categoryId: "apparel-fashion", categoryName: "Apparel & Fashion", pricingMode: "FIXED", currency: "INR", unitPricePaise: 15000, priceUnit: "metre", moq: 50, quantityUnit: "metre", attributes, images: [{ fileId: "f1", url: "https://ik.imagekit.io/fixture/a.jpg", name: "a.jpg" }], ...over });
const base = { type: cell("fabric"), composition: cell("cotton"), colour: cell("Navy Blue"), gsm: cell(140), width: cell(44, "inch") };
const mkPending = async (companyId, slug, attributes) => {
  const _id = new ObjectId();
  await t.db.collection("supplier_products").insertOne(t.tag({ _id, companyId, slug, name: slug, sku: "", categoryName: "Apparel & Fashion", price: 150, unit: "metre", stock: 0, status: "DRAFT", imageUrl: "", description: "x", createdAt: new Date(), updatedAt: new Date(), draft: { revision: 1, createdBy: new ObjectId(), idempotencyKey: k(), bodyHash: "x", categoryId: "apparel-fashion", pricingMode: "FIXED", currency: "INR", unitPricePaise: 15000, priceUnit: "metre", moq: 50, quantityUnit: "metre", attributes, review: { state: "PENDING", submittedRevision: 1, submittedAt: new Date(), submittedBy: new ObjectId(), snapshot: SNAP(slug, attributes) } } }));
  return _id;
};
const admin = new ObjectId();
const approve = async (id) => { const r = await decide(admin, id.toHexString(), { decision: "APPROVE", expectedRevision: 1 }); assert.ok(r.ok, JSON.stringify(r)); };

const A = await mkCompany(), B = await mkCompany(), C = await mkCompany(), D = await mkCompany();
const pA = await mkPending(A._id, "fixture-cotton-a", base);
const pB1 = await mkPending(B._id, "fixture-cotton-b1", { ...base, gsm: cell(145) });
const pB2 = await mkPending(B._id, "fixture-cotton-b2", { ...base, gsm: cell(138) });
const pC = await mkPending(C._id, "fixture-poly-c", { ...base, composition: cell("polyester") });
const noGsm = { ...base }; delete noGsm.gsm;
const pD = await mkPending(D._id, "fixture-cotton-d", noGsm);
for (const id of [pA, pB1, pB2, pC, pD]) await approve(id);
await refreshApproved();
const idOf = (id) => `sp-${id.toHexString()}`;
const created = [];
const post = async (over) => {
  const r = await submitInquiry({ kind: "buyer", buyerId: new ObjectId().toHexString() }, { productName: "x", categoryName: "Apparel & Fashion", source: "supplier", quantity: 100, unit: "Metre", inquiryType: "BULK_REQUIREMENT", deliveryLocation: { text: "Surat" }, ...over }, k());
  assert.ok(r.ok, JSON.stringify(r)); created.push(new ObjectId(r.id)); return r;
};
const recipientIds = async (inquiryId) => (await (await distributionCollections()).recipients.find({ inquiryId: new ObjectId(inquiryId) }).toArray()).map((r) => r.companyId.toHexString());

await check("specifications persist draft -> submitted snapshot -> approved public snapshot and display consistently", async () => {
  const live = getApproved().byId.get(idOf(pA));
  assert.equal(live.attributes.composition.value, "cotton");
  assert.equal(live.attributes.width.unit, "inch");
  assert.ok(live.specs.length >= 3 && live.specs.every((s) => s.label && s.value));
  const doc = await t.db.collection("supplier_products").findOne({ _id: pA });
  assert.equal(doc.publication.snapshot.attributes.colour.value, "Navy Blue");
});
await check("a pending edit does not change the live approved specifications", async () => {
  await t.db.collection("supplier_products").updateOne({ _id: pA }, { $set: { "draft.attributes.composition": cell("silk"), "draft.revision": 2, "draft.review": { state: "PENDING", submittedRevision: 2, submittedAt: new Date(), submittedBy: new ObjectId(), snapshot: SNAP("edit", { ...base, composition: cell("silk") }) } } });
  await refreshApproved();
  assert.equal(getApproved().byId.get(idOf(pA)).attributes.composition.value, "cotton");
});
await check("a snapshot with specifications invalid for its category cannot be approved (no bypass)", async () => {
  const bad = await mkPending(A._id, "fixture-bad-attrs", { type: cell("fabric"), composition: cell("unobtainium"), colour: cell("Red") });
  const r = await decide(admin, bad.toHexString(), { decision: "APPROVE", expectedRevision: 1 });
  assert.equal(r.ok, false); assert.equal(r.status, 409);
  assert.equal((await t.db.collection("supplier_products").findOne({ _id: bad })).publication, undefined);
});
await check("a general requirement on an approved supplier product reaches only compatible companies, one lead per company, never the incompatible or incomplete", async () => {
  const q = await post({ productKey: idOf(pA), supplierKey: "", supplierName: "", sourceType: "GENERAL_REQUIREMENT", requirement: { nodeId: "apparel-fashion", attributes: base, policy: "match-2" } });
  await runDistribution({ maxJobs: 10, batchSize: 1 }); await runDistribution({ maxJobs: 10 });
  const ids = await recipientIds(q.id);
  assert.ok(ids.includes(A._id.toHexString()), "the reference product's supplier is just a matching supplier");
  assert.ok(ids.includes(B._id.toHexString()));
  assert.equal(ids.filter((x) => x === B._id.toHexString()).length, 1, "two matching products of one company are one lead");
  assert.ok(!ids.includes(C._id.toHexString()) && !ids.includes(D._id.toHexString()));
  const row = (await listSupplierInbox(await resolveSupplierContext(A.uid), { kind: "matched" })).items.find((x) => x.reference === q.reference);
  assert.ok(row && row.kind === "MATCHED");
});
await check("a changed buyer value becomes the criterion: asking for polyester matches the polyester company only", async () => {
  const q = await post({ productKey: idOf(pA), supplierKey: "", supplierName: "", sourceType: "GENERAL_REQUIREMENT", requirement: { nodeId: "apparel-fashion", attributes: { ...base, composition: cell("polyester") }, policy: "match-2" } });
  await runDistribution({ maxJobs: 10 });
  assert.deepEqual(await recipientIds(q.id), [C._id.toHexString()]);
});
await check("a direct inquiry keeps its selected supplier and matches others without a duplicate for the direct company", async () => {
  const q = await post({ productKey: idOf(pA), supplierKey: `co:${A._id}`, supplierName: "Fixture A", sourceType: "DIRECT_INQUIRY" });
  await runDistribution({ maxJobs: 10 });
  const ids = await recipientIds(q.id);
  assert.ok(!ids.includes(A._id.toHexString()));
  assert.ok(ids.includes(B._id.toHexString()));
  const direct = await findInquiryFor(await resolveSupplierContext(A.uid), { reference: q.reference });
  assert.equal(direct.recipientType, "DIRECT");
});
await check("an empty supplier key never grants access: a company whose key list somehow contains an empty string still cannot read a general requirement", async () => {
  const q = await post({ productKey: idOf(pC), supplierKey: "", supplierName: "", sourceType: "GENERAL_REQUIREMENT", requirement: { nodeId: "apparel-fashion", attributes: { ...base, composition: cell("wool") }, policy: "match-2" } });
  const sneaky = await mkCompany([""]);
  assert.equal(await findInquiryFor(await resolveSupplierContext(sneaky.uid), { reference: q.reference }), null);
});
await check("a historical job keeps its policy and is not silently re-matched", async () => {
  const { jobs } = await distributionCollections();
  const inquiryId = new ObjectId();
  await t.db.collection("inquiries").insertOne({ _id: inquiryId, reference: "FBM-INQ-HISTORIC", buyerId: new ObjectId(), productKey: "1163", supplierKey: "", supplierName: "", source: "catalog", quantity: 1, status: "NEW", createdAt: new Date() });
  created.push(inquiryId);
  await jobs.insertOne({ _id: new ObjectId(), inquiryId, inquiryReference: "FBM-INQ-HISTORIC", policyVersion: "match-1", requirement: { signature: { categoryId: "x|y|z", nameKey: "nothing like this", colourKey: "" }, directSellerKey: "", productKey: "1163" }, state: "PENDING", cursor: 0, counts: { created: 0, skipped: 0, failedBatches: 0 }, attempts: 0, nextAttemptAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
  await runDistribution({ maxJobs: 10 });
  const job = await jobs.findOne({ inquiryId });
  assert.equal(job.policyVersion, "match-1");
  assert.equal(job.state, "NO_MATCHES");
});

const ids = created;
await t.db.collection("distribution_jobs").deleteMany({ inquiryId: { $in: ids } });
await t.db.collection("inquiry_recipients").deleteMany({ inquiryId: { $in: ids } });
await t.db.collection("inquiries").deleteMany({ _id: { $in: ids } });
await t.db.collection("admin_audit_log").deleteMany({ actorId: admin });
await t.db.collection("supplier_notifications").deleteMany({ supplierId: { $in: owners } });
await t.cleanup(["supplier_companies", "users", "supplier_products"]);
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
