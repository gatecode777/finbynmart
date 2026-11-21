// INTEGRATION test (writes to a database): Admin Supplier Management (Page 52): scoped list, counts and filters, company without a catalogue seller, detail redaction, suspend / reactivate
// (one transaction with its audit row and recovery event, one notice, idempotency, stale revision, concurrency), the effects on public eligibility, new inquiries and the lead worker,
// preserved history, independent product restrictions, no verification change, activity paging and export rows.
// Runs ONLY against an explicitly configured, transaction-capable, isolated test database (it-guard.mjs). NOT run in the build environment (no isolated database).
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_adminsup TEST_DB_CONFIRM=finbyn_it_adminsup AUTH_SECRET=<any test value> \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-admin-suppliers.mjs
// HTTP-level authorization (401 / 403 per capability, origin checks) and the supplier-portal guards need signed-in sessions and are NOT covered here: see docs/admin/PAGE_52_SUPPLIER_MANAGEMENT.md.
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
process.env.AUTH_SECRET ??= "integration-test-secret-integration";
const { decide } = await import("../../../src/lib/admin/productReview.ts");
const { unpublishProduct } = await import("../../../src/lib/admin/productManagement.ts");
const { refreshApproved, isProductPublicNow } = await import("../../../src/lib/catalog/approvedProducts.ts");
const { getApproved } = await import("../../../src/lib/catalog/approvedStore.ts");
const { submitInquiry } = await import("../../../src/lib/inquiries/service.ts");
const { runDistribution, distributionCollections } = await import("../../../src/lib/leads/distribution.ts");
const S = await import("../../../src/lib/admin/supplierManagement.ts");
const R = await import("../../../src/lib/admin/supplierRules.ts");

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
const k = () => crypto.randomUUID();
const cell = (value, unit) => ({ value, ...(unit ? { unit } : {}) });
const mkCompany = async (name, city, sellerKeys = []) => {
  const ownerUserId = new ObjectId(), _id = new ObjectId();
  await t.db.collection("users").insertOne(t.tag({ _id: ownerUserId, name: "Owner " + name, email: `${_id}@fixture.invalid`, role: "supplier", supplier: { businessName: name, phone: "9999999999", city, offering: "" } }));
  await t.db.collection("supplier_companies").insertOne(t.tag({ _id, ownerUserId, sellerKeys, status: "ACTIVE", verificationStatus: "UNVERIFIED", createdAt: new Date(), updatedAt: new Date() }));
  return { _id, id: _id.toHexString(), uid: ownerUserId };
};
const base = { type: cell("fabric"), composition: cell("cotton"), colour: cell("Navy Blue"), gsm: cell(140), width: cell(44, "inch") };
const SNAP = (name, attributes) => ({ name, sku: "", description: "Fixture", categoryId: "apparel-fashion", categoryName: "Apparel & Fashion", pricingMode: "FIXED", currency: "INR", unitPricePaise: 15000, priceUnit: "metre", moq: 50, quantityUnit: "metre", attributes, images: [{ fileId: "f", url: "https://ik.imagekit.io/fixture/a.jpg", name: "a.jpg" }] });
const mkProduct = async (companyId, slug, attributes, approve = true) => {
  const _id = new ObjectId();
  await t.db.collection("supplier_products").insertOne(t.tag({ _id, companyId, slug, name: slug, sku: "", categoryName: "Apparel & Fashion", price: 150, unit: "metre", stock: 0, status: "DRAFT", imageUrl: "", description: "x", createdAt: new Date(), updatedAt: new Date(), draft: { revision: 1, createdBy: new ObjectId(), idempotencyKey: k(), bodyHash: "x", categoryId: "apparel-fashion", pricingMode: "FIXED", currency: "INR", unitPricePaise: 15000, priceUnit: "metre", moq: 50, quantityUnit: "metre", attributes, review: { state: "PENDING", submittedRevision: 1, submittedAt: new Date(), submittedBy: new ObjectId(), snapshot: SNAP(slug, attributes) } } }));
  if (approve) { const r = await decide(new ObjectId(), _id.toHexString(), { decision: "APPROVE", expectedRevision: 1 }); assert.ok(r.ok, JSON.stringify(r)); }
  return _id;
};
const A = await mkCompany("Fixture Alpha Textiles", "Surat"), B = await mkCompany("Fixture Beta Mills", "Jaipur", ["fixture-seller-1"]), C = await mkCompany("Fixture Gamma Weavers", "Surat");
const pA1 = await mkProduct(A._id, "fixture-alpha-1", base);
const pA2 = await mkProduct(A._id, "fixture-alpha-2", { ...base, gsm: cell(150) });
const pAPending = await mkProduct(A._id, "fixture-alpha-pending", { ...base, gsm: cell(160) }, false);
await mkProduct(B._id, "fixture-beta-1", { ...base, gsm: cell(145) });
await mkProduct(C._id, "fixture-gamma-1", { ...base, gsm: cell(135) });
await refreshApproved();
const idOf = (id) => `sp-${id.toHexString()}`;
const admin = new ObjectId();
const audit = t.db.collection("admin_audit_log");
const auditCount = (company, action) => audit.countDocuments({ companyId: company._id, ...(action ? { action } : {}) });
const events = () => t.db.collection("company_status_events");
const notices = (c, rev) => t.db.collection("supplier_notifications").countDocuments({ supplierId: c.uid, dedupeKey: `company-status:${c.id}:${rev}` });
const caps = { suspend: true, reactivate: true, links: true, contacts: true, audit: true, products: true, companyLinks: true, review: true };
const noCaps = { suspend: false, reactivate: false, links: false, contacts: false, audit: false, products: false, companyLinks: false, review: false };
const sus = (c, o = {}) => S.suspendCompany(admin, c.id, { reason: "Repeated policy complaints.", noticeCode: "POLICY_REVIEW", expectedRev: 0, idempotencyKey: k(), ...o });
const rea = (c, o = {}) => S.reactivateCompany(admin, c.id, { reason: "Review completed, restored.", expectedRev: 1, idempotencyKey: k(), ...o });
const rev = async (c) => (await t.db.collection("supplier_companies").findOne({ _id: c._id })).statusRev ?? 0;
const post = async (over) => {
  const r = await submitInquiry({ kind: "buyer", buyerId: new ObjectId().toHexString() }, { productName: "Fixture", categoryName: "Apparel & Fashion", source: "supplier", quantity: 100, unit: "Metre", inquiryType: "BULK_ORDER_REQUEST", message: "Fixture requirement", ...over });
  return r;
};

await check("the list counts companies, shows an active company with no catalogue seller as ACTIVE, and filters by status, mapping, city and name prefix", async () => {
  const all = await S.listCompanies(R.EMPTY_STATE, caps);
  const names = all.items.map((x) => x.name);
  assert.ok(["Fixture Alpha Textiles", "Fixture Beta Mills", "Fixture Gamma Weavers"].every((n) => names.includes(n)));
  const a = all.items.find((x) => x.id === A.id);
  assert.equal(a.status, "ACTIVE"); assert.equal(a.linkedSellers, 0);
  assert.equal(all.summary.total, all.summary.active + all.summary.suspended);
  assert.ok((await S.listCompanies({ ...R.EMPTY_STATE, mapping: "none" }, caps)).items.some((x) => x.id === A.id));
  assert.ok((await S.listCompanies({ ...R.EMPTY_STATE, mapping: "linked" }, caps)).items.every((x) => x.linkedSellers > 0));
  assert.ok((await S.listCompanies({ ...R.EMPTY_STATE, city: "surat" }, caps)).items.every((x) => x.city?.toLowerCase() === "surat"));
  assert.equal((await S.listCompanies({ ...R.EMPTY_STATE, q: "fixture beta" }, caps)).items.length, 1);
  assert.equal((await S.listCompanies({ ...R.EMPTY_STATE, q: A.id }, caps)).items[0].id, A.id);
  assert.equal((await S.listCompanies({ ...R.EMPTY_STATE, q: R.refCode(A.id) }, caps)).items.some((x) => x.id === A.id), true);
  assert.equal((await S.listCompanies({ ...R.EMPTY_STATE, q: ".*" }, caps)).items.length, 0, "a regex payload is literal");
});
await check("pagination is stable across both sorts: every company exactly once", async () => {
  for (const sort of ["updated", "name", "created"]) {
    const seen = [];
    for (let page = 1; page <= 50; page++) { const r = await S.listCompanies({ ...R.EMPTY_STATE, sort, page }, caps, 2); seen.push(...r.items.map((x) => x.id)); if (page >= r.meta.totalPages) break; }
    assert.equal(new Set(seen).size, seen.length);
  }
});
await check("the detail redacts by capability: contacts, seller links, internal reason and product counts need their own permission; verification is shown as Unverified", async () => {
  const none = await S.getCompany(A.id, noCaps);
  assert.equal(none.contact, null); assert.equal(none.sellerLinks, null); assert.equal(none.products, null); assert.equal(none.suspension, null);
  assert.equal(none.links.companyLinks, null); assert.equal(none.links.products, null);
  assert.ok(!JSON.stringify(none).includes("9999999999") && !JSON.stringify(none).includes("fixture.invalid"));
  assert.equal(none.verification.label, "Unverified");
  const full = await S.getCompany(A.id, caps);
  assert.equal(full.contact.phone, "9999999999"); assert.deepEqual(full.sellerLinks, []);
  assert.equal(full.products.published, 2); assert.equal(full.products.pending, 1);
  assert.equal(await S.getCompany("not-an-id", caps), null); assert.equal(await S.getCompany(new ObjectId().toHexString(), caps), null);
});
await check("suspend validates reason, notice, revision and key; an unknown company is 404; a stale revision is 409", async () => {
  assert.equal((await sus(A, { reason: "short" })).status, 422);
  assert.equal((await sus(A, { noticeCode: "free text" })).status, 422);
  assert.equal((await sus(A, { expectedRev: "0" })).status, 422);
  assert.equal((await sus(A, { idempotencyKey: "x" })).status, 422);
  assert.equal((await sus({ id: new ObjectId().toHexString() })).status, 404);
  assert.equal((await sus(A, { expectedRev: 4 })).status, 409);
  assert.equal(await auditCount(A), 0);
});
await check("a failed audit write rolls the whole change back (no partial suspension)", async () => {
  const key = k();
  await audit.insertOne({ _id: new ObjectId(), action: "BLOCKER", operationKey: `${admin.toHexString()}:SUPPLIER_COMPANY_SUSPENDED:${key}`, bodyHash: "other", at: new Date() });
  const r = await sus(A, { idempotencyKey: key });
  assert.equal(r.ok, false); assert.equal(r.status, 409, "a different request under a used key is refused");
  assert.equal((await t.db.collection("supplier_companies").findOne({ _id: A._id })).status, "ACTIVE");
  await audit.deleteOne({ action: "BLOCKER" });
});

const invOld = await post({ productKey: idOf(pA1), supplierKey: `co:${A._id}`, supplierName: "Fixture Alpha Textiles", sourceType: "DIRECT_INQUIRY" });
assert.ok(invOld.ok, JSON.stringify(invOld));
const historic = JSON.stringify(await t.db.collection("inquiries").findOne({ reference: invOld.reference }));
const suspendKey = k();
await check("suspending commits the status, one audit row, one recovery event and one notice; verification, products and history are untouched", async () => {
  const before = await t.db.collection("supplier_products").find({ companyId: A._id }).toArray();
  const r = await sus(A, { idempotencyKey: suspendKey });
  assert.deepEqual({ ok: r.ok, replay: r.replay }, { ok: true, replay: false });
  const c = await t.db.collection("supplier_companies").findOne({ _id: A._id });
  assert.equal(c.status, "SUSPENDED"); assert.equal(c.statusRev, 1); assert.equal(c.verificationStatus, "UNVERIFIED");
  assert.equal(c.suspension.noticeCode, "POLICY_REVIEW"); assert.ok(c.suspension.by.equals(admin));
  assert.equal(await auditCount(A, "SUPPLIER_COMPANY_SUSPENDED"), 1);
  const ev = await events().findOne({ companyId: A._id });
  assert.equal(ev.refresh.state, "DONE"); assert.equal(ev.notice.state, "DONE");
  assert.equal(await notices(A, 1), 1);
  const note = await t.db.collection("supplier_notifications").findOne({ supplierId: A.uid, dedupeKey: `company-status:${A.id}:1` });
  assert.ok(!note.body.includes("policy complaints"), "the internal reason never reaches the supplier");
  assert.deepEqual((await t.db.collection("supplier_products").find({ companyId: A._id }).toArray()).map((p) => JSON.stringify(p.publication)), before.map((p) => JSON.stringify(p.publication)));
  assert.equal(JSON.stringify(await t.db.collection("inquiries").findOne({ reference: invOld.reference })), historic, "history is kept unchanged");
});
await check("a lost-response retry answers the original result with no second audit row, event or notice; a changed request under the same key is 409", async () => {
  const again = await sus(A, { idempotencyKey: suspendKey });
  assert.deepEqual({ ok: again.ok, replay: again.replay }, { ok: true, replay: true });
  assert.equal((await sus(A, { idempotencyKey: suspendKey, reason: "A different reason entirely." })).status, 409);
  await S.sweepStatusEvents();
  assert.equal(await auditCount(A, "SUPPLIER_COMPANY_SUSPENDED"), 1); assert.equal(await events().countDocuments({ companyId: A._id }), 1); assert.equal(await notices(A, 1), 1);
  assert.equal((await sus(A, { expectedRev: 1 })).status, 409, "an already suspended company cannot be suspended again");
});
await check("a suspended company leaves public discovery and cannot be the target of a new inquiry, while its other products' own state is preserved", async () => {
  await refreshApproved();
  for (const id of [pA1, pA2]) { assert.ok(!getApproved().byId.has(idOf(id))); assert.equal(await isProductPublicNow(idOf(id)), false); }
  const r = await post({ productKey: idOf(pA1), supplierKey: `co:${A._id}`, supplierName: "Fixture Alpha Textiles", sourceType: "DIRECT_INQUIRY" });
  assert.deepEqual({ ok: r.ok, code: r.code }, { ok: false, code: "SUPPLIER_UNAVAILABLE" });
  assert.ok(getApproved().byId.has(idOf((await t.db.collection("supplier_products").findOne({ slug: "fixture-beta-1" }))._id)), "another company is unaffected");
});
await check("the lead worker never adds the suspended company and never replays history on reactivation", async () => {
  const g = await post({ productKey: idOf((await t.db.collection("supplier_products").findOne({ slug: "fixture-beta-1" }))._id), supplierKey: "", supplierName: "", sourceType: "GENERAL_REQUIREMENT", requirement: { nodeId: "apparel-fashion", attributes: { ...base, gsm: cell(145) }, policy: "match-2" } });
  assert.ok(g.ok, JSON.stringify(g));
  await runDistribution({ maxJobs: 10 });
  const { recipients } = await distributionCollections();
  assert.equal(await recipients.countDocuments({ inquiryId: new ObjectId(g.id), companyId: A._id }), 0);
  const before = await recipients.countDocuments({ companyId: A._id });
  await S.reactivateCompany(admin, A.id, { reason: "Review completed, restored.", expectedRev: 1, idempotencyKey: k() });
  await runDistribution({ maxJobs: 10 });
  assert.equal(await recipients.countDocuments({ companyId: A._id }), before, "reactivation does not replay past leads");
});
await check("reactivation restores access only: an individually unpublished product stays hidden, a pending product is not approved, verification is unchanged", async () => {
  assert.equal(await auditCount(A, "SUPPLIER_COMPANY_REACTIVATED"), 1);
  assert.equal((await t.db.collection("supplier_companies").findOne({ _id: A._id })).status, "ACTIVE");
  assert.equal((await t.db.collection("supplier_companies").findOne({ _id: A._id })).verificationStatus, "UNVERIFIED");
  assert.equal((await t.db.collection("supplier_products").findOne({ _id: pAPending })).publication, undefined);
  assert.equal((await S.reactivateCompany(admin, A.id, { reason: "Reactivating an active company.", expectedRev: 2, idempotencyKey: k() })).status, 409);
});
await check("a product-specific unpublish made while suspended survives reactivation (two separate restrictions)", async () => {
  const s1 = await S.suspendCompany(admin, A.id, { reason: "Second suspension for the test.", noticeCode: "ACCOUNT_SAFETY", expectedRev: 2, idempotencyKey: k() });
  assert.equal(s1.ok, true);
  const un = await unpublishProduct(admin, pA2.toHexString(), { reason: "Listing breaks the policy.", expectedRevision: 1 });
  assert.equal(un.ok, true);
  assert.equal((await S.reactivateCompany(admin, A.id, { reason: "Company restored after review.", expectedRev: 3, idempotencyKey: k() })).ok, true);
  await refreshApproved();
  assert.ok(getApproved().byId.has(idOf(pA1)), "the approved, unrestricted product is public again");
  assert.ok(!getApproved().byId.has(idOf(pA2)), "the unpublished product stays hidden");
});
await check("two administrators changing the same company at once produce exactly one change", async () => {
  const [x, y] = await Promise.all([sus(C, { reason: "Concurrent attempt number one." }), S.suspendCompany(new ObjectId(), C.id, { reason: "Concurrent attempt number two.", noticeCode: "POLICY_REVIEW", expectedRev: 0, idempotencyKey: k() })]);
  assert.equal([x, y].filter((r) => r.ok).length, 1);
  assert.equal(await auditCount(C, "SUPPLIER_COMPANY_SUSPENDED"), 1); assert.equal(await rev(C), 1);
});
await check("a suspension racing with the lead worker: no recipient row is created for the company after the suspension committed", async () => {
  const D = await mkCompany("Fixture Delta Race", "Surat");
  await mkProduct(D._id, "fixture-delta-1", { ...base, gsm: cell(170) });
  await refreshApproved();
  const g = await post({ productKey: idOf((await t.db.collection("supplier_products").findOne({ slug: "fixture-delta-1" }))._id), supplierKey: "", supplierName: "", sourceType: "GENERAL_REQUIREMENT", requirement: { nodeId: "apparel-fashion", attributes: { ...base, gsm: cell(170) }, policy: "match-2" } });
  assert.ok(g.ok, JSON.stringify(g));
  const [s] = await Promise.all([sus(D), runDistribution({ maxJobs: 10 })]);
  assert.equal(s.ok, true);
  const { recipients } = await distributionCollections();
  const rec = await recipients.findOne({ inquiryId: new ObjectId(g.id), companyId: D._id });
  const suspended = (await t.db.collection("supplier_companies").findOne({ _id: D._id })).suspension.at;
  if (rec) assert.ok(rec.createdAt <= suspended, "a recipient may only predate the suspension's effective point");
});
await check("the activity log is paged newest first and lists only this company's administrative actions", async () => {
  const p1 = await S.getCompanyActivity(A.id, null, 2);
  assert.equal(p1.items.length, 2); assert.ok(p1.nextCursor);
  const p2 = await S.getCompanyActivity(A.id, p1.nextCursor, 50);
  assert.ok(p2.items.length >= 1);
  assert.equal(await S.getCompanyActivity(new ObjectId().toHexString(), null), null);
});
await check("export rows follow the filters, are bounded, and carry no contact data", async () => {
  const r = await S.exportCompanies({ ...R.EMPTY_STATE, status: "SUSPENDED" }, caps, 5000);
  assert.ok(r.rows.every((x) => x.status === "SUSPENDED") && !r.truncated);
  assert.ok(!JSON.stringify(r).includes("9999999999") && !JSON.stringify(r).includes("fixture.invalid"));
});

for (const c of ["admin_audit_log", "company_status_events"]) await t.db.collection(c).deleteMany({ companyId: { $in: [A._id, B._id, C._id] } });
await t.db.collection("admin_audit_log").deleteMany({ actorId: admin });
for (const c of ["inquiries", "distribution_jobs", "inquiry_recipients"]) await t.db.collection(c).deleteMany({ $or: [{ reference: invOld.reference }, { supplierName: "Fixture Alpha Textiles" }, { requirement: { $exists: true } }] });
await t.db.collection("supplier_notifications").deleteMany({ supplierId: { $in: [A.uid, B.uid, C.uid] } });
await t.cleanup(["supplier_products", "supplier_companies", "users"]);
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
