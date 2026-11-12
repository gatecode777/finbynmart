/**
 * Page 38: what the buyer's security pages may show, as plain rules (no database): the event types and their wording, the paging
 * cursor, the date ranges, and the criteria behind the account's security status. Client-safe; the server and the browser share it.
 */
export const SECURITY_EVENT_TYPES = ["LOGIN_SUCCEEDED", "LOGIN_FAILED", "LOGOUT", "PASSWORD_CHANGED", "PASSWORD_RESET", "SIGNED_OUT_EVERYWHERE", "SESSION_REVOKED", "SECURITY_ALERT"] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];
/** The sign-in related subset shown in "Login Activity". */
export const LOGIN_ACTIVITY_TYPES: readonly SecurityEventType[] = ["LOGIN_SUCCEEDED", "LOGIN_FAILED", "LOGOUT"];

export type EventStatus = "success" | "failure" | "info";

export const EVENT_LABEL: Record<SecurityEventType, { title: string; status: EventStatus }> = {
  LOGIN_SUCCEEDED: { title: "Signed in", status: "success" },
  LOGIN_FAILED: { title: "Failed sign-in attempt", status: "failure" },
  LOGOUT: { title: "Signed out", status: "info" },
  PASSWORD_CHANGED: { title: "Password changed", status: "info" },
  PASSWORD_RESET: { title: "Password reset", status: "info" },
  SIGNED_OUT_EVERYWHERE: { title: "Signed out of other devices", status: "info" },
  SESSION_REVOKED: { title: "Device signed out", status: "info" },
  SECURITY_ALERT: { title: "Security alert", status: "info" },
};

export const isSecurityEventType = (value: unknown): value is SecurityEventType => typeof value === "string" && (SECURITY_EVENT_TYPES as readonly string[]).includes(value);

// ---------- retention, windows, thresholds (documented in PAGE_38_SECURITY_EVENT_MODEL.md and PAGE_38_SECURITY_ALERT_RULES.md) ----------
export const EVENT_RETENTION_DAYS = 365;
export const FAILED_LOGIN_RETENTION_DAYS = 90;
export const ALERT_RETENTION_DAYS = 365;
/** Failed sign-ins for one account are counted in buckets of this length (one stored event per bucket, with a count). */
export const FAILED_LOGIN_BUCKET_MINUTES = 15;
/** This many failures in one bucket raise a "repeated failed sign-ins" alert (at most one per hour). */
export const FAILED_LOGIN_ALERT_THRESHOLD = 5;
/** "Recent" security alerts on the overview: unacknowledged ones this many days back. */
export const RECENT_ALERT_DAYS = 30;

// ---------- paging ----------
export const PAGE_DEFAULT = 20;
export const PAGE_MAX = 50;

export const RANGES = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "all", label: "All recorded", days: EVENT_RETENTION_DAYS },
] as const;
export type RangeKey = (typeof RANGES)[number]["value"];

/** The paging key: time (zero-padded milliseconds), then the record id. A cursor is such a key, so a page never repeats or skips a record. */
export const eventKey = (at: Date, id: string) => `${String(at.getTime()).padStart(15, "0")}:${id}`;
export const KEY_PATTERN = /^\d{15}:[0-9a-f]{24}$/;
export const parseEventKey = (key: string) => (KEY_PATTERN.test(key) ? { ms: Number(key.slice(0, 15)), id: key.slice(16) } : null);

export interface SecurityListQuery {
  limit: number;
  before: string | null;
  range: RangeKey;
}

export type SecurityQueryResult = { ok: true; value: SecurityListQuery } | { ok: false; fields: Record<string, string> };

/** `limit` (default 20, at most 50), `before` (the previous answer's cursor) and `range`. Anything else is ignored; anything invalid is refused. */
export function parseSecurityListQuery(p: Record<string, unknown>): SecurityQueryResult {
  const fields: Record<string, string> = {};
  let limit = PAGE_DEFAULT;
  if (p.limit !== undefined && p.limit !== "") {
    const n = typeof p.limit === "string" && /^\d{1,3}$/.test(p.limit) ? Number(p.limit) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > PAGE_MAX) fields.limit = `The page size must be between 1 and ${PAGE_MAX}.`;
    else limit = n;
  }
  let before: string | null = null;
  if (p.before !== undefined && p.before !== "") {
    if (typeof p.before !== "string" || !parseEventKey(p.before)) fields.before = "That page marker is not valid.";
    else before = p.before;
  }
  let range: RangeKey = "90d";
  if (p.range !== undefined && p.range !== "") {
    const found = RANGES.find((r) => r.value === p.range);
    if (!found) fields.range = "Choose a range from the list.";
    else range = found.value;
  }
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, value: { limit, before, range } };
}

export const rangeSince = (range: RangeKey, now = new Date()) => new Date(now.getTime() - (RANGES.find((r) => r.value === range)?.days ?? 90) * 86_400_000);

// ---------- the account's security status ----------
export type SecurityStatus = "protected" | "action_required" | "incomplete" | "unavailable";

export interface StatusInput {
  emailVerified: boolean;
  /** Open (unacknowledged) alerts with severity "warning" in the last RECENT_ALERT_DAYS days. */
  openWarningAlerts: number;
}

/**
 * The documented criteria (no score): ACTION REQUIRED when a warning alert is still open; otherwise INCOMPLETE when the e-mail address is not
 * confirmed (it is the recovery channel); otherwise PROTECTED. Two-step verification is not available and so does not count either way.
 */
export function securityStatus(input: StatusInput): { status: SecurityStatus; reasons: string[] } {
  if (input.openWarningAlerts > 0) return { status: "action_required", reasons: [`${input.openWarningAlerts} security ${input.openWarningAlerts === 1 ? "alert needs" : "alerts need"} your attention.`] };
  if (!input.emailVerified) return { status: "incomplete", reasons: ["Your email address is not confirmed, so it cannot be used to recover your account."] };
  return { status: "protected", reasons: [] };
}

export const STATUS_LABEL: Record<SecurityStatus, string> = { protected: "Protected", action_required: "Action Required", incomplete: "Incomplete", unavailable: "Unavailable" };

// ---------- sessions ----------
/** Sessions cannot be named by anything but their random public id. */
export const SESSION_PUBLIC_ID = /^[0-9a-f]{16}$/;
export const ALERT_ID = /^[0-9a-f]{24}$/;

// ---------- the page's sections (in the address as ?tab=); here, not in a client component, so the server page can read them ----------
export const SECURITY_TAB_KEYS = ["overview", "password", "2fa", "sessions", "activity", "alerts"] as const;
export type SecurityTab = (typeof SECURITY_TAB_KEYS)[number];
