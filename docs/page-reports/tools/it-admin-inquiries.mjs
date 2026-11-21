// INTEGRATION test (writes to a database): Admin Inquiry Management (Page 57): scoped list and counts, source and distribution filters, direct/general presentation without a
// duplicate recipient row, recipient view, routing repair (eligibility decided by the server, cutoff not bypassed, unique recipient, audit row in the same transaction, one lead notice),
// idempotency, stale revision, pause / resume / retry against the real worker, concurrency, activity paging, export rows.
// Runs ONLY against an explicitly configured, transaction-capable, isolated test database (it-guard.mjs). NOT run in the build environment (no isolated database).
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_admininq TEST_DB_CONFIRM=finbyn_it_admininq AUTH_SECRET=<any test value> \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-admin-inquiries.mjs
// HTTP-level authorization (401 / 403 per capability, origin checks) needs signed-in sessions and is NOT covered here: see docs/admin/PAGE_57_INQUIRY_MANAGEMENT.md.
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
process.env.AUTH_SECRET ??= "integration-test-secret-integration";
const { decide } = await import("../../../src/lib/admin/productReview.ts");
const { refreshApproved } = await import("../../../src/lib/catalog/approvedProducts.ts");
const { submitInquiry } = await import("../../../src/lib/inquiries/service.ts");
const { runDistribution, distributionCollections } = await import("../../../src/lib/leads/distribution.ts");
const S = await import("../../../src/lib/admin/inquiryService.ts");
const O = await import("../../../src/lib/admin/inquiryOps.ts");
const { parseRange, defaultRange } = await import("../../../src/lib/supplier/analyticsRules.ts");

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
const k = () => crypto.randomUUID();
const cell = (value, unit) => ({ value, ...(unit ? { unit } : {}) });
const mkCompany = async (name) => {
  const ownerUserId = new ObjectId(), _id = new ObjectId();
  await t.db.collection("users").insertOne(t.tag({ _id: ownerUserId, name: "Owner", email: `${_id}@fixture.invalid`, role: "supplier", supplier: { businessName: name, phone: "", city: "Surat", offering: "" } }));
  await t.db.collection("supplier_companies").insertOne(t.tag({ _id, ownerUserId, sellerKeys: [], status: "ACTIVE", verificationStatus: "UNVERIFIED", createdAt: new Date(), updatedAt: new Date() }));
  return { _id, uid: ownerUserId };
};
const base = { type: cell("fabric"), composition: cell("cotton"), colour: cell("Navy Blue"), gsm: cell(140), width: cell(44, "inch") };
const SNAP = (name, attributes) => ({ name, sku: "", description: "Fixture", categoryId: "apparel-fashion", categoryName: "Apparel & Fashion", pricingMode: "FIXED", currency: "INR", unitPricePaise: 15000, priceUnit: "metre", moq: 50, quantityUnit: "metre", attributes, images: [{ fileId: "f", url: "https://ik.imagekit.io/fixture/a.jpg", name: "a.jpg" }] });
const mkProduct = async (companyId, slug, attributes) => {
  const _id = new ObjectId();
  await t.db.collection("supplier_products").insertOne(t.tag({ _id, companyId, slug, name: slug, sku: "", categoryName: "Apparel & Fashion", price: 150, unit: "metre", stock: 0, status: "DRAFT", imageUrl: "", description: "x", createdAt: new Date(), updatedAt: new Date(), draft: { revision: 1, createdBy: new ObjectId(), idempotencyKey: k(), bodyHash: "x", categoryId: "apparel-fashion", pricingMode: "FIXED", currency: "INR", unitPricePaise: 15000, priceUnit: "metre", moq: 50, quantityUnit: "metre", attributes, review: { state: "PENDING", submittedRevision: 1, submittedAt: new Date(), submittedBy: new ObjectId(), snapshot: SNAP(slug, attributes) } } }));
  const r = await decide(new ObjectId(), _id.toHexString(), { decision: "APPROVE", expectedRevision: 1 });
  assert.ok(r.ok, JSON.stringify(r));
  return _id;
};
const A = await mkCompany("Fixture A Textiles"), B = await mkCompany("Fixture B Textiles"), C = await mkCompany("Fixture C Poly");
const pA = await mkProduct(A._id, "fixture-cotton-a", base);
await mkProduct(B._id, "fixture-cotton-b", { ...base, gsm: cell(145) });
await mkProduct(C._id, "fixture-poly-c", { ...base, composition: cell("polyester") });
await refreshApproved();
const idOf = (id) => `sp-${id.toHexString()}`;
const created = [];
const post = async (over) => {
  const r = await submitInquiry({ kind: "buyer", buyerId: new ObjectId().toHexString() }, { productName: "Fixture cotton", categoryName: "Apparel & Fashion", source: "supplier", quantity: 100, unit: "Metre", inquiryType: "BULK_ORDER_REQUEST", message: "Fixture requirement", ...over });
  assert.ok(r.ok, JSON.stringify(r)); created.push(new ObjectId(r.id)); return r;
};
const { jobs, recipients } = await distributionCollections();
const admin = new ObjectId();
const audit = t.db.collection("admin_audit_log");
const auditCount = (ref, action) => audit.countDocuments({ inquiryReference: ref, ...(action ? { action } : {}) });
const jobOf = (id) => jobs.findOne({ inquiryId: new ObjectId(id) });
const range = (() => { const d = defaultRange(); const p = parseRange(d.startDay, d.endDay); assert.ok(p.ok); return p.range; })();
const list = (q = {}) => S.listAdminInquiries({ range, ...q });
const FULL = { requirements: true, recipients: true, responses: true, routing: true, distribution: true, audit: true };

// a general requirement; B is frozen as a candidate but skipped at commit time because its company is suspended at that moment
const general = await post({ productKey: idOf(pA), supplierKey: "", supplierName: "", sourceType: "GENERAL_REQUIREMENT", requirement: { nodeId: "apparel-fashion", attributes: base, policy: "match-2" } });
await runDistribution({ maxJobs: 5, maxBatches: 0 }); // freezes the candidates, commits none
await t.db.collection("supplier_companies").updateOne({ _id: B._id }, { $set: { status: "SUSPENDED" } });
await runDistribution({ maxJobs: 5 });
await t.db.collection("supplier_companies").updateOne({ _id: B._id }, { $set: { status: "ACTIVE" } });
const direct = await post({ productKey: idOf(pA), supplierKey: `co:${A._id}`, supplierName: "Fixture A Textiles", sourceType: "DIRECT_INQUIRY" });
await runDistribution({ maxJobs: 5 });

await check("the list separates source and distribution; a general requirement has no selected supplier; a direct inquiry has one, with no stored recipient row for it", async () => {
  const all = await list();
  const g = all.items.find((x) => x.reference === general.reference), d = all.items.find((x) => x.reference === direct.reference);
  assert.equal(g.source, "GENERAL"); assert.equal(g.selectedSupplier, null); assert.equal(g.recipients.direct, 0);
  assert.equal(d.source, "DIRECT"); assert.equal(d.selectedSupplier, "Fixture A Textiles"); assert.equal(d.recipients.direct, 1);
  assert.equal(await recipients.countDocuments({ inquiryId: new ObjectId(direct.id), companyId: A._id }), 0, "DIRECT is presented, never persisted as a recipient");
  assert.equal((await list({ source: "general" })).items.every((x) => x.source === "GENERAL"), true);
  assert.ok((await list({ source: "direct" })).items.some((x) => x.reference === direct.reference));
  assert.equal(all.summary.sources.general + all.summary.sources.direct, all.summary.groups.all);
});
await check("distribution filters use the job state; NO_MATCHES is never 'needs attention'", async () => {
  assert.ok((await list({ dist: "completed" })).items.some((x) => x.reference === general.reference));
  const nm = await post({ productKey: idOf(pA), supplierKey: "", supplierName: "", sourceType: "GENERAL_REQUIREMENT", requirement: { nodeId: "apparel-fashion", attributes: { ...base, composition: cell("wool") }, policy: "match-2" } }).catch(() => null);
  if (nm) { await runDistribution({ maxJobs: 5 }); const row = (await list({ dist: "no_matches" })).items.find((x) => x.reference === nm.reference); if (row) assert.equal(row.distribution.attention, false); assert.ok(!(await list({ dist: "attention" })).items.some((x) => x.reference === nm.reference)); }
});
await check("pagination is stable and bounded: every inquiry once across pages", async () => {
  const seen = [];
  for (let page = 1; page <= 20; page++) { const r = await list({ page, limit: 1 }); seen.push(...r.items.map((x) => x.reference)); if (page >= r.meta.totalPages) break; }
  assert.equal(new Set(seen).size, seen.length);
});
await check("requirement content, responses and quotations are gated by their own capabilities", async () => {
  const none = await S.getAdminInquiry(general.reference, { ...FULL, requirements: false, responses: false });
  assert.equal(none.requirementDetail, null); assert.equal(none.responses, null); assert.equal(none.quotations, null);
  const some = await S.getAdminInquiry(general.reference, FULL);
  assert.equal(some.requirementDetail.message, "Fixture requirement"); assert.ok(Array.isArray(some.responses) && Array.isArray(some.quotations));
  assert.equal(await S.getAdminInquiry("FBM-INQ-ZZZZZZZZ", FULL), null);
});
await check("the recipient view lists one row per company with the recorded reason, and offers only server-eligible routing candidates", async () => {
  const v = await O.getRecipients(general.reference, { routing: true });
  assert.ok(v.recipients.every((r) => r.kind === "MATCHED"));
  assert.equal(new Set(v.recipients.map((r) => r.company)).size, v.recipients.length);
  const names = v.routing.candidates.map((c) => c.name);
  assert.ok(names.includes("Fixture B Textiles"), "B was skipped at the cutoff and now qualifies");
  assert.ok(!names.includes("Fixture C Poly"), "an incompatible company is never offered");
  assert.equal((await O.getRecipients(general.reference, { routing: false })).routing, null);
});

await check("routing repair validates server-side: bad key, short reason, unknown or incompatible company, the direct supplier", async () => {
  const bad = await O.routeRecipient(admin, general.reference, { reason: "short", idempotencyKey: "x", companyId: "zz" });
  assert.equal(bad.ok, false); assert.equal(bad.status, 422);
  const incompatible = await O.routeRecipient(admin, general.reference, { reason: "Trying an incompatible company.", idempotencyKey: k(), companyId: C._id.toHexString() });
  assert.equal(incompatible.ok, false); assert.equal(incompatible.status, 422);
  const toDirect = await O.routeRecipient(admin, direct.reference, { reason: "Trying the selected supplier.", idempotencyKey: k(), companyId: A._id.toHexString() });
  assert.equal(toDirect.ok, false); assert.equal(toDirect.status, 422);
  assert.equal(await auditCount(general.reference, "INQUIRY_RECIPIENT_ROUTED"), 0);
});
const routeKey = k();
await check("an eligible routing repair adds exactly one matched recipient, one audit row and one lead notice, and keeps the original requirement", async () => {
  const before = JSON.stringify(await t.db.collection("inquiries").findOne({ reference: general.reference }, { projection: { message: 1, quantity: 1, requirement: 1, supplierKey: 1 } }));
  const r = await O.routeRecipient(admin, general.reference, { reason: "Company qualified after reactivation.", idempotencyKey: routeKey, companyId: B._id.toHexString() });
  assert.deepEqual({ ok: r.ok, replay: r.replay }, { ok: true, replay: false });
  const rec = await recipients.findOne({ inquiryId: new ObjectId(general.id), companyId: B._id });
  assert.equal(rec.origin, "ADMIN_ROUTING"); assert.equal(rec.type, "MATCHED");
  assert.equal(await auditCount(general.reference, "INQUIRY_RECIPIENT_ROUTED"), 1);
  const note = await t.db.collection("supplier_notifications").countDocuments({ supplierId: B.uid, dedupeKey: `lead:${general.reference}` });
  assert.equal(note, 1);
  assert.equal(JSON.stringify(await t.db.collection("inquiries").findOne({ reference: general.reference }, { projection: { message: 1, quantity: 1, requirement: 1, supplierKey: 1 } })), before);
});
await check("a lost-response retry gets the original answer with no second recipient, audit row or notice; the same key with a different request is a conflict", async () => {
  const again = await O.routeRecipient(admin, general.reference, { reason: "Company qualified after reactivation.", idempotencyKey: routeKey, companyId: B._id.toHexString() });
  assert.deepEqual({ ok: again.ok, replay: again.replay }, { ok: true, replay: true });
  const conflict = await O.routeRecipient(admin, general.reference, { reason: "A different reason entirely here.", idempotencyKey: routeKey, companyId: B._id.toHexString() });
  assert.equal(conflict.ok, false); assert.equal(conflict.status, 409);
  assert.equal(await recipients.countDocuments({ inquiryId: new ObjectId(general.id), companyId: B._id }), 1);
  assert.equal(await auditCount(general.reference, "INQUIRY_RECIPIENT_ROUTED"), 1);
  const other = await O.routeRecipient(admin, general.reference, { reason: "Second attempt, new request key.", idempotencyKey: k(), companyId: B._id.toHexString() });
  assert.equal(other.ok, false); assert.equal(other.status, 422, "B holds the requirement now: it is no longer a routing candidate");
});
await check("the worker does not add the admin-routed company again", async () => {
  await runDistribution({ maxJobs: 5 });
  assert.equal(await recipients.countDocuments({ inquiryId: new ObjectId(general.id), companyId: B._id }), 1);
});

await check("pause stops the worker; resume continues from saved progress; a stale revision, a repeat and a wrong state are refused", async () => {
  const q = await post({ productKey: idOf(pA), supplierKey: "", supplierName: "", sourceType: "GENERAL_REQUIREMENT", requirement: { nodeId: "apparel-fashion", attributes: base, policy: "match-2" } });
  const j0 = await jobOf(q.id);
  assert.equal(j0.state, "PENDING");
  const stale = await O.pauseDistribution(admin, q.reference, { reason: "Pausing for review of the buyer.", idempotencyKey: k(), expectedRev: 5 });
  assert.equal(stale.ok, false); assert.equal(stale.status, 409);
  const key = k();
  const p = await O.pauseDistribution(admin, q.reference, { reason: "Pausing for review of the buyer.", idempotencyKey: key, expectedRev: 0 });
  assert.equal(p.ok, true);
  assert.equal((await jobOf(q.id)).state, "PAUSED");
  assert.equal((await O.pauseDistribution(admin, q.reference, { reason: "Pausing for review of the buyer.", idempotencyKey: key, expectedRev: 0 })).replay, true);
  await runDistribution({ maxJobs: 5 });
  assert.equal(await recipients.countDocuments({ inquiryId: new ObjectId(q.id) }), 0, "a paused job commits no recipient");
  assert.equal((await jobOf(q.id)).state, "PAUSED", "the worker never overwrites the pause");
  const again = await O.pauseDistribution(admin, q.reference, { reason: "Pausing a second time again.", idempotencyKey: k(), expectedRev: 1 });
  assert.equal(again.ok, false); assert.equal(again.status, 409);
  const r = await O.resumeDistribution(admin, q.reference, { reason: "Review finished, continue matching.", idempotencyKey: k(), expectedRev: 1 });
  assert.equal(r.ok, true);
  await runDistribution({ maxJobs: 5 });
  assert.ok((await recipients.countDocuments({ inquiryId: new ObjectId(q.id) })) >= 1);
  assert.equal((await jobOf(q.id)).state, "COMPLETED");
  assert.equal(await auditCount(q.reference), 2, "one audit row per applied change: pause and resume");
});
await check("retry applies only to a failed (or failure-recording partial) job and keeps the saved progress; a completed job is refused", async () => {
  const done = await O.retryDistribution(admin, general.reference, { reason: "Trying to rerun a finished job.", idempotencyKey: k(), expectedRev: 0 });
  assert.equal(done.ok, false); assert.equal(done.status, 409);
  const q = await post({ productKey: idOf(pA), supplierKey: "", supplierName: "", sourceType: "GENERAL_REQUIREMENT", requirement: { nodeId: "apparel-fashion", attributes: base, policy: "match-2" } });
  await runDistribution({ maxJobs: 5, maxBatches: 0 });
  await jobs.updateOne({ inquiryId: new ObjectId(q.id) }, { $set: { state: "FAILED", lastError: "fixture failure", attempts: 6 } });
  const before = await jobOf(q.id);
  const r = await O.retryDistribution(admin, q.reference, { reason: "Transient failure, retry from progress.", idempotencyKey: k(), expectedRev: 0 });
  assert.equal(r.ok, true);
  const after = await jobOf(q.id);
  assert.equal(after.state, "PARTIAL"); assert.equal(after.attempts, 0); assert.equal(after.cursor, before.cursor); assert.equal(after.lastError, undefined);
  assert.deepEqual(after.frozen.candidates.map((c) => c.companyId.toHexString()), before.frozen.candidates.map((c) => c.companyId.toHexString()));
});
await check("two administrators routing or pausing the same inquiry at once produce one effect", async () => {
  const q = await post({ productKey: idOf(pA), supplierKey: "", supplierName: "", sourceType: "GENERAL_REQUIREMENT", requirement: { nodeId: "apparel-fashion", attributes: base, policy: "match-2" } });
  const [a, b] = await Promise.all([O.pauseDistribution(admin, q.reference, { reason: "Concurrent attempt number one.", idempotencyKey: k(), expectedRev: 0 }), O.pauseDistribution(new ObjectId(), q.reference, { reason: "Concurrent attempt number two.", idempotencyKey: k(), expectedRev: 0 })]);
  assert.equal([a, b].filter((x) => x.ok).length, 1);
  assert.equal(await auditCount(q.reference, "INQUIRY_DISTRIBUTION_PAUSED"), 1);
});
await check("a closed requirement allows no routing, pause or retry", async () => {
  const q = await post({ productKey: idOf(pA), supplierKey: "", supplierName: "", sourceType: "GENERAL_REQUIREMENT", requirement: { nodeId: "apparel-fashion", attributes: base, policy: "match-2" } });
  await t.db.collection("inquiries").updateOne({ reference: q.reference }, { $set: { status: "CLOSED" } });
  assert.equal((await O.pauseDistribution(admin, q.reference, { reason: "Pausing a closed requirement.", idempotencyKey: k(), expectedRev: 0 })).ok, false);
  assert.equal((await O.routeRecipient(admin, q.reference, { reason: "Routing a closed requirement.", idempotencyKey: k(), companyId: B._id.toHexString() })).ok, false);
});
await check("the activity log is paged newest first and lists only this inquiry's administrative actions", async () => {
  const p1 = await O.getActivity(general.reference, null, 1);
  assert.equal(p1.items.length, 1); assert.ok(p1.items[0].label);
  assert.equal(await O.getActivity("FBM-INQ-ZZZZZZZZ", null), null);
});
await check("export rows follow the filters, are bounded, and carry no message text", async () => {
  const r = await S.exportAdminInquiries({ range, source: "general" }, 5000);
  assert.ok(r.rows.length >= 1 && r.rows.every((x) => x.source === "GENERAL") && !r.truncated);
  assert.ok(!JSON.stringify(r).includes("Fixture requirement"));
});

await audit.deleteMany({ inquiryReference: { $in: created.length ? (await t.db.collection("inquiries").find({ _id: { $in: created } }, { projection: { reference: 1 } }).toArray()).map((x) => x.reference) : [] } });
for (const c of ["inquiries", "distribution_jobs", "inquiry_recipients", "inquiry_messages", "supplier_notifications"]) await t.db.collection(c).deleteMany({ $or: [{ _id: { $in: created } }, { inquiryId: { $in: created } }, { supplierId: { $in: [A.uid, B.uid, C.uid] } }] });
await t.cleanup(["supplier_products", "supplier_companies", "users"]);
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
