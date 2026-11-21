import { createHash, randomBytes } from "node:crypto";
import { ObjectId, type ClientSession, type Collection, type Document } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { invalidateApproved } from "@/lib/catalog/approvedProducts";
import { readStored, statStored } from "@/lib/buyer/documentStorage";
import { supplierCompanies, type SupplierCompanyDoc } from "@/lib/supplier/company";
import { notifySupplier } from "@/lib/supplier/notifications";
import { adminAuditLog } from "@/lib/admin/auditLog";
import { recordAdminEvent } from "@/lib/admin/notifications";
import { effectiveOf, identityOf } from "./identity";
import { getPolicy, POLICY_MISSING_MESSAGE } from "./policy";
import {
  DOCUMENT_LABEL, FILTER_STATES, KEY_PATTERN, MAX_PAGE, MAX_PAGE_SIZE, PAGE_SIZE, REFERENCE_RE, STATE_LABEL, STATE_TONE, checkDecision, decisionPlan, identityChanged, missingEvidence, policyApplies,
  type Decision, type DecisionCaps, type DecisionInput, type DecisionState, type DocumentType, type Effective, type IdentitySnapshot, type QueueState, type SubmissionState, type VerificationPolicy,
} from "./rules";

/**
 * Company verification service. REUSES the company (`supplier_companies`) and its uploaded evidence (`company_documents`, private storage); adds only what an exact, immutable review needs:
 *  - `verification_submissions`: one document per SUBMISSION REVISION, binding the company, the submitted identity snapshot, the exact evidence (document id + stored file + SHA-256 + size),
 *    the policy it was submitted under (a copy) and the trusted submitter and time. Later uploads, replacements or profile edits never change a stored submission;
 *  - `verification_events`: the durable intent of each supplier notice and public refresh (recovery by the worker sweep).
 * The only writer of `supplier_companies.verificationStatus` / `.verification` is the approve decision below, inside its transaction. Nothing here touches the company's Active/Suspended
 * status, products, seller ownership, e-mail or phone confirmation.
 */
export interface EvidenceItem { documentId: ObjectId; type: DocumentType; filename: string; mime: string; size: number; sha256: string; fileReference: string; uploadedAt: Date }
export interface SubmissionDecision { action: Decision; at: Date; by: ObjectId; reasonCode: string | null; reasonLabel: string | null; supplierMessage: string | null; internalNote: string | null; checklist: { key: string; checked: boolean }[]; policyVersion: string }
export interface SubmissionDoc {
  _id: ObjectId;
  reference: string;
  companyId: ObjectId;
  revision: number;
  latest: boolean;
  state: SubmissionState;
  /** Record revision: every state change increments it; a decision carries the one the reviewer saw. */
  rev: number;
  policy: VerificationPolicy;
  identity: IdentitySnapshot;
  evidence: EvidenceItem[];
  submittedBy: ObjectId;
  submittedAt: Date;
  idempotencyKey?: string;
  decision?: SubmissionDecision;
}
export interface EventDoc {
  _id: ObjectId;
  dedupeKey: string;
  companyId: ObjectId;
  ownerUserId: ObjectId;
  kind: "SUBMITTED" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
  reference: string;
  /** The supplier-visible reason text from the policy (never an internal note). */
  message: string | null;
  refresh: { state: "PENDING" | "DONE"; attempts: number };
  notice: { state: "PENDING" | "DONE" | "NOT_RECORDED"; attempts: number };
  createdAt: Date;
}

let ready: Promise<unknown> | undefined;
export async function submissions(): Promise<Collection<SubmissionDoc>> {
  const c = (await getDb()).collection<SubmissionDoc>("verification_submissions");
  ready ??= Promise.all([
    c.createIndex({ reference: 1 }, { unique: true, name: "verification_reference" }),
    c.createIndex({ companyId: 1, revision: 1 }, { unique: true, name: "verification_company_revision" }),
    // at most ONE submission awaits review per company (two reviewers or a double submit cannot both be open)
    c.createIndex({ companyId: 1 }, { unique: true, name: "verification_one_pending", partialFilterExpression: { state: "PENDING_REVIEW" } }),
    c.createIndex({ companyId: 1, idempotencyKey: 1 }, { unique: true, name: "verification_submit_idempotency", partialFilterExpression: { idempotencyKey: { $exists: true } } }),
    // the reviewer queue: the latest submission of each company, by state and time
    c.createIndex({ state: 1, submittedAt: -1, _id: -1 }, { name: "verification_queue_state", partialFilterExpression: { latest: true } }),
    c.createIndex({ submittedAt: -1, _id: -1 }, { name: "verification_queue_all", partialFilterExpression: { latest: true } }),
    c.createIndex({ "evidence.documentId": 1 }, { name: "verification_evidence_document" }),
  ]).catch((e) => {
    ready = undefined;
    throw e;
  });
  await ready;
  return c;
}
let evReady: Promise<unknown> | undefined;
export async function verificationEvents(): Promise<Collection<EventDoc>> {
  const c = (await getDb()).collection<EventDoc>("verification_events");
  evReady ??= Promise.all([c.createIndex({ dedupeKey: 1 }, { unique: true, name: "verification_event_dedupe" }), c.createIndex({ "refresh.state": 1, "notice.state": 1, createdAt: 1 }, { name: "verification_event_pending" })]).catch((e) => {
    evReady = undefined;
    throw e;
  });
  await evReady;
  return c;
}

type CompanyDoc = SupplierCompanyDoc & { displayName?: string; businessType?: string; country?: string; state?: string; city?: string };
type Owner = { supplier?: { businessName?: string; city?: string } } | null;
const companies = async () => (await supplierCompanies()) as unknown as Collection<CompanyDoc>;
const ownerOf = async (uid: ObjectId): Promise<Owner> => (await getDb()).collection<{ _id: ObjectId; supplier?: { businessName?: string; city?: string } }>("users").findOne({ _id: uid }, { projection: { "supplier.businessName": 1, "supplier.city": 1 } });
const refOf = () => `VER-${new Date().getUTCFullYear()}-${[...randomBytes(6)].map((b) => "ABCDEFGHJKMNPQRSTVWXYZ0123456789"[b % 32]).join("")}`;
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export type OpResult = { ok: true; replay: boolean; message: string; reference?: string } | { ok: false; status: 404 | 409 | 422; message: string; fields?: Record<string, string> };
const fail = (status: 404 | 409 | 422, message: string, fields?: Record<string, string>): Extract<OpResult, { ok: false }> => ({ ok: false, status, message, ...(fields ? { fields } : {}) });

// ================================================================ supplier side
export interface SupplierVerificationView {
  policy: { state: "CONFIGURED" | "MISSING" | "INVALID"; message: string | null; version: string | null; applies: boolean; businessType: string; required: { type: DocumentType; label: string; uploaded: boolean }[]; optional: { type: DocumentType; label: string; uploaded: boolean }[] };
  latest: { reference: string; revision: number; state: SubmissionState; label: string; submittedAt: string; decidedAt: string | null; reasonLabel: string | null; supplierMessage: string | null } | null;
  effective: Effective;
  canSubmit: boolean;
  blockers: string[];
}

/** What the supplier may see: its own status, the policy's required evidence, safe reasons. Never an internal note, a reviewer, a checklist or another company. */
export async function getSupplierVerification(userId: string): Promise<SupplierVerificationView | null> {
  if (!ObjectId.isValid(userId)) return null;
  const uid = new ObjectId(userId);
  const company = await (await companies()).findOne({ ownerUserId: uid });
  if (!company) return null;
  const [owner, latest, docs] = await Promise.all([
    ownerOf(uid),
    (await submissions()).find({ companyId: company._id, latest: true }).limit(1).next(),
    (await getDb()).collection<{ documentType: DocumentType }>("company_documents").find({ companyId: company._id, active: true }, { projection: { documentType: 1 } }).toArray(),
  ]);
  const present = [...new Set(docs.map((d) => d.documentType))];
  const status = getPolicy();
  const businessType = (company.businessType ?? "").trim();
  const effective = effectiveOf(company as never, owner, latest?.state ?? null);
  const blockers: string[] = [];
  let policyView: SupplierVerificationView["policy"];
  if (status.state !== "CONFIGURED") {
    blockers.push(status.state === "MISSING" ? "Company verification is not open yet: the platform has not configured its verification policy." : "Company verification is unavailable right now.");
    policyView = { state: status.state, message: status.state === "MISSING" ? POLICY_MISSING_MESSAGE.split(".")[0] + "." : "Verification is unavailable.", version: null, applies: false, businessType, required: [], optional: [] };
  } else {
    const p = status.policy;
    const applies = policyApplies(p, businessType);
    policyView = { state: "CONFIGURED", message: null, version: p.version, applies, businessType, required: p.requiredDocumentTypes.map((t) => ({ type: t, label: DOCUMENT_LABEL[t], uploaded: present.includes(t) })), optional: p.optionalDocumentTypes.map((t) => ({ type: t, label: DOCUMENT_LABEL[t], uploaded: present.includes(t) })) };
    if (!applies) blockers.push("The verification policy does not apply to your business type.");
    const missing = missingEvidence(p, present);
    if (applies && missing.length) blockers.push(`Upload the required evidence first: ${missing.map((t) => DOCUMENT_LABEL[t]).join(", ")}.`);
    if (latest?.state === "REJECTED" && !p.resubmitAfterReject) blockers.push("The last submission was not approved and the policy does not allow resubmission.");
    if (latest?.state === "PENDING_REVIEW") {
      const same = JSON.stringify(latest.evidence.map((e) => e.documentId.toHexString()).sort()) === JSON.stringify(docs.length ? (await currentEvidenceIds(company._id, p)) : []);
      if (same && !identityChanged(latest.identity, identityOf(company as never, owner), ["businessName", "displayName", "businessType", "country", "state", "city"]).length) blockers.push("Your evidence is already waiting for review.");
    }
    if (latest?.state === "APPROVED" && effective.kind === "REVIEWED") blockers.push("Your company evidence is already approved and unchanged.");
  }
  return {
    policy: policyView,
    latest: latest ? { reference: latest.reference, revision: latest.revision, state: latest.state, label: STATE_LABEL[latest.state], submittedAt: latest.submittedAt.toISOString(), decidedAt: latest.decision?.at.toISOString() ?? null, reasonLabel: latest.decision?.reasonLabel ?? null, supplierMessage: latest.decision?.supplierMessage ?? null } : null,
    effective,
    canSubmit: blockers.length === 0,
    blockers,
  };
}

async function currentEvidenceIds(companyId: ObjectId, p: VerificationPolicy): Promise<string[]> {
  const wanted = [...p.requiredDocumentTypes, ...p.optionalDocumentTypes];
  const docs = await (await getDb()).collection<{ _id: ObjectId }>("company_documents").find({ companyId, active: true, documentType: { $in: wanted } }, { projection: { _id: 1 } }).toArray();
  return docs.map((d) => d._id.toHexString()).sort();
}

/**
 * Submit the company's current evidence for review. The submission is a NEW revision: it snapshots the identity and the exact evidence (each stored file is read once to record its SHA-256,
 * so a file that cannot be read is refused). A submission still waiting is replaced (SUPERSEDED) in the same transaction. A retry with the same key answers the stored submission.
 */
export async function submitVerification(userId: string, idempotencyKey: unknown): Promise<OpResult> {
  const key = typeof idempotencyKey === "string" && KEY_PATTERN.test(idempotencyKey) ? idempotencyKey : "";
  if (!key) return fail(422, "A request key is required. Reload the page and try again.", { idempotencyKey: "Reload the page and try again." });
  if (!ObjectId.isValid(userId)) return fail(404, "Company not found.");
  const uid = new ObjectId(userId);
  const comps = await companies();
  const company = await comps.findOne({ ownerUserId: uid });
  if (!company) return fail(404, "Company not found.");
  const subs = await submissions();
  const again = await subs.findOne({ companyId: company._id, idempotencyKey: key }, { projection: { reference: 1 } });
  if (again) return { ok: true, replay: true, message: "This submission was already recorded.", reference: again.reference };

  const view = await getSupplierVerification(userId);
  if (!view) return fail(404, "Company not found.");
  if (!view.canSubmit) return fail(409, view.blockers[0] ?? "This company cannot submit right now.");
  const status = getPolicy();
  if (status.state !== "CONFIGURED") return fail(409, POLICY_MISSING_MESSAGE);
  const policy = status.policy;

  const wanted = [...policy.requiredDocumentTypes, ...policy.optionalDocumentTypes];
  const docs = await (await getDb()).collection<{ _id: ObjectId; documentType: DocumentType; fileReference: string; originalFilename: string; mimeType: string; fileSize: number; submittedAt: Date }>("company_documents").find({ companyId: company._id, active: true, documentType: { $in: wanted } }).sort({ documentType: 1, _id: 1 }).toArray();
  const evidence: EvidenceItem[] = [];
  for (const d of docs) {
    const stored = await readStored(d.fileReference);
    if (!stored) return fail(409, `${DOCUMENT_LABEL[d.documentType]} could not be read. Upload it again, then submit.`);
    evidence.push({ documentId: d._id, type: d.documentType, filename: d.originalFilename, mime: stored.mime, size: stored.bytes.length, sha256: sha256(stored.bytes), fileReference: d.fileReference, uploadedAt: d.submittedAt });
  }
  const miss = missingEvidence(policy, evidence.map((e) => e.type));
  if (miss.length) return fail(409, `Upload the required evidence first: ${miss.map((t) => DOCUMENT_LABEL[t]).join(", ")}.`);
  const identity = identityOf(company as never, await ownerOf(uid));

  const events = await verificationEvents();
  const session = (await getMongoClient()).startSession();
  let out: OpResult | undefined;
  let eventId: ObjectId | undefined;
  try {
    await session.withTransaction(
      async () => {
        out = undefined;
        eventId = undefined;
        const prev = await subs.findOne({ companyId: company._id, latest: true }, { session });
        const now = new Date();
        if (prev) await subs.updateOne({ _id: prev._id }, { $set: { latest: false, ...(prev.state === "PENDING_REVIEW" ? { state: "SUPERSEDED" as const } : {}) }, $inc: { rev: 1 } }, { session });
        const doc: SubmissionDoc = { _id: new ObjectId(), reference: refOf(), companyId: company._id, revision: (prev?.revision ?? 0) + 1, latest: true, state: "PENDING_REVIEW", rev: 0, policy, identity, evidence, submittedBy: uid, submittedAt: now, idempotencyKey: key };
        await subs.insertOne(doc, { session });
        eventId = new ObjectId();
        await events.insertOne({ _id: eventId, dedupeKey: `verification:${doc.reference}:SUBMITTED`, companyId: company._id, ownerUserId: uid, kind: "SUBMITTED", reference: doc.reference, message: null, refresh: { state: "DONE", attempts: 0 }, notice: { state: "PENDING", attempts: 0 }, createdAt: now }, { session });
        // the staff alert commits or aborts with the submission itself; the same reference can never alert twice
        await recordAdminEvent(session, { type: "VERIFICATION_SUBMITTED", sourceKey: `verification:${doc.reference}:SUBMITTED`, reference: doc.reference });
        const audit = await adminAuditLog();
        await audit.insertOne({ _id: new ObjectId(), action: "VERIFICATION_SUBMITTED", actorId: uid, companyId: company._id, verificationReference: doc.reference, summary: `Revision ${doc.revision} submitted under policy ${policy.version}`, at: now }, { session });
        out = { ok: true, replay: false, message: "Your company evidence was submitted for review.", reference: doc.reference };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } catch (e) {
    if ((e as { code?: number }).code === 11000) {
      const again2 = await subs.findOne({ companyId: company._id, idempotencyKey: key }, { projection: { reference: 1 } });
      if (again2) return { ok: true, replay: true, message: "This submission was already recorded.", reference: again2.reference };
      return fail(409, "Your submission changed while you were saving. Reload the page and try again.");
    }
    throw e;
  } finally {
    await session.endSession();
  }
  if (out?.ok && eventId) await processEvent(eventId).catch(() => undefined);
  return out ?? fail(409, "Nothing was submitted.");
}

// ================================================================ admin: queue and detail
export interface AdminCaps extends DecisionCaps { documents: boolean; notes: boolean; audit: boolean; supplierPage: boolean }
export interface QueueRow {
  reference: string;
  revision: number;
  company: string;
  companyId: string;
  city: string | null;
  submittedAt: string;
  state: SubmissionState;
  stateLabel: string;
  tone: (typeof STATE_TONE)[SubmissionState];
  evidenceCount: number;
  rev: number;
}
export interface QueueList {
  items: QueueRow[];
  /** Counts: awaiting review = submissions, changes requested and rejected = companies whose LATEST submission is in that state, approved = companies with a stored approval. A revision is never counted as another company. */
  summary: { awaiting: number; changesRequested: number; approvedCompanies: number; rejected: number };
  meta: { page: number; limit: number; total: number; totalPages: number };
  policy: { state: "CONFIGURED" | "MISSING" | "INVALID"; message: string | null; version: string | null };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dayStart = (d: string) => new Date(`${d}T00:00:00.000Z`);
export function queueMatch(s: Pick<QueueState, "q" | "status" | "start" | "end">): Document {
  const m: Document = { latest: true };
  if (s.status !== "all") m.state = s.status;
  if (s.start || s.end) m.submittedAt = { ...(s.start ? { $gte: dayStart(s.start) } : {}), ...(s.end ? { $lt: new Date(dayStart(s.end).getTime() + 86_400_000) } : {}) };
  const term = s.q.trim();
  if (term) {
    // an application reference prefix (unique index) or an anchored, escaped, case-insensitive prefix of the SUBMITTED company name (a scan of the latest submissions, bounded by the filters)
    m.$or = [{ reference: { $regex: `^${escapeRe(term.toUpperCase())}` } }, { "identity.businessName": { $regex: `^${escapeRe(term)}`, $options: "i" } }];
  }
  return m;
}

export async function listSubmissions(s: QueueState, limit = PAGE_SIZE): Promise<QueueList> {
  const c = await submissions();
  const page = Math.max(1, Math.min(MAX_PAGE, s.page));
  const lim = Math.min(MAX_PAGE_SIZE, Math.max(1, limit));
  const match = queueMatch(s);
  const [docs, total, grouped, approved] = await Promise.all([
    c.find(match, { projection: { reference: 1, revision: 1, companyId: 1, state: 1, submittedAt: 1, rev: 1, "identity.businessName": 1, "identity.city": 1, evidence: { $slice: 1 } } as never }).sort({ submittedAt: -1, _id: -1 }).skip((page - 1) * lim).limit(lim).toArray(),
    c.countDocuments(match),
    c.aggregate<{ _id: SubmissionState; n: number }>([{ $match: { latest: true } }, { $group: { _id: "$state", n: { $sum: 1 } } }]).toArray(),
    (await companies()).countDocuments({ verificationStatus: "VERIFIED" }),
  ]);
  const n = (st: SubmissionState) => grouped.find((g) => g._id === st)?.n ?? 0;
  // evidence count needs the array length: a second tiny aggregate over just this page keeps the list projection light
  const counts = docs.length ? await c.aggregate<{ _id: ObjectId; n: number }>([{ $match: { _id: { $in: docs.map((d) => d._id) } } }, { $project: { n: { $size: "$evidence" } } }]).toArray() : [];
  const cnt = new Map(counts.map((x) => [x._id.toHexString(), x.n]));
  const status = getPolicy();
  return {
    items: docs.map((d) => ({ reference: d.reference, revision: d.revision, company: d.identity?.businessName || "Company name not provided", companyId: d.companyId.toHexString(), city: d.identity?.city || null, submittedAt: d.submittedAt.toISOString(), state: d.state, stateLabel: STATE_LABEL[d.state], tone: STATE_TONE[d.state], evidenceCount: cnt.get(d._id.toHexString()) ?? 0, rev: d.rev })),
    summary: { awaiting: n("PENDING_REVIEW"), changesRequested: n("CHANGES_REQUESTED"), approvedCompanies: approved, rejected: n("REJECTED") },
    meta: { page, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim)) },
    policy: status.state === "CONFIGURED" ? { state: "CONFIGURED", message: null, version: status.policy.version } : { state: status.state, message: status.message, version: null },
  };
}

export interface SubmissionDetail {
  reference: string;
  revision: number;
  rev: number;
  state: SubmissionState;
  stateLabel: string;
  tone: (typeof STATE_TONE)[SubmissionState];
  submittedAt: string;
  company: { id: string; operationalStatus: "Active" | "Suspended"; effective: Effective };
  /** The SUBMITTED identity (the exact revision reviewed). */
  identity: IdentitySnapshot;
  /** Fields of the CURRENT profile that differ from the submitted identity (never silently merged). */
  changedSince: { field: string; submitted: string; current: string }[];
  policy: { version: string; applies: boolean; required: { type: DocumentType; label: string }[]; optional: { type: DocumentType; label: string }[]; checklist: { key: string; label: string }[]; reasons: { approve: { code: string; label: string }[]; requestChanges: { code: string; label: string }[]; reject: { code: string; label: string }[] } };
  /** null = the viewer may not read private evidence (not the same as none). */
  evidence: { documentId: string; type: DocumentType; label: string; filename: string; mime: string; size: number; uploadedAt: string; available: boolean | null }[] | null;
  decision: { action: Decision; at: string; reasonLabel: string | null; supplierMessage: string | null; checklist: { key: string; checked: boolean }[]; policyVersion: string; internalNote: string | null } | null;
  actions: Record<Decision, DecisionState>;
  /** Why approval is blocked right now (empty = none). */
  approvalBlockers: string[];
  capabilities: { documents: boolean; notes: boolean; audit: boolean; supplierPage: boolean };
}

export async function getSubmission(reference: string, caps: AdminCaps): Promise<SubmissionDetail | null> {
  if (!REFERENCE_RE.test(reference)) return null;
  const sub = await (await submissions()).findOne({ reference });
  if (!sub) return null;
  const company = await (await companies()).findOne({ _id: sub.companyId });
  const owner = company ? await ownerOf(company.ownerUserId) : null;
  const current = company ? identityOf(company as never, owner) : null;
  const changedSince = current ? (Object.keys(sub.identity) as (keyof IdentitySnapshot)[]).filter((f) => (sub.identity[f] ?? "").trim() !== (current[f] ?? "").trim()).map((f) => ({ field: f, submitted: sub.identity[f] ?? "", current: current[f] ?? "" })) : [];
  const evidence = caps.documents ? await Promise.all(sub.evidence.map(async (e) => ({ documentId: e.documentId.toHexString(), type: e.type, label: DOCUMENT_LABEL[e.type], filename: e.filename, mime: e.mime, size: e.size, uploadedAt: e.uploadedAt.toISOString(), available: (await statStored(e.fileReference)) === e.size }))) : null;
  const plan = decisionPlan(sub.state, caps);
  const blockers = await approvalBlockers(sub, company);
  if (blockers.length && plan.approve.available) plan.approve = { ...plan.approve, available: false, reason: blockers[0] };
  const d = sub.decision;
  const noteVisible = caps.notes || caps.audit;
  return {
    reference: sub.reference,
    revision: sub.revision,
    rev: sub.rev,
    state: sub.state,
    stateLabel: STATE_LABEL[sub.state],
    tone: STATE_TONE[sub.state],
    submittedAt: sub.submittedAt.toISOString(),
    company: { id: sub.companyId.toHexString(), operationalStatus: company?.status === "SUSPENDED" ? "Suspended" : "Active", effective: company ? effectiveOf(company as never, owner, sub.latest ? sub.state : null) : effectiveOf({} as never, null, null) },
    identity: sub.identity,
    changedSince,
    policy: {
      version: sub.policy.version,
      applies: policyApplies(sub.policy, sub.identity.businessType),
      required: sub.policy.requiredDocumentTypes.map((t) => ({ type: t, label: DOCUMENT_LABEL[t] })),
      optional: sub.policy.optionalDocumentTypes.map((t) => ({ type: t, label: DOCUMENT_LABEL[t] })),
      checklist: sub.policy.checklist,
      reasons: { approve: sub.policy.reasons.approve.map(({ code, label }) => ({ code, label })), requestChanges: sub.policy.reasons.requestChanges.map(({ code, label }) => ({ code, label })), reject: sub.policy.reasons.reject.map(({ code, label }) => ({ code, label })) },
    },
    evidence,
    decision: d ? { action: d.action, at: d.at.toISOString(), reasonLabel: d.reasonLabel, supplierMessage: d.supplierMessage, checklist: d.checklist, policyVersion: d.policyVersion, internalNote: noteVisible ? d.internalNote : null } : null,
    actions: plan,
    approvalBlockers: blockers,
    capabilities: { documents: caps.documents, notes: caps.notes, audit: caps.audit, supplierPage: caps.supplierPage },
  };
}

/** Conditions that block APPROVAL (read-only inspection stays possible): the policy must be configured, the evidence of the submission complete, the company present. Re-checked at commit. */
async function approvalBlockers(sub: SubmissionDoc, company: CompanyDoc | null): Promise<string[]> {
  const out: string[] = [];
  if (getPolicy().state !== "CONFIGURED") out.push(POLICY_MISSING_MESSAGE);
  if (!company) out.push("The company record no longer exists.");
  const miss = missingEvidence(sub.policy, sub.evidence.map((e) => e.type));
  if (miss.length) out.push(`The submission lacks required evidence: ${miss.map((t) => DOCUMENT_LABEL[t]).join(", ")}.`);
  if (!policyApplies(sub.policy, sub.identity.businessType)) out.push("The policy does not apply to the submitted business type.");
  return out;
}

export async function getHistory(reference: string, includeAudit: boolean): Promise<{ submissions: { reference: string; revision: number; state: SubmissionState; stateLabel: string; submittedAt: string; decidedAt: string | null; decision: string | null; reasonLabel: string | null }[]; events: { label: string; at: string; detail: string | null }[] } | null> {
  if (!REFERENCE_RE.test(reference)) return null;
  const c = await submissions();
  const sub = await c.findOne({ reference }, { projection: { companyId: 1 } });
  if (!sub) return null;
  const all = await c.find({ companyId: sub.companyId }, { projection: { reference: 1, revision: 1, state: 1, submittedAt: 1, decision: 1 } }).sort({ revision: -1 }).limit(50).toArray();
  const LABEL: Record<string, string> = { VERIFICATION_SUBMITTED: "Submitted for review", VERIFICATION_APPROVED: "Approved", VERIFICATION_CHANGES_REQUESTED: "Changes requested", VERIFICATION_REJECTED: "Rejected", VERIFICATION_DOCUMENT_VIEWED: "Evidence document opened" };
  const events = includeAudit ? (await (await adminAuditLog()).find({ companyId: sub.companyId, action: { $in: Object.keys(LABEL) } }, { projection: { action: 1, at: 1, summary: 1 } }).sort({ at: -1, _id: -1 }).limit(100).toArray()).map((e) => ({ label: LABEL[String(e.action)] ?? String(e.action), at: (e.at as Date).toISOString(), detail: typeof e.summary === "string" ? e.summary : null })) : [];
  return { submissions: all.map((s) => ({ reference: s.reference, revision: s.revision, state: s.state, stateLabel: STATE_LABEL[s.state], submittedAt: s.submittedAt.toISOString(), decidedAt: s.decision?.at.toISOString() ?? null, decision: s.decision ? s.decision.action : null, reasonLabel: s.decision?.reasonLabel ?? null })), events };
}

// ================================================================ admin: private evidence
/**
 * One evidence file of one submission, for an authorized reviewer. The document must belong to THAT submission (a guessed id fails the same way as a missing one), the stored bytes must
 * still match the SHA-256 recorded at submission, and the access is audited (actor, submission, document id: never the content) BEFORE any byte is returned: if the audit row cannot be
 * written the file is not served. Nothing is cached or public; each request is authorized again. Bounded exposure: the bytes are streamed through the server, so no link outlives the request.
 */
export async function openEvidence(adminId: ObjectId, reference: string, documentId: string): Promise<{ ok: true; bytes: Buffer; mime: string; filename: string } | { ok: false; status: 404 | 409; message: string }> {
  if (!REFERENCE_RE.test(reference) || !ObjectId.isValid(documentId)) return { ok: false, status: 404, message: "Document not found." };
  const sub = await (await submissions()).findOne({ reference });
  const e = sub?.evidence.find((x) => x.documentId.equals(new ObjectId(documentId)));
  if (!sub || !e) return { ok: false, status: 404, message: "Document not found." };
  const stored = await readStored(e.fileReference);
  if (!stored) return { ok: false, status: 409, message: "This document is not available." };
  if (sha256(stored.bytes) !== e.sha256) return { ok: false, status: 409, message: "This document no longer matches what was submitted, so it is not served." };
  await (await adminAuditLog()).insertOne({ _id: new ObjectId(), action: "VERIFICATION_DOCUMENT_VIEWED", actorId: adminId, companyId: sub.companyId, verificationReference: reference, documentId: e.documentId, summary: `${DOCUMENT_LABEL[e.type]} opened`, at: new Date() });
  return { ok: true, bytes: stored.bytes, mime: stored.mime, filename: e.filename };
}

// ================================================================ admin: decisions
export interface DecideInput extends DecisionInput { expectedRev: unknown; idempotencyKey: unknown }
const ACTION_AUDIT: Record<Decision, string> = { approve: "VERIFICATION_APPROVED", "request-changes": "VERIFICATION_CHANGES_REQUESTED", reject: "VERIFICATION_REJECTED" };
const EVENT_KIND: Record<Decision, EventDoc["kind"]> = { approve: "APPROVED", "request-changes": "CHANGES_REQUESTED", reject: "REJECTED" };

/**
 * Record ONE decision for the exact submission revision a reviewer saw. One snapshot transaction: the conditional submission update (state PENDING_REVIEW and the record revision), for an
 * approval the company's stored approval, the audit row (unique operation key + request hash) and the notice event commit together or not at all. The browser never sets a verification
 * result: the checklist it sends is the reviewer's own confirmation, validated against the policy the submission was made under. Approval re-reads every evidence file (present, same size,
 * same SHA-256) immediately before committing. An approval never touches the company's Active/Suspended status, products, seller ownership or any restriction; a request-changes or rejection
 * never clears or alters an earlier approval and never deletes anything.
 */
export async function decide(action: Decision, adminId: ObjectId, reference: string, input: DecideInput, caps: AdminCaps): Promise<OpResult> {
  if (!REFERENCE_RE.test(reference)) return fail(404, "Application not found.");
  const fields: Record<string, string> = {};
  const rev = input.expectedRev;
  if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 0) fields.expectedRev = "Reload the application and try again.";
  const key = typeof input.idempotencyKey === "string" && KEY_PATTERN.test(input.idempotencyKey) ? input.idempotencyKey : "";
  if (!key) fields.idempotencyKey = "A request key is required. Reload the page and try again.";
  const c = await submissions();
  const first = await c.findOne({ reference });
  if (!first) return fail(404, "Application not found.");
  const checked = checkDecision(action, first.policy, input, caps.notes);
  if (!checked.ok) Object.assign(fields, checked.fields);
  if (Object.keys(fields).length || !checked.ok) return fail(422, "Please fix the highlighted fields.", fields);

  const operationKey = `${adminId.toHexString()}:${ACTION_AUDIT[action]}:${key}`;
  const bodyHash = createHash("sha256").update(JSON.stringify([reference, action, rev, checked.reasonCode, checked.note, checked.checklist])).digest("hex");
  const audit = await adminAuditLog();
  const replay = async (): Promise<OpResult | null> => {
    const prev = await audit.findOne({ operationKey }, { projection: { bodyHash: 1 } });
    if (!prev) return null;
    return prev.bodyHash === bodyHash ? { ok: true, replay: true, message: "This decision was already recorded.", reference } : fail(409, "This request key was already used for a different decision. Reload and try again.");
  };
  const again = await replay();
  if (again) return again;

  const comps = await companies();
  const company = await comps.findOne({ _id: first.companyId });
  if (action === "approve") {
    const blockers = await approvalBlockers(first, company);
    if (blockers.length) return fail(409, blockers[0]);
    // the evidence must still be exactly what was submitted (processing / availability): re-read now, before the transaction
    for (const e of first.evidence) {
      const s = await readStored(e.fileReference);
      if (!s || s.bytes.length !== e.size || sha256(s.bytes) !== e.sha256) return fail(409, `${DOCUMENT_LABEL[e.type]} is no longer available exactly as submitted, so the application cannot be approved.`);
    }
  }
  // conflict of interest, enforced on the server: a reviewer never decides a submission they made or a company they own
  if (first.submittedBy.equals(adminId) || company?.ownerUserId.equals(adminId)) return fail(409, "You cannot decide an application for a company you are associated with.");

  const events = await verificationEvents();
  const session = (await getMongoClient()).startSession();
  let out: OpResult | undefined;
  let eventId: ObjectId | undefined;
  try {
    await session.withTransaction(
      async () => {
        out = undefined;
        eventId = undefined;
        const cur = await c.findOne({ reference }, { session });
        if (!cur) { out = fail(404, "Application not found."); return; }
        const plan = decisionPlan(cur.state, { approve: true, requestChanges: true, reject: true })[action];
        if (!plan.available) { out = fail(409, plan.reason ?? "This application is not awaiting a decision."); return; }
        if (cur.rev !== rev) { out = fail(409, "The application changed after you opened it. Reload and review the current submission."); return; }
        const now = new Date();
        const decision: SubmissionDecision = { action, at: now, by: adminId, reasonCode: checked.reasonCode, reasonLabel: checked.reason?.label ?? null, supplierMessage: checked.reason?.message ?? null, internalNote: checked.note || null, checklist: checked.checklist, policyVersion: cur.policy.version };
        const upd = await c.updateOne({ _id: cur._id, state: "PENDING_REVIEW", rev: cur.rev }, { $set: { state: ({ approve: "APPROVED", "request-changes": "CHANGES_REQUESTED", reject: "REJECTED" } as const)[action], decision }, $inc: { rev: 1 } }, { session });
        if (upd.matchedCount !== 1) { out = fail(409, "The application changed while you were saving. Reload and try again."); return; }
        if (action === "approve") {
          // the ONLY place a company becomes VERIFIED: bound to this exact submission, the policy it was made under and the identity it was reviewed against
          const r = await comps.updateOne({ _id: cur.companyId }, { $set: { verificationStatus: "VERIFIED", verification: { submissionId: cur._id, reference: cur.reference, revision: cur.revision, policyVersion: cur.policy.version, approvedAt: now, approvedBy: adminId, identity: cur.identity as unknown as Record<string, string>, materialFields: cur.policy.materialIdentityFields, expiryMonths: cur.policy.approvalExpiryMonths }, updatedAt: now } }, { session });
          if (r.matchedCount !== 1) { out = fail(409, "The company record no longer exists."); throw new Rollback(); }
        }
        await audit.insertOne({ _id: new ObjectId(), action: ACTION_AUDIT[action], actorId: adminId, companyId: cur.companyId, verificationReference: cur.reference, revision: cur.revision, policyVersion: cur.policy.version, reasonCode: checked.reasonCode, operationKey, bodyHash, before: { state: cur.state, rev: cur.rev }, after: { state: DECISION_STATE_OF[action], rev: cur.rev + 1 }, summary: `Revision ${cur.revision}: ${STATE_LABEL[DECISION_STATE_OF[action]]}`, at: now }, { session });
        eventId = new ObjectId();
        await events.insertOne({ _id: eventId, dedupeKey: `verification:${cur.reference}:${EVENT_KIND[action]}`, companyId: cur.companyId, ownerUserId: company!.ownerUserId, kind: EVENT_KIND[action], reference: cur.reference, message: checked.reason?.message ?? null, refresh: { state: action === "approve" ? "PENDING" : "DONE", attempts: 0 }, notice: { state: "PENDING", attempts: 0 }, createdAt: now }, { session });
        out = { ok: true, replay: false, message: action === "approve" ? "The application was approved for this revision." : action === "reject" ? "The application was rejected." : "Changes were requested from the supplier.", reference: cur.reference };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } catch (e) {
    if (e instanceof Rollback) return out ?? fail(409, "Nothing was changed.");
    if ((e as { code?: number }).code === 11000) {
      const r = await replay();
      if (r) return r;
    }
    throw e;
  } finally {
    await session.endSession();
  }
  const result = out ?? fail(409, "Nothing was changed.");
  if (result.ok && eventId) await processEvent(eventId).catch(() => undefined);
  return result;
}
class Rollback extends Error {}
const DECISION_STATE_OF: Record<Decision, SubmissionState> = { approve: "APPROVED", "request-changes": "CHANGES_REQUESTED", reject: "REJECTED" };

// ================================================================ events (after the commit)
const NOTICE: Record<EventDoc["kind"], (e: EventDoc) => { title: string; body: string }> = {
  SUBMITTED: (e) => ({ title: "Company evidence submitted", body: `Your company evidence was submitted for review (${e.reference}). You will see the outcome on the Verification tab.` }),
  APPROVED: (e) => ({ title: "Company evidence approved", body: `Your company evidence (${e.reference}) was approved after review by Finbyn Mart. This is a platform review of the evidence you submitted.` }),
  CHANGES_REQUESTED: (e) => ({ title: "Changes requested on your company evidence", body: `Changes were requested on ${e.reference}. ${e.message ?? ""} Correct the evidence and submit again from the Verification tab.`.trim() }),
  REJECTED: (e) => ({ title: "Company evidence not approved", body: `Your company evidence (${e.reference}) was not approved. ${e.message ?? ""}`.trim() }),
};

/** The steps after the commit, driven from the stored event so a failure is recoverable and never repeats a decision: refresh the public snapshot (approval), record one in-app notice. */
export async function processEvent(id: ObjectId): Promise<void> {
  const events = await verificationEvents();
  const ev = await events.findOne({ _id: id });
  if (!ev) return;
  if (ev.refresh.state === "PENDING") {
    const ok = await invalidateApproved().then(() => true, () => false);
    await events.updateOne({ _id: id }, ok ? { $set: { "refresh.state": "DONE" }, $inc: { "refresh.attempts": 1 } } : { $inc: { "refresh.attempts": 1 } });
  }
  if (ev.notice.state === "PENDING") {
    let state: EventDoc["notice"]["state"] = "PENDING";
    try {
      const n = NOTICE[ev.kind](ev);
      await notifySupplier(ev.ownerUserId.toHexString(), { category: "account", type: `VERIFICATION_${ev.kind}`, title: n.title, body: n.body, link: "/supplier/company?tab=verification", dedupeKey: ev.dedupeKey });
      state = (await (await getDb()).collection("supplier_notifications").findOne({ supplierId: ev.ownerUserId, dedupeKey: ev.dedupeKey }, { projection: { _id: 1 } })) ? "DONE" : "NOT_RECORDED";
    } catch {
      state = ev.notice.attempts + 1 >= 3 ? "NOT_RECORDED" : "PENDING";
    }
    await events.updateOne({ _id: id }, { $set: { "notice.state": state }, $inc: { "notice.attempts": 1 } });
  }
}

export async function sweepVerificationEvents(limit = 25): Promise<number> {
  const events = await verificationEvents();
  const pending = await events.find({ $or: [{ "refresh.state": "PENDING" }, { "notice.state": "PENDING" }] }, { projection: { _id: 1 } }).sort({ createdAt: 1 }).limit(limit).toArray();
  for (const e of pending) await processEvent(e._id).catch(() => undefined);
  return pending.length;
}

export { FILTER_STATES };
export type { ClientSession };
