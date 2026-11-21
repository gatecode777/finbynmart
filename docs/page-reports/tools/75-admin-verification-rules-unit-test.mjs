// Company verification (Page 53): the pure rules: policy validation (no default, nothing invented), applicability, evidence completeness, decision predicates and input checks, the effective
// label (identity change, expiry, never from uploads/e-mail/phone), queue query validation and shaping, capability mapping. No database. The workflow (submission snapshot, exact-evidence
// review, atomic decisions, audit/event once, concurrency, public label, independence from suspension and products) is in it-admin-verification.mjs and is BLOCKED here.
// The policy below is a TEST FIXTURE: it is not the business's policy and is never used outside tests.
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/75-admin-verification-rules-unit-test.mjs
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const R = await import("../../../src/lib/verification/rules.ts");
const P = await import("../../../src/lib/verification/policy.ts");
const I = await import("../../../src/lib/verification/identity.ts");
const C = await import("../../../src/lib/verification/caps.ts");
const S = await import("../../../src/lib/verification/service.ts");
const Perm = await import("../../../src/lib/admin/permissions.ts");

const FIXTURE = {
  version: "test-v1", businessTypes: ["Manufacturer"], requiredDocumentTypes: ["GST_CERTIFICATE", "ADDRESS_PROOF"], optionalDocumentTypes: ["TRADE_LICENSE"],
  checklist: [{ key: "identity_matches", label: "Evidence matches the submitted company identity." }, { key: "evidence_reviewed", label: "Required evidence reviewed." }],
  reasons: { approve: [], requestChanges: [{ code: "UNCLEAR_DOCUMENT", label: "Document unclear", message: "A document could not be read. Upload a clearer copy." }], reject: [{ code: "EVIDENCE_MISMATCH", label: "Evidence does not match", message: "The evidence did not match the company details." }] },
  materialIdentityFields: ["businessName", "businessType"], approvalExpiryMonths: null, resubmitAfterReject: false,
};
const parsed = R.parsePolicy(FIXTURE);
check("a complete policy parses and is cleaned", parsed.ok && parsed.policy.version === "test-v1" && parsed.policy.requiredDocumentTypes.length === 2 && parsed.policy.approvalExpiryMonths === null);
const bad = (o) => R.parsePolicy({ ...FIXTURE, ...o });
check("nothing is invented: no required evidence, no checklist, no reasons, no material identity fields, or no resubmission answer makes the policy invalid", [bad({ requiredDocumentTypes: [] }), bad({ requiredDocumentTypes: undefined }), bad({ checklist: [] }), bad({ reasons: { approve: [], requestChanges: [], reject: [] } }), bad({ materialIdentityFields: [] }), bad({ resubmitAfterReject: undefined }), bad({ version: "" })].every((r) => !r.ok));
check("unknown document types, bad keys and bad reason codes are named in the problems, an invalid expiry is refused, and an omitted expiry means none", !bad({ requiredDocumentTypes: ["PASSPORT"] }).ok && !bad({ checklist: [{ key: "Bad Key", label: "x" }] }).ok && !bad({ reasons: { ...FIXTURE.reasons, reject: [{ code: "lower", label: "x", message: "y" }] } }).ok && !bad({ approvalExpiryMonths: 0 }).ok && !bad({ approvalExpiryMonths: 1.5 }).ok && bad({ approvalExpiryMonths: undefined }).ok && bad({ approvalExpiryMonths: 24 }).policy.approvalExpiryMonths === 24);
check("applicability: a policy for named business types applies only to them; an empty list applies to all", R.policyApplies(parsed.policy, "Manufacturer") && !R.policyApplies(parsed.policy, "Trader") && R.policyApplies({ ...parsed.policy, businessTypes: [] }, "Anything"));
check("missing evidence is exactly the required types not present; optional types never block", JSON.stringify(R.missingEvidence(parsed.policy, ["GST_CERTIFICATE"])) === JSON.stringify(["ADDRESS_PROOF"]) && R.missingEvidence(parsed.policy, ["GST_CERTIFICATE", "ADDRESS_PROOF"]).length === 0 && R.missingEvidence(parsed.policy, ["TRADE_LICENSE"]).length === 2);

// ---- the policy source: configuration, no default
const saved = process.env.VERIFICATION_POLICY;
delete process.env.VERIFICATION_POLICY;
check("with no VERIFICATION_POLICY the status is MISSING with an actionable message and no policy object (no default grants verification)", (() => { const s = P.getPolicy(); return s.state === "MISSING" && /VERIFICATION_POLICY/.test(s.message) && !("policy" in s); })());
process.env.VERIFICATION_POLICY = "{not json";
check("invalid JSON is INVALID, never a fallback", P.getPolicy().state === "INVALID");
process.env.VERIFICATION_POLICY = JSON.stringify({ ...FIXTURE, materialIdentityFields: [] });
check("a policy missing a required decision is INVALID and names it", (() => { const s = P.getPolicy(); return s.state === "INVALID" && s.problems.some((p) => /materialIdentityFields/.test(p)); })());
process.env.VERIFICATION_POLICY = JSON.stringify(FIXTURE);
check("a valid policy is CONFIGURED and re-read on every call (no module cache)", P.getPolicy().state === "CONFIGURED" && (() => { process.env.VERIFICATION_POLICY = JSON.stringify({ ...FIXTURE, version: "test-v2" }); return P.getPolicy().policy.version === "test-v2"; })());
if (saved === undefined) delete process.env.VERIFICATION_POLICY; else process.env.VERIFICATION_POLICY = saved;

// ---- decision predicates and input
const caps = { approve: true, requestChanges: true, reject: true };
check("only a PENDING_REVIEW submission can be decided, each decision with its own capability", ["approve", "request-changes", "reject"].every((a) => R.decisionPlan("PENDING_REVIEW", caps)[a].available) && ["CHANGES_REQUESTED", "APPROVED", "REJECTED", "SUPERSEDED"].every((st) => ["approve", "request-changes", "reject"].every((a) => !R.decisionPlan(st, caps)[a].available)) && !R.decisionPlan("PENDING_REVIEW", { ...caps, approve: false }).approve.permitted && R.decisionPlan("PENDING_REVIEW", { ...caps, approve: false })["request-changes"].available);
const all = { identity_matches: true, evidence_reviewed: true };
check("approval needs every policy criterion confirmed; request-changes and reject do not", !R.checkDecision("approve", parsed.policy, { checklist: { identity_matches: true } }, true).ok && R.checkDecision("approve", parsed.policy, { checklist: all }, true).ok && R.checkDecision("request-changes", parsed.policy, { reasonCode: "UNCLEAR_DOCUMENT" }, true).ok && R.checkDecision("reject", parsed.policy, { reasonCode: "EVIDENCE_MISMATCH" }, true).ok);
check("the reason must be one of the policy's approved reasons for THAT decision; its message is the only supplier-visible text", !R.checkDecision("reject", parsed.policy, { reasonCode: "UNCLEAR_DOCUMENT" }, true).ok && !R.checkDecision("request-changes", parsed.policy, {}, true).ok && R.checkDecision("reject", parsed.policy, { reasonCode: "EVIDENCE_MISMATCH", internalNote: "private" }, true).reason.message === "The evidence did not match the company details." && R.checkDecision("approve", parsed.policy, { checklist: all }, true).ok);
check("a checklist key the policy does not define is refused, an internal note needs its capability and is bounded", !R.checkDecision("approve", parsed.policy, { checklist: { ...all, hacked: true } }, true).ok && !R.checkDecision("reject", parsed.policy, { reasonCode: "EVIDENCE_MISMATCH", internalNote: "x" }, false).ok && !R.checkDecision("reject", parsed.policy, { reasonCode: "EVIDENCE_MISMATCH", internalNote: "x".repeat(501) }, true).ok);
check("a client cannot supply a verification result: only reasonCode, internalNote and checklist are read by the checker", (() => { const r = R.checkDecision("reject", parsed.policy, { reasonCode: "EVIDENCE_MISMATCH", verified: true, status: "APPROVED" }, true); return r.ok && !("verified" in r) && !("status" in r); })());

// ---- the effective label
const approvedAt = new Date("2026-01-01T00:00:00Z");
const ident = { businessName: "Example Textiles Pvt Ltd", displayName: "", businessType: "Manufacturer", country: "India", state: "Rajasthan", city: "Jaipur" };
const approval = { approvedAt, revision: 2, policyVersion: "test-v1", identity: ident, materialFields: ["businessName", "businessType"], expiryMonths: null };
const eff = (o) => R.effectiveVerification({ approval, current: ident, latest: "APPROVED", now: new Date("2026-06-01T00:00:00Z"), ...o });
check("an approval with unchanged material identity gives the public label, worded as a platform review (not government or quality certification)", eff({}).kind === "REVIEWED" && eff({}).publicBadge && /not government or product-quality certification/.test(eff({}).note) && !/verified supplier|certified|government approved/i.test(eff({}).label));
check("a change to a MATERIAL identity field withholds the label without revoking anything; a change to a non-material field does not", (() => { const a = eff({ current: { ...ident, businessName: "Other Name Ltd" } }); const b = eff({ current: { ...ident, city: "Surat" } }); return a.kind === "IDENTITY_CHANGED" && !a.publicBadge && /businessName/.test(a.note) && b.kind === "REVIEWED"; })());
check("expiry applies only when the policy defined one; none is invented", eff({}).publicBadge && !R.effectiveVerification({ approval: { ...approval, expiryMonths: 3 }, current: ident, latest: "APPROVED", now: new Date("2026-06-01T00:00:00Z") }).publicBadge && R.effectiveVerification({ approval: { ...approval, expiryMonths: 24 }, current: ident, latest: "APPROVED", now: new Date("2026-06-01T00:00:00Z") }).publicBadge);
check("without an approval nothing is verified, whatever the latest state: pending, changes requested and rejected are shown as such, and the default is Unverified", [["PENDING_REVIEW", "PENDING"], ["CHANGES_REQUESTED", "CHANGES"], ["REJECTED", "REJECTED"], [null, "NONE"]].every(([st, kind]) => { const e = R.effectiveVerification({ approval: null, current: ident, latest: st }); return e.kind === kind && !e.publicBadge; }) && /Uploading a file, profile completeness and e-mail or phone confirmation are not company verification/.test(R.effectiveVerification({ approval: null, current: ident, latest: null }).note));
check("a rejection or a newer pending submission does not remove an earlier approval (no automatic revocation): the stored approval still decides the label", R.effectiveVerification({ approval, current: ident, latest: "REJECTED" }).kind === "REVIEWED" && R.effectiveVerification({ approval, current: ident, latest: "PENDING_REVIEW" }).publicBadge);
check("the stored approval is read only when the company is VERIFIED and carries the approval; e-mail, phone and profile fields cannot create one", I.approvalOf({ verificationStatus: "UNVERIFIED" }) === null && I.approvalOf({ verificationStatus: "VERIFIED" }) === null && I.approvalOf({ verificationStatus: "VERIFIED", verification: { submissionId: new ObjectId(), reference: "VER-2026-ABC123", revision: 2, policyVersion: "test-v1", approvedAt, approvedBy: new ObjectId(), identity: ident, materialFields: ["businessName"], expiryMonths: null } }).revision === 2 && !I.effectiveOf({ emailVerified: true, phoneVerified: true, verificationStatus: "UNVERIFIED" }, { supplier: { businessName: "X" } }, null).publicBadge);
check("identityOf normalises, bounds and falls back to the owner's city; control characters are removed", (() => { const x = I.identityOf({ businessType: " Manufacturer\u0000 ", country: "India" }, { supplier: { businessName: "  Example\n Ltd ", city: "Jaipur" } }); return x.businessName === "Example Ltd" && x.businessType === "Manufacturer" && x.city === "Jaipur"; })());

// ---- queue query
const q = (o) => R.parseQueueState((k) => o[k]);
check("queue filters are allow-lists: unknown status, malformed or reversed dates, a long search and a bad page are refused", !q({ status: "VERIFIED" }).ok && !q({ start: "2026-13-45" }).ok && !q({ start: "2026-02-01", end: "2026-01-01" }).ok && !q({ q: "x".repeat(61) }).ok && !q({ page: "0" }).ok && !q({ page: "2000" }).ok && q({}).ok && q({ status: "PENDING_REVIEW", start: "2026-01-01", end: "2026-02-01", page: "2" }).ok);
check("queue state round-trips through the URL and only non-defaults are written", (() => { const st = { q: "Example", status: "CHANGES_REQUESTED", start: "2026-01-01", end: "2026-02-01", page: 3 }; return JSON.stringify(q(Object.fromEntries(R.toQueueParams(st))).state) === JSON.stringify(st) && R.toQueueParams(R.EMPTY_QUEUE).toString() === ""; })());
check("the queue matches only LATEST submissions; search is an anchored, escaped prefix of the reference or the submitted company name; dates are UTC day bounds", (() => { const m = S.queueMatch({ q: ".*", status: "all", start: "2026-01-01", end: "2026-01-31" }); return m.latest === true && m.$or[0].reference.$regex === "^\\.\\*" && m.$or[1]["identity.businessName"].$options === "i" && m.submittedAt.$lt.toISOString() === "2026-02-01T00:00:00.000Z" && S.queueMatch({ q: "", status: "REJECTED", start: "", end: "" }).state === "REJECTED" && S.queueMatch({ q: "", status: "all", start: "", end: "" }).$or === undefined; })());
check("an operator payload in the search is literal characters", !/(^|[^\\])\$ne/.test(S.queueMatch({ q: '{"$ne":null}', status: "all", start: "", end: "" }).$or[1]["identity.businessName"].$regex));
check("application references and request keys are validated before any lookup", R.REFERENCE_RE.test("VER-2026-ABC123") && !R.REFERENCE_RE.test("VER-26-abc") && !R.REFERENCE_RE.test("../x") && R.KEY_PATTERN.test(crypto.randomUUID()) && !R.KEY_PATTERN.test("short"));

// ---- capabilities
check("each verification operation has its own capability and none implies another (no revoke capability exists)", ["verification.read", "verification.documents", "verification.notes", "verification.requestChanges", "verification.reject", "verification.approve", "verification.audit"].every((c) => Perm.ADMIN_CAPABILITIES.includes(c)) && !Perm.ADMIN_CAPABILITIES.some((c) => /revoke/.test(c)));
check("capability flags come only from the permission list", (() => { const c = C.verificationCapsOf(["verification.read", "verification.requestChanges"]); return c.requestChanges && !c.approve && !c.reject && !c.documents && !c.notes && !c.audit; })() && Object.values(C.verificationCapsOf([])).every((v) => v === false));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
