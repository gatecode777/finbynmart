import { parseDashboardRange } from "@/lib/buyer/dateRange";
import { INQUIRY_TYPES, normaliseStatus, type InquiryStatus } from "./rules";

/**
 * Rules of the buyer's "My Inquiries" list. Pure (no database), shared by the API, the page and the node-run unit tests.
 *
 * Status policy (also in docs/backend/PAGE_27_STATUS_MAPPING.md). The stored lifecycle is NEW, NOTIFIED, IN_PROGRESS, REPLIED,
 * QUOTED, CLOSED, CANCELLED, REJECTED. Nothing is renamed or duplicated: the list maps each stored value to one business label and
 * offers filters over the stored values.
 *   - Total: every inquiry of the buyer, cancelled and rejected included (history is kept and never hidden).
 *   - Awaiting response: NEW, NOTIFIED or IN_PROGRESS, i.e. open and with no supplier reply recorded. This is the same group the
 *     dashboard counts as "active", from the same constant.
 *   - Replied / Quoted: REPLIED or QUOTED as stored. No code path sets either yet (no supplier replies and no quotations exist), so
 *     the count is 0 until those modules exist; an inquiry is never counted as quoted without the stored status.
 *   - Closed: CLOSED only (cancelled and rejected are their own groups).
 */
/** Flip to true when supplier replies and quotations really exist (then the summary note disappears). */
export const REPLIES_CONNECTED = false;

export const AWAITING_STATUSES = ["NEW", "NOTIFIED", "IN_PROGRESS"] as const;
export const REPLIED_OR_QUOTED_STATUSES = ["REPLIED", "QUOTED"] as const;

/** Records written before the lifecycle existed say "new". */
const withLegacy = (list: readonly string[]) => (list.includes("NEW") ? [...list, "new"] : [...list]);

export const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "in_progress", label: "In Progress" },
  { value: "awaiting_response", label: "Awaiting Response" },
  { value: "replied", label: "Replied" },
  { value: "quoted", label: "Quoted" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rejected", label: "Rejected" },
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

/** The stored statuses a filter selects (null = no restriction). */
export function statusesFor(filter: StatusFilter): string[] | null {
  switch (filter) {
    case "all":
      return null;
    case "new":
      return ["NEW", "new"];
    case "in_progress":
      return ["IN_PROGRESS"];
    case "awaiting_response":
      return withLegacy(AWAITING_STATUSES);
    case "replied":
      return ["REPLIED"];
    case "quoted":
      return ["QUOTED"];
    case "closed":
      return ["CLOSED"];
    case "cancelled":
      return ["CANCELLED"];
    case "rejected":
      return ["REJECTED"];
  }
}

/** One business label per stored status. NOTIFIED is a notification step, so the buyer sees it as the stage it means: waiting for the supplier. */
export const BUSINESS_LABEL: Record<InquiryStatus, string> = {
  NEW: "New",
  NOTIFIED: "Awaiting Response",
  IN_PROGRESS: "In Progress",
  REPLIED: "Replied",
  QUOTED: "Quoted",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
};

export type StatusCounts = Record<StatusFilter, number>;

/** Turns counts per STORED status (as they come from the database) into the counts of every filter. A status is never counted twice within one filter. */
export function countsByFilter(stored: Record<string, number>): StatusCounts {
  const by: Record<InquiryStatus, number> = { NEW: 0, NOTIFIED: 0, IN_PROGRESS: 0, REPLIED: 0, QUOTED: 0, CLOSED: 0, CANCELLED: 0, REJECTED: 0 };
  for (const [status, n] of Object.entries(stored)) by[normaliseStatus(status)] += n;
  const total = Object.values(by).reduce((sum, n) => sum + n, 0);
  return {
    all: total,
    new: by.NEW,
    in_progress: by.IN_PROGRESS,
    awaiting_response: by.NEW + by.NOTIFIED + by.IN_PROGRESS,
    replied: by.REPLIED,
    quoted: by.QUOTED,
    closed: by.CLOSED,
    cancelled: by.CANCELLED,
    rejected: by.REJECTED,
  };
}

export interface InquirySummary {
  total: number;
  awaitingResponse: number;
  repliedOrQuoted: number;
  closed: number;
}

export function summaryFrom(counts: StatusCounts): InquirySummary {
  return { total: counts.all, awaitingResponse: counts.awaiting_response, repliedOrQuoted: counts.replied + counts.quoted, closed: counts.closed };
}

export const SORTS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "updated", label: "Recently Updated" },
] as const;
export type SortKey = (typeof SORTS)[number]["value"];
// "Inquiry Reference" is not offered: references are random, so their alphabetical order carries no meaning.

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

export interface ListQuery {
  q: string;
  status: StatusFilter;
  inquiryType: string | null;
  supplierId: string | null;
  categoryId: string | null;
  /** Inclusive start and exclusive end of the chosen createdAt window (India time), or null for all time. */
  window: { start: Date; end: Date; key: string; startDate: string; endDate: string } | null;
  sort: SortKey;
  page: number;
  limit: number;
}

export type ListQueryResult = { ok: true; value: ListQuery } | { ok: false; fields: Record<string, string> };

const str = (v: unknown): string | undefined | null => (v === undefined || v === "" ? undefined : typeof v === "string" ? v : null);

/** Parses and validates every list parameter; anything not recognised is refused (never passed to the database). */
export function parseListQuery(p: Record<string, unknown>): ListQueryResult {
  const fields: Record<string, string> = {};
  const text = (key: string) => {
    const v = str(p[key]);
    if (v === null) fields[key] = "Send a single text value.";
    return v ?? undefined;
  };

  const rawQ = text("q");
  const q = (rawQ ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length > SEARCH_MAX) fields.q = `The search text can be at most ${SEARCH_MAX} characters.`;

  const rawStatus = (text("status") ?? "all").toLowerCase();
  const status = STATUS_FILTERS.find((s) => s.value === rawStatus)?.value;
  if (!status) fields.status = "Choose one of: all, new, in_progress, awaiting_response, replied, quoted, closed, cancelled, rejected.";

  const rawType = text("inquiryType");
  if (rawType !== undefined && !INQUIRY_TYPES.some((t) => t.value === rawType)) fields.inquiryType = "Choose one of: PRODUCT_INQUIRY, GET_BEST_QUOTE, GENERAL_INQUIRY, BULK_REQUIREMENT.";

  const rawSupplier = text("supplierId");
  if (rawSupplier !== undefined && !/^[A-Za-z0-9_.-]{1,80}$/.test(rawSupplier)) fields.supplierId = "That supplier is not valid.";

  const rawCategory = text("categoryId");
  if (rawCategory !== undefined && !/^[a-z0-9-]{1,80}$/.test(rawCategory)) fields.categoryId = "That category is not valid.";

  const rawSort = text("sort") ?? "newest";
  const sort = SORTS.find((s) => s.value === rawSort)?.value;
  if (!sort) fields.sort = "Choose one of: newest, oldest, updated.";

  const num = (key: string, fallback: number, min: number, max: number) => {
    const v = p[key];
    if (v === undefined || v === "") return fallback;
    const n = typeof v === "string" ? Number(v) : NaN;
    if (!Number.isInteger(n) || n < min || n > max) {
      fields[key] = key === "page" ? `page must be a whole number from 1 to ${MAX_PAGE}.` : `limit must be a whole number from 1 to ${MAX_PAGE_SIZE}.`;
      return fallback;
    }
    return n;
  };
  const page = num("page", 1, 1, MAX_PAGE);
  const limit = num("limit", PAGE_SIZE, 1, MAX_PAGE_SIZE);

  // date window: a preset (range) or a custom pair (dateFrom, dateTo), both validated by the dashboard's India-time rules
  const range = text("range");
  const dateFrom = text("dateFrom");
  const dateTo = text("dateTo");
  let window: ListQuery["window"] = null;
  if (range !== undefined || dateFrom !== undefined || dateTo !== undefined) {
    if (range !== undefined && !DATE_RANGES.some((r) => r.value === range)) fields.range = "Choose one of: 7d, 30d, 90d, this-month, previous-month, custom.";
    else {
      const parsed = parseDashboardRange({ range: range ?? "custom", startDate: dateFrom, endDate: dateTo });
      if (!parsed.ok) fields[dateFrom !== undefined || dateTo !== undefined ? "dateFrom" : "range"] = parsed.error;
      else window = { start: parsed.value.start, end: parsed.value.end, key: parsed.value.key, startDate: parsed.value.startDate, endDate: parsed.value.endDate };
    }
  }

  const unknown = Object.keys(p).filter((k) => !["q", "status", "inquiryType", "supplierId", "categoryId", "range", "dateFrom", "dateTo", "sort", "page", "limit"].includes(k));
  void unknown; // unrecognised parameters (for example buyerId) are ignored, never read

  if (Object.keys(fields).length > 0 || !status || !sort) return { ok: false, fields };
  return { ok: true, value: { q, status, inquiryType: rawType ?? null, supplierId: rawSupplier ?? null, categoryId: rawCategory ?? null, window, sort, page, limit } };
}

/** How many filters (besides the status tab and the sort) are on. */
export function activeFilterCount(q: ListQuery): number {
  return [q.inquiryType, q.supplierId, q.categoryId, q.window].filter(Boolean).length;
}

export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A safe, same-site path for the buyer's inquiry (the reference is an identifier, never a credential). */
export const inquiryHref = (reference: string | null, id: string) => (reference ? `/buyer/inquiries/${reference}` : `/buyer/inquiries/${id}`);
