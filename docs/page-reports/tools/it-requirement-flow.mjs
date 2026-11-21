// INTEGRATION test (writes to a database): a GENERAL REQUIREMENT (Post Your Requirement) on the canonical inquiry model -> MATCHED leads -> supplier inbox -> private conversation.
// Runs ONLY against an explicitly configured, transaction-capable, isolated test database (it-guard.mjs). NOT run in the build environment (no isolated database).
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_req TEST_DB_CONFIRM=finbyn_it_req AUTH_SECRET=<any test value> \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-requirement-flow.mjs
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
process.env.AUTH_SECRET ??= "integration-test-secret-integration";
const { submitInquiry } = await import("../../../src/lib/inquiries/service.ts");
const { runDistribution, distributionCollections, distributionStatus } = await import("../../../src/lib/leads/distribution.ts");
const { findInquiryFor } = await import("../../../src/lib/leads/access.ts");
const { resolveSupplierContext } = await import("../../../src/lib/supplier/company.ts");
const { listSupplierInbox } = await import("../../../src/lib/supplier/inquiryListService.ts");
const { sendResponse } = await import("../../../src/lib/supplier/inquiryService.ts");
const { listResponders } = await import("../../../src/lib/inquiries/conversations.ts");
const { listBuyerInquiryPage } = await import("../../../src/lib/inquiries/buyerList.ts");
const C = await import("../../../src/lib/leads/catalogCandidates.ts");
const { getCatalog } = await import("../../../src/lib/catalog/data.ts");

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
const k = () => crypto.randomUUID().replace(/-/g, "").padEnd(24, "x");
const pick = getCatalog().products.map((p) => ({ p, req: C.requirementOf(p.id) })).filter((x) => x.req).map((x) => ({ ...x, cands: C.equivalentCandidates(x.req.signature, "") })).sort((a, b) => b.cands.length - a.cands.length)[0];
assert.ok(pick && pick.cands.length >= 3, "needs a product offered by at least three sellers (including the reference product's own)");
const mkCompany = async (keys) => {
  const ownerUserId = new ObjectId(), _id = new ObjectId();
  await t.db.collection("users").insertOne(t.tag({ _id: ownerUserId, name: "Owner", email: `${_id}@fixture.invalid`, role: "supplier", supplier: { businessName: `Fixture Co ${_id.toHexString().slice(-5)}`, phone: "", city: "Pune", offering: "" } }));
  await t.db.collection("supplier_companies").insertOne(t.tag({ _id, ownerUserId, sellerKeys: keys, status: "ACTIVE", verificationStatus: "UNVERIFIED", createdAt: new Date(), updatedAt: new Date() }));
  return { _id, ownerUserId, uid: ownerUserId.toHexString() };
};
const owners = pick.cands.map((c) => c.sellerKey);
const refCo = await mkCompany([pick.req.sellerKey]);
const others = [];
for (const c of pick.cands.filter((c) => c.sellerKey !== pick.req.sellerKey).slice(0, 2)) others.push(await mkCompany([c.sellerKey]));
const outsider = await mkCompany(["fixture-unrelated-seller"]);
assert.ok(owners.includes(pick.req.sellerKey));
const buyer = new ObjectId().toHexString();
const created = [];
const post = async (key = k(), over = {}) => {
  const r = await submitInquiry({ kind: "buyer", buyerId: buyer }, { productKey: String(pick.p.id), productName: pick.p.name, categoryName: pick.p.categoryName, supplierKey: "", supplierName: "", source: "catalog", quantity: 300 + created.length, unit: "Piece", message: "Need this delivered in rolls.", inquiryType: "BULK_REQUIREMENT", sourceType: "GENERAL_REQUIREMENT", deliveryLocation: { text: "Surat" }, requiredBy: new Date("2027-01-15T00:00:00Z"), ...over }, key);
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.replay) created.push(new ObjectId(r.id));
  return r;
};
const ctx = (c) => resolveSupplierContext(c.uid);
let req;
await check("a general requirement is stored once, with no selected supplier, and a durable job; a retried key returns the original", async () => {
  const key = k();
  req = await post(key);
  const again = await post(key);
  assert.ok(again.replay && again.reference === req.reference);
  const doc = await t.db.collection("inquiries").findOne({ _id: new ObjectId(req.id) });
  assert.equal(doc.sourceType, "GENERAL_REQUIREMENT"); assert.equal(doc.supplierKey, ""); assert.equal(doc.supplierName, "");
  assert.equal(await t.db.collection("inquiries").countDocuments({ reference: req.reference }), 1);
  assert.equal((await distributionStatus(new ObjectId(req.id))).state, "PENDING");
  assert.equal(await t.db.collection("requirements").countDocuments({}), 0, "the legacy collection is not written");
});
await check("every eligible company, including the reference product's own seller, gets exactly one MATCHED lead and nobody is DIRECT", async () => {
  await runDistribution({ maxJobs: 10, batchSize: 1 });
  await runDistribution({ maxJobs: 10 }); // a retry changes nothing
  const rs = await (await distributionCollections()).recipients.find({ inquiryId: new ObjectId(req.id) }).toArray();
  const ids = rs.map((r) => r.companyId.toHexString());
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(refCo._id.toHexString()), "the reference seller passes the same eligibility and is just a matching supplier");
  for (const o of others) assert.ok(ids.includes(o._id.toHexString()));
  assert.ok(!ids.includes(outsider._id.toHexString()));
  assert.ok(rs.every((r) => r.type === "MATCHED"));
  assert.equal(await t.db.collection("supplier_notifications").countDocuments({ dedupeKey: `lead:${req.reference}` }), ids.length);
  assert.equal((await distributionStatus(new ObjectId(req.id))).state, "COMPLETED");
});
await check("the reference product's supplier sees it as a Matching lead, never Direct", async () => {
  const c = await ctx(refCo);
  const direct = await listSupplierInbox(c, { kind: "direct" });
  assert.ok(!direct.items.some((x) => x.reference === req.reference));
  const matched = await listSupplierInbox(c, { kind: "matched" });
  const row = matched.items.find((x) => x.reference === req.reference);
  assert.ok(row && row.kind === "MATCHED" && row.location === "Surat");
  const view = await findInquiryFor(c, { reference: req.reference });
  assert.equal(view.recipientType, "MATCHED");
  assert.ok(!("guest" in view) && !("matchedSupplierKeys" in view));
});
await check("a company with no relationship cannot open it", async () => {
  assert.equal(await findInquiryFor(await ctx(outsider), { reference: req.reference }), null);
});
await check("the buyer's list labels it a General Requirement with no selected supplier", async () => {
  const page = await listBuyerInquiryPage(buyer, { page: 1, limit: 20, sort: "newest", status: "all" });
  const row = page.inquiries.find((r) => r.reference === req.reference);
  assert.ok(row);
  assert.equal(row.inquiryTypeLabel, "General Requirement");
  assert.equal(row.supplier.name, "Matching suppliers");
});
await check("a matching supplier can reply privately; the buyer sees it as 'Matching supplier' (nobody is 'Selected')", async () => {
  const c = await ctx(others[0]);
  const r = await sendResponse(c, { id: others[0].uid }, req.reference, { type: "RESPONSE", message: "We can supply this product in that quantity.", idempotencyKey: k() });
  assert.ok(r.ok, JSON.stringify(r));
  const resp = await listResponders(buyer, req.reference);
  assert.equal(resp.responders.length, 1);
  assert.equal(resp.responders[0].originLabel, "Matching supplier");
  const { recipients } = await distributionCollections();
  const mine = await recipients.findOne({ inquiryId: new ObjectId(req.id), companyId: others[0]._id });
  const other = await recipients.findOne({ inquiryId: new ObjectId(req.id), companyId: others[1]._id });
  assert.equal(mine.status, "REPLIED"); assert.equal(other.status, "NEW");
});
await check("closing a requirement before the worker runs stops distribution and creates no lead", async () => {
  const q = await post(k());
  await t.db.collection("inquiries").updateOne({ _id: new ObjectId(q.id) }, { $set: { status: "CANCELLED" } });
  await runDistribution({ maxJobs: 10 });
  assert.equal(await (await distributionCollections()).recipients.countDocuments({ inquiryId: new ObjectId(q.id) }), 0);
  assert.equal((await distributionStatus(new ObjectId(q.id))).state, "STOPPED");
});
await check("a repeat of the same requirement within minutes is refused (not a second requirement)", async () => {
  const dup = await submitInquiry({ kind: "buyer", buyerId: buyer }, { productKey: String(pick.p.id), productName: pick.p.name, supplierKey: "", supplierName: "", source: "catalog", quantity: 300, unit: "Piece", inquiryType: "BULK_REQUIREMENT", sourceType: "GENERAL_REQUIREMENT" }, k());
  assert.equal(dup.ok, false);
  assert.equal(dup.code, "DUPLICATE");
});
await check("old requirements are never redistributed or notified", async () => {
  await t.db.collection("requirements").insertOne(t.tag({ userId: new ObjectId(buyer), product: "legacy cotton", quantity: 5, city: "Pune", status: "open", createdAt: new Date() }));
  const before = await t.db.collection("inquiries").countDocuments({ buyerId: new ObjectId(buyer) });
  await runDistribution({ maxJobs: 10 });
  assert.equal(await t.db.collection("inquiries").countDocuments({ buyerId: new ObjectId(buyer) }), before);
});

const ids = created;
await t.db.collection("inquiry_messages").deleteMany({ inquiryId: { $in: ids } });
await t.db.collection("distribution_jobs").deleteMany({ inquiryId: { $in: ids } });
await t.db.collection("inquiry_recipients").deleteMany({ inquiryId: { $in: ids } });
await t.db.collection("notification_outbox").deleteMany({ inquiryReference: req.reference });
await t.db.collection("inquiries").deleteMany({ _id: { $in: ids } });
await t.db.collection("supplier_notifications").deleteMany({ supplierId: { $in: [refCo, ...others, outsider].map((c) => c.ownerUserId) } });
await t.cleanup(["supplier_companies", "users", "requirements", "idempotency_keys"]);
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
