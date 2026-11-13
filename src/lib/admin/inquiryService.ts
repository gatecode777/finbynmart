import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { inquiriesCollection, type InquiryDoc } from "@/lib/inquiries/service";
import type { ReportRange } from "@/lib/supplier/analyticsRules";
import { ADMIN_MAX_PAGE_SIZE, ADMIN_PAGE_SIZE, ADMIN_STATUS_GROUPS, STATUS_LABEL, type AdminStatusGroup } from "./inquiryRules";

export interface AdminInquiryRow {
  reference: string;
  buyer: string;
  requirement: string;
  quantityText: string;
  supplier: string;
  status: string;
  statusLabel: string;
  receivedAt: string;
}

export interface AdminInquiryQuery {
  q?: string;
  group?: AdminStatusGroup;
  range: ReportRange;
  page?: number;
  limit?: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let indexReady: Promise<unknown> | undefined;

async function col() {
  const c = await inquiriesCollection();
  // admin reads are by received date, newest first, optionally narrowed by status
  indexReady ??= Promise.all([
    c.createIndex({ createdAt: -1, _id: -1 }, { name: "admin_inquiries_newest" }),
    c.createIndex({ status: 1, createdAt: -1 }, { name: "admin_inquiries_status" }),
  ]);
  await indexReady;
  return c;
}

function baseMatch(q: AdminInquiryQuery): Record<string, unknown> {
  const m: Record<string, unknown> = { createdAt: { $gte: q.range.start, $lt: q.range.end } };
  const term = (q.q ?? "").trim().slice(0, 60);
  if (term) {
    const re = escapeRe(term);
    // reference prefix or product-name substring, matched literally; buyer names are not searchable
    m.$or = [{ reference: { $regex: `^${re}`, $options: "i" } }, { productName: { $regex: re, $options: "i" } }];
  }
  return m;
}

async function buyerNames(ids: ObjectId[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const docs = await (await getDb()).collection<{ _id: ObjectId; name?: string }>("users").find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray();
  return new Map(docs.map((d) => [d._id.toHexString(), d.name ?? ""]));
}

function rowOf(d: InquiryDoc, names: Map<string, string>): AdminInquiryRow {
  return {
    reference: d.reference ?? "",
    buyer: d.buyerId ? names.get(d.buyerId.toHexString()) || "Registered buyer" : d.guest?.companyName || d.guest?.name || "Guest",
    requirement: d.productName || "General inquiry",
    quantityText: d.quantity ? `${d.quantity}${d.unit ? ` ${d.unit}` : ""}` : "",
    supplier: d.supplierName ?? "",
    status: d.status,
    statusLabel: STATUS_LABEL[d.status] ?? d.status,
    receivedAt: d.createdAt.toISOString(),
  };
}

const PROJECTION = { reference: 1, buyerId: 1, guest: 1, productName: 1, quantity: 1, unit: 1, supplierName: 1, status: 1, createdAt: 1 };

export interface AdminInquiryList {
  items: AdminInquiryRow[];
  summary: Record<AdminStatusGroup, number>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function listAdminInquiries(q: AdminInquiryQuery): Promise<AdminInquiryList> {
  const c = await col();
  const base = baseMatch(q);
  const page = Math.max(1, Math.min(1000, Math.floor(q.page ?? 1)));
  const limit = Math.min(ADMIN_MAX_PAGE_SIZE, Math.max(1, Math.floor(q.limit ?? ADMIN_PAGE_SIZE)));

  // counts: one grouped read under the search and date filters; the status filter does not change them
  const grouped = await c.aggregate<{ _id: string; n: number }>([{ $match: base as never }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray();
  const summary = { all: 0, awaiting: 0, active: 0, ended: 0 } as Record<AdminStatusGroup, number>;
  for (const g of grouped) {
    summary.all += g.n;
    for (const def of ADMIN_STATUS_GROUPS) if (def.statuses && (def.statuses as readonly string[]).includes(g._id)) summary[def.key] += g.n;
  }

  const def = ADMIN_STATUS_GROUPS.find((g) => g.key === q.group);
  const match = def?.statuses ? { ...base, status: { $in: [...def.statuses] } } : base;
  const total = def?.statuses ? summary[def.key] : summary.all;
  const docs = await c
    .find(match as never, { projection: PROJECTION })
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();
  const names = await buyerNames(docs.flatMap((d) => (d.buyerId ? [d.buyerId] : [])));
  return { items: docs.map((d) => rowOf(d, names)), summary, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

export interface AdminInquiryDetail {
  reference: string;
  status: string;
  statusLabel: string;
  receivedAt: string;
  buyer: string;
  requirement: string;
  category: string | null;
  quantityText: string;
  message: string;
  delivery: string | null;
  supplier: string;
  history: { to: string; actor: string; at: string }[];
  /** null = the viewer may not read responses (not the same as "none yet"). */
  responses: { type: string; author: string; body: string; at: string }[] | null;
}

export async function getAdminInquiry(reference: string, canReadResponses: boolean): Promise<AdminInquiryDetail | null> {
  if (!/^FBM-INQ-[A-Z0-9]{6,12}$/.test(reference)) return null;
  const d = await (await col()).findOne({ reference });
  if (!d) return null;
  const names = await buyerNames(d.buyerId ? [d.buyerId] : []);
  let responses: AdminInquiryDetail["responses"] = null;
  if (canReadResponses) {
    const msgs = await (await getDb())
      .collection("inquiry_messages")
      .find({ inquiryId: d._id }, { projection: { type: 1, body: 1, authorName: 1, createdAt: 1 } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .toArray();
    responses = msgs.map((m) => ({ type: String(m.type), author: String(m.authorName ?? "Supplier"), body: String(m.body ?? ""), at: (m.createdAt as Date).toISOString() })).reverse();
  }
  const row = rowOf(d, names);
  return {
    reference,
    status: d.status,
    statusLabel: row.statusLabel,
    receivedAt: row.receivedAt,
    buyer: row.buyer,
    requirement: row.requirement,
    category: d.categoryName ?? null,
    quantityText: row.quantityText,
    message: d.message ?? "",
    delivery: d.deliveryLocation?.text ?? null,
    supplier: d.supplierName,
    history: (d.statusHistory ?? []).map((h) => ({ to: STATUS_LABEL[h.to] ?? h.to, actor: h.actor, at: h.at.toISOString() })),
    responses,
  };
}

/** Bounded export rows for the same filters; no message text, no contact data. */
export async function exportAdminInquiries(q: AdminInquiryQuery, max: number): Promise<{ rows: AdminInquiryRow[]; truncated: boolean }> {
  const c = await col();
  const def = ADMIN_STATUS_GROUPS.find((g) => g.key === q.group);
  const base = baseMatch(q);
  const match = def?.statuses ? { ...base, status: { $in: [...def.statuses] } } : base;
  const docs = await c.find(match as never, { projection: PROJECTION }).sort({ createdAt: -1, _id: -1 }).limit(max + 1).toArray();
  const slice = docs.slice(0, max);
  const names = await buyerNames(slice.flatMap((d) => (d.buyerId ? [d.buyerId] : [])));
  return { truncated: docs.length > max, rows: slice.map((d) => rowOf(d, names)) };
}
