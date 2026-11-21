// INTEGRATION test (writes to a database): Admin Product Management: scoped list/detail, derived statuses, stable pagination, unpublish (transaction, audit, recovery event,
// supplier notice), idempotency, concurrency, rollback, replacement approval while restricted, public removal, preserved commercial history, export. Runs ONLY against an
// explicitly configured, transaction-capable, isolated test database (it-guard.mjs). NOT run in the build environment (no isolated database).
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_adminprod TEST_DB_CONFIRM=finbyn_it_adminprod AUTH_SECRET=<any test value> \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-admin-products.mjs
// Authorization at the HTTP boundary (401/403 per capability, origin checks) needs signed-in sessions and is NOT covered here: see docs/admin/PRODUCT_MANAGEMENT.md.
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
process.env.AUTH_SECRET ??= "integration-test-secret-integration";
const M = await import("../../../src/lib/admin/productManagement.ts");
const { decide } = await import("../../../src/lib/admin/productReview.ts");
const { refreshApproved, isProductPublicNow } = await import("../../../src/lib/catalog/approvedProducts.ts");
const { getApproved } = await import("../../../src/lib/catalog/approvedStore.ts");
const { getPublicProductBySlug, getPublicProductByKey } = await import("../../../src/lib/catalog/productDetail.ts");
const { supplierCandidates } = await import("../../../src/lib/leads/catalogCandidates.ts");
const L = await import("../../../src/lib/admin/productList.ts");

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
const k = () => crypto.randomUUID().replace(/-/g, "").padEnd(24, "x");
const FULL = { unpublish: true, review: true }, READ_ONLY = { unpublish: false, review: false };
const ownerUserId = new ObjectId(), companyId = new ObjectId();
await t.db.collection("users").insertOne(t.tag({ _id: ownerUserId, name: "Owner", email: `${companyId}@fixture.invalid`, role: "supplier", supplier: { businessName: "Fixture Weavers", phone: "", city: "Surat", offering: "" } }));
await t.db.collection("supplier_companies").insertOne(t.tag({ _id: companyId, ownerUserId, sellerKeys: [], status: "ACTIVE", verificationStatus: "UNVERIFIED", createdAt: new Date(), updatedAt: new Date() }));
const admin = new ObjectId(), now = Date.now();
const ATTRS = { type: { value: "fabric" }, composition: { value: "cotton" }, colour: { value: "Navy" } };
const SNAP = (name, over = {}) => ({ name, sku: "", description: "Fixture", categoryId: "apparel-fashion", categoryName: "Apparel & Fashion", pricingMode: "FIXED", currency: "INR", unitPricePaise: 15050, priceUnit: "metre", moq: 50, quantityUnit: "metre", attributes: ATTRS, images: [{ fileId: "f", url: "https://ik.imagekit.io/fixture/a.jpg", name: "a.jpg" }], ...over });
const mk = async (slug, minutesAgo, fields) => {
  const _id = new ObjectId();
  await t.db.collection("supplier_products").insertOne(t.tag({ _id, companyId, slug, name: slug, sku: slug.toUpperCase(), categoryName: "Apparel & Fashion", price: 0, unit: "metre", stock: 0, status: "DRAFT", imageUrl: "", description: "x", createdAt: new Date(now - minutesAgo * 60000), updatedAt: new Date(now - minutesAgo * 60000), draft: { revision: 1, createdBy: new ObjectId(), idempotencyKey: k(), bodyHash: "x", categoryId: "apparel-fashion", pricingMode: "FIXED", currency: "INR", unitPricePaise: 15050, priceUnit: "metre", moq: 50, quantityUnit: "metre", skuKey: slug.toUpperCase() }, ...fields }));
  return _id;
};
const live = (name, over = {}) => ({ publication: { state: "APPROVED", revision: 1, approvedAt: new Date(now), approvedBy: new ObjectId(), snapshot: SNAP(name, over) } });
const pA = await mk("live-a", 1, { ...live("Live A"), "draft.review": { state: "APPROVED", submittedRevision: 1, submittedAt: new Date(), submittedBy: new ObjectId(), snapshot: SNAP("Live A") } });
const pB = await mk("live-b", 2, live("Live B"));
const pPendingEdit = await mk("live-edit", 3, { ...live("Live Edit"), "draft.review": { state: "PENDING", submittedRevision: 2, submittedAt: new Date(), submittedBy: new ObjectId(), snapshot: SNAP("EDIT NAME NOT LIVE", { unitPricePaise: 99999 }) } });
const pPending = await mk("new-pending", 4, { "draft.review": { state: "PENDING", submittedRevision: 1, submittedAt: new Date(), submittedBy: new ObjectId(), snapshot: SNAP("New Pending") } });
const pRejected = await mk("rejected-one", 5, { "draft.review": { state: "REJECTED", submittedRevision: 1, submittedAt: new Date(), submittedBy: new ObjectId(), snapshot: SNAP("Rejected One"), reasonCode: "INCOMPLETE_INFO" } });
const pDraft = await mk("draft-only", 6, {});
const pOff = await mk("off-one", 7, { ...live("Off One"), archivedAt: new Date(now - 1000), unpublish: { at: new Date(now - 1000), by: admin, reason: "Earlier restriction.", revision: 1 } });
const ref = (id) => id.toHexString();
const all = async (q, caps = FULL, lim = 50) => (await M.listProducts({ ...L.EMPTY_QUERY, ...q }, caps, lim));
const audits = (id) => t.db.collection("admin_audit_log").countDocuments({ productId: id, action: "PRODUCT_UNPUBLISHED" });
const events = (id) => t.db.collection("product_visibility_events").countDocuments({ productId: id });
const notices = (id, rev) => t.db.collection("supplier_notifications").countDocuments({ supplierId: ownerUserId, dedupeKey: `product-unpublished:${ref(id)}:${rev}` });
await refreshApproved();

await check("the admin list holds only submitted or published products (a never-submitted draft is private) with the derived statuses", async () => {
  const r = await all({});
  const byName = new Map(r.items.map((x) => [x.name, x]));
  assert.ok(!r.items.some((x) => x.reference === ref(pDraft)));
  assert.equal(byName.get("Live A").status, "PUBLISHED"); assert.equal(byName.get("Live A").pendingChanges, false);
  assert.equal(byName.get("Live Edit").status, "PUBLISHED"); assert.equal(byName.get("Live Edit").pendingChanges, true);
  assert.equal(byName.get("New Pending").status, "PENDING_REVIEW");
  assert.equal(byName.get("Rejected One").status, "REJECTED");
  assert.equal(byName.get("Off One").status, "UNPUBLISHED");
  assert.equal(r.meta.total, 6);
});
await check("a pending replacement revision never replaces the live content in the list or the detail", async () => {
  const row = (await all({ q: "Live Edit" })).items[0];
  assert.equal(row.name, "Live Edit"); assert.equal(row.priceText, "₹150.50 / metre");
  const d = await M.getProductDetail(ref(pPendingEdit), FULL);
  assert.equal(d.name, "Live Edit"); assert.ok(!JSON.stringify(d).includes("EDIT NAME NOT LIVE"));
  assert.equal(d.pending.revision, 2);
  assert.equal((await M.getProductDetail(ref(pPendingEdit), READ_ONLY)).pending, null, "private review data needs products.review");
});
await check("filters: status, search by name prefix, SKU and reference, supplier and category; an invalid supplier id matches nothing", async () => {
  assert.equal((await all({ status: "PUBLISHED" })).meta.total, 3);
  assert.equal((await all({ status: "UNPUBLISHED" })).meta.total, 1);
  assert.equal((await all({ q: "live" })).meta.total, 3);
  assert.equal((await all({ q: "LIVE-B" })).items.length, 1);
  assert.equal((await all({ q: ref(pB) })).items.length, 1);
  assert.equal((await all({ supplier: ref(companyId) })).meta.total, 6);
  assert.equal((await all({ supplier: "zz" })).meta.total, 0);
  assert.equal((await all({ category: "apparel-fashion" })).meta.total, 6);
  assert.equal((await all({ q: ".*" })).meta.total, 0, "a regex payload is a literal");
});
await check("pagination is stable with the unique tie-breaker: every product exactly once across pages, in both sorts", async () => {
  for (const sort of ["updated", "name"]) {
    const seen = [];
    for (let page = 1; page <= 10; page++) { const r = await all({ sort, page }, FULL, 2); seen.push(...r.items.map((x) => x.reference)); if (!r.meta.hasMore) break; }
    assert.equal(seen.length, 6); assert.equal(new Set(seen).size, 6);
  }
});
await check("unpublish needs a valid reason and the exact revision; unknown or never-published products are 404", async () => {
  assert.equal((await M.unpublishProduct(admin, ref(pA), { reason: "short", expectedRevision: 1 })).status, 422);
  assert.equal((await M.unpublishProduct(admin, ref(pA), { reason: "A valid reason here.", expectedRevision: "1" })).status, 422);
  assert.equal((await M.unpublishProduct(admin, ref(pA), { reason: "A valid reason here.", expectedRevision: 7 })).status, 409, "stale revision");
  assert.equal((await M.unpublishProduct(admin, ref(pPending), { reason: "A valid reason here.", expectedRevision: 1 })).status, 404);
  assert.equal((await M.unpublishProduct(admin, new ObjectId().toHexString(), { reason: "A valid reason here.", expectedRevision: 1 })).status, 404);
  assert.equal(await audits(pA), 0);
});
await check("an injected failure inside the transaction rolls the whole change back (no partial restriction)", async () => {
  await t.db.collection("product_visibility_events").insertOne({ _id: new ObjectId(), dedupeKey: `unpublish:${ref(pB)}:1`, type: "PRODUCT_UNPUBLISHED", productId: new ObjectId(), companyId, productName: "blocker", revision: 1, refresh: { state: "DONE", attempts: 1 }, notice: { state: "DONE", attempts: 1 }, createdAt: new Date() });
  await assert.rejects(() => M.unpublishProduct(admin, ref(pB), { reason: "Trigger a duplicate key.", expectedRevision: 1 }));
  const doc = await t.db.collection("supplier_products").findOne({ _id: pB });
  assert.equal(doc.archivedAt, undefined); assert.equal(await audits(pB), 0);
  await t.db.collection("product_visibility_events").deleteOne({ dedupeKey: `unpublish:${ref(pB)}:1` });
});
await check("an authorized unpublish commits the restriction, the audit row and the recovery event together; the supplier is told once; history and identity remain", async () => {
  const before = await t.db.collection("supplier_products").findOne({ _id: pA });
  const r = await M.unpublishProduct(admin, ref(pA), { reason: "  Listing breaks the policy.  ", expectedRevision: 1 });
  assert.deepEqual(r, { ok: true, alreadyUnpublished: false });
  const after = await t.db.collection("supplier_products").findOne({ _id: pA });
  assert.ok(after.archivedAt); assert.equal(after.unpublish.reason, "Listing breaks the policy."); assert.ok(after.unpublish.by.equals(admin));
  assert.equal(after.name, before.name); assert.deepEqual(after.draft.review, before.draft.review); assert.deepEqual(after.publication, before.publication);
  assert.equal(await audits(pA), 1); assert.equal(await events(pA), 1);
  const ev = await t.db.collection("product_visibility_events").findOne({ productId: pA });
  assert.equal(ev.refresh.state, "DONE"); assert.equal(ev.notice.state, "DONE");
  assert.equal(await notices(pA, 1), 1);
  const n = await t.db.collection("supplier_notifications").findOne({ supplierId: ownerUserId, dedupeKey: `product-unpublished:${ref(pA)}:1` });
  assert.ok(!n.body.includes("breaks the policy"), "the internal reason never reaches the supplier");
  assert.equal((await M.getProductDetail(ref(pA), FULL)).status, "UNPUBLISHED");
  assert.equal((await M.getProductDetail(ref(pA), FULL)).publicUrl, null);
});
await check("a retry after a lost response answers accurately and creates no second audit row, event or notice", async () => {
  const r = await M.unpublishProduct(admin, ref(pA), { reason: "Listing breaks the policy.", expectedRevision: 1 });
  assert.deepEqual(r, { ok: true, alreadyUnpublished: true });
  await M.sweepVisibilityEvents();
  assert.equal(await audits(pA), 1); assert.equal(await events(pA), 1); assert.equal(await notices(pA, 1), 1);
});
await check("two admins unpublishing the same product at once produce exactly one restriction, audit row and notice", async () => {
  const [a, b] = await Promise.all([M.unpublishProduct(admin, ref(pB), { reason: "Concurrent attempt one.", expectedRevision: 1 }), M.unpublishProduct(new ObjectId(), ref(pB), { reason: "Concurrent attempt two.", expectedRevision: 1 })]);
  assert.ok(a.ok && b.ok);
  assert.equal([a, b].filter((x) => x.alreadyUnpublished).length, 1);
  await M.sweepVisibilityEvents();
  assert.equal(await audits(pB), 1); assert.equal(await events(pB), 1); assert.equal(await notices(pB, 1), 1);
});
await check("a replacement approval while restricted does NOT make the product public again", async () => {
  // pPendingEdit is published with a pending revision 2: restrict it first, then approve the replacement
  assert.ok((await M.unpublishProduct(admin, ref(pPendingEdit), { reason: "Restrict before replacement.", expectedRevision: 1 })).ok);
  await t.db.collection("supplier_products").updateOne({ _id: pPendingEdit }, { $set: { "draft.revision": 2 } });
  const r = await decide(new ObjectId(), ref(pPendingEdit), { decision: "APPROVE", expectedRevision: 2 });
  assert.ok(r.ok, JSON.stringify(r));
  const doc = await t.db.collection("supplier_products").findOne({ _id: pPendingEdit });
  assert.equal(doc.publication.revision, 2); assert.ok(doc.archivedAt);
  await refreshApproved();
  assert.ok(!getApproved().byId.has(`sp-${ref(pPendingEdit)}`));
  assert.equal((await M.getProductDetail(ref(pPendingEdit), FULL)).status, "UNPUBLISHED");
});
await check("an unpublished product disappears from every public lookup and from new-lead selection, and the database check is authoritative", async () => {
  await refreshApproved();
  for (const id of [pA, pB, pPendingEdit, pOff]) {
    const key = `sp-${ref(id)}`;
    assert.ok(!getApproved().byId.has(key));
    assert.equal(getPublicProductByKey(key), undefined);
    assert.equal(await isProductPublicNow(key), false);
  }
  assert.equal(getPublicProductBySlug("live-a"), undefined);
  assert.equal(supplierCandidates({ nodeId: "apparel-fashion", attributes: { type: { value: "fabric" }, composition: { value: "cotton" }, colour: { value: "Navy" } } }).length, 0);
});
await check("historical inquiries and quotations that name the product are untouched by unpublish", async () => {
  const inquiryId = new ObjectId();
  await t.db.collection("inquiries").insertOne({ _id: inquiryId, reference: "FBM-INQ-HISTORIC", buyerId: new ObjectId(), productKey: `sp-${ref(pA)}`, supplierKey: `co:${companyId}`, supplierName: "Fixture Weavers", source: "supplier", quantity: 10, status: "NEW", createdAt: new Date() });
  const snapshot = JSON.stringify(await t.db.collection("inquiries").findOne({ _id: inquiryId }));
  const live2 = await mk("live-c", 8, live("Live C"));
  await M.unpublishProduct(admin, ref(live2), { reason: "History must survive.", expectedRevision: 1 });
  assert.equal(JSON.stringify(await t.db.collection("inquiries").findOne({ _id: inquiryId })), snapshot);
  await t.db.collection("inquiries").deleteOne({ _id: inquiryId });
});
await check("without the unpublish capability no row offers the action", async () => {
  assert.ok((await all({ status: "PUBLISHED" }, READ_ONLY)).items.every((x) => x.actions.unpublish === false));
  assert.ok((await all({ status: "UNPUBLISHED" }, FULL)).items.every((x) => x.actions.unpublish === false));
});
await check("export: same filters and scope, bounded, no drafts, no internal notes", async () => {
  const r = await M.exportProducts({ ...L.EMPTY_QUERY, status: "UNPUBLISHED" }, READ_ONLY);
  assert.ok(r.rows.length >= 3 && !r.truncated && r.rows.every((x) => x.status === "UNPUBLISHED"));
  assert.ok(!JSON.stringify(r).includes("Earlier restriction"), "the internal reason is not exported");
  assert.ok(!(await M.exportProducts(L.EMPTY_QUERY, READ_ONLY)).rows.some((x) => x.reference === ref(pDraft)));
});

await t.db.collection("product_visibility_events").deleteMany({ companyId });
await t.db.collection("admin_audit_log").deleteMany({ companyId });
await t.db.collection("admin_audit_log").deleteMany({ actorId: admin });
await t.db.collection("supplier_notifications").deleteMany({ supplierId: ownerUserId });
await t.cleanup(["supplier_products", "supplier_companies", "users"]);
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
