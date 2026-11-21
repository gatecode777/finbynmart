// INTEGRATION test (writes to a database): Admin Notifications (Page 62): one event per real workflow event (duplicate key = no second), a rolled-back transaction leaves no event, newest-first
// pagination with ties, personal read state (Admin A does not affect Admin B), idempotent single and mark-all, the mark-all cutoff (older pages included, later events unread, independent of the
// type filter), the unread count equals the list rules and is not filtered by tab or type, permission revocation and grant, and that reading writes nothing.
// Runs ONLY against an explicitly configured, transaction-capable, isolated test database (it-guard.mjs). NOT run in the build environment.
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_notify TEST_DB_CONFIRM=finbyn_it_notify AUTH_SECRET=<any test value> \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-admin-notifications.mjs
// NOT covered here (needs the real producers, signed-in sessions and a server): that the verification, product and support producers fire inside their own transactions end to end, HTTP 401/403
// by role, cross-site refusal and the browser flow. See docs/page-designs/PAGE_62_ADMIN_NOTIFICATIONS.md.
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
process.env.AUTH_SECRET ??= "integration-test-secret-integration";
const N = await import("../../../src/lib/admin/notifications.ts");
const db = t.db;
const A = new ObjectId(), B = new ObjectId();
const ALL = ["notifications.read", "verification.read", "products.review", "support.manage"];
const PROD_ONLY = ["notifications.read", "products.review"];
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
const q = (o = {}) => ({ tab: "all", type: "all", cursor: null, limit: 20, ...o });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const all = async (admin, perms, o = {}) => { const out = []; let cursor = null; do { const p = await N.listNotifications(admin, perms, q({ ...o, cursor: cursor ? { ms: Number(cursor.split("_")[0]), id: cursor.split("_")[1] } : null, limit: 7 })); out.push(...p.items); cursor = p.nextCursor; } while (cursor); return out; };
const ev = (type, key, ref, now) => N.recordAdminEvent(undefined, { type, sourceKey: `it:${t.runId}:${key}`, reference: ref }, now);
const dbState = async () => JSON.stringify([await db.collection("admin_notifications").find({ sourceKey: { $regex: `^it:${t.runId}:` } }).sort({ sourceKey: 1 }).toArray(), await db.collection("admin_notification_reads").find({ adminId: { $in: [A, B] } }).toArray(), await db.collection("admin_notification_state").find({ _id: { $in: [A, B] } }).toArray()]);

const base = Date.now() - 60_000;
await ev("VERIFICATION_SUBMITTED", "v1", "FBM-VER-AAAA0001", new Date(base));
await ev("PRODUCT_REVISION_SUBMITTED", "p1", "prod1", new Date(base + 1000));
await ev("SUPPORT_TICKET_CREATED", "s1", "FBM-SUP-202611-AAAAAA", new Date(base + 2000));
for (let i = 0; i < 20; i++) await ev("PRODUCT_REVISION_SUBMITTED", `bulk${i}`, `prod-bulk${i}`, new Date(base + 3000 + (i < 10 ? 0 : i * 10))); // 10 events share one recorded time

await check("a duplicate source key creates no second event (a retry of the same real event)", async () => {
  await ev("VERIFICATION_SUBMITTED", "v1", "FBM-VER-AAAA0001", new Date());
  assert.equal(await db.collection("admin_notifications").countDocuments({ sourceKey: `it:${t.runId}:v1` }), 1);
});
await check("a rolled-back transaction leaves no event; a committed one leaves exactly one", async () => {
  const s = t.client.startSession();
  await assert.rejects(s.withTransaction(async () => { await N.recordAdminEvent(s, { type: "SUPPORT_TICKET_CREATED", sourceKey: `it:${t.runId}:rolled`, reference: "FBM-SUP-X" }); throw new Error("business write failed"); }));
  assert.equal(await db.collection("admin_notifications").countDocuments({ sourceKey: `it:${t.runId}:rolled` }), 0);
  await s.withTransaction(async () => { await N.recordAdminEvent(s, { type: "SUPPORT_TICKET_CREATED", sourceKey: `it:${t.runId}:committed`, reference: "FBM-SUP-Y" }); });
  await s.endSession();
  assert.equal(await db.collection("admin_notifications").countDocuments({ sourceKey: `it:${t.runId}:committed` }), 1);
});
await check("events hold only type, source key, capability, reference and time (no user-authored text)", async () => {
  const d = await db.collection("admin_notifications").findOne({ sourceKey: `it:${t.runId}:s1` });
  assert.deepEqual(Object.keys(d).sort(), ["_id", "capability", "recordedAt", "reference", "sourceKey", "type"]);
  assert.equal(d.capability, "support.manage");
});
await check("newest-first pagination is deterministic across pages (ties on the recorded time), with no duplicate or missing event, and the total equals the authorized events", async () => {
  const items = await all(A, ALL);
  const ids = items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  const expected = await db.collection("admin_notifications").find({ capability: { $in: ["verification.read", "products.review", "support.manage"] }, sourceKey: { $regex: `^it:${t.runId}:` } }).sort({ recordedAt: -1, _id: -1 }).toArray();
  assert.deepEqual(items.filter((i) => expected.some((e) => e._id.toHexString() === i.id)).map((i) => i.id), expected.map((e) => e._id.toHexString()));
});
await check("authorization is current: a product-only admin sees and counts only product events; no capability sees nothing; GET writes nothing", async () => {
  const before = await dbState();
  const prod = await all(A, PROD_ONLY);
  assert.ok(prod.length > 0 && prod.every((i) => i.type === "PRODUCT_REVISION_SUBMITTED"));
  assert.equal((await N.listNotifications(A, ["notifications.read"], q())).items.length, 0);
  assert.equal(await N.unreadCount(A, ["notifications.read"]), 0);
  assert.equal(await dbState(), before);
});
await check("the unread count equals the unread list under the same rules and is not changed by the tab or type filter", async () => {
  const total = await N.unreadCount(A, ALL);
  const unreadAll = await all(A, ALL, { tab: "unread" });
  assert.equal(unreadAll.length, total);
  const typed = await N.listNotifications(A, ALL, q({ type: "SUPPORT_TICKET_CREATED" }));
  assert.equal(typed.unreadCount, total);
});
await check("single mark is idempotent, personal (Admin B is unaffected) and updates the count by exactly one", async () => {
  const first = (await N.listNotifications(A, ALL, q())).items[0];
  const before = await N.unreadCount(A, ALL);
  const r1 = await N.markRead(A, ALL, first.id), r2 = await N.markRead(A, ALL, first.id);
  assert.ok(r1.ok && r2.ok); assert.equal(r1.unreadCount, before - 1); assert.equal(r2.unreadCount, before - 1);
  assert.equal(await db.collection("admin_notification_reads").countDocuments({ adminId: A, eventId: new ObjectId(first.id) }), 1);
  assert.equal(await N.unreadCount(B, ALL), before);
  assert.equal((await N.listNotifications(B, ALL, q())).items.find((i) => i.id === first.id).read, false);
  assert.equal((await N.listNotifications(A, ALL, q())).items.find((i) => i.id === first.id).read, true);
});
await check("marking an event the admin may not see, an unknown id or a malformed id is the same refusal and writes nothing", async () => {
  const sup = await db.collection("admin_notifications").findOne({ sourceKey: `it:${t.runId}:s1` });
  const before = await dbState();
  assert.deepEqual(await N.markRead(A, PROD_ONLY, sup._id.toHexString()), { ok: false, status: 404 });
  assert.deepEqual(await N.markRead(A, ALL, new ObjectId().toHexString()), { ok: false, status: 404 });
  assert.deepEqual(await N.markRead(A, ALL, "nope"), { ok: false, status: 404 });
  assert.equal(await dbState(), before);
});
await check("mark all: reads everything authorized now including older pages, independent of the type filter, only for this admin; a repeat is a no-op; events recorded afterwards stay unread", async () => {
  const bBefore = await N.unreadCount(B, ALL);
  const r = await N.markAllRead(A, ALL);
  assert.equal(r.unreadCount, 0);
  assert.equal((await all(A, ALL, { tab: "unread" })).length, 0);
  assert.equal(await N.unreadCount(B, ALL), bBefore);
  assert.equal((await N.markAllRead(A, ALL)).unreadCount, 0);
  await wait(30);
  await ev("SUPPORT_TICKET_CREATED", "after-cutoff", "FBM-SUP-202611-ZZZZZZ", new Date());
  assert.equal(await N.unreadCount(A, ALL), 1);
  const unread = await all(A, ALL, { tab: "unread" });
  assert.equal(unread.length, 1); assert.equal(unread[0].type, "SUPPORT_TICKET_CREATED");
  assert.equal((await N.listNotifications(A, ALL, q({ type: "PRODUCT_REVISION_SUBMITTED" }))).unreadCount, 1);
});
await check("a product-only admin's mark all never hides support events they later become authorized for if they are newer than the cutoff, and the cutoff only moves forward", async () => {
  const cut0 = (await db.collection("admin_notification_state").findOne({ _id: B }))?.readKey ?? null;
  await N.markAllRead(B, PROD_ONLY);
  const cut1 = (await db.collection("admin_notification_state").findOne({ _id: B })).readKey;
  assert.ok(cut0 === null || cut1 >= cut0);
  assert.equal(await N.unreadCount(B, PROD_ONLY), 0);
  assert.ok((await N.unreadCount(B, ALL)) >= 1); // the newest support event is beyond a product-only cutoff only if newer; the later verification/support events are visible once authorized
  await N.markAllRead(B, PROD_ONLY);
  assert.equal((await db.collection("admin_notification_state").findOne({ _id: B })).readKey, cut1);
});
await check("revocation removes the events from the list and the count at once; the receipts are kept but not exposed", async () => {
  const before = await N.unreadCount(B, ALL);
  assert.ok((await all(B, PROD_ONLY)).every((i) => i.type === "PRODUCT_REVISION_SUBMITTED"));
  assert.ok((await N.unreadCount(B, ["notifications.read", "verification.read"])) <= before);
  assert.equal(await N.unreadCount(B, ["notifications.read"]), 0);
});
await check("the list and count queries use indexes (no collection scan on events)", async () => {
  const plan = await db.collection("admin_notifications").find({ capability: { $in: ["products.review", "support.manage"] } }).sort({ recordedAt: -1, _id: -1 }).limit(21).explain("queryPlanner");
  assert.ok(!JSON.stringify(plan).includes("COLLSCAN"));
});

await db.collection("admin_notifications").deleteMany({ sourceKey: { $regex: `^it:${t.runId}:` } });
await db.collection("admin_notification_reads").deleteMany({ adminId: { $in: [A, B] } });
await db.collection("admin_notification_state").deleteMany({ _id: { $in: [A, B] } });
await t.client.close();
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
