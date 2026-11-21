import { ObjectId, type Filter } from "mongodb";
import { inquiriesCollection } from "@/lib/inquiries/service";
import { EXPIRING_DAYS, DAY_MS, STATUS_LABEL, effectiveStatus, type EffectiveStatus } from "@/lib/quotations/quotationRules";
import { breakdownRows, quotationsCollection, tabFilter, termsRows, totals, type QuotationDoc } from "@/lib/quotations/service";
import { formatMoney } from "@/lib/quotations/money";
import { SOURCE_LABEL, sourceOf } from "./inquiryRules";
import { MAX_PAGE, MAX_PAGE_SIZE, PAGE_SIZE, QUOTATION_REF_RE, minorToDecimal, sameAmount, type QuotationListState } from "./quotationAdminRules";

/**
 * Admin Quotation Management (Page 58): READ-ONLY oversight over the ONE quotation system (`quotations`, `src/lib/quotations/`). Nothing here writes: no accept, reject, edit, create, order,
 * notification, inventory or "viewed" update, and reading never changes a timestamp.
 *
 * Visibility: a row is the CURRENT submitted version (`isCurrent: true`, status not DRAFT). The supplier's `draft` working copy is never projected, a revision draft is never read (it is
 * `isCurrent: false` and DRAFT), and earlier submitted versions are summarised in the detail only. Money is shown from the version's own stored fields and its stored commercial snapshot,
 * never from today's catalogue, tax settings or supplier profile; an inconsistency is reported, never repaired.
 */
export interface Caps { inquiries: boolean }

let indexReady: Promise<unknown> | undefined;
async function col() {
  const c = await quotationsCollection();
  indexReady ??= Promise.all([
    c.createIndex({ isCurrent: 1, sentAt: -1, _id: -1 }, { name: "admin_quotations_newest" }),
    c.createIndex({ inquiryReference: 1, sentAt: -1 }, { name: "admin_quotations_by_requirement" }),
  ]).catch((e) => { indexReady = undefined; throw e; });
  await indexReady;
  return c;
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const money = (minor: number, currency: string) => formatMoney(minor, currency);

/** The same conditions as the buyer tabs (one shared `tabFilter`), with the expiring-soon ones split out of Active so the filters match the badges, plus Withdrawn. */
export function statusCondition(status: QuotationListState["status"], now: Date): Filter<QuotationDoc> | null {
  if (status === "withdrawn") return { status: "WITHDRAWN" };
  if (status === "active") return { status: "SENT", validUntil: { $gt: new Date(now.getTime() + EXPIRING_DAYS * DAY_MS) } };
  return tabFilter(status, now);
}
/** Current, submitted versions only; the search is an anchored, escaped, upper-case reference prefix on the quotation or requirement reference. */
export function listFilter(s: Pick<QuotationListState, "q" | "status">, now: Date): Filter<QuotationDoc> {
  const and: Filter<QuotationDoc>[] = [{ isCurrent: true, status: { $ne: "DRAFT" } }];
  const term = s.q.trim().toUpperCase();
  if (term) and.push({ $or: [{ reference: { $regex: `^${escapeRe(term)}` } }, { inquiryReference: { $regex: `^${escapeRe(term)}` } }] });
  const cond = statusCondition(s.status, now);
  if (cond) and.push(cond);
  return { $and: and };
}

export interface QuotationRow {
  reference: string;
  requirementReference: string;
  supplierName: string;
  total: string | null;
  currency: string;
  status: EffectiveStatus;
  statusLabel: string;
  version: number;
  submittedAt: string;
  validUntil: string;
}
export interface QuotationList { items: QuotationRow[]; referenceTime: string; meta: { page: number; limit: number; total: number; totalPages: number } }

function rowOf(d: QuotationDoc, now: Date): QuotationRow {
  const st = effectiveStatus(d.status, d.validUntil, now);
  const t = totals(d);
  return { reference: d.reference, requirementReference: d.inquiryReference, supplierName: d.supplierName || "Supplier name not provided", total: t ? money(t.totalMinor, d.currency) : null, currency: d.currency, status: st, statusLabel: STATUS_LABEL[st], version: d.version, submittedAt: d.sentAt.toISOString(), validUntil: d.validUntil.toISOString() };
}
const LIST_PROJECTION = { reference: 1, inquiryReference: 1, supplierName: 1, version: 1, status: 1, validUntil: 1, sentAt: 1, currency: 1, unitPriceMinor: 1, quantity: 1, discount: 1, tax: 1, charges: 1 };

/** One bounded page, newest SUBMISSION first (`sentAt`, never a draft timestamp) with the unique _id as tie-break, and one count under the same filter, both at one reference time. */
export async function listAdminQuotations(s: QuotationListState, limit = PAGE_SIZE, now = new Date()): Promise<QuotationList> {
  const c = await col();
  const filter = listFilter(s, now);
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
  const page = Math.max(1, Math.min(MAX_PAGE, Math.floor(s.page)));
  const [docs, total] = await Promise.all([
    c.find(filter, { projection: LIST_PROJECTION }).sort({ sentAt: -1, _id: -1 }).skip((page - 1) * size).limit(size).toArray(),
    c.countDocuments(filter),
  ]);
  return { items: docs.map((d) => rowOf(d as QuotationDoc, now)), referenceTime: now.toISOString(), meta: { page, limit: size, total, totalPages: Math.max(1, Math.ceil(total / size)) } };
}

// ---------------------------------------------------------------- detail
export interface QuotationVersionRow { version: number; current: boolean; status: EffectiveStatus; statusLabel: string; submittedAt: string; validUntil: string; total: string | null }
export interface QuotationDetail {
  reference: string;
  version: number;
  status: EffectiveStatus;
  statusLabel: string;
  submittedAt: string;
  validUntil: string;
  source: { kind: "DIRECT" | "GENERAL" | null; label: string };
  supplier: { name: string; relation: string };
  requirement: { reference: string; productName: string | null; quantity: string | null; available: boolean };
  offered: { productName: string; quantity: string; unitPrice: string; currency: string };
  breakdown: { error: string | null; rows: { label: string; value: string; strong?: boolean }[] };
  terms: { label: string; value: string | null }[];
  snapshot: { recorded: boolean; taxRule: string | null; total: string | null };
  decision: { type: "ACCEPTED" | "REJECTED"; at: string } | null;
  revisionRequestedAt: string | null;
  versions: QuotationVersionRow[];
  dataQuality: string[];
  links: { requirement: string | null };
}

const DETAIL_PROJECTION = { draft: 0, createdBy: 0, updatedBy: 0, submittedBy: 0, attachments: 0, productSnapshot: 0, openKey: 0, buyerId: 0, "snapshot.input": 0 } as const;

export async function getAdminQuotation(reference: string, caps: Caps, now = new Date()): Promise<QuotationDetail | null> {
  if (!QUOTATION_REF_RE.test(reference)) return null;
  const c = await col();
  const d = await c.findOne({ reference, isCurrent: true, status: { $ne: "DRAFT" } }, { projection: DETAIL_PROJECTION });
  if (!d) return null;
  const [history, inquiry] = await Promise.all([
    c.find({ reference, status: { $ne: "DRAFT" } }, { projection: LIST_PROJECTION }).sort({ version: -1 }).limit(50).toArray(),
    d.inquiryId ? (await inquiriesCollection()).findOne({ _id: new ObjectId(d.inquiryId), }, { projection: { sourceType: 1, supplierKey: 1, productName: 1, quantity: 1, unit: 1 } }).catch(() => null) : Promise.resolve(null),
  ]);
  const st = effectiveStatus(d.status, d.validUntil, now);
  const t = totals(d);
  const kind = inquiry ? sourceOf(inquiry) : null;
  const relation = kind === "GENERAL" ? "Responding supplier" : kind === "DIRECT" ? (inquiry && inquiry.supplierKey === d.supplierKey ? "Selected supplier" : "Matched supplier") : "Supplier";
  const snap = d.snapshot;
  const quality: string[] = [];
  if (!t) quality.push("The saved amounts could not be calculated from the stored fields. The stored values are shown as recorded and nothing was repaired.");
  if (snap && t && !sameAmount(snap.amounts.total, minorToDecimal(t.totalMinor))) quality.push(`The stored commercial snapshot total (${snap.amounts.total}) differs from the total calculated from this version's stored fields (${minorToDecimal(t.totalMinor)}). Both are the recorded values; nothing was changed.`);
  if (!snap) quality.push("This version has no stored commercial snapshot (it was submitted before snapshots were recorded). Amounts are calculated from its stored fields only.");
  if (!inquiry) quality.push("The related requirement record could not be found. The quotation is shown without it.");
  const rev = [...d.events].reverse().find((e) => e.type === "REVISION_REQUESTED");
  return {
    reference: d.reference,
    version: d.version,
    status: st,
    statusLabel: STATUS_LABEL[st],
    submittedAt: d.sentAt.toISOString(),
    validUntil: d.validUntil.toISOString(),
    source: { kind, label: kind ? SOURCE_LABEL[kind] : "Not available" },
    supplier: { name: d.supplierName || "Supplier name not provided", relation },
    requirement: { reference: d.inquiryReference, productName: inquiry?.productName ?? null, quantity: inquiry ? `${inquiry.quantity.toLocaleString("en-IN")}${inquiry.unit ? ` ${inquiry.unit}` : ""}` : null, available: Boolean(inquiry) },
    offered: { productName: d.productName, quantity: `${d.quantity.toLocaleString("en-IN")}${d.unit ? ` ${d.unit}` : ""}`, unitPrice: `${money(d.unitPriceMinor, d.currency)}${d.unit ? ` / ${d.unit}` : ""}`, currency: d.currency },
    breakdown: breakdownRows(d),
    terms: termsRows(d),
    snapshot: { recorded: Boolean(snap), taxRule: snap ? `${snap.taxRule.label} (rule ${snap.taxRule.id}, version ${snap.taxRule.version})` : null, total: snap ? snap.amounts.total : null },
    decision: d.decision ? { type: d.decision.type, at: d.decision.at.toISOString() } : null,
    revisionRequestedAt: d.status === "REVISION_REQUESTED" && rev ? rev.at.toISOString() : null,
    versions: history.map((v) => { const vs = effectiveStatus(v.status, v.validUntil, now); const vt = totals(v as QuotationDoc); return { version: v.version, current: v.isCurrent, status: vs, statusLabel: v.isCurrent ? STATUS_LABEL[vs] : v.status === "SUPERSEDED" ? "Superseded" : STATUS_LABEL[vs], submittedAt: v.sentAt.toISOString(), validUntil: v.validUntil.toISOString(), total: vt ? money(vt.totalMinor, v.currency) : null }; }),
    dataQuality: quality,
    links: { requirement: caps.inquiries ? `/admin/inquiries?review=${encodeURIComponent(d.inquiryReference)}` : null },
  };
}
