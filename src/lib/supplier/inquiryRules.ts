import { IDEMPOTENCY_KEY } from "@/lib/quotations/quoteRules";
import { canTransition, normaliseStatus, type InquiryStatus } from "@/lib/inquiries/rules";

/**
 * Supplier inquiry response rules (Page 41). Pure, shared by the service, the routes, the page and the node-run unit tests.
 *
 * There is ONE messaging model: an `inquiry_messages` row of type RESPONSE or CLARIFICATION (a clarification is a message type, not a second subsystem).
 * Plain text only; the author, company, recipient, type-independent timestamps and status effects are decided on the server, never taken from the body.
 */
export const MESSAGE_TYPES = [
  { value: "RESPONSE", label: "Send Response" },
  { value: "CLARIFICATION", label: "Ask Clarification" },
] as const;
/** What a SUPPLIER may send. */
export type SupplierMessageType = (typeof MESSAGE_TYPES)[number]["value"];
/** Every row type of the conversation store: the buyer's private follow-up is BUYER_REPLY (written only by the buyer-side service). */
export type MessageType = SupplierMessageType | "BUYER_REPLY";
export const MESSAGE_TYPE_LABEL: Record<MessageType, string> = { RESPONSE: "Response", CLARIFICATION: "Clarification request", BUYER_REPLY: "Buyer reply" };

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;
export const RESPONSES_PAGE_SIZE = 20;
export const RESPONSES_MAX_PAGE_SIZE = 50;
export const ACTIVITY_LIMIT = 50;

export interface ResponseInput {
  type: SupplierMessageType;
  message: string;
  idempotencyKey: string;
}
export type ResponseParse = { ok: true; value: ResponseInput } | { ok: false; fields: Record<string, string> };

/** Plain text normalisation: NFKC, control characters become spaces (newlines are kept as single line breaks), runs of spaces collapse, ends trimmed. */
export function cleanMessage(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A message is "meaningful" when it has real content: enough characters and not one character repeated (aaaaaaaaaa) or only punctuation. */
export const isMeaningful = (text: string): boolean => {
  const letters = text.replace(/[^\p{L}\p{N}]/gu, "");
  return letters.length >= 5 && new Set(letters.toLowerCase()).size >= 3;
};

/** Only `type`, `message` and `idempotencyKey` are read. Anything else (author, company, buyer, timestamp, status, attachments) is refused, not ignored, so a forged field is visible. */
export function parseResponseBody(body: Record<string, unknown>, headerKey?: string | null): ResponseParse {
  const fields: Record<string, string> = {};
  const extra = Object.keys(body).filter((k) => !["type", "message", "idempotencyKey"].includes(k));
  if (extra.length > 0) fields._ = `These fields are not accepted: ${extra.slice(0, 5).join(", ")}. The server decides the author, recipient, time and status.`;
  const type = MESSAGE_TYPES.find((t) => t.value === body.type)?.value;
  if (!type) fields.type = "Choose Send Response or Ask Clarification.";
  let message = "";
  if (typeof body.message !== "string") fields.message = "Write a message.";
  else {
    message = cleanMessage(body.message);
    if (message.length < MESSAGE_MIN) fields.message = `Write at least ${MESSAGE_MIN} characters.`;
    else if (message.length > MESSAGE_MAX) fields.message = `The message can be at most ${MESSAGE_MAX} characters.`;
    else if (!isMeaningful(message)) fields.message = "Write a meaningful message for the buyer.";
  }
  const keyRaw = body.idempotencyKey ?? headerKey ?? undefined;
  const key = typeof keyRaw === "string" ? keyRaw : "";
  if (!IDEMPOTENCY_KEY.test(key)) fields.idempotencyKey = "A key of 16 to 64 letters, digits, - or _ is required.";
  if (Object.keys(fields).length > 0 || !type) return { ok: false, fields };
  return { ok: true, value: { type, message, idempotencyKey: key } };
}

// ---------- who and when ----------
export const TERMINAL_INQUIRY: readonly InquiryStatus[] = ["CLOSED", "CANCELLED", "REJECTED"];

/** An inquiry can be answered while it is open and came from a registered buyer (a guest has no account to receive a message). */
export function replyEligibility(status: string | undefined, hasBuyer: boolean): { ok: true } | { ok: false; code: "NOT_ELIGIBLE" | "INQUIRY_CLOSED"; message: string } {
  if (!hasBuyer) return { ok: false, code: "NOT_ELIGIBLE", message: "This inquiry was sent by a guest without an account, so there is no buyer account to receive a message." };
  const s = normaliseStatus(status);
  if (TERMINAL_INQUIRY.includes(s)) return { ok: false, code: "INQUIRY_CLOSED", message: `This inquiry is ${s === "CLOSED" ? "closed" : s === "CANCELLED" ? "cancelled by the buyer" : "declined"}, so it can no longer be answered.` };
  return { ok: true };
}

/**
 * The inquiry's own lifecycle steps a message causes, each one a transition the lifecycle allows (never a status invented for this page):
 *  RESPONSE      NEW / NOTIFIED -> IN_PROGRESS -> REPLIED, IN_PROGRESS -> REPLIED; REPLIED and QUOTED stay as they are
 *  CLARIFICATION NEW / NOTIFIED -> IN_PROGRESS (the supplier is handling it); no "waiting for buyer" status exists, so none is set
 * The inquiry is addressed to ONE seller, so these steps are that supplier's; a message never closes, accepts, orders or pays anything.
 */
export function statusPlan(from: string | undefined, type: MessageType): InquiryStatus[] {
  let current = normaliseStatus(from);
  const wanted: InquiryStatus[] = type === "RESPONSE" ? (current === "NEW" || current === "NOTIFIED" ? ["IN_PROGRESS", "REPLIED"] : current === "IN_PROGRESS" ? ["REPLIED"] : []) : current === "NEW" || current === "NOTIFIED" ? ["IN_PROGRESS"] : [];
  const steps: InquiryStatus[] = [];
  for (const next of wanted) {
    if (!canTransition(current, next)) break;
    steps.push(next);
    current = next;
  }
  return steps;
}

export const canRespond = (p: { respondToInquiries: boolean }) => p.respondToInquiries === true;

// ---------- cursor pagination (newest first, stable on createdAt then _id) ----------
export interface Cursor {
  t: number;
  id: string;
}
export const encodeCursor = (c: Cursor): string => Buffer.from(JSON.stringify(c)).toString("base64url");
export function decodeCursor(text: unknown): Cursor | null {
  if (typeof text !== "string" || text.length === 0 || text.length > 100 || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const { t, id } = parsed as Record<string, unknown>;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id)) return null;
    return { t, id };
  } catch {
    return null;
  }
}

export function parseListQuery(params: URLSearchParams): { ok: true; limit: number; cursor: Cursor | null } | { ok: false; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const limitText = params.get("limit");
  let limit = RESPONSES_PAGE_SIZE;
  if (limitText !== null && limitText !== "") {
    const n = Number(limitText);
    if (!Number.isInteger(n) || n < 1 || n > RESPONSES_MAX_PAGE_SIZE) fields.limit = `limit must be a whole number from 1 to ${RESPONSES_MAX_PAGE_SIZE}.`;
    else limit = n;
  }
  const raw = params.get("cursor");
  let cursor: Cursor | null = null;
  if (raw !== null && raw !== "") {
    cursor = decodeCursor(raw);
    if (!cursor) fields.cursor = "The cursor is not valid.";
  }
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, limit, cursor };
}
