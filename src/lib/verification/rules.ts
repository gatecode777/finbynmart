/**
 * Company verification (business-evidence review by Finbyn Mart): the PURE rules (no server imports; the browser, the API and the node unit tests share them).
 *
 * What this review is: a platform review of business evidence a supplier submitted for its COMPANY, against an explicit, versioned policy the business configures.
 * What it is not: government or registry verification, product-quality certification, e-mail or phone confirmation, profile completeness, the Active/Suspended status,
 * product moderation, seller ownership or anything about payments. None of those feeds into or out of this review.
 *
 * Nothing here invents a statutory requirement: required evidence, checklist criteria, decision reasons, material identity fields and the optional expiry all come from the
 * policy. A policy that is missing or invalid blocks submission and approval (an actionable message names what is missing); it never falls back to a default that grants verification.
 */
export const IDENTITY_FIELDS = ["businessName", "displayName", "businessType", "country", "state", "city"] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];
export type IdentitySnapshot = Record<IdentityField, string>;

export const DOCUMENT_TYPES = ["GST_CERTIFICATE", "PAN_DOCUMENT", "INCORPORATION_CERTIFICATE", "MSME_UDYAM", "TRADE_LICENSE", "FACTORY_LICENSE", "ADDRESS_PROOF", "OTHER"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const DOCUMENT_LABEL: Record<DocumentType, string> = {
  GST_CERTIFICATE: "GST Registration Certificate", PAN_DOCUMENT: "PAN Card / Document", INCORPORATION_CERTIFICATE: "Certificate of Incorporation", MSME_UDYAM: "MSME / Udyam Registration",
  TRADE_LICENSE: "Trade License / Shop & Establishment", FACTORY_LICENSE: "Factory License / Industrial Permit", ADDRESS_PROOF: "Business Address Proof", OTHER: "Other Verification Document",
};

export interface Reason { code: string; label: string; message: string }
export interface VerificationPolicy {
  version: string;
  /** Business types the policy applies to. Empty = every business type. */
  businessTypes: string[];
  requiredDocumentTypes: DocumentType[];
  optionalDocumentTypes: DocumentType[];
  /** The criteria a reviewer must confirm before approving. Reviewer input, never proof. */
  checklist: { key: string; label: string }[];
  /** Decision reasons. `message` is the ONLY text a supplier sees for a decision; internal notes are separate. */
  reasons: { approve: Reason[]; requestChanges: Reason[]; reject: Reason[] };
  /** The identity fields whose change after approval withholds the public label until re-review. Required: the business must decide what is material. */
  materialIdentityFields: IdentityField[];
  /** Months an approval stays valid. null = the policy defines no expiry (none is invented). */
  approvalExpiryMonths: number | null;
  /** May a supplier submit again after a rejection? Explicit, never assumed. */
  resubmitAfterReject: boolean;
}

const KEY_RE = /^[a-z][a-z0-9_]{1,40}$/;
const CODE_RE = /^[A-Z][A-Z0-9_]{1,40}$/;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Validate a policy object. Returns the cleaned policy or every problem found (so the configuration message is actionable). */
export function parsePolicy(raw: unknown): { ok: true; policy: VerificationPolicy } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!o) return { ok: false, problems: ["The policy must be a JSON object."] };
  const version = text(o.version, 40);
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(version)) problems.push("version: a short identifier such as v1 is required.");
  const types = (v: unknown, name: string, required: boolean): DocumentType[] => {
    if (!Array.isArray(v)) { if (required) problems.push(`${name}: a list of document types is required.`); return []; }
    const bad = v.filter((x) => !DOCUMENT_TYPES.includes(x as DocumentType));
    if (bad.length) problems.push(`${name}: unknown document type ${bad.slice(0, 3).map(String).join(", ")}.`);
    return [...new Set(v.filter((x): x is DocumentType => DOCUMENT_TYPES.includes(x as DocumentType)))];
  };
  const requiredDocumentTypes = types(o.requiredDocumentTypes, "requiredDocumentTypes", true);
  if (Array.isArray(o.requiredDocumentTypes) && requiredDocumentTypes.length === 0) problems.push("requiredDocumentTypes: the business must name at least one required evidence type (none is assumed).");
  const optionalDocumentTypes = types(o.optionalDocumentTypes ?? [], "optionalDocumentTypes", false).filter((t) => !requiredDocumentTypes.includes(t));
  const businessTypes = Array.isArray(o.businessTypes) ? [...new Set(o.businessTypes.map((b) => text(b, 60)).filter(Boolean))] : [];
  const checklist: VerificationPolicy["checklist"] = [];
  if (!Array.isArray(o.checklist) || o.checklist.length === 0) problems.push("checklist: at least one review criterion is required.");
  else for (const c of o.checklist as Record<string, unknown>[]) {
    const key = text(c?.key, 41), label = text(c?.label, 160);
    if (!KEY_RE.test(key) || !label) problems.push("checklist: each criterion needs a key (lowercase, digits, underscore) and a label.");
    else if (checklist.some((x) => x.key === key)) problems.push(`checklist: duplicate key ${key}.`);
    else checklist.push({ key, label });
  }
  const reasonList = (v: unknown, name: string, needed: boolean): Reason[] => {
    const out: Reason[] = [];
    if (!Array.isArray(v) || v.length === 0) { if (needed) problems.push(`reasons.${name}: at least one approved reason is required.`); return out; }
    for (const r of v as Record<string, unknown>[]) {
      const code = text(r?.code, 41), label = text(r?.label, 120), message = text(r?.message, 300);
      if (!CODE_RE.test(code) || !label || !message) problems.push(`reasons.${name}: each reason needs a code (UPPER_SNAKE), a label and the supplier-visible message.`);
      else if (out.some((x) => x.code === code)) problems.push(`reasons.${name}: duplicate code ${code}.`);
      else out.push({ code, label, message });
    }
    return out;
  };
  const rs = o.reasons && typeof o.reasons === "object" ? (o.reasons as Record<string, unknown>) : {};
  const reasons = { approve: reasonList(rs.approve, "approve", false), requestChanges: reasonList(rs.requestChanges, "requestChanges", true), reject: reasonList(rs.reject, "reject", true) };
  const materialIdentityFields = Array.isArray(o.materialIdentityFields) ? [...new Set(o.materialIdentityFields.filter((f): f is IdentityField => IDENTITY_FIELDS.includes(f as IdentityField)))] : [];
  if (materialIdentityFields.length === 0) problems.push("materialIdentityFields: the business must decide which identity fields are material (a change withholds the public label until re-review).");
  let approvalExpiryMonths: number | null = null;
  if (o.approvalExpiryMonths !== undefined && o.approvalExpiryMonths !== null) {
    if (typeof o.approvalExpiryMonths !== "number" || !Number.isInteger(o.approvalExpiryMonths) || o.approvalExpiryMonths < 1 || o.approvalExpiryMonths > 120) problems.push("approvalExpiryMonths: a whole number of months (1-120), or omit it for no expiry.");
    else approvalExpiryMonths = o.approvalExpiryMonths;
  }
  if (typeof o.resubmitAfterReject !== "boolean") problems.push("resubmitAfterReject: true or false is required (resubmission after a rejection is never assumed).");
  if (problems.length) return { ok: false, problems };
  return { ok: true, policy: { version, businessTypes, requiredDocumentTypes, optionalDocumentTypes, checklist, reasons, materialIdentityFields, approvalExpiryMonths, resubmitAfterReject: o.resubmitAfterReject as boolean } };
}

export const policyApplies = (policy: VerificationPolicy, businessType: string | null | undefined): boolean => policy.businessTypes.length === 0 || policy.businessTypes.includes((businessType ?? "").trim());

/** What a supplier may still be missing before it can submit (required evidence, and files that are present and usable). */
export function missingEvidence(policy: VerificationPolicy, present: DocumentType[]): DocumentType[] {
  return policy.requiredDocumentTypes.filter((t) => !present.includes(t));
}

// ---------------------------------------------------------------- lifecycle
export const SUBMISSION_STATES = ["PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "SUPERSEDED"] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];
export const STATE_LABEL: Record<SubmissionState, string> = { PENDING_REVIEW: "Pending review", CHANGES_REQUESTED: "Changes requested", APPROVED: "Approved", REJECTED: "Rejected", SUPERSEDED: "Replaced by a newer submission" };
export const STATE_TONE: Record<SubmissionState, "info" | "warn" | "ok" | "bad" | "muted"> = { PENDING_REVIEW: "warn", CHANGES_REQUESTED: "warn", APPROVED: "ok", REJECTED: "bad", SUPERSEDED: "muted" };

export const FILTER_STATES = [{ key: "all", label: "All" }, ...(["PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED"] as const).map((s) => ({ key: s, label: STATE_LABEL[s] }))] as const;
export const FILTER_KEYS = FILTER_STATES.map((s) => s.key) as readonly string[];

export type Decision = "approve" | "request-changes" | "reject";
export const DECISION_STATE: Record<Decision, SubmissionState> = { approve: "APPROVED", "request-changes": "CHANGES_REQUESTED", reject: "REJECTED" };
export interface DecisionCaps { approve: boolean; requestChanges: boolean; reject: boolean }
export interface DecisionState { permitted: boolean; available: boolean; reason: string | null }

/** Only a PENDING_REVIEW submission can be decided; each decision has its own capability. Approval has additional blockers (policy, evidence, conflict) the server adds. */
export function decisionPlan(state: SubmissionState, caps: DecisionCaps): Record<Decision, DecisionState> {
  const pending = state === "PENDING_REVIEW";
  const make = (permitted: boolean): DecisionState => ({ permitted, available: permitted && pending, reason: permitted && !pending ? "This submission was already decided or replaced." : null });
  return { approve: make(caps.approve), "request-changes": make(caps.requestChanges), reject: make(caps.reject) };
}

// ---------------------------------------------------------------- decision input
export const NOTE_MAX = 500;
export interface DecisionInput { reasonCode?: unknown; internalNote?: unknown; checklist?: unknown }
export type DecisionCheck = { ok: true; reasonCode: string | null; reason: Reason | null; note: string; checklist: { key: string; checked: boolean }[] } | { ok: false; fields: Record<string, string> };
const cleanNote = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, NOTE_MAX + 1) : "");

/**
 * Validate a decision against the policy SNAPSHOT of the submission (the rules the supplier submitted under). The checklist is the reviewer's own confirmation: every key must be one the
 * policy defines, and approval needs all of them confirmed. The reason must be one of the policy's approved reasons; its `message` is what the supplier will see.
 */
export function checkDecision(action: Decision, policy: VerificationPolicy, input: DecisionInput, canNote: boolean): DecisionCheck {
  const fields: Record<string, string> = {};
  const list = action === "approve" ? policy.reasons.approve : action === "reject" ? policy.reasons.reject : policy.reasons.requestChanges;
  const code = typeof input.reasonCode === "string" ? input.reasonCode : "";
  const reason = list.find((r) => r.code === code) ?? null;
  if (action !== "approve" && !reason) fields.reasonCode = "Choose a reason from the list.";
  if (action === "approve" && list.length > 0 && code && !reason) fields.reasonCode = "Choose a reason from the list.";
  if (action === "approve" && list.length > 0 && !code) fields.reasonCode = "Choose a reason from the list.";
  const note = cleanNote(input.internalNote);
  if (note.length > NOTE_MAX) fields.internalNote = `Keep the note within ${NOTE_MAX} characters.`;
  if (note && !canNote) fields.internalNote = "Your account may not record internal notes.";
  const given = input.checklist && typeof input.checklist === "object" && !Array.isArray(input.checklist) ? (input.checklist as Record<string, unknown>) : {};
  const unknown = Object.keys(given).filter((k) => !policy.checklist.some((c) => c.key === k));
  if (unknown.length) fields.checklist = "The checklist does not match the policy. Reload and try again.";
  const checklist = policy.checklist.map((c) => ({ key: c.key, checked: given[c.key] === true }));
  if (action === "approve" && !fields.checklist && checklist.some((c) => !c.checked)) fields.checklist = "Confirm every required review criterion before approving.";
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, reasonCode: reason?.code ?? null, reason, note, checklist };
}

// ---------------------------------------------------------------- identity and the effective label
export const identityChanged = (approved: Partial<IdentitySnapshot>, current: Partial<IdentitySnapshot>, fields: readonly IdentityField[]): IdentityField[] =>
  fields.filter((f) => (approved[f] ?? "").trim().toLowerCase() !== (current[f] ?? "").trim().toLowerCase());

export type EffectiveKind = "REVIEWED" | "IDENTITY_CHANGED" | "EXPIRED" | "PENDING" | "CHANGES" | "REJECTED" | "NONE";
export interface Effective { kind: EffectiveKind; label: string; note: string; publicBadge: boolean }
export interface ApprovalRecord { approvedAt: Date; revision: number; policyVersion: string; identity: Partial<IdentitySnapshot>; materialFields: IdentityField[]; expiryMonths: number | null }

/**
 * The company's EFFECTIVE verification as it may be shown. The public badge needs ALL of: a stored approval, the material identity fields unchanged since that approval (the policy's
 * list, stored with the approval), and the approval not past the expiry the policy defined at approval time (none = never). An identity change does not delete the approval (nothing is
 * revoked automatically); it withholds the label until a new revision is reviewed. A pending, changes-requested or rejected LATEST submission is shown beside it, never as verified.
 */
export function effectiveVerification(input: { approval: ApprovalRecord | null; current: Partial<IdentitySnapshot>; latest: SubmissionState | null; now?: Date }): Effective {
  const now = input.now ?? new Date();
  const a = input.approval;
  if (a) {
    const changed = identityChanged(a.identity, input.current, a.materialFields);
    const expired = a.expiryMonths !== null && new Date(a.approvedAt.getTime() + a.expiryMonths * 30.4375 * 86_400_000) < now;
    if (changed.length) return { kind: "IDENTITY_CHANGED", label: "Review needed", note: `Approved in revision ${a.revision}, but the company's ${changed.join(", ")} changed since. The public label is withheld until a new submission is reviewed.`, publicBadge: false };
    if (expired) return { kind: "EXPIRED", label: "Approval expired", note: `The approval of revision ${a.revision} passed the expiry period its policy (${a.policyVersion}) defined.`, publicBadge: false };
    return { kind: "REVIEWED", label: "Reviewed by Finbyn Mart", note: `Business evidence reviewed (revision ${a.revision}, policy ${a.policyVersion}). This is a platform review of the evidence submitted, not government or product-quality certification.`, publicBadge: true };
  }
  if (input.latest === "PENDING_REVIEW") return { kind: "PENDING", label: "Pending review", note: "Submitted evidence is waiting for review.", publicBadge: false };
  if (input.latest === "CHANGES_REQUESTED") return { kind: "CHANGES", label: "Changes requested", note: "The reviewer asked for corrections before the evidence can be approved.", publicBadge: false };
  if (input.latest === "REJECTED") return { kind: "REJECTED", label: "Not approved", note: "The last submission was not approved.", publicBadge: false };
  return { kind: "NONE", label: "Unverified", note: "No company evidence has been approved. Uploading a file, profile completeness and e-mail or phone confirmation are not company verification.", publicBadge: false };
}

// ---------------------------------------------------------------- queue query
export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const MAX_PAGE = 1000;
export const SEARCH_MAX = 60;
export const REFERENCE_RE = /^VER-\d{4}-[A-Z0-9]{6}$/;
export const KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
export interface QueueState { q: string; status: (typeof FILTER_STATES)[number]["key"]; start: string; end: string; page: number }
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function parseQueueState(get: (k: string) => string | null | undefined): { ok: true; state: QueueState } | { ok: false; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const q = (get("q") ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length > SEARCH_MAX) fields.q = `Use at most ${SEARCH_MAX} characters.`;
  const statusRaw = get("status") ?? "all";
  if (!FILTER_KEYS.includes(statusRaw)) fields.status = "Unknown filter value.";
  const start = get("start") ?? "", end = get("end") ?? "";
  if ((start && !DAY.test(start)) || (end && !DAY.test(end)) || (start && Number.isNaN(Date.parse(start))) || (end && Number.isNaN(Date.parse(end)))) fields.range = "Enter valid dates.";
  else if (start && end && end < start) fields.range = "The end date must not be before the start date.";
  const pageRaw = get("page");
  const page = pageRaw ? Number(pageRaw) : 1;
  if (pageRaw && (!Number.isInteger(page) || page < 1 || page > MAX_PAGE)) fields.page = "Unknown page.";
  if (Object.keys(fields).length) return { ok: false, fields };
  return { ok: true, state: { q, status: statusRaw as QueueState["status"], start, end, page } };
}
export function toQueueParams(s: QueueState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.status !== "all") p.set("status", s.status);
  if (s.start) p.set("start", s.start);
  if (s.end) p.set("end", s.end);
  if (s.page > 1) p.set("page", String(s.page));
  return p;
}
export const EMPTY_QUEUE: QueueState = { q: "", status: "all", start: "", end: "", page: 1 };
