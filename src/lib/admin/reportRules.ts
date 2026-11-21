/**
 * Client-safe rules of Admin Reports (Page 61): READ-ONLY operational activity counts. Every report is one counting unit over one date field, defined here once and used by the summary, the
 * daily series and the breakdown alike. Nothing here reconstructs history, ranks anyone or touches money: payments, subscriptions, revenue, funnels and exports are out of scope.
 *
 * Dates: calendar days in Asia/Kolkata (UTC+05:30, no daylight saving) via the shared `parseRange` (start day inclusive, end day inclusive, half-open UTC interval, at most 366 days, not in
 * the future). Default: the last 30 calendar days including today.
 */
import type { AdminCapability } from "./permissions";
import { MAX_RANGE_DAYS, REPORT_TIMEZONE, defaultRange, parseRange, todayInReportZone } from "@/lib/supplier/analyticsRules";

export { MAX_RANGE_DAYS, REPORT_TIMEZONE, defaultRange, parseRange, todayInReportZone };

export type ReportKey = "buyers" | "suppliers" | "requirements" | "quotations" | "orders";
export interface ReportDef {
  key: ReportKey;
  label: string;
  capability: AdminCapability;
  /** What one counted unit is and which timestamp places it in a day: shown with every result. */
  unit: string;
  dateBasis: string;
  definition: string;
  limitation: string;
  columns: { key: string; label: string }[];
}

export const REPORTS: readonly ReportDef[] = [
  { key: "buyers", label: "Buyer registrations", capability: "reports.buyers", unit: "buyer accounts", dateBasis: "account creation date",
    definition: "Currently retained buyer accounts (role buyer) whose account was created in the period, one per account.",
    limitation: "This is the number of buyer accounts that exist today and were registered in the period, not a historical record of acquisition: there is no role-assignment history, no deleted-account record and no test or service account marker, so none can be excluded. An account is one person once however many inquiries it has.",
    columns: [{ key: "count", label: "Buyer accounts" }] },
  { key: "suppliers", label: "Supplier registrations", capability: "reports.suppliers", unit: "supplier accounts (one account owns one company)", dateBasis: "account creation date",
    definition: "Currently retained supplier accounts whose account was created in the period. Each account is the owner of one company; there are no further staff accounts, catalogue sellers or logins counted.",
    limitation: "The supplier company record is created the first time its owner opens the supplier workspace, so its own creation date is not the registration date and is not used. Test or service accounts and deleted accounts cannot be identified, so none is excluded.",
    columns: [{ key: "count", label: "Supplier accounts" }] },
  { key: "requirements", label: "Requirements", capability: "reports.requirements", unit: "submitted inquiries (one per submission)", dateBasis: "submission date",
    definition: "Canonical inquiries created in the period: Direct (a product inquiry to a selected supplier, including every record from before the source was stored) and General Requirement. Matched deliveries, distribution jobs, responses and messages are not counted, and the retired legacy requirements collection is not read.",
    limitation: "An inquiry with no stored source is counted as Direct, the existing documented rule; a source value that is neither is shown as Unclassified.",
    columns: [{ key: "direct", label: "Direct" }, { key: "general", label: "General" }, { key: "unclassified", label: "Unclassified" }] },
  { key: "quotations", label: "Quotations", capability: "reports.quotations", unit: "quotation threads (a revision is not a new quotation)", dateBasis: "date the first version was submitted",
    definition: "Distinct quotations whose first version was submitted in the period. A private draft is never counted and a later revision does not count again.",
    limitation: "The first-submission time is the send time written when the supplier submits version 1 (a draft's own timestamp is never used). Quotations inserted by other means carry whatever send time they were given.",
    columns: [{ key: "count", label: "Quotations" }] },
  { key: "orders", label: "Confirmed orders", capability: "reports.orders", unit: "order confirmations", dateBasis: "confirmation date",
    definition: "Orders created by the buyer's explicit confirmation of an accepted quotation, by the time of that confirmation. A later cancellation does not remove the fact that the confirmation happened, and quotation acceptance alone is never counted.",
    limitation: "This counts confirmation events only: it says nothing about payment, shipping, fulfilment or value.",
    columns: [{ key: "count", label: "Orders" }] },
] as const;
export const REPORT_KEYS = REPORTS.map((r) => r.key) as readonly string[];
export const reportOf = (key: string): ReportDef | undefined => REPORTS.find((r) => r.key === key);
export const CAPABILITIES = REPORTS.map((r) => r.capability);
export const permittedReports = (permissions: readonly AdminCapability[]): ReportDef[] => REPORTS.filter((r) => permissions.includes(r.capability));

export interface ReportQuery { report: ReportKey; from: string; to: string }
export type QueryResult = { ok: true; value: ReportQuery } | { ok: false; fields: Record<string, string> };

/** Strict validation: unknown report, malformed or impossible dates, an inverted, future or over-long range and any other parameter are refused (a client can never name an account). */
export function validateQuery(get: (k: string) => string | null | undefined, keys: Iterable<string>, defaultReport: ReportKey, now = new Date()): QueryResult {
  const fields: Record<string, string> = {};
  const report = get("report") || defaultReport;
  if (!REPORT_KEYS.includes(report)) fields.report = "Unsupported report.";
  const d = defaultRange(now);
  const from = get("from") || d.startDay, to = get("to") || d.endDay;
  const r = parseRange(from, to, now);
  if (!r.ok) fields.range = r.message;
  for (const k of keys) if (!["report", "from", "to"].includes(k)) fields[k] = "This parameter is not supported.";
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, value: { report: report as ReportKey, from, to } };
}

export interface DayRow { date: string; total: number; [column: string]: number | string }
const DAY = 86_400_000;
/** "2026-11-01" for each calendar day of the range, zero days included. */
export function dayKeys(from: string, to: string): string[] {
  const out: string[] = [];
  let t = Date.parse(`${from}T00:00:00Z`);
  const stop = Date.parse(`${to}T00:00:00Z`);
  while (t <= stop) { out.push(new Date(t).toISOString().slice(0, 10)); t += DAY; }
  return out;
}

/** The chart uses weekly buckets (Monday start) for ranges over 62 days; the breakdown always stays daily. */
export interface ChartPoint { label: string; value: number }
export function chartPoints(rows: readonly DayRow[], days: number): { bucket: "day" | "week"; points: ChartPoint[] } {
  if (days <= 62) return { bucket: "day", points: rows.map((r) => ({ label: r.date, value: r.total })) };
  const weeks = new Map<string, number>();
  for (const r of rows) { const t = Date.parse(`${r.date}T00:00:00Z`); const monday = new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10); weeks.set(monday, (weeks.get(monday) ?? 0) + r.total); }
  return { bucket: "week", points: [...weeks].map(([label, value]) => ({ label, value })) };
}
/** The smallest of 1, 2, 5 or 10 times a power of ten that is at least `max` (minimum 5): an integer axis top. */
export const niceMax = (max: number): number => { if (max <= 5) return 5; const p = 10 ** Math.floor(Math.log10(max)); for (const m of [1, 2, 5, 10]) if (m * p >= max) return m * p; return 10 * p; };
export const dayLabel = (iso: string): string => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
export const dayLong = (iso: string): string => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
