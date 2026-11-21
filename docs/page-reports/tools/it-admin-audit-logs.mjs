// INTEGRATION test (writes to a database): Admin Audit Logs (Page 65), READ-ONLY service over `admin_audit_log`: global newest-first order with identical timestamps, keyset pagination without duplicates
// (including inserts during paging), the visibility scope (audit.read plus each action's domain capability) in rows, action options and detail, filters and search against the recorded fields, timezone
// boundaries, deleted actors / missing optional fields / legacy shapes, allowlisted metadata only (no hash, operation key, snapshots or unknown fields), no outcome invented, and that reading changes nothing.
// Runs ONLY against an explicitly configured, transaction-capable, isolated test database (it-guard.mjs). NOT run in the build environment.
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_audit TEST_DB_CONFIRM=finbyn_it_audit AUTH_SECRET=<any test value> \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-admin-audit-logs.mjs
// NOT covered here (needs sessions and a server): HTTP 401/403 by role and capability and the browser flow. See docs/page-designs/PAGE_65_ADMIN_AUDIT_LOGS.md.
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
process.env.AUTH_SECRET ??= "integration-test-secret-integration";
const L = await import("../../../src/lib/admin/auditLogs.ts");
const db = t.db;
const audit = db.collection("admin_audit_log");
const now = new Date("2026-11-20T10:00:00.000Z");
const IST = (day, hms) => new Date(`${day}T${hms}+05:30`);
const ADMIN = new ObjectId(), GONE = new ObjectId(), SUP = new ObjectId(), BUYER = new ObjectId(), COMPANY = new ObjectId();
const ALL = ["audit.read", "inquiries.audit", "suppliers.audit", "sellers.map", "verification.audit", "categories.audit", "products.review", "products.read", "buyers.read", "inquiries.read", "verification.read", "suppliers.read"];
const q = (o = {}) => ({ action: "all", q: "", from: "2026-11-01", to: "2026-11-20", cursor: null, limit: 20, ...o });
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
await db.collection("users").insertMany([t.tag({ _id: ADMIN, name: "Actor Admin", email: "a@fixture.invalid", passwordHash: "x", role: "admin" }), t.tag({ _id: SUP, name: "Supplier Person", email: "s@fixture.invalid", passwordHash: "x", role: "supplier" })]);
const ev = (o) => ({ _id: new ObjectId(), ...o });
const T0 = IST("2026-11-10", "12:00:00");
const rows = [
  ev({ action: "BUYER_ACCOUNT_SUSPENDED", actorId: ADMIN, buyerId: BUYER, reason: "Repeated abusive inquiries.", operationKey: "secret-op-key", bodyHash: "secret-hash", before: { status: "ACTIVE", revision: 0, hugeSnapshot: { email: "leak@x" } }, after: { status: "SUSPENDED", revision: 1 }, summary: "Active to Suspended", at: T0, extraUnknown: "must be dropped" }),
  ev({ action: "BUYER_ACCOUNT_REACTIVATED", actorId: ADMIN, buyerId: BUYER, reason: "<script>alert(1)</script> reviewed", before: { status: "SUSPENDED" }, after: { status: "ACTIVE" }, at: T0 }), // same timestamp, stored markup is plain text
  ev({ action: "SUPPLIER_COMPANY_SUSPENDED", actorId: GONE, companyId: COMPANY, reason: "Policy review.", at: IST("2026-11-11", "09:00:00") }), // deleted actor
  ev({ action: "VERIFICATION_SUBMITTED", actorId: SUP, companyId: COMPANY, verificationReference: "FBM-VER-ABCD1234", summary: "Revision 1 submitted", at: IST("2026-11-12", "09:00:00") }),
  ev({ action: "VERIFICATION_APPROVED", actorId: ADMIN, companyId: COMPANY, verificationReference: "FBM-VER-ABCD1234", reasonCode: "EVIDENCE_OK", at: IST("2026-11-13", "09:00:00"), documentId: "doc-secret" }),
  ev({ action: "INQUIRY_DISTRIBUTION_PAUSED", actorId: ADMIN, inquiryReference: "FBM-INQ-AAAA1111", reason: "Investigating.", at: IST("2026-11-14", "09:00:00") }),
  ev({ action: "INQUIRIES_EXPORTED", actorId: ADMIN, rows: 12, truncated: false, filters: ["q"], at: IST("2026-11-15", "09:00:00") }),
  ev({ action: "CATEGORY_DEACTIVATED", actorId: ADMIN, categoryId: "apparel-fashion", at: IST("2026-11-16", "09:00:00") }),
  ev({ action: "SOME_FUTURE_UNKNOWN_ACTION", actorId: ADMIN, at: IST("2026-11-16", "10:00:00") }), // not in the registry: never listed
  ev({ action: "BUYER_ACCOUNT_SUSPENDED", at: IST("2026-11-17", "09:00:00"), buyerId: BUYER }), // legacy shape: no actor, no reason, no before/after
  ev({ action: "PRODUCT_APPROVED", actorId: ADMIN, productId: new ObjectId(), at: IST("2026-11-18", "09:00:00") }),
  ev({ action: "BUYER_ACCOUNT_SUSPENDED", actorId: ADMIN, buyerId: BUYER, at: IST("2026-10-31", "18:29:59") }), // 23:59:59 IST on 31 Oct: before the range
];
await audit.insertMany(rows);
const mine = (items) => items.filter((i) => rows.some((r) => i.eventKey === `al-${r._id.toHexString()}`));
const snap = async () => JSON.stringify(await audit.find({ _id: { $in: rows.map((r) => r._id) } }).sort({ _id: 1 }).toArray());

await check("global order is newest first, ties broken by id, and unknown actions never appear", async () => {
  const r = await L.listAuditEvents(ALL, q(), now);
  const m = mine(r.items);
  assert.equal(m.length, 10);
  assert.ok(!m.some((i) => i.action === "SOME_FUTURE_UNKNOWN_ACTION"));
  const times = m.map((i) => i.recordedAt);
  assert.deepEqual(times, [...times].sort().reverse());
  const tie = m.filter((i) => i.recordedAt === T0.toISOString()).map((i) => i.eventKey);
  assert.deepEqual(tie, [...tie].sort().reverse());
});
await check("keyset pagination: pages of 3 cover every event once, in order; an event inserted during paging (newer) never duplicates or reorders the pages already read", async () => {
  const seen = []; let cursor = null; let inserted = false;
  do {
    const p = await L.listAuditEvents(ALL, q({ limit: 3, cursor: cursor ? { ms: Number(cursor.split("_")[0]), id: cursor.split("_")[1] } : null }), now);
    seen.push(...p.items.map((i) => i.eventKey)); cursor = p.nextCursor;
    if (!inserted) { inserted = true; await audit.insertOne(ev({ action: "CATEGORY_REACTIVATED", actorId: ADMIN, categoryId: "later", at: IST("2026-11-19", "09:00:00") })); }
  } while (cursor);
  assert.equal(new Set(seen).size, seen.length);
  await audit.deleteMany({ categoryId: "later" });
});
await check("visibility scope: no audit.read means nothing; a domain capability alone means nothing; each domain's events need their own capability, in rows, action options and detail (same null)", async () => {
  assert.equal((await L.listAuditEvents(["verification.audit", "buyers.read"], q(), now)).items.length, 0);
  const v = await L.listAuditEvents(["audit.read", "verification.audit"], q(), now);
  assert.ok(v.items.length === 2 && v.items.every((i) => i.action.startsWith("VERIFICATION_")));
  assert.ok(v.actions.every((a) => a.key.startsWith("VERIFICATION_")));
  const buyerEvent = rows[0];
  assert.equal(await L.getAuditEvent(`al-${buyerEvent._id.toHexString()}`, ["audit.read", "verification.audit"]), null);
  assert.equal(await L.getAuditEvent("al-" + new ObjectId().toHexString(), ALL), null);
  assert.equal(await L.getAuditEvent("nope", ALL), null);
  const unknown = await audit.findOne({ action: "SOME_FUTURE_UNKNOWN_ACTION" });
  assert.equal(await L.getAuditEvent(`al-${unknown._id.toHexString()}`, ALL), null);
});
await check("the detail is allowlisted: no operation key, hash, document id, unknown field or whole snapshot; only status changes; stored markup stays plain text; no outcome and no invented actor name", async () => {
  const d = await L.getAuditEvent(`al-${rows[0]._id.toHexString()}`, ALL);
  const text = JSON.stringify(d);
  for (const bad of ["secret-op-key", "secret-hash", "hugeSnapshot", "leak@x", "must be dropped", "doc-secret"]) assert.ok(!text.includes(bad), bad);
  assert.deepEqual(d.changes, [{ label: "Status", before: "Active", after: "Suspended" }]);
  assert.equal(d.actor.label, "Actor Admin"); assert.equal(d.target.reference, `BUY-${BUYER.toHexString().slice(-8).toUpperCase()}`);
  assert.ok(!/outcome|success/i.test(text));
  const markup = await L.getAuditEvent(`al-${rows[1]._id.toHexString()}`, ALL);
  assert.equal(markup.reason, "<script>alert(1)</script> reviewed"); // returned as data; the UI renders escaped text
  const ver = await L.getAuditEvent(`al-${rows[4]._id.toHexString()}`, ALL);
  assert.ok(!JSON.stringify(ver).includes("doc-secret"));
});
await check("honest labels: a deleted actor and a missing actor are 'Actor unavailable'; a supplier actor is a role label, never a name; a legacy event without reason or changes still opens", async () => {
  const gone = (await L.listAuditEvents(ALL, q({ action: "SUPPLIER_COMPANY_SUSPENDED" }), now)).items[0];
  assert.equal(gone.actor.label, "Actor unavailable");
  const sup = (await L.listAuditEvents(ALL, q({ action: "VERIFICATION_SUBMITTED" }), now)).items[0];
  assert.equal(sup.actor.label, "Supplier account owner"); assert.ok(!JSON.stringify(sup).includes("Supplier Person"));
  const legacy = await L.getAuditEvent(`al-${rows[9]._id.toHexString()}`, ALL);
  assert.equal(legacy.actor.label, "Actor unavailable"); assert.equal(legacy.reason, null); assert.deepEqual(legacy.changes, []);
});
await check("filters and search follow the recorded fields: action, date boundaries in IST (23:59:59 IST on the day before excluded), exact reference, prefix, BUY- code, id and category id; an export has no target", async () => {
  assert.equal(mine((await L.listAuditEvents(ALL, q({ action: "BUYER_ACCOUNT_SUSPENDED" }), now)).items).length, 2);
  assert.ok(!mine((await L.listAuditEvents(ALL, q(), now)).items).some((i) => i.recordedAt === IST("2026-10-31", "23:59:59").toISOString()));
  assert.equal(mine((await L.listAuditEvents(ALL, q({ from: "2026-10-31" }), now)).items).length, 11);
  assert.equal(mine((await L.listAuditEvents(ALL, q({ q: "FBM-INQ-AAAA" }), now)).items).length, 1);
  assert.equal(mine((await L.listAuditEvents(ALL, q({ q: "FBM-VER-ABCD1234" }), now)).items).length, 2);
  assert.equal(mine((await L.listAuditEvents(ALL, q({ q: `BUY-${BUYER.toHexString().slice(-8)}` }), now)).items).length, 4);
  assert.equal(mine((await L.listAuditEvents(ALL, q({ q: BUYER.toHexString() }), now)).items).length, 4);
  assert.equal(mine((await L.listAuditEvents(ALL, q({ q: "apparel-fashion" }), now)).items).length, 1);
  const exp = (await L.listAuditEvents(ALL, q({ action: "INQUIRIES_EXPORTED" }), now)).items[0];
  assert.equal(exp.target.reference, null);
});
await check("links honour the target page's own permission and nothing is resolved against the target", async () => {
  const d = await L.getAuditEvent(`al-${rows[5]._id.toHexString()}`, ALL);
  assert.equal(d.link.href, "/admin/inquiries?review=FBM-INQ-AAAA1111");
  const noLink = await L.getAuditEvent(`al-${rows[5]._id.toHexString()}`, ALL.filter((c) => c !== "inquiries.read"));
  assert.equal(noLink.link, null);
});
await check("the list query uses an index (no collection scan) and reading changes nothing", async () => {
  const plan = await audit.find({ at: { $gte: new Date(0) }, action: { $in: ["BUYER_ACCOUNT_SUSPENDED"] } }).sort({ at: -1, _id: -1 }).limit(21).explain("queryPlanner");
  assert.ok(!JSON.stringify(plan).includes("COLLSCAN"));
  const before = await snap();
  await L.listAuditEvents(ALL, q(), now); await L.getAuditEvent(`al-${rows[0]._id.toHexString()}`, ALL);
  assert.equal(await snap(), before);
});

await audit.deleteMany({ _id: { $in: rows.map((r) => r._id) } });
await t.cleanup(["users"]);
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
