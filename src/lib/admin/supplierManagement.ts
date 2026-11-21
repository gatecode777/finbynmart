import { createHash } from "node:crypto";
import { ObjectId, type Collection, type ClientSession, type Document } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { invalidateApproved } from "@/lib/catalog/approvedProducts";
import { resolveSupplier } from "@/lib/catalog/productRef";
import { getProductsCollection } from "@/lib/supplier/productService";
import { supplierCompanies, type SupplierCompanyDoc } from "@/lib/supplier/company";
import { notifySupplier } from "@/lib/supplier/notifications";
import { adminAuditLog } from "./auditLog";
import { effectiveOf } from "@/lib/verification/identity";
import type { SubmissionState } from "@/lib/verification/rules";
import { KEY_RE } from "./inquiryRules";
import {
  COMPANY_ID_RE, CODE_RE, MAX_PAGE, MAX_PAGE_SIZE, NOTICE_KEYS, NOTICE_TEXT, PAGE_SIZE, STATUS_LABEL, actionPlan, cleanReason, cleanText, refCode, validateReason,
  type ActionState, type CompanyAction, type NoticeCode, type SupplierListState,
} from "./supplierRules";

/**
 * Admin Supplier Management. The managed unit is the supplier COMPANY (`supplier_companies`): no duplicate "admin suppliers" storage exists. A company's reference is its own
 * `_id` (24 hex characters; the short code CMP-xxxxxxxx is its last 8 characters), so nothing new is stored to make it stable.
 * Scope = capability: the admin model has no organisation or category scope, so every admin with `suppliers.read` sees every company (stated in the docs, never implied otherwise).
 * Status changes are the only mutation: suspend / reactivate. They never touch verification, product moderation, seller ownership, history or any other company or role.
 */
export interface CompanyDoc extends SupplierCompanyDoc {
  /** Status revision: absent = 0; every suspend / reactivate increments it (the expected revision of the next change). */
  statusRev?: number;
  suspension?: { at: Date; by: ObjectId; reason: string; noticeCode: NoticeCode; revision: number };
  displayName?: string;
  businessType?: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface Caps { suspend: boolean; reactivate: boolean; links: boolean; contacts: boolean; audit: boolean; products: boolean; companyLinks: boolean; review: boolean }

let idx: Promise<unknown> | undefined;
async function col(): Promise<Collection<CompanyDoc>> {
  const c = (await supplierCompanies()) as unknown as Collection<CompanyDoc>;
  idx ??= Promise.all([
    c.createIndex({ updatedAt: -1, _id: -1 }, { name: "admin_suppliers_updated" }),
    c.createIndex({ status: 1, updatedAt: -1, _id: -1 }, { name: "admin_suppliers_status" }),
    c.createIndex({ createdAt: -1, _id: -1 }, { name: "admin_suppliers_created" }),
    (await adminAuditLog()).createIndex({ companyId: 1, at: -1, _id: -1 }, { name: "audit_company_newest", partialFilterExpression: { companyId: { $exists: true } } }),
  ]).catch((e) => {
    idx = undefined;
    throw e;
  });
  await idx;
  return c;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------------------------------------------------------------- list
export interface SupplierRow {
  id: string;
  code: string;
  name: string;
  businessType: string | null;
  city: string | null;
  status: "ACTIVE" | "SUSPENDED";
  statusLabel: string;
  /** Linked CATALOGUE sellers only. Zero is normal: the company's own products use its implicit company identity. */
  linkedSellers: number;
  updatedAt: string;
  revision: number;
  actions: Record<CompanyAction, ActionState>;
}

export interface SupplierList {
  items: SupplierRow[];
  /** Counts of COMPANIES (never staff accounts or seller keys), from the stored records. */
  summary: { total: number; active: number; suspended: number };
  meta: { page: number; limit: number; total: number; totalPages: number };
  facets?: { cities: string[] };
}

type Joined = CompanyDoc & { owner?: { supplier?: { businessName?: string; city?: string } } };

/** Company-level conditions (indexed): status and mapping. The name, city and reference conditions need the joined owner record and are applied after the lookup. */
export function companyMatch(s: SupplierListState): Document {
  const m: Document = {};
  if (s.status !== "all") m.status = s.status;
  if (s.mapping === "linked") m["sellerKeys.0"] = { $exists: true };
  if (s.mapping === "none") m["sellerKeys.0"] = { $exists: false };
  const term = s.q.trim();
  if (COMPANY_ID_RE.test(term.toLowerCase()) && term.length === 24) m._id = new ObjectId(term.toLowerCase());
  else if (CODE_RE.test(term.toUpperCase())) m.$expr = { $eq: [{ $substrCP: [{ $toString: "$_id" }, 16, 8] }, term.slice(4).toLowerCase()] };
  return m;
}
/** Name and city conditions on the joined record (anchored, escaped, case-insensitive prefixes; bounded by the company count). null = none. */
export function joinedMatch(s: SupplierListState): Document | null {
  const and: Document[] = [];
  const term = s.q.trim();
  const isRef = COMPANY_ID_RE.test(term.toLowerCase()) && term.length === 24 || CODE_RE.test(term.toUpperCase());
  if (term && !isRef) and.push({ name: { $regex: `^${escapeRe(term)}`, $options: "i" } });
  if (s.city) and.push({ city: { $regex: `^${escapeRe(s.city)}$`, $options: "i" } });
  return and.length ? { $and: and } : null;
}

const NAME_STAGE: Document = { $addFields: { name: { $ifNull: ["$owner.supplier.businessName", ""] }, city: { $ifNull: ["$city", { $ifNull: ["$owner.supplier.city", ""] }] } } };
const OWNER_LOOKUP: Document = { $lookup: { from: "users", localField: "ownerUserId", foreignField: "_id", as: "ownerArr", pipeline: [{ $project: { "supplier.businessName": 1, "supplier.city": 1 } }] } };
const OWNER_FLAT: Document = { $addFields: { owner: { $first: "$ownerArr" } } };

export function rowOf(d: Joined & { name?: string; city?: string }, caps: Pick<Caps, "suspend" | "reactivate">): SupplierRow {
  const name = d.name ?? d.owner?.supplier?.businessName ?? "";
  return {
    id: d._id.toHexString(),
    code: refCode(d._id.toHexString()),
    name: name || "Company name not provided",
    businessType: d.businessType ? cleanText(d.businessType, 60) : null,
    city: (d.city || d.owner?.supplier?.city || "") || null,
    status: d.status,
    statusLabel: STATUS_LABEL[d.status],
    linkedSellers: Array.isArray(d.sellerKeys) ? d.sellerKeys.length : 0,
    updatedAt: d.updatedAt.toISOString(),
    revision: d.statusRev ?? 0,
    actions: actionPlan(d.status, caps),
  };
}

const sortStage = (s: SupplierListState): Document => (s.sort === "name" ? { name: 1, _id: 1 } : s.sort === "created" ? { createdAt: -1, _id: -1 } : { updatedAt: -1, _id: -1 });

export async function listCompanies(s: SupplierListState, caps: Caps, limit = PAGE_SIZE, withFacets = false): Promise<SupplierList> {
  const c = await col();
  const page = Math.max(1, Math.min(MAX_PAGE, s.page));
  const lim = Math.min(MAX_PAGE_SIZE, Math.max(1, limit));
  const match = companyMatch(s);
  const jm = joinedMatch(s);
  const needsJoinFirst = jm !== null || s.sort === "name";
  const sort = sortStage(s);
  const collation = s.sort === "name" ? { collation: { locale: "en" } } : {};

  // with only indexed company-level filters the page is cut BEFORE the join (the join then runs for at most `limit` companies)
  const pagePipeline: Document[] = needsJoinFirst
    ? [{ $match: match }, OWNER_LOOKUP, OWNER_FLAT, NAME_STAGE, ...(jm ? [{ $match: jm }] : []), { $sort: sort }, { $skip: (page - 1) * lim }, { $limit: lim }, { $project: { ownerArr: 0 } }]
    : [{ $match: match }, { $sort: sort }, { $skip: (page - 1) * lim }, { $limit: lim }, OWNER_LOOKUP, OWNER_FLAT, NAME_STAGE, { $project: { ownerArr: 0 } }];
  const countPipeline: Document[] = needsJoinFirst ? [{ $match: match }, OWNER_LOOKUP, OWNER_FLAT, NAME_STAGE, ...(jm ? [{ $match: jm }] : []), { $count: "n" }] : [{ $match: match }, { $count: "n" }];

  const [docs, count, grouped] = await Promise.all([
    c.aggregate<Joined & { name?: string; city?: string }>(pagePipeline, collation).toArray(),
    c.aggregate<{ n: number }>(countPipeline).toArray(),
    c.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
  ]);
  const by = new Map(grouped.map((g) => [g._id, g.n]));
  const active = by.get("ACTIVE") ?? 0, suspended = by.get("SUSPENDED") ?? 0;
  const total = count[0]?.n ?? 0;
  let facets: SupplierList["facets"];
  if (withFacets) {
    const cities = (await (await getDb()).collection("users").distinct("supplier.city", { role: "supplier" })) as unknown[];
    facets = { cities: [...new Set(cities.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()))].sort((a, b) => a.localeCompare(b)).slice(0, 200) };
  }
  return { items: docs.map((d) => rowOf(d, caps)), summary: { total: grouped.reduce((a, g) => a + g.n, 0), active, suspended }, meta: { page, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim)) }, ...(facets ? { facets } : {}) };
}

// ---------------------------------------------------------------- detail
export interface SupplierDetail extends SupplierRow {
  legalNote: string;
  state: string | null;
  country: string | null;
  createdAt: string;
  verification: { label: string; note: string };
  discovery: { label: string; note: string };
  /** null = the viewer may not read seller links. */
  sellerLinks: { key: string; name: string }[] | null;
  products: { published: number; pending: number; unpublished: number } | null;
  links: { companyLinks: string | null; products: string | null; review: string | null };
  /** null = the viewer may not read restricted contact information. */
  contact: { name: string; email: string; phone: string | null } | null;
  /** Internal reason of the current suspension: only with the audit capability. */
  suspension: { at: string; reason: string } | null;
  capabilities: Pick<Caps, "links" | "contacts" | "audit">;
}

async function productCounts(companyId: ObjectId) {
  const p = await getProductsCollection();
  const [published, unpublished, pending] = await Promise.all([
    p.countDocuments({ companyId, "publication.state": "APPROVED", archivedAt: { $exists: false } } as never),
    p.countDocuments({ companyId, archivedAt: { $exists: true } } as never),
    p.countDocuments({ companyId, "draft.review.state": "PENDING" } as never),
  ]);
  return { published, pending, unpublished };
}

export async function getCompany(reference: string, caps: Caps): Promise<SupplierDetail | null> {
  if (!COMPANY_ID_RE.test(reference)) return null;
  const c = await col();
  const [d] = await c.aggregate<Joined & { name?: string; city?: string }>([{ $match: { _id: new ObjectId(reference) } }, OWNER_LOOKUP, OWNER_FLAT, NAME_STAGE, { $project: { ownerArr: 0 } }]).toArray();
  if (!d) return null;
  const row = rowOf(d, caps);
  const user = caps.contacts ? await (await getDb()).collection<{ name?: string; email?: string; supplier?: { phone?: string } }>("users").findOne({ _id: d.ownerUserId }, { projection: { name: 1, email: 1, "supplier.phone": 1 } }) : null;
  const active = d.status === "ACTIVE";
  // the company's EFFECTIVE evidence review (Page 53): a separate fact from Active/Suspended, never inferred from either
  const latest = await (await getDb()).collection<{ state: SubmissionState }>("verification_submissions").findOne({ companyId: d._id, latest: true }, { projection: { state: 1 } });
  const review = effectiveOf(d as never, d.owner ?? null, latest?.state ?? null);
  return {
    ...row,
    legalNote: "Display name from the company profile. A separate legal name is not recorded.",
    state: d.state ? cleanText(d.state, 80) : null,
    country: d.country ? cleanText(d.country, 80) : null,
    createdAt: d.createdAt.toISOString(),
    // there is NO verification workflow: the stored value is always UNVERIFIED and is shown as exactly that, never as "reviewed" or "pending"
    verification: { label: review.label, note: review.note + " Active status is a separate fact; reviews are made on the Supplier Verification page." },
    discovery: active ? { label: "Eligible", note: "Its approved products can appear publicly. Each product also needs its own approval and must not be unpublished." } : { label: "Excluded while suspended", note: "Its products and supplier page are hidden from public discovery and it takes no new inquiries or matched leads." },
    sellerLinks: caps.links ? (d.sellerKeys ?? []).slice(0, 50).map((k) => ({ key: k, name: resolveSupplier(k)?.name ?? "Catalogue seller (not in the current catalogue)" })) : null,
    products: caps.products ? await productCounts(d._id) : null,
    links: { companyLinks: caps.companyLinks ? `/admin/company-links?company=${d._id.toHexString()}` : null, products: caps.products ? `/admin/products?supplier=${d._id.toHexString()}` : null, review: caps.review ? "/admin/product-review" : null },
    contact: user ? { name: user.name ?? "", email: user.email ?? "", phone: user.supplier?.phone || null } : null,
    suspension: caps.audit && d.suspension && d.status === "SUSPENDED" ? { at: d.suspension.at.toISOString(), reason: d.suspension.reason } : null,
    capabilities: { links: caps.links, contacts: caps.contacts, audit: caps.audit },
  };
}

// ---------------------------------------------------------------- activity (read)
export interface ActivityItem { label: string; actor: string; at: string; reason: string | null; detail: string | null }
const LABEL: Record<string, string> = { SUPPLIER_COMPANY_SUSPENDED: "Company suspended", SUPPLIER_COMPANY_REACTIVATED: "Company reactivated", SELLER_LINKED: "Catalogue seller linked" };
const CURSOR_RE = /^\d{10,15}\.[a-f0-9]{24}$/;

export async function getCompanyActivity(reference: string, cursor: string | null, limit = 20): Promise<{ items: ActivityItem[]; nextCursor: string | null } | null> {
  if (!COMPANY_ID_RE.test(reference)) return null;
  const c = await col();
  if (!(await c.findOne({ _id: new ObjectId(reference) }, { projection: { _id: 1 } }))) return null;
  const lim = Math.min(50, Math.max(1, limit));
  const filter: Document = { companyId: new ObjectId(reference) };
  if (cursor && CURSOR_RE.test(cursor)) {
    const [ms, id] = cursor.split(".");
    const at = new Date(Number(ms));
    filter.$or = [{ at: { $lt: at } }, { at, _id: { $lt: new ObjectId(id) } }];
  }
  const log = await adminAuditLog();
  const rows = await log.find(filter, { projection: { action: 1, actorId: 1, at: 1, reason: 1, summary: 1, sellerName: 1 } }).sort({ at: -1, _id: -1 }).limit(lim + 1).toArray();
  const page = rows.slice(0, lim);
  const actors = await (await getDb()).collection<{ _id: ObjectId; name?: string }>("users").find({ _id: { $in: page.flatMap((r) => (r.actorId instanceof ObjectId ? [r.actorId] : [])) } }, { projection: { name: 1 } }).toArray();
  const an = new Map(actors.map((a) => [a._id.toHexString(), a.name || "Administrator"]));
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({ label: LABEL[String(r.action)] ?? String(r.action), actor: r.actorId instanceof ObjectId ? an.get(r.actorId.toHexString()) ?? "Administrator" : "Administrator", at: (r.at as Date).toISOString(), reason: typeof r.reason === "string" ? r.reason : null, detail: typeof r.summary === "string" ? r.summary : typeof r.sellerName === "string" ? r.sellerName : null })),
    nextCursor: rows.length > lim && last ? `${(last.at as Date).getTime()}.${(last._id as ObjectId).toHexString()}` : null,
  };
}

// ---------------------------------------------------------------- status change
export type OpResult = { ok: true; replay: boolean; message: string } | { ok: false; status: 404 | 409 | 422; message: string; fields?: Record<string, string> };
const fail = (status: 404 | 409 | 422, message: string, fields?: Record<string, string>): Extract<OpResult, { ok: false }> => ({ ok: false, status, message, ...(fields ? { fields } : {}) });

export interface StatusInput { reason: unknown; noticeCode?: unknown; expectedRev: unknown; idempotencyKey: unknown }

export interface StatusEvent {
  _id: ObjectId;
  dedupeKey: string;
  companyId: ObjectId;
  ownerUserId: ObjectId;
  action: CompanyAction;
  noticeCode: NoticeCode | null;
  refresh: { state: "PENDING" | "DONE"; attempts: number };
  notice: { state: "PENDING" | "DONE" | "NOT_RECORDED"; attempts: number };
  createdAt: Date;
}
let evIdx: Promise<unknown> | undefined;
export async function statusEvents(): Promise<Collection<StatusEvent>> {
  const c = (await getDb()).collection<StatusEvent>("company_status_events");
  evIdx ??= Promise.all([c.createIndex({ dedupeKey: 1 }, { unique: true, name: "company_event_dedupe" }), c.createIndex({ "refresh.state": 1, "notice.state": 1, createdAt: 1 }, { name: "company_event_pending" })]).catch((e) => {
    evIdx = undefined;
    throw e;
  });
  await evIdx;
  return c;
}

const ACTION_AUDIT = { suspend: "SUPPLIER_COMPANY_SUSPENDED", reactivate: "SUPPLIER_COMPANY_REACTIVATED" } as const;

/**
 * Suspend or reactivate ONE company. One snapshot transaction: the conditional status update (status, revision), the audit row (unique operation key + request hash) and the recovery
 * event (unique per company + revision) commit together or not at all. The change is a write to the company document, which is what makes a concurrent lead commit or inquiry submission
 * (each a write to that document too) conflict instead of slipping past. After the commit: public views are refreshed and one in-app notice is recorded; either failing leaves the stored
 * event for the worker sweep and never repeats the change. A retry with the same key and request answers the original result; the same key with another request is 409.
 */
export async function changeStatus(action: CompanyAction, adminId: ObjectId, reference: string, input: StatusInput): Promise<OpResult> {
  const reason = cleanReason(input.reason);
  const fields: Record<string, string> = {};
  const reasonError = validateReason(reason);
  if (reasonError) fields.reason = reasonError;
  const noticeCode: NoticeCode | null = action === "suspend" ? (typeof input.noticeCode === "string" && NOTICE_KEYS.includes(input.noticeCode) ? (input.noticeCode as NoticeCode) : null) : null;
  if (action === "suspend" && !noticeCode) fields.noticeCode = "Choose what the supplier is told.";
  const rev = input.expectedRev;
  if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 0) fields.expectedRev = "Reload the company and try again.";
  const key = typeof input.idempotencyKey === "string" && KEY_RE.test(input.idempotencyKey) ? input.idempotencyKey : "";
  if (!key) fields.idempotencyKey = "A request key is required. Reload the page and try again.";
  if (!COMPANY_ID_RE.test(reference)) return fail(404, "Company not found.");
  if (Object.keys(fields).length) return fail(422, "Please fix the highlighted fields.", fields);

  const operationKey = `${adminId.toHexString()}:${ACTION_AUDIT[action]}:${key}`;
  const bodyHash = createHash("sha256").update(JSON.stringify([reference, action, reason, noticeCode, rev])).digest("hex");
  const audit = await adminAuditLog();
  const replay = async (): Promise<OpResult | null> => {
    const prev = await audit.findOne({ operationKey }, { projection: { bodyHash: 1 } });
    if (!prev) return null;
    return prev.bodyHash === bodyHash ? { ok: true, replay: true, message: "This request was already applied." } : fail(409, "This request key was already used for a different request. Reload and try again.");
  };
  const again = await replay();
  if (again) return again;

  const c = await col();
  const _id = new ObjectId(reference);
  const events = await statusEvents();
  const session = (await getMongoClient()).startSession();
  let out: OpResult | undefined;
  let eventId: ObjectId | undefined;
  try {
    await session.withTransaction(
      async () => {
        out = undefined;
        eventId = undefined;
        const cur = await c.findOne({ _id }, { session });
        if (!cur) { out = fail(404, "Company not found."); return; }
        const want = action === "suspend" ? "ACTIVE" : "SUSPENDED";
        const plan = actionPlan(cur.status, { suspend: true, reactivate: true })[action];
        if (!plan.available || cur.status !== want) { out = fail(409, plan.reason ?? "The company is not in a state that allows this change. Reload to see its current status."); return; }
        if ((cur.statusRev ?? 0) !== rev) { out = fail(409, "The company changed after you opened it. Reload and review its current status."); return; }
        const now = new Date();
        const next = action === "suspend" ? "SUSPENDED" : "ACTIVE";
        const revNew = (cur.statusRev ?? 0) + 1;
        const upd = await c.updateOne(
          { _id, status: want, ...((cur.statusRev ?? 0) === 0 ? { $or: [{ statusRev: 0 }, { statusRev: { $exists: false } }] } : { statusRev: cur.statusRev }) },
          { $set: { status: next, statusRev: revNew, updatedAt: now, ...(action === "suspend" ? { suspension: { at: now, by: adminId, reason, noticeCode: noticeCode as NoticeCode, revision: revNew } } : {}) }, ...(action === "reactivate" ? { $unset: { suspension: "" } } : {}) } as never,
          { session },
        );
        if (upd.matchedCount !== 1) { out = fail(409, "The company changed while you were saving. Reload and try again."); return; }
        await audit.insertOne({ _id: new ObjectId(), action: ACTION_AUDIT[action], actorId: adminId, companyId: _id, reason, operationKey, bodyHash, before: { status: cur.status, revision: cur.statusRev ?? 0 }, after: { status: next, revision: revNew }, ...(noticeCode ? { noticeCode } : {}), summary: `${STATUS_LABEL[cur.status]} → ${STATUS_LABEL[next]}`, at: now }, { session });
        eventId = new ObjectId();
        await events.insertOne({ _id: eventId, dedupeKey: `company-status:${reference}:${revNew}`, companyId: _id, ownerUserId: cur.ownerUserId, action, noticeCode, refresh: { state: "PENDING", attempts: 0 }, notice: { state: "PENDING", attempts: 0 }, createdAt: now }, { session });
        out = { ok: true, replay: false, message: action === "suspend" ? "The company was suspended. Its records are kept and it takes no new business." : "The company was reactivated. Verification, product restrictions and history are unchanged." };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } catch (e) {
    // the unique operation key refused a second insert: a concurrent identical request committed first
    if ((e as { code?: number }).code === 11000) {
      const r = await replay();
      if (r) return r;
    }
    throw e;
  } finally {
    await session.endSession();
  }
  const result = out ?? fail(409, "Nothing was changed.");
  if (result.ok && eventId) await processStatusEvent(eventId).catch(() => undefined);
  return result;
}

export const suspendCompany = (adminId: ObjectId, reference: string, input: StatusInput) => changeStatus("suspend", adminId, reference, input);
export const reactivateCompany = (adminId: ObjectId, reference: string, input: StatusInput) => changeStatus("reactivate", adminId, reference, input);

/** The steps after the commit, driven from the stored event so a failure is recoverable: refresh the public snapshot, record one in-app notice. Idempotent per event. */
export async function processStatusEvent(id: ObjectId): Promise<void> {
  const events = await statusEvents();
  const ev = await events.findOne({ _id: id });
  if (!ev) return;
  if (ev.refresh.state === "PENDING") {
    const ok = await invalidateApproved().then(() => true, () => false);
    await events.updateOne({ _id: id }, ok ? { $set: { "refresh.state": "DONE" }, $inc: { "refresh.attempts": 1 } } : { $inc: { "refresh.attempts": 1 } });
  }
  if (ev.notice.state === "PENDING") {
    const text = ev.action === "suspend" && ev.noticeCode ? NOTICE_TEXT[ev.noticeCode] : "Your company access was restored. Your existing records are unchanged.";
    let state: StatusEvent["notice"]["state"] = "PENDING";
    try {
      await notifySupplier(ev.ownerUserId.toHexString(), { category: "account", type: ev.action === "suspend" ? "COMPANY_SUSPENDED" : "COMPANY_REACTIVATED", title: ev.action === "suspend" ? "Company access restricted" : "Company access restored", body: `${text} Open Help & Support if you have questions.`, link: "/supplier/support", dedupeKey: ev.dedupeKey });
      const there = await (await getDb()).collection("supplier_notifications").findOne({ supplierId: ev.ownerUserId, dedupeKey: ev.dedupeKey }, { projection: { _id: 1 } });
      state = there ? "DONE" : "NOT_RECORDED";
    } catch {
      state = ev.notice.attempts + 1 >= 3 ? "NOT_RECORDED" : "PENDING";
    }
    await events.updateOne({ _id: id }, { $set: { "notice.state": state }, $inc: { "notice.attempts": 1 } });
  }
}

/** Worker sweep: finishes events whose refresh or notice did not complete (bounded). */
export async function sweepStatusEvents(limit = 25): Promise<number> {
  const events = await statusEvents();
  const pending = await events.find({ $or: [{ "refresh.state": "PENDING" }, { "notice.state": "PENDING" }] }, { projection: { _id: 1 } }).sort({ createdAt: 1 }).limit(limit).toArray();
  for (const e of pending) await processStatusEvent(e._id).catch(() => undefined);
  return pending.length;
}

// ---------------------------------------------------------------- export
export async function exportCompanies(s: SupplierListState, caps: Caps, max: number): Promise<{ rows: SupplierRow[]; truncated: boolean }> {
  const c = await col();
  const match = companyMatch(s);
  const jm = joinedMatch(s);
  const pipeline: Document[] = [{ $match: match }, OWNER_LOOKUP, OWNER_FLAT, NAME_STAGE, ...(jm ? [{ $match: jm }] : []), { $sort: sortStage(s) }, { $limit: max + 1 }, { $project: { ownerArr: 0 } }];
  const docs = await c.aggregate<Joined & { name?: string; city?: string }>(pipeline, s.sort === "name" ? { collation: { locale: "en" } } : {}).toArray();
  return { truncated: docs.length > max, rows: docs.slice(0, max).map((d) => rowOf(d, caps)) };
}

export type { ClientSession };
