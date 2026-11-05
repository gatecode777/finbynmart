import { AWAITING_STATUSES } from "@/lib/inquiries/buyerListRules";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { getCatalog } from "@/lib/catalog/data";
import { getProductBySlug as getSampleProduct } from "@/lib/constants/categoryPages";
import { emptySupplierQuery, getSupplierListing } from "@/lib/catalog/supplierListing";
import { INQUIRY_TYPES, normaliseStatus } from "@/lib/inquiries/rules";
import { STATUS_INFO } from "@/lib/inquiries/timeline";
import { countWishlist } from "@/lib/wishlist/service";
import { countSavedSuppliers } from "@/lib/wishlist/supplierService";
import { bucketStarts, percentChange, type RangeInfo } from "./dateRange";

/**
 * The buyer dashboard's data, composed from what exists. Everything is scoped by `buyerId`, which callers take from the
 * verified session and never from a request. Modules that do not exist yet (quotations, orders and their value, cart,
 * notifications, company records, business verification) are reported as `{ available: false }`, never as zero.
 *
 * Counting policy (also in docs/backend/PAGE_22_KPI_CALCULATIONS.md):
 *  - Total inquiries: every inquiry the buyer submitted whose createdAt is in the range, whatever its status later became.
 *    Guest inquiries are not linked to an account and are never counted.
 *  - Active inquiries (activity panel): the buyer's inquiries that are NEW, NOTIFIED or IN_PROGRESS right now (not range bound).
 *  - Recent inquiries: the latest five overall (not range bound).
 *
 * Each section is computed independently; one that fails is reported as `{ status: "error" }` and the others still render.
 */
export type Section<T> = { status: "ok"; data: T } | { status: "error"; message: string };
export interface Unavailable {
  available: false;
  reason: string;
}

// the same group My Inquiries calls "awaiting response" (one definition, so the two pages cannot disagree)
const ACTIVE_STATUSES = [...AWAITING_STATUSES, "new"];
const MAX_CATEGORY_GROUPS = 300;
const TOP_CATEGORIES = 4;

let indexReady: Promise<unknown> | undefined;
async function inquiries() {
  const collection = (await getDb()).collection("inquiries");
  indexReady ??= Promise.all([collection.createIndex({ buyerId: 1, createdAt: -1 }), collection.createIndex({ buyerId: 1, status: 1 })]);
  await indexReady;
  return collection;
}

async function timed<T>(timings: Record<string, number>, name: string, run: () => Promise<T>): Promise<Section<T>> {
  const t0 = performance.now();
  try {
    return { status: "ok", data: await run() };
  } catch (error) {
    console.error(`buyer dashboard section failed: ${name}`, error instanceof Error ? error.name : "error");
    return { status: "error", message: "This section could not be loaded." };
  } finally {
    timings[name] = Math.round(performance.now() - t0);
  }
}

// ---------- inquiry statistics, trend and category inputs: ONE aggregation ----------

interface Facets {
  counts: { _id: "cur" | "prev"; n: number }[];
  trend: { _id: Date; n: number }[];
  products: { _id: string | null; n: number }[];
}

async function readInquiryFacets(buyerId: ObjectId, range: RangeInfo): Promise<Facets> {
  const [result] = await (await inquiries())
    .aggregate<Facets>([
      // the buyer and the widest date window first: both use the {buyerId, createdAt} index
      { $match: { buyerId, createdAt: { $gte: range.previousStart, $lt: range.end } } },
      {
        $facet: {
          counts: [{ $group: { _id: { $cond: [{ $gte: ["$createdAt", range.start] }, "cur", "prev"] }, n: { $sum: 1 } } }],
          trend: [
            { $match: { createdAt: { $gte: range.start } } },
            { $group: { _id: { $dateTrunc: { date: "$createdAt", unit: range.bucket, timezone: range.timezone, startOfWeek: "monday" } }, n: { $sum: 1 } } },
          ],
          products: [{ $match: { createdAt: { $gte: range.start } } }, { $group: { _id: { $ifNull: ["$productKey", null] }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: MAX_CATEGORY_GROUPS }],
        },
      },
    ])
    .toArray();
  return result ?? { counts: [], trend: [], products: [] };
}

export interface Statistics {
  totalInquiries: { value: number; previous: number; changePercent: number | null };
  quotationsReceived: Unavailable;
  ordersPlaced: Unavailable;
  totalOrderValue: Unavailable;
}

const NO_QUOTATIONS: Unavailable = { available: false, reason: "Supplier quotations are not connected yet." };
const NO_ORDERS: Unavailable = { available: false, reason: "Order tracking is not available yet." };

function statistics(facets: Facets): Statistics {
  const cur = facets.counts.find((c) => c._id === "cur")?.n ?? 0;
  const prev = facets.counts.find((c) => c._id === "prev")?.n ?? 0;
  return { totalInquiries: { value: cur, previous: prev, changePercent: percentChange(cur, prev) }, quotationsReceived: NO_QUOTATIONS, ordersPlaced: NO_ORDERS, totalOrderValue: NO_ORDERS };
}

export interface Trend {
  bucket: RangeInfo["bucket"];
  /** One entry per bucket of the range. A bucket with no inquiries is a real zero (the period is fully defined). */
  inquiries: { start: string; count: number }[];
  orders: Unavailable;
}

function trend(facets: Facets, range: RangeInfo): Trend {
  const byStart = new Map(facets.trend.map((t) => [new Date(t._id).getTime(), t.n]));
  return { bucket: range.bucket, inquiries: bucketStarts(range).map((t) => ({ start: new Date(t).toISOString(), count: byStart.get(t) ?? 0 })), orders: NO_ORDERS };
}

// ---------- categories ----------

export interface CategoryShare {
  name: string;
  count: number;
  percent: number;
}

/** The category of the product an inquiry was about. One inquiry names at most one product, so nothing is counted twice. */
export function categoryOfProduct(productKey: string | null): string {
  if (!productKey) return "General inquiries";
  if (/^\d+$/.test(productKey)) return getCatalog().productById.get(Number(productKey))?.categoryName ?? "Other";
  return getSampleProduct(productKey)?.category.name ?? "Other";
}

function categories(facets: Facets, total: number): { total: number; items: CategoryShare[] } {
  const tally = new Map<string, number>();
  for (const row of facets.products) {
    const name = categoryOfProduct(row._id);
    tally.set(name, (tally.get(name) ?? 0) + row.n);
  }
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = sorted.slice(0, TOP_CATEGORIES);
  const rest = sorted.slice(TOP_CATEGORIES).reduce((sum, [, n]) => sum + n, 0);
  const items = shown.map(([name, count]) => ({ name, count, percent: total ? Math.round((count / total) * 1000) / 10 : 0 }));
  if (rest > 0) items.push({ name: "Others", count: rest, percent: total ? Math.round((rest / total) * 1000) / 10 : 0 });
  return { total, items };
}

// ---------- recent inquiries, activity ----------

export interface RecentInquiry {
  id: string;
  reference: string | null;
  title: string;
  supplierName: string;
  createdAt: string;
  quantity: number;
  unit: string | null;
  status: string;
  statusLabel: string;
  href: string | null;
}

async function recentInquiries(buyerId: ObjectId): Promise<RecentInquiry[]> {
  const docs = await (await inquiries()).find({ buyerId }, { projection: { reference: 1, productName: 1, inquiryType: 1, type: 1, productKey: 1, supplierName: 1, createdAt: 1, quantity: 1, unit: 1, status: 1 } }).sort({ createdAt: -1 }).limit(5).toArray();
  return docs.map((doc) => {
    const status = normaliseStatus(doc.status as string);
    const type = (doc.inquiryType as string | undefined) ?? (doc.type === "inquiry" ? (doc.productKey ? "PRODUCT_INQUIRY" : "GENERAL_INQUIRY") : "GET_BEST_QUOTE");
    return {
      id: String(doc._id),
      reference: (doc.reference as string | undefined) ?? null,
      title: (doc.productName as string | undefined) ?? INQUIRY_TYPES.find((t) => t.value === type)?.label ?? "Inquiry",
      supplierName: String(doc.supplierName ?? ""),
      createdAt: (doc.createdAt as Date).toISOString(),
      quantity: Number(doc.quantity ?? 0),
      unit: (doc.unit as string | undefined) ?? null,
      status,
      statusLabel: STATUS_INFO[status]?.label ?? status,
      href: doc.reference ? `/buyer/inquiries/${doc.reference}` : null,
    };
  });
}

export interface Activity {
  activeInquiries: number;
  pendingQuotations: Unavailable;
  openOrders: Unavailable;
}

/** The buyer's active inquiries right now (the sidebar badge on every buyer page). `buyerIdText` comes from the session. */
export async function countActiveInquiries(buyerIdText: string): Promise<number> {
  return (await inquiries()).countDocuments({ buyerId: new ObjectId(buyerIdText), status: { $in: ACTIVE_STATUSES } });
}

async function activity(buyerId: ObjectId): Promise<Activity> {
  const activeInquiries = await (await inquiries()).countDocuments({ buyerId, status: { $in: ACTIVE_STATUSES } });
  return { activeInquiries, pendingQuotations: NO_QUOTATIONS, openOrders: NO_ORDERS };
}

// ---------- account status, saved items ----------

export interface AccountStatus {
  name: string;
  companyName: string | null;
  accountStatus: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  /** There is no company record or business verification process yet; email and phone verification are not business verification. */
  businessVerification: Unavailable;
}

async function accountStatus(buyerId: ObjectId): Promise<AccountStatus> {
  const user = await (await getDb()).collection("users").findOne({ _id: buyerId }, { projection: { name: 1, companyName: 1, accountStatus: 1, emailVerified: 1, phoneVerified: 1 } });
  if (!user) throw new Error("buyer not found");
  return {
    name: String(user.name ?? ""),
    companyName: (user.companyName as string | undefined) ?? null,
    accountStatus: (user.accountStatus as string | undefined) ?? "ACTIVE",
    emailVerified: user.emailVerified === true,
    phoneVerified: user.phoneVerified === true,
    businessVerification: { available: false, reason: "Business verification is not available yet." },
  };
}

export interface SavedCounts {
  savedProducts: number;
  savedSuppliers: number;
  cart: Unavailable;
  notifications: Unavailable;
}

// ---------- recommended suppliers ----------

export interface RecommendedSupplier {
  name: string;
  slug: string;
  city: string;
  state: string;
  url: string;
}

export interface Recommendations {
  /** True only when the list follows the buyer's own inquiry categories; otherwise it is a neutral featured list. */
  personalized: boolean;
  basis: string;
  suppliers: RecommendedSupplier[];
}

const LIMIT_SUPPLIERS = 4;

/**
 * Rule: for the categories the buyer inquired about most (excluding "General inquiries" and "Other"), the suppliers that
 * have products in that category, one category after another, no supplier twice. Anything missing is filled from the
 * default directory order and then the list is called "featured", not personalised. All suppliers here are public
 * catalogue sellers; none is shown as verified because none is (there is no verification process), and no rating,
 * review count or response time is shown because the data has none.
 */
function recommendations(topCategories: string[]): Recommendations {
  const base = getSupplierListing({ ...emptySupplierQuery(), limit: 1 }, { pageSize: 1 });
  const idByLabel = new Map(base.facets.categories.map((c) => [c.label, c.value]));
  const picked = new Map<string, RecommendedSupplier>();
  const add = (items: { slug: string; name: string; city: string; state: string; url: string }[]) => {
    for (const s of items) if (picked.size < LIMIT_SUPPLIERS && !picked.has(s.slug)) picked.set(s.slug, { name: s.name, slug: s.slug, city: s.city, state: s.state, url: s.url });
  };
  let personal = false;
  for (const name of topCategories) {
    const id = idByLabel.get(name);
    if (!id) continue;
    const before = picked.size;
    add(getSupplierListing({ ...emptySupplierQuery(), category: [id] }, { pageSize: LIMIT_SUPPLIERS }).results.items);
    if (picked.size > before) personal = true;
    if (picked.size >= LIMIT_SUPPLIERS) break;
  }
  const filled = picked.size < LIMIT_SUPPLIERS;
  if (filled) add(getSupplierListing(emptySupplierQuery(), { pageSize: LIMIT_SUPPLIERS * 2 }).results.items);
  const personalized = personal && !filled;
  return { personalized, basis: personalized ? "Suppliers with products in the categories you inquire about most." : personal ? "Suppliers in your inquiry categories, then featured suppliers." : "Featured suppliers from the directory.", suppliers: [...picked.values()] };
}

// ---------- the overview ----------

export interface Overview {
  period: { key: string; label: string; startDate: string; endDate: string; days: number; bucket: string; timezone: string };
  statistics: Section<Statistics>;
  trends: Section<Trend>;
  topInquiryCategories: Section<{ total: number; items: CategoryShare[] }>;
  recentInquiries: Section<RecentInquiry[]>;
  recentQuotations: Section<Unavailable>;
  accountStatus: Section<AccountStatus>;
  activity: Section<Activity>;
  saved: Section<SavedCounts>;
  recommendedSuppliers: Section<Recommendations>;
  meta: { generatedAt: string; timezone: string; timingsMs: Record<string, number> };
}

/** `buyerId` must come from the verified session. */
export async function getBuyerDashboardOverview(buyerIdText: string, range: RangeInfo): Promise<Overview> {
  const buyerId = new ObjectId(buyerIdText);
  const timings: Record<string, number> = {};
  const t0 = performance.now();

  const facetsP = timed(timings, "inquiryAggregation", () => readInquiryFacets(buyerId, range));
  const [facets, recent, act, account, savedCounts] = await Promise.all([
    facetsP,
    timed(timings, "recentInquiries", () => recentInquiries(buyerId)),
    timed(timings, "activity", () => activity(buyerId)),
    timed(timings, "accountStatus", () => accountStatus(buyerId)),
    timed(timings, "savedCounts", async () => ({ savedProducts: await countWishlist(buyerIdText), savedSuppliers: await countSavedSuppliers(buyerIdText), cart: { available: false, reason: "A cart is not available yet." } as Unavailable, notifications: { available: false, reason: "Notifications are not available yet." } as Unavailable })),
  ]);

  const total = facets.status === "ok" ? (facets.data.counts.find((c) => c._id === "cur")?.n ?? 0) : 0;
  const stats: Section<Statistics> = facets.status === "ok" ? { status: "ok", data: statistics(facets.data) } : facets;
  const trendSection: Section<Trend> = facets.status === "ok" ? { status: "ok", data: trend(facets.data, range) } : facets;
  const catSection: Section<{ total: number; items: CategoryShare[] }> = facets.status === "ok" ? { status: "ok", data: categories(facets.data, total) } : facets;

  const recSection = await timed(timings, "recommendations", async () => recommendations(catSection.status === "ok" ? catSection.data.items.map((i) => i.name).filter((n) => n !== "General inquiries" && n !== "Other" && n !== "Others") : []));

  timings.total = Math.round(performance.now() - t0);
  return {
    period: { key: range.key, label: range.label, startDate: range.startDate, endDate: range.endDate, days: range.days, bucket: range.bucket, timezone: range.timezone },
    statistics: stats,
    trends: trendSection,
    topInquiryCategories: catSection,
    recentInquiries: recent,
    recentQuotations: { status: "ok", data: NO_QUOTATIONS },
    accountStatus: account,
    activity: act,
    saved: savedCounts,
    recommendedSuppliers: recSection,
    meta: { generatedAt: new Date().toISOString(), timezone: range.timezone, timingsMs: timings },
  };
}
