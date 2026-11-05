import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "./settingsRules";

/** Notification centre rules. Pure (shared by the API, the page and the node-run unit tests). */
export const NOTIFICATION_PAGE_SIZE = 20;
export const NOTIFICATION_MAX_PAGE_SIZE = 50;
/** Notifications are removed 180 days after creation (a TTL index on `purgeAt`). */
export const NOTIFICATION_RETENTION_DAYS = 180;
/** The unread badge stops counting at this number (shown as "99+") so the count query stays bounded. */
export const UNREAD_COUNT_CAP = 100;

export const NOTIFICATION_STATUSES = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
] as const;
export type NotificationStatusFilter = (typeof NOTIFICATION_STATUSES)[number]["value"];

export const NOTIFICATION_FILTER_CATEGORIES = [{ value: "all", label: "All categories" }, ...NOTIFICATION_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))] as const;

export interface NotificationQuery {
  category: NotificationCategory | "all";
  status: NotificationStatusFilter;
  page: number;
  limit: number;
}
export type NotificationQueryResult = { ok: true; value: NotificationQuery } | { ok: false; error: string };

/** category (all or a known one), status (all, unread, read), page (1 to 1000), limit (1 to 50, default 20). Anything else is refused. */
export function parseNotificationQuery(params: { category?: unknown; status?: unknown; page?: unknown; limit?: unknown }): NotificationQueryResult {
  const category = params.category === undefined || params.category === "" ? "all" : params.category;
  if (!NOTIFICATION_FILTER_CATEGORIES.some((c) => c.value === category)) return { ok: false, error: "category must be all, inquiries, company or account." };
  const status = params.status === undefined || params.status === "" ? "all" : params.status;
  if (!NOTIFICATION_STATUSES.some((s) => s.value === status)) return { ok: false, error: "status must be all, unread or read." };
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    if (v === undefined || v === "") return fallback;
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const page = num(params.page, 1, 1, 1000);
  const limit = num(params.limit, NOTIFICATION_PAGE_SIZE, 1, NOTIFICATION_MAX_PAGE_SIZE);
  if (page === null || limit === null) return { ok: false, error: `page must be 1 or more and limit between 1 and ${NOTIFICATION_MAX_PAGE_SIZE}.` };
  return { ok: true, value: { category: category as NotificationQuery["category"], status: status as NotificationStatusFilter, page, limit } };
}

/**
 * A notification may only point inside the buyer area or the buyer's own inquiry list: a path that starts with a single slash and
 * then `buyer/` or `account/`, with no scheme, no host, no backslash, no encoded slash, no `..`, no control characters.
 * The server checks this when it creates a notification AND the UI checks again before rendering a link.
 */
export function isSafeNotificationLink(link: unknown): link is string {
  if (typeof link !== "string" || link.length === 0 || link.length > 200) return false;
  if (!/^\/(buyer|account)\/[A-Za-z0-9/_\-?=&.%]*$/.test(link)) return false;
  return !link.includes("//") && !link.includes("..") && !/%2f|%5c|%00/i.test(link);
}

export const MAX_TITLE = 120;
export const MAX_BODY = 400;
