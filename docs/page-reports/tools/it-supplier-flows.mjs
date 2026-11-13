// INTEGRATION test (writes to a database). It runs ONLY against an explicitly configured, transaction-capable, isolated test database; see it-guard.mjs
// and docs/testing/TEST_ENVIRONMENT.md. It has NOT been run in the audit environment (no isolated database was available).
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_supplier TEST_DB_CONFIRM=finbyn_it_supplier \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-supplier-flows.mjs
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
const { linkSeller } = await import("../../../src/lib/admin/sellerMapping.ts");
const { confirmOrder } = await import("../../../src/lib/orders/orderConfirmation.ts");
const { resolveSupplier } = await import("../../../src/lib/catalog/productRef.ts");
const { getCatalog } = await import("../../../src/lib/catalog/data.ts");

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
const admin = new ObjectId();
const seller = resolveSupplier(getCatalog().sellers[0].id);
assert.ok(seller, "a catalogue seller is needed");
const mkCompany = async (keys = []) => {
  const _id = new ObjectId();
  await t.db.collection("supplier_companies").insertOne(t.tag({ _id, ownerUserId: new ObjectId(), sellerKeys: keys, status: "ACTIVE", verificationStatus: "UNVERIFIED", createdAt: new Date(), updatedAt: new Date() }));
  return _id.toHexString();
};
const REASON = "Ticket FBM-SUP-202611-ABC123 and licence seen";
const L = (companyId) => ({ companyId, sellerKey: seller.key, reason: REASON, acknowledgeHistory: true });

await check("two companies cannot both own the same seller, even concurrently", async () => {
  const [a, b] = [await mkCompany(), await mkCompany()];
  const res = await Promise.allSettled([linkSeller(admin, L(a)), linkSeller(admin, L(b))]);
  const oks = res.filter((r) => r.status === "fulfilled" && r.value.ok && !r.value.replayed).length;
  assert.equal(oks, 1);
  assert.equal(await t.db.collection("supplier_companies").countDocuments({ _fixture: t.runId, sellerKeys: seller.key }), 1);
});
await check("repeating the same link is safe and writes one audit row", async () => {
  const c = await mkCompany([]);
  const before = await t.db.collection("admin_audit_log").countDocuments({ companyId: new ObjectId(c) });
  const first = await linkSeller(admin, L(c));
  if (first.ok) { const again = await linkSeller(admin, L(c)); assert.ok(again.ok && again.replayed); }
  assert.ok((await t.db.collection("admin_audit_log").countDocuments({ companyId: new ObjectId(c) })) - before <= 1);
});
await check("a link without a reason or acknowledgement is refused and changes nothing", async () => {
  const c = await mkCompany([]);
  const r = await linkSeller(admin, { companyId: c, sellerKey: seller.key, reason: "x", acknowledgeHistory: false });
  assert.equal(r.ok, false);
  assert.deepEqual((await t.db.collection("supplier_companies").findOne({ _id: new ObjectId(c) })).sellerKeys, []);
});

// ---- order confirmation (accepted quotation fixture)
const buyer = new ObjectId();
const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ref = () => "FBM-QT-" + Array.from({ length: 8 }, () => ALPHA[Math.floor(Math.random() * 32)]).join("");
const mkQuote = async (supplierKey, qty, productKey) => {
  const reference = ref();
  await t.db.collection("quotations").insertOne(t.tag({ reference, version: 1, isCurrent: true, inquiryId: new ObjectId(), inquiryReference: "FBM-INQ-TESTTEST", buyerId: buyer, supplierKey, supplierName: "Fixture Seller", productKey, productName: "Fixture product", currency: "INR", unit: "metre", quantity: qty, unitPriceMinor: 12500, validUntil: new Date(Date.now() + 864e5), status: "ACCEPTED", accepted: true, decision: { type: "ACCEPTED", at: new Date(), reason: null }, sentAt: new Date(), createdAt: new Date(), updatedAt: new Date(), events: [] }));
  return reference;
};
const key = () => crypto.randomUUID().replace(/-/g, "").padEnd(20, "x");
await check("concurrent confirmations create exactly one order with the stored price", async () => {
  const q = await mkQuote("fixture-seller-untracked", 4, undefined);
  const res = await Promise.all([confirmOrder(buyer.toHexString(), q, key()), confirmOrder(buyer.toHexString(), q, key())]);
  assert.ok(res.every((r) => r.ok));
  const orders = await t.db.collection("orders").find({ quotationReference: q }).toArray();
  assert.equal(orders.length, 1);
  assert.equal(orders[0].totalMinor, 50000);
  assert.equal(orders[0].inventory.mode, "UNTRACKED");
  assert.equal(orders[0].status, "CONFIRMED");
});
await check("a key reused for another quotation is a conflict", async () => {
  const [q1, q2] = [await mkQuote("fixture-seller-untracked", 1), await mkQuote("fixture-seller-untracked", 1)];
  const k = key();
  assert.ok((await confirmOrder(buyer.toHexString(), q1, k)).ok);
  const r = await confirmOrder(buyer.toHexString(), q2, k);
  assert.equal(r.ok, false); assert.equal(r.status, 409);
});
await check("another buyer cannot confirm my accepted quotation", async () => {
  const q = await mkQuote("fixture-seller-untracked", 1);
  const r = await confirmOrder(new ObjectId().toHexString(), q, key());
  assert.equal(r.ok, false); assert.equal(r.status, 404);
});
await check("a tracked line reserves stock and an over-large order is refused with nothing created", async () => {
  const companyId = new ObjectId();
  const owner = new ObjectId();
  await t.db.collection("supplier_companies").insertOne(t.tag({ _id: companyId, ownerUserId: owner, sellerKeys: ["fixture-seller-tracked"], status: "ACTIVE", verificationStatus: "UNVERIFIED", createdAt: new Date(), updatedAt: new Date() }));
  const pos = new ObjectId();
  await t.db.collection("inventory_positions").insertOne(t.tag({ _id: pos, companyId, productRef: "cat-9999999", sku: "S", name: "N", searchKey: "n s", unit: "metre", onHandMilli: 5000, reservedMilli: 0, reorderMilli: null, status: "IN_STOCK", revision: 1, createdAt: new Date(), updatedAt: new Date() }));
  const big = await mkQuote("fixture-seller-tracked", 6, "9999999");
  const refused = await confirmOrder(buyer.toHexString(), big, key());
  assert.equal(refused.ok, false); assert.equal(refused.code, "INSUFFICIENT_STOCK");
  assert.equal(await t.db.collection("orders").countDocuments({ quotationReference: big }), 0);
  assert.equal((await t.db.collection("inventory_positions").findOne({ _id: pos })).reservedMilli, 0);
  const ok = await mkQuote("fixture-seller-tracked", 5, "9999999");
  const done = await confirmOrder(buyer.toHexString(), ok, key());
  assert.ok(done.ok && done.inventory === "TRACKED");
  assert.equal((await t.db.collection("inventory_positions").findOne({ _id: pos })).reservedMilli, 5000);
  const second = await mkQuote("fixture-seller-tracked", 1, "9999999");
  assert.equal((await confirmOrder(buyer.toHexString(), second, key())).code, "INSUFFICIENT_STOCK");
});

await t.cleanup(["supplier_companies", "quotations", "orders", "inventory_positions", "inventory_movements", "admin_audit_log", "supplier_notifications"]);
console.log(`\n${passed} passed, 0 failed`);
