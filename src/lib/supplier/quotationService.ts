import { ObjectId, type Filter } from "mongodb";
import { findInquiryFor } from "@/lib/leads/access";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { formatSubmitted } from "@/lib/inquiries/confirmation";
import { normaliseStatus } from "@/lib/inquiries/rules";
import { BUSINESS_LABEL } from "@/lib/inquiries/buyerListRules";
import { ordersCollection } from "@/lib/orders/service";
import { formatDecimal } from "@/lib/quotations/decimal";
import { formatMoney } from "@/lib/quotations/money";
import { buildVersionView } from "@/lib/quotations/quotationCompare";
import { revisionEligibility } from "@/lib/quotations/revisionRules";
import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { DAY_MS, EXPIRING_DAYS, REFERENCE_PATTERN, daysLeft, escapeRegex } from "@/lib/quotations/quotationRules";
import { breakdownRows, quotationsCollection, termsRows, totals, type QuotationDoc } from "@/lib/quotations/service";
import type { SupplierContext } from "./company";
import { replyEligibility } from "./inquiryRules";
import { deliverOutbox, noticeState, outboxCollection, type NoticeState } from "./outbox";
import {
  EXPORT_MAX_ROWS,
  SUPPLIER_STATUS_LABEL,
  canWithdraw,
  csvCell,
  supplierStatus,
  type SupplierQuotationQuery,
  type SupplierStatus,
  type SupplierTab,
} from "./quotationRules";

/**
 * The supplier's side of quotations (Page 42): list, summary, detail, versions, withdrawal and a CSV export, on the ONE `quotations` collection
 * the buyer side reads (no second quotation system). Everything is scoped by the company's own seller keys (`context.company.sellerKeys`, resolved
 * from the verified session in `requireSupplierApi/Page`; never from a request): a quotation whose `supplierKey` is not one of them is "not found",
 * the same answer as an unknown or malformed reference. A company that owns no seller has nothing to list (the honest empty state).
 *
 * This file cannot create, edit, revise, accept or reject a quotation: no supplier creation workflow exists yet (Page 43), and acceptance and
 * rejection are the buyer's decisions. The only status change a supplier makes is WITHDRAWN. Amounts are never calculated here: they come from the
 * saved snapshot through the buyer side's `totals` (exact integer arithmetic).
 */
const keysOf = (context: SupplierContext) => context.company.sellerKeys;

let indexReady: Promise<unknown> | undefined;
/** The supplier-scoped read paths for the list sorts, the version lookup and the order link. Idempotent; the dashboard's own indexes are reused for status counts. */
async function collection() {
  const col = await quotationsCollection();
  indexReady ??= Promise.all([
    col.createIndex({ supplierKey: 1, isCurrent: 1, createdAt: -1, _id: -1 }, { name: "supplier_current_created" }),
    col.createIndex({ supplierKey: 1, isCurrent: 1, updatedAt: -1, _id: -1 }, { name: "supplier_current_updated" }),
    col.createIndex({ supplierKey: 1, isCurrent: 1, validUntil: 1, _id: 1 }, { name: "supplier_current_valid" }),
    col.createIndex({ supplierKey: 1, reference: 1, version: -1 }, { name: "supplier_reference_versions" }),
    // a status tab (drafts, accepted, rejected, or submitted / expired through a merge of statuses) in the default order, without an in-memory sort
    col.createIndex({ supplierKey: 1, isCurrent: 1, status: 1, createdAt: -1, _id: -1 }, { name: "supplier_current_status_created" }),
    // covers the counts aggregation (status, validity, currency) so it reads index keys only, never the documents
    col.createIndex({ supplierKey: 1, isCurrent: 1, status: 1, validUntil: 1, currency: 1 }, { name: "supplier_current_summary" }),
  ]).catch((error) => {
    indexReady = undefined;
    throw error;
  });
  await indexReady;
  return col;
}

/** The quotation collection with the supplier-scoped indexes ensured (shared with the version module). */
export const quotesCollection = collection;

const OPEN = ["SENT", "REVISION_REQUESTED"] as const;

const formatDay = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(d);
export const INDIVIDUAL = "Individual buyer";

/** The business name the buyer gave when registering, for the few buyers on one page. Never an email, phone, name or account detail. */
export async function buyerNames(ids: ObjectId[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.map(String))].map((id) => new ObjectId(id));
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const rows = await (await getDb()).collection<{ _id: ObjectId; companyName?: string }>("users").find({ _id: { $in: unique } }, { projection: { companyName: 1 } }).toArray();
  for (const r of rows) if (r.companyName?.trim()) names.set(String(r._id), r.companyName.trim());
  return names;
}

// ---------- filters ----------
function tabFilter(tab: SupplierTab, now: Date): Filter<QuotationDoc> | null {
  switch (tab) {
    case "all":
      return null;
    case "drafts":
      return { status: "DRAFT" };
    case "submitted":
      return { status: { $in: [...OPEN] }, validUntil: { $gt: now } };
    case "accepted":
      return { status: "ACCEPTED" };
    case "rejected":
      return { status: "REJECTED" };
    case "expired":
      return { status: { $in: [...OPEN] }, validUntil: { $lte: now } };
  }
}

/** Everything except the status tab: scope, search, date window, validity and currency. */
function filtersWithoutTab(keys: string[], query: SupplierQuotationQuery, now: Date): Filter<QuotationDoc>[] {
  const and: Filter<QuotationDoc>[] = [{ supplierKey: { $in: keys }, isCurrent: true }];
  if (query.q) {
    const text = escapeRegex(query.q);
    const upper = escapeRegex(query.q.toUpperCase());
    // references are stored upper case, so a prefix match on them is a plain case-sensitive one; the product name is a substring match inside this supplier's own records
    and.push({ $or: [{ reference: { $regex: `^${upper}` } }, { inquiryReference: { $regex: `^${upper}` } }, { productName: { $regex: text, $options: "i" } }] });
  }
  if (query.from && query.to) {
    const field = query.dateBasis === "sent" ? "sentAt" : query.dateBasis === "updated" ? "updatedAt" : "createdAt";
    and.push({ [field]: { $gte: query.from, $lt: query.to } } as Filter<QuotationDoc>);
  }
  if (query.validity) {
    const soon = new Date(now.getTime() + EXPIRING_DAYS * DAY_MS);
    // validity concerns a quotation still waiting on a decision: a closed one (accepted, rejected, withdrawn) has no running validity
    and.push(
      query.validity === "expired"
        ? { status: { $in: [...OPEN] }, validUntil: { $lte: now } }
        : query.validity === "expiring"
          ? { status: { $in: [...OPEN] }, validUntil: { $gt: now, $lte: soon } }
          : { status: { $in: [...OPEN] }, validUntil: { $gt: now } },
    );
  }
  if (query.currency) and.push({ currency: query.currency });
  return and;
}

export type SupplierTabCounts = Record<SupplierTab, number>;

/** One grouped read of status, whether the validity ended, and currency: the tab counts and (for the whole scope) the currencies in use come from the same pass. */
async function countsAndCurrencies(extra: Filter<QuotationDoc>[], now: Date): Promise<{ counts: SupplierTabCounts; currencies: string[] }> {
  const col = await collection();
  const rows = await col
    .aggregate<{ _id: { s: string; past: boolean; c: string }; n: number }>([
      { $match: { $and: extra } },
      { $group: { _id: { s: "$status", past: { $lte: ["$validUntil", now] }, c: "$currency" }, n: { $sum: 1 } } },
    ])
    .toArray();
  const out: SupplierTabCounts = { all: 0, drafts: 0, submitted: 0, accepted: 0, rejected: 0, expired: 0 };
  const currencies = new Set<string>();
  for (const { _id, n } of rows) {
    if (typeof _id.c === "string") currencies.add(_id.c);
    out.all += n;
    if (_id.s === "DRAFT") out.drafts += n;
    else if (_id.s === "ACCEPTED") out.accepted += n;
    else if (_id.s === "REJECTED") out.rejected += n;
    else if (_id.s === "SENT" || _id.s === "REVISION_REQUESTED") {
      if (_id.past) out.expired += n;
      else out.submitted += n;
    }
  }
  return { counts: out, currencies: [...currencies].sort() };
}

export interface SupplierQuotationSummary {
  total: number;
  drafts: number;
  submitted: number;
  accepted: number;
  rejected: number;
  expired: number;
  /** Withdrawn quotations are part of the total but have no card or tab: total - the six above. */
  scope: "lifetime";
}

/** The six KPI cards: lifetime, one count per logical quotation (its current version), independent of every filter. One aggregation. */
export async function getSupplierQuotationSummary(context: SupplierContext, now = new Date()): Promise<SupplierQuotationSummary> {
  const keys = keysOf(context);
  if (keys.length === 0) return { total: 0, drafts: 0, submitted: 0, accepted: 0, rejected: 0, expired: 0, scope: "lifetime" };
  return summaryOf((await countsAndCurrencies([{ supplierKey: { $in: keys }, isCurrent: true }], now)).counts);
}

const summaryOf = (c: SupplierTabCounts): SupplierQuotationSummary => ({ total: c.all, drafts: c.drafts, submitted: c.submitted, accepted: c.accepted, rejected: c.rejected, expired: c.expired, scope: "lifetime" });

// ---------- list ----------
export interface SupplierQuotationRow {
  reference: string;
  version: number;
  inquiryReference: string;
  buyer: string;
  productName: string;
  quantity: number;
  unit: string | null;
  currency: string;
  total: { text: string; taxSpecified: boolean } | null;
  createdAt: string;
  createdLabel: string;
  updatedAt: string;
  validUntil: string;
  validLabel: string;
  /** Days left while the quotation is open and valid; null otherwise (a countdown is never shown for a closed one). */
  daysLeft: number | null;
  status: SupplierStatus;
  statusLabel: string;
  detailHref: string;
  actions: { view: true; withdraw: boolean; editDraft: boolean };
  /** Where a draft is continued (the create page), null for anything else. */
  editHref: string | null;
}

const LIST_PROJECTION = { reference: 1, version: 1, inquiryReference: 1, buyerId: 1, productName: 1, quantity: 1, unit: 1, currency: 1, unitPriceMinor: 1, discount: 1, tax: 1, charges: 1, validUntil: 1, status: 1, isCurrent: 1, createdAt: 1, updatedAt: 1, "draft.complete": 1 } as const;

function toRow(doc: QuotationDoc, buyer: string, now: Date): SupplierQuotationRow {
  const t = totals(doc);
  const status = supplierStatus(doc.status, doc.validUntil, now);
  const open = status === "ACTIVE" || status === "EXPIRING_SOON" || status === "REVISION_REQUESTED";
  return {
    reference: doc.reference,
    version: doc.version,
    inquiryReference: doc.inquiryReference,
    buyer,
    productName: doc.productName,
    quantity: doc.quantity,
    unit: doc.unit,
    currency: doc.currency,
    // a draft that is not fully priced has no total yet: it says so instead of showing a figure worked out from half-filled fields
    total: t && !(doc.status === "DRAFT" && doc.draft && !doc.draft.complete) ? { text: formatMoney(t.totalMinor, doc.currency), taxSpecified: t.taxSpecified } : null,
    createdAt: doc.createdAt.toISOString(),
    createdLabel: formatDay(doc.createdAt),
    updatedAt: doc.updatedAt.toISOString(),
    validUntil: doc.validUntil.toISOString(),
    validLabel: formatDay(doc.validUntil),
    daysLeft: open ? daysLeft(doc.validUntil, now) : null,
    status,
    statusLabel: SUPPLIER_STATUS_LABEL[status],
    detailHref: `/supplier/quotations/${doc.reference}`,
    actions: { view: true, withdraw: canWithdraw(doc.status, doc.isCurrent, doc.validUntil, now), editDraft: doc.status === "DRAFT" && doc.isCurrent },
    editHref: doc.status === "DRAFT" && doc.isCurrent ? `/supplier/quotations/create?reference=${doc.reference}` : null,
  };
}

const SORTS = { newest: { createdAt: -1, _id: -1 }, oldest: { createdAt: 1, _id: 1 }, updated: { updatedAt: -1, _id: -1 }, valid: { validUntil: 1, _id: 1 } } as const;

export interface SupplierQuotationCapabilities {
  canCreate: boolean;
  createReason: string | null;
  canExport: boolean;
  canDownloadPdf: false;
  pdfReason: string;
}

export const CAPABILITIES: SupplierQuotationCapabilities = {
  canCreate: true,
  createReason: null,
  canExport: true,
  canDownloadPdf: false,
  pdfReason: "A PDF document is not available: there is no PDF generation or private document storage for quotations yet. Use Print on the quotation page.",
};

export interface SupplierQuotationPage {
  quotations: SupplierQuotationRow[];
  tabCounts: SupplierTabCounts;
  summary: SupplierQuotationSummary;
  currencies: string[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  capabilities: SupplierQuotationCapabilities;
  /** True when the company owns no seller yet, so nothing can be listed: the page says why instead of looking like "no quotations". */
  noSellers: boolean;
}

export async function listSupplierQuotations(context: SupplierContext, query: SupplierQuotationQuery, now = new Date()): Promise<SupplierQuotationPage> {
  const keys = keysOf(context);
  const base = { capabilities: CAPABILITIES };
  if (keys.length === 0) {
    const zero: SupplierTabCounts = { all: 0, drafts: 0, submitted: 0, accepted: 0, rejected: 0, expired: 0 };
    return { ...base, quotations: [], tabCounts: zero, summary: { total: 0, drafts: 0, submitted: 0, accepted: 0, rejected: 0, expired: 0, scope: "lifetime" }, currencies: [], meta: { total: 0, page: query.page, limit: query.limit, totalPages: 0 }, noSellers: true };
  }
  const col = await collection();
  const common = filtersWithoutTab(keys, query, now);
  const tab = tabFilter(query.status, now);
  const filter: Filter<QuotationDoc> = { $and: [...common, ...(tab ? [tab] : [])] };
  // with no search or filter the tab counts ARE the whole-scope counts: one grouped read serves the cards, the tabs and the currency list;
  // with a filter active there is one more grouped read for the tabs under that filter
  const unfiltered = common.length === 1;
  const scopeRead = countsAndCurrencies([common[0]], now);
  const [docs, total, scope, tabsRead] = await Promise.all([
    col.find(filter, { projection: LIST_PROJECTION }).sort(SORTS[query.sort] as never).skip((query.page - 1) * query.limit).limit(query.limit).toArray(),
    col.countDocuments(filter),
    scopeRead,
    unfiltered ? scopeRead : countsAndCurrencies(common, now),
  ]);
  const names = await buyerNames(docs.map((d) => d.buyerId));
  return {
    ...base,
    quotations: docs.map((d) => toRow(d as QuotationDoc, names.get(String(d.buyerId)) ?? INDIVIDUAL, now)),
    tabCounts: tabsRead.counts,
    summary: summaryOf(scope.counts),
    currencies: scope.currencies,
    meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    noSellers: false,
  };
}

/** The company's current quotations for ONE inquiry (Page 41): at most 20, newest first, the same row shape as the list. The caller has already proved the inquiry is the company's. */
export async function listQuotationsForInquiry(context: SupplierContext, inquiryId: ObjectId, now = new Date()): Promise<SupplierQuotationRow[]> {
  const keys = keysOf(context);
  if (keys.length === 0) return [];
  const docs = await (await collection()).find({ inquiryId, supplierKey: { $in: keys }, isCurrent: true }, { projection: LIST_PROJECTION }).sort({ sentAt: -1 }).limit(20).toArray();
  return docs.map((d) => toRow(d as QuotationDoc, "", now));
}

// ---------- detail ----------
const EVENT_LABEL: Record<string, string> = {
  SENT: "Quotation submitted to the buyer",
  REVISION_REQUESTED: "Revision requested by the buyer",
  ACCEPTED: "Accepted by the buyer",
  REJECTED: "Rejected by the buyer",
  SUPERSEDED: "Replaced by a newer version",
  WITHDRAWN: "Withdrawn by you",
};
const REVISION_LABEL: Record<string, string> = { PRICE: "Price negotiation", QUANTITY: "Quantity changes", DELIVERY: "Delivery timeline", PAYMENT: "Payment terms", SPECIFICATIONS: "Product specifications", OTHER: "Other" };

export const VERSIONS_PAGE_SIZE = 20;
export const VERSIONS_MAX_PAGE_SIZE = 50;
export const MAX_VERSION_NUMBER = 100_000;

// ---------- version summaries ----------
export interface VersionSummary {
  version: number;
  status: SupplierStatus;
  statusLabel: string;
  isCurrent: boolean;
  isAccepted: boolean;
  isDraft: boolean;
  createdLabel: string;
  submittedLabel: string | null;
  totalText: string | null;
  /** True for a draft whose amounts are not final: the total shown is then labelled provisional. */
  provisional: boolean;
  validLabel: string;
  revisionOf: number | null;
  revisionReason: string | null;
  author: string;
  href: string;
}

const SUMMARY_PROJECTION = { reference: 1, version: 1, status: 1, isCurrent: 1, createdAt: 1, sentAt: 1, validUntil: 1, currency: 1, unitPriceMinor: 1, quantity: 1, discount: 1, tax: 1, charges: 1, revisionOf: 1, revisionReason: 1, supplierName: 1, "snapshot.amounts.total": 1, "draft.complete": 1 } as const;

function versionSummaryOf(doc: QuotationDoc, now: Date): VersionSummary {
  const status = supplierStatus(doc.status, doc.validUntil, now);
  const isDraft = doc.status === "DRAFT";
  const snapTotal = doc.snapshot?.amounts?.total;
  const t = snapTotal ? null : totals(doc);
  const totalText = snapTotal ? formatMoney(Number(snapTotal.replace(".", "")), doc.currency) : t ? formatMoney(t.totalMinor, doc.currency) : null;
  return {
    version: doc.version,
    status,
    statusLabel: SUPPLIER_STATUS_LABEL[status],
    isCurrent: doc.isCurrent,
    isAccepted: doc.status === "ACCEPTED",
    isDraft,
    createdLabel: formatSubmitted(doc.createdAt.toISOString()),
    submittedLabel: isDraft ? null : formatSubmitted(doc.sentAt.toISOString()),
    totalText: isDraft && doc.draft && !doc.draft.complete ? null : totalText,
    provisional: isDraft,
    validLabel: formatDay(doc.validUntil),
    revisionOf: doc.revisionOf ?? null,
    revisionReason: doc.revisionReason ?? null,
    author: doc.supplierName,
    href: `/supplier/quotations/${doc.reference}?version=${doc.version}`,
  };
}

/** Version summaries, newest version first. `cursor` is the lowest version already shown (the next page holds lower ones). 20 by default, 50 at most. */
export async function listVersions(context: SupplierContext, reference: string, opts: { limit: number; cursor: number | null }, now = new Date()): Promise<{ items: VersionSummary[]; nextCursor: number | null; total: number } | null> {
  const keys = keysOf(context);
  if (keys.length === 0 || !REFERENCE_PATTERN.test(reference)) return null;
  const col = await collection();
  const filter = { reference, supplierKey: { $in: keys } };
  const [docs, total] = await Promise.all([
    col.find(opts.cursor ? { ...filter, version: { $lt: opts.cursor } } : filter, { projection: SUMMARY_PROJECTION }).sort({ version: -1 }).limit(opts.limit + 1).toArray(),
    col.countDocuments(filter),
  ]);
  if (total === 0) return null;
  const page = docs.slice(0, opts.limit);
  return { items: page.map((d) => versionSummaryOf(d as QuotationDoc, now)), nextCursor: docs.length > opts.limit ? (page.at(-1)?.version ?? null) : null, total };
}

export function parseVersionList(params: URLSearchParams): { ok: true; limit: number; cursor: number | null } | { ok: false; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  let limit = VERSIONS_PAGE_SIZE;
  const l = params.get("limit");
  if (l !== null && l !== "") {
    const n = Number(l);
    if (!Number.isInteger(n) || n < 1 || n > VERSIONS_MAX_PAGE_SIZE) fields.limit = `limit must be a whole number from 1 to ${VERSIONS_MAX_PAGE_SIZE}.`;
    else limit = n;
  }
  let cursor: number | null = null;
  const c = params.get("cursor");
  if (c !== null && c !== "") {
    const n = Number(c);
    if (!Number.isInteger(n) || n < 2 || n > MAX_VERSION_NUMBER) fields.cursor = "The cursor is not valid.";
    else cursor = n;
  }
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, limit, cursor };
}

export const parseVersionNumber = (text: unknown): number | null => (typeof text === "string" && /^\d{1,6}$/.test(text) && Number(text) >= 1 && Number(text) <= MAX_VERSION_NUMBER ? Number(text) : null);

export interface SupplierQuotationDetail {
  quotation: {
    reference: string;
    version: number;
    isCurrent: boolean;
    status: SupplierStatus;
    statusLabel: string;
    createdLabel: string;
    sentLabel: string | null;
    validUntil: string;
    validLabel: string;
    daysLeft: number | null;
    currency: string;
    quantity: number;
    unit: string | null;
    unitPrice: string;
    total: { text: string; taxSpecified: boolean } | null;
    productName: string;
    /** A draft's amounts are provisional until it is submitted; a submitted version's are the stored ones. */
    provisional: boolean;
    revisionOf: number | null;
    revisionReason: string | null;
    supplierName: string;
  };
  /** Which version is which: the current offer the buyer sees, the accepted version if any, an unsubmitted revision draft if any. A draft is never the "current offer". */
  pointers: { currentVersion: number | null; acceptedVersion: number | null; revisionDraft: { version: number; editHref: string } | null; totalVersions: number };
  historical: { isHistorical: boolean; message: string | null; currentHref: string | null };
  buyer: { name: string };
  inquiry: { reference: string; href: string; status: string; statusLabel: string; category: string | null; quantity: number; unit: string | null; deliveryLocation: string | null; requestedLabel: string } | null;
  line: {
    id: string;
    name: string;
    quantityText: string;
    unitPriceText: string;
    moqText: string | null;
    discountText: string | null;
    taxText: string | null;
    amountText: string | null;
    currency: string;
    specs: { label: string; value: string }[];
    description: string | null;
    features: string[];
    /** The product's CURRENT listing, shown separately from the stored snapshot (the snapshot is what was quoted). */
    product: { url: string | null; imageSrc: string | null; imageRemote: boolean };
  };
  productSnapshot: { description: string | null; specs: { label: string; value: string }[]; features: string[] };
  priceBreakdown: { error: string | null; rows: { label: string; value: string; strong?: boolean }[] };
  /** Where the amounts come from and whether they are consistent: "snapshot" (stored at submission), "stored" (worked out from the version's own fields: an older record), "unavailable" (a data-integrity gap, never filled in). */
  financial: { source: "snapshot" | "stored" | "unavailable"; integrity: { ok: boolean; note: string | null }; policyVersion: string | null; taxRule: { id: string; version: string; label: string } | null };
  commercialTerms: { label: string; value: string | null }[];
  notes: string | null;
  attachments: { available: false; reason: string };
  versions: VersionSummary[];
  hasMoreVersions: boolean;
  nextVersionCursor: number | null;
  events: { type: string; label: string; atLabel: string; actor: string; detail: string | null }[];
  decision: { type: "ACCEPTED" | "REJECTED"; atLabel: string; reason: string | null } | null;
  pendingRevision: { reason: string; message: string; atLabel: string } | null;
  order: { reference: string; statusLabel: string; href: null } | null;
  capabilities: {
    withdraw: boolean;
    withdrawVersion: number;
    editDraft: boolean;
    editHref: string | null;
    createRevision: { available: boolean; reason: string | null; continueHref: string | null };
    downloadPdf: false;
    print: true;
    convertToOrder: false;
    reasons: Record<string, string>;
  };
}

/** The version shown: the one asked for (?version=n), else the current offer (the highest version that is current), else the highest. null for anything outside the company (unknown, malformed and another supplier's alike). */
export async function getSupplierQuotationDetail(context: SupplierContext, reference: string, version?: number, now = new Date()): Promise<SupplierQuotationDetail | null> {
  const keys = keysOf(context);
  if (keys.length === 0 || !REFERENCE_PATTERN.test(reference)) return null;
  if (version !== undefined && (!Number.isInteger(version) || version < 1 || version > MAX_VERSION_NUMBER)) return null;
  const col = await collection();
  const scope = { reference, supplierKey: { $in: keys } };
  const [selected, pointerDocs, first] = await Promise.all([
    version !== undefined ? col.findOne({ ...scope, version }) : col.findOne({ ...scope, isCurrent: true }).then((d) => d ?? col.findOne(scope, { sort: { version: -1 } })),
    // the three pointers, from light projections (never the full history)
    col.find({ ...scope, $or: [{ isCurrent: true }, { status: "ACCEPTED" }, { status: "DRAFT" }] }, { projection: { version: 1, status: 1, isCurrent: 1 } }).limit(10).toArray(),
    listVersions(context, reference, { limit: VERSIONS_PAGE_SIZE, cursor: null }, now),
  ]);
  const doc = selected as QuotationDoc | null;
  if (!doc || !first) return null;

  const current = pointerDocs.find((d) => d.isCurrent);
  const accepted = pointerDocs.find((d) => d.status === "ACCEPTED");
  const revisionDraft = pointerDocs.find((d) => d.status === "DRAFT" && !d.isCurrent);
  const [inquiry, names, order] = await Promise.all([
    // the inquiry must be addressed to one of this company's sellers too: ownership is checked through both records
    findInquiryFor(context, { _id: doc.inquiryId }),
    buyerNames([doc.buyerId]),
    doc.status === "ACCEPTED" ? ordersCollection().then((c) => c.findOne({ quotationReference: doc.reference, supplierKey: { $in: keys } }, { projection: { reference: 1, status: 1 } })) : Promise.resolve(null),
  ]);

  const status = supplierStatus(doc.status, doc.validUntil, now);
  const open = status === "ACTIVE" || status === "EXPIRING_SOON" || status === "REVISION_REQUESTED";
  const isDraft = doc.status === "DRAFT";
  const t = totals(doc);
  const view = buildVersionView(doc);
  const snapshot = doc.productSnapshot ?? { description: null, specs: [], features: [] };
  const pending = [...(doc.events ?? [])].reverse().find((e) => e.type === "REVISION_REQUESTED");
  const withdraw = canWithdraw(doc.status, doc.isCurrent, doc.validUntil, now);
  const inquiryStatus = inquiry ? normaliseStatus(inquiry.status) : null;
  const inquiryOpen = inquiry ? replyEligibility(inquiry.status, Boolean(inquiry.buyerId)).ok : false;
  const editHref = "/supplier/quotations/create?reference=" + doc.reference;
  const draftIncomplete = isDraft && Boolean(doc.draft) && !doc.draft?.complete;
  const sameAsSnapshot = !doc.snapshot?.amounts || !t || doc.snapshot.amounts.total === formatDecimal(t.totalMinor);
  const integrityNote = !t ? "The saved amounts of this version could not be calculated (a legacy record is incomplete). No total is shown and none is invented." : !sameAsSnapshot ? "The stored snapshot total differs from the total worked out from this version's stored fields. The stored snapshot is shown." : view.amountsSource === "stored" ? "An older record without a stored snapshot: its amounts are worked out from its own stored fields, not from today's catalogue or tax configuration." : null;
  const elig = revisionEligibility({ status: doc.status, isCurrent: doc.isCurrent, hasOpenRevisionDraft: Boolean(revisionDraft), inquiryOpen });
  const mayRevise = context.permissions.manageQuotations;
  const product = doc.productKey ? getPublicProductByKey(doc.productKey) : undefined;
  const image = product ? (product.images.find((i) => i.primary) ?? product.images[0]) : undefined;
  const totalAmount = view.amounts ? view.amounts.total : null;

  return {
    quotation: {
      reference: doc.reference,
      version: doc.version,
      isCurrent: doc.isCurrent,
      status,
      statusLabel: SUPPLIER_STATUS_LABEL[status],
      createdLabel: formatSubmitted(doc.createdAt.toISOString()),
      sentLabel: isDraft || !doc.sentAt ? null : formatSubmitted(doc.sentAt.toISOString()),
      validUntil: doc.validUntil.toISOString(),
      validLabel: formatDay(doc.validUntil),
      daysLeft: open ? daysLeft(doc.validUntil, now) : null,
      currency: doc.currency,
      quantity: doc.quantity,
      unit: doc.unit,
      unitPrice: formatMoney(doc.unitPriceMinor, doc.currency),
      total: draftIncomplete ? null : totalAmount ? { text: formatMoney(Number(totalAmount.replace(".", "")), doc.currency), taxSpecified: doc.snapshot?.amounts ? doc.snapshot.amounts.tax !== null : t ? t.taxSpecified : false } : null,
      productName: doc.productName,
      provisional: isDraft,
      revisionOf: doc.revisionOf ?? null,
      revisionReason: doc.revisionReason ?? null,
      supplierName: doc.supplierName,
    },
    pointers: { currentVersion: current?.version ?? null, acceptedVersion: accepted?.version ?? null, revisionDraft: revisionDraft ? { version: revisionDraft.version, editHref } : null, totalVersions: first.total },
    historical: !doc.isCurrent && !isDraft ? { isHistorical: true, message: "version " + doc.version + " is a historical version" + (current ? " (the current offer is version " + current.version + ")" : "") + ". It is shown exactly as it was submitted and cannot be edited.", currentHref: current ? "/supplier/quotations/" + doc.reference + "?version=" + current.version : null } : { isHistorical: false, message: null, currentHref: null },
    buyer: { name: names.get(String(doc.buyerId)) ?? INDIVIDUAL },
    inquiry: inquiry && inquiryStatus ? { reference: doc.inquiryReference, href: "/supplier/inquiries/" + doc.inquiryReference, status: inquiryStatus, statusLabel: BUSINESS_LABEL[inquiryStatus], category: inquiry.categoryName ?? null, quantity: inquiry.quantity, unit: inquiry.unit ?? null, deliveryLocation: inquiry.deliveryLocation?.text ?? null, requestedLabel: formatSubmitted(inquiry.createdAt.toISOString()) } : null,
    line: {
      id: view.lines[0].id,
      name: doc.productName,
      quantityText: doc.quantity.toLocaleString("en-IN") + (doc.unit ? " " + doc.unit : ""),
      unitPriceText: formatMoney(doc.unitPriceMinor, doc.currency) + (doc.unit ? " / " + doc.unit : ""),
      moqText: view.lines[0].moq,
      discountText: view.lines[0].discount,
      taxText: view.taxText,
      amountText: view.amounts ? formatMoney(Number(view.amounts.taxable.replace(".", "")), doc.currency) : null,
      currency: doc.currency,
      specs: snapshot.specs ?? [],
      description: snapshot.description ?? null,
      features: snapshot.features ?? [],
      product: { url: product?.url ?? null, imageSrc: image?.src ?? null, imageRemote: Boolean(image?.remote) },
    },
    productSnapshot: { description: snapshot.description ?? null, specs: snapshot.specs ?? [], features: snapshot.features ?? [] },
    priceBreakdown: breakdownRows(doc),
    financial: { source: view.amountsSource, integrity: { ok: Boolean(t) && sameAsSnapshot, note: integrityNote }, policyVersion: doc.snapshot?.policyVersion ?? null, taxRule: doc.snapshot?.taxRule ? { id: doc.snapshot.taxRule.id, version: doc.snapshot.taxRule.version, label: doc.snapshot.taxRule.label } : null },
    commercialTerms: termsRows(doc),
    notes: doc.terms?.remarks ?? null,
    attachments: { available: false, reason: "Quotation attachments are not available yet: there is no private storage a buyer can download from, so none are stored or shown." },
    versions: first.items,
    hasMoreVersions: first.nextCursor !== null,
    nextVersionCursor: first.nextCursor,
    events: (doc.events ?? []).map((e) => ({ type: e.type, label: EVENT_LABEL[e.type] ?? e.type, atLabel: formatSubmitted(e.at.toISOString()), actor: e.actor, detail: e.type === "REVISION_REQUESTED" ? [REVISION_LABEL[e.reason ?? ""] ?? e.reason, e.message].filter(Boolean).join(": ") || null : (e.reason ?? null) })),
    decision: doc.decision ? { type: doc.decision.type, atLabel: formatSubmitted(doc.decision.at.toISOString()), reason: doc.decision.reason } : null,
    pendingRevision: doc.status === "REVISION_REQUESTED" && pending ? { reason: REVISION_LABEL[pending.reason ?? ""] ?? pending.reason ?? "", message: pending.message ?? "", atLabel: formatSubmitted(pending.at.toISOString()) } : null,
    order: order ? { reference: order.reference, statusLabel: String(order.status).replace(/_/g, " ").toLowerCase(), href: null } : null,
    capabilities: {
      withdraw,
      withdrawVersion: doc.version,
      editDraft: isDraft,
      editHref: isDraft ? editHref : null,
      createRevision: !mayRevise ? { available: false, reason: "Your role cannot create revisions.", continueHref: null } : elig.ok ? { available: true, reason: null, continueHref: null } : { available: false, reason: elig.message, continueHref: elig.code === "REVISION_EXISTS" ? editHref : null },
      downloadPdf: false,
      print: true,
      convertToOrder: false,
      reasons: {
        editDraft: "Only a draft can be edited. A submitted version is never changed: create a revision instead.",
        downloadPdf: CAPABILITIES.pdfReason,
        convertToOrder: "An accepted quotation becomes an order only through the order workflow, which does not create orders from quotations yet.",
      },
    },
  };
}

// ---------- withdrawal ----------
export type WithdrawOutcome =
  | { ok: true; status: "WITHDRAWN"; statusLabel: string; buyerNotified: boolean; buyerNotice: NoticeState }
  | { ok: false; code: "NOT_FOUND" | "NOT_ALLOWED" | "CONFLICT" | "NOT_CURRENT"; message: string };

class WithdrawConflict extends Error {}

/**
 * Withdraws the CURRENT version while it still waits on the buyer (see canWithdraw). `expectedVersion` (the version the page showed) must be the current
 * one: a supplier looking at an older version can never withdraw a newer offer. One transaction: the conditional status change (the status read a moment ago
 * must still be the stored one, so a buyer who accepted first wins) and the buyer's notification outbox row commit together; the in-app notice follows the
 * commit. Nothing is deleted; history and the commercial snapshot stay.
 */
export async function withdrawSupplierQuotation(context: SupplierContext, reference: string, reason: string | null, now = new Date(), expectedVersion: number | null = null): Promise<WithdrawOutcome> {
  const keys = keysOf(context);
  if (keys.length === 0 || !REFERENCE_PATTERN.test(reference)) return { ok: false, code: "NOT_FOUND", message: "Quotation not found." };
  const col = await collection();
  const doc = await col.findOne({ reference, supplierKey: { $in: keys }, isCurrent: true });
  if (!doc) return { ok: false, code: "NOT_FOUND", message: "Quotation not found." };
  if (expectedVersion !== null && expectedVersion !== doc.version) return { ok: false, code: "NOT_CURRENT", message: `Version ${expectedVersion} is not the current offer (version ${doc.version} is). Open the current version to withdraw it.` };
  if (!canWithdraw(doc.status, doc.isCurrent, doc.validUntil, now)) {
    const why = doc.status === "ACCEPTED" ? "An accepted quotation is a closed commercial decision and cannot be withdrawn here." : doc.status === "REJECTED" ? "The buyer already rejected this quotation." : doc.status === "WITHDRAWN" ? "This quotation is already withdrawn." : doc.status === "DRAFT" ? "A draft was never sent to a buyer, so there is nothing to withdraw." : "This quotation's validity has ended, so there is nothing left to withdraw.";
    return { ok: false, code: "NOT_ALLOWED", message: why };
  }
  const outbox = await outboxCollection();
  const session = (await getMongoClient()).startSession();
  const outboxId = new ObjectId();
  try {
    await session.withTransaction(
      async () => {
        const result = await col.updateOne(
          { _id: doc._id, supplierKey: { $in: keys }, isCurrent: true, status: doc.status, validUntil: { $gt: now } },
          { $set: { status: "WITHDRAWN", updatedAt: now }, $unset: { openKey: "" }, $push: { events: { type: "WITHDRAWN", at: now, actor: "supplier", ...(reason ? { reason } : {}) } } },
          { session },
        );
        if (result.matchedCount !== 1) throw new WithdrawConflict();
        await outbox.insertOne({ _id: outboxId, type: "QUOTATION_WITHDRAWN", supplierCompanyId: context.companyId, buyerId: doc.buyerId, dedupeKey: `quotation-withdrawn:${doc.reference}:${doc.version}`, status: "PENDING", attempts: 0, createdAt: now, supplierName: doc.supplierName, inquiryReference: doc.inquiryReference, quotationReference: doc.reference, version: doc.version, ...(reason ? { reason } : {}) }, { session });
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } catch (error) {
    if (error instanceof WithdrawConflict) return { ok: false, code: "CONFLICT", message: "This quotation changed just now (the buyer may have decided on it, or it was already withdrawn). Reload to see its current status." };
    throw error;
  } finally {
    await session.endSession();
  }
  // after the commit: the buyer's in-app notice. `buyerNotice` says what really happened to it (recorded, queued, or not recorded because the buyer switched it off)
  await deliverOutbox(outboxId);
  const buyerNotice = await noticeState(`quotation-withdrawn:${doc.reference}:${doc.version}`);
  return { ok: true, status: "WITHDRAWN", statusLabel: SUPPLIER_STATUS_LABEL.WITHDRAWN, buyerNotified: buyerNotice === "recorded", buyerNotice };
}

// ---------- export ----------
const HEADER = ["Quotation Reference", "Version", "Inquiry Reference", "Buyer (business name)", "Product / Requirement", "Quantity", "Unit", "Currency", "Quoted Total", "Total Basis", "Created (India time)", "Submitted (India time)", "Valid Until (India time)", "Status"];
const ist = (d: Date | undefined) => (d ? new Date(d.getTime() + 330 * 60_000).toISOString().replace("T", " ").slice(0, 16) : "");
/** "1234.50" from whole minor units, by integer arithmetic (no float). All supported currencies use two decimals. */
const plainAmount = (minor: number) => `${String(Math.floor(minor / 100))}.${String(minor % 100).padStart(2, "0")}`;

/**
 * The company's own quotations under the current search and filters (the status tab included) as CSV text, newest created first, at most
 * EXPORT_MAX_ROWS. The file is generated and sent in the one response: nothing is stored, so there is no link to share and nothing to expire. Only
 * the current version of each quotation; buyer = business name only; no internal note, contact, address or other supplier's data exists in it.
 */
export async function exportSupplierQuotationsCsv(context: SupplierContext, query: SupplierQuotationQuery, now = new Date()): Promise<{ csv: string; rows: number; truncated: boolean }> {
  const keys = keysOf(context);
  if (keys.length === 0) return { csv: `${HEADER.map(csvCell).join(",")}\r\n`, rows: 0, truncated: false };
  const col = await collection();
  const tab = tabFilter(query.status, now);
  const filter: Filter<QuotationDoc> = { $and: [...filtersWithoutTab(keys, query, now), ...(tab ? [tab] : [])] };
  const docs = await col.find(filter, { projection: { ...LIST_PROJECTION, sentAt: 1 } }).sort(SORTS.newest as never).limit(EXPORT_MAX_ROWS + 1).toArray();
  const truncated = docs.length > EXPORT_MAX_ROWS;
  const rows = docs.slice(0, EXPORT_MAX_ROWS) as QuotationDoc[];
  const names = await buyerNames(rows.map((d) => d.buyerId));
  const body = rows.map((d) => {
    const t = totals(d);
    return [d.reference, d.version, d.inquiryReference, names.get(String(d.buyerId)) ?? INDIVIDUAL, d.productName, d.quantity, d.unit ?? "", d.currency, t ? plainAmount(t.totalMinor) : "", t ? (t.taxSpecified ? "Including stated tax" : "Before tax (no tax stated)") : "", ist(d.createdAt), d.status === "DRAFT" ? "" : ist(d.sentAt), ist(d.validUntil), SUPPLIER_STATUS_LABEL[supplierStatus(d.status, d.validUntil, now)]];
  });
  return { csv: [HEADER, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n", rows: rows.length, truncated };
}
