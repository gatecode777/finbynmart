// INTEGRATION test (writes to a database) for automatic matching lead distribution. Runs ONLY against an explicitly configured, transaction-capable,
// isolated test database (see it-guard.mjs and docs/testing/TEST_ENVIRONMENT.md). It has NOT been run in the build environment (no isolated database).
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_leads TEST_DB_CONFIRM=finbyn_it_leads \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-lead-distribution.mjs
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
const { submitInquiry } = await import("../../../src/lib/inquiries/service.ts");
const { runDistribution, distributionCollections, distributionStatus } = await import("../../../src/lib/leads/distribution.ts");
const { findInquiryFor } = await import("../../../src/lib/leads/access.ts");
const { resolveSupplierContext } = await import("../../../src/lib/supplier/company.ts");
const { sendResponse } = await import("../../../src/lib/supplier/inquiryService.ts");
const C = await import("../../../src/lib/leads/catalogCandidates.ts");
const { getCatalog } = await import("../../../src/lib/catalog/data.ts");

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
const created = { inquiries: [], users: [], companies: [] };

// a requested listing with several other sellers offering the exact same product
const pick = getCatalog().products.map((p) => ({ p, req: C.requirementOf(p.id) })).filter((x) => x.req).map((x) => ({ ...x, cands: C.equivalentCandidates(x.req.signature, x.req.sellerKey) })).sort((a, b) => b.cands.length - a.cands.length)[0];
assert.ok(pick && pick.cands.length >= 3, "the catalogue needs a product offered by at least three other sellers");
const unrelated = getCatalog().products.find((p) => !C.equivalentCandidates(pick.req.signature, "").some((c) => c.sellerKey === C.sellerKeyOf(p.sellerId)) && C.sellerKeyOf(p.sellerId) !== pick.req.sellerKey);

const mkCompany = async (keys, status = "ACTIVE") => {
  const ownerUserId = new ObjectId();
  const _id = new ObjectId();
  await t.db.collection("users").insertOne(t.tag({ _id: ownerUserId, name: "Fixture Owner", email: `${_id}@fixture.invalid`, role: "supplier", supplier: { businessName: `Fixture Co ${_id.toHexString().slice(-5)}`, phone: "", city: "", offering: "" } }));
  await t.db.collection("supplier_companies").insertOne(t.tag({ _id, ownerUserId, sellerKeys: keys, status, verificationStatus: "UNVERIFIED", createdAt: new Date(), updatedAt: new Date() }));
  created.users.push(ownerUserId); created.companies.push(_id);
  return { companyId: _id, ownerUserId };
};
const buyerId = new ObjectId().toHexString();
const submit = async (key = crypto.randomUUID().replace(/-/g, "").padEnd(24, "x")) => {
  const r = await submitInquiry({ kind: "buyer", buyerId }, { productKey: String(pick.p.id), productName: pick.p.name, supplierKey: pick.req.sellerKey, supplierName: "Fixture Direct", source: "catalog", quantity: 500 + created.inquiries.length, unit: "Piece", inquiryType: "PRODUCT_INQUIRY" }, key);
  assert.ok(r.ok, JSON.stringify(r));
  created.inquiries.push(new ObjectId(r.id));
  return r;
};
const recipientsOf = async (inquiryId) => (await distributionCollections()).recipients.find({ inquiryId: new ObjectId(inquiryId) }).toArray();

const direct = await mkCompany([pick.req.sellerKey]);
const matchedCos = [];
for (const c of pick.cands.slice(0, 3)) matchedCos.push({ ...(await mkCompany([c.sellerKey])), key: c.sellerKey });
const twoSellers = pick.cands.length >= 5 ? await mkCompany([pick.cands[3].sellerKey, pick.cands[4].sellerKey]) : null;
const outsider = await mkCompany([C.sellerKeyOf(unrelated.sellerId)]);
const expected = matchedCos.length + (twoSellers ? 1 : 0);

await check("the direct inquiry and the durable job are stored together; a retried key returns the original", async () => {
  const key = crypto.randomUUID().replace(/-/g, "").padEnd(24, "x");
  const a = await submit(key); const again = await submitInquiry({ kind: "buyer", buyerId }, { productKey: String(pick.p.id), productName: pick.p.name, supplierKey: pick.req.sellerKey, supplierName: "Fixture Direct", source: "catalog", quantity: 500, unit: "Piece", inquiryType: "PRODUCT_INQUIRY" }, key);
  assert.ok(again.ok && again.replay && again.reference === a.reference);
  const st = await distributionStatus(new ObjectId(a.id));
  assert.equal(st.state, "PENDING");
  assert.equal(await (await distributionCollections()).jobs.countDocuments({ inquiryId: new ObjectId(a.id) }), 1);
});

let main;
await check("matching creates exactly one MATCHED recipient per eligible company: not the direct company, not an unrelated one", async () => {
  main = await submit();
  const rep = await runDistribution({ maxJobs: 20, batchSize: 2 }); // several batches (2 per batch) and no first-page truncation
  const rs = await recipientsOf(main.id);
  assert.equal(rs.length, expected, JSON.stringify(rep));
  const ids = new Set(rs.map((r) => r.companyId.toHexString()));
  assert.ok(!ids.has(direct.companyId.toHexString()), "the direct company gets no matched copy");
  assert.ok(!ids.has(outsider.companyId.toHexString()), "an unrelated company gets nothing");
  assert.equal(ids.size, rs.length);
  assert.equal((await distributionStatus(new ObjectId(main.id))).state, "COMPLETED");
});
await check("re-running changes nothing (no duplicate recipients or notices)", async () => {
  await runDistribution({ maxJobs: 5 });
  assert.equal((await recipientsOf(main.id)).length, expected);
  const notes = await t.db.collection("supplier_notifications").countDocuments({ dedupeKey: `lead:${main.reference}` });
  assert.equal(notes, expected);
});
await check("two workers at once cannot duplicate recipients", async () => {
  const q = await submit();
  await Promise.all([runDistribution({ maxJobs: 5, batchSize: 1 }), runDistribution({ maxJobs: 5, batchSize: 1 }), runDistribution({ maxJobs: 5, batchSize: 1 })]);
  assert.equal((await recipientsOf(q.id)).length, expected);
});
await check("a worker that died holding the lease is recovered and resumes without duplicates", async () => {
  const q = await submit();
  const { jobs } = await distributionCollections();
  await runDistribution({ maxJobs: 1, maxBatches: 0 }); // freezes the candidates, creates none
  await jobs.updateOne({ inquiryId: new ObjectId(q.id) }, { $set: { state: "PROCESSING", leaseOwner: "dead-worker", leaseUntil: new Date(Date.now() - 1000) } });
  await runDistribution({ maxJobs: 5 });
  assert.equal((await recipientsOf(q.id)).length, expected);
  assert.equal((await distributionStatus(new ObjectId(q.id))).state, "COMPLETED");
});
await check("a recipient committed before a crash is not repeated when the job restarts from cursor 0", async () => {
  const q = await submit();
  const { jobs } = await distributionCollections();
  await runDistribution({ maxJobs: 1, batchSize: 1, maxBatches: 1 }); // one recipient committed
  await jobs.updateOne({ inquiryId: new ObjectId(q.id) }, { $set: { cursor: 0, state: "PARTIAL", nextAttemptAt: new Date() } });
  await runDistribution({ maxJobs: 5 });
  assert.equal((await recipientsOf(q.id)).length, expected);
});
await check("closing the inquiry before distribution stops it and creates nothing", async () => {
  const q = await submit();
  await t.db.collection("inquiries").updateOne({ _id: new ObjectId(q.id) }, { $set: { status: "CANCELLED" } });
  await runDistribution({ maxJobs: 5 });
  assert.equal((await recipientsOf(q.id)).length, 0);
  assert.equal((await distributionStatus(new ObjectId(q.id))).state, "STOPPED");
});
await check("a company that became ineligible after the cutoff is skipped; one that appeared after the cutoff is not added", async () => {
  const q = await submit();
  await runDistribution({ maxJobs: 1, maxBatches: 0 }); // cutoff
  await t.db.collection("supplier_companies").updateOne({ _id: matchedCos[0].companyId }, { $set: { status: "SUSPENDED" } });
  const late = await mkCompany(twoSellers ? [] : []);
  await t.db.collection("supplier_companies").updateOne({ _id: late.companyId }, { $set: { sellerKeys: [pick.cands[pick.cands.length - 1].sellerKey] } }).catch(() => undefined);
  await runDistribution({ maxJobs: 5 });
  const ids = new Set((await recipientsOf(q.id)).map((r) => r.companyId.toHexString()));
  assert.ok(!ids.has(matchedCos[0].companyId.toHexString()), "suspended company skipped");
  assert.ok(!ids.has(late.companyId.toHexString()), "late company not added");
  await t.db.collection("supplier_companies").updateOne({ _id: matchedCos[0].companyId }, { $set: { status: "ACTIVE" } });
});
await check("a legacy inquiry (no job) is never redistributed", async () => {
  const _id = new ObjectId();
  await t.db.collection("inquiries").insertOne({ _id, reference: "FBM-INQ-LEGACY00", buyerId: new ObjectId(buyerId), productKey: String(pick.p.id), supplierKey: pick.req.sellerKey, supplierName: "x", source: "catalog", quantity: 1, status: "NEW", createdAt: new Date() });
  created.inquiries.push(_id);
  await runDistribution({ maxJobs: 5 });
  assert.equal((await recipientsOf(_id)).length, 0);
});
await check("a guest inquiry gets no job", async () => {
  const r = await submitInquiry({ kind: "guest", guest: { name: "G", email: "g@fixture.invalid", phone: "+910000000000" } }, { productKey: String(pick.p.id), productName: pick.p.name, supplierKey: pick.req.sellerKey, supplierName: "x", source: "catalog", quantity: 7, unit: "Piece", inquiryType: "PRODUCT_INQUIRY" });
  assert.ok(r.ok); created.inquiries.push(new ObjectId(r.id));
  assert.equal(await distributionStatus(new ObjectId(r.id)), null);
});

await check("a MATCHED view is redacted and carries the recipient's own identity", async () => {
  const ctx = await resolveSupplierContext(matchedCos[0].ownerUserId.toHexString());
  const view = await findInquiryFor(ctx, { reference: main.reference });
  assert.equal(view.recipientType, "MATCHED");
  assert.equal(view.supplierKey, matchedCos[0].key);
  assert.notEqual(view.supplierName, "Fixture Direct");
  assert.deepEqual(view.statusHistory, []);
  for (const f of ["guest", "idempotencyKey", "matchedSupplierKeys", "supplierSlug"]) assert.ok(!(f in view), `${f} must not be present`);
  assert.ok(view.productKey !== String(pick.p.id) || matchedCos[0].key === pick.req.sellerKey);
});
await check("a company without a recipient relationship cannot read the inquiry", async () => {
  const ctx = await resolveSupplierContext(outsider.ownerUserId.toHexString());
  assert.equal(await findInquiryFor(ctx, { reference: main.reference }), null);
});
await check("one matched supplier's reply does not change another recipient's state or the shared inquiry", async () => {
  const a = await resolveSupplierContext(matchedCos[0].ownerUserId.toHexString());
  const r = await sendResponse(a, { id: matchedCos[0].ownerUserId.toHexString() }, main.reference, { type: "RESPONSE", message: "We can supply this product in the quantity you asked for.", idempotencyKey: crypto.randomUUID().replace(/-/g, "").padEnd(24, "x") });
  assert.ok(r.ok, JSON.stringify(r));
  const { recipients } = await distributionCollections();
  const rows = await recipients.find({ inquiryId: new ObjectId(main.id) }).toArray();
  const mine = rows.find((x) => x.companyId.equals(matchedCos[0].companyId));
  assert.equal(mine.status, "REPLIED");
  assert.ok(rows.filter((x) => !x.companyId.equals(matchedCos[0].companyId)).every((x) => x.status === "NEW"));
  assert.equal((await t.db.collection("inquiries").findOne({ _id: new ObjectId(main.id) })).status, "NEW");
  const b = await resolveSupplierContext(matchedCos[1].ownerUserId.toHexString());
  const bView = await findInquiryFor(b, { reference: main.reference });
  assert.equal(bView.status, "NEW");
  const msgs = await t.db.collection("inquiry_messages").find({ inquiryId: new ObjectId(main.id) }).toArray();
  assert.ok(msgs.every((m) => m.supplierKey === matchedCos[0].key));
});

const ids = created.inquiries;
await t.db.collection("distribution_jobs").deleteMany({ inquiryId: { $in: ids } });
await t.db.collection("inquiry_recipients").deleteMany({ inquiryId: { $in: ids } });
await t.db.collection("inquiry_messages").deleteMany({ inquiryId: { $in: ids } });
await t.db.collection("inquiries").deleteMany({ _id: { $in: ids } });
await t.db.collection("supplier_notifications").deleteMany({ supplierId: { $in: created.users } });
await t.cleanup(["supplier_companies", "users"]);
console.log(`\n${passed} passed, 0 failed`);
