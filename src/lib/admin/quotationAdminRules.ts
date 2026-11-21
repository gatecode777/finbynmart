/**
 * Client-safe rules of Admin Quotation Management (Page 58). READ-ONLY OVERSIGHT: this module and its service never accept, reject, revise, withdraw, edit or create a quotation.
 *
 * One list row = one logical quotation = its CURRENT submitted version (`isCurrent: true`, status not DRAFT). A supplier's private draft, a revision draft (`isCurrent: false`, DRAFT) and
 * older versions are never rows and never counted; earlier SUBMITTED versions appear only as labelled history inside the detail.
 *
 * Status is the buyer-facing EFFECTIVE status of the existing system (`effectiveStatus`: persisted status + `validUntil` at ONE reference time per response). The filters below are the same
 * conditions as the buyer tabs, except that "Active" excludes the expiring-soon ones so the filters partition exactly what the badges show. An accepted quotation stays Accepted after its
 * validity date; expiry applies only while a quotation is still open to a decision.
 */
export const QUOTATION_FILTERS = [
  { key: "all", label: "All statuses" },
  { key: "active", label: "Active" },
  { key: "expiring", label: "Expiring soon" },
  { key: "revision", label: "Revision requested" },
  { key: "accepted", label: "Accepted" },
  { key: "rejected", label: "Rejected" },
  { key: "expired", label: "Expired" },
  { key: "withdrawn", label: "Withdrawn" },
] as const;
export type QuotationFilter = (typeof QUOTATION_FILTERS)[number]["key"];
export const FILTER_KEYS = QUOTATION_FILTERS.map((f) => f.key) as readonly string[];

export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const MAX_PAGE = 1000;
export const SEARCH_MAX = 40;
/** Search text is a reference prefix: letters, digits and hyphens only (so it is never query syntax). */
export const SEARCH_RE = /^[A-Za-z0-9-]{1,40}$/;
export const QUOTATION_REF_RE = /^FBM-QT-[0-9A-HJKMNP-TV-Z]{8}$/;

export const cleanText = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

export interface QuotationListState { q: string; status: QuotationFilter; page: number }
export const EMPTY_STATE: QuotationListState = { q: "", status: "all", page: 1 };

export function parseListState(sp: URLSearchParams): QuotationListState {
  const status = sp.get("status");
  const page = Number(sp.get("page"));
  const q = cleanText(sp.get("q"), SEARCH_MAX);
  return { q: SEARCH_RE.test(q) ? q : "", status: status && FILTER_KEYS.includes(status) ? (status as QuotationFilter) : "all", page: Number.isInteger(page) && page >= 1 ? Math.min(MAX_PAGE, page) : 1 };
}
export function toListParams(s: QuotationListState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.status !== "all") p.set("status", s.status);
  if (s.page > 1) p.set("page", String(s.page));
  return p;
}
/** Strict validation for the API (an unknown value is a 422). */
export function validateListState(get: (k: string) => string | null | undefined): { ok: true; state: QuotationListState } | { ok: false; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const q = cleanText(get("q"), 500);
  if (q && !SEARCH_RE.test(q)) fields.q = "Search by a quotation or requirement reference (letters, digits and hyphens, up to 40 characters).";
  const st = get("status");
  if (st && !FILTER_KEYS.includes(st)) fields.status = "Unknown filter value.";
  const pageRaw = get("page");
  const page = pageRaw ? Number(pageRaw) : 1;
  if (pageRaw && (!Number.isInteger(page) || page < 1 || page > MAX_PAGE)) fields.page = "Unknown page.";
  const limitRaw = get("limit");
  if (limitRaw && (!/^\d{1,3}$/.test(limitRaw) || Number(limitRaw) < 1 || Number(limitRaw) > MAX_PAGE_SIZE)) fields.limit = `Use a number from 1 to ${MAX_PAGE_SIZE}.`;
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, state: { q, status: (st && FILTER_KEYS.includes(st) ? st : "all") as QuotationFilter, page } };
}

/** Decimal string of an integer minor-unit amount with two decimals, for comparing with the stored snapshot strings (no floating point). */
export function minorToDecimal(minor: number): string {
  const neg = minor < 0;
  const abs = BigInt(Math.abs(minor));
  return `${neg ? "-" : ""}${abs / BigInt(100)}.${String(abs % BigInt(100)).padStart(2, "0")}`;
}
/** True when two decimal strings are the same number (so "24000", "24000.0" and "24000.00" agree). */
export function sameAmount(a: string, b: string): boolean {
  const norm = (s: string) => { const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s.trim()); return m ? `${m[1] === "-" && /[1-9]/.test(m[2] + (m[3] ?? "")) ? "-" : ""}${m[2].replace(/^0+(?=\d)/, "")}.${(m[3] ?? "").replace(/0+$/, "") || "0"}` : null; };
  const x = norm(a), y = norm(b);
  return x !== null && x === y;
}
