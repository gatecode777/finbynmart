/**
 * Quotation rules. Pure (no database, no imports), shared by the service, the API, the pages and the node-run unit tests.
 *
 * A quotation is one lineage: the same `reference` across its versions (V1, V2 ...), each version its own document, only the
 * latest `isCurrent`. A version is never edited once sent; a revision is a NEW version and the older one becomes SUPERSEDED.
 *
 * Stored statuses (written only by the server): SENT, REVISION_REQUESTED, SUPERSEDED, ACCEPTED, REJECTED, WITHDRAWN.
 * (A DRAFT is never visible to a buyer.) Expiry is never stored: it follows from `validUntil` at the moment of reading, so a
 * quotation can never keep looking active after its validity ended. The buyer-facing status is derived by `effectiveStatus`.
 */
export const REFERENCE_PATTERN = /^FBM-QT-[0-9A-HJKMNP-TV-Z]{8}$/;
export const EXPIRING_DAYS = 7;
export const DAY_MS = 86_400_000;
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;

export type StoredStatus = "DRAFT" | "SENT" | "REVISION_REQUESTED" | "SUPERSEDED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
export type EffectiveStatus = "ACTIVE" | "EXPIRING_SOON" | "REVISION_REQUESTED" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "WITHDRAWN" | "SUPERSEDED";

export const STATUS_LABEL: Record<EffectiveStatus, string> = {
  ACTIVE: "Active",
  EXPIRING_SOON: "Expiring Soon",
  REVISION_REQUESTED: "Revision Requested",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  WITHDRAWN: "Withdrawn",
  SUPERSEDED: "Superseded",
};

export const STATUS_TEXT: Record<EffectiveStatus, string> = {
  ACTIVE: "Quotation is valid and available for your decision.",
  EXPIRING_SOON: "Quotation is still valid but ends soon.",
  REVISION_REQUESTED: "You asked the supplier for a revision. This version stays as it is until the supplier sends a new one.",
  ACCEPTED: "You accepted this quotation.",
  REJECTED: "You rejected this quotation.",
  EXPIRED: "This quotation's validity has ended. It can no longer be accepted.",
  WITHDRAWN: "The supplier withdrew this quotation.",
  SUPERSEDED: "A newer version of this quotation exists.",
};

/** The buyer-facing status at `now`. Only a quotation still open to a decision can expire or expire soon. */
export function effectiveStatus(stored: StoredStatus, validUntil: Date, now = new Date()): EffectiveStatus {
  switch (stored) {
    case "ACCEPTED":
    case "REJECTED":
    case "WITHDRAWN":
    case "SUPERSEDED":
      return stored;
    case "REVISION_REQUESTED":
      return validUntil.getTime() <= now.getTime() ? "EXPIRED" : "REVISION_REQUESTED";
    default: {
      const left = validUntil.getTime() - now.getTime();
      if (left <= 0) return "EXPIRED";
      return left <= EXPIRING_DAYS * DAY_MS ? "EXPIRING_SOON" : "ACTIVE";
    }
  }
}

/** Whole days left (rounded up) while valid; 0 or negative once the validity ended. */
export const daysLeft = (validUntil: Date, now = new Date()) => Math.ceil((validUntil.getTime() - now.getTime()) / DAY_MS);

/** What the buyer may do with a CURRENT version. Every action is checked again on the server before it is applied. */
export function allowedActions(status: EffectiveStatus, isCurrent: boolean, otherAccepted: boolean): { accept: boolean; reject: boolean; requestRevision: boolean } {
  const open = isCurrent && (status === "ACTIVE" || status === "EXPIRING_SOON");
  return {
    accept: open && !otherAccepted,
    reject: isCurrent && (open || status === "REVISION_REQUESTED"),
    requestRevision: open,
  };
}

// ---------- list ----------
export const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "expiring", label: "Expiring Soon" },
  { value: "revision", label: "Revision Requested" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
] as const;
export type StatusTab = (typeof STATUS_TABS)[number]["value"];

export const QUOTATION_SORTS = [
  { value: "received", label: "Recently Received" },
  { value: "oldest", label: "Oldest First" },
  { value: "valid", label: "Valid Till (soonest first)" },
] as const;
export type QuotationSort = (typeof QUOTATION_SORTS)[number]["value"];

export const SEARCH_MAX = 60;
export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const MAX_PAGE = 1000;

export interface QuotationListQuery {
  q: string;
  status: StatusTab;
  sort: QuotationSort;
  page: number;
  limit: number;
}
export type QuotationListQueryResult = { ok: true; value: QuotationListQuery } | { ok: false; fields: Record<string, string> };

const str = (v: unknown): string | undefined | null => (v === undefined || v === "" ? undefined : typeof v === "string" ? v : null);

export function parseQuotationQuery(p: Record<string, unknown>): QuotationListQueryResult {
  const fields: Record<string, string> = {};
  const text = (key: string) => {
    const v = str(p[key]);
    if (v === null) fields[key] = "Send a single text value.";
    return v ?? undefined;
  };
  const q = (text("q") ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length > SEARCH_MAX) fields.q = `The search text can be at most ${SEARCH_MAX} characters.`;
  const status = STATUS_TABS.find((s) => s.value === (text("status") ?? "all").toLowerCase())?.value;
  if (!status) fields.status = "Choose one of: all, active, expiring, revision, accepted, rejected, expired.";
  const sort = QUOTATION_SORTS.find((s) => s.value === (text("sort") ?? "received"))?.value;
  if (!sort) fields.sort = "Choose one of: received, oldest, valid.";
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
  if (Object.keys(fields).length > 0 || !status || !sort) return { ok: false, fields };
  return { ok: true, value: { q, status, sort, page, limit } };
}

export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- decisions and revision requests ----------
export const REVISION_REASONS = [
  { value: "PRICE", label: "Price negotiation" },
  { value: "QUANTITY", label: "Quantity changes" },
  { value: "DELIVERY", label: "Delivery timeline" },
  { value: "PAYMENT", label: "Payment terms" },
  { value: "SPECIFICATIONS", label: "Product specifications" },
  { value: "OTHER", label: "Other" },
] as const;
export type RevisionReason = (typeof REVISION_REASONS)[number]["value"];
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 1000;
export const REASON_MAX = 500;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.normalize("NFKC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max + 1) : "");

export type RevisionResult = { ok: true; value: { reason: RevisionReason; message: string; version: number } } | { ok: false; fields: Record<string, string> };

/** The revision request: a listed reason, a message of 10 to 1,000 characters, and the version the buyer is looking at. */
export function validateRevisionRequest(body: unknown): RevisionResult {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};
  const reason = REVISION_REASONS.find((r) => r.value === b.reason)?.value;
  if (!reason) fields.reason = "Choose a reason from the list.";
  const message = clean(b.message, MESSAGE_MAX);
  if (message.length < MESSAGE_MIN) fields.message = `Describe the change you want (at least ${MESSAGE_MIN} characters).`;
  else if (message.length > MESSAGE_MAX || /[<>]/.test(message)) fields.message = `Keep it within ${MESSAGE_MAX} characters, without < or >.`;
  if (typeof b.version !== "number" || !Number.isInteger(b.version) || b.version < 1) fields.version = "Reload the page and try again.";
  for (const key of Object.keys(b)) if (!["reason", "message", "version"].includes(key)) fields[key] = "This value cannot be sent.";
  if (Object.keys(fields).length > 0 || !reason) return { ok: false, fields };
  return { ok: true, value: { reason, message, version: b.version as number } };
}

export type DecisionResult = { ok: true; value: { version: number; reason: string | null } } | { ok: false; fields: Record<string, string> };

/** Accept or reject: the version being decided, an explicit confirmation, and (for a rejection) an optional reason. */
export function validateDecision(body: unknown, kind: "accept" | "reject"): DecisionResult {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};
  if (typeof b.version !== "number" || !Number.isInteger(b.version) || b.version < 1) fields.version = "Reload the page and try again.";
  if (b.confirm !== true) fields.confirm = "Confirm your decision first.";
  const reason = kind === "reject" ? clean(b.reason, REASON_MAX) : "";
  if (reason.length > REASON_MAX || /[<>]/.test(reason)) fields.reason = `Keep the reason within ${REASON_MAX} characters, without < or >.`;
  for (const key of Object.keys(b)) if (!["version", "confirm", ...(kind === "reject" ? ["reason"] : [])].includes(key)) fields[key] = "This value cannot be sent.";
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value: { version: b.version as number, reason: reason || null } };
}

// ---------- comparison ----------
export interface Comparable {
  reference: string;
  inquiryReference: string | null;
  currency: string;
  unit: string | null;
  quantity: number;
  status: EffectiveStatus;
}

export interface Compatibility {
  sameInquiry: boolean;
  /** The amounts can be set side by side as like for like: one currency, one unit and one quantity. */
  priceComparable: boolean;
  mismatches: { field: "currency" | "unit" | "quantity" | "status"; note: string }[];
}

/** Whether a set of quotations can honestly be compared, and exactly where they differ. Nothing is ranked here. */
export function compatibility(items: Comparable[]): Compatibility {
  const same = <K extends keyof Comparable>(k: K) => items.every((i) => i[k] === items[0][k]);
  const sameInquiry = items.every((i) => i.inquiryReference !== null && i.inquiryReference === items[0].inquiryReference);
  const mismatches: Compatibility["mismatches"] = [];
  if (!same("currency")) mismatches.push({ field: "currency", note: "The quotations are in different currencies, so their amounts are not compared." });
  if (!same("unit")) mismatches.push({ field: "unit", note: "The quotations use different units, so their prices are not like for like." });
  if (!same("quantity")) mismatches.push({ field: "quantity", note: "The offered quantities differ, so the totals are not like for like." });
  if (items.some((i) => i.status === "EXPIRED")) mismatches.push({ field: "status", note: "At least one quotation has expired and is no longer an open offer." });
  return { sameInquiry, priceComparable: same("currency") && same("unit") && same("quantity"), mismatches };
}
