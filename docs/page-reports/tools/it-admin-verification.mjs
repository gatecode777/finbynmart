// INTEGRATION test (writes to a database and a private test directory): company verification (Page 53): supplier submission (no policy, missing evidence, idempotent), the immutable
// snapshot bound to the exact evidence, request-changes then resubmission, approval of the exact new revision, rejection, atomic decisions, audit and notice once, private evidence access,
// effective public label (identity change, no automatic revocation), independence from suspension, products and seller ownership, concurrency, stale revision, conflict of interest.
// Runs ONLY against an explicitly configured, transaction-capable, isolated test database (it-guard.mjs) and writes synthetic evidence to a temporary directory. NOT run in the build environment.
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_verify TEST_DB_CONFIRM=finbyn_it_verify AUTH_SECRET=<any test value> \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-admin-verification.mjs
// HTTP-level authorization (401 / 403 per capability, origin checks), the supplier UI and the browser E2E need signed-in sessions and are NOT covered here: see docs/admin/PAGE_53_SUPPLIER_VERIFICATION.md.
// The policy below is a TEST FIXTURE, never the business's policy.
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
process.env.AUTH_SECRET ??= "integration-test-secret-integration";
process.env.BUYER_DOCS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "finbyn-it-docs-"));
const POLICY = { version: "test-v1", businessTypes: [], requiredDocumentTypes: ["GST_CERTIFICATE", "ADDRESS_PROOF"], optionalDocumentTypes: [], checklist: [{ key: "identity_matches", label: "Evidence matches the identity." }, { key: "evidence_reviewed", label: "Evidence reviewed." }], reasons: { approve: [], requestChanges: [{ code: "UNCLEAR", label: "Unclear", message: "A document could not be read. Upload a clearer copy." }], reject: [{ code: "MISMATCH", label: "Mismatch", message: "The evidence did not match the company." }] }, materialIdentityFields: ["businessName"], approvalExpiryMonths: null, resubmitAfterReject: false };
const V = await import("../../../src/lib/verification/service.ts");
const { saveFile } = await import("../../../src/lib/buyer/documentStorage.ts");
const SM = await import("../../../src/lib/admin/supplierManagement.ts");
const { effectiveOf } = await import("../../../src/lib/verification/identity.ts");

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };
const k = () => crypto.randomUUID();
const mkCompany = async (name = "Fixture Verify Textiles") => {
  const ownerUserId = new ObjectId(), _id = new ObjectId();
  await t.db.collection("users").insertOne(t.tag({ _id: ownerUserId, name: "Owner", email: `${_id}@fixture.invalid`, role: "supplier", emailVerified: true, phoneVerified: true, supplier: { businessName: name, phone: "", city: "Jaipur", offering: "" } }));
  await t.db.collection("supplier_companies").insertOne(t.tag({ _id, ownerUserId, sellerKeys: ["fixture-seller-9"], status: "ACTIVE", verificationStatus: "UNVERIFIED", businessType: "Manufacturer", country: "India", createdAt: new Date(), updatedAt: new Date() }));
  return { _id, id: _id.toHexString(), uid: ownerUserId };
};
const pdf = (n) => Buffer.from(`%PDF-1.4\n% synthetic test evidence ${n}\n%%EOF\n`);
const addDoc = async (c, type, tag) => {
  const bytes = pdf(tag);
  const fileReference = await saveFile(bytes, "pdf");
  const _id = new ObjectId();
  await t.db.collection("company_documents").insertOne(t.tag({ _id, companyId: c._id, uploadedBy: c.uid, documentType: type, fileReference, originalFilename: `${type}.pdf`, mimeType: "application/pdf", fileSize: bytes.length, verificationStatus: "PENDING", submittedAt: new Date(), reviewedAt: null, reviewedBy: null, expiryDate: null, rejectionReason: null, active: true, deletedAt: null, createdAt: new Date(), updatedAt: new Date() }));
  return { _id, fileReference };
};
const caps = { approve: true, requestChanges: true, reject: true, documents: true, notes: true, audit: true, supplierPage: true };
const reviewer = new ObjectId(), reviewer2 = new ObjectId();
const submit = (c, key = k()) => V.submitVerification(c.uid.toHexString(), key);
const companyDoc = (c) => t.db.collection("supplier_companies").findOne({ _id: c._id });
const subDoc = (ref) => t.db.collection("verification_submissions").findOne({ reference: ref });
const audit = t.db.collection("admin_audit_log");
const approve = (ref, rev, o = {}) => V.decide("approve", reviewer, ref, { checklist: { identity_matches: true, evidence_reviewed: true }, expectedRev: rev, idempotencyKey: k(), ...o }, caps);

const A = await mkCompany();
await check("with no policy configured a supplier cannot submit and a reviewer cannot approve; nothing is created", async () => {
  delete process.env.VERIFICATION_POLICY;
  const r = await submit(A);
  assert.equal(r.ok, false); assert.equal(r.status, 409); assert.match(r.message, /policy|not open/i);
  assert.equal(await t.db.collection("verification_submissions").countDocuments({ companyId: A._id }), 0);
  assert.equal((await V.getSupplierVerification(A.uid.toHexString())).policy.state, "MISSING");
});
process.env.VERIFICATION_POLICY = JSON.stringify(POLICY);
await check("missing required evidence blocks submission; an upload, e-mail, phone and a complete profile do not verify the company", async () => {
  await addDoc(A, "GST_CERTIFICATE", "gst-1");
  const r = await submit(A);
  assert.equal(r.ok, false); assert.match(r.message, /required evidence/i);
  const c = await companyDoc(A);
  assert.equal(c.verificationStatus, "UNVERIFIED");
  const eff = effectiveOf(c, { supplier: { businessName: "Fixture Verify Textiles" } }, null);
  assert.equal(eff.publicBadge, false);
});
let first;
await check("a submission is a new immutable revision bound to the exact evidence, identity and policy; a retry with the same key answers the same submission", async () => {
  await addDoc(A, "ADDRESS_PROOF", "addr-1");
  const key = k();
  const r = await submit(A, key);
  assert.deepEqual({ ok: r.ok, replay: r.replay }, { ok: true, replay: false });
  first = await subDoc(r.reference);
  assert.equal(first.revision, 1); assert.equal(first.state, "PENDING_REVIEW"); assert.equal(first.evidence.length, 2);
  assert.ok(first.evidence.every((e) => /^[a-f0-9]{64}$/.test(e.sha256) && e.size > 0));
  assert.equal(first.policy.version, "test-v1"); assert.equal(first.identity.businessName, "Fixture Verify Textiles");
  assert.equal((await submit(A, key)).replay, true);
  assert.equal(await t.db.collection("verification_submissions").countDocuments({ companyId: A._id }), 1);
  assert.equal(await t.db.collection("verification_events").countDocuments({ companyId: A._id, kind: "SUBMITTED" }), 1);
  assert.equal((await V.getSupplierVerification(A.uid.toHexString())).blockers[0], "Your evidence is already waiting for review.");
});
await check("the reviewer queue lists the latest submission per company; the detail is the SUBMITTED snapshot, evidence needs its own capability", async () => {
  const q = await V.listSubmissions({ ...(await import("../../../src/lib/verification/rules.ts")).EMPTY_QUEUE });
  assert.ok(q.items.some((x) => x.reference === first.reference && x.state === "PENDING_REVIEW"));
  assert.equal(q.summary.awaiting >= 1, true);
  const d = await V.getSubmission(first.reference, caps);
  assert.equal(d.evidence.length, 2); assert.ok(d.evidence.every((e) => e.available));
  const none = await V.getSubmission(first.reference, { ...caps, documents: false });
  assert.equal(none.evidence, null);
  assert.equal(await V.getSubmission("VER-2026-ZZZZZZ", caps), null);
});
await check("private evidence: only the submission's own documents are served, access is audited, a changed file is not served, a guessed id is the same 404", async () => {
  const e = first.evidence[0];
  const ok = await V.openEvidence(reviewer, first.reference, e.documentId.toHexString());
  assert.equal(ok.ok, true); assert.equal(ok.mime, "application/pdf");
  assert.equal(await audit.countDocuments({ companyId: A._id, action: "VERIFICATION_DOCUMENT_VIEWED" }), 1);
  assert.equal((await V.openEvidence(reviewer, first.reference, new ObjectId().toHexString())).status, 404);
  const B = await mkCompany("Fixture Other Co");
  await addDoc(B, "GST_CERTIFICATE", "b-gst"); await addDoc(B, "ADDRESS_PROOF", "b-addr");
  const bs = await subDoc((await submit(B)).reference);
  assert.equal((await V.openEvidence(reviewer, first.reference, bs.evidence[0].documentId.toHexString())).status, 404, "a document of another submission is not reachable");
  fs.appendFileSync(path.join(process.env.BUYER_DOCS_DIR, e.fileReference), "tamper");
  const tampered = await V.openEvidence(reviewer, first.reference, e.documentId.toHexString());
  assert.equal(tampered.ok, false); assert.equal(tampered.status, 409);
  fs.writeFileSync(path.join(process.env.BUYER_DOCS_DIR, e.fileReference), pdf("gst-1"));
});
await check("a decision needs the exact record revision, a valid reason, a confirmed checklist and a different person than the submitter/owner; invalid or stale input is refused", async () => {
  assert.equal((await approve(first.reference, 99)).status, 409);
  assert.equal((await V.decide("approve", reviewer, first.reference, { checklist: { identity_matches: true }, expectedRev: 0, idempotencyKey: k() }, caps)).status, 422);
  assert.equal((await V.decide("reject", reviewer, first.reference, { reasonCode: "UNCLEAR", expectedRev: 0, idempotencyKey: k() }, caps)).status, 422, "a reason of another decision is refused");
  assert.equal((await V.decide("reject", A.uid, first.reference, { reasonCode: "MISMATCH", expectedRev: 0, idempotencyKey: k() }, caps)).status, 409, "the company's own account cannot decide");
  assert.equal((await subDoc(first.reference)).state, "PENDING_REVIEW");
});
await check("request changes records the supplier-safe reason only, keeps the submission and evidence, never touches verification, and the internal note stays internal", async () => {
  const key = k();
  const r = await V.decide("request-changes", reviewer, first.reference, { reasonCode: "UNCLEAR", internalNote: "Private: scan is blurry.", checklist: {}, expectedRev: 0, idempotencyKey: key }, caps);
  assert.equal(r.ok, true);
  const s = await subDoc(first.reference);
  assert.equal(s.state, "CHANGES_REQUESTED"); assert.equal(s.rev, 1); assert.equal(s.evidence.length, 2);
  assert.equal((await companyDoc(A)).verificationStatus, "UNVERIFIED");
  const view = await V.getSupplierVerification(A.uid.toHexString());
  assert.equal(view.latest.supplierMessage, "A document could not be read. Upload a clearer copy.");
  assert.ok(!JSON.stringify(view).includes("blurry"), "the internal note never reaches the supplier");
  assert.equal(await audit.countDocuments({ companyId: A._id, action: "VERIFICATION_CHANGES_REQUESTED" }), 1);
  assert.equal(await t.db.collection("supplier_notifications").countDocuments({ supplierId: A.uid, dedupeKey: `verification:${first.reference}:CHANGES_REQUESTED` }), 1);
  const again = await V.decide("request-changes", reviewer, first.reference, { reasonCode: "UNCLEAR", internalNote: "Private: scan is blurry.", checklist: {}, expectedRev: 0, idempotencyKey: key }, caps);
  assert.deepEqual({ ok: again.ok, replay: again.replay }, { ok: true, replay: true });
  assert.equal((await V.decide("request-changes", reviewer, first.reference, { reasonCode: "UNCLEAR", internalNote: "Different.", checklist: {}, expectedRev: 0, idempotencyKey: key }, caps)).status, 409);
  assert.equal(await audit.countDocuments({ companyId: A._id, action: "VERIFICATION_CHANGES_REQUESTED" }), 1);
  assert.equal((await approve(first.reference, 1)).status, 409, "a decided submission cannot be decided again");
});
let second;
await check("the supplier replaces evidence and resubmits: a NEW revision; the first and its evidence stay unchanged; the reviewer approves the exact new revision", async () => {
  const old = first.evidence.find((e) => e.type === "GST_CERTIFICATE");
  await t.db.collection("company_documents").updateOne({ _id: old.documentId }, { $set: { active: false } });
  await addDoc(A, "GST_CERTIFICATE", "gst-2");
  const r = await submit(A);
  second = await subDoc(r.reference);
  assert.equal(second.revision, 2); assert.equal((await subDoc(first.reference)).latest, false);
  assert.notEqual(second.evidence.find((e) => e.type === "GST_CERTIFICATE").sha256, old.sha256);
  assert.equal((await subDoc(first.reference)).evidence.find((e) => e.type === "GST_CERTIFICATE").sha256, old.sha256, "the earlier snapshot is immutable");
  assert.equal((await V.decide("approve", reviewer, first.reference, { checklist: { identity_matches: true, evidence_reviewed: true }, expectedRev: 1, idempotencyKey: k() }, caps)).ok, false);
  const c = await approve(second.reference, 0);
  assert.equal(c.ok, true);
  const co = await companyDoc(A);
  assert.equal(co.verificationStatus, "VERIFIED"); assert.equal(co.verification.revision, 2); assert.equal(co.verification.reference, second.reference);
  assert.equal(co.status, "ACTIVE"); assert.deepEqual(co.sellerKeys, ["fixture-seller-9"]);
  assert.equal(await audit.countDocuments({ companyId: A._id, action: "VERIFICATION_APPROVED" }), 1);
  assert.equal(effectiveOf(co, { supplier: { businessName: "Fixture Verify Textiles" } }, "APPROVED").publicBadge, true);
});
await check("a change to a material identity field withholds the label without revoking the approval; the approval stays stored", async () => {
  await t.db.collection("users").updateOne({ _id: A.uid }, { $set: { "supplier.businessName": "Renamed Company Pvt Ltd" } });
  const co = await companyDoc(A);
  assert.equal(co.verificationStatus, "VERIFIED");
  const eff = effectiveOf(co, { supplier: { businessName: "Renamed Company Pvt Ltd" } }, "APPROVED");
  assert.equal(eff.kind, "IDENTITY_CHANGED"); assert.equal(eff.publicBadge, false);
  const detail = await SM.getCompany(A.id, { suspend: false, reactivate: false, links: true, contacts: false, audit: false, products: false, companyLinks: false, review: false });
  assert.notEqual(detail.verification.label, "Reviewed by Finbyn Mart");
  await t.db.collection("users").updateOne({ _id: A.uid }, { $set: { "supplier.businessName": "Fixture Verify Textiles" } });
});
await check("approval is independent of suspension, products and seller ownership: a suspended company stays suspended", async () => {
  const C = await mkCompany("Fixture Suspended Co");
  await addDoc(C, "GST_CERTIFICATE", "c-g"); await addDoc(C, "ADDRESS_PROOF", "c-a");
  await t.db.collection("supplier_companies").updateOne({ _id: C._id }, { $set: { status: "SUSPENDED" } });
  const sub = await subDoc((await V.submitVerification(C.uid.toHexString(), k())).reference);
  assert.equal((await approve(sub.reference, 0)).ok, true);
  const co = await companyDoc(C);
  assert.equal(co.verificationStatus, "VERIFIED"); assert.equal(co.status, "SUSPENDED"); assert.deepEqual(co.sellerKeys, ["fixture-seller-9"]);
});
await check("a rejection is final for that submission, deletes nothing, does not remove an earlier approval, and resubmission follows the policy (refused here)", async () => {
  const D = await mkCompany("Fixture Rejected Co");
  await addDoc(D, "GST_CERTIFICATE", "d-g"); await addDoc(D, "ADDRESS_PROOF", "d-a");
  const sub = await subDoc((await submit(D)).reference);
  const r = await V.decide("reject", reviewer, sub.reference, { reasonCode: "MISMATCH", checklist: {}, expectedRev: 0, idempotencyKey: k() }, caps);
  assert.equal(r.ok, true);
  assert.equal((await subDoc(sub.reference)).state, "REJECTED"); assert.equal(await t.db.collection("company_documents").countDocuments({ companyId: D._id, active: true }), 2);
  assert.equal((await companyDoc(D)).verificationStatus, "UNVERIFIED");
  const again = await submit(D);
  assert.equal(again.ok, false); assert.match(again.message, /does not allow resubmission/);
});
await check("two reviewers deciding the same submission at once produce exactly one decision, one audit row and one notice", async () => {
  const E = await mkCompany("Fixture Race Co");
  await addDoc(E, "GST_CERTIFICATE", "e-g"); await addDoc(E, "ADDRESS_PROOF", "e-a");
  const sub = await subDoc((await submit(E)).reference);
  const [x, y] = await Promise.all([V.decide("approve", reviewer, sub.reference, { checklist: { identity_matches: true, evidence_reviewed: true }, expectedRev: 0, idempotencyKey: k() }, caps), V.decide("reject", reviewer2, sub.reference, { reasonCode: "MISMATCH", checklist: {}, expectedRev: 0, idempotencyKey: k() }, caps)]);
  assert.equal([x, y].filter((r) => r.ok).length, 1);
  assert.equal(await audit.countDocuments({ companyId: E._id, action: { $in: ["VERIFICATION_APPROVED", "VERIFICATION_REJECTED"] } }), 1);
});
await check("evidence that is no longer available exactly as submitted blocks approval and changes nothing", async () => {
  const F = await mkCompany("Fixture Gone Co");
  const g = await addDoc(F, "GST_CERTIFICATE", "f-g"); await addDoc(F, "ADDRESS_PROOF", "f-a");
  const sub = await subDoc((await submit(F)).reference);
  fs.unlinkSync(path.join(process.env.BUYER_DOCS_DIR, g.fileReference));
  const r = await approve(sub.reference, 0);
  assert.equal(r.ok, false); assert.equal(r.status, 409);
  assert.equal((await subDoc(sub.reference)).state, "PENDING_REVIEW"); assert.equal((await companyDoc(F)).verificationStatus, "UNVERIFIED");
});
await check("approval is blocked when the policy is removed; read-only inspection still works", async () => {
  const G = await mkCompany("Fixture Policy Gone Co");
  await addDoc(G, "GST_CERTIFICATE", "g-g"); await addDoc(G, "ADDRESS_PROOF", "g-a");
  const sub = await subDoc((await submit(G)).reference);
  delete process.env.VERIFICATION_POLICY;
  const r = await approve(sub.reference, 0);
  assert.equal(r.ok, false); assert.match(r.message, /VERIFICATION_POLICY|policy/i);
  assert.ok((await V.getSubmission(sub.reference, caps)).approvalBlockers.length > 0);
  process.env.VERIFICATION_POLICY = JSON.stringify(POLICY);
});
await check("the supplier may not destroy evidence a submission relies on: removing the document keeps the stored file", async () => {
  const { deleteSupplierDocument } = await import("../../../src/lib/supplier/profileService.ts");
  const d = first.evidence.find((e) => e.type === "ADDRESS_PROOF");
  const before = fs.existsSync(path.join(process.env.BUYER_DOCS_DIR, d.fileReference));
  await deleteSupplierDocument(A.uid.toHexString(), d.documentId.toHexString());
  assert.equal(before && fs.existsSync(path.join(process.env.BUYER_DOCS_DIR, d.fileReference)), true);
});
await check("the history lists every revision and decision of the company, in order", async () => {
  const h = await V.getHistory(second.reference, true);
  assert.deepEqual(h.submissions.map((x) => x.revision).slice(0, 2), [2, 1]);
  assert.ok(h.events.some((e) => e.label === "Approved") && h.events.some((e) => e.label === "Changes requested"));
});

for (const c of ["admin_audit_log", "verification_events", "verification_submissions", "supplier_notifications", "company_documents"]) await t.db.collection(c).deleteMany({ $or: [{ _fixture: t.runId }, { actorId: { $in: [reviewer, reviewer2] } }, { companyId: { $exists: true }, verificationReference: { $exists: true } }, { verificationReference: { $exists: true } }, { dedupeKey: /^verification:/ }, { reference: /^VER-/ }] });
fs.rmSync(process.env.BUYER_DOCS_DIR, { recursive: true, force: true });
await t.cleanup(["supplier_companies", "users", "company_documents"]);
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
