import { parseDashboardRange } from "@/lib/buyer/dateRange";

/**
 * Rules of the buyer's support tickets (Page 36). Pure (no database), shared by the API, the pages and the node-run unit tests.
 *
 * This is a NEW module: before it, Finbyn Mart had only the public Contact Us form (`support_requests`, another reference format, no
 * account, no status). A ticket is a signed-in buyer's request to Finbyn Mart with a category, an optional related record of their
 * own, a status that only the support side may change, and optional private attachments. There is NO support staff side yet (no agent
 * accounts, no inbox, no replies), so every ticket stays OPEN until one exists; the page says so instead of promising an answer.
 */

// ---------- categories (one configuration; the form, the filter and the API all read it) ----------
export const SUPPORT_CATEGORIES = [
  { value: "account-login", label: "Account & Login" },
  { value: "product-catalogue", label: "Product & Catalogue" },
  { value: "supplier-communication", label: "Supplier Communication" },
  { value: "inquiry-rfq", label: "Inquiry & RFQ" },
  { value: "quotations", label: "Quotations" },
  { value: "orders-delivery", label: "Orders & Delivery" },
  { value: "payment-billing", label: "Payment & Billing" },
  { value: "invoice-documents", label: "Invoice & Documents" },
  { value: "technical-issue", label: "Technical Issue" },
  { value: "profile-verification", label: "Profile & Verification" },
  { value: "other", label: "Other" },
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]["value"];
export const categoryLabel = (value: string) => SUPPORT_CATEGORIES.find((c) => c.value === value)?.label ?? "Other";

// ---------- related records ----------
/**
 * What a ticket can point at. Inquiry, quotation and order must belong to the buyer; a product is a public catalogue record.
 * Invoice and payment are NOT offered: no invoice or payment records exist, so there is nothing to point at (BLOCKED).
 */
export const RELATED_TYPES = [
  { value: "inquiry", label: "Inquiry" },
  { value: "quotation", label: "Quotation" },
  { value: "order", label: "Order" },
  { value: "product", label: "Product" },
] as const;
export type RelatedType = (typeof RELATED_TYPES)[number]["value"];
export const relatedLabel = (value: string) => RELATED_TYPES.find((t) => t.value === value)?.label ?? "Record";

// ---------- statuses ----------
export const TICKET_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_BUYER", "WAITING_FOR_SUPPORT", "RESOLVED", "CLOSED", "REOPENED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_BUYER: "Waiting for You",
  WAITING_FOR_SUPPORT: "Waiting for Support",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
};

/**
 * The three cards. Open: needs attention (new, assigned, reopened, or waiting for the buyer). In Progress: being worked on.
 * Resolved: finished (resolved or closed). My Tickets is every ticket. One definition for the cards, the filters and the badges.
 */
export type StatusGroup = "open" | "in_progress" | "resolved";
export const GROUP_STATUSES: Record<StatusGroup, readonly TicketStatus[]> = {
  open: ["OPEN", "ASSIGNED", "REOPENED", "WAITING_FOR_BUYER"],
  in_progress: ["IN_PROGRESS", "WAITING_FOR_SUPPORT"],
  resolved: ["RESOLVED", "CLOSED"],
};
export function groupOf(status: TicketStatus): StatusGroup {
  return (Object.entries(GROUP_STATUSES).find(([, list]) => list.includes(status))?.[0] ?? "open") as StatusGroup;
}
export const isTicketStatus = (v: unknown): v is TicketStatus => typeof v === "string" && (TICKET_STATUSES as readonly string[]).includes(v);

/**
 * The lifecycle for the SUPPORT side (no such side exists yet, so nothing in the application performs these). A buyer never changes a
 * status: the buyer-side Page 37 may later be allowed to reopen or close through its own audited route. Every transition made by
 * whatever implements this must write an event with the actor and the time.
 */
export const STATUS_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN: ["ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"],
  ASSIGNED: ["IN_PROGRESS", "WAITING_FOR_BUYER", "RESOLVED", "OPEN"],
  IN_PROGRESS: ["WAITING_FOR_BUYER", "WAITING_FOR_SUPPORT", "RESOLVED"],
  WAITING_FOR_BUYER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  WAITING_FOR_SUPPORT: ["IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["ASSIGNED", "IN_PROGRESS", "RESOLVED"],
};
export const canTransition = (from: TicketStatus, to: TicketStatus) => STATUS_TRANSITIONS[from]?.includes(to) ?? false;

// ---------- references ----------
/**
 * FBM-SUP-YYYYMM-XXXXXX (the month in India time, then six characters of the reference alphabet). The Contact Us form's references are
 * FBM-SUP- plus eight characters and no month: the two shapes cannot be mistaken for each other, and tickets are only ever looked up
 * in their own collection.
 */
export const TICKET_REFERENCE_PATTERN = /^FBM-SUP-\d{6}-[0-9A-HJKMNP-TV-Z]{6}$/;
export const referenceMonth = (now: Date) => {
  const d = new Date(now.getTime() + 330 * 60_000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// ---------- the ticket input ----------
export const SUBJECT_MIN = 5;
export const SUBJECT_MAX = 150;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 1000;

/** Configurable on the server (SUPPORT_ATTACH_MAX_MB, SUPPORT_ATTACH_MAX_FILES), within these hard ceilings. */
export const ATTACHMENT_DEFAULTS = { maxFiles: 5, maxMb: 10, types: ["pdf", "jpg", "png"] as const };
export const ATTACHMENT_CEILING = { maxFiles: 10, maxMb: 25 };

export interface TicketInput {
  category: SupportCategory;
  related: { type: RelatedType; reference: string } | null;
  subject: string;
  description: string;
  idempotencyKey: string;
}

export type TicketResult = { ok: true; value: TicketInput } | { ok: false; fields: Record<string, string> };

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.normalize("NFKC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max + 1) : "");
/** Multiline text: line breaks are kept (at most one blank line in a row), other control characters removed. */
const cleanMultiline = (v: unknown, max: number) => (typeof v === "string" ? v.normalize("NFKC").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max + 1) : "");

export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,64}$/;
const REFERENCE_LIKE = /^[A-Za-z0-9_.-]{1,80}$/;

/** Fields only the server sets: a request carrying any of them is refused (no priority, status, agent or owner from the client). */
export const FORBIDDEN_TICKET_FIELDS = ["status", "priority", "assignedAgentId", "assignedTo", "buyerId", "userId", "companyId", "ticketReference", "reference", "events", "attachmentIds", "createdAt", "updatedAt", "resolvedAt", "closedAt", "internalNotes"] as const;

export function validateTicket(raw: unknown): TicketResult {
  const b = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};

  for (const key of Object.keys(b)) if (!["category", "related", "subject", "description", "idempotencyKey"].includes(key)) fields[key] = "This value cannot be sent.";

  const category = SUPPORT_CATEGORIES.find((c) => c.value === b.category)?.value;
  if (!category) fields.category = b.category === undefined || b.category === "" ? "Choose an issue category." : "Choose a category from the list.";

  let related: TicketInput["related"] = null;
  if (b.related !== undefined && b.related !== null && b.related !== "") {
    const r = b.related && typeof b.related === "object" && !Array.isArray(b.related) ? (b.related as Record<string, unknown>) : null;
    const type = r ? RELATED_TYPES.find((t) => t.value === r.type)?.value : undefined;
    const reference = r && typeof r.reference === "string" ? r.reference.trim() : "";
    if (!r || !type) fields.related = "Choose what this is about from the list.";
    else if (!REFERENCE_LIKE.test(reference)) fields.related = "That reference is not valid.";
    else related = { type, reference };
  }

  const subject = clean(b.subject, SUBJECT_MAX);
  if (subject.length < SUBJECT_MIN) fields.subject = `Describe the issue briefly (at least ${SUBJECT_MIN} characters).`;
  else if (subject.length > SUBJECT_MAX || /[<>]/.test(subject)) fields.subject = `Keep the subject within ${SUBJECT_MAX} characters, without < or >.`;

  const description = cleanMultiline(b.description, DESCRIPTION_MAX);
  if (description.replace(/\s/g, "").length === 0) fields.description = "Describe the issue.";
  else if (description.length < DESCRIPTION_MIN) fields.description = `Give a little more detail (at least ${DESCRIPTION_MIN} characters).`;
  else if (description.length > DESCRIPTION_MAX || /[<>]/.test(description)) fields.description = `Keep the description within ${DESCRIPTION_MAX} characters, without < or >.`;

  if (typeof b.idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(b.idempotencyKey)) fields.idempotencyKey = "Reload the page and try again.";

  if (Object.keys(fields).length > 0 || !category) return { ok: false, fields };
  return { ok: true, value: { category, related, subject, description, idempotencyKey: b.idempotencyKey as string } };
}

// ---------- the list query ----------
export const SORTS = [
  { value: "newest", label: "Newest Created" },
  { value: "oldest", label: "Oldest Created" },
  { value: "updated", label: "Recently Updated" },
] as const;
export type SortKey = (typeof SORTS)[number]["value"];

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

export const STATUS_FILTER_VALUES = ["all", ...TICKET_STATUSES.map((s) => s.toLowerCase())] as const;

export interface TicketListQuery {
  q: string;
  status: string;
  categoryId: SupportCategory | null;
  relatedEntityType: RelatedType | null;
  window: { start: Date; end: Date; key: string; startDate: string; endDate: string } | null;
  sort: SortKey;
  page: number;
  limit: number;
}

export type TicketQueryResult = { ok: true; value: TicketListQuery } | { ok: false; fields: Record<string, string> };

const str = (v: unknown): string | undefined | null => (v === undefined || v === "" ? undefined : typeof v === "string" ? v : null);

/** Parses and validates every list parameter; anything not recognised is refused. Unknown parameters (buyerId...) are ignored, never read. */
export function parseTicketQuery(p: Record<string, unknown>): TicketQueryResult {
  const fields: Record<string, string> = {};
  const text = (key: string) => {
    const v = str(p[key]);
    if (v === null) fields[key] = "Send a single text value.";
    return v ?? undefined;
  };

  const q = (text("q") ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length > SEARCH_MAX) fields.q = `The search text can be at most ${SEARCH_MAX} characters.`;

  const status = (text("status") ?? "all").toLowerCase();
  if (!(STATUS_FILTER_VALUES as readonly string[]).includes(status)) fields.status = "That status is not valid.";

  const rawCategory = text("categoryId");
  const categoryId = SUPPORT_CATEGORIES.find((c) => c.value === rawCategory)?.value;
  if (rawCategory !== undefined && !categoryId) fields.categoryId = "That category is not valid.";

  const rawRelated = text("relatedEntityType");
  const relatedEntityType = RELATED_TYPES.find((t) => t.value === rawRelated)?.value;
  if (rawRelated !== undefined && !relatedEntityType) fields.relatedEntityType = "Choose one of: inquiry, quotation, order, product.";

  const rawSort = text("sort") ?? "newest";
  const sort = SORTS.find((s) => s.value === rawSort)?.value;
  if (!sort) fields.sort = "Choose one of: newest, oldest, updated.";

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
  let window: TicketListQuery["window"] = null;
  if (range !== undefined || dateFrom !== undefined || dateTo !== undefined) {
    if (range !== undefined && !DATE_RANGES.some((r) => r.value === range)) fields.range = "Choose one of: 7d, 30d, 90d, this-month, previous-month, custom.";
    else {
      const parsed = parseDashboardRange({ range: range ?? "custom", startDate: dateFrom, endDate: dateTo });
      if (!parsed.ok) fields[dateFrom !== undefined || dateTo !== undefined ? "dateFrom" : "range"] = parsed.error;
      else window = { start: parsed.value.start, end: parsed.value.end, key: parsed.value.key, startDate: parsed.value.startDate, endDate: parsed.value.endDate };
    }
  }

  if (Object.keys(fields).length > 0 || !sort) return { ok: false, fields };
  return { ok: true, value: { q, status, categoryId: categoryId ?? null, relatedEntityType: relatedEntityType ?? null, window, sort, page, limit } };
}

export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- FAQ ----------
export const FAQ_CATEGORIES = [
  { value: "account", label: "Account & Registration" },
  { value: "products", label: "Products" },
  { value: "suppliers", label: "Suppliers" },
  { value: "inquiries", label: "Inquiries & RFQs" },
  { value: "quotations", label: "Quotations" },
  { value: "orders", label: "Orders" },
  { value: "technical", label: "Technical Support" },
] as const;
// Payments, Delivery and Returns are not listed: Finbyn Mart has no payment, delivery or return policy to state, and none is invented.
export type FaqCategory = (typeof FAQ_CATEGORIES)[number]["value"];
