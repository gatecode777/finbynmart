import { ObjectId } from "mongodb";
import { matchedPendingCount, matchedReceivedCount, matchedRecent } from "@/lib/leads/access";
import { getDb } from "@/lib/db/mongo";
import { adoptedSeller, getCatalog, sampleListingCount } from "@/lib/catalog/data";
import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { bucketStarts, percentChange, type RangeInfo } from "@/lib/buyer/dateRange";
import { formatSubmitted } from "@/lib/inquiries/confirmation";
import { inquiriesCollection } from "@/lib/inquiries/service";
import { ordersCollection } from "@/lib/orders/service";
import { quotationsCollection } from "@/lib/quotations/service";
import { reviews as reviewsCollection } from "@/lib/reviews/store";
import { realSellerKeys, type SupplierContext } from "./company";
import { ACTIVE_QUOTATION_STATUSES, PENDING_INQUIRY_STATUSES, RECENT_DEFAULT, TOP_DEFAULT, UNCONFIRMED_ORDER_STATUSES, computeProfileCompletion, supplierInquiryStatus } from "./dashboardRules";

/**
 * The supplier dashboard's data, composed from what exists and scoped by the company's OWN seller keys (`context.company.sellerKeys`, from the
 * verified session: never from a request). A company that owns no seller (every company at first) has nothing to count: its numbers are genuine
 * zeros and the page says why. Anything with no data source behind it (response time, supplier notifications, pending-approval products) is
 * `{ available: false }`, never a zero. Each section is computed on its own; a failing one is reported as an error and the others still render.
 *
 * Counting rules (also docs/backend/PAGE_39_SUPPLIER_KPI_RULES.md):
 *  - Total inquiries: inquiries addressed to the company's sellers whose createdAt is in the period. One inquiry names one seller, so it counts once.
 *  - Pending responses (right now, not period bound): the same group My Inquiries calls awaiting a response (NEW, NOTIFIED, IN_PROGRESS).
 *  - Active quotations (right now): the CURRENT version of each quotation lineage (never every version), sent, waiting on a decision, not expired.
 *  - Confirmed orders: orders placed in the period that left PENDING_CONFIRMATION and were not cancelled.
 */
export type Section<T> = { status: "ok"; data: T } | { status: "error"; message: string };
export interface Unavailable {
  available: false;
  reason: string;
}

export interface Metric {
  value: number;
  previous: number | null;
  /** null when it cannot be stated (the previous period had none): the page then shows no change at all. */
  changePercent: number | null;
  /** "period" metrics follow the date range; "now" metrics are the current state and ignore it. */
  scope: "period" | "now";
}

const ok = <T,>(data: T): Section<T> => ({ status: "ok", data });
const failed = <T,>(error: unknown, label: string): Section<T> => {
  console.error(`supplier dashboard ${label} failed`, (error as Error).message);
  return { status: "error", message: `${label} could not be loaded.` };
};

let indexReady: Promise<unknown> | undefined;
/** The supplier-scoped read paths. The inquiry and review indexes already exist; these cover quotations and orders by seller. Idempotent. */
async function ensureIndexes(): Promise<void> {
  indexReady ??= (async () => {
    const [inq, qt, ord] = await Promise.all([inquiriesCollection(), quotationsCollection(), ordersCollection()]);
    await Promise.all([
      inq.createIndex({ supplierKey: 1, status: 1, createdAt: -1 }, { name: "supplier_status_newest" }),
      qt.createIndex({ supplierKey: 1, isCurrent: 1, status: 1 }, { name: "supplier_current_status" }),
      qt.createIndex({ supplierKey: 1, version: 1, sentAt: -1 }, { name: "supplier_first_sent" }),
      ord.createIndex({ supplierKey: 1, placedAt: -1 }, { name: "supplier_orders_placed" }),
    ]);
  })();
  await indexReady;
}

const keysOf = (context: SupplierContext) => context.company.sellerKeys;

// ---------- the numbers ----------
/** Inquiries received in the period: DIRECT ones addressed to the company's keys plus MATCHING leads (one per inquiry), the same scope as the inbox. */
async function countInquiries(context: SupplierContext, from: Date, to: Date) {
  const [direct, matched] = await Promise.all([(await inquiriesCollection()).countDocuments({ supplierKey: { $in: keysOf(context) }, createdAt: { $gte: from, $lt: to } }), matchedReceivedCount(context.companyId, from, to)]);
  return direct + matched;
}

async function countOrders(keys: string[], from: Date, to: Date) {
  return (await ordersCollection()).countDocuments({ supplierKey: { $in: keys }, status: { $nin: [...UNCONFIRMED_ORDER_STATUSES] }, placedAt: { $gte: from, $lt: to } } as never);
}

export interface Summary {
  totalInquiries: Metric;
  pendingResponses: Metric;
  activeQuotations: Metric;
  confirmedOrders: Metric;
}

export async function getSummary(context: SupplierContext, range: RangeInfo, now = new Date()): Promise<Summary> {
  await ensureIndexes();
  const keys = keysOf(context);
  if (keys.length === 0) {
    const zero = (scope: Metric["scope"]): Metric => ({ value: 0, previous: null, changePercent: null, scope });
    return { totalInquiries: zero("period"), pendingResponses: zero("now"), activeQuotations: zero("now"), confirmedOrders: zero("period") };
  }
  const [curInq, prevInq, pending, active, curOrd, prevOrd] = await Promise.all([
    countInquiries(context, range.start, range.end),
    countInquiries(context, range.previousStart, range.previousEnd),
    Promise.all([(await inquiriesCollection()).countDocuments({ supplierKey: { $in: keys }, status: { $in: [...PENDING_INQUIRY_STATUSES] } } as never), matchedPendingCount(context.companyId)]).then(([a, b]) => a + b),
    (await quotationsCollection()).countDocuments({ supplierKey: { $in: keys }, isCurrent: true, status: { $in: [...ACTIVE_QUOTATION_STATUSES] }, validUntil: { $gt: now } } as never),
    countOrders(keys, range.start, range.end),
    countOrders(keys, range.previousStart, range.previousEnd),
  ]);
  return {
    totalInquiries: { value: curInq, previous: prevInq, changePercent: percentChange(curInq, prevInq), scope: "period" },
    pendingResponses: { value: pending, previous: null, changePercent: null, scope: "now" },
    activeQuotations: { value: active, previous: null, changePercent: null, scope: "now" },
    confirmedOrders: { value: curOrd, previous: prevOrd, changePercent: percentChange(curOrd, prevOrd), scope: "period" },
  };
}

// ---------- business snapshot ----------
const catalogProductCount = (key: string): number => {
  const catalog = getCatalog();
  if (catalog.sellerById.has(key)) return catalog.productsBySeller.get(key)?.length ?? 0;
  const adopted = adoptedSeller(key);
  return (adopted ? (catalog.productsBySeller.get(adopted.id)?.length ?? 0) : 0) + sampleListingCount(key);
};

const slugOf = (key: string): string => getCatalog().sellerById.get(key)?.slug ?? key;

export interface Snapshot {
  products: { active: number; pendingApproval: Unavailable; draft: Unavailable };
  profile: { percent: number; missing: { key: string; label: string; hint: string }[]; notCounted: readonly { key: string; label: string; reason: string }[] };
  averageResponseTime: Unavailable;
  rating: { average: number; count: number } | null;
}

export async function getSnapshot(context: SupplierContext): Promise<Snapshot> {
  const keys = keysOf(context);
  const p = context.profile;
  const completion = computeProfileCompletion({ displayName: p.displayName, contactName: p.contactName, city: p.city, phone: p.phone, description: p.description, emailVerified: p.emailVerified });
  let rating: Snapshot["rating"] = null;
  if (keys.length > 0) {
    const [row] = await (await reviewsCollection()).aggregate<{ avg: number; n: number }>([{ $match: { supplierSlug: { $in: keys.map(slugOf) }, status: "APPROVED" } }, { $group: { _id: null, avg: { $avg: "$rating" }, n: { $sum: 1 } } }]).toArray();
    if (row && row.n > 0) rating = { average: Math.round(row.avg * 10) / 10, count: row.n };
  }
  return {
    products: {
      // catalogue products of the sellers this company owns; there is no supplier product workflow, so no pending or draft state exists
      active: keys.reduce((sum, k) => sum + catalogProductCount(k), 0),
      pendingApproval: { available: false, reason: "Supplier product approval does not exist yet." },
      draft: { available: false, reason: "Supplier product drafts do not exist yet." },
    },
    profile: { percent: completion.percent, missing: completion.missing.map(({ key, label, hint }) => ({ key, label, hint })), notCounted: completion.notCounted },
    averageResponseTime: { available: false, reason: "No supplier reply is recorded anywhere yet, so there is nothing to average." },
    rating,
  };
}

// ---------- recent inquiries ----------
export interface RecentInquiry {
  reference: string;
  buyer: string;
  product: string;
  category: string | null;
  quantity: string | null;
  receivedAt: string;
  receivedLabel: string;
  status: string;
  pending: boolean;
}

/**
 * The latest inquiries addressed to the company's sellers. The buyer is shown as the business name they gave when they registered (or "Individual
 * buyer"): never an email address, phone number, name, account detail or note. One extra query reads those business names for the page's few buyers.
 */
export async function getRecentInquiries(context: SupplierContext, limit = RECENT_DEFAULT): Promise<RecentInquiry[]> {
  const keys = keysOf(context);
  if (keys.length === 0) return [];
  const [direct, matched] = await Promise.all([
    (await inquiriesCollection())
      .find({ supplierKey: { $in: keys } }, { projection: { reference: 1, buyerId: 1, buyerType: 1, productName: 1, categoryName: 1, quantity: 1, unit: 1, status: 1, createdAt: 1 } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray(),
    matchedRecent(context.companyId, limit),
  ]);
  // direct and matching leads together, newest first (the inbox's own scope)
  const docs = [...direct, ...matched].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  const buyerIds = [...new Set(docs.flatMap((d) => (d.buyerId ? [String(d.buyerId)] : [])))].map((id) => new ObjectId(id));
  const names = new Map<string, string>();
  if (buyerIds.length > 0) {
    const rows = await (await getDb()).collection<{ _id: ObjectId; companyName?: string }>("users").find({ _id: { $in: buyerIds } }, { projection: { companyName: 1 } }).toArray();
    for (const r of rows) if (r.companyName?.trim()) names.set(String(r._id), r.companyName.trim());
  }
  return docs
    .filter((d) => d.reference)
    .map((d) => {
      const s = supplierInquiryStatus(d.status);
      return {
        reference: d.reference!,
        buyer: (d.buyerId && names.get(String(d.buyerId))) || "Individual buyer",
        product: d.productName ?? "General inquiry",
        category: d.categoryName ?? null,
        quantity: d.quantity ? `${d.quantity.toLocaleString("en-IN")}${d.unit ? ` ${d.unit}` : ""}` : null,
        receivedAt: d.createdAt.toISOString(),
        receivedLabel: formatSubmitted(d.createdAt.toISOString()),
        status: s.label,
        pending: s.pending,
      };
    });
}

// ---------- top products ----------
export interface TopProduct {
  key: string;
  name: string;
  sku: string;
  inquiries: number;
  href: string;
  image: { src: string; remote: boolean } | null;
  price: string;
}

/** Ranked by inquiries in the period that named the product (one inquiry names at most one). Page views and quotation revisions are not inquiries. */
export async function getTopProducts(context: SupplierContext, range: RangeInfo, limit = TOP_DEFAULT): Promise<TopProduct[]> {
  const keys = keysOf(context);
  if (keys.length === 0) return [];
  const rows = await (await inquiriesCollection())
    .aggregate<{ _id: string; n: number }>([
      { $match: { supplierKey: { $in: keys }, createdAt: { $gte: range.start, $lt: range.end }, productKey: { $type: "string" } } },
      { $group: { _id: "$productKey", n: { $sum: 1 } } },
      { $sort: { n: -1, _id: 1 } },
      { $limit: limit * 3 },
    ])
    .toArray();
  const out: TopProduct[] = [];
  for (const row of rows) {
    const product = getPublicProductByKey(row._id);
    if (!product) continue; // an unknown product is never invented
    const price = product.pricing;
    out.push({
      key: row._id,
      name: product.name,
      sku: product.id,
      inquiries: row.n,
      href: product.url,
      image: product.images[0] ? { src: product.images[0].src, remote: product.images[0].remote } : null,
      price: price && price.min > 0 ? `Est. ₹${price.min.toLocaleString("en-IN")}${price.unit ? ` / ${price.unit}` : ""}` : "Price on request",
    });
    if (out.length === limit) break;
  }
  return out;
}

// ---------- the performance chart ----------
export interface Performance {
  bucket: RangeInfo["bucket"];
  points: { start: string; inquiries: number; quotations: number; orders: number }[];
  totals: { inquiries: number; quotations: number; orders: number };
}

/**
 * Three separate events on three separate dates: an inquiry when it was received, a quotation when its FIRST version was sent (a revision is not a
 * new quotation), an order when it was placed. IST buckets (days up to a month, weeks up to ~4 months, otherwise months).
 */
export async function getPerformance(context: SupplierContext, range: RangeInfo): Promise<Performance> {
  await ensureIndexes();
  const keys = keysOf(context);
  const starts = bucketStarts(range);
  const zero = new Map<number, number>();
  if (keys.length === 0) return { bucket: range.bucket, points: starts.map((t) => ({ start: new Date(t).toISOString(), inquiries: 0, quotations: 0, orders: 0 })), totals: { inquiries: 0, quotations: 0, orders: 0 } };
  const trunc = (field: string) => ({ $dateTrunc: { date: field, unit: range.bucket, timezone: range.timezone, startOfWeek: "monday" } });
  const group = (field: string) => [{ $group: { _id: trunc(field), n: { $sum: 1 } } }];
  const read = async (rows: Promise<{ _id: Date; n: number }[]>) => {
    const map = new Map(zero);
    for (const r of await rows) map.set(new Date(r._id).getTime(), r.n);
    return map;
  };
  const [inq, qt, ord] = await Promise.all([
    read((await inquiriesCollection()).aggregate<{ _id: Date; n: number }>([{ $match: { supplierKey: { $in: keys }, createdAt: { $gte: range.start, $lt: range.end } } }, ...group("$createdAt")]).toArray()),
    read((await quotationsCollection()).aggregate<{ _id: Date; n: number }>([{ $match: { supplierKey: { $in: keys }, version: 1, status: { $ne: "DRAFT" }, sentAt: { $gte: range.start, $lt: range.end } } }, ...group("$sentAt")]).toArray()),
    read((await ordersCollection()).aggregate<{ _id: Date; n: number }>([{ $match: { supplierKey: { $in: keys }, status: { $nin: [...UNCONFIRMED_ORDER_STATUSES] }, placedAt: { $gte: range.start, $lt: range.end } } }, ...group("$placedAt")]).toArray()),
  ]);
  const points = starts.map((t) => ({ start: new Date(t).toISOString(), inquiries: inq.get(t) ?? 0, quotations: qt.get(t) ?? 0, orders: ord.get(t) ?? 0 }));
  const sum = (k: "inquiries" | "quotations" | "orders") => points.reduce((s, p) => s + p[k], 0);
  return { bucket: range.bucket, points, totals: { inquiries: sum("inquiries"), quotations: sum("quotations"), orders: sum("orders") } };
}

// ---------- the whole dashboard ----------
export interface DashboardData {
  company: { name: string; city: string | null; verification: "Not verified"; linkedSellers: number; sellerNames: string[] };
  summary: Section<Summary>;
  snapshot: Section<Snapshot>;
  recentInquiries: Section<RecentInquiry[]>;
  topProducts: Section<TopProduct[]>;
  notifications: Unavailable;
  capabilities: { ordersAvailable: boolean; responsesAvailable: boolean; notificationsAvailable: boolean; ratingsAvailable: boolean; productManagement: boolean; quotationCreation: boolean };
}

/** Everything except the chart (loaded separately so a slow chart never delays the numbers). */
export async function getSupplierDashboard(context: SupplierContext, range: RangeInfo): Promise<DashboardData> {
  const keys = keysOf(context);
  const linked = realSellerKeys(keys);
  const sellerNames = linked.map((k) => getCatalog().sellerById.get(k)?.name ?? k).slice(0, 5);
  const [summary, snapshot, recent, top] = await Promise.all([
    getSummary(context, range).then(ok, (e) => failed<Summary>(e, "The summary")),
    getSnapshot(context).then(ok, (e) => failed<Snapshot>(e, "The business snapshot")),
    getRecentInquiries(context).then(ok, (e) => failed<RecentInquiry[]>(e, "Recent inquiries")),
    getTopProducts(context, range).then(ok, (e) => failed<TopProduct[]>(e, "Top products")),
  ]);
  return {
    company: { name: context.profile.displayName, city: context.profile.city, verification: "Not verified", linkedSellers: linked.length, sellerNames },
    summary,
    snapshot,
    recentInquiries: recent,
    topProducts: top,
    notifications: { available: false, reason: "No event creates a notification for a supplier yet." },
    // what this server can really do today; the browser only shows it
    capabilities: { ordersAvailable: true, responsesAvailable: true, notificationsAvailable: false, ratingsAvailable: true, productManagement: true, quotationCreation: true },
  };
}
