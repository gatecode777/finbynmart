import { randomUUID } from "node:crypto";
import { ObjectId, type ClientSession, type Collection } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { supplierCompanies } from "@/lib/supplier/company";
import { notifySupplier } from "@/lib/supplier/notifications";
import { isSupplierCategoryEnabled } from "@/lib/supplier/settingsService";
import { inquiriesCollection } from "@/lib/inquiries/service";
import { sweepBuyerReplyNotices } from "@/lib/inquiries/conversations";
import { equivalentCandidates, requirementOf } from "./catalogCandidates";
import { BATCH_SIZE, LEASE_MS, MATCHING_POLICY_VERSION, MAX_ATTEMPTS, MAX_RECIPIENTS_PER_INQUIRY, NOTICE, backoffMs, finalState, isOpenForDistribution, type DistributionState, type Signature } from "./matchingRules";

/**
 * Durable lead distribution. Facts kept apart: the direct inquiry (its own record), the distribution JOB (`distribution_jobs`, written in the SAME transaction as
 * the inquiry, so an acknowledged inquiry always owes a job), each MATCHED recipient (`inquiry_recipients`, unique per inquiry + company), and each recipient's in-app
 * notice (`notice` on the recipient row: PENDING -> DONE | SKIPPED_PREFERENCE | NOT_RECORDED). Nothing here sends e-mail/SMS.
 * A worker (POST /api/internal/distribution, secret protected, any scheduler or operator can call it) claims a job by an atomic lease, freezes the candidate
 * companies once (the matching cutoff), then creates recipients in bounded batches; every recipient commit re-checks that the inquiry is still open and the company
 * still active and still owns the seller. Re-running a job (crash, retry, two workers) can never add a second recipient: the unique index refuses it.
 */
export interface RecipientDoc {
  _id: ObjectId;
  inquiryId: ObjectId;
  inquiryReference: string;
  companyId: ObjectId;
  type: "MATCHED";
  /** The company's OWN seller key for the matching listing: quotations/messages of this recipient carry it, which keeps every recipient's records apart. */
  recipientSupplierKey: string;
  matchedProductKey: string;
  policyVersion: string;
  /** Safe public match reason (no scores, no other supplier). */
  reason: string;
  state: "ACTIVE";
  /** This recipient's OWN progress (a supplier's reply or quotation never moves the shared inquiry or another recipient). */
  status: "NEW" | "IN_PROGRESS" | "REPLIED" | "QUOTED";
  notice: { state: "PENDING" | "DONE" | "SKIPPED_PREFERENCE" | "NOT_RECORDED"; attempts: number };
  createdAt: Date;
}

export interface JobDoc {
  _id: ObjectId;
  inquiryId: ObjectId;
  inquiryReference: string;
  policyVersion: string;
  requirement: { signature: Signature; directSellerKey: string; productKey: string };
  state: DistributionState;
  /** Frozen once, at the first run: the matching cutoff (the data model keeps no history of when a seller was linked). */
  frozen?: { at: Date; candidates: { companyId: ObjectId; ownerUserId: ObjectId; sellerKey: string; productKey: string }[]; unmapped: number; truncated: boolean; examined: number };
  cursor: number;
  counts: { created: number; skipped: number; failedBatches: number };
  attempts: number;
  nextAttemptAt: Date;
  leaseUntil?: Date;
  leaseOwner?: string;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

let ready: Promise<unknown> | undefined;
export async function distributionCollections(): Promise<{ jobs: Collection<JobDoc>; recipients: Collection<RecipientDoc> }> {
  const db = await getDb();
  const jobs = db.collection<JobDoc>("distribution_jobs");
  const recipients = db.collection<RecipientDoc>("inquiry_recipients");
  ready ??= Promise.all([
    jobs.createIndex({ inquiryId: 1 }, { unique: true, name: "job_inquiry" }),
    jobs.createIndex({ state: 1, nextAttemptAt: 1 }, { name: "job_runnable" }),
    recipients.createIndex({ inquiryId: 1, companyId: 1 }, { unique: true, name: "recipient_unique" }),
    recipients.createIndex({ companyId: 1, createdAt: -1, _id: -1 }, { name: "recipient_company_newest" }),
    recipients.createIndex({ "notice.state": 1, createdAt: 1 }, { name: "recipient_notice_pending", partialFilterExpression: { "notice.state": "PENDING" } }),
    (await inquiriesCollection()).createIndex({ matchedSupplierKeys: 1, createdAt: -1, _id: -1 }, { name: "inquiry_matched_newest" }),
    (await inquiriesCollection()).createIndex({ matchedSupplierKeys: 1, status: 1, createdAt: -1, _id: -1 }, { name: "inquiry_matched_status_newest" }),
  ]).catch((e) => {
    ready = undefined;
    throw e;
  });
  await ready;
  return { jobs, recipients };
}

/**
 * The job to write INSIDE the inquiry's transaction, or null when this inquiry is outside the workflow (a general inquiry, a sample listing, a guest: guests have
 * no account to receive quotations on, and unauthenticated fan-out is not offered).
 */
export function buildJob(inquiry: { _id: ObjectId; reference: string; buyerId?: ObjectId; productKey?: string; supplierKey: string }, now: Date): JobDoc | null {
  if (!inquiry.buyerId || !inquiry.productKey || !/^\d+$/.test(inquiry.productKey)) return null;
  const req = requirementOf(Number(inquiry.productKey));
  if (!req) return null;
  return {
    _id: new ObjectId(),
    inquiryId: inquiry._id,
    inquiryReference: inquiry.reference,
    policyVersion: MATCHING_POLICY_VERSION,
    requirement: { signature: req.signature, directSellerKey: inquiry.supplierKey, productKey: inquiry.productKey },
    state: "PENDING",
    cursor: 0,
    counts: { created: 0, skipped: 0, failedBatches: 0 },
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export async function insertJob(job: JobDoc, session: ClientSession): Promise<void> {
  const { jobs } = await distributionCollections();
  await jobs.insertOne(job, { session });
}

/** Freeze the candidate companies: equivalent listings -> active companies that own the seller (one lead per company), minus the direct supplier's company. */
async function freeze(job: JobDoc): Promise<NonNullable<JobDoc["frozen"]>> {
  const candidates = equivalentCandidates(job.requirement.signature, job.requirement.directSellerKey);
  const col = await supplierCompanies();
  const direct = await col.findOne({ sellerKeys: job.requirement.directSellerKey }, { projection: { _id: 1 } });
  const out: NonNullable<JobDoc["frozen"]>["candidates"] = [];
  const seen = new Set<string>(direct ? [direct._id.toHexString()] : []);
  let mapped = 0;
  for (let i = 0; i < candidates.length; i += 500) {
    const chunk = candidates.slice(i, i + 500);
    const byKey = new Map(chunk.map((c) => [c.sellerKey, c]));
    const companies = await col.find({ sellerKeys: { $in: chunk.map((c) => c.sellerKey) }, status: "ACTIVE" }, { projection: { ownerUserId: 1, sellerKeys: 1 } }).sort({ _id: 1 }).toArray();
    for (const c of companies) {
      mapped += 1;
      const id = c._id.toHexString();
      if (seen.has(id)) continue;
      // one company, several matching sellers: deterministic first by key
      const key = c.sellerKeys.filter((k) => byKey.has(k)).sort()[0];
      if (!key) continue;
      seen.add(id);
      out.push({ companyId: c._id, ownerUserId: c.ownerUserId, sellerKey: key, productKey: byKey.get(key)!.productKey });
    }
  }
  out.sort((a, b) => a.companyId.toHexString().localeCompare(b.companyId.toHexString()));
  const truncated = out.length > MAX_RECIPIENTS_PER_INQUIRY;
  return { at: new Date(), candidates: out.slice(0, MAX_RECIPIENTS_PER_INQUIRY), unmapped: Math.max(0, candidates.length - mapped), truncated, examined: candidates.length };
}

/** One recipient, committed together with the inquiry's `matchedSupplierKeys` entry. Returns what happened. */
async function addRecipient(job: JobDoc, c: NonNullable<JobDoc["frozen"]>["candidates"][number]): Promise<"created" | "exists" | "skipped" | "stopped"> {
  const { recipients } = await distributionCollections();
  const inquiries = await inquiriesCollection();
  const client = await getMongoClient();
  const session = client.startSession();
  let result: "created" | "exists" | "skipped" | "stopped" = "skipped";
  try {
    await session.withTransaction(
      async () => {
        const inquiry = await inquiries.findOne({ _id: job.inquiryId }, { session, projection: { status: 1 } });
        if (!inquiry || !isOpenForDistribution(inquiry.status)) {
          result = "stopped";
          return;
        }
        // recheck current safety/access: still active and still owning that seller
        const company = await (await supplierCompanies()).findOne({ _id: c.companyId, status: "ACTIVE", sellerKeys: c.sellerKey }, { session, projection: { _id: 1 } });
        if (!company) {
          result = "skipped";
          return;
        }
        const now = new Date();
        try {
          await recipients.insertOne({ _id: new ObjectId(), inquiryId: job.inquiryId, inquiryReference: job.inquiryReference, companyId: c.companyId, type: "MATCHED", recipientSupplierKey: c.sellerKey, matchedProductKey: c.productKey, policyVersion: job.policyVersion, reason: "Offers a listing with the same product name, category and colour.", state: "ACTIVE", status: "NEW", notice: { state: "PENDING", attempts: 0 }, createdAt: now }, { session });
        } catch (error) {
          if ((error as { code?: number }).code === 11000) {
            result = "exists";
            return;
          }
          throw error;
        }
        await inquiries.updateOne({ _id: job.inquiryId }, { $addToSet: { matchedSupplierKeys: c.sellerKey } } as never, { session });
        result = "created";
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } finally {
    await session.endSession();
  }
  return result;
}

/** Deliver the in-app notice of one recipient (after its commit; a failure leaves it PENDING for the next pass). */
export async function deliverNotice(recipientId: ObjectId): Promise<void> {
  const { recipients } = await distributionCollections();
  const r = await recipients.findOne({ _id: recipientId, "notice.state": "PENDING" });
  if (!r) return;
  const company = await (await supplierCompanies()).findOne({ _id: r.companyId, status: "ACTIVE", sellerKeys: r.recipientSupplierKey }, { projection: { ownerUserId: 1 } });
  const owner = company?.ownerUserId.toHexString();
  let state: RecipientDoc["notice"]["state"] = "PENDING";
  if (!owner) state = "NOT_RECORDED";
  else if (!(await isSupplierCategoryEnabled(owner, "inquiries"))) state = "SKIPPED_PREFERENCE";
  else {
    const dedupeKey = `lead:${r.inquiryReference}`;
    await notifySupplier(owner, { category: "inquiries", type: "LEAD_MATCHED", title: NOTICE.matched.title, body: NOTICE.matched.body, link: `/supplier/inquiries/${r.inquiryReference}`, dedupeKey });
    const there = await (await getDb()).collection("supplier_notifications").findOne({ supplierId: new ObjectId(owner), dedupeKey }, { projection: { _id: 1 } });
    if (there) state = "DONE";
  }
  const attempts = r.notice.attempts + 1;
  if (state === "PENDING" && attempts >= 3) state = "NOT_RECORDED";
  await recipients.updateOne({ _id: r._id }, { $set: { "notice.state": state, "notice.attempts": attempts } });
}

export interface RunReport {
  claimed: number;
  created: number;
  existing: number;
  skipped: number;
  stopped: number;
  noticesDelivered: number;
  jobs: { reference: string; state: DistributionState }[];
}

const clip = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 200);

/** Claim one runnable job (PENDING / PARTIAL due now, or a PROCESSING job whose lease expired). Atomic: two workers never hold the same job. */
async function claim(owner: string, now: Date): Promise<JobDoc | null> {
  const { jobs } = await distributionCollections();
  return jobs.findOneAndUpdate(
    { $or: [{ state: { $in: ["PENDING", "PARTIAL"] }, nextAttemptAt: { $lte: now } }, { state: "PROCESSING", leaseUntil: { $lt: now } }], attempts: { $lt: MAX_ATTEMPTS } },
    { $set: { state: "PROCESSING", leaseOwner: owner, leaseUntil: new Date(now.getTime() + LEASE_MS), updatedAt: now }, $inc: { attempts: 1 } },
    { sort: { nextAttemptAt: 1 }, returnDocument: "after" },
  );
}

/** Process up to `maxJobs` jobs, each for up to `maxBatches` batches (the worker's bounded unit of work). */
export async function runDistribution(opts: { maxJobs?: number; maxBatches?: number; batchSize?: number; now?: () => Date } = {}): Promise<RunReport> {
  const { jobs, recipients } = await distributionCollections();
  const now = opts.now ?? (() => new Date());
  const owner = randomUUID();
  const report: RunReport = { claimed: 0, created: 0, existing: 0, skipped: 0, stopped: 0, noticesDelivered: 0, jobs: [] };
  for (let j = 0; j < (opts.maxJobs ?? 5); j++) {
    let job = await claim(owner, now());
    if (!job) break;
    report.claimed += 1;
    const mine = { _id: job._id, leaseOwner: owner };
    try {
      if (!job.frozen) {
        const frozen = await freeze(job);
        await jobs.updateOne(mine, { $set: { frozen, updatedAt: now() } });
        job = { ...job, frozen };
      }
      const frozen = job.frozen!;
      let stopped = false;
      let hadFailure = false;
      for (let b = 0; b < (opts.maxBatches ?? 50) && job.cursor < frozen.candidates.length && !stopped && !hadFailure; b++) {
        const batch = frozen.candidates.slice(job.cursor, job.cursor + (opts.batchSize ?? BATCH_SIZE));
        let advance = batch.length;
        for (const [i, c] of batch.entries()) {
          try {
            const r = await addRecipient(job, c);
            if (r === "stopped") {
              stopped = true;
              advance = i;
              break;
            }
            if (r === "created") {
              report.created += 1;
              job.counts.created += 1;
            } else if (r === "exists") report.existing += 1;
            else {
              report.skipped += 1;
              job.counts.skipped += 1;
            }
          } catch (error) {
            // retried from this recipient on the next attempt; recipients already committed are never repeated (unique index)
            hadFailure = true;
            job.counts.failedBatches += 1;
            advance = i;
            await jobs.updateOne(mine, { $set: { lastError: clip(error) } });
            break;
          }
        }
        job = { ...job, cursor: job.cursor + advance };
        await jobs.updateOne(mine, { $set: { cursor: job.cursor, counts: job.counts, leaseUntil: new Date(now().getTime() + LEASE_MS), updatedAt: now() } });
      }
      const done = job.cursor >= frozen.candidates.length && !hadFailure && !stopped;
      let state: DistributionState = stopped ? "STOPPED" : done ? finalState({ created: job.counts.created, candidates: frozen.candidates.length, failedBatches: 0 }) : "PARTIAL";
      if (stopped) report.stopped += 1;
      // PARTIAL = retry pending with backoff after a failure; with no failure the batch budget ran out and the next pass continues at once. Out of attempts = FAILED (visible, operator retry).
      if (state === "PARTIAL" && hadFailure && job.attempts >= MAX_ATTEMPTS) state = "FAILED";
      const wait = state === "PARTIAL" && hadFailure ? backoffMs(job.attempts) : 0;
      await jobs.updateOne(mine, { $set: { state, nextAttemptAt: new Date(now().getTime() + wait), updatedAt: now() }, $unset: { leaseOwner: "", leaseUntil: "" } });
      report.jobs.push({ reference: job.inquiryReference, state });
    } catch (error) {
      await jobs.updateOne(mine, { $set: { state: job.attempts >= MAX_ATTEMPTS ? "FAILED" : "PARTIAL", lastError: clip(error), nextAttemptAt: new Date(now().getTime() + backoffMs(job.attempts)), updatedAt: now() }, $unset: { leaseOwner: "", leaseUntil: "" } });
      report.jobs.push({ reference: job.inquiryReference, state: job.attempts >= MAX_ATTEMPTS ? "FAILED" : "PARTIAL" });
    }
  }
  // notices owed (including those whose delivery was interrupted by a crash): bounded sweep
  const owed = await recipients.find({ "notice.state": "PENDING" }, { projection: { _id: 1 } }).sort({ createdAt: 1 }).limit(100).toArray();
  for (const r of owed) {
    await deliverNotice(r._id).catch(() => undefined);
    report.noticesDelivered += 1;
  }
  // notices owed for buyers' private replies (same durable-intent pattern; the worker is the one recovery path)
  report.noticesDelivered += await sweepBuyerReplyNotices().catch(() => 0);
  return report;
}

/** An operator retries a FAILED/PARTIAL job: attempts reset, runnable now. The frozen candidate list and the cursor are kept (no restart, no duplicates). */
export async function retryJob(inquiryReference: string): Promise<boolean> {
  const { jobs } = await distributionCollections();
  const r = await jobs.updateOne({ inquiryReference, state: { $in: ["FAILED", "PARTIAL"] } }, { $set: { state: "PARTIAL", attempts: 0, nextAttemptAt: new Date(), updatedAt: new Date() }, $unset: { lastError: "" } });
  return r.matchedCount === 1;
}

/** What a buyer may know about distribution: state and a count of leads recorded, never a supplier identity. */
export async function distributionStatus(inquiryId: ObjectId): Promise<{ state: DistributionState; matchedRecorded: number; truncated: boolean } | null> {
  const { jobs, recipients } = await distributionCollections();
  const job = await jobs.findOne({ inquiryId }, { projection: { state: 1, frozen: 1 } });
  if (!job) return null;
  return { state: job.state, matchedRecorded: await recipients.countDocuments({ inquiryId }), truncated: job.frozen?.truncated === true };
}
