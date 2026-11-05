import { randomBytes } from "node:crypto";
import { ObjectId, type Collection, type Filter } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { formatSubmitted } from "@/lib/inquiries/confirmation";
import { BUSINESS_LABEL } from "@/lib/inquiries/buyerListRules";
import { INQUIRY_TYPES, normaliseStatus } from "@/lib/inquiries/rules";
import { inquiriesCollection, type InquiryDoc } from "@/lib/inquiries/service";
import { formatMoney, formatPercent, priceBreakdown, type Discount } from "./money";
import {
  COMPARE_MAX,
  COMPARE_MIN,
  DAY_MS,
  EXPIRING_DAYS,
  STATUS_LABEL,
  STATUS_TEXT,
  allowedActions,
  compatibility,
  daysLeft,
  effectiveStatus,
  escapeRegex,
  type Compatibility,
  type EffectiveStatus,
  type QuotationListQuery,
  type RevisionReason,
  type StoredStatus,
} from "./quotationRules";

/**
 * The buyer's side of quotations: read, list, compare, accept, reject, ask for a revision. This is the first quotation code in the
 * project, and it has NO way for a supplier to create one: there is no supplier workflow yet, so quotations exist only when
 * something else (a future supplier module, or a test) inserts them. Nothing here invents a quotation, a price or a supplier reply.
 *
 * Isolation: every quotation carries `buyerId` (copied from its inquiry when it was created) and ALSO belongs to an inquiry;
 * every read names the buyer from the session, and re-checks that the inquiry is that buyer's. Another buyer's reference, an unknown
 * one and a malformed one all give the same "not found". Drafts are never returned. Versions are never edited: a revision is a new
 * document and the older one becomes SUPERSEDED (done by the future supplier side; this file only reads versions).
 */
export interface QuotationDoc {
  _id?: ObjectId;
  reference: string;
  version: number;
  isCurrent: boolean;
  inquiryId: ObjectId;
  inquiryReference: string;
  buyerId: ObjectId;
  supplierKey: string;
  supplierName: string;
  supplierSlug?: string;
  productKey?: string;
  productName: string;
  productSnapshot?: { description?: string | null; specs: { label: string; value: string }[]; features: string[] };
  currency: string;
  unit: string | null;
  quantity: number;
  unitPriceMinor: number;
  discount?: Discount | null;
  tax?: { label: string; bp: number } | null;
  charges?: { label: string; minor: number }[];
  moq?: { quantity: number; unit: string } | null;
  terms?: { deliveryMinDays?: number | null; deliveryMaxDays?: number | null; deliveryLocation?: string | null; incoterms?: string | null; paymentTerms?: string | null; packaging?: string | null; warranty?: string | null; qualityTerms?: string | null; remarks?: string | null };
  attachments?: { id: string; name: string; type: string; size: number; uploadedAt?: Date }[];
  validUntil: Date;
  status: StoredStatus;
  /** true only on an accepted version: a partial unique index allows one per inquiry. */
  accepted?: true;
  sentAt: Date;
  createdAt: Date;
  updatedAt: Date;
  decision?: { type: "ACCEPTED" | "REJECTED"; at: Date; reason: string | null };
  events: { type: "SENT" | "REVISION_REQUESTED" | "ACCEPTED" | "REJECTED" | "SUPERSEDED" | "WITHDRAWN"; at: Date; actor: "supplier" | "buyer" | "system"; reason?: string; message?: string }[];
}

let indexReady: Promise<unknown> | undefined;
export async function quotationsCollection(): Promise<Collection<QuotationDoc>> {
  const col = (await getDb()).collection<QuotationDoc>("quotations");
  indexReady ??= Promise.all([
    col.createIndex({ reference: 1, version: 1 }, { unique: true, name: "quotation_version" }),
    col.createIndex({ buyerId: 1, isCurrent: 1, sentAt: -1, _id: -1 }, { name: "buyer_current_received" }),
    col.createIndex({ buyerId: 1, isCurrent: 1, status: 1, validUntil: 1 }, { name: "buyer_current_status_valid" }),
    col.createIndex({ inquiryId: 1, isCurrent: 1, sentAt: -1 }, { name: "inquiry_current" }),
    // at most one accepted quotation per inquiry, enforced by the database even for simultaneous requests
    col.createIndex({ inquiryId: 1, accepted: 1 }, { unique: true, partialFilterExpression: { accepted: true }, name: "one_accepted_per_inquiry" }),
  ]);
  await indexReady;
  return col;
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** FBM-QT-XXXXXXXX: for identification, never for access. Used by whatever creates quotations. */
export function generateQuotationReference(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % 32];
  return `FBM-QT-${out}`;
}

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "S";
const money = (minor: number, currency: string) => formatMoney(minor, currency);
const dayRange = (min?: number | null, max?: number | null) => (min && max && min !== max ? `${min} - ${max} days` : min || max ? `${min ?? max} days` : null);

function totals(doc: QuotationDoc) {
  const result = priceBreakdown({ unitPriceMinor: doc.unitPriceMinor, quantity: doc.quantity, discount: doc.discount ?? null, tax: doc.tax ?? null, charges: doc.charges ?? [] });
  return result.ok ? result.value : null;
}

function supplierOf(doc: QuotationDoc) {
  const s = getPublicSupplierBySlug(doc.supplierSlug ?? doc.supplierKey);
  return {
    name: s?.name ?? doc.supplierName,
    slug: s?.slug ?? null,
    url: s?.url ?? null,
    initials: s?.initials ?? initialsOf(doc.supplierName),
    location: s ? `${s.city}, ${s.state}` : null,
    kind: s ? [s.supplierType, s.industry].filter(Boolean).join(" · ") || null : null,
    // verified only when the supplier's own record says so
    verified: s?.verificationStatus === "verified",
    available: Boolean(s),
  };
}

function productImage(doc: QuotationDoc) {
  const product = doc.productKey ? getPublicProductByKey(doc.productKey) : undefined;
  const image = product ? (product.images.find((i) => i.primary) ?? product.images[0]) : undefined;
  return { url: product?.url ?? null, imageSrc: image?.src ?? null, imageRemote: Boolean(image?.remote) };
}

// ---------- list ----------
export interface QuotationRow {
  reference: string;
  version: number;
  inquiryReference: string;
  productName: string;
  product: { url: string | null; imageSrc: string | null; imageRemote: boolean };
  supplier: ReturnType<typeof supplierOf>;
  quantity: number;
  unit: string | null;
  unitPrice: string;
  currency: string;
  total: { text: string; taxSpecified: boolean } | null;
  sentAt: string;
  validUntil: string;
  daysLeft: number;
  status: EffectiveStatus;
  statusLabel: string;
  detailHref: string;
}

function toRow(doc: QuotationDoc, now: Date): QuotationRow {
  const t = totals(doc);
  const status = effectiveStatus(doc.status, doc.validUntil, now);
  return {
    reference: doc.reference,
    version: doc.version,
    inquiryReference: doc.inquiryReference,
    productName: doc.productName,
    product: productImage(doc),
    supplier: supplierOf(doc),
    quantity: doc.quantity,
    unit: doc.unit,
    unitPrice: money(doc.unitPriceMinor, doc.currency),
    currency: doc.currency,
    total: t ? { text: money(t.totalMinor, doc.currency), taxSpecified: t.taxSpecified } : null,
    sentAt: doc.sentAt.toISOString(),
    validUntil: doc.validUntil.toISOString(),
    daysLeft: daysLeft(doc.validUntil, now),
    status,
    statusLabel: STATUS_LABEL[status],
    detailHref: `/buyer/quotations/${doc.reference}`,
  };
}

export interface QuotationSummary {
  total: number;
  active: number;
  expiringSoon: number;
  accepted: number;
  rejected: number;
}
export type TabCounts = Record<"all" | "active" | "expiring" | "revision" | "accepted" | "rejected" | "expired", number>;

function tabFilter(tab: QuotationListQuery["status"], now: Date): Filter<QuotationDoc> | null {
  const soon = new Date(now.getTime() + EXPIRING_DAYS * DAY_MS);
  switch (tab) {
    case "all":
      return null;
    case "active":
      return { status: "SENT", validUntil: { $gt: now } };
    case "expiring":
      return { status: "SENT", validUntil: { $gt: now, $lte: soon } };
    case "revision":
      return { status: "REVISION_REQUESTED", validUntil: { $gt: now } };
    case "accepted":
      return { status: "ACCEPTED" };
    case "rejected":
      return { status: "REJECTED" };
    case "expired":
      return { status: { $in: ["SENT", "REVISION_REQUESTED"] }, validUntil: { $lte: now } };
  }
}

async function counts(buyerId: ObjectId, extra: Filter<QuotationDoc>[], now: Date): Promise<TabCounts> {
  const soon = new Date(now.getTime() + EXPIRING_DAYS * DAY_MS);
  const rows = await (await quotationsCollection())
    .aggregate<{ _id: { s: string; past: boolean; soon: boolean }; n: number }>([
      { $match: { $and: [{ buyerId, isCurrent: true, status: { $ne: "DRAFT" } }, ...extra] } },
      { $group: { _id: { s: "$status", past: { $lte: ["$validUntil", now] }, soon: { $lte: ["$validUntil", soon] } }, n: { $sum: 1 } } },
    ])
    .toArray();
  const out: TabCounts = { all: 0, active: 0, expiring: 0, revision: 0, accepted: 0, rejected: 0, expired: 0 };
  for (const { _id, n } of rows) {
    out.all += n;
    if (_id.s === "ACCEPTED") out.accepted += n;
    else if (_id.s === "REJECTED") out.rejected += n;
    else if (_id.s === "SENT" || _id.s === "REVISION_REQUESTED") {
      if (_id.past) out.expired += n;
      else if (_id.s === "REVISION_REQUESTED") out.revision += n;
      else {
        out.active += n;
        if (_id.soon) out.expiring += n;
      }
    }
  }
  return out;
}

export interface QuotationPage {
  quotations: QuotationRow[];
  tabCounts: TabCounts;
  summary: QuotationSummary;
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export async function listBuyerQuotations(buyerIdText: string, query: QuotationListQuery, now = new Date()): Promise<QuotationPage> {
  const col = await quotationsCollection();
  const buyerId = new ObjectId(buyerIdText);
  const searchFilter: Filter<QuotationDoc>[] = [];
  if (query.q) {
    const text = escapeRegex(query.q);
    searchFilter.push({ $or: [{ reference: { $regex: `^${text}`, $options: "i" } }, { inquiryReference: { $regex: `^${text}`, $options: "i" } }, { productName: { $regex: text, $options: "i" } }, { supplierName: { $regex: text, $options: "i" } }] });
  }
  const tab = tabFilter(query.status, now);
  const filter: Filter<QuotationDoc> = { $and: [{ buyerId, isCurrent: true, status: { $ne: "DRAFT" } }, ...searchFilter, ...(tab ? [tab] : [])] };
  const sort = query.sort === "oldest" ? { sentAt: 1, _id: 1 } : query.sort === "valid" ? { validUntil: 1, _id: 1 } : { sentAt: -1, _id: -1 };
  const [docs, total, tabCounts, all] = await Promise.all([
    col.find(filter).sort(sort as never).skip((query.page - 1) * query.limit).limit(query.limit).toArray(),
    col.countDocuments(filter),
    counts(buyerId, searchFilter, now),
    counts(buyerId, [], now),
  ]);
  return {
    quotations: docs.map((d) => toRow(d, now)),
    tabCounts,
    summary: { total: all.all, active: all.active, expiringSoon: all.expiring, accepted: all.accepted, rejected: all.rejected },
    meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
  };
}

// ---------- detail ----------
async function inquiryOf(doc: QuotationDoc): Promise<InquiryDoc | null> {
  // ownership through the parent inquiry: the quotation is only reachable when its inquiry is this buyer's
  return (await inquiriesCollection()).findOne({ _id: doc.inquiryId, buyerId: doc.buyerId });
}

const row = (label: string, value: string | null) => ({ label, value });

function termsRows(doc: QuotationDoc) {
  const t = doc.terms ?? {};
  return [
    row("Minimum Order Quantity", doc.moq ? `${doc.moq.quantity.toLocaleString("en-IN")} ${doc.moq.unit}` : null),
    row("Offered Quantity", `${doc.quantity.toLocaleString("en-IN")}${doc.unit ? ` ${doc.unit}` : ""}`),
    row("Delivery Timeline", dayRange(t.deliveryMinDays, t.deliveryMaxDays)),
    row("Delivery Location", t.deliveryLocation ?? null),
    row("Incoterms", t.incoterms ?? null),
    row("Payment Terms", t.paymentTerms ?? null),
    row("Packaging", t.packaging ?? null),
    row("Warranty", t.warranty ?? null),
    row("Quality Terms", t.qualityTerms ?? null),
    row("Remarks", t.remarks ?? null),
  ];
}

function breakdownRows(doc: QuotationDoc) {
  const t = totals(doc);
  if (!t) return { error: "The saved amounts could not be calculated.", rows: [] as { label: string; value: string; strong?: boolean }[] };
  const m = (n: number) => money(n, doc.currency);
  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: "Unit Price", value: `${m(doc.unitPriceMinor)}${doc.unit ? ` / ${doc.unit}` : ""}` },
    { label: "Offered Quantity", value: `${doc.quantity.toLocaleString("en-IN")}${doc.unit ? ` ${doc.unit}` : ""}` },
    { label: "Subtotal", value: m(t.subtotalMinor) },
  ];
  rows.push({ label: doc.discount?.kind === "PERCENT" ? `Discount (${formatPercent(doc.discount.bp)})` : "Discount", value: doc.discount ? `- ${m(t.discountMinor)}` : "Not specified" });
  if (doc.discount) rows.push({ label: "Taxable Amount", value: m(t.taxableMinor) });
  rows.push({ label: doc.tax ? `${doc.tax.label} (${formatPercent(doc.tax.bp)})` : "Tax", value: t.taxMinor === null ? "Not specified" : m(t.taxMinor) });
  for (const c of doc.charges ?? []) rows.push({ label: c.label, value: m(c.minor) });
  rows.push({ label: t.taxSpecified ? "Total Amount" : "Total before tax (no tax stated)", value: m(t.totalMinor), strong: true });
  return { error: null, rows };
}

export interface QuotationDetail {
  quotation: {
    reference: string;
    version: number;
    isCurrent: boolean;
    status: EffectiveStatus;
    statusLabel: string;
    statusText: string;
    sentAt: string;
    sentLabel: string;
    validUntil: string;
    validLabel: string;
    daysLeft: number;
    currency: string;
    quantity: number;
    unit: string | null;
    unitPrice: string;
    total: { text: string; taxSpecified: boolean } | null;
    productName: string;
    product: { url: string | null; imageSrc: string | null; imageRemote: boolean };
    delivery: string | null;
  };
  supplier: ReturnType<typeof supplierOf>;
  inquiry: { reference: string; type: string; typeLabel: string; status: string; statusLabel: string; quantity: number; unit: string | null; deliveryLocation: string | null; href: string };
  productSnapshot: { description: string | null; specs: { label: string; value: string }[]; features: string[] };
  priceBreakdown: { error: string | null; rows: { label: string; value: string; strong?: boolean }[] };
  commercialTerms: { label: string; value: string | null }[];
  attachments: { id: string; name: string; type: string; size: number }[];
  versions: { version: number; isCurrent: boolean; status: EffectiveStatus; statusLabel: string; sentLabel: string; unitPrice: string; total: string | null; validLabel: string; changes: string[]; href: string }[];
  events: { type: string; label: string; atLabel: string; detail: string | null }[];
  timeline: { key: string; title: string; text: string; state: "done" | "upcoming"; atLabel: string | null }[];
  related: { reference: string; supplierName: string; unitPrice: string; statusLabel: string; href: string }[];
  decision: { type: "ACCEPTED" | "REJECTED"; atLabel: string; reason: string | null } | null;
  pendingRevision: { reason: string; message: string; atLabel: string } | null;
  capabilities: { accept: boolean; reject: boolean; requestRevision: boolean; messageSupplier: false; attachmentsDownload: false; order: false; print: true; compare: boolean };
}

const REVISION_LABEL: Record<string, string> = { PRICE: "Price negotiation", QUANTITY: "Quantity changes", DELIVERY: "Delivery timeline", PAYMENT: "Payment terms", SPECIFICATIONS: "Product specifications", OTHER: "Other" };

function changesBetween(older: QuotationDoc, newer: QuotationDoc): string[] {
  const out: string[] = [];
  if (older.unitPriceMinor !== newer.unitPriceMinor || older.currency !== newer.currency) out.push("Unit price");
  if (older.quantity !== newer.quantity || older.unit !== newer.unit) out.push("Quantity");
  if (JSON.stringify(older.discount ?? null) !== JSON.stringify(newer.discount ?? null)) out.push("Discount");
  if (JSON.stringify(older.tax ?? null) !== JSON.stringify(newer.tax ?? null)) out.push("Tax");
  if (JSON.stringify(older.charges ?? []) !== JSON.stringify(newer.charges ?? [])) out.push("Charges");
  if (older.validUntil.getTime() !== newer.validUntil.getTime()) out.push("Validity");
  const a = older.terms ?? {};
  const b = newer.terms ?? {};
  if (a.deliveryMinDays !== b.deliveryMinDays || a.deliveryMaxDays !== b.deliveryMaxDays) out.push("Delivery timeline");
  if ((a.paymentTerms ?? null) !== (b.paymentTerms ?? null)) out.push("Payment terms");
  if ((a.packaging ?? null) !== (b.packaging ?? null) || (a.warranty ?? null) !== (b.warranty ?? null)) out.push("Packaging or warranty");
  return out;
}

const MAX_VERSIONS = 20;

/** By reference; the current version unless `version` names an earlier one. null for anything the buyer may not see. */
export async function getBuyerQuotationDetail(buyerIdText: string, reference: string, version?: number, now = new Date()): Promise<QuotationDetail | null> {
  const col = await quotationsCollection();
  const buyerId = new ObjectId(buyerIdText);
  const versions = await col.find({ reference, buyerId, status: { $ne: "DRAFT" } }).sort({ version: -1 }).limit(MAX_VERSIONS).toArray();
  if (versions.length === 0) return null;
  const doc = version === undefined ? (versions.find((v) => v.isCurrent) ?? versions[0]) : versions.find((v) => v.version === version);
  if (!doc) return null;
  const inquiry = await inquiryOf(doc);
  if (!inquiry) return null;

  const status = effectiveStatus(doc.status, doc.validUntil, now);
  const otherAccepted = Boolean(await col.findOne({ inquiryId: doc.inquiryId, accepted: true, reference: { $ne: doc.reference } }, { projection: { _id: 1 } }));
  const actions = allowedActions(status, doc.isCurrent, otherAccepted);
  const t = totals(doc);
  const type = inquiry.inquiryType ?? (inquiry.type === "inquiry" ? (inquiry.productKey ? "PRODUCT_INQUIRY" : "GENERAL_INQUIRY") : "GET_BEST_QUOTE");
  const inquiryStatus = normaliseStatus(inquiry.status);
  const snapshot = doc.productSnapshot ?? { description: null, specs: [], features: [] };

  const relatedDocs = await col.find({ inquiryId: doc.inquiryId, buyerId, isCurrent: true, reference: { $ne: doc.reference }, status: { $ne: "DRAFT" } }).sort({ sentAt: -1 }).limit(3).toArray();
  const first = versions.at(-1)!;
  const pending = [...doc.events].reverse().find((e) => e.type === "REVISION_REQUESTED");
  const ordered = [...versions].reverse();

  return {
    quotation: {
      reference: doc.reference,
      version: doc.version,
      isCurrent: doc.isCurrent,
      status,
      statusLabel: STATUS_LABEL[status],
      statusText: STATUS_TEXT[status],
      sentAt: doc.sentAt.toISOString(),
      sentLabel: formatSubmitted(doc.sentAt.toISOString()),
      validUntil: doc.validUntil.toISOString(),
      validLabel: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(doc.validUntil),
      daysLeft: daysLeft(doc.validUntil, now),
      currency: doc.currency,
      quantity: doc.quantity,
      unit: doc.unit,
      unitPrice: money(doc.unitPriceMinor, doc.currency),
      total: t ? { text: money(t.totalMinor, doc.currency), taxSpecified: t.taxSpecified } : null,
      productName: doc.productName,
      product: productImage(doc),
      delivery: dayRange(doc.terms?.deliveryMinDays, doc.terms?.deliveryMaxDays),
    },
    supplier: supplierOf(doc),
    inquiry: { reference: doc.inquiryReference, type, typeLabel: INQUIRY_TYPES.find((i) => i.value === type)?.label ?? "Inquiry", status: inquiryStatus, statusLabel: BUSINESS_LABEL[inquiryStatus], quantity: inquiry.quantity, unit: inquiry.unit ?? null, deliveryLocation: inquiry.deliveryLocation?.text ?? null, href: `/buyer/inquiries/${doc.inquiryReference}` },
    productSnapshot: { description: snapshot.description ?? null, specs: snapshot.specs ?? [], features: snapshot.features ?? [] },
    priceBreakdown: breakdownRows(doc),
    commercialTerms: termsRows(doc),
    attachments: (doc.attachments ?? []).map((a) => ({ id: a.id, name: a.name, type: a.type, size: a.size })),
    versions: versions.map((v) => {
      const older = ordered[ordered.findIndex((o) => o.version === v.version) - 1];
      const vs = effectiveStatus(v.status, v.validUntil, now);
      const vt = totals(v);
      return { version: v.version, isCurrent: v.isCurrent, status: vs, statusLabel: STATUS_LABEL[vs], sentLabel: formatSubmitted(v.sentAt.toISOString()), unitPrice: money(v.unitPriceMinor, v.currency), total: vt ? money(vt.totalMinor, v.currency) : null, validLabel: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(v.validUntil), changes: older ? changesBetween(older, v) : [], href: `/buyer/quotations/${v.reference}?version=${v.version}` };
    }),
    events: doc.events.map((e) => ({ type: e.type, label: e.type === "SENT" ? "Quotation received" : e.type === "REVISION_REQUESTED" ? "Revision requested by you" : e.type === "ACCEPTED" ? "Accepted by you" : e.type === "REJECTED" ? "Rejected by you" : e.type === "SUPERSEDED" ? "Replaced by a newer version" : "Withdrawn by the supplier", atLabel: formatSubmitted(e.at.toISOString()), detail: e.type === "REVISION_REQUESTED" ? [REVISION_LABEL[e.reason ?? ""] ?? e.reason, e.message].filter(Boolean).join(": ") : (e.reason ?? null) })),
    timeline: [
      { key: "inquiry", title: "Inquiry Submitted", text: `Inquiry ${doc.inquiryReference} was saved.`, state: "done", atLabel: formatSubmitted(inquiry.createdAt.toISOString()) },
      { key: "quotation", title: "Quotation Received", text: `Quotation ${doc.reference} (version 1) was received.`, state: "done", atLabel: formatSubmitted(first.sentAt.toISOString()) },
      doc.decision ? { key: "decision", title: doc.decision.type === "ACCEPTED" ? "You Accepted" : "You Rejected", text: doc.decision.type === "ACCEPTED" ? "Your decision was recorded. Order processing is not available yet." : "Your decision was recorded.", state: "done", atLabel: formatSubmitted(doc.decision.at.toISOString()) } : { key: "decision", title: "Buyer Decision", text: "No decision yet.", state: "upcoming", atLabel: null },
    ],
    related: relatedDocs.map((r) => ({ reference: r.reference, supplierName: r.supplierName, unitPrice: `${money(r.unitPriceMinor, r.currency)}${r.unit ? ` / ${r.unit}` : ""}`, statusLabel: STATUS_LABEL[effectiveStatus(r.status, r.validUntil, now)], href: `/buyer/quotations/${r.reference}` })),
    decision: doc.decision ? { type: doc.decision.type, atLabel: formatSubmitted(doc.decision.at.toISOString()), reason: doc.decision.reason } : null,
    pendingRevision: doc.status === "REVISION_REQUESTED" && pending ? { reason: REVISION_LABEL[pending.reason ?? ""] ?? pending.reason ?? "", message: pending.message ?? "", atLabel: formatSubmitted(pending.at.toISOString()) } : null,
    capabilities: { ...actions, messageSupplier: false, attachmentsDownload: false, order: false, print: true, compare: relatedDocs.length > 0 },
  };
}

// ---------- decisions ----------
export type DecisionOutcome =
  | { ok: true; status: EffectiveStatus; statusLabel: string; supplierNotified: false }
  | { ok: false; code: "NOT_FOUND" | "STALE" | "NOT_ALLOWED" | "ALREADY_ACCEPTED"; message: string };

async function loadCurrent(buyerId: ObjectId, reference: string): Promise<QuotationDoc | null> {
  const doc = await (await quotationsCollection()).findOne({ reference, buyerId, isCurrent: true, status: { $ne: "DRAFT" } });
  if (!doc || !(await inquiryOf(doc))) return null;
  return doc;
}

const NOT_ALLOWED: Partial<Record<EffectiveStatus, string>> = {
  EXPIRED: "This quotation has expired and can no longer be decided.",
  ACCEPTED: "This quotation was already accepted.",
  REJECTED: "This quotation was already rejected.",
  WITHDRAWN: "The supplier withdrew this quotation.",
  SUPERSEDED: "A newer version of this quotation exists.",
  REVISION_REQUESTED: "A revision is already requested for this quotation.",
};

export async function decideQuotation(buyerIdText: string, reference: string, kind: "accept" | "reject", input: { version: number; reason: string | null }, now = new Date()): Promise<DecisionOutcome> {
  const col = await quotationsCollection();
  const buyerId = new ObjectId(buyerIdText);
  const doc = await loadCurrent(buyerId, reference);
  if (!doc) return { ok: false, code: "NOT_FOUND", message: "That quotation was not found." };
  if (doc.version !== input.version) return { ok: false, code: "STALE", message: "A newer version of this quotation exists. Reload the page to see it before deciding." };
  const status = effectiveStatus(doc.status, doc.validUntil, now);
  const otherAccepted = Boolean(await col.findOne({ inquiryId: doc.inquiryId, accepted: true, reference: { $ne: doc.reference } }, { projection: { _id: 1 } }));
  const actions = allowedActions(status, true, otherAccepted);
  if (kind === "accept" && !actions.accept) return otherAccepted && (status === "ACTIVE" || status === "EXPIRING_SOON") ? { ok: false, code: "ALREADY_ACCEPTED", message: "Another quotation for this inquiry is already accepted." } : { ok: false, code: "NOT_ALLOWED", message: NOT_ALLOWED[status] ?? "This quotation cannot be accepted now." };
  if (kind === "reject" && !actions.reject) return { ok: false, code: "NOT_ALLOWED", message: NOT_ALLOWED[status] ?? "This quotation cannot be rejected now." };

  const type = (kind === "accept" ? "ACCEPTED" : "REJECTED") as "ACCEPTED" | "REJECTED";
  try {
    const updated = await col.findOneAndUpdate(
      // the exact version, still open, still valid: re-checked inside the update, so simultaneous requests cannot both win
      { _id: doc._id, buyerId, isCurrent: true, version: doc.version, status: kind === "accept" ? "SENT" : { $in: ["SENT", "REVISION_REQUESTED"] }, validUntil: { $gt: now } },
      { $set: { status: type, decision: { type, at: now, reason: input.reason }, updatedAt: now, ...(kind === "accept" ? { accepted: true as const } : {}) }, $push: { events: { type, at: now, actor: "buyer" as const, ...(input.reason ? { reason: input.reason } : {}) } } },
      { returnDocument: "after" },
    );
    if (!updated) return { ok: false, code: "NOT_ALLOWED", message: "This quotation changed while you were deciding. Reload the page and try again." };
    return { ok: true, status: type, statusLabel: STATUS_LABEL[type], supplierNotified: false };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return { ok: false, code: "ALREADY_ACCEPTED", message: "Another quotation for this inquiry is already accepted." };
    throw error;
  }
}

export type RevisionOutcome = { ok: true; supplierNotified: false } | { ok: false; code: "NOT_FOUND" | "STALE" | "NOT_ALLOWED"; message: string };

export async function requestRevision(buyerIdText: string, reference: string, input: { version: number; reason: RevisionReason; message: string }, now = new Date()): Promise<RevisionOutcome> {
  const col = await quotationsCollection();
  const buyerId = new ObjectId(buyerIdText);
  const doc = await loadCurrent(buyerId, reference);
  if (!doc) return { ok: false, code: "NOT_FOUND", message: "That quotation was not found." };
  if (doc.version !== input.version) return { ok: false, code: "STALE", message: "A newer version of this quotation exists. Reload the page to see it first." };
  const status = effectiveStatus(doc.status, doc.validUntil, now);
  if (!allowedActions(status, true, false).requestRevision) return { ok: false, code: "NOT_ALLOWED", message: NOT_ALLOWED[status] ?? "A revision cannot be requested for this quotation now." };
  const updated = await col.findOneAndUpdate(
    // only an open version moves to REVISION_REQUESTED, so a second submission finds nothing to change
    { _id: doc._id, buyerId, isCurrent: true, version: doc.version, status: "SENT", validUntil: { $gt: now } },
    { $set: { status: "REVISION_REQUESTED", updatedAt: now }, $push: { events: { type: "REVISION_REQUESTED", at: now, actor: "buyer" as const, reason: input.reason, message: input.message } } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, code: "NOT_ALLOWED", message: "A revision is already requested, or this quotation changed. Reload the page." };
  return { ok: true, supplierNotified: false };
}

// ---------- comparison ----------
export interface CompareColumn {
  reference: string;
  version: number;
  status: EffectiveStatus;
  statusLabel: string;
  supplier: ReturnType<typeof supplierOf>;
  values: Record<string, string | null>;
  detailHref: string;
}
export interface Comparison {
  columns: CompareColumn[];
  fields: { key: string; label: string; differs: boolean }[];
  compatibility: Compatibility;
  inquiry: { reference: string; href: string } | null;
}

const FIELDS: [string, string][] = [
  ["unitPrice", "Unit Price"],
  ["quantity", "Offered Quantity"],
  ["subtotal", "Subtotal"],
  ["discount", "Discount"],
  ["tax", "Taxes"],
  ["total", "Total Amount"],
  ["delivery", "Delivery Timeline"],
  ["payment", "Payment Terms"],
  ["moq", "MOQ"],
  ["packaging", "Packaging"],
  ["warranty", "Warranty"],
  ["validity", "Valid Until"],
  ["location", "Supplier Location"],
  ["attachments", "Attachments"],
];

export type CompareOutcome = { ok: true; value: Comparison } | { ok: false; code: "COUNT" | "NOT_FOUND" | "DIFFERENT_INQUIRIES"; message: string };

/** Two to four current quotations of this buyer for the same inquiry, side by side. Nothing is ranked and no status changes. */
export async function compareBuyerQuotations(buyerIdText: string, references: string[], now = new Date()): Promise<CompareOutcome> {
  const unique = [...new Set(references)];
  if (unique.length < COMPARE_MIN || unique.length > COMPARE_MAX) return { ok: false, code: "COUNT", message: `Choose between ${COMPARE_MIN} and ${COMPARE_MAX} different quotations to compare.` };
  const buyerId = new ObjectId(buyerIdText);
  const docs = await (await quotationsCollection()).find({ reference: { $in: unique }, buyerId, isCurrent: true, status: { $ne: "DRAFT" } }).toArray();
  const inquiries = await (await inquiriesCollection()).find({ _id: { $in: docs.map((d) => d.inquiryId) }, buyerId }, { projection: { _id: 1 } }).toArray();
  const mine = new Set(inquiries.map((i) => i._id!.toString()));
  const found = docs.filter((d) => mine.has(d.inquiryId.toString()));
  if (found.length !== unique.length) return { ok: false, code: "NOT_FOUND", message: "One or more of these quotations were not found." };
  if (new Set(found.map((d) => d.inquiryId.toString())).size > 1) return { ok: false, code: "DIFFERENT_INQUIRIES", message: "These quotations belong to different inquiries, so they are not compared." };

  const ordered = unique.map((r) => found.find((d) => d.reference === r)!);
  const columns: CompareColumn[] = ordered.map((d) => {
    const t = totals(d);
    const status = effectiveStatus(d.status, d.validUntil, now);
    const s = supplierOf(d);
    const m = (n: number | null) => (n === null ? null : money(n, d.currency));
    return {
      reference: d.reference,
      version: d.version,
      status,
      statusLabel: STATUS_LABEL[status],
      supplier: s,
      detailHref: `/buyer/quotations/${d.reference}`,
      values: {
        unitPrice: `${money(d.unitPriceMinor, d.currency)}${d.unit ? ` / ${d.unit}` : ""}`,
        quantity: `${d.quantity.toLocaleString("en-IN")}${d.unit ? ` ${d.unit}` : ""}`,
        subtotal: t ? m(t.subtotalMinor) : null,
        discount: d.discount && t ? `- ${m(t.discountMinor)}` : null,
        tax: t && t.taxMinor !== null && d.tax ? `${d.tax.label} ${formatPercent(d.tax.bp)}: ${m(t.taxMinor)}` : null,
        total: t ? `${m(t.totalMinor)}${t.taxSpecified ? "" : " (before tax; no tax stated)"}` : null,
        delivery: dayRange(d.terms?.deliveryMinDays, d.terms?.deliveryMaxDays),
        payment: d.terms?.paymentTerms ?? null,
        moq: d.moq ? `${d.moq.quantity.toLocaleString("en-IN")} ${d.moq.unit}` : null,
        packaging: d.terms?.packaging ?? null,
        warranty: d.terms?.warranty ?? null,
        validity: `${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(d.validUntil)} (${status === "EXPIRED" ? "expired" : `${daysLeft(d.validUntil, now)} days left`})`,
        location: s.location,
        attachments: (d.attachments?.length ?? 0) > 0 ? `${d.attachments!.length} file(s)` : null,
      },
    };
  });
  const fields = FIELDS.map(([key, label]) => ({ key, label, differs: new Set(columns.map((c) => c.values[key] ?? null)).size > 1 }));
  const compat = compatibility(ordered.map((d, i) => ({ reference: d.reference, inquiryReference: d.inquiryReference, currency: d.currency, unit: d.unit, quantity: d.quantity, status: columns[i].status })));
  return { ok: true, value: { columns, fields, compatibility: compat, inquiry: { reference: ordered[0].inquiryReference, href: `/buyer/inquiries/${ordered[0].inquiryReference}` } } };
}

// ---------- for the inquiry details page ----------
export interface InquiryQuotationItem {
  reference: string;
  version: number;
  supplierName: string;
  unitPrice: string;
  total: string | null;
  statusLabel: string;
  validLabel: string;
  href: string;
}

/** The current quotations of one of the buyer's own inquiries (at most 20, drafts never). */
export async function listInquiryQuotations(buyerIdText: string, inquiryId: ObjectId, now = new Date()): Promise<InquiryQuotationItem[]> {
  const docs = await (await quotationsCollection()).find({ inquiryId, buyerId: new ObjectId(buyerIdText), isCurrent: true, status: { $ne: "DRAFT" } }).sort({ sentAt: -1 }).limit(20).toArray();
  return docs.map((d) => {
    const t = totals(d);
    return { reference: d.reference, version: d.version, supplierName: d.supplierName, unitPrice: `${money(d.unitPriceMinor, d.currency)}${d.unit ? ` / ${d.unit}` : ""}`, total: t ? `${money(t.totalMinor, d.currency)}${t.taxSpecified ? "" : " (before tax)"}` : null, statusLabel: STATUS_LABEL[effectiveStatus(d.status, d.validUntil, now)], validLabel: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(d.validUntil), href: `/buyer/quotations/${d.reference}` };
  });
}
