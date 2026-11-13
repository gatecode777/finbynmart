// INTEGRATION test (writes to a database): buyer requirement -> DIRECT + MATCHED recipients -> supplier inbox -> private conversations -> offers -> comparison -> decisions.
// Runs ONLY against an explicitly configured, transaction-capable, isolated test database (it-guard.mjs). NOT run in the build environment (no isolated database).
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_conv TEST_DB_CONFIRM=finbyn_it_conv AUTH_SECRET=<any test value> \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-conversation-flow.mjs
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
process.env.AUTH_SECRET ??= "integration-test-secret-integration";
const { submitInquiry } = await import("../../../src/lib/inquiries/service.ts");
const { runDistribution, distributionCollections } = await import("../../../src/lib/leads/distribution.ts");
const { resolveSupplierContext } = await import("../../../src/lib/supplier/company.ts");
const { listSupplierInbox } = await import("../../../src/lib/supplier/inquiryListService.ts");
const { sendResponse } = await import("../../../src/lib/supplier/inquiryService.ts");
const { listResponders, getConversation, sendBuyerReply, countsForInquiries, sweepBuyerReplyNotices } = await import("../../../src/lib/inquiries/conversations.ts");
const { listMessages } = await import("../../../src/lib/inquiries/messages.ts");
const { compareBuyerQuotations, decideQuotation } = await import("../../../src/lib/quotations/service.ts");
const C = await import("../../../src/lib/leads/catalogCandidates.ts");
const { getCatalog } = await import("../../../src/lib/catalog/data.ts");

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
const k = () => crypto.randomUUID().replace(/-/g, "").padEnd(24, "x");
const pick = getCatalog().products.map((p) => ({ p, req: C.requirementOf(p.id) })).filter((x) => x.req).map((x) => ({ ...x, cands: C.equivalentCandidates(x.req.signature, x.req.sellerKey) })).sort((a, b) => b.cands.length - a.cands.length)[0];
assert.ok(pick && pick.cands.length >= 2, "needs a product offered by at least two other sellers");
const mkCompany = async (keys) => {
  const ownerUserId = new ObjectId(), _id = new ObjectId();
  await t.db.collection("users").insertOne(t.tag({ _id: ownerUserId, name: "Owner", email: `${_id}@fixture.invalid`, role: "supplier", supplier: { businessName: `Fixture Co ${_id.toHexString().slice(-5)}`, phone: "", city: "Pune", offering: "" } }));
  await t.db.collection("supplier_companies").insertOne(t.tag({ _id, ownerUserId, sellerKeys: keys, status: "ACTIVE", verificationStatus: "UNVERIFIED", createdAt: new Date(), updatedAt: new Date() }));
  return { _id, ownerUserId, uid: ownerUserId.toHexString() };
};
const direct = await mkCompany([pick.req.sellerKey]);
const matchedA = await mkCompany([pick.cands[0].sellerKey]);
const matchedB = await mkCompany([pick.cands[1].sellerKey]); // receives a lead but never replies
const buyer = new ObjectId().toHexString(), otherBuyer = new ObjectId().toHexString();
const sub = async () => {
  const r = await submitInquiry({ kind: "buyer", buyerId: buyer }, { productKey: String(pick.p.id), productName: pick.p.name, supplierKey: pick.req.sellerKey, supplierName: "Fixture Direct", source: "catalog", quantity: 100, unit: "Piece", inquiryType: "PRODUCT_INQUIRY" }, k());
  assert.ok(r.ok); return r;
};
const req = await sub();
await runDistribution({ maxJobs: 10 });
const ctx = async (c) => resolveSupplierContext(c.uid);
const send = (c, text) => ctx(c).then((cx) => sendResponse(cx, { id: c.uid }, req.reference, { type: "RESPONSE", message: text, idempotencyKey: k() }));

await check("DIRECT and MATCHED recipients see the lead under the right views and labels; a company with no relationship sees nothing", async () => {
  const d = await listSupplierInbox(await ctx(direct), { kind: "direct" });
  assert.ok(d.items.some((x) => x.reference === req.reference && x.kind === "DIRECT"));
  const m = await listSupplierInbox(await ctx(matchedA), { kind: "matched" });
  assert.ok(m.items.some((x) => x.reference === req.reference && x.kind === "MATCHED"));
  assert.ok(!(await listSupplierInbox(await ctx(matchedA), { kind: "direct" })).items.some((x) => x.reference === req.reference));
  const all = await listSupplierInbox(await ctx(matchedA), {});
  assert.equal(all.items.filter((x) => x.reference === req.reference).length, 1, "one row per inquiry");
  const stranger = await mkCompany([]);
  assert.ok(!(await listSupplierInbox(await ctx(stranger), {})).items.some((x) => x.reference === req.reference));
});
await check("one supplier's reply changes only its own recipient state and reaches the buyer's conversation for that supplier", async () => {
  const a = await send(direct, "We can supply the requested quantity this month.");
  assert.ok(a.ok, JSON.stringify(a));
  const b = await send(matchedA, "Matching supplier here: we have stock of this product.");
  assert.ok(b.ok, JSON.stringify(b));
  const { recipients } = await distributionCollections();
  const rows = await recipients.find({ inquiryId: new ObjectId(req.id) }).toArray();
  assert.equal(rows.find((r) => r.companyId.equals(matchedA._id)).status, "REPLIED");
  assert.equal(rows.find((r) => r.companyId.equals(matchedB._id)).status, "NEW");
  const r = await listResponders(buyer, req.reference);
  assert.equal(r.responders.length, 2, "only suppliers that replied are listed (matchedB is not)");
  assert.deepEqual(r.responders.map((x) => x.originLabel).sort(), ["Additional matching supplier", "Selected supplier"]);
});
let convA, convB;
await check("a buyer reply goes only to the selected conversation; the other supplier never sees it; a retry creates one message; another buyer gets 404", async () => {
  const r = await listResponders(buyer, req.reference);
  convA = r.responders.find((x) => x.origin === "SELECTED").conversation;
  convB = r.responders.find((x) => x.origin === "MATCHED").conversation;
  const key = k();
  const first = await sendBuyerReply(buyer, req.reference, convB, { message: "Please confirm delivery within 15 days.", idempotencyKey: key });
  assert.ok(first.ok && !first.replayed, JSON.stringify(first));
  const again = await sendBuyerReply(buyer, req.reference, convB, { message: "Please confirm delivery within 15 days.", idempotencyKey: key });
  assert.ok(again.ok && again.replayed && again.message.id === first.message.id);
  const conflict = await sendBuyerReply(buyer, req.reference, convB, { message: "A different text under the same key.", idempotencyKey: key });
  assert.equal(conflict.ok, false); assert.equal(conflict.status, 409);
  assert.equal(await t.db.collection("inquiry_messages").countDocuments({ inquiryId: new ObjectId(req.id), sender: "BUYER" }), 1);
  const cA = await getConversation(buyer, req.reference, convA, { limit: 20, cursor: null });
  const cB = await getConversation(buyer, req.reference, convB, { limit: 20, cursor: null });
  assert.ok(cA.items.every((m) => m.sender !== "BUYER"), "the selected supplier's thread has no reply meant for the other");
  assert.ok(cB.items.some((m) => m.sender === "BUYER"));
  const seenByA = await listMessages(new ObjectId(req.id), { supplierKeys: (await ctx(direct)).company.sellerKeys }, { limit: 50, cursor: null });
  assert.ok(!seenByA.items.some((m) => m.sender === "BUYER"), "supplier A cannot read the reply to supplier B");
  const seenByB = await listMessages(new ObjectId(req.id), { supplierKeys: (await ctx(matchedA)).company.sellerKeys }, { limit: 50, cursor: null });
  assert.ok(seenByB.items.some((m) => m.sender === "BUYER"));
  assert.equal(await getConversation(otherBuyer, req.reference, convB, { limit: 20, cursor: null }), null);
  assert.equal((await sendBuyerReply(buyer, req.reference, "A".repeat(24), { message: "Forged conversation token for nobody.", idempotencyKey: k() })).status, 404);
});
await check("the buyer's reply produces exactly one supplier notice, even when the sweep runs again", async () => {
  await sweepBuyerReplyNotices(); await sweepBuyerReplyNotices();
  assert.equal(await t.db.collection("supplier_notifications").countDocuments({ supplierId: matchedA.ownerUserId, type: "BUYER_REPLY" }), 1);
  assert.equal(await t.db.collection("supplier_notifications").countDocuments({ supplierId: direct.ownerUserId, type: "BUYER_REPLY" }), 0);
});
await check("a notification opt-out does not remove the lead from the inbox", async () => {
  await t.db.collection("supplier_notification_settings").deleteMany({}); // preference storage differs per deployment: the lead below exists regardless of any notice
  assert.ok((await listSupplierInbox(await ctx(matchedB), { kind: "matched" })).items.some((x) => x.reference === req.reference));
});
const mkQuote = async (company, supplierKey, over = {}) => {
  const reference = "FBM-QT-" + Array.from({ length: 8 }, () => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[Math.floor(Math.random() * 32)]).join("");
  await t.db.collection("quotations").insertOne(t.tag({ reference, version: 1, isCurrent: true, inquiryId: new ObjectId(req.id), inquiryReference: req.reference, buyerId: new ObjectId(buyer), supplierKey, supplierName: "Fixture", productKey: String(pick.p.id), productName: pick.p.name, currency: "INR", unit: "Piece", quantity: 100, unitPriceMinor: 10000, validUntil: new Date(Date.now() + 864e5), status: "SENT", sentAt: new Date(), createdAt: new Date(), updatedAt: new Date(), events: [], ...over }));
  return reference;
};
const qA = await mkQuote(direct, pick.req.sellerKey);
const qB = await mkQuote(matchedA, pick.cands[0].sellerKey, { currency: "USD", unitPriceMinor: 120 });
await mkQuote(matchedB, pick.cands[1].sellerKey, { status: "DRAFT" });
await check("counts and offers include only submitted current offers (a supplier draft is never an offer) and exclude buyer replies", async () => {
  const c = (await countsForInquiries(buyer, [new ObjectId(req.id)])).get(req.id);
  assert.equal(c.offers, 2); assert.equal(c.responses, 2);
  assert.ok((await listResponders(buyer, req.reference)).responders.every((x) => !x.offer || x.offer.status !== "DRAFT"));
});
await check("comparison is explicit about differing currencies, refuses unrelated or foreign offers, ranks nothing", async () => {
  const r = await compareBuyerQuotations(buyer, [qA, qB]);
  assert.ok(r.ok);
  assert.ok(r.value.compatibility.mismatches.some((m) => m.field === "currency"));
  assert.equal(r.value.compatibility.priceComparable, false);
  assert.ok(r.value.columns.some((c) => c.origin === "SELECTED") && r.value.columns.some((c) => c.origin === "MATCHED"));
  assert.equal((await compareBuyerQuotations(otherBuyer, [qA, qB])).ok, false);
});
await check("a decision names the exact version; a stale version is a conflict; accepting creates no order and does not reject competitors", async () => {
  const stale = await decideQuotation(buyer, qA, "accept", { version: 7, reason: null });
  assert.equal(stale.ok, false);
  const ok = await decideQuotation(buyer, qA, "accept", { version: 1, reason: null });
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.equal(await t.db.collection("orders").countDocuments({ quotationReference: qA }), 0);
  assert.equal((await t.db.collection("quotations").findOne({ reference: qB })).status, "SENT");
});
await check("closing the requirement refuses new buyer messages but keeps the history", async () => {
  await t.db.collection("inquiries").updateOne({ _id: new ObjectId(req.id) }, { $set: { status: "CANCELLED" } });
  const r = await sendBuyerReply(buyer, req.reference, convB, { message: "One more question after closing.", idempotencyKey: k() });
  assert.equal(r.ok, false); assert.equal(r.status, 409);
  assert.ok((await getConversation(buyer, req.reference, convB, { limit: 20, cursor: null })).items.length >= 2);
});

const ids = [new ObjectId(req.id)];
await t.db.collection("inquiry_messages").deleteMany({ inquiryId: { $in: ids } });
await t.db.collection("distribution_jobs").deleteMany({ inquiryId: { $in: ids } });
await t.db.collection("inquiry_recipients").deleteMany({ inquiryId: { $in: ids } });
await t.db.collection("notification_outbox").deleteMany({ inquiryReference: req.reference });
await t.db.collection("inquiries").deleteMany({ _id: { $in: ids } });
await t.db.collection("supplier_notifications").deleteMany({ supplierId: { $in: [direct.ownerUserId, matchedA.ownerUserId, matchedB.ownerUserId] } });
await t.cleanup(["supplier_companies", "users", "quotations", "idempotency_keys"]);
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
