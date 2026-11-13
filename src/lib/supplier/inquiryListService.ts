import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { inquiriesCollection } from "@/lib/inquiries/service";
import type { SupplierContext } from "./company";
import { SUPPLIER_INQUIRY_LABEL } from "./dashboardRules";
import { distributionCollections } from "@/lib/leads/distribution";
import { INBOX_MAX, INBOX_PAGE, INBOX_TABS, type InboxKind, type InboxTab } from "./inquiryInboxRules";

export interface InboxRow {
  reference: string;
  buyer: string;
  guest: boolean;
  product: string;
  quantityText: string;
  status: string;
  statusLabel: string;
  receivedAt: string;
  /** The buyer-entered delivery location (city / region text), when given. */
  location: string | null;
  kind: "DIRECT" | "MATCHED";
}
export interface InboxResult {
  noSellers: boolean;
  items: InboxRow[];
  counts: Record<InboxTab, number>;
  meta: { page: number; limit: number; total: number; totalPages: number };
  /** Leads received through automatic matching (all statuses), for the tab label. */
  matchedTotal: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const locationOf = (l?: { text?: string }): string | null => (l?.text ? l.text.replace(/\s+/g, " ").trim().slice(0, 80) || null : null);
const label = (s: string) => (SUPPLIER_INQUIRY_LABEL as Record<string, string>)[s] ?? (s.toLowerCase() === "new" ? "New" : s);

/**
 * Every inquiry addressed to the signed-in company's sellers, guests and closed ones included: this is the inbox, not the quotation picker.
 * Scope is `supplierKey ∈ company.sellerKeys` from the session. Buyers are shown by business name only (no e-mail, phone or address). Counts come
 * from one grouped read under the search, not under the tab. Quotation eligibility is a separate fact and is not computed here.
 */
export async function listSupplierInbox(ctx: SupplierContext, q: { q?: string; tab?: string; page?: number; limit?: number; kind?: string }): Promise<InboxResult> {
  const kind: InboxKind = q.kind === "matched" ? "matched" : q.kind === "direct" ? "direct" : "all";
  const empty: InboxResult = { matchedTotal: 0, noSellers: true, items: [], counts: { all: 0, new: 0, active: 0, closed: 0 }, meta: { page: 1, limit: INBOX_PAGE, total: 0, totalPages: 1 } };
  const keys = ctx.company.sellerKeys;
  if (keys.length === 0) return empty;
  const c = await inquiriesCollection();
  const { recipients } = await distributionCollections();
  const matchedTotal = await recipients.countDocuments({ companyId: ctx.companyId, state: "ACTIVE" });
  if (kind === "matched") return { ...(await listMatched(ctx, q)), matchedTotal };
  if (kind === "all") return { ...(await listAll(ctx, q)), matchedTotal };
  const page = Math.max(1, Math.min(1000, Math.floor(q.page ?? 1)));
  const limit = Math.min(INBOX_MAX, Math.max(1, Math.floor(q.limit ?? INBOX_PAGE)));
  const base: Record<string, unknown> = { supplierKey: { $in: keys } };
  const term = (q.q ?? "").trim().slice(0, 60);
  if (term) {
    const re = escapeRe(term);
    base.$or = [{ reference: { $regex: `^${re}`, $options: "i" } }, { productName: { $regex: re, $options: "i" } }];
  }
  const grouped = await c.aggregate<{ _id: string; n: number }>([{ $match: base as never }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray();
  const counts = { all: 0, new: 0, active: 0, closed: 0 } as Record<InboxTab, number>;
  for (const g of grouped) {
    counts.all += g.n;
    for (const t of INBOX_TABS) if (t.statuses && (t.statuses as readonly string[]).includes(g._id)) counts[t.key] += g.n;
  }
  const tab = INBOX_TABS.find((t) => t.key === q.tab) ?? INBOX_TABS[0];
  const match = tab.statuses ? { ...base, status: { $in: [...tab.statuses] } } : base;
  const docs = await c
    .find(match as never, { projection: { reference: 1, buyerId: 1, guest: 1, productName: 1, quantity: 1, unit: 1, status: 1, createdAt: 1, deliveryLocation: 1 } })
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();
  const ids = [...new Set(docs.flatMap((d) => (d.buyerId ? [d.buyerId.toHexString()] : [])))].map((h) => new ObjectId(h));
  const users = ids.length ? await (await getDb()).collection<{ _id: ObjectId; companyName?: string }>("users").find({ _id: { $in: ids } }, { projection: { companyName: 1 } }).toArray() : [];
  const names = new Map(users.map((u) => [u._id.toHexString(), u.companyName?.trim() || "Individual buyer"]));
  const total = counts[tab.key];
  return {
    noSellers: false,
    matchedTotal,
    counts,
    items: docs.map((d) => ({
      reference: d.reference ?? "",
      buyer: d.buyerId ? (names.get(d.buyerId.toHexString()) ?? "Individual buyer") : d.guest?.companyName || "Guest buyer",
      guest: !d.buyerId,
      product: d.productName || "General inquiry",
      quantityText: d.quantity ? `${d.quantity}${d.unit ? ` ${d.unit}` : ""}` : "",
      status: d.status,
      statusLabel: label(d.status),
      receivedAt: d.createdAt.toISOString(),
      location: locationOf(d.deliveryLocation),
      kind: "DIRECT" as const,
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

const RECIPIENT_TAB: Record<InboxTab, string[] | null> = { all: null, new: ["NEW"], active: ["IN_PROGRESS", "REPLIED", "QUOTED"], closed: [] };

/**
 * Matching leads of the signed-in company: its OWN recipient rows (by company id from the session), each with that recipient's own status (a buyer cancel/close
 * still shows). Buyers are business names only; the selected supplier and the other recipients are not read. One bounded aggregation, indexed by (companyId, createdAt).
 */
async function listMatched(ctx: SupplierContext, q: { q?: string; tab?: string; page?: number; limit?: number }): Promise<Omit<InboxResult, "matchedTotal">> {
  const { recipients } = await distributionCollections();
  const page = Math.max(1, Math.min(1000, Math.floor(q.page ?? 1)));
  const limit = Math.min(INBOX_MAX, Math.max(1, Math.floor(q.limit ?? INBOX_PAGE)));
  const term = (q.q ?? "").trim().slice(0, 60);
  const re = escapeRe(term);
  const CLOSED = ["CLOSED", "CANCELLED", "REJECTED"];
  const tab = INBOX_TABS.find((t) => t.key === q.tab) ?? INBOX_TABS[0];
  const rows = await recipients
    .aggregate<{ _id: unknown; inquiryReference: string; status: string; createdAt: Date; inq: { buyerId?: ObjectId; productName?: string; quantity?: number; unit?: string; status: string; deliveryLocation?: { text?: string } } }>([
      { $match: { companyId: ctx.companyId, state: "ACTIVE", ...(term ? { inquiryReference: { $regex: `^${re}`, $options: "i" } } : {}) } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $lookup: { from: "inquiries", localField: "inquiryId", foreignField: "_id", as: "inq", pipeline: [{ $project: { buyerId: 1, productName: 1, quantity: 1, unit: 1, status: 1, deliveryLocation: 1 } }] } },
      { $unwind: "$inq" },
      { $limit: 5000 },
    ])
    .toArray();
  const effective = (r: (typeof rows)[number]) => (CLOSED.includes(r.inq.status) ? r.inq.status : r.status);
  const counts = { all: 0, new: 0, active: 0, closed: 0 } as Record<InboxTab, number>;
  for (const r of rows) {
    const st = effective(r);
    counts.all += 1;
    if (CLOSED.includes(st)) counts.closed += 1;
    else if (RECIPIENT_TAB.new!.includes(st)) counts.new += 1;
    else counts.active += 1;
  }
  const inTab = rows.filter((r) => (tab.key === "all" ? true : tab.key === "closed" ? CLOSED.includes(effective(r)) : !CLOSED.includes(effective(r)) && RECIPIENT_TAB[tab.key]!.includes(effective(r))));
  const slice = inTab.slice((page - 1) * limit, page * limit);
  const ids = [...new Set(slice.flatMap((r) => (r.inq.buyerId ? [r.inq.buyerId.toHexString()] : [])))].map((h) => new ObjectId(h));
  const users = ids.length ? await (await getDb()).collection<{ _id: ObjectId; companyName?: string }>("users").find({ _id: { $in: ids } }, { projection: { companyName: 1 } }).toArray() : [];
  const names = new Map(users.map((u) => [u._id.toHexString(), u.companyName?.trim() || "Individual buyer"]));
  return {
    noSellers: false,
    counts,
    items: slice.map((r) => ({
      reference: r.inquiryReference,
      buyer: r.inq.buyerId ? (names.get(r.inq.buyerId.toHexString()) ?? "Individual buyer") : "Buyer",
      guest: false,
      product: r.inq.productName || "Requirement",
      quantityText: r.inq.quantity ? `${r.inq.quantity}${r.inq.unit ? ` ${r.inq.unit}` : ""}` : "",
      status: effective(r),
      statusLabel: label(effective(r)),
      receivedAt: r.createdAt.toISOString(),
      location: locationOf(r.inq.deliveryLocation),
      kind: "MATCHED" as const,
    })),
    meta: { page, limit, total: inTab.length, totalPages: Math.max(1, Math.ceil(inTab.length / limit)) },
  };
}

/**
 * The combined view: every inquiry addressed to the company (DIRECT) or distributed to it (MATCHED), newest first, one row per inquiry (so one company with several
 * matching products still has one lead). Matched rows show THIS company's own status. Status tabs are not offered here (their counts would mix two state models);
 * use Direct inquiries or Matching leads to filter by status. Counts: `all` is the number of rows in this view under the search.
 */
async function listAll(ctx: SupplierContext, q: { q?: string; page?: number; limit?: number }): Promise<Omit<InboxResult, "matchedTotal">> {
  const keys = ctx.company.sellerKeys;
  const c = await inquiriesCollection();
  const { recipients } = await distributionCollections();
  const page = Math.max(1, Math.min(1000, Math.floor(q.page ?? 1)));
  const limit = Math.min(INBOX_MAX, Math.max(1, Math.floor(q.limit ?? INBOX_PAGE)));
  const filter: Record<string, unknown> = { $or: [{ supplierKey: { $in: keys } }, { matchedSupplierKeys: { $in: keys } }] };
  const term = (q.q ?? "").trim().slice(0, 60);
  if (term) {
    const re = escapeRe(term);
    filter.$and = [{ $or: [{ reference: { $regex: `^${re}`, $options: "i" } }, { productName: { $regex: re, $options: "i" } }] }];
  }
  const [total, docs] = await Promise.all([
    c.countDocuments(filter as never),
    c.find(filter as never, { projection: { reference: 1, buyerId: 1, guest: 1, productName: 1, quantity: 1, unit: 1, status: 1, createdAt: 1, deliveryLocation: 1, supplierKey: 1 } }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
  ]);
  const matchedIds = docs.filter((d) => !keys.includes(d.supplierKey)).map((d) => d._id!);
  const own = matchedIds.length ? new Map((await recipients.find({ companyId: ctx.companyId, state: "ACTIVE", inquiryId: { $in: matchedIds } }, { projection: { inquiryId: 1, status: 1, createdAt: 1 } }).toArray()).map((r) => [r.inquiryId.toHexString(), r])) : new Map();
  const CLOSED = ["CLOSED", "CANCELLED", "REJECTED"];
  const ids = [...new Set(docs.flatMap((d) => (d.buyerId ? [d.buyerId.toHexString()] : [])))].map((h) => new ObjectId(h));
  const users = ids.length ? await (await getDb()).collection<{ _id: ObjectId; companyName?: string }>("users").find({ _id: { $in: ids } }, { projection: { companyName: 1 } }).toArray() : [];
  const names = new Map(users.map((u) => [u._id.toHexString(), u.companyName?.trim() || "Individual buyer"]));
  return {
    noSellers: false,
    counts: { all: total, new: 0, active: 0, closed: 0 },
    items: docs.flatMap((d) => {
      const direct = keys.includes(d.supplierKey);
      const mine = direct ? null : own.get(d._id!.toHexString());
      // a matched row without an ACTIVE recipient relationship is not this company's lead (the denormalised key is only an index hint)
      if (!direct && !mine) return [];
      const status = direct ? d.status : CLOSED.includes(d.status) ? d.status : mine.status;
      return [{
        reference: d.reference ?? "",
        buyer: d.buyerId ? (names.get(d.buyerId.toHexString()) ?? "Individual buyer") : direct ? d.guest?.companyName || "Guest buyer" : "Buyer",
        guest: direct && !d.buyerId,
        product: d.productName || "General inquiry",
        quantityText: d.quantity ? `${d.quantity}${d.unit ? ` ${d.unit}` : ""}` : "",
        status,
        statusLabel: label(status),
        receivedAt: (direct ? d.createdAt : mine.createdAt).toISOString(),
        location: locationOf(d.deliveryLocation),
        kind: direct ? ("DIRECT" as const) : ("MATCHED" as const),
      }];
    }),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
