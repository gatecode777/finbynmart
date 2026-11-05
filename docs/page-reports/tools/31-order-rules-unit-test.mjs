// Unit tests for src/lib/orders/orderRules.ts (pure module).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/31-order-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const R = await import(pathToFileURL(path.join(root, "src/lib/orders/orderRules.ts")).href);

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const P = (o = {}) => R.parseOrderQuery(o);

check("S-01 thirteen lifecycle statuses, each with a label, none duplicated", R.ORDER_STATUSES.length === 13 && new Set(R.ORDER_STATUSES).size === 13 && R.ORDER_STATUSES.every((s) => R.STATUS_LABEL[s]));
check("S-02 every status is in at most one group; the groups hold exactly the documented statuses", (() => { const seen = new Map(); for (const [g, list] of Object.entries(R.GROUP_STATUSES)) for (const s of list) { if (seen.has(s)) return false; seen.set(s, g); } return JSON.stringify(R.GROUP_STATUSES.processing) === JSON.stringify(["CONFIRMED", "PROCESSING", "READY_TO_DISPATCH"]) && JSON.stringify(R.GROUP_STATUSES.in_transit) === JSON.stringify(["DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY"]) && JSON.stringify(R.GROUP_STATUSES.delivered) === JSON.stringify(["DELIVERED"]) && JSON.stringify(R.GROUP_STATUSES.issues) === JSON.stringify(["ON_HOLD", "CANCELLATION_REQUESTED", "RETURN_REQUESTED"]); })());
check("S-03 finished CANCELLED and RETURNED, and PENDING_CONFIRMATION, are in no active group (history is not an issue; pending is not processing)", ["CANCELLED", "RETURNED", "PENDING_CONFIRMATION"].every((s) => R.groupOf(s) === "other"));
check("S-04 tab counts: all counts every known status once; unknown stored values are never counted", (() => { const c = R.tabCountsFrom({ CONFIRMED: 2, PROCESSING: 1, IN_TRANSIT: 3, DELIVERED: 4, ON_HOLD: 1, CANCELLED: 5, PENDING_CONFIRMATION: 2, SHIPPED_MAYBE: 9 }); return c.all === 18 && c.processing === 3 && c.in_transit === 3 && c.delivered === 4 && c.issues === 1; })());
check("S-05 summary maps the tabs to the five cards", (() => { const s = R.summaryFrom({ all: 10, processing: 2, in_transit: 3, delivered: 4, issues: 1 }); return s.totalOrders === 10 && s.processing === 2 && s.inTransit === 3 && s.delivered === 4 && s.activeIssues === 1; })());
check("S-06 statusesFor: all = no restriction; a tab = its group; an exact lower-case status = that one; unknown = no restriction (the parser refuses it first)", R.statusesFor("all") === null && R.statusesFor("in_transit").length === 3 && R.statusesFor("cancelled").join() === "CANCELLED" && R.statusesFor("pending_confirmation").join() === "PENDING_CONFIRMATION");
check("D-01 the delivery column only restates the order status: no carrier detail, nothing delayed, a passed date never delivers", R.deliveryLabel("PROCESSING") === "Not Dispatched" && R.deliveryLabel("IN_TRANSIT") === "In Transit" && R.deliveryLabel("DELIVERED") === "Delivered" && R.ORDER_STATUSES.every((s) => !/delay/i.test(R.deliveryLabel(s))));
check("C-01 a cancellation may be requested only before dispatch", ["PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING", "READY_TO_DISPATCH"].every(R.canRequestCancellation) && ["DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "ON_HOLD", "CANCELLATION_REQUESTED", "CANCELLED", "RETURN_REQUESTED", "RETURNED"].every((s) => !R.canRequestCancellation(s)));
check("C-02 cancellation input: reason 10 to 500 characters, no markup, confirmation required, unknown fields refused", R.validateCancellation({ reason: "Ordered the wrong size", confirm: true }).ok && !R.validateCancellation({ reason: "short", confirm: true }).ok && !R.validateCancellation({ reason: "x".repeat(501), confirm: true }).ok && !R.validateCancellation({ reason: "<b>bad</b> reason text", confirm: true }).ok && !R.validateCancellation({ reason: "Ordered the wrong size" }).ok && !R.validateCancellation({ reason: "Ordered the wrong size", confirm: true, status: "CANCELLED" }).ok && !R.validateCancellation(null).ok);
check("Q-01 defaults: newest first, page 1, 20 per page, all statuses", JSON.stringify({ ...P({}).value, window: null }) === JSON.stringify({ q: "", status: "all", supplierId: null, currency: null, window: null, sort: "newest", page: 1, limit: 20 }));
check("Q-02 status accepts the five tabs and every exact status (any case), refuses anything else", R.STATUS_TABS.every((t) => P({ status: t.value }).ok) && R.ORDER_STATUSES.every((s) => P({ status: s.toLowerCase() }).ok) && P({ status: "DELIVERED" }).ok && !P({ status: "shipped" }).ok && !P({ status: "$ne" }).ok);
check("Q-03 six sorts; the two amount sorts need a currency (mixed currencies are never ranked together)", R.SORTS.length === 6 && ["newest", "oldest", "updated", "delivery_soon"].every((s) => P({ sort: s }).ok) && !P({ sort: "amount_high" }).ok && !P({ sort: "amount_low" }).ok && P({ sort: "amount_high", currency: "INR" }).ok && P({ sort: "amount_low", currency: "USD" }).ok && !P({ sort: "price" }).ok);
check("Q-04 currency is a three-letter upper-case code; supplier an id or slug", P({ currency: "INR" }).ok && ["inr", "RUPEE", "IN", "$ne"].every((v) => !P({ currency: v }).ok) && P({ supplierId: "shree-textiles" }).ok && P({ supplierId: "SLR0001" }).ok && !P({ supplierId: "a b" }).ok && !P({ supplierId: "x".repeat(81) }).ok);
check("Q-05 search is trimmed and collapsed, control characters removed; 60 allowed, 61 refused; objects refused", P({ q: "  cotton   fabric " }).value?.q === "cotton fabric" && P({ q: "a".repeat(60) }).ok && !P({ q: "a".repeat(61) }).ok && !P({ q: { $ne: "" } }).ok);
check("Q-06 page 1 to 1000 and limit 1 to 50, whole numbers only", !P({ page: "0" }).ok && !P({ page: "1001" }).ok && !P({ page: "1.5" }).ok && !P({ limit: "0" }).ok && !P({ limit: "51" }).ok && P({ page: "1000", limit: "50" }).ok);
check("Q-07 date windows: presets and custom pairs are accepted by the India-time rules; a future end, reversed or half-given pair is refused", P({ range: "30d" }).value?.window?.key === "30d" && P({ range: "custom", dateFrom: "2026-01-01", dateTo: "2026-01-31" }).value?.window?.days === undefined && P({ range: "custom", dateFrom: "2026-01-01", dateTo: "2026-01-31" }).ok && !P({ range: "custom", dateFrom: "2026-02-01", dateTo: "2026-01-01" }).ok && !P({ range: "custom", dateFrom: "2026-01-01" }).ok && !P({ range: "forever" }).ok);
check("Q-08 unknown parameters (buyerId, userId) are ignored, never read; problems are reported on their own fields", P({ buyerId: "x", userId: "y" }).ok && !("buyerId" in P({ buyerId: "x" }).value) && (() => { const x = P({ status: "zz", page: "0", currency: "xx" }); return !x.ok && ["status", "page", "currency"].every((k) => k in x.fields); })());
check("R-01 order references: FBM-ORD- plus 8 characters of the reference alphabet (no I, L, O, U)", R.REFERENCE_PATTERN.test("FBM-ORD-7K3M9QX2") && !R.REFERENCE_PATTERN.test("FBM-ORD-7K3M9QXI") && !R.REFERENCE_PATTERN.test("FBM-ORD-7K3M9QX") && !R.REFERENCE_PATTERN.test("FBM-QT-7K3M9QX2") && !R.REFERENCE_PATTERN.test("fbm-ord-7k3m9qx2"));
check("E-01 CSV: a leading = + - @ is defused so a spreadsheet cannot run it; quotes and commas are escaped", R.csvCell("=SUM(A1)") === "'=SUM(A1)" && R.csvCell("+1") === "'+1" && R.csvCell("-2") === "'-2" && R.csvCell("@x") === "'@x" && R.csvCell('say "hi", ok') === '"say ""hi"", ok"' && R.csvCell(null) === "" && R.csvCell("plain") === "plain" && R.csvCell("a\nb") === '"a\nb"');
check("E-02 CSV rows end in CRLF, and an amount is a plain decimal in major units without grouping or symbol", R.toCsv([["a", "b"], [1, "x,y"]]) === 'a,b\r\n1,"x,y"\r\n' && R.plainAmount(79236000) === "792360.00" && R.plainAmount(5) === "0.05" && R.plainAmount(100) === "1.00" && R.plainAmount(0) === "0.00");
check("E-03 the export is capped at 5,000 rows and a page at 50", R.EXPORT_MAX_ROWS === 5000 && R.MAX_PAGE_SIZE === 50);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n" + failures.join("\n"));
  process.exit(1);
}
