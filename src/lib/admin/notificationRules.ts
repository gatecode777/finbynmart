/**
 * Client-safe rules of Admin Notifications (Page 62). Notifications are CONTROLLED, server-generated event records, never free text: each event type has a fixed title, a fixed generic
 * description, the capability an administrator must CURRENTLY hold to see it, and a destination built from a trusted type and the stored record reference. Nothing user-authored (no
 * subject, message, document content, buyer or supplier detail) is stored or returned. Reading a notification never changes the related task.
 */
import type { AdminCapability } from "./permissions";

export const EVENT_TYPES = [
  { key: "VERIFICATION_SUBMITTED", label: "Supplier verification", title: "Supplier verification submitted", description: "A supplier verification submission is ready for review.", capability: "verification.read", linkLabel: "View submission" },
  { key: "PRODUCT_REVISION_SUBMITTED", label: "Product revision", title: "Product revision submitted", description: "A submitted product revision is ready for review.", capability: "products.review", linkLabel: "View review" },
  { key: "SUPPORT_TICKET_CREATED", label: "Support ticket", title: "Support ticket opened", description: "A new support ticket is awaiting staff review.", capability: "support.manage", linkLabel: "View ticket" },
] as const satisfies readonly { key: string; label: string; title: string; description: string; capability: AdminCapability; linkLabel: string }[];
export type EventType = (typeof EVENT_TYPES)[number]["key"];
export const EVENT_KEYS = EVENT_TYPES.map((e) => e.key) as readonly string[];
export const eventOf = (key: string) => EVENT_TYPES.find((e) => e.key === key);
export const capabilityOf = (type: EventType): AdminCapability => EVENT_TYPES.find((e) => e.key === type)!.capability;

/** The event types a set of CURRENT permissions may see (the audience rule: capability only; the admin model has no narrower record scope). */
export const visibleTypes = (permissions: readonly AdminCapability[]): EventType[] => EVENT_TYPES.filter((e) => permissions.includes(e.capability)).map((e) => e.key);

export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
const ENTRY_ID = /^[0-9a-f]{24}$/;
const CURSOR = /^(\d{10,14})_([0-9a-f]{24})$/;
export const isEventId = (v: unknown): v is string => typeof v === "string" && ENTRY_ID.test(v);
export const encodeCursor = (c: { ms: number; id: string }) => `${c.ms}_${c.id}`;
export const decodeCursor = (v: string): { ms: number; id: string } | null => { const m = CURSOR.exec(v); return m ? { ms: Number(m[1]), id: m[2] } : null; };

/** Destination from a trusted type and the stored reference. Every destination is a same-site admin path that enforces its own permission. */
export function destinationOf(type: EventType, reference: string): string {
  if (type === "VERIFICATION_SUBMITTED") return /^[A-Z0-9-]{6,40}$/.test(reference) ? `/admin/verification?review=${encodeURIComponent(reference)}` : "/admin/verification";
  if (type === "PRODUCT_REVISION_SUBMITTED") return "/admin/product-review";
  return "/admin/support";
}

export interface NotificationQuery { tab: "all" | "unread"; type: EventType | "all"; cursor: { ms: number; id: string } | null; limit: number }
export type QueryResult = { ok: true; value: NotificationQuery } | { ok: false; fields: Record<string, string> };

/** Strict validation: an unknown tab, type, cursor, limit or any other parameter is refused (a client can never name an admin). `count` is handled by the route. */
export function parseQuery(get: (k: string) => string | null | undefined, keys: Iterable<string>): QueryResult {
  const fields: Record<string, string> = {};
  const tab = get("tab") || "all";
  if (tab !== "all" && tab !== "unread") fields.tab = "Unknown tab.";
  const type = get("type") || "all";
  if (type !== "all" && !EVENT_KEYS.includes(type)) fields.type = "Unknown event type.";
  let cursor: { ms: number; id: string } | null = null;
  const c = get("cursor");
  if (c) { cursor = decodeCursor(c); if (!cursor) fields.cursor = "Reload the page and try again."; }
  let limit = PAGE_SIZE;
  const l = get("limit");
  if (l) { const n = /^\d{1,3}$/.test(l) ? Number(l) : NaN; if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE_SIZE) fields.limit = `Use a number from 1 to ${MAX_PAGE_SIZE}.`; else limit = n; }
  for (const k of keys) if (!["tab", "type", "cursor", "limit", "count"].includes(k)) fields[k] = "This parameter is not supported.";
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, value: { tab: tab as "all" | "unread", type: type as EventType | "all", cursor, limit } };
}

/** "99+" above 99; the server keeps the exact number. */
export const badgeText = (n: number): string => (n > 99 ? "99+" : String(n));

/** The sortable key of an event: its recorded time (zero padded) and id. */
export const eventKey = (ms: number, id: string): string => `${String(ms).padStart(15, "0")}_${id}`;
export function splitKey(key: string): { ms: number; id: string } { const i = key.indexOf("_"); return { ms: Number(key.slice(0, i)), id: key.slice(i + 1) }; }

/** "10 minutes ago", "1 hour ago", "Yesterday", otherwise the date: for display only (the absolute time is in the tooltip). */
export function relativeTime(iso: string, now = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (sec < 60) return "Just now";
  if (sec < 3600) { const m = Math.floor(sec / 60); return `${m} minute${m === 1 ? "" : "s"} ago`; }
  if (sec < 86_400) { const h = Math.floor(sec / 3600); return `${h} hour${h === 1 ? "" : "s"} ago`; }
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(new Date(t))) / 86_400_000);
  if (diff === 1) return "Yesterday";
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
