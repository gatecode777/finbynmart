// Unit tests for src/lib/certifications/expiry.ts (pure module, imported directly: node strips the types).
// Run: node docs/page-reports/tools/11-certification-expiry-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const { EXPIRING_SOON_DAYS, addDays, daysUntil, expiryState, formatDate, isIsoDate, todayInIndia } = await import(pathToFileURL(path.join(root, "src/lib/certifications/expiry.ts")).href);

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const eq = (name, actual, expected) => check(name, actual === expected, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);

// Boundaries around "today" (a fixed date, so the table is the same on every run)
const today = "2026-11-02";
eq("U-01 policy constant is 90 days", EXPIRING_SOON_DAYS, 90);
eq("U-02 no expiry date -> none", expiryState(null, today), "none");
eq("U-03 undefined / empty -> none", `${expiryState(undefined, today)}|${expiryState("", today)}`, "none|none");
eq("U-04 far future -> valid", expiryState("2030-01-01", today), "valid");
eq("U-05 expires today -> expiring (still valid today)", expiryState("2026-11-02", today), "expiring");
eq("U-06 expired yesterday -> expired", expiryState("2026-11-01", today), "expired");
eq("U-07 day 89 -> expiring", expiryState(addDays(today, 89), today), "expiring");
eq("U-08 day 90 (boundary, included) -> expiring", expiryState(addDays(today, 90), today), "expiring");
eq("U-09 day 91 -> valid, not expiring", expiryState(addDays(today, 91), today), "valid");
eq("U-10 daysUntil today = 0", daysUntil("2026-11-02", today), 0);
eq("U-11 daysUntil tomorrow = 1, yesterday = -1", `${daysUntil("2026-11-03", today)}|${daysUntil("2026-11-01", today)}`, "1|-1");
eq("U-12 90 days from 2026-11-02 is 2027-01-31", addDays(today, 90), "2027-01-31");

// Leap years
check("U-20 2028-02-29 is a real date", isIsoDate("2028-02-29"));
check("U-21 2027-02-29 is not", !isIsoDate("2027-02-29"));
check("U-22 1900-02-29 is not (century rule)", !isIsoDate("1900-02-29"));
check("U-23 2000-02-29 is (400-year rule)", isIsoDate("2000-02-29"));
eq("U-24 2028-02-28 + 1 day = 2028-02-29", addDays("2028-02-28", 1), "2028-02-29");
eq("U-25 2027-02-28 + 1 day = 2027-03-01", addDays("2027-02-28", 1), "2027-03-01");
eq("U-26 across a leap day: 2028-02-01 -> 2028-03-01 is 29 days", daysUntil("2028-03-01", "2028-02-01"), 29);
eq("U-27 2028-02-29 expiring when today is 2028-01-01 (59 days)", expiryState("2028-02-29", "2028-01-01"), "expiring");
eq("U-28 2028-02-29 is expired on 2028-03-01", expiryState("2028-02-29", "2028-03-01"), "expired");
eq("U-29 year end: 2026-12-31 + 1 = 2027-01-01", addDays("2026-12-31", 1), "2027-01-01");

// Validation of stored values
for (const bad of ["2026-13-01", "2026-00-10", "2026-02-30", "2026-1-1", "26-01-01", "2026/01/01", "2026-01-01T00:00:00Z", " 2026-01-01", "", "abc", null, undefined, 20260101]) {
  check(`U-30 isIsoDate rejects ${JSON.stringify(bad)}`, !isIsoDate(bad));
}
check("U-31 isIsoDate accepts 2026-11-02", isIsoDate("2026-11-02"));

// Timezone: "today" is the calendar date in India, whatever the server timezone
eq("U-40 18:29 UTC on 31 Mar is still 31 Mar in India (23:59 IST)", todayInIndia(new Date("2026-03-31T18:29:59Z")), "2026-03-31");
eq("U-41 18:30 UTC on 31 Mar is 1 Apr in India (00:00 IST)", todayInIndia(new Date("2026-03-31T18:30:00Z")), "2026-04-01");
eq("U-42 00:00 UTC on 1 Jan is 1 Jan in India (05:30 IST)", todayInIndia(new Date("2027-01-01T00:00:00Z")), "2027-01-01");
eq("U-43 leap day in India", todayInIndia(new Date("2028-02-29T10:00:00Z")), "2028-02-29");
eq("U-44 the same instant gives the same date under any TZ env", todayInIndia(new Date("2026-06-15T20:00:00Z")), "2026-06-16");
// A certificate expiring on 31 Mar is still valid at 23:59 IST and expired at 00:00 IST on 1 Apr
eq("U-45 expires 31 Mar: valid at 23:59 IST", expiryState("2026-03-31", todayInIndia(new Date("2026-03-31T18:29:59Z"))), "expiring");
eq("U-46 expires 31 Mar: expired at 00:00 IST on 1 Apr", expiryState("2026-03-31", todayInIndia(new Date("2026-03-31T18:30:00Z"))), "expired");
check("U-47 todayInIndia() with no argument is a valid date", isIsoDate(todayInIndia()));

// Display
eq("U-50 formatDate", formatDate("2023-01-12"), "12 Jan 2023");
eq("U-51 formatDate leap day", formatDate("2024-02-29"), "29 Feb 2024");
eq("U-52 formatDate December", formatDate("2026-12-05"), "5 Dec 2026");
eq("U-53 formatDate leaves an invalid value as it is", formatDate("nope"), "nope");

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log("FAILED:\n" + failures.join("\n"));
  process.exit(1);
}
