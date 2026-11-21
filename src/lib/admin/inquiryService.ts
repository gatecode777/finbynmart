import { ObjectId, type Collection, type Document } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { inquiriesCollection, type InquiryDoc } from "@/lib/inquiries/service";
import { distributionCollections, type JobDoc } from "@/lib/leads/distribution";
import { displayAttributes } from "@/lib/catalog/attributes";
import type { ReportRange } from "@/lib/supplier/analyticsRules";
import { quotationsCollection } from "@/lib/quotations/service";
import { companyNames } from "./productManagement";
import {
  ADMIN_MAX_PAGE_SIZE, ADMIN_PAGE_SIZE, ADMIN_STATUS_GROUPS, DISTRIBUTION_FILTERS, MAX_PAGE, REFERENCE_RE, SEARCH_MAX, SOURCE_LABEL, STATUS_LABEL,
  actionPlan, distributionView, sourceCondition, sourceOf,
  type ActionState, type AdminAction, type AdminStatusGroup, type DistributionFilter, type DistributionView, type SourceFilter, type SourceKind,
} from "./inquiryRules";

/** What the signed-in admin may see inside one inquiry (each flag is one capability, read from the account on the server). */
export interface AdminInquiryCaps { requirements: boolean; recipients: boolean; responses: boolean; routing: boolean; distribution: boolean; audit: boolean }

export interface AdminInquiryRow {
  reference: string;
  source: SourceKind;
  sourceLabel: string;
  buyer: string;
  requirement: string;
  quantityText: string;
  /** The supplier the buyer chose. null for a general requirement (there is none). */
  selectedSupplier: string | null;
  /** Unique companies that hold this requirement: the selected supplier (when there is one) plus MATCHED recipients. */
  recipients: { direct: number; matched: number; total: number };
  distribution: DistributionView;
  status: string;
  statusLabel: string;
  receivedAt: string;
}

export interface AdminInquiryQuery {
  q?: string;
  /** One buyer account (canonical `buyerId`), 24 hex characters, validated by the caller. */
  buyer?: string;
  source?: SourceFilter;
  group?: AdminStatusGroup;
  dist?: DistributionFilter;
  range: ReportRange;
  page?: number;
  limit?: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let indexReady: Promise<unknown> | undefined;

async function col(): Promise<Collection<InquiryDoc>> {
  const c = await inquiriesCollection();
  // admin reads are by received date, newest first, optionally narrowed by status or source (an absent sourceType is a direct inquiry)
  indexReady ??= Promise.all([
    c.createIndex({ createdAt: -1, _id: -1 }, { name: "admin_inquiries_newest" }),
    c.createIndex({ status: 1, createdAt: -1 }, { name: "admin_inquiries_status" }),
    c.createIndex({ sourceType: 1, createdAt: -1, _id: -1 }, { name: "admin_inquiries_source" }),
  ]).catch((e) => {
    indexReady = undefined;
    throw e;
  });
  await indexReady;
  return c;
}

/**
 * Search: an inquiry reference PREFIX (the unique reference index) or a product-name PREFIX (anchored, literal, case-insensitive, and bounded by the date range: it is a scan of
 * the range, not an index lookup). Buyer names are not searchable. The text is escaped, so a regex or operator payload is just characters.
 */
export function baseMatch(q: AdminInquiryQuery): Record<string, unknown> {
  const m: Record<string, unknown> = { createdAt: { $gte: q.range.start, $lt: q.range.end } };
  const term = (q.q ?? "").trim().slice(0, SEARCH_MAX);
  if (term) {
    const re = escapeRe(term);
    m.$or = [{ reference: { $regex: `^${escapeRe(term.toUpperCase())}` } }, { productName: { $regex: `^${re}`, $options: "i" } }];
  }
  if (q.buyer && /^[a-f0-9]{24}$/.test(q.buyer)) m.buyerId = new ObjectId(q.buyer);
  return m;
}

async function buyerNames(ids: ObjectId[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const docs = await (await getDb()).collection<{ _id: ObjectId; name?: string }>("users").find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray();
  return new Map(docs.map((d) => [d._id.toHexString(), d.name ?? ""]));
}

const buyerOf = (d: InquiryDoc, names: Map<string, string>) => (d.buyerId ? names.get(d.buyerId.toHexString()) || "Registered buyer" : d.guest?.companyName || d.guest?.name || "Guest");
const quantityOf = (d: InquiryDoc) => (d.quantity ? `${d.quantity}${d.unit ? ` ${d.unit}` : ""}` : "");

type JobLite = Pick<JobDoc, "state" | "lastError"> & { inquiryId: ObjectId };

export function rowOf(d: InquiryDoc, names: Map<string, string>, job: JobLite | undefined, matched: number): AdminInquiryRow {
  const source = sourceOf(d);
  const hasDirect = source === "DIRECT" && !!d.supplierKey;
  return {
    reference: d.reference ?? "",
    source,
    sourceLabel: SOURCE_LABEL[source],
    buyer: buyerOf(d, names),
    requirement: d.productName || "General inquiry",
    quantityText: quantityOf(d),
    selectedSupplier: hasDirect ? d.supplierName || null : null,
    recipients: { direct: hasDirect ? 1 : 0, matched, total: (hasDirect ? 1 : 0) + matched },
    distribution: distributionView(job ? { state: job.state, hasError: !!job.lastError } : null),
    status: d.status,
    statusLabel: STATUS_LABEL[d.status] ?? d.status,
    receivedAt: d.createdAt.toISOString(),
  };
}

const PROJECTION = { reference: 1, buyerId: 1, guest: 1, productName: 1, quantity: 1, unit: 1, supplierKey: 1, supplierName: 1, status: 1, sourceType: 1, createdAt: 1 };

/** Batched per-page metadata: the job of each inquiry and its MATCHED recipient count (two indexed reads for the whole page, never one per row). */
async function pageMeta(ids: ObjectId[]): Promise<{ jobs: Map<string, JobLite>; matched: Map<string, number> }> {
  if (ids.length === 0) return { jobs: new Map(), matched: new Map() };
  const { jobs, recipients } = await distributionCollections();
  const [jobDocs, counts] = await Promise.all([
    jobs.find({ inquiryId: { $in: ids } }, { projection: { inquiryId: 1, state: 1, lastError: 1 } }).toArray(),
    recipients.aggregate<{ _id: ObjectId; n: number }>([{ $match: { inquiryId: { $in: ids }, state: "ACTIVE" } }, { $group: { _id: "$inquiryId", n: { $sum: 1 } } }]).toArray(),
  ]);
  return { jobs: new Map(jobDocs.map((j) => [j.inquiryId.toHexString(), j as JobLite])), matched: new Map(counts.map((c) => [c._id.toHexString(), c.n])) };
}

/** The job lookup stage (the job has a unique index on inquiryId). */
const JOB_LOOKUP = { $lookup: { from: "distribution_jobs", localField: "_id", foreignField: "inquiryId", as: "job", pipeline: [{ $project: { state: 1, lastError: 1 } }] } };
const ATTENTION_MATCH = { $or: [{ "job.state": "FAILED" }, { "job.state": "PARTIAL", "job.lastError": { $exists: true } }] };

function distMatch(dist: DistributionFilter | undefined): Document | null {
  if (!dist || dist === "all") return null;
  if (dist === "none") return { job: { $size: 0 } };
  if (dist === "attention") return ATTENTION_MATCH;
  const def = DISTRIBUTION_FILTERS.find((d) => d.key === dist);
  return def && "states" in def ? { "job.state": { $in: [...def.states] } } : null;
}

export interface AdminSummary {
  /** Counts under the search and date filters only (the source, status and distribution filters do not change them). One count per requirement. */
  groups: Record<AdminStatusGroup, number>;
  sources: { direct: number; general: number };
  attention: number;
}

export interface AdminInquiryList {
  items: AdminInquiryRow[];
  summary: AdminSummary;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function listAdminInquiries(q: AdminInquiryQuery): Promise<AdminInquiryList> {
  const c = await col();
  const base = baseMatch(q);
  const page = Math.max(1, Math.min(MAX_PAGE, Math.floor(q.page ?? 1)));
  const limit = Math.min(ADMIN_MAX_PAGE_SIZE, Math.max(1, Math.floor(q.limit ?? ADMIN_PAGE_SIZE)));

  const def = ADMIN_STATUS_GROUPS.find((g) => g.key === q.group);
  const src = sourceCondition(q.source ?? "all");
  const match: Record<string, unknown> = { ...base, ...(src ?? {}), ...(def?.statuses ? { status: { $in: [...def.statuses] } } : {}) };
  const dm = distMatch(q.dist);

  // counts: one grouped read (status x source) and one job-joined read for "needs attention", both under the search and date filters
  const [grouped, attentionRow] = await Promise.all([
    c.aggregate<{ _id: { s: string; g?: string }; n: number }>([{ $match: base as never }, { $group: { _id: { s: "$status", g: "$sourceType" }, n: { $sum: 1 } } }]).toArray(),
    c.aggregate<{ n: number }>([{ $match: base as never }, JOB_LOOKUP, { $match: ATTENTION_MATCH }, { $count: "n" }]).toArray(),
  ]);
  const groups = { all: 0, awaiting: 0, active: 0, ended: 0 } as Record<AdminStatusGroup, number>;
  const sources = { direct: 0, general: 0 };
  for (const g of grouped) {
    groups.all += g.n;
    if (g._id.g === "GENERAL_REQUIREMENT") sources.general += g.n;
    else sources.direct += g.n;
    for (const d of ADMIN_STATUS_GROUPS) if (d.statuses && (d.statuses as readonly string[]).includes(g._id.s)) groups[d.key] += g.n;
  }
  const summary: AdminSummary = { groups, sources, attention: attentionRow[0]?.n ?? 0 };

  let docs: InquiryDoc[];
  let total: number;
  if (dm) {
    // distribution filter: the job lives in its own collection, so the page is read through a join; the match + sort run first on the inquiry index, then the lookup
    const pipeline: Document[] = [{ $match: match }, { $sort: { createdAt: -1, _id: -1 } }, JOB_LOOKUP, { $match: dm }];
    const [rows, count] = await Promise.all([
      c.aggregate<InquiryDoc>([...pipeline, { $skip: (page - 1) * limit }, { $limit: limit }, { $project: PROJECTION }]).toArray(),
      c.aggregate<{ n: number }>([...pipeline, { $count: "n" }]).toArray(),
    ]);
    docs = rows;
    total = count[0]?.n ?? 0;
  } else {
    [docs, total] = await Promise.all([
      c.find(match as never, { projection: PROJECTION }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      c.countDocuments(match as never),
    ]);
  }
  const [names, meta] = await Promise.all([buyerNames(docs.flatMap((d) => (d.buyerId ? [d.buyerId] : []))), pageMeta(docs.map((d) => d._id as ObjectId))]);
  const items = docs.map((d) => rowOf(d, names, meta.jobs.get((d._id as ObjectId).toHexString()), meta.matched.get((d._id as ObjectId).toHexString()) ?? 0));
  return { items, summary, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

// ---------------------------------------------------------------- detail
export interface AdminJobView extends DistributionView {
  counts: { created: number; skipped: number; failedBatches: number };
  candidates: number | null;
  truncated: boolean;
  attempts: number;
  /** A worker error was recorded (the error text itself is internal and never returned). */
  hasError: boolean;
  /** The revision an administrative pause / resume / retry must carry. */
  rev: number;
  pause: { at: string; reason: string } | null;
}

export interface AdminInquiryDetail {
  reference: string;
  source: SourceKind;
  sourceLabel: string;
  status: string;
  statusLabel: string;
  receivedAt: string;
  buyer: string;
  requirement: string;
  category: string | null;
  quantityText: string;
  selectedSupplier: string | null;
  /** null = the viewer may not read requirement content (not the same as "none written"). */
  requirementDetail: { specifications: { label: string; value: string }[]; message: string; delivery: string | null; requiredBy: string | null } | null;
  distribution: AdminJobView | null;
  /** The buyer-visible lifecycle history (separate from the restricted administrative log in the Activity tab). */
  history: { to: string; actor: string; at: string }[];
  /** null = the viewer may not read responses (not the same as "none yet"). */
  responses: { type: string; author: string; company: string; sender: string; body: string; at: string }[] | null;
  /** Read-only summaries of sent quotation versions (current version per lineage; no amounts, no draft). null = not permitted. */
  quotations: { reference: string; version: number; status: string; company: string; sentAt: string; validUntil: string }[] | null;
  capabilities: AdminInquiryCaps;
  actions: Record<AdminAction, ActionState>;
}

export function jobView(job: JobDoc | null): AdminJobView | null {
  if (!job) return null;
  const base = distributionView({ state: job.state, hasError: !!job.lastError });
  return { ...base, counts: job.counts, candidates: job.frozen ? job.frozen.candidates.length : null, truncated: job.frozen?.truncated === true, attempts: job.attempts, hasError: !!job.lastError, rev: job.adminRev ?? 0, pause: job.pause ? { at: job.pause.at.toISOString(), reason: job.pause.reason } : null };
}

export async function getAdminInquiry(reference: string, caps: AdminInquiryCaps): Promise<AdminInquiryDetail | null> {
  if (!REFERENCE_RE.test(reference)) return null;
  const d = await (await col()).findOne({ reference });
  if (!d || !d._id) return null;
  const { jobs } = await distributionCollections();
  const [names, job] = await Promise.all([buyerNames(d.buyerId ? [d.buyerId] : []), jobs.findOne({ inquiryId: d._id })]);
  const source = sourceOf(d);
  const hasDirect = source === "DIRECT" && !!d.supplierKey;

  let responses: AdminInquiryDetail["responses"] = null;
  if (caps.responses) {
    const msgs = await (await getDb())
      .collection("inquiry_messages")
      .find({ inquiryId: d._id }, { projection: { type: 1, body: 1, authorName: 1, createdAt: 1, sender: 1, supplierCompanyId: 1 } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .toArray();
    const cn = await companyNames([...new Set(msgs.flatMap((m) => (m.supplierCompanyId instanceof ObjectId ? [m.supplierCompanyId.toHexString()] : [])))].map((h) => new ObjectId(h)));
    responses = msgs.map((m) => ({ type: String(m.type), author: String(m.authorName ?? "Supplier"), company: m.supplierCompanyId instanceof ObjectId ? cn.get(m.supplierCompanyId.toHexString()) ?? "Company not available" : "", sender: m.sender === "BUYER" ? "Buyer" : "Supplier", body: String(m.body ?? ""), at: (m.createdAt as Date).toISOString() })).reverse();
  }

  let quotations: AdminInquiryDetail["quotations"] = null;
  if (caps.responses) {
    const qs = await (await quotationsCollection()).find({ inquiryId: d._id, isCurrent: true, status: { $ne: "DRAFT" } }, { projection: { reference: 1, version: 1, status: 1, supplierKey: 1, sentAt: 1, validUntil: 1 } }).sort({ sentAt: -1 }).limit(50).toArray();
    const { recipients } = await distributionCollections();
    const rec = await recipients.find({ inquiryId: d._id }, { projection: { recipientSupplierKey: 1, companyId: 1 } }).toArray();
    const cn = await companyNames(rec.map((r) => r.companyId));
    const byKey = new Map(rec.map((r) => [r.recipientSupplierKey, cn.get(r.companyId.toHexString()) ?? "Company not available"]));
    quotations = qs.map((x) => ({ reference: x.reference, version: x.version, status: x.status, company: x.supplierKey === d.supplierKey ? d.supplierName || "Selected supplier" : byKey.get(x.supplierKey) ?? "Company not available", sentAt: x.sentAt.toISOString(), validUntil: x.validUntil.toISOString() }));
  }

  const view = jobView(job);
  const row = rowOf(d, names, job ?? undefined, 0);
  return {
    reference,
    source,
    sourceLabel: SOURCE_LABEL[source],
    status: d.status,
    statusLabel: row.statusLabel,
    receivedAt: row.receivedAt,
    buyer: row.buyer,
    requirement: row.requirement,
    category: d.categoryName ?? null,
    quantityText: row.quantityText,
    selectedSupplier: hasDirect ? d.supplierName || null : null,
    requirementDetail: caps.requirements
      ? {
          specifications: d.requirement ? displayAttributes(d.requirement.nodeId, d.requirement.attributes as never).map(({ label, value }) => ({ label, value })) : [],
          message: d.message ?? "",
          delivery: d.deliveryLocation?.text ?? null,
          requiredBy: d.requiredBy ? d.requiredBy.toISOString() : null,
        }
      : null,
    distribution: view,
    history: (d.statusHistory ?? []).map((h) => ({ to: STATUS_LABEL[h.to] ?? h.to, actor: h.actor, at: h.at.toISOString() })),
    responses,
    quotations,
    capabilities: caps,
    actions: actionPlan({ inquiryStatus: d.status, jobState: job?.state ?? null, hasError: !!job?.lastError, caps: { routing: caps.routing, distribution: caps.distribution } }),
  };
}

/** Bounded export rows for the same filters; no message text, no contact data. Needs the same per-page metadata as the list (read in blocks of the cap). */
export async function exportAdminInquiries(q: AdminInquiryQuery, max: number): Promise<{ rows: AdminInquiryRow[]; truncated: boolean }> {
  const c = await col();
  const def = ADMIN_STATUS_GROUPS.find((g) => g.key === q.group);
  const src = sourceCondition(q.source ?? "all");
  const match: Record<string, unknown> = { ...baseMatch(q), ...(src ?? {}), ...(def?.statuses ? { status: { $in: [...def.statuses] } } : {}) };
  const dm = distMatch(q.dist);
  const docs: InquiryDoc[] = dm
    ? await c.aggregate<InquiryDoc>([{ $match: match }, { $sort: { createdAt: -1, _id: -1 } }, JOB_LOOKUP, { $match: dm }, { $limit: max + 1 }, { $project: PROJECTION }]).toArray()
    : await c.find(match as never, { projection: PROJECTION }).sort({ createdAt: -1, _id: -1 }).limit(max + 1).toArray();
  const slice = docs.slice(0, max);
  const [names, meta] = await Promise.all([buyerNames(slice.flatMap((d) => (d.buyerId ? [d.buyerId] : []))), pageMeta(slice.map((d) => d._id as ObjectId))]);
  return { truncated: docs.length > max, rows: slice.map((d) => rowOf(d, names, meta.jobs.get((d._id as ObjectId).toHexString()), meta.matched.get((d._id as ObjectId).toHexString()) ?? 0)) };
}
