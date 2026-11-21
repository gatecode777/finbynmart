// INTEGRATION test (writes to a database): Admin Quotation Management (Page 58), READ-ONLY service: one row per current submitted quotation, supplier drafts and revision drafts never visible,
// earlier submitted versions only as history, status filters equal the displayed statuses (incl. expiry boundaries), accepted stays Accepted past its date, historical snapshot never recalculated,
// inconsistent stored totals reported not repaired, General Requirement never labelled "Selected supplier", search is a safe prefix, deterministic pagination, and that reading changes nothing.
// Runs ONLY against an explicitly configured, transaction-capable, isolated test database (it-guard.mjs). NOT run in the build environment.
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_quotations TEST_DB_CONFIRM=finbyn_it_quotations AUTH_SECRET=<any test value> \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-admin-quotations.mjs
// NOT covered here (needs signed-in sessions and a server): HTTP 401/403 per role and capability, the browser flow. See docs/page-designs/PAGE_58_ADMIN_QUOTATIONS.md.
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
process.env.AUTH_SECRET ??= "integration-test-secret-integration";
const M = await import("../../../src/lib/admin/quotationManagement.ts");
const q = t.db.collection("quotations"), inq = t.db.collection("inquiries");
const now = new Date();
const D = 86_400_000;
const at = (ms) => new Date(now.getTime() + ms);
const ref = (c) => `FBM-QT-${c.repeat(8)}`;
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };

const direct = { _id: new ObjectId(), reference: "FBM-INQ-DIRECT01", sourceType: undefined, supplierKey: "SEL1", productName: "Requested Shirt", quantity: 100, unit: "pcs", buyerId: new ObjectId() };
const general = { _id: new ObjectId(), reference: "FBM-INQ-GENERAL1", sourceType: "GENERAL_REQUIREMENT", supplierKey: "", productName: "Requested Fabric", quantity: 50, unit: "m", buyerId: new ObjectId() };
await inq.insertMany([direct, general].map((d) => t.tag(d)));
const base = (over) => t.tag({ _id: new ObjectId(), version: 1, isCurrent: true, inquiryId: direct._id, inquiryReference: direct.reference, buyerId: direct.buyerId, supplierKey: "SEL1", supplierName: "Supplier One", productName: "Offered Shirt", currency: "INR", unit: "pcs", quantity: 100, unitPriceMinor: 20000, validUntil: at(30 * D), status: "SENT", sentAt: now, createdAt: now, updatedAt: now, events: [{ type: "SENT", at: now, actor: "supplier" }], ...over });
const rows = [
  base({ reference: ref("A"), draft: { input: { secret: "private working copy" }, complete: false, savedAt: now }, status: "DRAFT" }),                          // private first draft
  base({ reference: ref("B"), version: 1, isCurrent: false, status: "SUPERSEDED", sentAt: at(-2 * D) }),                                                      // earlier submitted version
  base({ reference: ref("B"), version: 2, isCurrent: true, sentAt: at(-1 * D) }),                                                                              // current submitted version
  base({ reference: ref("B"), version: 3, isCurrent: false, status: "DRAFT", draft: { input: { secret: "newer private revision" }, complete: false, savedAt: now } }), // newer private revision draft
  base({ reference: ref("C"), status: "ACCEPTED", decision: { type: "ACCEPTED", at: at(-5 * D), reason: "buyer private reason" }, accepted: true, validUntil: at(-10 * D), sentAt: at(-20 * D), currency: "USD", unit: "kg" }),
  base({ reference: ref("D"), status: "REJECTED", decision: { type: "REJECTED", at: at(-3 * D), reason: "buyer private reason" }, sentAt: at(-4 * D), inquiryId: general._id, inquiryReference: general.reference, supplierKey: "SEL9", supplierName: "Supplier General" }),
  base({ reference: ref("E"), status: "SENT", validUntil: at(-1), sentAt: at(-6 * D) }),                                                                        // just expired
  base({ reference: ref("F"), status: "SENT", validUntil: at(3 * D), sentAt: at(-7 * D) }),                                                                     // expiring soon
  base({ reference: ref("G"), status: "WITHDRAWN", sentAt: at(-8 * D) }),
  base({ reference: ref("H"), status: "SENT", sentAt: at(-9 * D), snapshot: { policyVersion: "t", taxRule: { id: "r", version: "1", kind: "RATE", label: "GST", bp: 1200 }, input: { secret: "raw input" }, amounts: { subtotal: "1.00", discount: "0.00", taxable: "1.00", tax: "0.12", freight: "0.00", otherCharges: "0.00", total: "999999.99" }, submittedAt: now } }), // snapshot disagrees with stored fields
];
await q.insertMany(rows);
const mineRefs = new Set(rows.map((r) => r.reference));
const list = async (state) => { const r = await M.listAdminQuotations({ q: "", status: "all", page: 1, ...state }, 50, now); return { ...r, items: r.items.filter((i) => mineRefs.has(i.reference)) }; };
const snapshotOfDb = async () => JSON.stringify(await q.find({ reference: { $in: [...mineRefs] } }).sort({ reference: 1, version: 1 }).toArray());

await check("one row per logical quotation: the private draft, the revision draft and the superseded version are never rows; drafts' working copies are never in the payload", async () => {
  const r = await list({});
  const refs = r.items.map((i) => i.reference);
  assert.ok(!refs.includes(ref("A"))); assert.equal(refs.filter((x) => x === ref("B")).length, 1);
  assert.equal(r.items.find((i) => i.reference === ref("B")).version, 2);
  assert.ok(!JSON.stringify(r).includes("private working copy") && !JSON.stringify(r).includes("newer private revision"));
});
await check("detail of a quotation with a newer private revision draft shows the current submitted version only, plus submitted history (never the draft)", async () => {
  const d = await M.getAdminQuotation(ref("B"), { inquiries: true }, now);
  assert.equal(d.version, 2);
  assert.deepEqual(d.versions.map((v) => v.version), [2, 1]);
  assert.ok(!JSON.stringify(d).includes("newer private revision"));
  assert.equal(await M.getAdminQuotation(ref("A"), { inquiries: true }, now), null); // draft-only reference
  assert.equal(await M.getAdminQuotation("nope", { inquiries: true }, now), null);
});
await check("each status filter returns exactly the rows whose badge names it; the filters together cover every row once (incl. the expiry boundary and an accepted quotation past its date)", async () => {
  const all = await list({});
  const seen = [];
  for (const [f, label] of [["active", "Active"], ["expiring", "Expiring Soon"], ["revision", "Revision Requested"], ["accepted", "Accepted"], ["rejected", "Rejected"], ["expired", "Expired"], ["withdrawn", "Withdrawn"]]) {
    const r = await list({ status: f });
    assert.ok(r.items.every((i) => i.statusLabel === label), `${f} shows only ${label}`);
    seen.push(...r.items.map((i) => i.reference));
  }
  assert.equal(seen.length, all.items.length); assert.equal(new Set(seen).size, all.items.length);
  assert.equal(all.items.find((i) => i.reference === ref("C")).statusLabel, "Accepted");
  assert.equal(all.items.find((i) => i.reference === ref("E")).statusLabel, "Expired");
});
await check("amounts keep their own currency and unit; no total is combined across currencies", async () => {
  const r = await list({});
  assert.ok(r.items.find((i) => i.reference === ref("C")).total.includes("$") || /USD/.test(r.items.find((i) => i.reference === ref("C")).total));
  assert.ok(r.items.find((i) => i.reference === ref("B")).total.includes("₹"));
});
await check("General Requirement: never 'Selected supplier'; direct inquiry with the selected supplier is; the requested and offered products are separate", async () => {
  const g = await M.getAdminQuotation(ref("D"), { inquiries: true }, now);
  assert.equal(g.source.kind, "GENERAL"); assert.equal(g.supplier.relation, "Responding supplier");
  const d = await M.getAdminQuotation(ref("B"), { inquiries: true }, now);
  assert.equal(d.supplier.relation, "Selected supplier"); assert.equal(d.requirement.productName, "Requested Shirt"); assert.equal(d.offered.productName, "Offered Shirt");
});
await check("the decision is the type and date only (no buyer reason); an accepted quotation is not shown as an order; links honour permission", async () => {
  const c = await M.getAdminQuotation(ref("C"), { inquiries: false }, now);
  assert.equal(c.decision.type, "ACCEPTED"); assert.ok(!JSON.stringify(c).includes("buyer private reason")); assert.equal(c.links.requirement, null);
  assert.equal((await M.getAdminQuotation(ref("C"), { inquiries: true }, now)).links.requirement, "/admin/inquiries?review=" + direct.reference);
});
await check("an inconsistent stored total is reported as a data note and the stored values are not rewritten", async () => {
  const before = await snapshotOfDb();
  const h = await M.getAdminQuotation(ref("H"), { inquiries: true }, now);
  assert.ok(h.dataQuality.some((x) => /differs/.test(x))); assert.equal(h.snapshot.total, "999999.99");
  assert.ok(!JSON.stringify(h).includes("raw input"));
  assert.equal(await snapshotOfDb(), before);
});
await check("a quotation whose requirement is missing is still readable with an honest note", async () => {
  await q.insertOne(base({ reference: ref("J"), inquiryId: new ObjectId(), inquiryReference: "FBM-INQ-GONE0001" }));
  mineRefs.add(ref("J"));
  const d = await M.getAdminQuotation(ref("J"), { inquiries: true }, now);
  assert.equal(d.requirement.available, false); assert.ok(d.dataQuality.some((x) => /requirement record could not be found/.test(x)));
});
await check("search is an anchored reference prefix on the quotation or requirement reference; operators and regex characters are literals", async () => {
  assert.equal((await list({ q: "fbm-qt-bbbb" })).items.length, 1);
  assert.equal((await list({ q: "FBM-INQ-GENERAL" })).items.length, 1);
  assert.equal((await M.listAdminQuotations({ q: ".*", status: "all", page: 1 }, 50, now)).items.length, 0);
});
await check("pagination is deterministic (newest submission first, id tie-break), with no duplicate across pages and an accurate total", async () => {
  const same = new Date(now.getTime() - 100 * D);
  await q.insertMany(Array.from({ length: 25 }, (_, i) => base({ reference: `FBM-QT-PG${String(i).padStart(6, "0")}`, sentAt: same })));
  const run = async (page) => M.listAdminQuotations({ q: "FBM-QT-PG", status: "all", page }, 10, now);
  const p1 = await run(1), p2 = await run(2), p3 = await run(3);
  const ids = [...p1.items, ...p2.items, ...p3.items].map((i) => i.reference);
  assert.equal(p1.meta.total, 25); assert.equal(new Set(ids).size, 25); assert.equal(ids.length, 25);
  await q.deleteMany({ reference: { $regex: "^FBM-QT-PG" } });
});
await check("the list query uses an index (no collection scan)", async () => {
  const plan = await q.find({ isCurrent: true, status: { $ne: "DRAFT" } }).sort({ sentAt: -1, _id: -1 }).limit(21).explain("queryPlanner");
  assert.ok(!JSON.stringify(plan).includes("COLLSCAN"));
});
await check("listing and opening change nothing (documents are identical before and after)", async () => {
  const before = await snapshotOfDb();
  await list({}); for (const r of ["B", "C", "D"]) await M.getAdminQuotation(ref(r), { inquiries: true }, now);
  assert.equal(await snapshotOfDb(), before);
});

await t.cleanup(["quotations", "inquiries"]);
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
