import { DAY_MS, EXPIRING_DAYS, SEARCH_MAX, MAX_PAGE, MAX_PAGE_SIZE, PAGE_SIZE, type EffectiveStatus, type StoredStatus, effectiveStatus } from "@/lib/quotations/quotationRules";
import { parseDashboardRange, RANGE_PRESETS } from "@/lib/buyer/dateRange";

/**
 * Supplier quotation rules (Page 42). Pure and shared by the service, the API, the page and the node-run unit tests.
 *
 * The lifecycle is the ONE quotation lifecycle (src/lib/quotations/quotationRules.ts); this file only decides how a supplier counts, filters
 * and acts on it. A "logical quotation" is one lineage (one `reference`): only its CURRENT version (`isCurrent: true`) is listed or counted, so
 * a revision never counts twice. Supplier tabs (every one is computed on the server from the stored status and `validUntil` at the moment of
 * reading; expiry is never stored and never decided by the browser):
 *   Drafts     stored DRAFT
 *   Submitted  stored SENT or REVISION_REQUESTED, validity not yet ended (waiting for the buyer, or for the supplier's new version)
 *   Accepted   stored ACCEPTED (only the buyer's own decision writes it)
 *   Rejected   stored REJECTED (a withdrawal is NOT a rejection)
 *   Expired    stored SENT or REVISION_REQUESTED, validity ended
 *   All        every current version, which also includes Withdrawn ones (they have no tab of their own)
 * A supplier can never set ACCEPTED or REJECTED: the only status a supplier changes is WITHDRAWN (see `canWithdraw`).
 */
export const SUPPLIER_TABS = [
  { value: "all", label: "All Quotations" },
  { value: "drafts", label: "Drafts" },
  { value: "submitted", label: "Submitted" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
] as const;
export type SupplierTab = (typeof SUPPLIER_TABS)[number]["value"];

export const SUPPLIER_SORTS = [
  { value: "newest", label: "Newest Created" },
  { value: "oldest", label: "Oldest Created" },
  { value: "updated", label: "Recently Updated" },
  { value: "valid", label: "Validity Ending Soon" },
] as const;
export type SupplierSort = (typeof SUPPLIER_SORTS)[number]["value"];

export const DATE_BASES = [
  { value: "created", label: "Created date" },
  { value: "sent", label: "Submitted date" },
  { value: "updated", label: "Updated date" },
] as const;
export type DateBasis = (typeof DATE_BASES)[number]["value"];

export const VALIDITY_FILTERS = [
  { value: "active", label: "Valid" },
  { value: "expiring", label: `Expiring within ${EXPIRING_DAYS} days` },
  { value: "expired", label: "Expired" },
] as const;
export type ValidityFilter = (typeof VALIDITY_FILTERS)[number]["value"];

export const CURRENCY_PATTERN = /^[A-Z]{3}$/;
export const WITHDRAW_REASON_MAX = 500;
export const EXPORT_MAX_ROWS = 5000;
export const SUPPLIER_PAGE_SIZE = PAGE_SIZE;

export interface SupplierQuotationQuery {
  q: string;
  status: SupplierTab;
  sort: SupplierSort;
  dateBasis: DateBasis;
  /** Inclusive start / exclusive end of the date window, or null for "any time". */
  from: Date | null;
  to: Date | null;
  rangeKey: string;
  validity: ValidityFilter | null;
  currency: string | null;
  page: number;
  limit: number;
}
export type SupplierQueryResult = { ok: true; value: SupplierQuotationQuery } | { ok: false; fields: Record<string, string> };

const single = (v: unknown): string | undefined | null => (v === undefined || v === "" ? undefined : typeof v === "string" ? v : null);

/** Every parameter is validated against a fixed list or pattern; nothing is passed to the database as an operator. */
export function parseSupplierQuery(p: Record<string, unknown>, now = Date.now()): SupplierQueryResult {
  const fields: Record<string, string> = {};
  const text = (key: string) => {
    const v = single(p[key]);
    if (v === null) fields[key] = "Send a single text value.";
    return v ?? undefined;
  };
  const q = (text("q") ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length > SEARCH_MAX) fields.q = `The search text can be at most ${SEARCH_MAX} characters.`;

  const status = SUPPLIER_TABS.find((t) => t.value === (text("status") ?? "all").toLowerCase())?.value;
  if (!status) fields.status = `Choose one of: ${SUPPLIER_TABS.map((t) => t.value).join(", ")}.`;
  const sort = SUPPLIER_SORTS.find((s) => s.value === (text("sort") ?? "newest"))?.value;
  if (!sort) fields.sort = `Choose one of: ${SUPPLIER_SORTS.map((s) => s.value).join(", ")}.`;
  const dateBasis = DATE_BASES.find((b) => b.value === (text("dateBasis") ?? "created"))?.value;
  if (!dateBasis) fields.dateBasis = `Choose one of: ${DATE_BASES.map((b) => b.value).join(", ")}.`;

  const validityText = text("validity");
  const validity = validityText === undefined ? null : (VALIDITY_FILTERS.find((v) => v.value === validityText)?.value ?? null);
  if (validityText !== undefined && validity === null) fields.validity = `Choose one of: ${VALIDITY_FILTERS.map((v) => v.value).join(", ")}.`;

  const currencyText = text("currency")?.toUpperCase();
  if (currencyText !== undefined && !CURRENCY_PATTERN.test(currencyText)) fields.currency = "Use a three-letter currency code such as INR.";
  const currency = currencyText && CURRENCY_PATTERN.test(currencyText) ? currencyText : null;

  let from: Date | null = null;
  let to: Date | null = null;
  let rangeKey = "all";
  const rangeText = text("range");
  if (rangeText !== undefined) {
    if (!RANGE_PRESETS.some((r) => r.value === rangeText)) fields.range = `Choose one of: ${RANGE_PRESETS.map((r) => r.value).join(", ")}.`;
    else {
      const range = parseDashboardRange({ range: rangeText, startDate: text("startDate"), endDate: text("endDate") }, now);
      if (!range.ok) fields.range = range.error;
      else {
        from = new Date(range.value.start);
        to = new Date(range.value.end);
        rangeKey = range.value.key;
      }
    }
  }

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
  const limit = num("limit", SUPPLIER_PAGE_SIZE, MAX_PAGE_SIZE);
  if (Object.keys(fields).length > 0 || !status || !sort || !dateBasis) return { ok: false, fields };
  return { ok: true, value: { q, status, sort, dateBasis, from, to, rangeKey, validity, currency, page, limit } };
}

/** The supplier-facing status: the shared effective status, plus DRAFT (never visible to a buyer). */
export type SupplierStatus = EffectiveStatus | "DRAFT";
export const SUPPLIER_STATUS_LABEL: Record<SupplierStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Submitted",
  EXPIRING_SOON: "Submitted · Expiring Soon",
  REVISION_REQUESTED: "Revision Requested",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  WITHDRAWN: "Withdrawn",
  SUPERSEDED: "Superseded",
};

export function supplierStatus(stored: StoredStatus, validUntil: Date, now = new Date()): SupplierStatus {
  return stored === "DRAFT" ? "DRAFT" : effectiveStatus(stored, validUntil, now);
}

/**
 * Withdrawal policy: only the CURRENT version of a quotation that is still waiting on the buyer (sent, or a revision was requested) and whose
 * validity has not ended. An accepted or rejected quotation is a closed commercial decision; an expired one has nothing left to withdraw; a
 * superseded version is history. Records are never deleted: the status becomes WITHDRAWN and an event is added.
 */
export function canWithdraw(stored: StoredStatus, isCurrent: boolean, validUntil: Date, now = new Date()): boolean {
  return isCurrent && (stored === "SENT" || stored === "REVISION_REQUESTED") && validUntil.getTime() > now.getTime();
}

export type WithdrawInput = { ok: true; reason: string | null; expectedVersion: number | null } | { ok: false; error: string };
export function parseWithdrawal(body: Record<string, unknown> | null): WithdrawInput {
  if (!body) return { ok: false, error: "Invalid request." };
  const keys = Object.keys(body).filter((k) => k !== "reason" && k !== "confirm" && k !== "expectedVersion");
  if (keys.length > 0) return { ok: false, error: "Only a reason, the version you are looking at and confirmation can be sent." };
  const ev = body.expectedVersion;
  if (ev !== undefined && ev !== null && (typeof ev !== "number" || !Number.isInteger(ev) || ev < 1 || ev > 100_000)) return { ok: false, error: "The version must be a whole number." };
  if (body.confirm !== true) return { ok: false, error: "Confirm the withdrawal to continue." };
  const raw = body.reason;
  if (raw !== undefined && raw !== null && typeof raw !== "string") return { ok: false, error: "The reason must be text." };
  const reason = typeof raw === "string" ? raw.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (reason.length > WITHDRAW_REASON_MAX) return { ok: false, error: `The reason can be at most ${WITHDRAW_REASON_MAX} characters.` };
  return { ok: true, reason: reason || null, expectedVersion: typeof ev === "number" ? ev : null };
}

/** A CSV cell that a spreadsheet cannot run as a formula (leading = + - @ tab or CR is neutralised) and that is always quoted. */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export { DAY_MS };
