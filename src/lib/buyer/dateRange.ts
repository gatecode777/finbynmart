/**
 * Date ranges for the buyer dashboard. Pure (no imports) so the server, the API and the node-run unit tests share it.
 *
 * Time policy: every day boundary is India time (Asia/Kolkata, UTC+05:30, no daylight saving), the application timezone.
 * A range is [start, end): start is midnight IST of the first day, end is midnight IST AFTER the last day, so a
 * record at 23:59:59.999 IST on the last day is inside and one at 00:00:00.000 IST the next day is outside. The same
 * window feeds the KPI counts, the chart and the category breakdown.
 *
 * Presets end today (inclusive): 7d, 30d, 90d, this-month (1st of the month to today), previous-month (the whole
 * previous month). Custom: startDate and endDate as YYYY-MM-DD, both inclusive, start <= end, end not in the future,
 * at most 366 days. The comparison period is the window of the same length immediately before the start.
 */
export const DASHBOARD_TIMEZONE = "Asia/Kolkata";
export const MAX_RANGE_DAYS = 366;
const DAY = 86_400_000;
const OFFSET = 330 * 60_000;

export const RANGE_PRESETS = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "this-month", label: "This Month" },
  { value: "previous-month", label: "Previous Month" },
  { value: "custom", label: "Custom Date Range" },
] as const;

export type RangeKey = (typeof RANGE_PRESETS)[number]["value"];
export type Bucket = "day" | "week" | "month";

export interface RangeInfo {
  key: RangeKey;
  label: string;
  /** Inclusive start (midnight IST), exclusive end (midnight IST after the last day). */
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  days: number;
  bucket: Bucket;
  /** The first and last day, YYYY-MM-DD in IST, both inclusive. */
  startDate: string;
  endDate: string;
  timezone: typeof DASHBOARD_TIMEZONE;
}

export type RangeResult = { ok: true; value: RangeInfo } | { ok: false; error: string };

const istMidnight = (ms: number) => Math.floor((ms + OFFSET) / DAY) * DAY - OFFSET;
const parts = (ms: number) => {
  const d = new Date(ms + OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
};
const istDate = (y: number, m: number, d: number) => Date.UTC(y, m, d) - OFFSET;
const fmt = (ms: number) => {
  const { y, m, d } = parts(ms);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/** A real calendar date in YYYY-MM-DD (rejects 2026-02-31) as midnight IST, or null. */
export function parseIstDate(text: unknown): number | null {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [y, m, d] = text.split("-").map(Number);
  const ms = istDate(y, m - 1, d);
  const back = parts(ms);
  return back.y === y && back.m === m - 1 && back.d === d ? ms : null;
}

const bucketFor = (days: number): Bucket => (days <= 31 ? "day" : days <= 140 ? "week" : "month");

function build(key: RangeKey, startMs: number, endExclusiveMs: number): RangeInfo {
  const days = Math.round((endExclusiveMs - startMs) / DAY);
  const label = RANGE_PRESETS.find((p) => p.value === key)?.label ?? "Custom Date Range";
  return {
    key,
    label,
    start: new Date(startMs),
    end: new Date(endExclusiveMs),
    previousStart: new Date(startMs - (endExclusiveMs - startMs)),
    previousEnd: new Date(startMs),
    days,
    bucket: bucketFor(days),
    startDate: fmt(startMs),
    endDate: fmt(endExclusiveMs - DAY),
    timezone: DASHBOARD_TIMEZONE,
  };
}

export function parseDashboardRange(input: { range?: unknown; startDate?: unknown; endDate?: unknown }, now = Date.now()): RangeResult {
  const todayStart = istMidnight(now);
  const tomorrow = todayStart + DAY;
  const wanted = input.range === undefined || input.range === "" ? (input.startDate || input.endDate ? "custom" : "30d") : input.range;
  if (typeof wanted !== "string" || !RANGE_PRESETS.some((p) => p.value === wanted)) return { ok: false, error: "Choose one of: 7d, 30d, 90d, this-month, previous-month, custom." };
  const key = wanted as RangeKey;

  if (key === "7d" || key === "30d" || key === "90d") {
    const n = Number(key.slice(0, -1));
    return { ok: true, value: build(key, tomorrow - n * DAY, tomorrow) };
  }
  const { y, m } = parts(now);
  if (key === "this-month") return { ok: true, value: build(key, istDate(y, m, 1), tomorrow) };
  if (key === "previous-month") return { ok: true, value: build(key, istDate(y, m - 1, 1), istDate(y, m, 1)) };

  const start = parseIstDate(input.startDate);
  const end = parseIstDate(input.endDate);
  if (start === null || end === null) return { ok: false, error: "Enter the start and end dates as real dates in YYYY-MM-DD form." };
  if (start > end) return { ok: false, error: "The start date must not be after the end date." };
  if (end >= tomorrow) return { ok: false, error: "The end date cannot be in the future." };
  const days = Math.round((end + DAY - start) / DAY);
  if (days > MAX_RANGE_DAYS) return { ok: false, error: `Choose a range of at most ${MAX_RANGE_DAYS} days.` };
  return { ok: true, value: build("custom", start, end + DAY) };
}

/** The start (midnight IST) of every bucket that overlaps the range, in order. Weeks start on Monday. */
export function bucketStarts(range: Pick<RangeInfo, "start" | "end" | "bucket">): number[] {
  const out: number[] = [];
  const first = range.start.getTime();
  const last = range.end.getTime();
  if (range.bucket === "day") {
    for (let t = first; t < last; t += DAY) out.push(t);
  } else if (range.bucket === "week") {
    const weekday = (new Date(first + OFFSET).getUTCDay() + 6) % 7; // Monday = 0
    for (let t = first - weekday * DAY; t < last; t += 7 * DAY) out.push(t);
  } else {
    const { y, m } = parts(first);
    for (let i = 0; ; i++) {
      const t = istDate(y, m + i, 1);
      if (t >= last) break;
      out.push(t);
    }
  }
  return out;
}

/** Percentage change from previous to current, or null when it cannot be stated (previous period had none). */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
