import { createHash } from "node:crypto";
import { ObjectId, type ClientSession } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { inquiriesCollection, type InquiryDoc } from "@/lib/inquiries/service";
import { DuplicateRecipient, addRecipientIn, deliverNotice, distributionCollections, freeze, type JobDoc } from "@/lib/leads/distribution";
import type { DistributionState } from "@/lib/leads/matchingRules";
import { findCompanyBySupplierKey, isCompanyKey } from "@/lib/supplier/company";
import { companyNames } from "./productManagement";
import { adminAuditLog } from "./auditLog";
import { jobView, type AdminJobView } from "./inquiryService";
import { ADMIN_JOB_LABEL, KEY_RE, REFERENCE_RE, STATUS_LABEL, actionPlan, cleanReason, validateReason, type AdminAction } from "./inquiryRules";

/**
 * Administrative operations on one inquiry's distribution: recipients view, activity log, routing repair, pause, resume, retry.
 *
 * Authority and scope: the caller resolves the admin from the session and checks the capability; this module never trusts an actor, company or eligibility from a body.
 * The admin model has capabilities only (no organisation or category scope), so scope = capability: documented in docs/admin/PAGE_57_INQUIRY_MANAGEMENT.md.
 *
 * Exactly-once: every operation carries an idempotency key; its audit row holds the unique `operationKey` (admin + action + key) and a hash of the request. The row is inserted
 * IN THE SAME TRANSACTION as the change, so an acknowledged change always has its audit row and a retry of the same request finds it and answers the original result;
 * the same key with a different request is a 409. Pause / resume / retry also carry the job's `adminRev` (a conditional write: a stale view is a 409).
 */

export type OpResult = { ok: true; replay: boolean; message: string } | { ok: false; status: 404 | 409 | 422; message: string; fields?: Record<string, string> };
type Fail = Extract<OpResult, { ok: false }>;
const fail = (status: Fail["status"], message: string, fields?: Fail["fields"]): Fail => ({ ok: false, status, message, ...(fields ? { fields } : {}) });

export type AuditAction = "INQUIRY_RECIPIENT_ROUTED" | "INQUIRY_DISTRIBUTION_PAUSED" | "INQUIRY_DISTRIBUTION_RESUMED" | "INQUIRY_DISTRIBUTION_RETRIED" | "INQUIRIES_EXPORTED";

const hex = (v: unknown) => typeof v === "string" && /^[a-f0-9]{24}$/.test(v);

// ---------------------------------------------------------------- recipients (read)
export interface RecipientRow {
  kind: "DIRECT" | "MATCHED";
  company: string;
  /** DIRECT: the buyer chose this supplier. MATCHED: recorded matching reason. */
  reason: string;
  policy: string | null;
  /** The recipient's OWN progress (never another recipient's). */
  progress: string;
  /** Recorded in-app notice state of a MATCHED recipient; null = no record exists (never inferred). */
  notice: string | null;
  origin: "Automatic matching" | "Administrative routing repair" | "Selected by the buyer";
  addedAt: string;
  messages: number;
  quotation: { reference: string; status: string } | null;
}

export interface RecipientsView {
  job: AdminJobView | null;
  recipients: RecipientRow[];
  total: number;
  truncated: boolean;
  /** Present only for an admin with routing permission and only while routing is possible. */
  routing: { candidates: { companyId: string; name: string }[]; outsideCutoff: number; unavailable: string | null } | null;
}

const NOTICE_LABEL: Record<string, string> = { PENDING: "Queued, not yet recorded", DONE: "Recorded in the supplier's inbox", SKIPPED_PREFERENCE: "Not recorded (supplier switched this alert off)", NOT_RECORDED: "Not recorded" };
const RECIPIENT_PROGRESS: Record<string, string> = { NEW: "New", IN_PROGRESS: "In progress", REPLIED: "Replied", QUOTED: "Quoted" };
const RECIPIENT_CAP = 100;

async function inquiryByReference(reference: string): Promise<(InquiryDoc & { _id: ObjectId }) | null> {
  if (!REFERENCE_RE.test(reference)) return null;
  return (await (await inquiriesCollection()).findOne({ reference })) as (InquiryDoc & { _id: ObjectId }) | null;
}

export async function getRecipients(reference: string, caps: { routing: boolean }): Promise<RecipientsView | null> {
  const d = await inquiryByReference(reference);
  if (!d) return null;
  const { jobs, recipients } = await distributionCollections();
  const db = await getDb();
  const [job, recs, total, msgCounts, quotes] = await Promise.all([
    jobs.findOne({ inquiryId: d._id }),
    recipients.find({ inquiryId: d._id, state: "ACTIVE" }).sort({ createdAt: 1, _id: 1 }).limit(RECIPIENT_CAP).toArray(),
    recipients.countDocuments({ inquiryId: d._id, state: "ACTIVE" }),
    db.collection("inquiry_messages").aggregate<{ _id: string; n: number }>([{ $match: { inquiryId: d._id } }, { $group: { _id: "$supplierKey", n: { $sum: 1 } } }]).toArray(),
    (await import("@/lib/quotations/service")).quotationsCollection().then((c) => c.find({ inquiryId: d._id, isCurrent: true, status: { $ne: "DRAFT" } }, { projection: { reference: 1, status: 1, supplierKey: 1 } }).limit(200).toArray()),
  ]);
  const names = await companyNames(recs.map((r) => r.companyId));
  const msgBy = new Map(msgCounts.map((m) => [m._id, m.n]));
  const quoteBy = new Map(quotes.map((q) => [q.supplierKey, { reference: q.reference, status: q.status }]));
  const rows: RecipientRow[] = [];
  // DIRECT access is stored on the inquiry itself; it is presented as a row here and NEVER written as a duplicate recipient document
  if (d.sourceType !== "GENERAL_REQUIREMENT" && d.supplierKey) {
    rows.push({ kind: "DIRECT", company: d.supplierName || "Selected supplier", reason: "The buyer selected this supplier.", policy: null, progress: STATUS_LABEL[d.status] ?? d.status, notice: null, origin: "Selected by the buyer", addedAt: d.createdAt.toISOString(), messages: msgBy.get(d.supplierKey) ?? 0, quotation: quoteBy.get(d.supplierKey) ?? null });
  }
  for (const r of recs) {
    rows.push({ kind: "MATCHED", company: names.get(r.companyId.toHexString()) ?? "Company not available", reason: r.reason, policy: r.policyVersion, progress: RECIPIENT_PROGRESS[r.status] ?? r.status, notice: NOTICE_LABEL[r.notice.state] ?? null, origin: r.origin === "ADMIN_ROUTING" ? "Administrative routing repair" : "Automatic matching", addedAt: r.createdAt.toISOString(), messages: msgBy.get(r.recipientSupplierKey) ?? 0, quotation: quoteBy.get(r.recipientSupplierKey) ?? null });
  }

  let routing: RecipientsView["routing"] = null;
  if (caps.routing) {
    const plan = actionPlan({ inquiryStatus: d.status, jobState: job?.state ?? null, hasError: !!job?.lastError, caps: { routing: true, distribution: true } }).route;
    if (!plan.available || !job) routing = { candidates: [], outsideCutoff: 0, unavailable: plan.reason ?? "Routing is not available." };
    else {
      const c = await routableCandidates(job, d);
      const cn = await companyNames(c.candidates.map((x) => x.companyId));
      routing = { candidates: c.candidates.map((x) => ({ companyId: x.companyId.toHexString(), name: cn.get(x.companyId.toHexString()) ?? "Company not available" })).sort((a, b) => a.name.localeCompare(b.name)), outsideCutoff: c.outsideCutoff, unavailable: c.candidates.length === 0 ? (c.outsideCutoff > 0 ? "No company can be added: the companies that match now were outside the matching cutoff, which is not bypassed." : "No company is waiting to be routed: every company in the frozen candidate list already holds this requirement or no longer qualifies.") : null };
    }
  }
  return { job: jobView(job), recipients: rows, total: total + (rows[0]?.kind === "DIRECT" ? 1 : 0), truncated: total > RECIPIENT_CAP, routing };
}

type Candidate = NonNullable<JobDoc["frozen"]>["candidates"][number];

/** The company that holds this requirement DIRECTLY (the selected supplier), resolved from the stored key. */
async function directCompanyId(d: InquiryDoc): Promise<ObjectId | null> {
  if (d.sourceType === "GENERAL_REQUIREMENT" || !d.supplierKey) return null;
  if (isCompanyKey(d.supplierKey)) return new ObjectId(d.supplierKey.slice(3));
  const c = await findCompanyBySupplierKey(d.supplierKey, { _id: 1 });
  return c?._id ?? null;
}

/**
 * The companies an administrator may route this requirement to, calculated on the server: the job's FROZEN candidates (the matching cutoff), that hold no recipient row yet,
 * that are not the selected supplier's company, AND that satisfy the matching policy NOW. Companies that match now but were outside the cutoff are only counted: the cutoff
 * is never bypassed silently. The commit re-checks the company (active, owns the seller) and the product (still public) again inside its transaction.
 */
async function routableCandidates(job: JobDoc, d: InquiryDoc): Promise<{ candidates: Candidate[]; outsideCutoff: number }> {
  if (!job.frozen) return { candidates: [], outsideCutoff: 0 };
  const { recipients } = await distributionCollections();
  const direct = await directCompanyId(d);
  const have = new Set((await recipients.find({ inquiryId: d._id }, { projection: { companyId: 1 } }).toArray()).map((r) => r.companyId.toHexString()));
  const frozen = new Set(job.frozen.candidates.map((c) => c.companyId.toHexString()));
  const nowFrozen = await freeze(job);
  const candidates: Candidate[] = [];
  let outside = 0;
  for (const c of nowFrozen.candidates) {
    const id = c.companyId.toHexString();
    if (direct && c.companyId.equals(direct)) continue;
    if (!frozen.has(id)) { outside += have.has(id) ? 0 : 1; continue; }
    if (!have.has(id)) candidates.push(c);
  }
  return { candidates, outsideCutoff: outside };
}

// ---------------------------------------------------------------- activity (read)
export interface ActivityItem { action: string; label: string; actor: string; at: string; reason: string | null; detail: string | null }
const ACTIVITY_LABEL: Record<string, string> = { INQUIRY_RECIPIENT_ROUTED: "Recipient added by routing repair", INQUIRY_DISTRIBUTION_PAUSED: "Distribution paused", INQUIRY_DISTRIBUTION_RESUMED: "Distribution resumed", INQUIRY_DISTRIBUTION_RETRIED: "Distribution retried" };
const CURSOR_RE = /^\d{10,15}\.[a-f0-9]{24}$/;

/** The restricted administrative log of ONE inquiry, newest first, cursor-paged on (at, _id). Separate from the buyer-visible lifecycle history. */
export async function getActivity(reference: string, cursor: string | null, limit = 20): Promise<{ items: ActivityItem[]; nextCursor: string | null } | null> {
  const d = await inquiryByReference(reference);
  if (!d) return null;
  const lim = Math.min(50, Math.max(1, limit));
  const c = await adminAuditLog();
  const filter: Record<string, unknown> = { inquiryReference: reference };
  if (cursor && CURSOR_RE.test(cursor)) {
    const [ms, id] = cursor.split(".");
    const at = new Date(Number(ms));
    filter.$or = [{ at: { $lt: at } }, { at, _id: { $lt: new ObjectId(id) } }];
  }
  const rows = await c.find(filter, { projection: { action: 1, actorId: 1, at: 1, reason: 1, summary: 1 } }).sort({ at: -1, _id: -1 }).limit(lim + 1).toArray();
  const page = rows.slice(0, lim);
  const actors = await (await getDb()).collection<{ _id: ObjectId; name?: string }>("users").find({ _id: { $in: page.flatMap((r) => (r.actorId instanceof ObjectId ? [r.actorId] : [])) } }, { projection: { name: 1 } }).toArray();
  const an = new Map(actors.map((a) => [a._id.toHexString(), a.name || "Administrator"]));
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({ action: String(r.action), label: ACTIVITY_LABEL[String(r.action)] ?? String(r.action), actor: r.actorId instanceof ObjectId ? an.get(r.actorId.toHexString()) ?? "Administrator" : "Administrator", at: (r.at as Date).toISOString(), reason: typeof r.reason === "string" ? r.reason : null, detail: typeof r.summary === "string" ? r.summary : null })),
    nextCursor: rows.length > lim && last ? `${(last.at as Date).getTime()}.${(last._id as ObjectId).toHexString()}` : null,
  };
}

// ---------------------------------------------------------------- mutations
export interface OpInput { reason: unknown; idempotencyKey: unknown; expectedRev?: unknown; companyId?: unknown }

interface Prepared { adminId: ObjectId; reference: string; action: AdminAction; reason: string; key: string; operationKey: string; bodyHash: string; expectedRev: number | null; companyId: ObjectId | null }

function prepare(adminId: ObjectId, reference: string, action: AdminAction, kind: "job" | "route", input: OpInput): Prepared | Fail {
  const reason = cleanReason(input.reason);
  const reasonError = validateReason(reason);
  const fields: Record<string, string> = {};
  if (reasonError) fields.reason = reasonError;
  const key = typeof input.idempotencyKey === "string" && KEY_RE.test(input.idempotencyKey) ? input.idempotencyKey : "";
  if (!key) fields.idempotencyKey = "A request key is required. Reload the page and try again.";
  let expectedRev: number | null = null;
  if (kind === "job") {
    if (typeof input.expectedRev !== "number" || !Number.isInteger(input.expectedRev) || input.expectedRev < 0) fields.expectedRev = "Reload the inquiry and try again.";
    else expectedRev = input.expectedRev;
  }
  let companyId: ObjectId | null = null;
  if (kind === "route") {
    if (!hex(input.companyId)) fields.companyId = "Choose a company from the list.";
    else companyId = new ObjectId(input.companyId as string);
  }
  if (!REFERENCE_RE.test(reference)) return fail(404, "Inquiry not found.");
  if (Object.keys(fields).length) return fail(422, "Please fix the highlighted fields.", fields);
  const bodyHash = createHash("sha256").update(JSON.stringify([reference, action, reason, companyId?.toHexString() ?? null, expectedRev])).digest("hex");
  return { adminId, reference, action, reason, key, operationKey: `${adminId.toHexString()}:${action}:${key}`, bodyHash, expectedRev, companyId };
}

/** A previous acknowledged request with the same key: the same request gets the original answer, a different one a 409. */
async function replayOf(p: Prepared): Promise<OpResult | null> {
  const prev = await (await adminAuditLog()).findOne({ operationKey: p.operationKey }, { projection: { bodyHash: 1 } });
  if (!prev) return null;
  return prev.bodyHash === p.bodyHash ? { ok: true, replay: true, message: "This request was already applied." } : fail(409, "This request key was already used for a different request. Reload and try again.");
}

const AUDIT_ACTION: Record<Exclude<AdminAction, "restrict">, AuditAction> = { route: "INQUIRY_RECIPIENT_ROUTED", pause: "INQUIRY_DISTRIBUTION_PAUSED", resume: "INQUIRY_DISTRIBUTION_RESUMED", retry: "INQUIRY_DISTRIBUTION_RETRIED" };

type Outcome = OpResult & { audit?: Record<string, unknown>; recipientId?: ObjectId };

async function inTransaction(p: Prepared, body: (session: ClientSession) => Promise<Outcome>): Promise<{ result: OpResult; recipientId?: ObjectId }> {
  const session = (await getMongoClient()).startSession();
  const audit = await adminAuditLog();
  let out: Outcome | undefined;
  try {
    await session.withTransaction(
      async () => {
        out = undefined;
        const r = await body(session);
        out = r;
        if (r.ok === true && r.audit) {
          await audit.insertOne({ _id: new ObjectId(), action: AUDIT_ACTION[p.action as Exclude<AdminAction, "restrict">], actorId: p.adminId, inquiryReference: p.reference, reason: p.reason, operationKey: p.operationKey, bodyHash: p.bodyHash, ...r.audit, at: new Date() }, { session });
        }
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } catch (e) {
    // a concurrent commit of the same recipient won (the transaction was abandoned): nothing of this request was applied
    if (e instanceof DuplicateRecipient) return { result: fail(409, "This company already holds this requirement.") };
    // the unique operation key refused a second insert: a concurrent identical request committed first
    if ((e as { code?: number }).code === 11000) {
      const again = await replayOf(p);
      if (again) return { result: again };
    }
    throw e;
  } finally {
    await session.endSession();
  }
  const r = out as Outcome | undefined;
  return { result: r ?? fail(409, "Nothing was changed."), recipientId: r && r.ok ? r.recipientId : undefined };
}

type Loaded = { d: InquiryDoc & { _id: ObjectId }; job: JobDoc | null };
async function load(reference: string, session?: ClientSession): Promise<Loaded | null> {
  const d = (await (await inquiriesCollection()).findOne({ reference }, { session })) as (InquiryDoc & { _id: ObjectId }) | null;
  if (!d) return null;
  const { jobs } = await distributionCollections();
  return { d, job: await jobs.findOne({ inquiryId: d._id }, { session }) };
}

const revOf = (job: JobDoc) => job.adminRev ?? 0;
const STATE_NOW = (job: JobDoc): DistributionState => job.state;

/** Pause / resume / retry: one conditional update of the job (state + adminRev) and its audit row in one transaction. */
async function jobOperation(action: "pause" | "resume" | "retry", adminId: ObjectId, reference: string, input: OpInput): Promise<OpResult> {
  const p = prepare(adminId, reference, action, "job", input);
  if ("ok" in p) return p;
  const again = await replayOf(p);
  if (again) return again;
  const first = await load(reference);
  if (!first) return fail(404, "Inquiry not found.");
  if (!first.job) return fail(409, "This requirement has no distribution job, so there is nothing to " + action + ".");

  const { jobs } = await distributionCollections();
  const { result } = await inTransaction(p, async (session) => {
    const cur = await load(reference, session);
    if (!cur || !cur.job) return fail(404, "Inquiry not found.");
    const job = cur.job;
    const plan = actionPlan({ inquiryStatus: cur.d.status, jobState: job.state, hasError: !!job.lastError, caps: { routing: true, distribution: true } })[action];
    if (!plan.available) return fail(409, plan.reason ?? "This action is not available in the current state.");
    if (revOf(job) !== p.expectedRev) return fail(409, "The distribution changed after you opened it. Reload the inquiry and review its current state.");
    const now = new Date();
    const before = { state: STATE_NOW(job), adminRev: revOf(job), cursor: job.cursor, created: job.counts.created };
    let set: Record<string, unknown>;
    let unset: Record<string, ""> = {};
    let after: DistributionState;
    if (action === "pause") {
      after = "PAUSED";
      set = { state: "PAUSED", pause: { at: now, by: p.adminId, reason: p.reason, previousState: job.state }, updatedAt: now };
      // dropping the lease makes every later write of a worker that loaded the job earlier a no-op (its filter carries the lease owner)
      unset = { leaseOwner: "", leaseUntil: "" };
    } else if (action === "resume") {
      after = job.pause?.previousState === "PENDING" || !job.frozen ? "PENDING" : "PARTIAL";
      set = { state: after, nextAttemptAt: now, updatedAt: now };
      unset = { pause: "" };
    } else {
      after = "PARTIAL";
      set = { state: "PARTIAL", attempts: 0, nextAttemptAt: now, updatedAt: now };
      unset = { lastError: "" };
    }
    const upd = await jobs.updateOne({ _id: job._id, state: job.state, ...(revOf(job) === 0 ? { $or: [{ adminRev: 0 }, { adminRev: { $exists: false } }] } : { adminRev: revOf(job) }) }, { $set: set, $inc: { adminRev: 1 }, $unset: unset } as never, { session });
    if (upd.matchedCount !== 1) return fail(409, "The distribution changed while you were saving. Reload the inquiry and try again.");
    const message = action === "pause" ? "Distribution was paused. Existing recipients and conversations are unchanged." : action === "resume" ? "Distribution was resumed from its saved progress." : "The failed distribution will be retried from its saved progress.";
    return { ok: true, replay: false, message, audit: { inquiryId: cur.d._id, jobId: job._id, before, after: { state: after, adminRev: revOf(job) + 1 }, summary: `${ADMIN_JOB_LABEL[job.state]} → ${ADMIN_JOB_LABEL[after]}` } };
  });
  return result;
}

export const pauseDistribution = (adminId: ObjectId, reference: string, input: OpInput) => jobOperation("pause", adminId, reference, input);
export const resumeDistribution = (adminId: ObjectId, reference: string, input: OpInput) => jobOperation("resume", adminId, reference, input);
export const retryDistribution = (adminId: ObjectId, reference: string, input: OpInput) => jobOperation("retry", adminId, reference, input);

/**
 * Routing repair: add ONE MATCHED recipient. The server decides eligibility (the company must be a frozen candidate that qualifies under the policy now and holds no recipient
 * row; the selected supplier's company is never a candidate), then commits it through the SAME recipient routine the worker uses, in one transaction with the audit row.
 * The recipient notice (one in-app lead notice, subject to the supplier's alert preference) is delivered after the commit by the existing routine; a failure leaves it queued for the worker's sweep.
 */
export async function routeRecipient(adminId: ObjectId, reference: string, input: OpInput): Promise<OpResult> {
  const p = prepare(adminId, reference, "route", "route", input);
  if ("ok" in p) return p;
  const again = await replayOf(p);
  if (again) return again;
  const first = await load(reference);
  if (!first) return fail(404, "Inquiry not found.");
  const { d, job } = first;
  const plan = actionPlan({ inquiryStatus: d.status, jobState: job?.state ?? null, hasError: !!job?.lastError, caps: { routing: true, distribution: true } }).route;
  if (!job || !plan.available) return fail(409, plan.reason ?? "Routing is not available.");
  if (!job.frozen) return fail(409, "Automatic matching has not produced its candidate list yet.");

  const direct = await directCompanyId(d);
  if (direct && direct.equals(p.companyId!)) return fail(422, "That company already holds this requirement as the buyer's selected supplier.", { companyId: "The selected supplier cannot be added as a matched recipient." });
  const frozenHas = job.frozen.candidates.some((c) => c.companyId.equals(p.companyId!));
  const nowCand = (await freeze(job)).candidates.find((c) => c.companyId.equals(p.companyId!));
  if (!nowCand) return fail(422, frozenHas ? "That company no longer satisfies the matching policy, so it cannot be added." : "That company does not satisfy the matching policy for this requirement.", { companyId: "Choose a company from the list." });
  if (!frozenHas) return fail(422, "That company was outside the matching cutoff for this requirement. The cutoff is not bypassed, so it cannot be added.", { companyId: "Outside the matching cutoff." });

  const { result, recipientId } = await inTransaction(p, async (session) => {
    const cur = await load(reference, session);
    if (!cur || !cur.job) return fail(404, "Inquiry not found.");
    const live = actionPlan({ inquiryStatus: cur.d.status, jobState: cur.job.state, hasError: !!cur.job.lastError, caps: { routing: true, distribution: true } }).route;
    if (!live.available) return fail(409, live.reason ?? "Routing is not available.");
    const added = await addRecipientIn(cur.job, nowCand, session, false, "ADMIN_ROUTING");
    if (added.result === "exists") return fail(409, "This company already holds this requirement.");
    if (added.result === "stopped") return fail(409, "The requirement was closed, so nothing was added.");
    if (added.result !== "created" || !added.recipientId) return fail(409, "That company or its listing is no longer eligible, so nothing was added.");
    const count = await (await distributionCollections()).recipients.countDocuments({ inquiryId: cur.d._id, state: "ACTIVE" }, { session });
    return { ok: true, replay: false, message: "The company was added as a matched recipient.", recipientId: added.recipientId, audit: { inquiryId: cur.d._id, jobId: cur.job._id, companyId: p.companyId, recipientId: added.recipientId, before: { matchedRecipients: count - 1 }, after: { matchedRecipients: count }, summary: "Matched recipient added by administrative routing" } };
  });
  if (result.ok && recipientId) await deliverNotice(recipientId).catch(() => undefined);
  return result;
}

