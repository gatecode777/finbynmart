import { parseDashboardRange } from "@/lib/buyer/dateRange";

/**
 * Rules of the buyer's Orders (Page 31). Pure (no database), shared by the API, the pages and the node-run unit tests.
 *
 * There was no order system before this page, so the lifecycle below is the candidate list of the page's PRD and is now THE one
 * definition (docs/backend/PAGE_31_ORDER_STATUS_LIFECYCLE.md). Anything else that needs to talk about order statuses must import it.
 * Orders are CREATED by nothing in this project yet (a future supplier / checkout flow); this module only reads them and records
 * the buyer's cancellation request. Statuses are changed only by that future flow (or a test), never by a buyer.
 *
 * Counting rules (one definition, used by the cards, the tabs and the filters):
 *   Total       every order of the buyer, cancelled and returned included (history is never hidden).
 *   Processing  CONFIRMED, PROCESSING, READY_TO_DISPATCH. PENDING_CONFIRMATION is not processing yet.
 *   In Transit  DISPATCHED, IN_TRANSIT, OUT_FOR_DELIVERY, as stored: a tracking label alone proves nothing, and no shipment module exists.
 *   Delivered   DELIVERED as stored: an expected date that has passed never makes an order delivered.
 *   Issues      ON_HOLD, CANCELLATION_REQUESTED, RETURN_REQUESTED: things that need attention NOW. Finished CANCELLED and RETURNED
 *               orders are history, not active issues.
 */
export const ORDER_STATUSES = [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "PROCESSING",
  "READY_TO_DISPATCH",
  "DISPATCHED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "ON_HOLD",
  "CANCELLATION_REQUESTED",
  "CANCELLED",
  "RETURN_REQUESTED",
  "RETURNED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_CONFIRMATION: "Pending Confirmation",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  READY_TO_DISPATCH: "Ready to Dispatch",
  DISPATCHED: "Dispatched",
  IN_TRANSIT: "In Transit",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  ON_HOLD: "On Hold",
  CANCELLATION_REQUESTED: "Cancellation Requested",
  CANCELLED: "Cancelled",
  RETURN_REQUESTED: "Return Requested",
  RETURNED: "Returned",
};

export type StatusGroup = "processing" | "in_transit" | "delivered" | "issues" | "other";

export const GROUP_STATUSES: Record<Exclude<StatusGroup, "other">, readonly OrderStatus[]> = {
  processing: ["CONFIRMED", "PROCESSING", "READY_TO_DISPATCH"],
  in_transit: ["DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY"],
  delivered: ["DELIVERED"],
  issues: ["ON_HOLD", "CANCELLATION_REQUESTED", "RETURN_REQUESTED"],
};

export function groupOf(status: OrderStatus): StatusGroup {
  for (const [group, list] of Object.entries(GROUP_STATUSES)) if (list.includes(status)) return group as StatusGroup;
  return "other";
}

/** Unknown stored values are never shown as a made-up status: they are treated as pending confirmation only by the reader that cannot do better. */
export const isOrderStatus = (value: unknown): value is OrderStatus => typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);

export const STATUS_TABS = [
  { value: "all", label: "All Orders" },
  { value: "processing", label: "Processing" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "issues", label: "Returns / Issues" },
] as const;
export type StatusTab = (typeof STATUS_TABS)[number]["value"];

/** A `status` parameter is a tab key or one exact status (lower case). */
export const STATUS_FILTER_VALUES: string[] = [...STATUS_TABS.map((t) => t.value), ...ORDER_STATUSES.map((s) => s.toLowerCase())];

/** The stored statuses a filter selects (null = no restriction). */
export function statusesFor(filter: string): OrderStatus[] | null {
  if (filter === "all") return null;
  if (filter in GROUP_STATUSES) return [...GROUP_STATUSES[filter as keyof typeof GROUP_STATUSES]];
  const exact = ORDER_STATUSES.find((s) => s.toLowerCase() === filter);
  return exact ? [exact] : null;
}

export type TabCounts = Record<StatusTab, number>;

/** Counts per STORED status → the count of every tab. A status is never counted twice within one tab. */
export function tabCountsFrom(stored: Record<string, number>): TabCounts {
  const out: TabCounts = { all: 0, processing: 0, in_transit: 0, delivered: 0, issues: 0 };
  for (const [status, n] of Object.entries(stored)) {
    if (!isOrderStatus(status)) continue;
    out.all += n;
    const g = groupOf(status);
    if (g !== "other") out[g] += n;
  }
  return out;
}

export interface OrderSummary {
  totalOrders: number;
  processing: number;
  inTransit: number;
  delivered: number;
  activeIssues: number;
}

export const summaryFrom = (c: TabCounts): OrderSummary => ({ totalOrders: c.all, processing: c.processing, inTransit: c.in_transit, delivered: c.delivered, activeIssues: c.issues });

/**
 * The delivery column. There is no shipment module, so this is the delivery meaning of the stored ORDER status and nothing more:
 * no carrier event, tracking number or "delayed" judgement is ever invented.
 */
export function deliveryLabel(status: OrderStatus): string {
  switch (status) {
    case "PENDING_CONFIRMATION":
    case "CONFIRMED":
    case "PROCESSING":
    case "CANCELLATION_REQUESTED":
      return "Not Dispatched";
    case "READY_TO_DISPATCH":
      return "Ready to Dispatch";
    case "DISPATCHED":
      return "Dispatched";
    case "IN_TRANSIT":
      return "In Transit";
    case "OUT_FOR_DELIVERY":
      return "Out for Delivery";
    case "DELIVERED":
    case "RETURN_REQUESTED":
      return "Delivered";
    case "ON_HOLD":
      return "On Hold";
    case "CANCELLED":
      return "Cancelled";
    case "RETURNED":
      return "Returned";
  }
}

export const EXPECTED_SOURCES = { CARRIER: "Carrier estimate", SUPPLIER: "Supplier commitment", SCHEDULE: "Order schedule" } as const;
export type ExpectedSource = keyof typeof EXPECTED_SOURCES;

/** A buyer may ask to cancel only before anything is dispatched. The request does not cancel the order: the supplier side decides (not built yet). */
export const CANCELLABLE_STATUSES: readonly OrderStatus[] = ["PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING", "READY_TO_DISPATCH"];
export const canRequestCancellation = (status: OrderStatus) => CANCELLABLE_STATUSES.includes(status);

export const CANCEL_REASON_MIN = 10;
export const CANCEL_REASON_MAX = 500;

export type CancellationResult = { ok: true; value: { reason: string } } | { ok: false; fields: Record<string, string> };

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1) : "");

export function validateCancellation(body: unknown): CancellationResult {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};
  const reason = clean(b.reason, CANCEL_REASON_MAX);
  if (reason.length < CANCEL_REASON_MIN) fields.reason = `Tell us why (at least ${CANCEL_REASON_MIN} characters).`;
  else if (reason.length > CANCEL_REASON_MAX || /[<>]/.test(reason)) fields.reason = `Keep the reason within ${CANCEL_REASON_MAX} characters, without < or >.`;
  if (b.confirm !== true) fields.confirm = "Confirm your request first.";
  for (const key of Object.keys(b)) if (!["reason", "confirm"].includes(key)) fields[key] = "This value cannot be sent.";
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value: { reason } };
}

// ---------- the list query ----------
export const SORTS = [
  { value: "newest", label: "Newest Orders" },
  { value: "oldest", label: "Oldest Orders" },
  { value: "updated", label: "Recently Updated" },
  { value: "amount_high", label: "Highest Order Amount" },
  { value: "amount_low", label: "Lowest Order Amount" },
  { value: "delivery_soon", label: "Expected Delivery Soon" },
] as const;
export type SortKey = (typeof SORTS)[number]["value"];
/** Amounts in different currencies are never ranked together, so these two sorts need a currency to be chosen. */
export const AMOUNT_SORTS: readonly SortKey[] = ["amount_high", "amount_low"];

export const DATE_RANGES = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "this-month", label: "This Month" },
  { value: "previous-month", label: "Previous Month" },
  { value: "custom", label: "Custom Range" },
] as const;

export const SEARCH_MAX = 60;
export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const MAX_PAGE = 1000;
export const EXPORT_MAX_ROWS = 5000;

export interface OrderListQuery {
  q: string;
  status: string;
  supplierId: string | null;
  currency: string | null;
  window: { start: Date; end: Date; key: string; startDate: string; endDate: string } | null;
  sort: SortKey;
  page: number;
  limit: number;
}

export type OrderQueryResult = { ok: true; value: OrderListQuery } | { ok: false; fields: Record<string, string> };

const str = (v: unknown): string | undefined | null => (v === undefined || v === "" ? undefined : typeof v === "string" ? v : null);

/** Parses and validates every list parameter; anything not recognised is refused (never passed to the database). Unknown parameters (for example buyerId) are ignored, never read. */
export function parseOrderQuery(p: Record<string, unknown>): OrderQueryResult {
  const fields: Record<string, string> = {};
  const text = (key: string) => {
    const v = str(p[key]);
    if (v === null) fields[key] = "Send a single text value.";
    return v ?? undefined;
  };

  const q = (text("q") ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length > SEARCH_MAX) fields.q = `The search text can be at most ${SEARCH_MAX} characters.`;

  const status = (text("status") ?? "all").toLowerCase();
  if (!STATUS_FILTER_VALUES.includes(status)) fields.status = "That status is not valid.";

  const supplierId = text("supplierId");
  if (supplierId !== undefined && !/^[A-Za-z0-9_.-]{1,80}$/.test(supplierId)) fields.supplierId = "That supplier is not valid.";

  const currency = text("currency");
  if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) fields.currency = "Use a three-letter currency code such as INR.";

  const rawSort = text("sort") ?? "newest";
  const sort = SORTS.find((s) => s.value === rawSort)?.value;
  if (!sort) fields.sort = `Choose one of: ${SORTS.map((s) => s.value).join(", ")}.`;
  else if (AMOUNT_SORTS.includes(sort) && !currency) fields.sort = "Choose a currency before sorting by amount: amounts in different currencies are not ranked together.";

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
  const limit = num("limit", PAGE_SIZE, MAX_PAGE_SIZE);

  const range = text("range");
  const dateFrom = text("dateFrom");
  const dateTo = text("dateTo");
  let window: OrderListQuery["window"] = null;
  if (range !== undefined || dateFrom !== undefined || dateTo !== undefined) {
    if (range !== undefined && !DATE_RANGES.some((r) => r.value === range)) fields.range = "Choose one of: 7d, 30d, 90d, this-month, previous-month, custom.";
    else {
      const parsed = parseDashboardRange({ range: range ?? "custom", startDate: dateFrom, endDate: dateTo });
      if (!parsed.ok) fields[dateFrom !== undefined || dateTo !== undefined ? "dateFrom" : "range"] = parsed.error;
      else window = { start: parsed.value.start, end: parsed.value.end, key: parsed.value.key, startDate: parsed.value.startDate, endDate: parsed.value.endDate };
    }
  }

  if (Object.keys(fields).length > 0 || !sort) return { ok: false, fields };
  return { ok: true, value: { q, status, supplierId: supplierId ?? null, currency: currency ?? null, window, sort, page, limit } };
}

export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** FBM-ORD-XXXXXXXX: for identification, never for access (the Crockford-style alphabet of the other references). */
export const REFERENCE_PATTERN = /^FBM-ORD-[0-9A-HJKMNP-TV-Z]{8}$/;

// ---------- export ----------
/** One CSV cell. A leading = + - @ (or a tab / carriage return) would be run as a formula by a spreadsheet, so it is defused; quotes are doubled. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** A saved integer amount in minor units as a plain decimal ("792360.00"), no symbol and no grouping: for files, not for screens. */
export function plainAmount(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  return `${negative ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
