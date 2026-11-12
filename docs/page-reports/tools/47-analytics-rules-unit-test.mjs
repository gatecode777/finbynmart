// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/47-analytics-rules-unit-test.mjs
import assert from "node:assert/strict";
const r = await import("../../../src/lib/supplier/analyticsRules.ts");
const now = new Date("2026-11-12T10:00:00Z");
// IST midnight of 1 Nov is 31 Oct 18:30 UTC; the range is half-open [start, end)
const p = r.parseRange("2026-11-01", "2026-11-12", now);
assert.ok(p.ok);
assert.equal(p.range.start.toISOString(), "2026-10-31T18:30:00.000Z");
assert.equal(p.range.end.toISOString(), "2026-11-12T18:30:00.000Z");
assert.equal(p.range.days, 12);
assert.equal(p.range.bucket, "day");
assert.equal(r.bucketKeys(p.range).length, 12);
assert.equal(r.parseRange("2026-11-12", "2026-11-01", now).ok, false, "end before start");
assert.equal(r.parseRange("2026-11-01", "2026-11-13", now).ok, false, "future end");
assert.equal(r.parseRange("2026-02-30", "2026-03-01", now).ok, false, "invalid date");
assert.equal(r.parseRange("2025-01-01", "2026-11-12", now).ok, false, "over 366 days");
assert.equal(r.parseRange("2026-01-01", "2026-11-12", now).range.bucket, "week");
assert.ok(r.parseRange("2024-02-28", "2024-03-01", now).ok && r.parseRange("2024-02-28", "2024-03-01", now).range.days === 3, "leap day");
assert.equal(r.todayInReportZone(new Date("2026-11-12T19:00:00Z")), "2026-11-13", "after 18:30 UTC it is already tomorrow in IST");
assert.equal(r.formatMinor(1234567, "INR"), "₹12,345.67");
assert.equal(r.formatMinor(5, "USD"), "USD 0.05");
console.log("ok");
