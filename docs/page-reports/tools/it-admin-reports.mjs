// INTEGRATION test (writes to a database): Admin Reports (Page 61): the counting units and date boundaries of every report over fixtures: accounts at IST midnight boundaries, supplier accounts, Direct /
// General / legacy / unknown-source inquiries with matched-delivery fan-out, quotation drafts and revisions, first submission outside the range with a revision inside it, confirmed then cancelled orders,
// zero days, and that the summary equals the daily rows and the source breakdown reconciles to the total. Runs ONLY against an explicitly configured, transaction-capable, isolated test database
// (it-guard.mjs). NOT run in the build environment.
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_reports TEST_DB_CONFIRM=finbyn_it_reports AUTH_SECRET=<any test value> \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-admin-reports.mjs
// NOT covered here (needs sessions and a server): HTTP 401/403 per capability and report, the browser flow, and aggregation performance on representative data (explain / timing).
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
process.env.AUTH_SECRET ??= "integration-test-secret-integration";
const S = await import("../../../src/lib/admin/reportService.ts");
const R = await import("../../../src/lib/admin/reportRules.ts");
const db = t.db;
const now = new Date("2026-11-20T10:00:00.000Z");
const IST = (day, hms) => new Date(`${day}T${hms}+05:30`);
const run = (report, from, to) => S.runReport(report, R.parseRange(from, to, now).range, now);
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
const FROM = "2026-01-05", TO = "2026-01-08"; // 4 IST days
const user = (role, at, over = {}) => t.tag({ _id: new ObjectId(), name: "Fixture", email: `${new ObjectId()}@fixture.invalid`, passwordHash: "x", role, createdAt: at, ...over });

await db.collection("users").insertMany([
  user("buyer", IST("2026-01-04", "23:59:59")),   // the evening before: outside
  user("buyer", IST("2026-01-05", "00:00:00")),   // first instant of FROM: inside
  user("buyer", IST("2026-01-05", "23:59:59")),
  user("buyer", IST("2026-01-07", "10:00:00"), { accountStatus: "SUSPENDED" }), // retained, counted
  user("buyer", IST("2026-01-08", "23:59:59")),   // last instant of TO: inside
  user("buyer", IST("2026-01-09", "00:00:00")),   // first instant after TO: outside
  user("supplier", IST("2026-01-06", "12:00:00")),
  user("supplier", IST("2026-01-06", "13:00:00")),
  user("admin", IST("2026-01-06", "12:00:00")),    // never a buyer or supplier
]);
const inq = (day, hms, sourceType) => t.tag({ _id: new ObjectId(), reference: `FBM-INQ-${new ObjectId().toHexString().slice(-8).toUpperCase()}`, createdAt: IST(day, hms), ...(sourceType === undefined ? {} : { sourceType }) });
const iq = [inq("2026-01-05", "09:00:00", "GENERAL_REQUIREMENT"), inq("2026-01-05", "10:00:00", "DIRECT_INQUIRY"), inq("2026-01-06", "09:00:00"), inq("2026-01-06", "10:00:00", "GENERAL_REQUIREMENT"), inq("2026-01-08", "23:30:00", "SOMETHING_ELSE"), inq("2026-01-09", "00:30:00", "GENERAL_REQUIREMENT")];
await db.collection("inquiries").insertMany(iq);
// fan-out: one general requirement delivered to 5 recipients must still be ONE requirement
await db.collection("inquiry_recipients").insertMany(Array.from({ length: 5 }, () => t.tag({ _id: new ObjectId(), inquiryId: iq[0]._id, createdAt: IST("2026-01-05", "09:05:00") })));
const quote = (ref, version, status, sentAt) => t.tag({ _id: new ObjectId(), reference: ref, version, status, sentAt, createdAt: sentAt, isCurrent: status !== "SUPERSEDED" && status !== "DRAFT", events: [] });
await db.collection("quotations").insertMany([
  quote("FBM-QT-AAAAAAAA", 1, "SENT", IST("2026-01-05", "11:00:00")),                       // counted on 5 Jan
  quote("FBM-QT-BBBBBBBB", 1, "SUPERSEDED", IST("2026-01-02", "11:00:00")),                 // first submission BEFORE the range
  quote("FBM-QT-BBBBBBBB", 2, "SENT", IST("2026-01-06", "11:00:00")),                       // a revision inside the range: not a new quotation
  quote("FBM-QT-CCCCCCCC", 1, "DRAFT", IST("2026-01-06", "09:00:00")),                      // private draft
  quote("FBM-QT-DDDDDDDD", 1, "ACCEPTED", IST("2026-01-07", "09:00:00")),
  quote("FBM-QT-DDDDDDDD", 2, "DRAFT", IST("2026-01-07", "12:00:00")),                      // a revision draft
]);
const order = (day, hms, status) => t.tag({ _id: new ObjectId(), reference: `FBM-ORD-${new ObjectId().toHexString().slice(-8).toUpperCase()}`, placedAt: IST(day, hms), status });
await db.collection("orders").insertMany([order("2026-01-06", "10:00:00", "CONFIRMED"), order("2026-01-06", "11:00:00", "CANCELLED"), order("2026-01-09", "00:00:00", "CONFIRMED")]);

const row = (res, day) => res.rows.find((r) => r.date === day);
await check("buyer registrations: IST boundaries inclusive/exclusive, suspended retained, admin and supplier accounts never counted, every day listed", async () => {
  const r = await run("buyers", FROM, TO);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"]);
  assert.deepEqual(r.rows.map((x) => x.count), [2, 0, 1, 1]);
  assert.equal(r.summary.total, 4);
});
await check("supplier registrations count supplier accounts only", async () => { const r = await run("suppliers", FROM, TO); assert.equal(r.summary.total, 2); assert.equal(row(r, "2026-01-06").count, 2); });
await check("requirements: a general requirement delivered to many suppliers is one; absent source = Direct; an unexpected source is Unclassified; Direct + General + Unclassified = total on every day and overall", async () => {
  const r = await run("requirements", FROM, TO);
  assert.deepEqual([r.summary.direct, r.summary.general, r.summary.unclassified, r.summary.total], [2, 2, 1, 5]);
  for (const x of r.rows) assert.equal(x.direct + x.general + x.unclassified, x.total);
  assert.equal(r.rows.reduce((s, x) => s + x.total, 0), r.summary.total);
  assert.ok(r.warnings.some((w) => /neither Direct nor General/.test(w)));
});
await check("quotations: only first submissions; a revision, a private draft and a revision draft add nothing; a thread first submitted before the range is not counted", async () => {
  const r = await run("quotations", FROM, TO);
  assert.equal(r.summary.total, 2); assert.equal(row(r, "2026-01-05").count, 1); assert.equal(row(r, "2026-01-07").count, 1); assert.equal(row(r, "2026-01-06").count, 0);
});
await check("orders: confirmation events by placed time; a cancelled order still counts as a confirmation; outside the range is excluded", async () => {
  const r = await run("orders", FROM, TO);
  assert.equal(r.summary.total, 2); assert.equal(row(r, "2026-01-06").count, 2);
});
await check("the summary equals the sum of the daily rows for every report, and a one-day range reconciles with the same day of a longer range", async () => {
  for (const rep of ["buyers", "suppliers", "requirements", "quotations", "orders"]) {
    const r = await run(rep, FROM, TO);
    assert.equal(r.rows.reduce((s, x) => s + x.total, 0), r.summary.total);
    const one = await run(rep, "2026-01-06", "2026-01-06");
    assert.equal(one.summary.total, row(r, "2026-01-06").total);
  }
});
await check("a zero-activity range returns every day with zero (a real zero, not missing)", async () => {
  const r = await run("orders", "2026-01-12", "2026-01-14");
  assert.equal(r.rows.length, 3); assert.equal(r.summary.total, 0);
});
await check("a leap day and a month boundary are separate IST days", async () => {
  await db.collection("users").insertMany([user("buyer", IST("2024-02-29", "12:00:00")), user("buyer", IST("2024-03-01", "00:00:00"))]);
  const r = await run("buyers", "2024-02-28", "2024-03-01");
  assert.deepEqual(r.rows.map((x) => [x.date, x.count]), [["2024-02-28", 0], ["2024-02-29", 1], ["2024-03-01", 1]]);
});
await check("the payload holds only counts, labels and dates (no names, e-mail, phone or message)", async () => {
  const text = JSON.stringify(await run("buyers", FROM, TO));
  assert.ok(!/fixture\.invalid|Fixture|passwordHash/.test(text));
});
await check("the report queries use indexes (no collection scan)", async () => {
  const plan = await db.collection("quotations").find({ version: 1, status: { $ne: "DRAFT" }, sentAt: { $gte: new Date(0), $lt: new Date() } }).explain("queryPlanner");
  assert.ok(!JSON.stringify(plan).includes("COLLSCAN"));
});

await t.cleanup(["users", "inquiries", "inquiry_recipients", "quotations", "orders"]);
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
