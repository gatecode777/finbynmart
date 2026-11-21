// INTEGRATION test (writes to a database): Admin Buyer Management (Page 51): buyer eligibility (buyer role only, supplier and admin accounts excluded, absent status = ACTIVE), search and
// filters, deterministic pagination, masking, suspend / reactivate in one transaction with its audit row (exactly once, replay, conflict, concurrency), session-version rise, no deletion.
// Runs ONLY against an explicitly configured, transaction-capable, isolated test database (it-guard.mjs). NOT run in the build environment.
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_buyers TEST_DB_CONFIRM=finbyn_it_buyers AUTH_SECRET=<any test value> \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-admin-buyers.mjs
// NOT covered here (needs signed-in sessions and a running server): HTTP 401/403 per role and capability, cross-site refusal, that an ALREADY-ISSUED browser session is refused after suspension
// (the code paths are asserted statically in 84-admin-buyers-unit-test.mjs), and the browser flow. See docs/page-designs/PAGE_51_BUYER_MANAGEMENT.md.
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
process.env.AUTH_SECRET ??= "integration-test-secret-integration";
const B = await import("../../../src/lib/admin/buyerManagement.ts");
const R = await import("../../../src/lib/admin/buyerRules.ts");
const users = t.db.collection("users");
const audit = t.db.collection("admin_audit_log");
const admin = new ObjectId();
const key = () => crypto.randomUUID();
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
const mk = (over) => t.tag({ _id: new ObjectId(), name: "Fixture Buyer", email: `${new ObjectId()}@fixture.invalid`, passwordHash: "x", role: "buyer", createdAt: new Date(), ...over });

const day = (n) => new Date(Date.now() - n * 86_400_000);
const ids = { a: new ObjectId(), b: new ObjectId(), c: new ObjectId(), sup: new ObjectId(), adm: new ObjectId() };
await users.insertMany([
  mk({ _id: ids.a, name: "Zed Alpha", createdAt: day(1) }),                                  // no accountStatus: ACTIVE
  mk({ _id: ids.b, name: "Zed Beta", accountStatus: "SUSPENDED", createdAt: day(2) }),
  mk({ _id: ids.c, name: "Zed Gamma", accountStatus: "PENDING_EMAIL_VERIFICATION", createdAt: day(3), phone: { countryCode: "+91", number: "9876543210", normalized: "919876543210" } }),
  mk({ _id: ids.sup, name: "Zed Supplier", role: "supplier", createdAt: day(1) }),
  mk({ _id: ids.adm, name: "Zed Admin", role: "admin", createdAt: day(1) }),
]);
const mine = (r) => r.items.filter((i) => [ids.a, ids.b, ids.c, ids.sup, ids.adm].some((x) => x.toHexString() === i.id));
const caps = { suspend: true, reactivate: true, contacts: false, inquiries: true };

await check("only buyer-role accounts are listed once each; supplier and admin accounts never appear; absent status counts as ACTIVE", async () => {
  const r = await B.listBuyers({ q: "Zed", status: "all", page: 1 });
  assert.deepEqual(mine(r).map((i) => i.name), ["Zed Alpha", "Zed Beta", "Zed Gamma"]);
  assert.equal(mine(await B.listBuyers({ q: "Zed", status: "ACTIVE", page: 1 })).length, 1);
  assert.equal(mine(await B.listBuyers({ q: "Zed", status: "SUSPENDED", page: 1 }))[0].name, "Zed Beta");
});
await check("search: name prefix (case-insensitive), account reference, BUY- code; operators and regex characters are literals; a supplier id finds nothing", async () => {
  assert.equal((await B.listBuyers({ q: "zed al", status: "all", page: 1 })).items.length, 1);
  assert.equal((await B.listBuyers({ q: ids.a.toHexString(), status: "all", page: 1 })).items[0].id, ids.a.toHexString());
  assert.equal((await B.listBuyers({ q: R.refCode(ids.b.toHexString()), status: "all", page: 1 })).items[0].id, ids.b.toHexString());
  assert.equal((await B.listBuyers({ q: ".*", status: "all", page: 1 })).items.length, 0);
  assert.equal((await B.listBuyers({ q: ids.sup.toHexString(), status: "all", page: 1 })).items.length, 0);
});
await check("pagination is deterministic (newest first, id tie-break) with no duplicate across pages and an accurate total", async () => {
  const same = new Date();
  await users.insertMany(Array.from({ length: 25 }, (_, i) => mk({ name: `Pg ${i}`, createdAt: same })));
  const p1 = await B.listBuyers({ q: "Pg ", status: "all", page: 1 }, 10), p2 = await B.listBuyers({ q: "Pg ", status: "all", page: 2 }, 10), p3 = await B.listBuyers({ q: "Pg ", status: "all", page: 3 }, 10);
  const all = [...p1.items, ...p2.items, ...p3.items].map((i) => i.id);
  assert.equal(p1.meta.total, 25); assert.equal(all.length, 25); assert.equal(new Set(all).size, 25);
  assert.deepEqual(all, [...all].sort().reverse());
});
await check("detail: a supplier or admin id is not found; contact is masked without buyers.contacts and full with it; no secret field exists in the payload", async () => {
  assert.equal(await B.getBuyer(ids.sup.toHexString(), caps), null);
  assert.equal(await B.getBuyer(ids.adm.toHexString(), caps), null);
  const masked = await B.getBuyer(ids.c.toHexString(), caps);
  assert.ok(masked.contact.masked && /^\*+10$/.test(masked.contact.phone) && !JSON.stringify(masked).includes("9876543210") && !JSON.stringify(masked).includes("fixture.invalid"));
  const full = await B.getBuyer(ids.c.toHexString(), { ...caps, contacts: true });
  assert.equal(full.contact.phone, "919876543210");
  assert.ok(!/passwordHash|token|sessionVersion/.test(JSON.stringify(full)));
  assert.equal(masked.businessVerified, false);
});
await check("suspend: one audit row, status and revision change, session version rises, nothing deleted; a repeat of the same request is a replay with no second audit row", async () => {
  const k = key(), before = await users.findOne({ _id: ids.a });
  const r = await B.changeBuyerStatus("suspend", admin, ids.a.toHexString(), { reason: "Repeated abusive inquiries reported.", expectedRev: 0, idempotencyKey: k });
  assert.ok(r.ok && !r.replay);
  const after = await users.findOne({ _id: ids.a });
  assert.equal(after.accountStatus, "SUSPENDED"); assert.equal(after.accountRev, 1); assert.equal(after.sessionVersion, (before.sessionVersion ?? 0) + 1);
  assert.equal(after.email, before.email); assert.equal(after.passwordHash, before.passwordHash); assert.equal(after.role, "buyer");
  assert.equal(await audit.countDocuments({ buyerId: ids.a }), 1);
  const again = await B.changeBuyerStatus("suspend", admin, ids.a.toHexString(), { reason: "Repeated abusive inquiries reported.", expectedRev: 0, idempotencyKey: k });
  assert.ok(again.ok && again.replay);
  assert.equal(await audit.countDocuments({ buyerId: ids.a }), 1);
  const diff = await B.changeBuyerStatus("suspend", admin, ids.a.toHexString(), { reason: "A different reason entirely here.", expectedRev: 0, idempotencyKey: k });
  assert.ok(!diff.ok && diff.status === 409);
});
await check("a stale revision, an unavailable action, a pending-confirmation account, an unknown, non-buyer and malformed id are refused with no change", async () => {
  const stale = await B.changeBuyerStatus("reactivate", admin, ids.a.toHexString(), { reason: "Reviewed and cleared again.", expectedRev: 0, idempotencyKey: key() });
  assert.ok(!stale.ok && stale.status === 409);
  const again = await B.changeBuyerStatus("suspend", admin, ids.a.toHexString(), { reason: "Already suspended duplicate.", expectedRev: 1, idempotencyKey: key() });
  assert.ok(!again.ok && again.status === 409);
  const pending = await B.changeBuyerStatus("suspend", admin, ids.c.toHexString(), { reason: "Pending account attempt.", expectedRev: 0, idempotencyKey: key() });
  assert.ok(!pending.ok && pending.status === 409);
  assert.equal((await users.findOne({ _id: ids.c })).accountStatus, "PENDING_EMAIL_VERIFICATION");
  for (const id of [ids.sup.toHexString(), ids.adm.toHexString(), new ObjectId().toHexString()]) {
    const r = await B.changeBuyerStatus("suspend", admin, id, { reason: "Not a buyer account.", expectedRev: 0, idempotencyKey: key() });
    assert.ok(!r.ok && r.status === 404);
  }
  assert.equal((await users.findOne({ _id: ids.sup })).accountStatus, undefined);
  assert.equal((await B.changeBuyerStatus("suspend", admin, "nope", { reason: "Malformed identifier.", expectedRev: 0, idempotencyKey: key() })).status, 404);
  const bad = await B.changeBuyerStatus("suspend", admin, ids.b.toHexString(), { reason: "x", expectedRev: -1, idempotencyKey: "short" });
  assert.ok(!bad.ok && bad.status === 422 && bad.fields.reason && bad.fields.expectedRev && bad.fields.idempotencyKey);
});
await check("reactivate: the account is ACTIVE again, the earlier session version stays raised, the audit row is added, nothing else changed", async () => {
  const before = await users.findOne({ _id: ids.a });
  const r = await B.changeBuyerStatus("reactivate", admin, ids.a.toHexString(), { reason: "Reviewed and cleared by staff.", expectedRev: 1, idempotencyKey: key() });
  assert.ok(r.ok);
  const after = await users.findOne({ _id: ids.a });
  assert.equal(after.accountStatus, "ACTIVE"); assert.equal(after.accountRev, 2); assert.equal(after.sessionVersion, before.sessionVersion); assert.equal(after.suspension, undefined);
  assert.equal(await audit.countDocuments({ buyerId: ids.a }), 2);
});
await check("concurrency: five identical requests make one change and one audit row; two different requests on the same revision give exactly one success and one conflict", async () => {
  const k = key();
  const same = await Promise.all(Array.from({ length: 5 }, () => B.changeBuyerStatus("suspend", admin, ids.a.toHexString(), { reason: "Concurrent identical request.", expectedRev: 2, idempotencyKey: k })));
  assert.ok(same.every((r) => r.ok));
  assert.equal(await audit.countDocuments({ buyerId: ids.a, "after.revision": 3 }), 1);
  assert.equal((await users.findOne({ _id: ids.a })).accountRev, 3);
  const two = await Promise.all([1, 2].map((i) => B.changeBuyerStatus("reactivate", admin, ids.a.toHexString(), { reason: `Concurrent different request ${i}.`, expectedRev: 3, idempotencyKey: key() })));
  assert.equal(two.filter((r) => r.ok).length, 1); assert.equal(two.filter((r) => !r.ok && r.status === 409).length, 1);
  assert.equal((await users.findOne({ _id: ids.a })).accountRev, 4);
});

await audit.deleteMany({ actorId: admin });
await t.cleanup(["users"]);
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
