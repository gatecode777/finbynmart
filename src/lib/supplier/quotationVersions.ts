import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { formatSubmitted } from "@/lib/inquiries/confirmation";
import { inquiriesCollection } from "@/lib/inquiries/service";
import { buildVersionView, compareViews, type Comparison } from "@/lib/quotations/quotationCompare";
import { REFERENCE_PATTERN, daysLeft } from "@/lib/quotations/quotationRules";
import { IDEMPOTENCY_KEY } from "@/lib/quotations/quoteRules";
import { inputFromDoc, parseRevisionReason, revisionEligibility } from "@/lib/quotations/revisionRules";
import type { QuotationDoc } from "@/lib/quotations/service";
import type { PublicUser } from "@/lib/auth/users";
import type { SupplierContext } from "./company";
import { replyEligibility } from "./inquiryRules";
import { MAX_VERSION_NUMBER, quotesCollection } from "./quotationService";
import { SUPPLIER_STATUS_LABEL, supplierStatus } from "./quotationRules";
import { revisionDraftDoc } from "./quoteService";

/**
 * Versions of ONE quotation (Page 44): paged summaries, comparison, revision creation and the activity feed. Same tenancy rule as everything supplier-side:
 * every read and write carries `supplierKey` in the session company's seller keys; an unknown, malformed or another supplier's reference or version is the
 * same "not found". Version summaries are light (no line items, no events, no snapshot input); a full version is read only when it is selected or compared.
 * Nothing here edits a submitted version: a revision is a NEW draft version, and the previous current version changes only when that draft is submitted.
 */
type Failure = { ok: false; status: 403 | 404 | 409 | 422; code: string; message: string; fields?: Record<string, string>; data?: unknown };
const fail = (status: Failure["status"], code: string, message: string, extra: { fields?: Record<string, string>; data?: unknown } = {}): Failure => ({ ok: false, status, code, message, ...extra });
class Abort extends Error {
  constructor(public readonly failure: Failure) {
    super(failure.code);
  }
}
const keysOf = (c: SupplierContext) => c.company.sellerKeys;

// ---------- compare ----------
export interface CompareResult {
  reference: string;
  from: { version: number; statusLabel: string; isCurrent: boolean; currency: string };
  to: { version: number; statusLabel: string; isCurrent: boolean; currency: string };
  comparison: Comparison;
  notes: string[];
}

/** Two versions of ONE of the company's quotations. Only those two documents are read; nothing is written. Same quotation, same company, or it is the same 404. */
export async function compareVersions(context: SupplierContext, reference: string, from: number, to: number, now = new Date()): Promise<{ ok: true; result: CompareResult } | Failure> {
  const keys = keysOf(context);
  if (keys.length === 0 || !REFERENCE_PATTERN.test(reference)) return fail(404, "NOT_FOUND", "Quotation not found.");
  if (from === to) return fail(422, "VALIDATION", "Choose two different versions to compare.", { fields: { to: "Choose a different version." } });
  const docs = (await (await quotesCollection()).find({ reference, supplierKey: { $in: keys }, version: { $in: [from, to] } }).toArray()) as QuotationDoc[];
  const a = docs.find((d) => d.version === from);
  const b = docs.find((d) => d.version === to);
  if (!a || !b) return fail(404, "NOT_FOUND", "Quotation not found.");
  const va = buildVersionView(a);
  const vb = buildVersionView(b);
  const comparison = compareViews(va, vb);
  const notes: string[] = [];
  if (comparison.currencyChanged) notes.push("The currency differs between these versions, so no amount difference is calculated.");
  if (va.amountsSource === "stored" || vb.amountsSource === "stored") notes.push("One of these is an older record without a stored snapshot: its amounts are worked out from its own stored fields.");
  if (va.amountsSource === "unavailable" || vb.amountsSource === "unavailable") notes.push("The amounts of one version cannot be worked out from its stored data (a data-integrity gap); only the fields that exist are compared.");
  if (a.status === "DRAFT" || b.status === "DRAFT") notes.push("A draft is compared as saved so far: its amounts are provisional.");
  const meta = (d: QuotationDoc) => ({ version: d.version, statusLabel: SUPPLIER_STATUS_LABEL[supplierStatus(d.status, d.validUntil, now)], isCurrent: d.isCurrent, currency: d.currency });
  return { ok: true, result: { reference, from: meta(a), to: meta(b), comparison, notes } };
}

// ---------- revisions ----------
export interface RevisionResult {
  reference: string;
  version: number;
  editHref: string;
  replayed: boolean;
}
export type RevisionOutcome = ({ ok: true } & RevisionResult) | Failure;

const hashOf = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

export async function createRevision(context: SupplierContext, user: PublicUser, reference: string, body: { baseVersion?: unknown; reason?: unknown; idempotencyKey?: unknown }, now = new Date()): Promise<RevisionOutcome> {
  if (!context.permissions.manageQuotations) return fail(403, "FORBIDDEN", "Your role cannot create revisions.");
  const fields: Record<string, string> = {};
  const baseVersion = typeof body.baseVersion === "number" && Number.isInteger(body.baseVersion) && body.baseVersion >= 1 && body.baseVersion <= MAX_VERSION_NUMBER ? body.baseVersion : null;
  if (baseVersion === null) fields.baseVersion = "Send the version you are revising.";
  const reason = parseRevisionReason(body.reason);
  if (!reason.ok) fields.reason = reason.error;
  const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  if (!IDEMPOTENCY_KEY.test(key)) fields.idempotencyKey = "A key of 16 to 64 letters, digits, - or _ is required.";
  if (Object.keys(fields).length > 0 || baseVersion === null || !reason.ok) return fail(422, "VALIDATION", "Check the highlighted fields.", { fields });
  const keys = keysOf(context);
  if (keys.length === 0 || !REFERENCE_PATTERN.test(reference)) return fail(404, "NOT_FOUND", "Quotation not found.");

  const requestHash = hashOf({ reference, baseVersion, reason: reason.reason });
  const db = await getDb();
  const idem = db.collection("idempotency_keys");
  const scope = { companyId: context.companyId, userId: new ObjectId(user.id), operation: "quotation.revise", key };
  const replay = async (): Promise<RevisionOutcome | null> => {
    const prior = await idem.findOne(scope);
    if (!prior) return null;
    if (prior.requestHash !== requestHash) return fail(409, "IDEMPOTENCY_CONFLICT", "This key was already used for a different revision request. Start the revision again.");
    const r = prior.response as { version: number };
    return { ok: true, reference, version: r.version, editHref: `/supplier/quotations/create?reference=${reference}`, replayed: true };
  };
  const early = await replay();
  if (early) return early;

  const quotes = await quotesCollection();
  await idem.createIndex({ companyId: 1, userId: 1, operation: 1, key: 1 }, { unique: true, name: "idempotency_scope_key" }).catch(() => undefined);
  const client = await getMongoClient();
  const session = client.startSession();
  let created: { version: number } | undefined;
  try {
    await session.withTransaction(
      async () => {
        created = undefined;
        const versions = (await quotes.find({ reference, supplierKey: { $in: keys } }, { session }).sort({ version: -1 }).limit(25).toArray()) as QuotationDoc[];
        if (versions.length === 0) throw new Abort(fail(404, "NOT_FOUND", "Quotation not found."));
        const base = versions.find((v) => v.version === baseVersion);
        if (!base) throw new Abort(fail(404, "NOT_FOUND", "Quotation not found."));
        const current = versions.find((v) => v.isCurrent) ?? base;
        const openDraft = versions.find((v) => v.status === "DRAFT" && !v.isCurrent);
        const inquiry = await (await inquiriesCollection()).findOne({ _id: base.inquiryId, supplierKey: { $in: keys } }, { session });
        if (!inquiry) throw new Abort(fail(404, "NOT_FOUND", "Quotation not found."));
        const elig = revisionEligibility({ status: base.status, isCurrent: base.version === current.version && base.isCurrent, hasOpenRevisionDraft: Boolean(openDraft), inquiryOpen: replyEligibility(inquiry.status, Boolean(inquiry.buyerId)).ok });
        if (!elig.ok) throw new Abort(fail(409, elig.code, elig.message, elig.code === "REVISION_EXISTS" && openDraft ? { data: { reference, version: openDraft.version, editHref: `/supplier/quotations/create?reference=${reference}` } } : {}));
        const input = inputFromDoc(base, now.getTime());
        const doc = revisionDraftDoc({ context, user, base, inquiry: inquiry as never, input, reason: reason.reason, now });
        await quotes.insertOne(doc, { session });
        await idem.insertOne({ ...scope, requestHash, response: { version: doc.version }, createdAt: now }, { session });
        created = { version: doc.version };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } catch (error) {
    if (error instanceof Abort) {
      const again = await replay();
      return again ?? error.failure;
    }
    if ((error as { code?: number }).code === 11000) {
      // a simultaneous request created the same next version, or used the same key
      const again = await replay();
      if (again) return again;
      const existing = (await quotes.findOne({ reference, supplierKey: { $in: keys }, status: "DRAFT", isCurrent: false }, { sort: { version: -1 } })) as QuotationDoc | null;
      if (existing) return fail(409, "REVISION_EXISTS", "A revision draft already exists. Continue it instead of creating another.", { data: { reference, version: existing.version, editHref: `/supplier/quotations/create?reference=${reference}` } });
    }
    console.error("revision create failed", (error as Error).message);
    throw error;
  } finally {
    await session.endSession();
  }
  if (!created) return fail(409, "CONFLICT", "The revision could not be created. Please try again.");
  await db.collection("security_events").insertOne({ userId: new ObjectId(user.id), type: "supplier_quotation_revision_created", at: new Date(), reference, companyId: context.companyId, version: created.version }).catch(() => undefined);
  return { ok: true, reference, version: created.version, editHref: `/supplier/quotations/create?reference=${reference}`, replayed: false };
}

// ---------- activity ----------
export interface QuotationActivityItem {
  key: string;
  at: string;
  atLabel: string;
  title: string;
  detail: string | null;
}
export const QUOTATION_ACTIVITY_LIMIT = 50;

/** What really happened to this quotation, from the versions' own records: bounded to 50, newest first. Nothing viewed / read / delivered / paid is ever shown. */
export async function getQuotationActivity(context: SupplierContext, reference: string, now = new Date()): Promise<{ items: QuotationActivityItem[]; truncated: boolean } | null> {
  const keys = keysOf(context);
  if (keys.length === 0 || !REFERENCE_PATTERN.test(reference)) return null;
  const docs = (await (await quotesCollection()).find({ reference, supplierKey: { $in: keys } }, { projection: { version: 1, status: 1, isCurrent: 1, events: 1, createdAt: 1, validUntil: 1, revisionOf: 1, revisionReason: 1, decision: 1 } }).sort({ version: -1 }).limit(25).toArray()) as QuotationDoc[];
  if (docs.length === 0) return null;
  const all: { at: Date; key: string; title: string; detail: string | null }[] = [];
  for (const d of docs) {
    const v = `Version ${d.version}`;
    if (d.version === 1) all.push({ at: d.createdAt, key: `${d.version}-created`, title: `Draft created (${v})`, detail: null });
    else all.push({ at: d.createdAt, key: `${d.version}-created`, title: `Revision draft created (${v}, from version ${d.revisionOf ?? d.version - 1})`, detail: d.revisionReason ? `Reason: ${d.revisionReason}` : null });
    for (const e of d.events ?? []) {
      const title = e.type === "SENT" ? `${v} submitted` : e.type === "SUPERSEDED" ? `${v} replaced by a newer version` : e.type === "WITHDRAWN" ? `${v} withdrawn` : e.type === "ACCEPTED" ? `${v} accepted by the buyer` : e.type === "REJECTED" ? `${v} rejected by the buyer` : e.type === "REVISION_REQUESTED" ? `Buyer requested a revision of ${v}` : null;
      if (title) all.push({ at: e.at, key: `${d.version}-${e.type}-${e.at.getTime()}`, title, detail: e.type === "WITHDRAWN" && e.reason ? `Reason: ${e.reason}` : e.type === "REJECTED" && d.decision?.reason ? `Buyer's reason: ${d.decision.reason}` : null });
    }
    // expiry follows from the valid-until date (never stored): shown only for an offer that is still waiting on the buyer
    if (d.isCurrent && (d.status === "SENT" || d.status === "REVISION_REQUESTED") && d.validUntil.getTime() <= now.getTime() && daysLeft(d.validUntil, now) <= 0) all.push({ at: d.validUntil, key: `${d.version}-expired`, title: `${v} validity ended`, detail: "Derived from its valid-until date" });
  }
  all.sort((a, b) => b.at.getTime() - a.at.getTime());
  return { items: all.slice(0, QUOTATION_ACTIVITY_LIMIT).map((a) => ({ key: a.key, at: a.at.toISOString(), atLabel: formatSubmitted(a.at.toISOString()), title: a.title, detail: a.detail })), truncated: all.length > QUOTATION_ACTIVITY_LIMIT };
}
