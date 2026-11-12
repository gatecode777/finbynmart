/**
 * Supplier analytics: metric dictionary + date rules (client-safe). Version bumps whenever a definition changes.
 *
 * Date range: calendar days in the business timezone (Asia/Kolkata, UTC+05:30, no daylight saving), start day inclusive, end day inclusive,
 * turned into the half-open UTC interval [startUtc, endUtc). Maximum 366 days; the end may not be in the future.
 */
export const METRICS_VERSION = "2026-11-v1";
export const REPORT_TIMEZONE = "Asia/Kolkata";
const OFFSET_MS = 5.5 * 3600 * 1000;
const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 366;

export const METRIC_DEFINITIONS = [
  { key: "inquiries", label: "Inquiries received", source: "inquiries (one record per inquiry sent to one of your sellers)", dateBasis: "Date received (createdAt)", grain: "Distinct inquiries", note: "Independent event count. Staff views and replies do not add to it." },
  { key: "quotations", label: "Quotations submitted", source: "quotations, first version only", dateBasis: "Date the first version was sent (sentAt)", grain: "Distinct quotations (revisions are not counted again)", note: "Independent event count, not a conversion funnel." },
  { key: "orders", label: "Confirmed orders", source: "orders addressed to your sellers", dateBasis: "Order date (placedAt)", grain: "Orders; pending-confirmation and cancelled orders are excluded", note: "An accepted quotation is not an order. The date is the order date, because no separate confirmation timestamp is stored." },
  { key: "orderValue", label: "Confirmed order value", source: "orders addressed to your sellers", dateBasis: "Order date (placedAt)", grain: "Sum of the saved order totals, per currency", note: "Order value, not revenue and not payment received. Currencies are never added together and nothing is converted. Saved totals are used, never today's catalogue prices." },
  { key: "topProducts", label: "Top products by confirmed order value", source: "order lines", dateBasis: "Order date (placedAt)", grain: "Quantity × agreed unit price, summed per product, for one currency", note: "Header charges are not allocated to lines, so product values need not add up to the order value. An order with several products counts once for each, so product order counts do not add up to total orders." },
] as const;

export interface ReportRange {
  startDay: string;
  endDay: string;
  start: Date;
  end: Date;
  days: number;
  bucket: "day" | "week";
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-11-12" → the UTC instant of that day's 00:00 in the business timezone. */
function dayStartUtc(day: string): Date | null {
  if (!DAY_RE.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const date = new Date(utc);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null; // 2026-02-30 etc.
  return new Date(utc - OFFSET_MS);
}

export const todayInReportZone = (now = new Date()): string => new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);

export function defaultRange(now = new Date()): { startDay: string; endDay: string } {
  const end = todayInReportZone(now);
  return { startDay: new Date(dayStartUtc(end)!.getTime() + OFFSET_MS - 29 * DAY_MS).toISOString().slice(0, 10), endDay: end };
}

export function parseRange(startDay: string, endDay: string, now = new Date()): { ok: true; range: ReportRange } | { ok: false; message: string } {
  const start = dayStartUtc(startDay);
  const endStart = dayStartUtc(endDay);
  if (!start || !endStart) return { ok: false, message: "Enter valid dates." };
  if (endDay < startDay) return { ok: false, message: "The end date must not be before the start date." };
  if (endDay > todayInReportZone(now)) return { ok: false, message: "The end date cannot be in the future." };
  const days = Math.round((endStart.getTime() - start.getTime()) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) return { ok: false, message: `Choose at most ${MAX_RANGE_DAYS} days.` };
  return { ok: true, range: { startDay, endDay, start, end: new Date(endStart.getTime() + DAY_MS), days, bucket: days <= 62 ? "day" : "week" } };
}

/** Bucket start keys (business-zone days) for the range, so empty buckets can be listed. Weeks start on Monday. */
export function bucketKeys(r: ReportRange): string[] {
  const keys: string[] = [];
  let t = r.start.getTime() + OFFSET_MS;
  if (r.bucket === "week") {
    const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
    t -= dow * DAY_MS;
  }
  const stop = r.end.getTime() + OFFSET_MS;
  while (t < stop) {
    keys.push(new Date(t).toISOString().slice(0, 10));
    t += (r.bucket === "week" ? 7 : 1) * DAY_MS;
  }
  return keys;
}

/** Minor units (paise / cents) as an exact decimal string with two decimals. */
export function formatMinor(minor: number, currency: string): string {
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100).toLocaleString("en-IN");
  return `${neg ? "-" : ""}${currency === "INR" ? "₹" : currency + " "}${whole}.${String(abs % 100).padStart(2, "0")}`;
}
