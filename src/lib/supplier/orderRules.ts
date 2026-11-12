import { parseDashboardRange, RANGE_PRESETS } from "@/lib/buyer/dateRange";
import { MAX_PAGE, MAX_PAGE_SIZE, ORDER_STATUSES, PAGE_SIZE, SEARCH_MAX, STATUS_LABEL, isOrderStatus, type OrderStatus } from "@/lib/orders/orderRules";

/**
 * Supplier Orders rules (Page 45). Pure (no database), shared by the service, the API, the page and the node-run unit tests.
 *
 * ONE order system: the `orders` collection and the lifecycle in `src/lib/orders/orderRules.ts` are the only definitions. An order document belongs
 * to exactly ONE buyer and ONE supplier (`supplierKey`), so there is no multi-supplier order and no supplier "sub-order": every count and amount here
 * is an order of this supplier, and another supplier's business can never be inside one. This module only decides how a supplier groups, filters
 * and reads that lifecycle; it adds no status.
 *
 * Status groups (they PARTITION the 13 stored statuses: every order is in exactly one group, so the chip counts add up to "All"):
 *   awaiting     PENDING_CONFIRMATION
 *   in_progress  CONFIRMED, PROCESSING
 *   ready        READY_TO_DISPATCH
 *   shipped      DISPATCHED, IN_TRANSIT, OUT_FOR_DELIVERY (as stored: a label alone proves nothing, and no shipment module exists)
 *   delivered    DELIVERED
 *   cancelled    CANCELLED
 *   attention    ON_HOLD, CANCELLATION_REQUESTED, RETURN_REQUESTED, RETURNED (things that need a decision, or finished returns)
 * The `status` parameter is ONE canonical filter: a group key, or one exact stored status (lower case). Chips, cards and the select all read and
 * write that one value.
 *
 * Three different facts are never merged: the lifecycle status (what is stored), the fulfilment label (the delivery meaning of that status, nothing
 * more: no carrier, tracking or "delayed" is invented) and payment (no payment ledger exists, so it is always "unavailable").
 */
export const ORDER_GROUPS = [
  { key: "awaiting", label: "Awaiting Confirmation", statuses: ["PENDING_CONFIRMATION"] },
  { key: "in_progress", label: "In Progress", statuses: ["CONFIRMED", "PROCESSING"] },
  { key: "ready", label: "Ready to Dispatch", statuses: ["READY_TO_DISPATCH"] },
  { key: "shipped", label: "Dispatched", statuses: ["DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY"] },
  { key: "delivered", label: "Delivered", statuses: ["DELIVERED"] },
  { key: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
  { key: "attention", label: "On Hold, Returns & Requests", statuses: ["ON_HOLD", "CANCELLATION_REQUESTED", "RETURN_REQUESTED", "RETURNED"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly OrderStatus[] }[];
export type GroupKey = (typeof ORDER_GROUPS)[number]["key"];
export type OrderTab = "all" | GroupKey;

export const ORDER_TABS: readonly { value: OrderTab; label: string }[] = [{ value: "all", label: "All" }, ...ORDER_GROUPS.map((g) => ({ value: g.key as OrderTab, label: g.label }))];

const GROUP_OF = new Map<OrderStatus, GroupKey>(ORDER_GROUPS.flatMap((g) => g.statuses.map((s) => [s, g.key] as const)));
export const groupKeyOf = (status: OrderStatus): GroupKey => GROUP_OF.get(status) as GroupKey;

export type TabCounts = Record<OrderTab, number>;
export const zeroCounts = (): TabCounts => ({ all: 0, awaiting: 0, in_progress: 0, ready: 0, shipped: 0, delivered: 0, cancelled: 0, attention: 0 });

/** Counts per STORED status (from one grouped read) → the count of every tab. A stored value this code does not know is counted nowhere (never invented into a group). */
export function tabCountsFrom(stored: Record<string, number>): TabCounts {
  const out = zeroCounts();
  for (const [status, n] of Object.entries(stored)) {
    if (!isOrderStatus(status)) continue;
    out.all += n;
    out[groupKeyOf(status)] += n;
  }
  return out;
}

/** The four cards. Each is a count of orders within the active search / date / currency scope; Ready to Dispatch is NOT inside In Progress (the groups are disjoint). */
export const SUMMARY_CARDS = [
  { key: "all", label: "All Orders" },
  { key: "awaiting", label: "Awaiting Confirmation" },
  { key: "in_progress", label: "In Progress" },
  { key: "ready", label: "Ready to Dispatch" },
] as const satisfies readonly { key: OrderTab; label: string }[];

export const EXACT_STATUS_KEYS: string[] = ORDER_STATUSES.map((s) => s.toLowerCase());
/** "delivered" and "cancelled" are both a group and an exact status; they select the same single status, so they are listed once. */
export const STATUS_FILTER_VALUES: string[] = [...new Set<string>([...ORDER_TABS.map((t) => t.value), ...EXACT_STATUS_KEYS])];

/** The stored statuses a `status` value selects (null = no restriction). A group key wins over an exact name; none of the two sets is ambiguous. */
export function statusesFor(filter: string): OrderStatus[] | null {
  if (filter === "all") return null;
  const group = ORDER_GROUPS.find((g) => g.key === filter);
  if (group) return [...group.statuses];
  const exact = ORDER_STATUSES.find((s) => s.toLowerCase() === filter);
  return exact ? [exact] : null;
}

/** The fulfilment column: only the delivery meaning of the stored lifecycle status. */
export function fulfilmentLabel(status: OrderStatus): string {
  switch (status) {
    case "PENDING_CONFIRMATION":
      return "Not started";
    case "CONFIRMED":
    case "PROCESSING":
    case "CANCELLATION_REQUESTED":
      return "Not dispatched";
    case "READY_TO_DISPATCH":
      return "Ready to dispatch";
    case "DISPATCHED":
      return "Dispatched";
    case "IN_TRANSIT":
      return "In transit";
    case "OUT_FOR_DELIVERY":
      return "Out for delivery";
    case "DELIVERED":
    case "RETURN_REQUESTED":
      return "Delivered";
    case "ON_HOLD":
      return "On hold";
    case "CANCELLED":
      return "Cancelled";
    case "RETURNED":
      return "Returned";
  }
}

/** There is no payment ledger or provider integration in the project, so payment is never derived (not from acceptance, confirmation, dispatch or delivery). */
export const PAYMENT_UNAVAILABLE = { available: false as const, label: "Payment status unavailable", reason: "No payment ledger or provider is connected, so no order is shown as paid, unpaid or refunded." };

export const SORTS = [
  { value: "newest", label: "Newest orders" },
  { value: "oldest", label: "Oldest orders" },
  { value: "updated", label: "Recently updated" },
  { value: "amount_high", label: "Highest amount" },
  { value: "amount_low", label: "Lowest amount" },
] as const;
export type OrderSort = (typeof SORTS)[number]["value"];
/** Amounts in different currencies are never ranked together, so the two amount sorts need one currency to be chosen. */
export const AMOUNT_SORTS: readonly OrderSort[] = ["amount_high", "amount_low"];

export const DATE_BASES = [
  { value: "placed", label: "Order date" },
  { value: "updated", label: "Last updated" },
] as const;
export type OrderDateBasis = (typeof DATE_BASES)[number]["value"];

export const CURRENCY_PATTERN = /^[A-Z]{3}$/;
export const ORDER_PAGE_SIZE = PAGE_SIZE;
export const EXPORT_MAX_ROWS = 5000;
export { MAX_PAGE, MAX_PAGE_SIZE, SEARCH_MAX, STATUS_LABEL, RANGE_PRESETS };

export interface SupplierOrderQuery {
  q: string;
  status: string;
  sort: OrderSort;
  dateBasis: OrderDateBasis;
  /** Inclusive start / exclusive end of the date window (India calendar days), or null for "any time". */
  from: Date | null;
  to: Date | null;
  rangeKey: string;
  currency: string | null;
  page: number;
  limit: number;
}
export type SupplierOrderQueryResult = { ok: true; value: SupplierOrderQuery } | { ok: false; fields: Record<string, string> };

const single = (v: unknown): string | undefined | null => (v === undefined || v === "" ? undefined : typeof v === "string" ? v : null);

/**
 * Every parameter is validated against a fixed list or pattern; nothing is passed to the database as an operator. Parameters that are not listed
 * (supplierId, supplierCompanyId, buyerId, ...) are never read: the company always comes from the session.
 */
export function parseSupplierOrderQuery(p: Record<string, unknown>, now = Date.now()): SupplierOrderQueryResult {
  const fields: Record<string, string> = {};
  const text = (key: string) => {
    const v = single(p[key]);
    if (v === null) fields[key] = "Send a single text value.";
    return v ?? undefined;
  };
  const q = (text("q") ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length > SEARCH_MAX) fields.q = `The search text can be at most ${SEARCH_MAX} characters.`;

  const status = (text("status") ?? "all").toLowerCase();
  if (!STATUS_FILTER_VALUES.includes(status)) fields.status = "That status is not valid.";

  const sort = SORTS.find((s) => s.value === (text("sort") ?? "newest"))?.value;
  if (!sort) fields.sort = `Choose one of: ${SORTS.map((s) => s.value).join(", ")}.`;
  const dateBasis = DATE_BASES.find((b) => b.value === (text("dateBasis") ?? "placed"))?.value;
  if (!dateBasis) fields.dateBasis = `Choose one of: ${DATE_BASES.map((b) => b.value).join(", ")}.`;

  const currencyText = text("currency")?.toUpperCase();
  if (currencyText !== undefined && !CURRENCY_PATTERN.test(currencyText)) fields.currency = "Use a three-letter currency code such as INR.";
  const currency = currencyText && CURRENCY_PATTERN.test(currencyText) ? currencyText : null;
  if (sort && AMOUNT_SORTS.includes(sort) && !currency && !fields.currency) fields.sort = "Choose a currency before sorting by amount: amounts in different currencies are not ranked together.";

  let from: Date | null = null;
  let to: Date | null = null;
  let rangeKey = "all";
  const rangeText = text("range");
  if (rangeText !== undefined) {
    if (!RANGE_PRESETS.some((r) => r.value === rangeText)) fields.range = `Choose one of: ${RANGE_PRESETS.map((r) => r.value).join(", ")}.`;
    else {
      const range = parseDashboardRange({ range: rangeText, startDate: text("startDate"), endDate: text("endDate") }, now);
      if (!range.ok) fields.range = range.error;
      else {
        from = new Date(range.value.start);
        to = new Date(range.value.end);
        rangeKey = range.value.key;
      }
    }
  }

  const num = (key: string, fallback: number, max: number) => {
    const v = p[key];
    if (v === undefined || v === "") return fallback;
    const n = typeof v === "string" ? Number(v) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > max) {
      fields[key] = `${key} must be a whole number from 1 to ${max}.`;
      return fallback;
    }
    return n;
  };
  const page = num("page", 1, MAX_PAGE);
  const limit = num("limit", ORDER_PAGE_SIZE, MAX_PAGE_SIZE);
  if (Object.keys(fields).length > 0 || !sort || !dateBasis) return { ok: false, fields };
  return { ok: true, value: { q, status, sort, dateBasis, from, to, rangeKey, currency, page, limit } };
}

/** Quantity text for ONE item: the stored quantity and unit. Different units are never added together, so a multi-item order shows its first item and a count. */
export function quantityText(quantity: number, unit: string | null | undefined): string {
  const n = Number.isFinite(quantity) ? quantity.toLocaleString("en-IN") : "-";
  return unit ? `${n} ${unit}` : n;
}

/** "Cotton fabric and 2 more items": the representative item plus the number of others; never a concatenation of every name. */
export function itemSummary(name: string, itemCount: number): string {
  const more = itemCount - 1;
  return more > 0 ? `${name} and ${more} more item${more === 1 ? "" : "s"}` : name;
}

/** Whether a role may export orders (the project has one role today: the owner). */
export const canExportOrders = (permissions: { viewOrders: boolean; exportOrders: boolean }) => permissions.viewOrders && permissions.exportOrders;

export const EXPORT_HEADER = ["Order Reference", "Placed On (India time)", "Last Updated (India time)", "Buyer / Company", "Items", "Currency", "Order Amount", "Order Status", "Fulfilment", "Payment", "Quotation Reference"];
