import { createHash } from "node:crypto";
import { ObjectId, type ClientSession, type Filter } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { ADOPTED_SELLERS, getCatalog } from "@/lib/catalog/data";
import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { resolveProduct } from "@/lib/catalog/productRef";
import { getProductsBySupplier } from "@/lib/constants/categoryPages";
import { formatSubmitted } from "@/lib/inquiries/confirmation";
import { REFERENCE_PATTERN as INQUIRY_REFERENCE, canTransition, normaliseStatus, type InquiryStatus } from "@/lib/inquiries/rules";
import { inquiriesCollection, type InquiryDoc } from "@/lib/inquiries/service";
import { formatMoney } from "@/lib/quotations/money";
import { escapeRegex, REFERENCE_PATTERN as QUOTATION_REFERENCE } from "@/lib/quotations/quotationRules";
import { generateQuotationReference, quotationsCollection, type QuotationDoc } from "@/lib/quotations/service";
import {
  CALC_POLICY_VERSION,
  DELIVERY_TERMS,
  DEFAULT_VALIDITY_DAYS,
  IDEMPOTENCY_KEY,
  LIMITS,
  MAX_EXTRA_CHARGES,
  MAX_LEAD_DAYS,
  MAX_LINES,
  MAX_VALIDITY_DAYS,
  PAYMENT_TYPES,
  QUOTE_CURRENCIES,
  computeQuote,
  defaultValidity,
  emptyInput,
  emptyLine,
  normaliseInput,
  paymentText,
  taxOf,
  validateForSubmit,
  validityEnd,
  type Calculation,
  type QuoteInput,
  type TaxRule,
} from "@/lib/quotations/quoteRules";
import { parseMoney, parsePercent, parseQuantity } from "@/lib/quotations/decimal";
import type { PublicUser } from "@/lib/auth/users";
import type { SupplierContext } from "./company";
import { supplierInquiryStatus } from "./dashboardRules";
import { deliverOutbox, noticeState, outboxCollection } from "./outbox";
import { getTaxRule, getTaxRules } from "./taxConfig";

/**
 * The supplier's create-quotation workflow (Page 43) on the ONE quotation system: a draft is a `quotations` document with status DRAFT (buyers never see a
 * draft), submission turns that same document into SENT. Nothing here creates a second quotation collection, price calculation or status set.
 *
 * Trust: the company comes from the verified session (`SupplierContext`); the seller, the buyer and the inquiry come from the INQUIRY RECORD in the database,
 * never from the request; totals are always recalculated here (a client total is only ever compared to detect a change, never stored). Drafts may be
 * incomplete; submission re-validates everything, atomically (one transaction: claim of the idempotency key, the quotation, the inquiry status, the
 * notification outbox), and is idempotent. Docs: docs/backend/PAGE_43_*.md.
 */
const keysOf = (context: SupplierContext) => context.company.sellerKeys;
const QUOTABLE_INQUIRY_STATUSES = ["NEW", "new", "NOTIFIED", "IN_PROGRESS", "REPLIED", "QUOTED"];
const OPERATION = "quotation.submit";
export const PICKER_PAGE_SIZE = 20;
export const PICKER_MAX_PAGE_SIZE = 50;

const dayLabel = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(d);

// ---------- storage ----------
let indexReady: Promise<unknown> | undefined;
async function stores() {
  const db = await getDb();
  const quotes = await quotationsCollection();
  const inquiries = await inquiriesCollection();
  const idem = db.collection("idempotency_keys");
  indexReady ??= Promise.all([
    // one open lineage (draft, sent, revision requested, accepted) per inquiry and seller, enforced by the database even for simultaneous requests
    quotes.createIndex({ openKey: 1 }, { unique: true, partialFilterExpression: { openKey: { $exists: true } }, name: "quotation_open_per_inquiry" }),
    // the picker: this seller's inquiries in the quotable statuses, newest first with a stable tie-break. The _id at the end lets the database merge the
    // per-status index ranges in sort order instead of sorting in memory (the dashboard's supplier_status_newest has no _id, so it cannot serve this sort)
    inquiries.createIndex({ supplierKey: 1, status: 1, createdAt: -1, _id: -1 }, { name: "supplier_quotable_newest" }),
    idem.createIndex({ companyId: 1, userId: 1, operation: 1, key: 1 }, { unique: true, name: "idempotency_scope_key" }),
    idem.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7 * 86_400, name: "idempotency_ttl" }),
    outboxCollection(),
  ]).catch((error) => {
    indexReady = undefined;
    throw error;
  });
  await indexReady;
  return { db, quotes, inquiries, idem, outbox: await outboxCollection() };
}

export async function buyerName(buyerId: ObjectId | undefined): Promise<string> {
  if (!buyerId) return "Individual buyer";
  const row = await (await getDb()).collection<{ _id: ObjectId; companyName?: string }>("users").findOne({ _id: buyerId }, { projection: { companyName: 1 } });
  return row?.companyName?.trim() || "Individual buyer";
}

// ---------- errors the routes turn into HTTP answers ----------
export type Failure = { ok: false; status: 403 | 404 | 409 | 422; code: string; message: string; fields?: Record<string, string>; data?: unknown };
const fail = (status: Failure["status"], code: string, message: string, extra: { fields?: Record<string, string>; data?: unknown } = {}): Failure => ({ ok: false, status, code, message, ...extra });
class Abort extends Error {
  constructor(public readonly failure: Failure) {
    super(failure.code);
  }
}

// ---------- inquiries ----------
export type InquiryRow = InquiryDoc & { _id: ObjectId };

type Eligibility = { ok: true; inquiry: InquiryRow } | Failure;

function eligibilityOf(inquiry: InquiryRow | null): Eligibility {
  if (!inquiry) return fail(404, "NOT_FOUND", "Inquiry not found.");
  if (!inquiry.buyerId) return fail(409, "NOT_ELIGIBLE", "This inquiry was sent by a guest without an account, so there is no buyer account to receive a quotation.");
  const status = normaliseStatus(inquiry.status);
  if (status === "CLOSED" || status === "CANCELLED" || status === "REJECTED") return fail(409, "INQUIRY_CLOSED", `This inquiry is ${status === "CLOSED" ? "closed" : status === "CANCELLED" ? "cancelled by the buyer" : "declined"}, so it can no longer be quoted.`);
  return { ok: true, inquiry };
}

/** An inquiry addressed to one of the company's sellers, by reference. Unknown, malformed and another seller's are the same "not found". */
export async function loadInquiry(context: SupplierContext, reference: string, session?: ClientSession): Promise<InquiryRow | null> {
  const keys = keysOf(context);
  if (keys.length === 0 || !INQUIRY_REFERENCE.test(reference)) return null;
  const { inquiries } = await stores();
  return (await inquiries.findOne({ reference, supplierKey: { $in: keys } }, { session })) as InquiryRow | null;
}

export interface PickerItem {
  reference: string;
  productName: string;
  category: string | null;
  quantity: number;
  unit: string | null;
  status: string;
  statusLabel: string;
  buyer: string;
  receivedLabel: string;
  existing: { reference: string; status: string } | null;
  href: string;
}

/** The inquiries this supplier may quote: addressed to its own sellers, from a registered buyer, not closed / cancelled / declined. Search and pagination are server side. */
export async function listQuotableInquiries(context: SupplierContext, query: { q: string; page: number; limit: number }) {
  const keys = keysOf(context);
  const meta = { total: 0, page: query.page, limit: query.limit, totalPages: 0 };
  if (keys.length === 0) return { items: [] as PickerItem[], meta, noSellers: true };
  const { inquiries, quotes } = await stores();
  const and: Filter<InquiryDoc>[] = [{ supplierKey: { $in: keys }, status: { $in: QUOTABLE_INQUIRY_STATUSES }, buyerId: { $exists: true } }];
  if (query.q) {
    const upper = escapeRegex(query.q.toUpperCase());
    and.push({ $or: [{ reference: { $regex: `^${upper}` } }, { productName: { $regex: escapeRegex(query.q), $options: "i" } }] });
  }
  const filter: Filter<InquiryDoc> = { $and: and };
  const [docs, total] = await Promise.all([
    inquiries
      .find(filter, { projection: { reference: 1, productName: 1, categoryName: 1, quantity: 1, unit: 1, status: 1, buyerId: 1, createdAt: 1 } })
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .toArray(),
    inquiries.countDocuments(filter),
  ]);
  const ids = docs.map((d) => d._id!);
  const [open, names] = await Promise.all([
    ids.length ? quotes.find({ inquiryId: { $in: ids }, supplierKey: { $in: keys }, openKey: { $exists: true } }, { projection: { inquiryId: 1, reference: 1, status: 1 } }).toArray() : [],
    (async () => {
      const buyerIds = [...new Set(docs.flatMap((d) => (d.buyerId ? [String(d.buyerId)] : [])))].map((id) => new ObjectId(id));
      const map = new Map<string, string>();
      if (buyerIds.length) for (const r of await (await getDb()).collection<{ _id: ObjectId; companyName?: string }>("users").find({ _id: { $in: buyerIds } }, { projection: { companyName: 1 } }).toArray()) if (r.companyName?.trim()) map.set(String(r._id), r.companyName.trim());
      return map;
    })(),
  ]);
  const byInquiry = new Map(open.map((q) => [String(q.inquiryId), q]));
  const items: PickerItem[] = docs
    .filter((d) => d.reference)
    .map((d) => {
      const status = supplierInquiryStatus(d.status);
      const existing = byInquiry.get(String(d._id));
      return {
        reference: d.reference!,
        productName: d.productName ?? "General inquiry",
        category: d.categoryName ?? null,
        quantity: d.quantity,
        unit: d.unit ?? null,
        status: status.status,
        statusLabel: status.label,
        buyer: (d.buyerId && names.get(String(d.buyerId))) || "Individual buyer",
        receivedLabel: formatSubmitted(d.createdAt.toISOString()),
        existing: existing ? { reference: existing.reference, status: existing.status } : null,
        href: `/supplier/quotations/create?inquiryReference=${d.reference}`,
      };
    });
  return { items, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) }, noSellers: false };
}

// ---------- configured options ----------
export function quoteOptions() {
  const rules = getTaxRules();
  return {
    currencies: [...QUOTE_CURRENCIES],
    taxRules: rules.map((r) => ({ id: r.id, version: r.version, label: r.label, kind: r.kind, bp: r.bp })),
    deliveryTerms: DELIVERY_TERMS.map((d) => ({ ...d })),
    paymentTypes: PAYMENT_TYPES.map((p) => ({ ...p })),
    limits: { ...LIMITS, maxLines: MAX_LINES, maxExtraCharges: MAX_EXTRA_CHARGES, maxLeadDays: MAX_LEAD_DAYS, defaultValidityDays: DEFAULT_VALIDITY_DAYS, maxValidityDays: MAX_VALIDITY_DAYS },
    policyVersion: CALC_POLICY_VERSION,
  };
}

export interface Capabilities {
  submit: { available: boolean; reasons: string[] };
  attachments: { available: false; reason: string };
  pdf: { available: false; reason: string };
  multiLine: { available: false; reason: string };
}
function capabilitiesFor(context: SupplierContext): Capabilities {
  const reasons: string[] = [];
  if (!context.permissions.manageQuotations) reasons.push("Your role cannot submit quotations.");
  if (getTaxRules().length === 0) reasons.push("No approved tax treatment is configured on this platform yet (QUOTATION_TAX_RULES), so a quotation cannot be submitted. You can still save drafts.");
  return {
    submit: { available: reasons.length === 0, reasons },
    attachments: { available: false, reason: "Attachments are not available: there is no private upload storage a buyer can download from (the buyer's quotation page cannot open attachments), so an upload would never reach the buyer." },
    pdf: { available: false, reason: "A PDF document is not available: there is no PDF generation or private document storage for quotations yet." },
    multiLine: { available: false, reason: `A quotation holds ${MAX_LINES} line item: the buyer's quotation pages show one product, quantity and unit price per quotation.` },
  };
}

// ---------- products (the company's own catalogue, bounded and paginated) ----------
export interface ProductChoice {
  key: string;
  name: string;
  unit: string;
  moq: { quantity: number; unit: string } | null;
  source: "catalog" | "sample";
}
function productsOf(keys: string[]): ProductChoice[] {
  const catalog = getCatalog();
  const out: ProductChoice[] = [];
  for (const key of keys) {
    const sellerId = catalog.sellerById.has(key) ? key : ADOPTED_SELLERS[key];
    if (sellerId) for (const p of catalog.productsBySeller.get(sellerId) ?? []) out.push({ key: String(p.id), name: p.name, unit: "Piece", moq: null, source: "catalog" });
    for (const p of getProductsBySupplier(`/suppliers/${key}`)) out.push({ key: p.id, name: p.name, unit: p.priceUnit, moq: p.moq !== undefined && p.moqUnit ? { quantity: p.moq, unit: p.moqUnit } : null, source: "sample" });
  }
  return out;
}

/** Name search over the company's OWN products only (never the whole catalogue), 20 per page by default, 50 at most. */
export function searchOwnProducts(context: SupplierContext, query: { q: string; page: number; limit: number }) {
  const all = productsOf(keysOf(context));
  const needle = query.q.toLowerCase();
  const hits = needle ? all.filter((p) => p.name.toLowerCase().includes(needle)) : all;
  const start = (query.page - 1) * query.limit;
  return { items: hits.slice(start, start + query.limit), meta: { total: hits.length, page: query.page, limit: query.limit, totalPages: Math.ceil(hits.length / query.limit) } };
}

/** Product ownership and source rules: a catalogue line must be one of THIS company's products; a manual line carries no product key. */
function productChecks(context: SupplierContext, input: QuoteInput, inquiry: Pick<InquiryDoc, "productKey">): Record<string, string> {
  const f: Record<string, string> = {};
  const line = input.lines[0];
  if (!line) return f;
  if (line.source === "MANUAL" && line.productKey) f["lines.0.productKey"] = "A manual item has no catalogue product.";
  if (line.source === "CATALOGUE") {
    const ref = line.productKey ? resolveProduct(line.productKey) : undefined;
    if (!ref || !keysOf(context).includes(ref.supplierKey)) f["lines.0.productKey"] = "Choose one of your own products.";
  }
  if (line.source === "INQUIRY" && line.productKey && line.productKey !== (inquiry.productKey ?? "")) f["lines.0.productKey"] = "This is not the product the buyer asked for.";
  return f;
}

// ---------- the inquiry as the supplier sees it ----------
export interface InquiryView {
  reference: string;
  status: string;
  statusLabel: string;
  buyer: string;
  productName: string | null;
  category: string | null;
  quantity: number;
  unit: string | null;
  deliveryLocation: string | null;
  receivedLabel: string;
}
async function inquiryView(inquiry: InquiryRow): Promise<InquiryView> {
  const s = supplierInquiryStatus(inquiry.status);
  return {
    reference: inquiry.reference!,
    status: s.status,
    statusLabel: s.label,
    buyer: await buyerName(inquiry.buyerId),
    productName: inquiry.productName ?? null,
    category: inquiry.categoryName ?? null,
    quantity: inquiry.quantity,
    unit: inquiry.unit ?? null,
    deliveryLocation: inquiry.deliveryLocation?.text ?? null,
    receivedLabel: formatSubmitted(inquiry.createdAt.toISOString()),
  };
}

/** What the client sent laid over the defaults: a field the client did not send keeps its default (so a partial first save still has the inquiry's quantity and a validity date). */
function overlay(defaults: QuoteInput, raw: unknown, norm: QuoteInput): QuoteInput {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...defaults };
  for (const k of Object.keys(norm)) if (k !== "lines" && k in r) out[k] = (norm as unknown as Record<string, unknown>)[k];
  const result = out as unknown as QuoteInput;
  if (Array.isArray(r.lines) && r.lines.length > 0) {
    const sent = (r.lines[0] && typeof r.lines[0] === "object" ? r.lines[0] : {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...(defaults.lines[0] ?? emptyLine()) };
    const normLine = (norm.lines[0] ?? emptyLine()) as unknown as Record<string, unknown>;
    for (const k of Object.keys(normLine)) if (k in sent) merged[k] = normLine[k];
    result.lines = [merged as unknown as QuoteInput["lines"][number]];
  }
  return result;
}

function defaultsFor(inquiry: InquiryRow, now = Date.now()): QuoteInput {
  const base = emptyInput(now);
  base.validUntil = defaultValidity(now);
  base.lines = [{ ...emptyLine(), source: "INQUIRY", productKey: inquiry.productKey ?? "", name: inquiry.productName ?? "", quantity: String(inquiry.quantity ?? ""), unit: inquiry.unit ?? "" }];
  return base;
}

export interface QuotationContext {
  inquiry: InquiryView;
  eligible: boolean;
  ineligibleReason: string | null;
  existing: { reference: string; status: string } | null;
  defaults: QuoteInput;
  options: ReturnType<typeof quoteOptions>;
  supplier: { name: string; city: string | null };
  capabilities: Capabilities;
}

/** Everything the form needs for one inquiry, in one read (the picker and the form share it). null = not this company's inquiry. */
export async function getQuotationContext(context: SupplierContext, reference: string): Promise<QuotationContext | null> {
  const inquiry = await loadInquiry(context, reference);
  if (!inquiry) return null;
  const { quotes } = await stores();
  const [view, open] = await Promise.all([inquiryView(inquiry), quotes.findOne({ inquiryId: inquiry._id, supplierKey: { $in: keysOf(context) }, openKey: { $exists: true } }, { projection: { reference: 1, status: 1 } })]);
  const el = eligibilityOf(inquiry);
  return {
    inquiry: view,
    eligible: el.ok,
    ineligibleReason: el.ok ? null : el.message,
    existing: open ? { reference: open.reference, status: open.status } : null,
    defaults: defaultsFor(inquiry),
    options: quoteOptions(),
    supplier: { name: context.profile.displayName, city: context.profile.city },
    capabilities: capabilitiesFor(context),
  };
}

// ---------- mapping an input onto the stored quotation fields ----------
function commercialFields(input: QuoteInput, inquiry: Pick<InquiryDoc, "productName" | "quantity" | "unit" | "deliveryLocation">, rule: TaxRule | null) {
  const line = input.lines[0] ?? emptyLine();
  const qty = parseQuantity(line.quantity);
  const price = parseMoney(line.unitPrice, "The unit price");
  const discount = (() => {
    if (line.discountKind === "NONE" || !line.discountValue) return null;
    const d = line.discountKind === "PERCENT" ? parsePercent(line.discountValue) : parseMoney(line.discountValue);
    return d.ok ? (line.discountKind === "PERCENT" ? ({ kind: "PERCENT", bp: d.value } as const) : ({ kind: "AMOUNT", minor: d.value } as const)) : null;
  })();
  const charges: { label: string; minor: number }[] = [];
  const freight = input.freight ? parseMoney(input.freight) : null;
  if (freight?.ok && freight.value > 0) charges.push({ label: "Freight", minor: freight.value });
  input.charges.forEach((c, i) => {
    const a = c.amount ? parseMoney(c.amount) : null;
    if (a?.ok) charges.push({ label: c.label || `Charge ${i + 1}`, minor: a.value });
  });
  const moq = line.moq ? parseQuantity(line.moq) : null;
  const lead = Number(input.leadTimeDays);
  const validUntil = validityEnd(input.validUntil) ?? validityEnd(defaultValidity())!;
  return {
    productName: line.name || inquiry.productName || "Draft quotation",
    currency: input.currency || "INR",
    unit: line.unit || inquiry.unit || null,
    quantity: qty.ok ? qty.value : Math.max(1, inquiry.quantity || 1),
    unitPriceMinor: price.ok ? price.value : 0,
    discount,
    tax: rule ? taxOf(rule) : null,
    charges,
    moq: moq?.ok && line.unit ? { quantity: moq.value, unit: line.unit } : null,
    terms: {
      deliveryMinDays: Number.isInteger(lead) && lead > 0 ? lead : null,
      deliveryMaxDays: Number.isInteger(lead) && lead > 0 ? lead : null,
      deliveryLocation: inquiry.deliveryLocation?.text ?? null,
      incoterms: input.deliveryTerms || null,
      paymentTerms: paymentText(input),
      remarks: input.notes || null,
    },
    validUntil,
  };
}

function productSnapshotOf(input: QuoteInput) {
  const line = input.lines[0];
  const detail = line?.productKey ? getPublicProductByKey(line.productKey) : undefined;
  if (!detail) return undefined;
  return { description: detail.shortDescription ?? detail.description ?? null, specs: detail.specifications.slice(0, 30).map((s) => ({ label: s.label, value: s.unit ? `${s.value} ${s.unit}` : s.value })), features: detail.features.slice(0, 20) };
}

/** The stored quotation document of a new REVISION draft (Page 44): same reference and inquiry, version + 1, not current, a copy of the base version's own commercial data as the editable input. */
export function revisionDraftDoc(args: { context: SupplierContext; user: PublicUser; base: QuotationDoc; inquiry: InquiryRow; input: QuoteInput; reason: string; now: Date }): QuotationDoc {
  const { context, user, base, inquiry, input, reason, now } = args;
  const doc: QuotationDoc = {
    reference: base.reference,
    version: base.version + 1,
    isCurrent: false,
    inquiryId: base.inquiryId,
    inquiryReference: base.inquiryReference,
    buyerId: base.buyerId,
    supplierKey: base.supplierKey,
    supplierName: base.supplierName,
    ...(base.supplierSlug ? { supplierSlug: base.supplierSlug } : {}),
    ...(base.productKey ? { productKey: base.productKey } : {}),
    ...commercialFields(input, inquiry, getTaxRule(input.taxRuleId)),
    status: "DRAFT",
    sentAt: now,
    createdAt: now,
    updatedAt: now,
    events: [],
    revision: 1,
    schemaVersion: 1,
    supplierCompanyId: context.companyId,
    draft: { input, complete: isComplete(input, inquiry, now), savedAt: now },
    revisionOf: base.version,
    revisionReason: reason,
    createdBy: new ObjectId(user.id),
    updatedBy: new ObjectId(user.id),
  };
  const snapshot = productSnapshotOf(input);
  if (snapshot) doc.productSnapshot = snapshot;
  return doc;
}

const isComplete = (input: QuoteInput, inquiry: InquiryRow, now: Date) => {
  const fields = validateForSubmit(input, { inquiry: { quantity: inquiry.quantity, unit: inquiry.unit ?? null, productName: inquiry.productName ?? null }, taxRules: getTaxRules(), now });
  return Object.keys(fields).length === 0;
};

// ---------- the draft as the form sees it ----------
export interface DraftView {
  reference: string;
  /** The version this draft is (1 for a first quotation; 2 or more for a revision). */
  version: number;
  revisionOf: number | null;
  revisionReason: string | null;
  revision: number;
  status: string;
  input: QuoteInput;
  inquiry: InquiryView;
  eligible: boolean;
  ineligibleReason: string | null;
  savedAt: string;
  savedLabel: string;
  calculation: Calculation;
  options: ReturnType<typeof quoteOptions>;
  supplier: { name: string; city: string | null };
  capabilities: Capabilities;
}

async function toDraftView(context: SupplierContext, doc: QuotationDoc & { _id: ObjectId }, inquiry: InquiryRow): Promise<DraftView> {
  const stored = doc.draft?.input ? normaliseInput(doc.draft.input).value : defaultsFor(inquiry);
  const el = eligibilityOf(inquiry);
  return {
    reference: doc.reference,
    version: doc.version,
    revisionOf: doc.revisionOf ?? null,
    revisionReason: doc.revisionReason ?? null,
    revision: doc.revision ?? 0,
    status: doc.status,
    input: stored,
    inquiry: await inquiryView(inquiry),
    eligible: el.ok,
    ineligibleReason: el.ok ? null : el.message,
    savedAt: (doc.draft?.savedAt ?? doc.updatedAt).toISOString(),
    savedLabel: formatSubmitted((doc.draft?.savedAt ?? doc.updatedAt).toISOString()),
    calculation: computeQuote(stored, getTaxRule(stored.taxRuleId)),
    options: quoteOptions(),
    supplier: { name: context.profile.displayName, city: context.profile.city },
    capabilities: capabilitiesFor(context),
  };
}

async function loadOwnDraft(context: SupplierContext, reference: string, session?: ClientSession) {
  const keys = keysOf(context);
  if (keys.length === 0 || !QUOTATION_REFERENCE.test(reference)) return null;
  const { quotes, inquiries } = await stores();
  // the version being worked on: the highest version that is the current offer OR a draft (a revision draft is not current until it is submitted)
  const doc = (await quotes.findOne({ reference, supplierKey: { $in: keys }, $or: [{ isCurrent: true }, { status: "DRAFT" }] }, { session, sort: { version: -1 } })) as (QuotationDoc & { _id: ObjectId }) | null;
  if (!doc) return null;
  const inquiry = (await inquiries.findOne({ _id: doc.inquiryId, supplierKey: { $in: keys } }, { session })) as InquiryRow | null;
  return inquiry ? { doc, inquiry } : null;
}

export async function getDraft(context: SupplierContext, reference: string): Promise<{ ok: true; draft: DraftView } | Failure> {
  const found = await loadOwnDraft(context, reference);
  if (!found) return fail(404, "NOT_FOUND", "Quotation not found.");
  if (found.doc.status !== "DRAFT") return fail(409, "NOT_A_DRAFT", "This quotation has been submitted and can no longer be edited here.", { data: { status: found.doc.status } });
  return { ok: true, draft: await toDraftView(context, found.doc, found.inquiry) };
}

// ---------- audit ----------
async function audit(userId: string, type: string, reference: string, companyId: ObjectId, extra: Record<string, unknown> = {}) {
  await (await getDb()).collection("security_events").insertOne({ userId: new ObjectId(userId), type, at: new Date(), reference, companyId, ...extra }).catch(() => undefined);
}

// ---------- create / update a draft ----------
export async function createDraft(context: SupplierContext, user: PublicUser, body: { inquiryReference: unknown; input?: unknown }, now = new Date()): Promise<{ ok: true; draft: DraftView; created: boolean } | Failure> {
  if (!context.permissions.manageQuotations) return fail(403, "FORBIDDEN", "Your role cannot create quotations.");
  const reference = typeof body.inquiryReference === "string" ? body.inquiryReference.trim().toUpperCase() : "";
  const inquiry = await loadInquiry(context, reference);
  const el = eligibilityOf(inquiry);
  if (!el.ok) return el;
  let input = defaultsFor(el.inquiry, now.getTime());
  if (body.input !== undefined) {
    const norm = normaliseInput(body.input);
    if (Object.keys(norm.fields).length > 0) return fail(422, "VALIDATION", "Check the highlighted fields.", { fields: norm.fields });
    input = overlay(input, body.input, norm.value);
  }
  const checks = productChecks(context, input, el.inquiry);
  if (Object.keys(checks).length > 0) return fail(422, "VALIDATION", "Check the highlighted fields.", { fields: checks });

  const { quotes } = await stores();
  const rule = getTaxRule(input.taxRuleId);
  const openKey = `${el.inquiry._id}:${el.inquiry.supplierKey}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const doc: QuotationDoc = {
      reference: generateQuotationReference(),
      version: 1,
      isCurrent: true,
      inquiryId: el.inquiry._id,
      inquiryReference: el.inquiry.reference!,
      buyerId: el.inquiry.buyerId!,
      supplierKey: el.inquiry.supplierKey,
      supplierName: el.inquiry.supplierName,
      ...(el.inquiry.supplierSlug ? { supplierSlug: el.inquiry.supplierSlug } : {}),
      ...(el.inquiry.productKey ? { productKey: el.inquiry.productKey } : {}),
      ...commercialFields(input, el.inquiry, rule),
      status: "DRAFT",
      // a draft has not been sent: this only keeps the field required by the shared type; the real send time is written at submission
      sentAt: now,
      createdAt: now,
      updatedAt: now,
      events: [],
      revision: 1,
      schemaVersion: 1,
      supplierCompanyId: context.companyId,
      draft: { input, complete: isComplete(input, el.inquiry, now), savedAt: now },
      openKey,
      createdBy: new ObjectId(user.id),
      updatedBy: new ObjectId(user.id),
    };
    const snapshot = productSnapshotOf(input);
    if (snapshot) doc.productSnapshot = snapshot;
    try {
      const { insertedId } = await quotes.insertOne(doc);
      await audit(user.id, "supplier_quotation_draft_created", doc.reference, context.companyId);
      return { ok: true, created: true, draft: await toDraftView(context, { ...doc, _id: insertedId }, el.inquiry) };
    } catch (error) {
      const e = error as { code?: number; message?: string };
      if (e.code !== 11000) throw error;
      if (/openKey|quotation_open_per_inquiry/.test(e.message ?? "")) {
        // an open quotation already exists for this inquiry: continue it if it is this company's draft; free the slot if that quotation is finished
        const existing = (await quotes.findOne({ openKey, supplierKey: { $in: keysOf(context) } })) as (QuotationDoc & { _id: ObjectId }) | null;
        if (!existing) continue;
        const finished = existing.status === "REJECTED" || existing.status === "WITHDRAWN" || ((existing.status === "SENT" || existing.status === "REVISION_REQUESTED") && existing.validUntil.getTime() <= now.getTime());
        if (finished) {
          await quotes.updateOne({ _id: existing._id, openKey }, { $unset: { openKey: "" } });
          continue;
        }
        if (existing.status === "DRAFT") return { ok: true, created: false, draft: await toDraftView(context, existing, el.inquiry) };
        return fail(409, "ALREADY_QUOTED", `A quotation (${existing.reference}) has already been submitted for this inquiry.`, { data: { reference: existing.reference, status: existing.status } });
      }
      // reference collision: generate another
    }
  }
  return fail(409, "CONFLICT", "The quotation could not be created. Please try again.");
}

export async function updateDraft(context: SupplierContext, user: PublicUser, reference: string, body: { expectedRevision: unknown; input: unknown }, now = new Date()): Promise<{ ok: true; draft: DraftView } | Failure> {
  if (!context.permissions.manageQuotations) return fail(403, "FORBIDDEN", "Your role cannot edit quotations.");
  const expected = body.expectedRevision;
  if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 0 || expected > 1_000_000) return fail(422, "VALIDATION", "Send the revision you started from.", { fields: { expectedRevision: "The expected revision is required." } });
  const norm = normaliseInput(body.input);
  if (Object.keys(norm.fields).length > 0) return fail(422, "VALIDATION", "Check the highlighted fields.", { fields: norm.fields });
  const found = await loadOwnDraft(context, reference);
  if (!found) return fail(404, "NOT_FOUND", "Quotation not found.");
  if (found.doc.status !== "DRAFT") return fail(409, "NOT_A_DRAFT", "This quotation has been submitted and can no longer be edited.", { data: { status: found.doc.status } });
  const checks = productChecks(context, norm.value, found.inquiry);
  if (Object.keys(checks).length > 0) return fail(422, "VALIDATION", "Check the highlighted fields.", { fields: checks });

  const { quotes } = await stores();
  const input = norm.value;
  const set: Partial<QuotationDoc> = {
    ...commercialFields(input, found.inquiry, getTaxRule(input.taxRuleId)),
    draft: { input, complete: isComplete(input, found.inquiry, now), savedAt: now },
    updatedAt: now,
    updatedBy: new ObjectId(user.id),
    revision: expected + 1,
  };
  const snapshot = productSnapshotOf(input);
  const filter: Filter<QuotationDoc> = { _id: found.doc._id, supplierKey: { $in: keysOf(context) }, status: "DRAFT", ...(expected === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision: expected }) };
  const result = await quotes.updateOne(filter, snapshot ? { $set: { ...set, productSnapshot: snapshot } } : { $set: set, $unset: { productSnapshot: "" } });
  if (result.matchedCount !== 1) {
    const now2 = await loadOwnDraft(context, reference);
    if (!now2) return fail(404, "NOT_FOUND", "Quotation not found.");
    if (now2.doc.status !== "DRAFT") return fail(409, "NOT_A_DRAFT", "This quotation was submitted just now and can no longer be edited.", { data: { status: now2.doc.status } });
    return fail(409, "STALE_REVISION", "This draft was changed somewhere else (another person or tab). Reload it to see the latest version before saving.", { data: { currentRevision: now2.doc.revision ?? 0 } });
  }
  await audit(user.id, "supplier_quotation_draft_updated", reference, context.companyId, { revision: expected + 1 });
  const fresh = await loadOwnDraft(context, reference);
  return { ok: true, draft: await toDraftView(context, fresh!.doc, fresh!.inquiry) };
}

// ---------- preview ----------
export interface PreviewView {
  calculation: Calculation;
  taxRule: { id: string; version: string; label: string } | null;
  blocking: Record<string, string>;
  canSubmit: boolean;
  stale: boolean;
  revision: number;
  validUntilLabel: string | null;
  terms: { label: string; value: string | null }[];
  line: { name: string; source: string; quantity: string; unit: string; unitPrice: string; moq: string | null } | null;
}

/** Validates and calculates exactly as submission would, without writing anything or telling the buyer. Uses the input in the body when given (not saved), else the saved draft. */
export async function previewDraft(context: SupplierContext, reference: string, body: { input?: unknown; expectedRevision?: unknown }, now = new Date()): Promise<{ ok: true; preview: PreviewView } | Failure> {
  const found = await loadOwnDraft(context, reference);
  if (!found) return fail(404, "NOT_FOUND", "Quotation not found.");
  if (found.doc.status !== "DRAFT") return fail(409, "NOT_A_DRAFT", "This quotation has been submitted.", { data: { status: found.doc.status } });
  let input = found.doc.draft?.input ? normaliseInput(found.doc.draft.input).value : defaultsFor(found.inquiry);
  if (body.input !== undefined) {
    const norm = normaliseInput(body.input);
    if (Object.keys(norm.fields).length > 0) return fail(422, "VALIDATION", "Check the highlighted fields.", { fields: norm.fields });
    input = norm.value;
  }
  const rule = getTaxRule(input.taxRuleId);
  const calc = computeQuote(input, rule);
  const blocking = {
    ...validateForSubmit(input, { inquiry: { quantity: found.inquiry.quantity, unit: found.inquiry.unit ?? null, productName: found.inquiry.productName ?? null }, taxRules: getTaxRules(), now }),
    ...productChecks(context, input, found.inquiry),
  };
  const el = eligibilityOf(found.inquiry);
  if (!el.ok) blocking.inquiry = el.message;
  if (!context.permissions.manageQuotations) blocking.permission = "Your role cannot submit quotations.";
  const line = input.lines[0];
  const end = validityEnd(input.validUntil);
  return {
    ok: true,
    preview: {
      calculation: calc,
      taxRule: rule ? { id: rule.id, version: rule.version, label: rule.label } : null,
      blocking,
      canSubmit: Object.keys(blocking).length === 0 && calc.total !== null,
      stale: typeof body.expectedRevision === "number" && body.expectedRevision !== (found.doc.revision ?? 0),
      revision: found.doc.revision ?? 0,
      validUntilLabel: end ? `${dayLabel(end)} (ends 11:59 pm India time)` : null,
      terms: [
        { label: "Lead time", value: input.leadTimeDays ? `${input.leadTimeDays} days` : null },
        { label: "Delivery terms", value: DELIVERY_TERMS.find((d) => d.value === input.deliveryTerms)?.label ?? null },
        { label: "Delivery location (the buyer's)", value: found.inquiry.deliveryLocation?.text ?? null },
        { label: "Payment terms", value: paymentText(input) },
        { label: "Notes", value: input.notes || null },
      ],
      line: line ? { name: line.name, source: line.source, quantity: line.quantity, unit: line.unit, unitPrice: line.unitPrice, moq: line.moq || null } : null,
    },
  };
}

// ---------- submit (atomic, idempotent) ----------
export interface SubmitResponse {
  reference: string;
  version: number;
  status: "SENT";
  currency: string;
  total: string;
  submittedAt: string;
  /** true when this was a new version that replaced the previous current offer. */
  revised: boolean;
}
export type SubmitOutcome = ({ ok: true; response: SubmitResponse; replayed: boolean; buyerNotice: "recorded" | "pending" | "not-recorded" }) | Failure;

const hashOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const PATH_TO_QUOTED: Partial<Record<InquiryStatus, InquiryStatus[]>> = { NEW: ["IN_PROGRESS", "QUOTED"], NOTIFIED: ["IN_PROGRESS", "QUOTED"], IN_PROGRESS: ["QUOTED"], REPLIED: ["QUOTED"], QUOTED: [] };

export interface SubmitBody {
  expectedRevision: unknown;
  expectedTotal: unknown;
  expectedTaxRuleVersion: unknown;
  idempotencyKey: unknown;
  confirm: unknown;
}

export async function submitQuotation(context: SupplierContext, user: PublicUser, reference: string, body: SubmitBody, now = new Date()): Promise<SubmitOutcome> {
  if (!context.permissions.manageQuotations) return fail(403, "FORBIDDEN", "Your role cannot submit quotations.");
  if (body.confirm !== true) return fail(422, "VALIDATION", "Confirm the submission to continue.", { fields: { confirm: "Confirmation is required." } });
  if (typeof body.idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(body.idempotencyKey)) return fail(422, "VALIDATION", "A valid idempotency key is required.", { fields: { idempotencyKey: "Send a key of 16 to 64 letters, digits, - or _." } });
  const expectedRevision = body.expectedRevision;
  if (typeof expectedRevision !== "number" || !Number.isInteger(expectedRevision) || expectedRevision < 0) return fail(422, "VALIDATION", "Send the revision you reviewed.", { fields: { expectedRevision: "The expected revision is required." } });
  if (typeof body.expectedTotal !== "string" || !/^\d{1,16}\.\d{2}$/.test(body.expectedTotal)) return fail(422, "VALIDATION", "Send the total you reviewed.", { fields: { expectedTotal: "The reviewed total is required." } });
  if (typeof body.expectedTaxRuleVersion !== "string" || body.expectedTaxRuleVersion.length > 40) return fail(422, "VALIDATION", "Send the tax treatment version you reviewed.", { fields: { expectedTaxRuleVersion: "Required." } });
  if (!QUOTATION_REFERENCE.test(reference)) return fail(404, "NOT_FOUND", "Quotation not found.");

  const key = body.idempotencyKey;
  const expectedTotal = body.expectedTotal;
  const expectedTaxRuleVersion = body.expectedTaxRuleVersion;
  const requestHash = hashOf({ reference, expectedRevision, expectedTotal, expectedTaxRuleVersion });
  const scope = { companyId: context.companyId, userId: new ObjectId(user.id), operation: OPERATION, key };
  const { idem, outbox } = await stores();

  const replay = async (): Promise<SubmitOutcome | null> => {
    const prior = await idem.findOne(scope);
    if (!prior) return null;
    if (prior.requestHash !== requestHash) return fail(409, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different request. Review the quotation and submit again.");
    const response = prior.response as SubmitResponse;
    return { ok: true, response, replayed: true, buyerNotice: await noticeState(`quotation-received:${response.reference}:${response.version}`) };
  };
  const early = await replay();
  if (early) return early;

  const client = await getMongoClient();
  const session = client.startSession();
  let committed: { response: SubmitResponse; outboxId: ObjectId } | undefined;
  try {
    await session.withTransaction(
      async () => {
        committed = undefined;
        const found = await loadOwnDraft(context, reference, session);
        if (!found) throw new Abort(fail(404, "NOT_FOUND", "Quotation not found."));
        const { doc, inquiry } = found;
        if (doc.status !== "DRAFT") throw new Abort(fail(409, "NOT_A_DRAFT", "This quotation was already submitted.", { data: { status: doc.status } }));
        if ((doc.revision ?? 0) !== expectedRevision) throw new Abort(fail(409, "STALE_REVISION", "This draft changed after you reviewed it. Reload and review it again.", { data: { currentRevision: doc.revision ?? 0 } }));
        const el = eligibilityOf(inquiry);
        if (!el.ok) throw new Abort(el);
        const input = normaliseInput(doc.draft?.input).value;
        const fields = {
          ...validateForSubmit(input, { inquiry: { quantity: inquiry.quantity, unit: inquiry.unit ?? null, productName: inquiry.productName ?? null }, taxRules: getTaxRules(), now }),
          ...productChecks(context, input, inquiry),
        };
        if (Object.keys(fields).length > 0) throw new Abort(fail(422, getTaxRules().length === 0 && fields.taxRuleId ? "TAX_UNRESOLVED" : "VALIDATION", "Check the highlighted fields.", { fields }));
        const rule = getTaxRule(input.taxRuleId);
        if (!rule) throw new Abort(fail(422, "TAX_UNRESOLVED", "The tax treatment is not available.", { fields: { taxRuleId: "Select an available tax treatment." } }));
        const calc = computeQuote(input, rule);
        if (!calc.total || !calc.subtotal || !calc.discount || !calc.taxable) throw new Abort(fail(422, "VALIDATION", "The amounts could not be calculated.", { fields: { lines: calc.issues[0] ?? "Check the line item." } }));
        if (rule.version !== expectedTaxRuleVersion) throw new Abort(fail(409, "TAX_POLICY_CHANGED", "The tax treatment changed after you reviewed it. Review the updated calculation and submit again.", { data: { calculation: calc, taxRule: { id: rule.id, version: rule.version, label: rule.label } } }));
        if (calc.total !== expectedTotal) throw new Abort(fail(409, "TOTAL_CHANGED", "The calculated total is different from the one you reviewed. Review the updated calculation and submit again.", { data: { calculation: calc } }));

        const fieldsToStore = commercialFields(input, inquiry, rule);
        const snapshot = productSnapshotOf(input);
        const version = doc.version;
        // a revision replaces the previous CURRENT offer in this same transaction. If that offer is no longer open (the buyer accepted or rejected it, or it was
        // withdrawn) the conditional update below matches nothing and the whole submission is refused: only one lifecycle outcome can win.
        const isRevision = doc.version > 1 && !doc.isCurrent;
        let carriedOpenKey: string | undefined;
        if (isRevision) {
          const previous = await (
            await stores()
          ).quotes.findOneAndUpdate(
            { reference: doc.reference, supplierKey: { $in: keysOf(context) }, isCurrent: true, version: doc.revisionOf ?? doc.version - 1, status: { $in: ["SENT", "REVISION_REQUESTED"] } },
            { $set: { status: "SUPERSEDED", isCurrent: false, updatedAt: now }, $push: { events: { type: "SUPERSEDED" as const, at: now, actor: "system" as const } }, $unset: { openKey: "" } },
            { session, returnDocument: "before" },
          );
          if (!previous) throw new Abort(fail(409, "BASE_CHANGED", "The offer you are revising changed (the buyer may have decided on it, or it was withdrawn). Open the quotation to see its current state."));
          carriedOpenKey = previous.openKey;
        }
        const updated = await (
          await stores()
        ).quotes.updateOne(
          { _id: doc._id, status: "DRAFT", supplierKey: { $in: keysOf(context) } },
          {
            $set: {
              ...(isRevision ? { isCurrent: true, ...(carriedOpenKey ? { openKey: carriedOpenKey } : {}) } : {}),
              ...fieldsToStore,
              ...(snapshot ? { productSnapshot: snapshot } : {}),
              status: "SENT" as const,
              sentAt: now,
              updatedAt: now,
              updatedBy: new ObjectId(user.id),
              submittedBy: new ObjectId(user.id),
              revision: (doc.revision ?? 0) + 1,
              snapshot: { policyVersion: CALC_POLICY_VERSION, taxRule: { id: rule.id, version: rule.version, kind: rule.kind, label: rule.label, bp: rule.bp }, input, amounts: { subtotal: calc.subtotal, discount: calc.discount, taxable: calc.taxable, tax: calc.tax, freight: calc.freight, otherCharges: calc.otherCharges, total: calc.total }, submittedAt: now },
            },
            $push: { events: { type: "SENT" as const, at: now, actor: "supplier" as const } },
            $unset: { draft: "" },
          },
          { session },
        );
        if (updated.matchedCount !== 1) throw new Abort(fail(409, "NOT_A_DRAFT", "This quotation was already submitted."));

        // the inquiry follows its own lifecycle to QUOTED (each step is one the lifecycle allows)
        const from = normaliseStatus(inquiry.status);
        let current: InquiryStatus = from;
        const history: NonNullable<InquiryDoc["statusHistory"]> = [];
        for (const next of PATH_TO_QUOTED[from] ?? []) {
          if (!canTransition(current, next)) break;
          history.push({ from: current, to: next, actor: "system", at: now, reason: "Quotation submitted by the supplier" });
          current = next;
        }
        if (history.length > 0) await (await stores()).inquiries.updateOne({ _id: inquiry._id }, { $set: { status: current, updatedAt: now }, $push: { statusHistory: { $each: history } } }, { session });

        const response: SubmitResponse = { reference: doc.reference, version, status: "SENT", currency: fieldsToStore.currency, total: calc.total, submittedAt: now.toISOString(), revised: isRevision };
        const outboxId = new ObjectId();
        await outbox.insertOne(
          { _id: outboxId, type: isRevision ? "QUOTATION_REVISED" : "QUOTATION_SUBMITTED", supplierCompanyId: context.companyId, quotationReference: doc.reference, version, inquiryReference: doc.inquiryReference, buyerId: doc.buyerId, supplierName: doc.supplierName, totalText: formatMoney(Number(calc.total.replace(".", "")), fieldsToStore.currency), dedupeKey: `quotation-received:${doc.reference}:${version}`, status: "PENDING", attempts: 0, createdAt: now },
          { session },
        );
        await idem.insertOne({ ...scope, requestHash, response, createdAt: now }, { session });
        committed = { response, outboxId };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } catch (error) {
    if (error instanceof Abort) {
      // a simultaneous request with the same key may have committed between our first look and now: it is answered as a replay, not as a conflict
      const again = await replay();
      return again ?? error.failure;
    }
    if ((error as { code?: number }).code === 11000) {
      // another request with the same key committed first: answer exactly as it did (or refuse a changed body)
      const again = await replay();
      if (again) return again;
    }
    console.error("quotation submit failed", (error as Error).message);
    throw error;
  } finally {
    await session.endSession();
  }
  if (!committed) return fail(409, "CONFLICT", "The submission could not be completed. Please try again.");
  await audit(user.id, "supplier_quotation_submitted", reference, context.companyId, { version: committed.response.version });
  // after the commit: the buyer's in-app notice. A failure here never undoes or repeats the submission; the outbox row keeps it for a retry.
  await deliverOutbox(committed.outboxId);
  return { ok: true, response: committed.response, replayed: false, buyerNotice: await noticeState(`quotation-received:${committed.response.reference}:${committed.response.version}`) };
}
