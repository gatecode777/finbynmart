// INTEGRATION test (writes to a database): Admin Settings (Page 64): the display-name change (one transaction with its audit row, no change for the same name, never another role's account, no other
// field touched), and the notification preferences' REAL effect on the Page 62 inbox: defaults, a hidden category disappears from the list, the unread count and mark-all, events are still recorded,
// re-enabling shows them again with their read state, personal to each admin, unauthorized categories refused, revocation still blocks.
// Runs ONLY against an explicitly configured, transaction-capable, isolated test database (it-guard.mjs). NOT run in the build environment.
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_settings TEST_DB_CONFIRM=finbyn_it_settings AUTH_SECRET=<any test value> \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-admin-settings.mjs
// NOT covered here (needs sessions and a server): HTTP 401/403 by role, cross-site refusal, the header showing the new name after a save, and the real change-password flow for an admin account.
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
process.env.AUTH_SECRET ??= "integration-test-secret-integration";
const S = await import("../../../src/lib/admin/settings.ts");
const N = await import("../../../src/lib/admin/notifications.ts");
const db = t.db;
const A = new ObjectId(), B = new ObjectId(), BUYER = new ObjectId();
const ALL = ["notifications.read", "verification.read", "products.review", "support.manage"];
const q = (o = {}) => ({ tab: "all", type: "all", cursor: null, limit: 50, ...o });
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
const mk = (_id, role, name) => t.tag({ _id, name, email: `${_id}@fixture.invalid`, passwordHash: "hash-must-not-change", role, accountStatus: "ACTIVE", sessionVersion: 3, createdAt: new Date() });
await db.collection("users").insertMany([mk(A, "admin", "Admin One"), mk(B, "admin", "Admin Two"), mk(BUYER, "buyer", "Buyer Person")]);
const ev = (type, key, now) => N.recordAdminEvent(undefined, { type, sourceKey: `it:${t.runId}:${key}`, reference: "FBM-X-1" }, now);
const base = Date.now() - 60_000;
await ev("VERIFICATION_SUBMITTED", "v", new Date(base)); await ev("PRODUCT_REVISION_SUBMITTED", "p", new Date(base + 1000)); await ev("SUPPORT_TICKET_CREATED", "s", new Date(base + 2000));

await check("the display name changes in one transaction with an audit row that records the fact (no names); nothing else about the account changes", async () => {
  const before = await db.collection("users").findOne({ _id: A });
  const r = await S.updateDisplayName(A, "Asha Rao");
  assert.deepEqual(r, { ok: true, name: "Asha Rao", changed: true });
  const after = await db.collection("users").findOne({ _id: A });
  assert.equal(after.name, "Asha Rao");
  for (const k of ["email", "role", "passwordHash", "accountStatus", "sessionVersion", "adminPermissions"]) assert.deepEqual(after[k], before[k]);
  const rows = await db.collection("admin_audit_log").find({ action: "ADMIN_DISPLAY_NAME_CHANGED", actorId: A }).toArray();
  assert.equal(rows.length, 1); assert.ok(!JSON.stringify(rows[0]).includes("Asha") && !JSON.stringify(rows[0]).includes("Admin One"));
});
await check("saving the same name is a no-op with no second audit row", async () => {
  const r = await S.updateDisplayName(A, "Asha Rao");
  assert.deepEqual(r, { ok: true, name: "Asha Rao", changed: false });
  assert.equal(await db.collection("admin_audit_log").countDocuments({ action: "ADMIN_DISPLAY_NAME_CHANGED", actorId: A }), 1);
});
await check("a non-admin account (a buyer id) is never updated or read by the settings service; another admin is untouched", async () => {
  assert.deepEqual(await S.updateDisplayName(BUYER, "Hacked"), { ok: false, status: 404 });
  assert.equal((await db.collection("users").findOne({ _id: BUYER })).name, "Buyer Person");
  assert.equal(await S.getAccount(BUYER), null);
  assert.equal((await db.collection("users").findOne({ _id: B })).name, "Admin Two");
  const acct = await S.getAccount(A);
  assert.deepEqual(Object.keys(acct).sort(), ["email", "emailConfirmed", "name", "role"]);
});
await check("preferences default to all authorized categories on", async () => {
  const c = await N.getPreferences(A, ALL);
  assert.equal(c.length, 3); assert.ok(c.every((x) => x.enabled));
  assert.equal((await N.getPreferences(A, ["notifications.read", "products.review"])).length, 1);
});
await check("hiding a category removes it from the list, the unread count and mark-all; the events are still recorded; nothing is deleted or marked read", async () => {
  const total = await N.unreadCount(A, ALL);
  const evBefore = await db.collection("admin_notifications").countDocuments({ sourceKey: { $regex: `^it:${t.runId}:` } });
  const r = await N.savePreferences(A, ALL, ["VERIFICATION_SUBMITTED", "PRODUCT_REVISION_SUBMITTED"]);
  assert.ok(r.ok); assert.equal(r.unreadCount, total - 1);
  const list = await N.listNotifications(A, ALL, q());
  assert.ok(list.items.every((i) => i.type !== "SUPPORT_TICKET_CREATED")); assert.ok(list.supportedTypes.every((x) => x.key !== "SUPPORT_TICKET_CREATED"));
  assert.equal(list.unreadCount, total - 1);
  await ev("SUPPORT_TICKET_CREATED", "s2", new Date()); // recorded for everyone
  assert.equal(await db.collection("admin_notifications").countDocuments({ sourceKey: { $regex: `^it:${t.runId}:` } }), evBefore + 1);
  assert.equal(await N.unreadCount(A, ALL), total - 1); // still hidden for A
  assert.equal(await N.unreadCount(B, ALL), total + 1); // B is unaffected
  assert.equal(await db.collection("admin_notification_reads").countDocuments({ adminId: A }), 0);
});
await check("a hidden event cannot be marked read through the API path (same 404)", async () => {
  const sup = await db.collection("admin_notifications").findOne({ sourceKey: `it:${t.runId}:s` });
  assert.deepEqual(await N.markRead(A, ALL, sup._id.toHexString()), { ok: false, status: 404 });
});
await check("mark all while a category is hidden does not touch it: re-enabling shows its existing events as unread", async () => {
  await N.markAllRead(A, ALL);
  assert.equal(await N.unreadCount(A, ALL), 0);
  const r = await N.savePreferences(A, ALL, ["VERIFICATION_SUBMITTED", "PRODUCT_REVISION_SUBMITTED", "SUPPORT_TICKET_CREATED"]);
  assert.ok(r.ok);
  assert.ok(r.unreadCount >= 0);
  const items = (await N.listNotifications(A, ALL, q())).items.filter((i) => i.type === "SUPPORT_TICKET_CREATED");
  assert.equal(items.length, 2);
});
await check("unauthorized, unknown and malformed categories are refused and change nothing; a category not currently held keeps its state", async () => {
  const before = JSON.stringify(await db.collection("admin_notification_state").findOne({ _id: A }));
  for (const bad of [["SUPPORT_TICKET_CREATED"], ["NOPE"], "x", [1], ["PRODUCT_REVISION_SUBMITTED", "PRODUCT_REVISION_SUBMITTED"]]) {
    const r = await N.savePreferences(A, ["notifications.read", "products.review"], bad);
    assert.ok(!r.ok && r.fields.categories);
  }
  assert.equal(JSON.stringify(await db.collection("admin_notification_state").findOne({ _id: A })), before);
  await N.savePreferences(A, ALL, ["VERIFICATION_SUBMITTED", "PRODUCT_REVISION_SUBMITTED"]); // hide support
  await N.savePreferences(A, ["notifications.read", "products.review"], []); // revoked support: its muted state is kept
  assert.ok((await db.collection("admin_notification_state").findOne({ _id: A })).muted.includes("SUPPORT_TICKET_CREATED"));
});
await check("revocation still blocks: without the capability the category is neither listed nor counted, whatever the preference", async () => {
  await N.savePreferences(A, ALL, ["VERIFICATION_SUBMITTED", "PRODUCT_REVISION_SUBMITTED", "SUPPORT_TICKET_CREATED"]);
  const items = (await N.listNotifications(A, ["notifications.read", "products.review"], q())).items;
  assert.ok(items.every((i) => i.type === "PRODUCT_REVISION_SUBMITTED"));
});

await db.collection("admin_notifications").deleteMany({ sourceKey: { $regex: `^it:${t.runId}:` } });
await db.collection("admin_notification_reads").deleteMany({ adminId: { $in: [A, B] } });
await db.collection("admin_notification_state").deleteMany({ _id: { $in: [A, B] } });
await db.collection("admin_audit_log").deleteMany({ actorId: { $in: [A, B] } });
await t.cleanup(["users"]);
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
