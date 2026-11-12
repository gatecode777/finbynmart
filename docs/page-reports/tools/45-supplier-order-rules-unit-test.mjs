// Unit tests for src/lib/supplier/orderRules.ts (Page 45, pure module: status groups, counts, query validation, labels, export header).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/45-supplier-order-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const load = (f) => import(pathToFileURL(path.join(root, f)).href);
const R = await load("src/lib/supplier/orderRules.ts");
const O = await load("src/lib/orders/orderRules.ts");
const Q = await load("src/lib/supplier/quotationRules.ts");

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const NOW = Date.UTC(2026, 10, 12, 6, 0, 0); // 12 Nov 2026
const parse = (p) => R.parseSupplierOrderQuery(p, NOW);

// ---------- status groups
const all = O.ORDER_STATUSES;
const flat = R.ORDER_GROUPS.flatMap((g) => g.statuses);
check("G-01 the groups PARTITION the 13 stored statuses: every status is in exactly one group", flat.length === all.length && new Set(flat).size === all.length && all.every((s) => flat.includes(s)), `${flat.length} of ${all.length}`);
check("G-02 groupKeyOf agrees with the table for every status", all.every((s) => R.ORDER_GROUPS.find((g) => g.key === R.groupKeyOf(s)).statuses.includes(s)));
check("G-03 In Progress does NOT include Ready to Dispatch (the two cards are disjoint)", !R.statusesFor("in_progress").includes("READY_TO_DISPATCH") && R.statusesFor("ready").join() === "READY_TO_DISPATCH");
check("G-04 Dispatched covers DISPATCHED, IN_TRANSIT and OUT_FOR_DELIVERY as stored (a label alone proves nothing)", R.statusesFor("shipped").join() === "DISPATCHED,IN_TRANSIT,OUT_FOR_DELIVERY");
check("G-05 an exact status key selects exactly that status; the group key 'shipped' and the exact key 'dispatched' do not collide", R.statusesFor("dispatched").join() === "DISPATCHED" && R.statusesFor("cancellation_requested").join() === "CANCELLATION_REQUESTED");
check("G-06 'all' selects no restriction; an unknown value selects none (and is refused by the parser)", R.statusesFor("all") === null && R.statusesFor("nonsense") === null);
check("G-07 the filter vocabulary is the 8 tabs plus the 13 exact statuses, 19 distinct values (delivered and cancelled are both a group and an exact status that select the same one), listed once", R.STATUS_FILTER_VALUES.length === 19 && new Set(R.STATUS_FILTER_VALUES).size === 19 && R.statusesFor("delivered").join() === "DELIVERED" && R.statusesFor("cancelled").join() === "CANCELLED");

// ---------- counts
const stored = { PENDING_CONFIRMATION: 3, CONFIRMED: 2, PROCESSING: 6, READY_TO_DISPATCH: 4, DISPATCHED: 1, IN_TRANSIT: 2, OUT_FOR_DELIVERY: 1, DELIVERED: 5, CANCELLED: 2, ON_HOLD: 1, CANCELLATION_REQUESTED: 1, RETURN_REQUESTED: 1, RETURNED: 1 };
const c = R.tabCountsFrom(stored);
check("C-01 the cards: All 30, Awaiting 3, In Progress 8, Ready to Dispatch 4", c.all === 30 && c.awaiting === 3 && c.in_progress === 8 && c.ready === 4, JSON.stringify(c));
check("C-02 the chips add up to All (no order is counted twice or lost)", c.awaiting + c.in_progress + c.ready + c.shipped + c.delivered + c.cancelled + c.attention === c.all);
check("C-03 Dispatched 4, Delivered 5, Cancelled 2, On hold / returns / requests 4", c.shipped === 4 && c.delivered === 5 && c.cancelled === 2 && c.attention === 4);
check("C-04 zero records give zeros; a stored value the code does not know is counted nowhere", R.tabCountsFrom({}).all === 0 && R.tabCountsFrom({ ALIEN: 9 }).all === 0 && R.tabCountsFrom({ ALIEN: 9, DELIVERED: 1 }).all === 1);
check("C-05 zeroCounts has every tab at zero", Object.values(R.zeroCounts()).every((n) => n === 0) && Object.keys(R.zeroCounts()).length === 8);

// ---------- the three different facts
check("F-01 every stored status has a fulfilment label, and it is never 'Paid' or 'Unpaid'", all.every((s) => typeof R.fulfilmentLabel(s) === "string" && R.fulfilmentLabel(s).length > 0 && !/paid/i.test(R.fulfilmentLabel(s))));
check("F-02 Delivered is not Paid: DELIVERED has the fulfilment 'Delivered' and the payment stays unavailable", R.fulfilmentLabel("DELIVERED") === "Delivered" && R.PAYMENT_UNAVAILABLE.available === false && R.PAYMENT_UNAVAILABLE.label === "Payment status unavailable");
check("F-03 a dispatched order is not delivered; a cancelled one proves no refund", R.fulfilmentLabel("DISPATCHED") === "Dispatched" && R.fulfilmentLabel("CANCELLED") === "Cancelled" && !/refund/i.test(R.fulfilmentLabel("CANCELLED")));
check("F-04 the status labels come from the ONE order lifecycle (no new persisted status)", R.STATUS_LABEL === O.STATUS_LABEL && all.every((s) => R.STATUS_LABEL[s]));

// ---------- query parsing
let r = parse({});
check("Q-01 defaults: all, newest, order-date basis, no window, no currency, page 1, 20 per page", r.ok && r.value.status === "all" && r.value.sort === "newest" && r.value.dateBasis === "placed" && r.value.from === null && r.value.currency === null && r.value.page === 1 && r.value.limit === 20);
check("Q-02 every group and every exact status is accepted (case-insensitive)", R.STATUS_FILTER_VALUES.every((s) => parse({ status: s }).ok) && parse({ status: "READY" }).ok && parse({ status: "Delivered" }).ok);
check("Q-03 an unknown status, an operator or an array is refused (nothing reaches the database)", !parse({ status: "withdrawn" }).ok && !parse({ status: "$ne" }).ok && !parse({ status: { $ne: "x" } }).ok && !parse({ status: ["all", "ready"] }).ok);
check("Q-04 sorts: newest, oldest, updated; amount sorts need a currency", ["newest", "oldest", "updated"].every((s) => parse({ sort: s }).ok) && !parse({ sort: "amount_high" }).ok && parse({ sort: "amount_high", currency: "INR" }).ok && parse({ sort: "amount_low", currency: "usd" }).ok);
check("Q-05 an unknown sort (including delivery_soon, which this page does not offer) is refused", !parse({ sort: "delivery_soon" }).ok && !parse({ sort: "price" }).ok);
check("Q-06 the search is normalised (control characters, runs of spaces) and bounded to 60 characters", (r = parse({ q: "  FBM-ORD-\u0000AB\n  CD " })).ok && r.value.q === "FBM-ORD- AB CD" && !parse({ q: "x".repeat(61) }).ok && parse({ q: "x".repeat(60) }).ok);
check("Q-07 an array or object search is refused", !parse({ q: ["a", "b"] }).ok && !parse({ q: { $regex: ".*" } }).ok && !parse({ currency: ["INR"] }).ok);
check("Q-08 currency must be three letters (upper-cased); anything else is refused", parse({ currency: "inr" }).ok && parse({ currency: "inr" }).value.currency === "INR" && !parse({ currency: "RUPEES" }).ok && !parse({ currency: "I1R" }).ok);
check("Q-09 the date basis is order date or last updated only", parse({ range: "30d", dateBasis: "updated" }).ok && !parse({ dateBasis: "sent" }).ok && !parse({ dateBasis: "$where" }).ok);
r = parse({ range: "7d" });
check("Q-10 a 7-day preset gives a half-open window ending at the next India midnight", r.ok && r.value.from instanceof Date && r.value.to instanceof Date && r.value.to > r.value.from && (r.value.to - r.value.from) === 7 * 86_400_000 && r.value.rangeKey === "7d", JSON.stringify(r.value?.rangeKey));
check("Q-11 a custom range needs both dates, in order, as real calendar days", !parse({ range: "custom" }).ok && !parse({ range: "custom", startDate: "2026-11-10" }).ok && !parse({ range: "custom", startDate: "2026-11-12", endDate: "2026-11-01" }).ok && parse({ range: "custom", startDate: "2026-11-01", endDate: "2026-11-10" }).ok);
check("Q-12 an unknown range is refused", !parse({ range: "forever" }).ok && !parse({ range: { $gt: 1 } }).ok);
check("Q-13 pagination: page 1-1000, limit 1-50; zero, negative, fractional, huge and text are refused", !parse({ page: "0" }).ok && !parse({ page: "-1" }).ok && !parse({ page: "1.5" }).ok && !parse({ page: "1001" }).ok && parse({ page: "1000" }).ok && !parse({ limit: "51" }).ok && parse({ limit: "50" }).ok && !parse({ limit: "abc" }).ok);
check("Q-14 parameters that are not listed (supplierId, supplierKey, supplierCompanyId, buyerId, companyId) are never read", (r = parse({ supplierId: "x", supplierKey: "sunrise-hub", supplierCompanyId: "1", buyerId: "2", companyId: "3", $where: "1" })).ok && !("supplierKey" in r.value) && !("supplierCompanyId" in r.value) && !("buyerId" in r.value));
check("Q-15 a refusal names the field (for the 422/400 answer), and several problems are reported together", (r = parse({ status: "x", page: "0", currency: "??" })).ok === false && "status" in r.fields && "page" in r.fields && "currency" in r.fields);

// ---------- summaries and quantities
check("S-01 a multi-item order shows its first item and a count of the others (never a concatenation)", R.itemSummary("Cotton poplin fabric", 1) === "Cotton poplin fabric" && R.itemSummary("Cotton poplin fabric", 3) === "Cotton poplin fabric and 2 more items" && R.itemSummary("Cotton poplin fabric", 2) === "Cotton poplin fabric and 1 more item");
check("S-02 quantity text keeps the stored unit and Indian digit grouping; different units are never added", R.quantityText(500, "Meter") === "500 Meter" && R.quantityText(1234567, "Piece") === "12,34,567 Piece" && R.quantityText(5, null) === "5" && R.quantityText(5, "") === "5");
check("S-03 the cards are All, Awaiting Confirmation, In Progress, Ready to Dispatch (no invented revenue card)", R.SUMMARY_CARDS.map((x) => x.label).join("|") === "All Orders|Awaiting Confirmation|In Progress|Ready to Dispatch");

// ---------- export
check("X-01 a role needs both view and export permission to export", R.canExportOrders({ viewOrders: true, exportOrders: true }) === true && R.canExportOrders({ viewOrders: true, exportOrders: false }) === false && R.canExportOrders({ viewOrders: false, exportOrders: true }) === false);
check("X-02 the export is capped at 5,000 rows", R.EXPORT_MAX_ROWS === 5000);
check("X-03 the file header has no payment amount, e-mail, phone or address, and states the payment honestly", R.EXPORT_HEADER.includes("Payment") && !R.EXPORT_HEADER.some((h) => /e-?mail|phone|address|contact|gst/i.test(h)));
check("X-04 CSV cells defuse formulas (= + - @ tab, CR) and double quotes, and are always quoted", Q.csvCell("=HYPERLINK(\"x\")") === '"\'=HYPERLINK(""x"")"' && Q.csvCell("+91 98765") === '"\'+91 98765"' && Q.csvCell("@SUM(A1)") === '"\'@SUM(A1)"' && Q.csvCell("-1") === '"\'-1"' && Q.csvCell("Cotton, 120 GSM") === '"Cotton, 120 GSM"');
check("X-05 the shared plain amount keeps two decimals and is exact for large values", O.plainAmount(6150000) === "61500.00" && O.plainAmount(5) === "0.05" && O.plainAmount(99999999999) === "999999999.99");

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
