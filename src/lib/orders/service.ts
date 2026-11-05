import { randomBytes } from "node:crypto";
import { ObjectId, type Collection, type Document, type Filter, type Sort } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { formatSubmitted } from "@/lib/inquiries/confirmation";
import { formatMoney } from "@/lib/quotations/money";
import {
  EXPORT_MAX_ROWS,
  EXPECTED_SOURCES,
  STATUS_LABEL,
  canRequestCancellation,
  deliveryLabel,
  escapeRegex,
  groupOf,
  isOrderStatus,
  plainAmount,
  statusesFor,
  summaryFrom,
  tabCountsFrom,
  toCsv,
  type ExpectedSource,
  type OrderListQuery,
  type OrderStatus,
  type OrderSummary,
  type StatusGroup,
  type TabCounts,
} from "./orderRules";

/**
 * The buyer's side of orders (Page 31): list, summary, details, a cancellation REQUEST and a CSV export. There was no order system
 * before this, and NOTHING in the application creates an order: no checkout, no supplier workflow, no automatic conversion of an
 * accepted quotation. Orders exist only when a future module (or a test) inserts them through `buildOrderDoc`. Nothing here invents
 * an order, a payment, a shipment event, an invoice or a refund. Payments, invoices, shipment tracking and returns have no module,
 * so the pages say so instead of showing placeholders.
 *
 * Isolation: every query starts from `buyerId` taken from the verified session. Another buyer's reference, an unknown one and a
 * malformed one all give the same "not found". Order snapshots (names, quantities, prices) are what the order was placed with: the
 * catalogue is only used for links and pictures, never for the amounts.
 */
export interface OrderItemDoc {
  productKey?: string;
  name: string;
  quantity: number;
  unit: string | null;
  /** Agreed unit price in minor units (paise, cents), as in the accepted quotation. */
  unitPriceMinor: number;
}

export interface OrderEvent {
  type: OrderStatus;
  at: Date;
  actor: "buyer" | "supplier" | "system";
  reason?: string;
}

export interface OrderDoc {
  _id?: ObjectId;
  reference: string;
  buyerId: ObjectId;
  supplierKey: string;
  supplierName: string;
  supplierSlug?: string;
  quotationReference?: string;
  inquiryReference?: string;
  items: OrderItemDoc[];
  /** Derived when written (see buildOrderDoc): lets the list show "+N more" without loading the items. */
  itemCount: number;
  currency: string;
  /** The agreed order total as saved with the order, in minor units. It is never recomputed from the catalogue. */
  totalMinor: number;
  status: OrderStatus;
  events: OrderEvent[];
  expectedDelivery?: { date: Date; source: ExpectedSource } | null;
  /** Derived when written: the expected date, or a far-future value when there is none, so "Expected Delivery Soon" lists dated orders first by index. */
  expectedSort: Date;
  placedAt: Date;
  updatedAt: Date;
  cancellationRequest?: { at: Date; reason: string; previousStatus: OrderStatus };
}

const NO_DATE = new Date("9999-12-31T00:00:00.000Z");
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** FBM-ORD-XXXXXXXX. Used by whatever creates orders. */
export function generateOrderReference(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % 32];
  return `FBM-ORD-${out}`;
}

export type NewOrder = Omit<OrderDoc, "_id" | "itemCount" | "expectedSort" | "updatedAt" | "events" | "reference"> & { reference?: string; events?: OrderEvent[]; updatedAt?: Date };

/** The one place an order document is assembled, so the derived fields can never be forgotten by a writer. */
export function buildOrderDoc(input: NewOrder): OrderDoc {
  const { reference, events, updatedAt, ...rest } = input;
  return {
    ...rest,
    reference: reference ?? generateOrderReference(),
    itemCount: input.items.length,
    expectedSort: input.expectedDelivery?.date ?? NO_DATE,
    events: events ?? [{ type: input.status, at: input.placedAt, actor: "system" }],
    updatedAt: updatedAt ?? input.placedAt,
  };
}

let indexReady: Promise<unknown> | undefined;
export async function ordersCollection(): Promise<Collection<OrderDoc>> {
  const col = (await getDb()).collection<OrderDoc>("orders");
  indexReady ??= Promise.all([
    col.createIndex({ reference: 1 }, { unique: true, name: "order_reference" }),
    col.createIndex({ buyerId: 1, placedAt: -1, _id: -1 }, { name: "buyer_orders_newest" }),
    col.createIndex({ buyerId: 1, status: 1, placedAt: -1, _id: -1 }, { name: "buyer_orders_status" }),
    col.createIndex({ buyerId: 1, updatedAt: -1, _id: -1 }, { name: "buyer_orders_updated" }),
    col.createIndex({ buyerId: 1, currency: 1, totalMinor: -1, _id: -1 }, { name: "buyer_orders_amount" }),
    col.createIndex({ buyerId: 1, expectedSort: 1, _id: 1 }, { name: "buyer_orders_expected" }),
  ]);
  await indexReady;
  return col;
}

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "S";

function supplierOf(doc: Pick<OrderDoc, "supplierKey" | "supplierName" | "supplierSlug">) {
  const s = getPublicSupplierBySlug(doc.supplierSlug ?? doc.supplierKey);
  return { name: s?.name ?? doc.supplierName, url: s?.url ?? null, initials: s?.initials ?? initialsOf(doc.supplierName), location: s ? `${s.city}, ${s.state}` : null };
}

function itemView(item: OrderItemDoc, currency: string) {
  const product = item.productKey ? getPublicProductByKey(item.productKey) : undefined;
  const image = product ? (product.images.find((i) => i.primary) ?? product.images[0]) : undefined;
  return {
    name: item.name,
    url: product?.url ?? null,
    imageSrc: image?.src ?? null,
    imageRemote: Boolean(image?.remote),
    quantity: item.quantity,
    unit: item.unit,
    quantityText: `${item.quantity.toLocaleString("en-IN")}${item.unit ? ` ${item.unit}` : ""}`,
    unitPrice: `${formatMoney(item.unitPriceMinor, currency)}${item.unit ? ` / ${item.unit}` : ""}`,
  };
}

// ---------- list ----------
export interface OrderRow {
  reference: string;
  placedAt: string;
  supplier: ReturnType<typeof supplierOf>;
  primaryItem: ReturnType<typeof itemView>;
  itemCount: number;
  amount: { text: string; currency: string };
  status: OrderStatus;
  statusGroup: StatusGroup;
  statusLabel: string;
  deliveryLabel: string;
  expectedDelivery: { iso: string; label: string; source: string } | null;
  quotationReference: string | null;
  cancellationRequested: boolean;
  canRequestCancellation: boolean;
  detailHref: string;
}

const dateOnly = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(d);

function toRow(doc: OrderDoc): OrderRow {
  const status = doc.status;
  return {
    reference: doc.reference,
    placedAt: doc.placedAt.toISOString(),
    supplier: supplierOf(doc),
    primaryItem: itemView(doc.items[0], doc.currency),
    itemCount: doc.itemCount,
    amount: { text: formatMoney(doc.totalMinor, doc.currency), currency: doc.currency },
    status,
    statusGroup: groupOf(status),
    statusLabel: STATUS_LABEL[status],
    deliveryLabel: deliveryLabel(status),
    expectedDelivery: doc.expectedDelivery ? { iso: doc.expectedDelivery.date.toISOString(), label: dateOnly(doc.expectedDelivery.date), source: EXPECTED_SOURCES[doc.expectedDelivery.source] } : null,
    quotationReference: doc.quotationReference ?? null,
    cancellationRequested: status === "CANCELLATION_REQUESTED",
    canRequestCancellation: canRequestCancellation(status),
    detailHref: `/buyer/orders/${doc.reference}`,
  };
}

// only what a row needs: the first item, never the events or the rest of the items
const PROJECTION = { reference: 1, supplierKey: 1, supplierName: 1, supplierSlug: 1, quotationReference: 1, items: { $slice: 1 }, itemCount: 1, currency: 1, totalMinor: 1, status: 1, expectedDelivery: 1, placedAt: 1 } as const;

/** Every filter except the status (the tab counts are counted under the other filters, so each tab shows what it would return). */
function baseFilter(buyerId: string, q: OrderListQuery): Filter<OrderDoc> {
  const and: Filter<OrderDoc>[] = [{ buyerId: new ObjectId(buyerId) }];
  if (q.window) and.push({ placedAt: { $gte: q.window.start, $lt: q.window.end } });
  if (q.supplierId) and.push({ supplierKey: q.supplierId });
  if (q.currency) and.push({ currency: q.currency });
  if (q.q) {
    // bounded to this buyer's own rows; the text is escaped, so it is matched literally (never as a pattern)
    const text = escapeRegex(q.q);
    and.push({ $or: [{ reference: { $regex: `^${text}`, $options: "i" } }, { quotationReference: { $regex: `^${text}`, $options: "i" } }, { supplierName: { $regex: text, $options: "i" } }, { "items.name": { $regex: text, $options: "i" } }] });
  }
  return { $and: and };
}

const SORT: Record<OrderListQuery["sort"], Sort> = {
  newest: { placedAt: -1, _id: -1 },
  oldest: { placedAt: 1, _id: 1 },
  updated: { updatedAt: -1, _id: -1 },
  amount_high: { currency: 1, totalMinor: -1, _id: -1 },
  amount_low: { currency: 1, totalMinor: 1, _id: 1 },
  delivery_soon: { expectedSort: 1, _id: 1 },
};

async function countStored(filter: Filter<OrderDoc>): Promise<Record<string, number>> {
  const rows = await (await ordersCollection()).aggregate<{ _id: string; n: number }>([{ $match: filter as Document }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray();
  return Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
}

export interface OrderPage {
  orders: OrderRow[];
  tabCounts: TabCounts;
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export async function listBuyerOrders(buyerId: string, q: OrderListQuery): Promise<OrderPage> {
  const col = await ordersCollection();
  const base = baseFilter(buyerId, q);
  const statuses = statusesFor(q.status);
  const filter: Filter<OrderDoc> = statuses ? { $and: [base, { status: { $in: statuses } }] } : base;
  const [docs, total, stored] = await Promise.all([
    col.find(filter, { projection: PROJECTION }).sort(SORT[q.sort]).skip((q.page - 1) * q.limit).limit(q.limit).toArray(),
    col.countDocuments(filter),
    countStored(base),
  ]);
  return { orders: docs.filter((d) => isOrderStatus(d.status) && d.items.length > 0).map(toRow), tabCounts: tabCountsFrom(stored), meta: { total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) } };
}

/** The five numbers over ALL of the buyer's orders (no filter), from the stored statuses. */
export async function getBuyerOrderSummary(buyerId: string): Promise<{ summary: OrderSummary; tabCounts: TabCounts }> {
  const counts = tabCountsFrom(await countStored({ buyerId: new ObjectId(buyerId) }));
  return { summary: summaryFrom(counts), tabCounts: counts };
}

export interface OrderFacets {
  suppliers: { id: string; name: string; count: number }[];
  currencies: { id: string; count: number }[];
}

/** The suppliers and currencies that really appear in this buyer's orders (at most 100 suppliers, 10 currencies). */
export async function getBuyerOrderFacets(buyerId: string): Promise<OrderFacets> {
  const col = await ordersCollection();
  const owner = new ObjectId(buyerId);
  const [suppliers, currencies] = await Promise.all([
    col.aggregate<{ _id: string; name: string; n: number }>([{ $match: { buyerId: owner } }, { $group: { _id: "$supplierKey", name: { $first: "$supplierName" }, n: { $sum: 1 } } }, { $sort: { name: 1, _id: 1 } }, { $limit: 100 }]).toArray(),
    col.aggregate<{ _id: string; n: number }>([{ $match: { buyerId: owner } }, { $group: { _id: "$currency", n: { $sum: 1 } } }, { $sort: { _id: 1 } }, { $limit: 10 }]).toArray(),
  ]);
  return { suppliers: suppliers.map((s) => ({ id: s._id, name: s.name, count: s.n })), currencies: currencies.map((c) => ({ id: c._id, count: c.n })) };
}

// ---------- details ----------
export interface OrderDetail {
  order: {
    reference: string;
    status: OrderStatus;
    statusGroup: StatusGroup;
    statusLabel: string;
    deliveryLabel: string;
    placedAt: string;
    placedLabel: string;
    updatedLabel: string;
    amount: { text: string; currency: string };
    itemCount: number;
    expectedDelivery: { iso: string; label: string; source: string } | null;
    quotation: { reference: string; href: string } | null;
    inquiry: { reference: string; href: string } | null;
  };
  supplier: ReturnType<typeof supplierOf>;
  items: ReturnType<typeof itemView>[];
  events: { type: OrderStatus; label: string; actor: string; atLabel: string; reason: string | null }[];
  cancellationRequest: { atLabel: string; reason: string; previousStatusLabel: string } | null;
  /** What this deployment can really do. A flag is true only when the module behind it exists. */
  capabilities: { cancellationRequest: boolean; payments: false; invoices: false; shipmentTracking: false; returns: false; print: true };
}

const ACTOR: Record<OrderEvent["actor"], string> = { buyer: "You", supplier: "Supplier", system: "Finbyn Mart" };

export async function getBuyerOrderDetail(buyerId: string, reference: string): Promise<OrderDetail | null> {
  const doc = await (await ordersCollection()).findOne({ reference, buyerId: new ObjectId(buyerId) });
  if (!doc || !isOrderStatus(doc.status) || doc.items.length === 0) return null;
  return {
    order: {
      reference: doc.reference,
      status: doc.status,
      statusGroup: groupOf(doc.status),
      statusLabel: STATUS_LABEL[doc.status],
      deliveryLabel: deliveryLabel(doc.status),
      placedAt: doc.placedAt.toISOString(),
      placedLabel: formatSubmitted(doc.placedAt.toISOString()),
      updatedLabel: formatSubmitted(doc.updatedAt.toISOString()),
      amount: { text: formatMoney(doc.totalMinor, doc.currency), currency: doc.currency },
      itemCount: doc.itemCount,
      expectedDelivery: doc.expectedDelivery ? { iso: doc.expectedDelivery.date.toISOString(), label: dateOnly(doc.expectedDelivery.date), source: EXPECTED_SOURCES[doc.expectedDelivery.source] } : null,
      quotation: doc.quotationReference ? { reference: doc.quotationReference, href: `/buyer/quotations/${doc.quotationReference}` } : null,
      inquiry: doc.inquiryReference ? { reference: doc.inquiryReference, href: `/buyer/inquiries/${doc.inquiryReference}` } : null,
    },
    supplier: supplierOf(doc),
    items: doc.items.slice(0, 100).map((i) => itemView(i, doc.currency)),
    events: doc.events.filter((e) => isOrderStatus(e.type)).map((e) => ({ type: e.type, label: STATUS_LABEL[e.type], actor: ACTOR[e.actor] ?? "Finbyn Mart", atLabel: formatSubmitted(e.at.toISOString()), reason: e.reason ?? null })),
    cancellationRequest: doc.cancellationRequest ? { atLabel: formatSubmitted(doc.cancellationRequest.at.toISOString()), reason: doc.cancellationRequest.reason, previousStatusLabel: STATUS_LABEL[doc.cancellationRequest.previousStatus] } : null,
    capabilities: { cancellationRequest: canRequestCancellation(doc.status), payments: false, invoices: false, shipmentTracking: false, returns: false, print: true },
  };
}

// ---------- cancellation request ----------
export type CancellationOutcome = { ok: true; status: OrderStatus; statusLabel: string; supplierNotified: false } | { ok: false; code: "NOT_FOUND" | "NOT_ALLOWED"; message: string };

const NOT_ALLOWED: Partial<Record<OrderStatus, string>> = {
  CANCELLATION_REQUESTED: "A cancellation request for this order is already waiting.",
  CANCELLED: "This order is already cancelled.",
  DISPATCHED: "This order has been dispatched, so it can no longer be cancelled here.",
  IN_TRANSIT: "This order is in transit, so it can no longer be cancelled here.",
  OUT_FOR_DELIVERY: "This order is out for delivery, so it can no longer be cancelled here.",
  DELIVERED: "This order was delivered, so it cannot be cancelled.",
  ON_HOLD: "This order is on hold. Contact support about it.",
  RETURN_REQUESTED: "A return is already in progress for this order.",
  RETURNED: "This order was returned.",
};

/**
 * Records the buyer's REQUEST to cancel. It does not cancel the order, refund anything or tell the supplier (no supplier workflow,
 * payment or notification module exists): the status moves to CANCELLATION_REQUESTED with the reason and an event, and stays there
 * until the supplier side (not built) decides. One conditional update on the exact status, so a repeat or a race changes nothing twice.
 */
export async function requestOrderCancellation(buyerId: string, reference: string, reason: string, now = new Date()): Promise<CancellationOutcome> {
  const col = await ordersCollection();
  const owner = new ObjectId(buyerId);
  const doc = await col.findOne({ reference, buyerId: owner }, { projection: { status: 1 } });
  if (!doc || !isOrderStatus(doc.status)) return { ok: false, code: "NOT_FOUND", message: "That order was not found." };
  if (!canRequestCancellation(doc.status)) return { ok: false, code: "NOT_ALLOWED", message: NOT_ALLOWED[doc.status] ?? "This order cannot be cancelled now." };
  const updated = await col.findOneAndUpdate(
    { _id: doc._id, buyerId: owner, status: doc.status },
    { $set: { status: "CANCELLATION_REQUESTED", updatedAt: now, cancellationRequest: { at: now, reason, previousStatus: doc.status } }, $push: { events: { type: "CANCELLATION_REQUESTED", at: now, actor: "buyer" as const, reason } } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, code: "NOT_ALLOWED", message: "This order changed while you were asking. Reload the page and try again." };
  return { ok: true, status: "CANCELLATION_REQUESTED", statusLabel: STATUS_LABEL.CANCELLATION_REQUESTED, supplierNotified: false };
}

// ---------- export ----------
const HEADER = ["Order Reference", "Placed On (India time)", "Supplier", "Items", "Currency", "Order Amount", "Status", "Expected Delivery", "Expected Delivery Source", "Quotation Reference"];

/**
 * The buyer's own orders under the current filters as CSV text (at most EXPORT_MAX_ROWS, newest first). Same buyer-scoped filter as
 * the list; no payment, address, contact or internal fields exist in the file. `truncated` says when the cap cut the file short.
 */
export async function exportBuyerOrdersCsv(buyerId: string, q: OrderListQuery): Promise<{ csv: string; rows: number; truncated: boolean }> {
  const col = await ordersCollection();
  const base = baseFilter(buyerId, q);
  const statuses = statusesFor(q.status);
  const filter: Filter<OrderDoc> = statuses ? { $and: [base, { status: { $in: statuses } }] } : base;
  const docs = await col.find(filter, { projection: { reference: 1, placedAt: 1, supplierName: 1, items: 1, currency: 1, totalMinor: 1, status: 1, expectedDelivery: 1, quotationReference: 1 } }).sort(SORT[q.sort]).limit(EXPORT_MAX_ROWS + 1).toArray();
  const truncated = docs.length > EXPORT_MAX_ROWS;
  const rows = docs.slice(0, EXPORT_MAX_ROWS).filter((d) => isOrderStatus(d.status));
  const body = rows.map((d) => [
    d.reference,
    new Date(d.placedAt.getTime() + 330 * 60_000).toISOString().replace("T", " ").slice(0, 16),
    d.supplierName,
    d.items.map((i) => `${i.name} x ${i.quantity}${i.unit ? ` ${i.unit}` : ""}`).join("; "),
    d.currency,
    plainAmount(d.totalMinor),
    STATUS_LABEL[d.status],
    d.expectedDelivery ? new Date(d.expectedDelivery.date.getTime() + 330 * 60_000).toISOString().slice(0, 10) : "",
    d.expectedDelivery ? EXPECTED_SOURCES[d.expectedDelivery.source] : "",
    d.quotationReference ?? "",
  ]);
  return { csv: toCsv([HEADER, ...body]), rows: rows.length, truncated };
}
