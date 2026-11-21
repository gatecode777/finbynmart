/**
 * Recently Viewed (Page 32): client-safe rules. The cap and page size are IMPLEMENTATION DEFAULTS chosen for this feature, not an existing business
 * policy (docs/page-designs/PAGE_32_RECENTLY_VIEWED.md). There is no time-based expiry.
 */
export const RECENT_CAP = 100;
export const RECENT_PAGE = 20;
const ENTRY_ID = /^[0-9a-f]{24}$/;
const CURSOR = /^(\d{10,14})_([0-9a-f]{24})$/;

export const isEntryId = (value: unknown): value is string => typeof value === "string" && ENTRY_ID.test(value);

export interface Cursor { ms: number; id: string }
export const encodeCursor = (c: Cursor) => `${c.ms}_${c.id}`;
export function decodeCursor(value: string): Cursor | null {
  const m = CURSOR.exec(value);
  return m ? { ms: Number(m[1]), id: m[2] } : null;
}

export type ListQuery = { ok: true; value: { cursor: Cursor | null; limit: number } } | { ok: false; fields: Record<string, string> };

/** `cursor` is opaque (time and entry id, the same sort key as the index); `limit` is 1 to RECENT_PAGE. Anything else is refused, never guessed. */
export function parseListQuery(params: Record<string, unknown>): ListQuery {
  const fields: Record<string, string> = {};
  let cursor: Cursor | null = null;
  const rawCursor = params.cursor;
  if (rawCursor !== undefined && rawCursor !== "") {
    cursor = typeof rawCursor === "string" ? decodeCursor(rawCursor) : null;
    if (!cursor) fields.cursor = "Reload the page and try again.";
  }
  let limit = RECENT_PAGE;
  const rawLimit = params.limit;
  if (rawLimit !== undefined && rawLimit !== "") {
    const n = typeof rawLimit === "string" && /^\d{1,3}$/.test(rawLimit) ? Number(rawLimit) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > RECENT_PAGE) fields.limit = `Use a number from 1 to ${RECENT_PAGE}.`;
    else limit = n;
  }
  for (const key of Object.keys(params)) if (!["cursor", "limit"].includes(key)) fields[key] = "This parameter is not supported.";
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, value: { cursor, limit } };
}

/** "Viewed today", "Viewed yesterday", otherwise the date, by calendar day in the viewer's time zone. */
export function viewedLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Viewed recently";
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff <= 0) return "Viewed today";
  if (diff === 1) return "Viewed yesterday";
  return `Viewed ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
}
