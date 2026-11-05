// Unit tests for src/lib/inquiries/buyerListRules.ts (pure module).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/27-list-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const R = await import(pathToFileURL(path.join(root, "src/lib/inquiries/buyerListRules.ts")).href);

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const P = (over = {}) => R.parseListQuery(over);

let r = P({});
check("Q-01 defaults: no search, all statuses, newest first, page 1, 20 per page, no window", r.ok && r.value.q === "" && r.value.status === "all" && r.value.sort === "newest" && r.value.page === 1 && r.value.limit === 20 && r.value.window === null && r.value.inquiryType === null && r.value.supplierId === null && r.value.categoryId === null);
check("Q-02 all nine status filters are accepted (also in capitals, as the stored statuses are written), anything else refused", R.STATUS_FILTERS.every((s) => P({ status: s.value }).ok) && ["bogus", "notified", "1", "{}", ["new"]].every((status) => !P({ status }).ok) && P({ status: "NEW" }).value?.status === "new" && P({ status: "IN_PROGRESS" }).value?.status === "in_progress");
check("Q-03 the four stored inquiry types are accepted, anything else refused", ["PRODUCT_INQUIRY", "GET_BEST_QUOTE", "GENERAL_INQUIRY", "BULK_REQUIREMENT"].every((inquiryType) => P({ inquiryType }).ok) && ["product", "OTHER", "{}", "$ne"].every((inquiryType) => !P({ inquiryType }).ok));
check("Q-04 sort: newest, oldest, updated; 'reference' is not offered (random references have no meaningful order); anything else refused", ["newest", "oldest", "updated"].every((sort) => P({ sort }).ok) && !P({ sort: "reference" }).ok && !P({ sort: "relevance" }).ok && !P({ sort: "createdAt" }).ok);
check("Q-05 page 1 to 1000 and limit 1 to 50, whole numbers only", !P({ page: "0" }).ok && !P({ page: "1001" }).ok && !P({ page: "x" }).ok && !P({ page: "1.5" }).ok && !P({ limit: "0" }).ok && !P({ limit: "51" }).ok && P({ page: "3", limit: "50" }).value?.limit === 50 && P({ page: "1000" }).ok);
check("Q-06 the search text is trimmed, collapsed, control characters removed; 60 characters allowed, 61 refused", P({ q: "  cotton   fabric " }).value?.q === "cotton fabric" && P({ q: "x".repeat(60) }).ok && !P({ q: "x".repeat(61) }).ok && P({ q: "a\u0000b" }).value?.q === "a b");
check("Q-07 supplier id and category id accept only safe characters", P({ supplierId: "shree-textiles" }).ok && P({ supplierId: "SLR0001" }).ok && !P({ supplierId: "a b" }).ok && !P({ supplierId: "{$ne:1}" }).ok && !P({ supplierId: "x".repeat(81) }).ok && P({ categoryId: "textiles-fabrics" }).ok && !P({ categoryId: "Textiles" }).ok && !P({ categoryId: "a/b" }).ok);
check("Q-08 operator-like values (objects, arrays) are refused, never passed on", [{ $ne: "" }, ["a"], 5, true].every((v) => !P({ q: v }).ok && !P({ supplierId: v }).ok));
check("Q-09 unknown parameters (buyerId, userId, role) are ignored, not read", P({ buyerId: "x", userId: "y", role: "admin" }).ok && !("buyerId" in P({ buyerId: "x" }).value));
check("Q-10 several problems are reported together, each on its own field", (() => { const x = P({ status: "zz", sort: "zz", page: "0", inquiryType: "zz" }); return !x.ok && ["status", "sort", "page", "inquiryType"].every((k) => k in x.fields); })());

// date windows (the dashboard's India-time rules)
for (const range of ["7d", "30d", "90d", "this-month", "previous-month"]) {
  const x = P({ range });
  check(`D-0 preset ${range} gives a window [start, end) in India time`, x.ok && x.value.window && x.value.window.start < x.value.window.end && x.value.window.key === range);
}
const custom = P({ range: "custom", dateFrom: "2026-01-01", dateTo: "2026-01-31" });
check("D-06 a custom range is inclusive of both days: start is midnight IST of the first, end is midnight IST after the last", custom.ok && custom.value.window.start.toISOString() === "2025-12-31T18:30:00.000Z" && custom.value.window.end.toISOString() === "2026-01-31T18:30:00.000Z");
check("D-07 dateFrom and dateTo alone mean a custom range", P({ dateFrom: "2026-01-01", dateTo: "2026-01-02" }).value?.window?.key === "custom");
check("D-08 refused: start after end, a missing end, an impossible date, a future end, a range over 366 days, an unknown preset", !P({ range: "custom", dateFrom: "2026-02-02", dateTo: "2026-02-01" }).ok && !P({ range: "custom", dateFrom: "2026-02-02" }).ok && !P({ range: "custom", dateFrom: "2026-02-31", dateTo: "2026-03-01" }).ok && !P({ range: "custom", dateFrom: "2026-01-01", dateTo: "2999-01-01" }).ok && !P({ range: "custom", dateFrom: "2020-01-01", dateTo: "2026-01-01" }).ok && !P({ range: "forever" }).ok);

// status mapping and counts
check("S-01 filters map to stored statuses: new includes the old lowercase 'new', awaiting = NEW, NOTIFIED, IN_PROGRESS, all = no restriction", JSON.stringify(R.statusesFor("new")) === '["NEW","new"]' && R.statusesFor("awaiting_response").sort().join() === "IN_PROGRESS,NEW,NOTIFIED,new" && R.statusesFor("all") === null && R.statusesFor("cancelled").join() === "CANCELLED" && R.statusesFor("rejected").join() === "REJECTED");
check("S-02 every stored status has one business label; NOTIFIED is shown as the stage it means (Awaiting Response)", R.BUSINESS_LABEL.NOTIFIED === "Awaiting Response" && R.BUSINESS_LABEL.NEW === "New" && R.BUSINESS_LABEL.IN_PROGRESS === "In Progress" && R.BUSINESS_LABEL.CLOSED === "Closed" && Object.keys(R.BUSINESS_LABEL).length === 8);
const counts = R.countsByFilter({ NEW: 3, new: 2, NOTIFIED: 1, IN_PROGRESS: 4, REPLIED: 2, QUOTED: 1, CLOSED: 5, CANCELLED: 2, REJECTED: 1, weird: 1 });
check("S-03 counts per tab: old 'new' merges into New, unknown values count as New, awaiting = new + notified + in progress, nothing counted twice within a tab", counts.new === 6 && counts.awaiting_response === 11 && counts.in_progress === 4 && counts.replied === 2 && counts.quoted === 1 && counts.closed === 5 && counts.cancelled === 2 && counts.rejected === 1 && counts.all === 22);
const sum = R.summaryFrom(counts);
check("S-04 summary: total includes cancelled and rejected, replied/quoted is REPLIED + QUOTED only, closed is CLOSED only", sum.total === 22 && sum.awaitingResponse === 11 && sum.repliedOrQuoted === 3 && sum.closed === 5);
check("S-05 an empty history is all zeros (no invented numbers)", JSON.stringify(R.summaryFrom(R.countsByFilter({}))) === '{"total":0,"awaitingResponse":0,"repliedOrQuoted":0,"closed":0}');
check("S-06 the dashboard's 'active' group is this page's awaiting group (one definition)", R.AWAITING_STATUSES.join() === "NEW,NOTIFIED,IN_PROGRESS");
check("S-07 replies and quotations are marked as not connected", R.REPLIES_CONNECTED === false);

check("F-01 active filter count: type, supplier, category and date window (the status tab and the sort do not count)", R.activeFilterCount(P({ inquiryType: "GET_BEST_QUOTE", supplierId: "x", range: "7d", status: "closed", sort: "oldest" }).value) === 3);
check("F-02 regex characters are escaped, so a search is a literal text", R.escapeRegex("a.b*c(d)[e]$^|\\") === "a\\.b\\*c\\(d\\)\\[e\\]\\$\\^\\|\\\\" && new RegExp(R.escapeRegex(".*")).test("abc") === false);
check("F-03 the detail link uses the reference, and only an old record without one falls back to its id", R.inquiryHref("FBM-INQ-ABCDEFGH", "1".repeat(24)) === "/buyer/inquiries/FBM-INQ-ABCDEFGH" && R.inquiryHref(null, "a".repeat(24)) === `/buyer/inquiries/${"a".repeat(24)}`);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n" + failures.join("\n"));
  process.exit(1);
}
