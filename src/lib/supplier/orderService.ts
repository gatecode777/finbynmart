import { type Filter, type Sort } from "mongodb";
import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { inquiriesCollection } from "@/lib/inquiries/service";
import { formatSubmitted } from "@/lib/inquiries/confirmation";
import { EXPECTED_SOURCES, REFERENCE_PATTERN, escapeRegex, isOrderStatus, plainAmount, type OrderStatus } from "@/lib/orders/orderRules";
import { ordersCollection, type OrderDoc, type OrderEvent } from "@/lib/orders/service";
import { formatMoney } from "@/lib/quotations/money";
import { quotationsCollection } from "@/lib/quotations/service";
import type { SupplierContext } from "./company";
import {
  EXPORT_HEADER,
  EXPORT_MAX_ROWS,
  PAYMENT_UNAVAILABLE,
  STATUS_LABEL,
  canExportOrders,
  fulfilmentLabel,
  groupKeyOf,
  itemSummary,
  quantityText,
  statusesFor,
  tabCountsFrom,
  zeroCounts,
  type GroupKey,
  type SupplierOrderQuery,
  type TabCounts,
} from "./orderRules";
import { csvCell } from "./quotationRules";
import { INDIVIDUAL, buyerNames } from "./quotationService";

/**
 * The supplier's side of orders (Page 45): list, counts, a read-only detail and a bounded CSV export, on the ONE `orders` collection the buyer's side
 * reads (no second order store, no copy per portal). Everything is scoped by the company's own seller keys (`context.company.sellerKeys`, resolved
 * from the verified session in `requireSupplierApi/Page`, never from a request): an order whose `supplierKey` is not one of them is "not found", the
 * same answer as an unknown or malformed reference. An order has exactly one buyer and one supplier, so there is nothing of another supplier to hide.
 *
 * What this file does NOT do, because nothing it would need exists: it creates no order (no checkout or order-confirmation workflow exists), changes no
 * status (no supplier lifecycle workflow: confirming, cancelling, dispatching), derives no payment status (no ledger), and invents no shipment or stock.
 * Amounts and item names are the order's own stored snapshot: the catalogue is only used for a product link, never for a name or a price.
 */
const keysOf = (context: SupplierContext) => context.company.sellerKeys;

let indexReady: Promise<unknown> | undefined;
/** The supplier-scoped read paths for the list sorts, the status filter and the currency list. Idempotent. The dashboard's `supplier_orders_placed` stays (it is a prefix of the first). */
async function collection() {
  const col = await ordersCollection();
  indexReady ??= Promise.all([
    col.createIndex({ supplierKey: 1, placedAt: -1, _id: -1 }, { name: "supplier_orders_newest" }),
    col.createIndex({ supplierKey: 1, status: 1, placedAt: -1, _id: -1 }, { name: "supplier_orders_status" }),
    col.createIndex({ supplierKey: 1, updatedAt: -1, _id: -1 }, { name: "supplier_orders_updated" }),
    // one currency at a time: the amount sorts (currency fixed by equality) and the list of currencies in use (keys only)
    col.createIndex({ supplierKey: 1, currency: 1, totalMinor: -1, _id: -1 }, { name: "supplier_orders_amount" }),
  ]).catch((error) => {
    indexReady = undefined;
    throw error;
  });
  await indexReady;
  return col;
}

const dateOnly = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(d);

// ---------- filters ----------
/** Every filter EXCEPT the status: the counts are taken under it, so each chip shows what it would return. */
function baseFilter(keys: string[], query: SupplierOrderQuery): Filter<OrderDoc> {
  const and: Filter<OrderDoc>[] = [{ supplierKey: { $in: keys } }];
  if (query.q) {
    const text = escapeRegex(query.q);
    const upper = escapeRegex(query.q.toUpperCase());
    // references are stored upper case, so a prefix match is a plain case-sensitive one; the product name is a substring match inside this supplier's own orders.
    // The buyer's name is NOT searched: an order stores only the buyer's id, and the users collection has no index to search a business name by.
    and.push({ $or: [{ reference: { $regex: `^${upper}` } }, { quotationReference: { $regex: `^${upper}` } }, { inquiryReference: { $regex: `^${upper}` } }, { "items.name": { $regex: text, $options: "i" } }] });
  }
  if (query.from && query.to) {
    const field = query.dateBasis === "updated" ? "updatedAt" : "placedAt";
    and.push({ [field]: { $gte: query.from, $lt: query.to } } as Filter<OrderDoc>);
  }
  if (query.currency) and.push({ currency: query.currency });
  return and.length === 1 ? and[0] : { $and: and };
}

const SORTS: Record<SupplierOrderQuery["sort"], Sort> = {
  newest: { placedAt: -1, _id: -1 },
  oldest: { placedAt: 1, _id: 1 },
  updated: { updatedAt: -1, _id: -1 },
  amount_high: { totalMinor: -1, _id: -1 },
  amount_low: { totalMinor: 1, _id: 1 },
};

/** One grouped read of the stored statuses under a filter: the counts of every chip and card. */
async function countByStatus(filter: Filter<OrderDoc>): Promise<TabCounts> {
  const rows = await (await collection()).aggregate<{ _id: string; n: number }>([{ $match: filter }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray();
  return tabCountsFrom(Object.fromEntries(rows.map((r) => [String(r._id), r.n])));
}

/** The currencies that really appear in this company's orders (at most 10): keys only, the currency list never depends on the filters. */
async function currenciesOf(keys: string[]): Promise<string[]> {
  const rows = await (await collection()).aggregate<{ _id: string }>([{ $match: { supplierKey: { $in: keys } } }, { $group: { _id: "$currency" } }, { $sort: { _id: 1 } }, { $limit: 10 }]).toArray();
  return rows.map((r) => String(r._id));
}

// ---------- list ----------
export interface SupplierOrderRow {
  reference: string;
  placedAt: string;
  placedLabel: string;
  updatedLabel: string;
  buyer: string;
  itemName: string;
  itemText: string;
  quantityText: string;
  itemCount: number;
  amount: { text: string; currency: string };
  status: OrderStatus;
  statusGroup: GroupKey;
  statusLabel: string;
  fulfilment: string;
  payment: typeof PAYMENT_UNAVAILABLE;
  quotationReference: string | null;
  detailHref: string;
}

function toRow(doc: OrderDoc, buyer: string): SupplierOrderRow {
  const first = doc.items[0];
  return {
    reference: doc.reference,
    placedAt: doc.placedAt.toISOString(),
    placedLabel: dateOnly(doc.placedAt),
    updatedLabel: dateOnly(doc.updatedAt),
    buyer,
    itemName: first.name,
    itemText: itemSummary(first.name, doc.itemCount),
    quantityText: doc.itemCount > 1 ? `${doc.itemCount} items` : quantityText(first.quantity, first.unit),
    itemCount: doc.itemCount,
    amount: { text: formatMoney(doc.totalMinor, doc.currency), currency: doc.currency },
    status: doc.status,
    statusGroup: groupKeyOf(doc.status),
    statusLabel: STATUS_LABEL[doc.status],
    fulfilment: fulfilmentLabel(doc.status),
    payment: PAYMENT_UNAVAILABLE,
    quotationReference: doc.quotationReference ?? null,
    detailHref: `/supplier/orders/${doc.reference}`,
  };
}

/** Only what a row needs: the first item, never the events or the rest of the items. */
const LIST_PROJECTION = { reference: 1, buyerId: 1, quotationReference: 1, items: { $slice: 1 }, itemCount: 1, currency: 1, totalMinor: 1, status: 1, placedAt: 1, updatedAt: 1 } as const;

export interface SupplierOrderCapabilities {
  /** Whether the company's role may download the list (a permission), independent of whether there is anything to export. */
  canExport: boolean;
  exportReason: string | null;
  /** No order can be created, confirmed, cancelled or updated by a supplier: no workflow exists. These say so, with the reason. */
  create: { available: false; reason: string };
  confirm: { available: false; reason: string };
  updateFulfilment: { available: false; reason: string };
  payments: { available: false; reason: string };
}

const BLOCKED = "No supplier order workflow exists yet (nothing in Finbyn Mart creates, confirms, cancels or dispatches an order), so this is not offered.";

export function capabilitiesFor(context: SupplierContext): SupplierOrderCapabilities {
  const canExport = canExportOrders(context.permissions);
  return {
    canExport,
    exportReason: canExport ? null : "Your role cannot export orders.",
    create: { available: false, reason: "Orders are not created here. No checkout or order-confirmation workflow exists yet, so this page lists the orders that already exist for your company." },
    confirm: { available: false, reason: BLOCKED },
    updateFulfilment: { available: false, reason: BLOCKED },
    payments: { available: false, reason: PAYMENT_UNAVAILABLE.reason },
  };
}

export interface SupplierOrderPage {
  orders: SupplierOrderRow[];
  /** Order counts per chip under the active search, date and currency filters (the status is NOT applied to them). */
  counts: TabCounts;
  currencies: string[];
  capabilities: SupplierOrderCapabilities;
  noSellers: boolean;
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export async function listSupplierOrders(context: SupplierContext, query: SupplierOrderQuery): Promise<SupplierOrderPage> {
  const keys = keysOf(context);
  const capabilities = capabilitiesFor(context);
  if (keys.length === 0) return { orders: [], counts: zeroCounts(), currencies: [], capabilities, noSellers: true, meta: { total: 0, page: query.page, limit: query.limit, totalPages: 0 } };
  const col = await collection();
  const base = baseFilter(keys, query);
  const statuses = statusesFor(query.status);
  const filter: Filter<OrderDoc> = statuses ? { $and: [base, { status: { $in: statuses } }] } : base;
  const [docs, total, counts, currencies] = await Promise.all([
    col.find(filter, { projection: LIST_PROJECTION }).sort(SORTS[query.sort]).skip((query.page - 1) * query.limit).limit(query.limit).toArray(),
    col.countDocuments(filter),
    countByStatus(base),
    currenciesOf(keys),
  ]);
  const names = await buyerNames(docs.map((d) => d.buyerId));
  const rows = docs.filter((d) => isOrderStatus(d.status) && d.items.length > 0).map((d) => toRow(d, names.get(String(d.buyerId)) ?? INDIVIDUAL));
  return { orders: rows, counts, currencies, capabilities, noSellers: false, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
}

/** The counts alone (the same numbers the list carries), for a caller that does not need rows. */
export async function getSupplierOrderSummary(context: SupplierContext, query: SupplierOrderQuery): Promise<{ counts: TabCounts; currencies: string[]; scope: { search: boolean; dateRange: string; dateBasis: string; currency: string | null }; noSellers: boolean }> {
  const keys = keysOf(context);
  const scope = { search: query.q !== "", dateRange: query.rangeKey, dateBasis: query.dateBasis, currency: query.currency };
  if (keys.length === 0) return { counts: zeroCounts(), currencies: [], scope, noSellers: true };
  const [counts, currencies] = await Promise.all([countByStatus(baseFilter(keys, query)), currenciesOf(keys)]);
  return { counts, currencies, scope, noSellers: false };
}

// ---------- detail ----------
export interface SupplierOrderDetail {
  order: {
    reference: string;
    status: OrderStatus;
    statusGroup: GroupKey;
    statusLabel: string;
    fulfilment: string;
    placedLabel: string;
    updatedLabel: string;
    amount: { text: string; currency: string };
    itemCount: number;
    expectedDelivery: { label: string; source: string } | null;
  };
  buyer: string;
  payment: typeof PAYMENT_UNAVAILABLE;
  items: { name: string; quantityText: string; unitPrice: string; productUrl: string | null }[];
  itemsShown: number;
  /** A link only when the record really is one of this company's own (the reference alone is never a link). */
  quotation: { reference: string; href: string | null } | null;
  inquiry: { reference: string; href: string | null } | null;
  events: { label: string; actor: string; atLabel: string; reason: string | null }[];
  cancellationRequest: { atLabel: string; reason: string; previousStatusLabel: string } | null;
  capabilities: SupplierOrderCapabilities & { print: true };
}

const ACTOR: Record<OrderEvent["actor"], string> = { buyer: "Buyer", supplier: "Your company", system: "Finbyn Mart" };
const ITEMS_SHOWN = 100;

export async function getSupplierOrderDetail(context: SupplierContext, reference: string): Promise<SupplierOrderDetail | null> {
  const keys = keysOf(context);
  if (keys.length === 0 || !REFERENCE_PATTERN.test(reference)) return null;
  const doc = await (await collection()).findOne({ reference, supplierKey: { $in: keys } });
  if (!doc || !isOrderStatus(doc.status) || doc.items.length === 0) return null;
  const [names, quote, inquiry] = await Promise.all([
    buyerNames([doc.buyerId]),
    // a link only for records that are this company's own: checked, not assumed from the stored reference
    doc.quotationReference ? (await quotationsCollection()).findOne({ reference: doc.quotationReference, supplierKey: { $in: keys } }, { projection: { _id: 1 } }) : Promise.resolve(null),
    doc.inquiryReference ? (await inquiriesCollection()).findOne({ reference: doc.inquiryReference, supplierKey: { $in: keys } }, { projection: { _id: 1 } }) : Promise.resolve(null),
  ]);
  const shown = doc.items.slice(0, ITEMS_SHOWN);
  return {
    order: {
      reference: doc.reference,
      status: doc.status,
      statusGroup: groupKeyOf(doc.status),
      statusLabel: STATUS_LABEL[doc.status],
      fulfilment: fulfilmentLabel(doc.status),
      placedLabel: formatSubmitted(doc.placedAt.toISOString()),
      updatedLabel: formatSubmitted(doc.updatedAt.toISOString()),
      amount: { text: formatMoney(doc.totalMinor, doc.currency), currency: doc.currency },
      itemCount: doc.itemCount,
      expectedDelivery: doc.expectedDelivery ? { label: dateOnly(doc.expectedDelivery.date), source: EXPECTED_SOURCES[doc.expectedDelivery.source] } : null,
    },
    buyer: names.get(String(doc.buyerId)) ?? INDIVIDUAL,
    payment: PAYMENT_UNAVAILABLE,
    items: shown.map((i) => ({
      name: i.name,
      quantityText: quantityText(i.quantity, i.unit),
      unitPrice: `${formatMoney(i.unitPriceMinor, doc.currency)}${i.unit ? ` / ${i.unit}` : ""}`,
      productUrl: i.productKey ? (getPublicProductByKey(i.productKey)?.url ?? null) : null,
    })),
    itemsShown: shown.length,
    quotation: doc.quotationReference ? { reference: doc.quotationReference, href: quote ? `/supplier/quotations/${doc.quotationReference}` : null } : null,
    inquiry: doc.inquiryReference ? { reference: doc.inquiryReference, href: inquiry ? `/supplier/inquiries/${doc.inquiryReference}` : null } : null,
    events: doc.events.filter((e) => isOrderStatus(e.type)).slice(-100).map((e) => ({ label: STATUS_LABEL[e.type], actor: ACTOR[e.actor] ?? "Finbyn Mart", atLabel: formatSubmitted(e.at.toISOString()), reason: e.reason ?? null })),
    cancellationRequest: doc.cancellationRequest ? { atLabel: formatSubmitted(doc.cancellationRequest.at.toISOString()), reason: doc.cancellationRequest.reason, previousStatusLabel: STATUS_LABEL[doc.cancellationRequest.previousStatus] ?? "Unknown" } : null,
    capabilities: { ...capabilitiesFor(context), print: true },
  };
}

// ---------- export ----------
const inIndia = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().replace("T", " ").slice(0, 16);
const EXPORT_ITEMS = 20;

/**
 * The company's own orders under the current search, status and filters as CSV text, newest first, at most EXPORT_MAX_ROWS. The file is built and
 * sent in the one response: nothing is stored, so there is no link to share and nothing to expire. Buyer = business name only; no contact, address,
 * payment or other supplier's data exists in it (an order has one supplier). Payment is the honest "Payment status unavailable".
 */
export async function exportSupplierOrdersCsv(context: SupplierContext, query: SupplierOrderQuery): Promise<{ csv: string; rows: number; truncated: boolean }> {
  const keys = keysOf(context);
  const head = `${EXPORT_HEADER.map(csvCell).join(",")}\r\n`;
  if (keys.length === 0) return { csv: head, rows: 0, truncated: false };
  const base = baseFilter(keys, query);
  const statuses = statusesFor(query.status);
  const filter: Filter<OrderDoc> = statuses ? { $and: [base, { status: { $in: statuses } }] } : base;
  const docs = await (await collection())
    .find(filter, { projection: { reference: 1, buyerId: 1, quotationReference: 1, items: { $slice: EXPORT_ITEMS }, itemCount: 1, currency: 1, totalMinor: 1, status: 1, placedAt: 1, updatedAt: 1 } })
    .sort(SORTS.newest)
    .limit(EXPORT_MAX_ROWS + 1)
    .toArray();
  const truncated = docs.length > EXPORT_MAX_ROWS;
  const rows = docs.slice(0, EXPORT_MAX_ROWS).filter((d) => isOrderStatus(d.status));
  const names = await buyerNames(rows.map((d) => d.buyerId));
  const body = rows.map((d) => {
    const items = d.items.map((i) => `${i.name} x ${quantityText(i.quantity, i.unit)}`).join("; ");
    return [
      d.reference,
      inIndia(d.placedAt),
      inIndia(d.updatedAt),
      names.get(String(d.buyerId)) ?? INDIVIDUAL,
      d.itemCount > d.items.length ? `${items}; (+${d.itemCount - d.items.length} more)` : items,
      d.currency,
      plainAmount(d.totalMinor),
      STATUS_LABEL[d.status],
      fulfilmentLabel(d.status),
      PAYMENT_UNAVAILABLE.label,
      d.quotationReference ?? "",
    ];
  });
  return { csv: [EXPORT_HEADER, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n", rows: rows.length, truncated };
}
