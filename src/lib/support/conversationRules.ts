import { IDEMPOTENCY_KEY, cleanMultiline, type TicketStatus } from "./ticketRules";

/**
 * Page 37: the buyer's conversation on a ticket. Client-safe rules only (no database): validation of a reply, a reopen request and
 * feedback, which actions a status allows, the paging cursors and the ordering key shared by messages and events. The server uses
 * the same functions and is the authority; the browser only mirrors them for instant feedback.
 */
export const MESSAGE_MIN = 2;
export const MESSAGE_MAX = 2000;
export const REOPEN_REASON_MIN = 10;
export const REOPEN_REASON_MAX = 1000;
export const FEEDBACK_MAX = 1000;
/** A ticket can be reopened within this many days of being resolved or closed (a policy of this application; nothing else defines one). */
export const REOPEN_WINDOW_DAYS = 30;
/** At most this many reopenings per ticket. */
export const MAX_REOPENS = 3;
export const CONVERSATION_PAGE = 20;
/** The sections of the ticket page, as they appear in the address (?tab=...). Here, not in a client component, so the server page can read them. */
export const TICKET_TAB_KEYS = ["conversation", "timeline", "attachments", "related"] as const;
export type TicketTab = (typeof TICKET_TAB_KEYS)[number];
export const CONVERSATION_MAX_PAGE = 50;

const DAY = 86_400_000;

// ---------- what a status allows ----------
/** The buyer may write while support could still act on the ticket. A resolved or closed ticket must be reopened first. */
export const REPLY_STATUSES: readonly TicketStatus[] = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_BUYER", "WAITING_FOR_SUPPORT", "REOPENED"];

export interface Allowed {
  allowed: boolean;
  /** Why not, in words for the buyer (null when allowed). */
  reason: string | null;
}

export function replyState(status: TicketStatus): Allowed {
  if (REPLY_STATUSES.includes(status)) return { allowed: true, reason: null };
  return { allowed: false, reason: status === "CLOSED" ? "This ticket is closed. Reopen it to reply." : "This ticket is resolved. Reopen it to reply." };
}

/** A buyer's reply on a ticket that is waiting for them moves it back to In Progress (an allowed transition); any other status is left as it is. */
export function replyTransition(status: TicketStatus): TicketStatus | null {
  return status === "WAITING_FOR_BUYER" ? "IN_PROGRESS" : null;
}

export function reopenState(status: TicketStatus, resolvedAt: Date | null, reopenCount: number, now = new Date()): Allowed {
  if (status !== "RESOLVED" && status !== "CLOSED") return { allowed: false, reason: "Only a resolved or closed ticket can be reopened." };
  if (reopenCount >= MAX_REOPENS) return { allowed: false, reason: `This ticket has already been reopened ${MAX_REOPENS} times. Raise a new ticket instead.` };
  if (resolvedAt && now.getTime() - resolvedAt.getTime() > REOPEN_WINDOW_DAYS * DAY) return { allowed: false, reason: `A ticket can be reopened within ${REOPEN_WINDOW_DAYS} days of being resolved or closed. Raise a new ticket instead.` };
  return { allowed: true, reason: null };
}

export function feedbackState(status: TicketStatus, submitted: boolean): Allowed {
  if (submitted) return { allowed: false, reason: "You already sent feedback for this ticket." };
  if (status !== "RESOLVED" && status !== "CLOSED") return { allowed: false, reason: "Feedback can be sent once the ticket is resolved or closed." };
  return { allowed: true, reason: null };
}

// ---------- validation ----------
type Fields = Record<string, string>;
export type Checked<T> = { ok: true; value: T } | { ok: false; fields: Fields };

const object = (raw: unknown) => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});

function text(raw: unknown, name: string, min: number, max: number, fields: Fields, label: string) {
  const value = cleanMultiline(raw, max);
  if (value.replace(/\s/g, "").length === 0) fields[name] = `Write your ${label}.`;
  else if (value.length < min) fields[name] = `Write at least ${min} characters.`;
  else if (value.length > max || /[<>]/.test(value)) fields[name] = `Keep it within ${max} characters, without < or >.`;
  return value;
}

/** Fields only the server decides: sender, role, ticket, status, visibility, dates, attachment records. A request carrying one is refused. */
export const FORBIDDEN_CONVERSATION_FIELDS = ["senderId", "senderRole", "senderName", "role", "buyerId", "userId", "ticketId", "ticketReference", "reference", "status", "visibility", "kind", "createdAt", "updatedAt", "attachments", "attachmentIds", "events", "internal", "internalNotes", "agentId", "assignedAgentId"] as const;

export function validateReply(raw: unknown): Checked<{ message: string; idempotencyKey: string }> {
  const b = object(raw);
  const fields: Fields = {};
  for (const key of Object.keys(b)) if (!["message", "idempotencyKey"].includes(key)) fields[key] = "This value cannot be sent.";
  const message = text(b.message, "message", MESSAGE_MIN, MESSAGE_MAX, fields, "reply");
  if (typeof b.idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(b.idempotencyKey)) fields.idempotencyKey = "Reload the page and try again.";
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, value: { message, idempotencyKey: b.idempotencyKey as string } };
}

export function validateReopen(raw: unknown): Checked<{ reason: string }> {
  const b = object(raw);
  const fields: Fields = {};
  for (const key of Object.keys(b)) if (key !== "reason") fields[key] = "This value cannot be sent.";
  const reason = text(b.reason, "reason", REOPEN_REASON_MIN, REOPEN_REASON_MAX, fields, "reason for reopening");
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, value: { reason } };
}

export function validateFeedback(raw: unknown): Checked<{ rating: number; feedbackText: string }> {
  const b = object(raw);
  const fields: Fields = {};
  for (const key of Object.keys(b)) if (!["rating", "feedbackText"].includes(key)) fields[key] = "This value cannot be sent.";
  const rating = b.rating;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) fields.rating = "Choose a rating from 1 to 5.";
  let feedbackText = "";
  if (b.feedbackText !== undefined && b.feedbackText !== null && b.feedbackText !== "") {
    feedbackText = cleanMultiline(b.feedbackText, FEEDBACK_MAX);
    if (feedbackText.length > FEEDBACK_MAX || /[<>]/.test(feedbackText)) fields.feedbackText = `Keep your feedback within ${FEEDBACK_MAX} characters, without < or >.`;
  }
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, value: { rating: rating as number, feedbackText } };
}

// ---------- ordering key and cursors ----------
/**
 * Messages and events share one ordering: the time (zero-padded milliseconds), then the source ("e" events before "m" messages at the same
 * millisecond), then the record's own id. A cursor is such a key, so a page never repeats or skips a record, whichever source it came from.
 */
export const orderKey = (at: Date | number, source: "e" | "m", id: string) => `${String(typeof at === "number" ? at : at.getTime()).padStart(15, "0")}:${source}:${id}`;
export const KEY_PATTERN = /^\d{15}:[em]:[0-9a-f]{1,24}$/;

export function parseKey(key: string): { ms: number; source: "e" | "m"; id: string } | null {
  if (!KEY_PATTERN.test(key)) return null;
  const [ms, source, id] = key.split(":");
  return { ms: Number(ms), source: source as "e" | "m", id };
}

export interface PageQuery {
  limit: number;
  cursor: string | null;
}

export type PageQueryResult = { ok: true; value: PageQuery } | { ok: false; fields: Fields };

/** `limit` (default 20, at most 50) and the cursor parameter (`before` for the conversation, `after` for the timeline and the files). */
export function parsePageQuery(p: Record<string, unknown>, cursorName: "before" | "after"): PageQueryResult {
  const fields: Fields = {};
  let limit = CONVERSATION_PAGE;
  if (p.limit !== undefined && p.limit !== "") {
    const n = typeof p.limit === "string" && /^\d{1,3}$/.test(p.limit) ? Number(p.limit) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > CONVERSATION_MAX_PAGE) fields.limit = `The page size must be between 1 and ${CONVERSATION_MAX_PAGE}.`;
    else limit = n;
  }
  let cursor: string | null = null;
  const raw = p[cursorName];
  if (raw !== undefined && raw !== "") {
    if (typeof raw !== "string" || !parseKey(raw)) fields[cursorName] = "That page marker is not valid.";
    else cursor = raw;
  }
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, value: { limit, cursor } };
}
