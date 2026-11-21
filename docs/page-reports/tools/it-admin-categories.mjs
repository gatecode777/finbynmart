// INTEGRATION test (writes to a database): Admin Category Management (Page 55): the activation overlay (transaction with audit row and recovery event, exactly once), stale revision, no-change,
// concurrency, reload of the overlay from the database into the central directory, authorization-grade rechecks (a supplier product of an inactive category is not publicly eligible, no new matched
// lead), reactivation, preserved data. Runs ONLY against an explicitly configured, transaction-capable, isolated test database (it-guard.mjs). NOT run in the build environment.
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_categories TEST_DB_CONFIRM=finbyn_it_categories AUTH_SECRET=<any test value> \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-admin-categories.mjs
// HTTP-level authorization (401 / 403 per capability, origin checks) and the browser E2E need signed-in sessions and are NOT covered here: see docs/admin/PAGE_55_CATEGORY_MANAGEMENT.md.
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
process.env.AUTH_SECRET ??= "integration-test-secret-integration";
const { decide } = await import("../../../src/lib/admin/productReview.ts");
const { refreshApproved, loadCategoryOverlay, isProductPublicNow, categoryActiveNow } = await import("../../../src/lib/catalog/approvedProducts.ts");
const { getApproved, isCategoryActive } = await import("../../../src/lib/catalog/approvedStore.ts");
const { getCategoryDirectory, getManagementCategories } = await import("../../../src/lib/catalog/categories.ts");
const C = await import("../../../src/lib/admin/categoryManagement.ts");
const R = await import("../../../src/lib/admin/categoryRules.ts");

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
const k = () => crypto.randomUUID();
const cell = (value, unit) => ({ value, ...(unit ? { unit } : {}) });
const admin = new ObjectId();
const ownerUserId = new ObjectId(), companyId = new ObjectId();
await t.db.collection("users").insertOne(t.tag({ _id: ownerUserId, name: "Owner", email: `${companyId}@fixture.invalid`, role: "supplier", supplier: { businessName: "Fixture Category Co", phone: "", city: "Surat", offering: "" } }));
await t.db.collection("supplier_companies").insertOne(t.tag({ _id: companyId, ownerUserId, sellerKeys: [], status: "ACTIVE", verificationStatus: "UNVERIFIED", createdAt: new Date(), updatedAt: new Date() }));
const attrs = { type: cell("fabric"), composition: cell("cotton"), colour: cell("Navy Blue"), gsm: cell(140), width: cell(44, "inch") };
const productId = new ObjectId();
await t.db.collection("supplier_products").insertOne(t.tag({ _id: productId, companyId, slug: "fixture-category-product", name: "fixture-category-product", sku: "", categoryName: "Apparel & Fashion", price: 150, unit: "metre", stock: 0, status: "DRAFT", imageUrl: "", description: "x", createdAt: new Date(), updatedAt: new Date(), draft: { revision: 1, createdBy: new ObjectId(), idempotencyKey: k(), bodyHash: "x", categoryId: "apparel-fashion", pricingMode: "FIXED", currency: "INR", unitPricePaise: 15000, priceUnit: "metre", moq: 50, quantityUnit: "metre", attributes: attrs, review: { state: "PENDING", submittedRevision: 1, submittedAt: new Date(), submittedBy: new ObjectId(), snapshot: { name: "fixture-category-product", sku: "", description: "Fixture", categoryId: "apparel-fashion", categoryName: "Apparel & Fashion", pricingMode: "FIXED", currency: "INR", unitPricePaise: 15000, priceUnit: "metre", moq: 50, quantityUnit: "metre", attributes: attrs, images: [{ fileId: "f", url: "https://ik.imagekit.io/fixture/a.jpg", name: "a.jpg" }] } } } }));
assert.ok((await decide(new ObjectId(), productId.toHexString(), { decision: "APPROVE", expectedRevision: 1 })).ok);
await refreshApproved();
const overrides = t.db.collection("category_overrides");
const audit = t.db.collection("admin_audit_log");
const auditCount = (a) => audit.countDocuments({ categoryId: "apparel-fashion", ...(a ? { action: a } : {}) });
const off = (o = {}) => C.setActivation(admin, "apparel-fashion", { isActive: false, reason: "No longer commercially available.", expectedRev: 0, idempotencyKey: k(), ...o });
const on = (rev, o = {}) => C.setActivation(admin, "apparel-fashion", { isActive: true, reason: "Back in the portfolio after review.", expectedRev: rev, idempotencyKey: k(), ...o });
const key = k();

await check("activation validates its input; an unknown, malformed or non-main category is refused; nothing is written", async () => {
  assert.equal((await off({ reason: "short" })).status, 422);
  assert.equal((await off({ isActive: "no" })).status, 422);
  assert.equal((await off({ expectedRev: "0" })).status, 422);
  assert.equal((await off({ idempotencyKey: "x" })).status, 422);
  assert.equal((await C.setActivation(admin, "../x", { isActive: false, reason: "No longer commercially available.", expectedRev: 0, idempotencyKey: k() })).status, 404);
  assert.equal((await C.setActivation(admin, "apparel-fashion~men", { isActive: false, reason: "No longer commercially available.", expectedRev: 0, idempotencyKey: k() })).status, 409, "a department follows its main category");
  assert.equal(await overrides.countDocuments({}), 0); assert.equal(await auditCount(), 0);
});
await check("a stale revision and a no-change request are 409", async () => {
  assert.equal((await off({ expectedRev: 3 })).status, 409);
  assert.equal((await on(0)).status, 409, "already active");
});
await check("deactivating commits the overlay, one audit row and one recovery event, refreshes this process, and keeps every product and record", async () => {
  const before = JSON.stringify(await t.db.collection("supplier_products").findOne({ _id: productId }));
  const r = await off({ idempotencyKey: key });
  assert.deepEqual({ ok: r.ok, replay: r.replay }, { ok: true, replay: false });
  const d = await overrides.findOne({ _id: "apparel-fashion" });
  assert.equal(d.isActive, false); assert.equal(d.rev, 1);
  assert.equal(await auditCount("CATEGORY_DEACTIVATED"), 1);
  const ev = await t.db.collection("category_events").findOne({ categoryId: "apparel-fashion" });
  assert.equal(ev.refresh.state, "DONE");
  assert.equal(isCategoryActive("apparel-fashion"), false);
  assert.ok(!getCategoryDirectory().nodes.some((n) => n.id === "apparel-fashion"));
  assert.ok(!getManagementCategories().some((n) => n.id === "apparel-fashion"));
  assert.ok(!getApproved().byId.has(`sp-${productId.toHexString()}`), "the supplier product leaves the public snapshot");
  assert.equal(JSON.stringify(await t.db.collection("supplier_products").findOne({ _id: productId })), before, "nothing is rewritten");
});
await check("a lost-response retry answers the original result; a changed request under the same key is 409; no second audit row or event", async () => {
  const again = await off({ idempotencyKey: key });
  assert.deepEqual({ ok: again.ok, replay: again.replay }, { ok: true, replay: true });
  assert.equal((await off({ idempotencyKey: key, reason: "A different reason entirely." })).status, 409);
  assert.equal(await auditCount("CATEGORY_DEACTIVATED"), 1); assert.equal(await t.db.collection("category_events").countDocuments({ categoryId: "apparel-fashion" }), 1);
});
await check("authorization-grade checks read the database: a supplier product of an inactive category is not publicly eligible", async () => {
  assert.equal(await categoryActiveNow("apparel-fashion"), false);
  assert.equal(await isProductPublicNow(`sp-${productId.toHexString()}`), false);
});
await check("a restart (overlay loaded from the database) reproduces the deactivation, and a failed overlay read keeps the last known set", async () => {
  const { setDeactivatedCategories } = await import("../../../src/lib/catalog/approvedStore.ts");
  setDeactivatedCategories([]);
  await loadCategoryOverlay();
  assert.equal(isCategoryActive("apparel-fashion"), false);
});
await check("reactivating restores the central rule only: the product is public again, nothing else is approved or changed", async () => {
  const r = await on(1);
  assert.equal(r.ok, true);
  assert.equal((await overrides.findOne({ _id: "apparel-fashion" })).isActive, true);
  assert.equal(await auditCount("CATEGORY_REACTIVATED"), 1);
  assert.equal(isCategoryActive("apparel-fashion"), true);
  assert.ok(getApproved().byId.has(`sp-${productId.toHexString()}`));
  assert.equal(await isProductPublicNow(`sp-${productId.toHexString()}`), true);
  assert.equal((await on(2)).status, 409);
});
await check("two administrators changing the same category at once produce exactly one change", async () => {
  const [a, b] = await Promise.all([off({ expectedRev: 2 }), C.setActivation(new ObjectId(), "apparel-fashion", { isActive: false, reason: "Concurrent attempt number two.", expectedRev: 2, idempotencyKey: k() })]);
  assert.equal([a, b].filter((x) => x.ok).length, 1);
  assert.equal(await auditCount("CATEGORY_DEACTIVATED"), 2);
  await on(3);
});
await check("the activity log is paged newest first; the list and detail report effective status and the impact without per-node queries", async () => {
  const p = await C.getActivity("apparel-fashion", null, 2);
  assert.equal(p.items.length, 2); assert.ok(p.nextCursor);
  assert.equal(await C.getActivity("nope~x", null), null);
  const list = await C.listCategories({ ...R.EMPTY_STATE, level: "MAIN" }, { activation: true, audit: true });
  assert.ok(list.items.every((x) => x.level === "MAIN") && list.summary.total >= list.summary.main);
  const d = await C.getCategory("apparel-fashion", { activation: true, audit: true });
  assert.ok(d.impact.eligibleProducts > 0 && d.impact.descendants > 0 && d.unsupported.length > 0);
});

await audit.deleteMany({ actorId: { $in: [admin] } });
await audit.deleteMany({ categoryId: "apparel-fashion" });
await t.db.collection("category_events").deleteMany({ categoryId: "apparel-fashion" });
await overrides.deleteMany({ _id: "apparel-fashion" });
await t.cleanup(["supplier_products", "supplier_companies", "users"]);
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
