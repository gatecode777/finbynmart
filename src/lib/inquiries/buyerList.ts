import { ObjectId, type Document, type Filter, type Sort } from "mongodb";
import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { BUSINESS_LABEL, countsByFilter, escapeRegex, inquiryHref, statusesFor, summaryFrom, type InquirySummary, type ListQuery, type StatusCounts } from "./buyerListRules";
import { INQUIRY_TYPES, BUYER_CANCELLABLE, normaliseStatus, type InquiryStatus, type InquiryType } from "./rules";
import { inquiriesCollection, type InquiryDoc } from "./service";

/**
 * The buyer's own inquiry list, summary and filter choices. Every query starts from `{ buyerId }` taken from the verified session
 * (never from a request), so another buyer's or a guest's inquiry cannot be reached, and every one is bounded: pages of at most
 * 50 rows, counts and facets grouped from the buyer's own documents. Reads the Page 13 `inquiries` collection; no second collection.
 */
export interface BuyerInquiryRow {
  id: string;
  reference: string | null;
  inquiryType: InquiryType;
  inquiryTypeLabel: string;
  status: InquiryStatus;
  /** The business label (NOTIFIED is shown as the stage it means). */
  statusLabel: string;
  product: { name: string; url: string | null; imageSrc: string | null; imageRemote: boolean } | null;
  categoryName: string | null;
  supplier: { name: string; url: string | null; initials: string };
  quantity: number;
  unit: string | null;
  submittedAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  canCancel: boolean;
  /** Page 28 route for this inquiry (the reference identifies it; the page re-checks ownership). */
  detailHref: string;
  /** No quotation module exists, so no inquiry can have a linked quotation. */
  quotation: null;
}

export interface BuyerInquiryPage {
  inquiries: BuyerInquiryRow[];
  statusCounts: StatusCounts;
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "S";

const PROJECTION = { reference: 1, supplierKey: 1, supplierName: 1, supplierSlug: 1, source: 1, productKey: 1, productName: 1, categoryName: 1, inquiryType: 1, type: 1, quantity: 1, unit: 1, status: 1, createdAt: 1, updatedAt: 1, cancelledAt: 1, statusHistory: { $slice: -1 } } as const;

function typeOf(doc: Pick<InquiryDoc, "inquiryType" | "type" | "productKey">): InquiryType {
  return doc.inquiryType ?? (doc.type === "inquiry" ? (doc.productKey ? "PRODUCT_INQUIRY" : "GENERAL_INQUIRY") : "GET_BEST_QUOTE");
}

function toRow(doc: InquiryDoc): BuyerInquiryRow {
  const status = normaliseStatus(doc.status);
  const type = typeOf(doc);
  const supplier = doc.supplierSlug || doc.source === "sample" ? getPublicSupplierBySlug(doc.supplierSlug ?? doc.supplierKey) : undefined;
  const detail = doc.productKey ? getPublicProductByKey(doc.productKey) : undefined;
  // the product must still belong to the supplier the inquiry went to; otherwise it counts as gone and only the saved name is shown
  const product = detail && supplier && detail.supplier.slug === supplier.slug ? detail : undefined;
  const image = product ? (product.images.find((i) => i.primary) ?? product.images[0]) : undefined;
  const last = doc.statusHistory?.at(-1)?.at;
  return {
    id: doc._id!.toString(),
    reference: doc.reference ?? null,
    inquiryType: type,
    inquiryTypeLabel: INQUIRY_TYPES.find((t) => t.value === type)?.label ?? "Inquiry",
    status,
    statusLabel: BUSINESS_LABEL[status],
    product: doc.productKey ? { name: product?.name ?? doc.productName ?? "Product", url: product?.url ?? null, imageSrc: image?.src ?? null, imageRemote: Boolean(image?.remote) } : null,
    categoryName: doc.categoryName ?? null,
    supplier: { name: supplier?.name ?? doc.supplierName, url: supplier?.url ?? null, initials: supplier?.initials ?? initialsOf(doc.supplierName) },
    quantity: doc.quantity,
    unit: doc.unit ?? null,
    submittedAt: doc.createdAt.toISOString(),
    // records written before updatedAt existed fall back to their last status change, then to the submission time
    updatedAt: (doc.updatedAt ?? last ?? doc.createdAt).toISOString(),
    cancelledAt: doc.cancelledAt?.toISOString() ?? null,
    canCancel: BUYER_CANCELLABLE.includes(status),
    detailHref: inquiryHref(doc.reference ?? null, doc._id!.toString()),
    quotation: null,
  };
}

/** Every filter except the status tab (the tab counts are counted under the other filters, so each tab shows what it would return). */
function baseFilter(buyerId: string, q: ListQuery): Filter<InquiryDoc> {
  const and: Filter<InquiryDoc>[] = [{ buyerId: new ObjectId(buyerId) }];
  if (q.window) and.push({ createdAt: { $gte: q.window.start, $lt: q.window.end } });
  if (q.supplierId) and.push({ supplierKey: q.supplierId });
  if (q.categoryId) and.push({ categoryKey: q.categoryId });
  if (q.inquiryType) {
    // records written before inquiryType existed carry the old two-way type
    const legacy: Filter<InquiryDoc> =
      q.inquiryType === "GET_BEST_QUOTE" ? { inquiryType: { $exists: false }, type: "quote" } : q.inquiryType === "PRODUCT_INQUIRY" ? { inquiryType: { $exists: false }, type: "inquiry", productKey: { $exists: true } } : q.inquiryType === "GENERAL_INQUIRY" ? { inquiryType: { $exists: false }, type: "inquiry", productKey: { $exists: false } } : { _id: { $exists: false } };
    and.push({ $or: [{ inquiryType: q.inquiryType as InquiryType }, legacy] });
  }
  if (q.q) {
    // bounded to this buyer's own rows; the text is escaped, so it is matched literally (never as a pattern)
    const text = escapeRegex(q.q);
    and.push({ $or: [{ reference: { $regex: `^${text}`, $options: "i" } }, { productName: { $regex: text, $options: "i" } }, { supplierName: { $regex: text, $options: "i" } }] });
  }
  return { $and: and };
}

const SORT: Record<ListQuery["sort"], Sort> = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  updated: { updatedAt: -1, _id: -1 },
};

async function countStored(filter: Filter<InquiryDoc>): Promise<Record<string, number>> {
  const rows = await (await inquiriesCollection()).aggregate<{ _id: string; n: number }>([{ $match: filter as Document }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray();
  return Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
}

export async function listBuyerInquiryPage(buyerId: string, q: ListQuery): Promise<BuyerInquiryPage> {
  const col = await inquiriesCollection();
  const base = baseFilter(buyerId, q);
  const statuses = statusesFor(q.status);
  const filter: Filter<InquiryDoc> = statuses ? { $and: [base, { status: { $in: statuses } }] } : base;
  const [docs, total, stored] = await Promise.all([
    col.find(filter, { projection: PROJECTION }).sort(SORT[q.sort]).skip((q.page - 1) * q.limit).limit(q.limit).toArray(),
    col.countDocuments(filter),
    countStored(base),
  ]);
  return { inquiries: docs.map(toRow), statusCounts: countsByFilter(stored), meta: { total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) } };
}

/** The four summary numbers, over all of the buyer's inquiries (no filter), from the stored statuses. */
export async function getBuyerInquirySummary(buyerId: string): Promise<{ summary: InquirySummary; statusCounts: StatusCounts }> {
  const counts = countsByFilter(await countStored({ buyerId: new ObjectId(buyerId) }));
  return { summary: summaryFrom(counts), statusCounts: counts };
}

export interface InquiryFacets {
  suppliers: { id: string; name: string; count: number }[];
  categories: { id: string; name: string; count: number }[];
}

/** The suppliers and categories that really appear in this buyer's history (at most 100 each). Inquiries with no category are not listed under any. */
export async function getBuyerInquiryFacets(buyerId: string): Promise<InquiryFacets> {
  const col = await inquiriesCollection();
  const owner = new ObjectId(buyerId);
  const [suppliers, categories] = await Promise.all([
    col.aggregate<{ _id: string; name: string; n: number }>([{ $match: { buyerId: owner } }, { $group: { _id: "$supplierKey", name: { $first: "$supplierName" }, n: { $sum: 1 } } }, { $sort: { name: 1, _id: 1 } }, { $limit: 100 }]).toArray(),
    col.aggregate<{ _id: string; name: string; n: number }>([{ $match: { buyerId: owner, categoryKey: { $exists: true } } }, { $group: { _id: "$categoryKey", name: { $first: "$categoryName" }, n: { $sum: 1 } } }, { $sort: { name: 1, _id: 1 } }, { $limit: 100 }]).toArray(),
  ]);
  return { suppliers: suppliers.map((s) => ({ id: s._id, name: s.name, count: s.n })), categories: categories.map((c) => ({ id: c._id, name: c.name, count: c.n })) };
}
