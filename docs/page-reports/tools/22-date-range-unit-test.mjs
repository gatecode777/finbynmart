// Unit tests for src/lib/buyer/dateRange.ts (pure module, imported directly: node strips the types).
// Run: node docs/page-reports/tools/22-date-range-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const m = await import(pathToFileURL(path.join(root, "src/lib/buyer/dateRange.ts")).href);
const { parseDashboardRange, parseIstDate, bucketStarts, percentChange, MAX_RANGE_DAYS } = m;

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const ist = (text) => new Date(`${text}+05:30`).getTime();
const NOW = ist("2026-11-03T12:00:00");
const ok = (input, now = NOW) => { const r = parseDashboardRange(input, now); return r.ok ? r.value : null; };
const bad = (input, now = NOW) => { const r = parseDashboardRange(input, now); return r.ok ? null : r.error; };

// presets, "today" is 3 Nov 2026 (India time)
let r = ok({ range: "30d" });
check("D-01 30d: the 30 days ending today, India midnight to India midnight", r.start.getTime() === ist("2026-10-05T00:00:00") && r.end.getTime() === ist("2026-11-04T00:00:00") && r.days === 30 && r.startDate === "2026-10-05" && r.endDate === "2026-11-03", JSON.stringify([r.startDate, r.endDate, r.days]));
r = ok({ range: "7d" });
check("D-02 7d starts 28 Oct", r.startDate === "2026-10-28" && r.days === 7 && r.bucket === "day");
r = ok({ range: "90d" });
check("D-03 90d: 90 days, buckets by week", r.days === 90 && r.bucket === "week");
r = ok({ range: "this-month" });
check("D-04 this-month: 1 Nov to today (3 days)", r.startDate === "2026-11-01" && r.endDate === "2026-11-03" && r.days === 3);
r = ok({ range: "previous-month" });
check("D-05 previous-month: all of October (31 days), end exclusive 1 Nov", r.startDate === "2026-10-01" && r.endDate === "2026-10-31" && r.days === 31 && r.end.getTime() === ist("2026-11-01T00:00:00"));
r = ok({});
check("D-06 no range given means 30d", r.key === "30d");
r = ok({ range: "30d" });
check("D-07 the comparison period is the same length immediately before", r.previousEnd.getTime() === r.start.getTime() && r.start.getTime() - r.previousStart.getTime() === r.end.getTime() - r.start.getTime());
check("D-08 previous-month's comparison is the 31 days before 1 Oct", ok({ range: "previous-month" }).previousStart.getTime() === ist("2026-08-31T00:00:00"));

// the India-time day boundary
const edge = ok({ range: "7d" }, ist("2026-11-03T23:59:59"));
const next = ok({ range: "7d" }, ist("2026-11-04T00:00:00"));
check("D-09 at 23:59:59 India time it is still 3 Nov, one second later it is 4 Nov", edge.endDate === "2026-11-03" && next.endDate === "2026-11-04");
check("D-10 in UTC terms the day turns over at 18:30Z", ok({ range: "7d" }, Date.parse("2026-11-03T18:29:59Z")).endDate === "2026-11-03" && ok({ range: "7d" }, Date.parse("2026-11-03T18:30:00Z")).endDate === "2026-11-04");
const c = ok({ startDate: "2026-10-01", endDate: "2026-10-10" });
check("D-11 a record at 23:59:59.999 on the last day is inside [start, end); the next midnight is outside", ist("2026-10-10T23:59:59.999") < c.end.getTime() && ist("2026-10-11T00:00:00.000") >= c.end.getTime() && ist("2026-10-01T00:00:00.000") >= c.start.getTime() && ist("2026-09-30T23:59:59.999") < c.start.getTime());

// custom ranges
check("D-12 custom range is accepted and inclusive (1 to 10 Oct = 10 days)", c.days === 10 && c.key === "custom");
check("D-13 start and end only (no range) means custom", ok({ startDate: "2026-10-01", endDate: "2026-10-02" }).key === "custom");
check("D-14 reversed dates rejected", /not be after/.test(bad({ range: "custom", startDate: "2026-10-10", endDate: "2026-10-01" })));
check("D-15 an end date in the future rejected", /future/.test(bad({ range: "custom", startDate: "2026-10-01", endDate: "2026-11-04" })));
check("D-16 today as the end date is allowed", ok({ range: "custom", startDate: "2026-11-03", endDate: "2026-11-03" }).days === 1);
check("D-17 malformed and impossible dates rejected", ["2026-13-01", "2026-02-30", "26-10-01", "2026/10/01", "yesterday", "", null, 20261001, "2026-10-01T00:00"].every((v) => bad({ range: "custom", startDate: v, endDate: "2026-10-05" }) !== null));
check("D-18 missing custom dates rejected", bad({ range: "custom" }) !== null && bad({ range: "custom", startDate: "2026-10-01" }) !== null);
check(`D-19 more than ${MAX_RANGE_DAYS} days rejected, exactly ${MAX_RANGE_DAYS} accepted`, bad({ startDate: "2025-10-01", endDate: "2026-10-03" }) !== null && ok({ startDate: "2025-10-03", endDate: "2026-10-03" }) !== null && ok({ startDate: "2025-10-03", endDate: "2026-10-03" }).days === 366);
check("D-20 unknown presets and non-strings rejected", ["1y", "all", "30D", 30, {}, ["7d"]].every((v) => bad({ range: v }) !== null));
check("D-21 a real leap day is valid, a non-leap one is not", parseIstDate("2028-02-29") !== null && parseIstDate("2026-02-29") === null);

// buckets
const days = bucketStarts(ok({ range: "7d" }));
check("D-22 7d has 7 day buckets, each exactly one day apart", days.length === 7 && days.every((t, i) => i === 0 || t - days[i - 1] === 86_400_000));
const weeks = bucketStarts(ok({ range: "90d" }));
check("D-23 week buckets start on a Monday (India time) and cover the range", weeks.length >= 13 && weeks.every((t) => new Date(t + 330 * 60_000).getUTCDay() === 1) && weeks[0] <= ok({ range: "90d" }).start.getTime() && weeks.at(-1) < ok({ range: "90d" }).end.getTime());
const months = bucketStarts(ok({ startDate: "2025-12-15", endDate: "2026-10-31" }));
check("D-24 a long range buckets by month, each on the 1st", ok({ startDate: "2025-12-15", endDate: "2026-10-31" }).bucket === "month" && months.length === 11 && months.every((t) => new Date(t + 330 * 60_000).getUTCDate() === 1));
check("D-25 a month range spans year end correctly (Dec, Jan)", fmtMonths(months.slice(0, 2)) === "2025-12,2026-01");
function fmtMonths(ts) { return ts.map((t) => new Date(t + 330 * 60_000).toISOString().slice(0, 7)).join(","); }

// comparison
check("D-26 percentChange: 24 to 33 is +37.5%", percentChange(33, 24) === 37.5);
check("D-27 a decrease: 10 to 5 is -50%", percentChange(5, 10) === -50);
check("D-28 previous period of zero gives null, never an invented percentage (also 0 to 0)", percentChange(5, 0) === null && percentChange(0, 0) === null);
check("D-29 current zero with a previous value is -100%", percentChange(0, 4) === -100);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n" + failures.join("\n"));
  process.exit(1);
}
