// Unit tests for src/lib/supplier/quotationRules.ts (Page 42, pure module: query parsing, status mapping, withdrawal policy, CSV safety).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/42-supplier-quotation-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const load = (f) => import(pathToFileURL(path.join(root, f)).href);
const R = await load("src/lib/supplier/quotationRules.ts");

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 11, 6, 0, 0); // 11 Nov 2026
const parse = (p) => R.parseSupplierQuery(p, NOW);

// ---------- query parsing
let r = parse({});
check("Q-01 defaults: all, newest created, created-date basis, no window, 20 per page", r.ok && r.value.status === "all" && r.value.sort === "newest" && r.value.dateBasis === "created" && r.value.from === null && r.value.page === 1 && r.value.limit === 20 && r.value.currency === null && r.value.validity === null);
for (const s of ["all", "drafts", "submitted", "accepted", "rejected", "expired"]) check(`Q-02 status "${s}" is accepted`, parse({ status: s }).ok);
check("Q-03 an unknown status (withdrawn has no tab) is refused", !parse({ status: "withdrawn" }).ok && !parse({ status: "$ne" }).ok);
check("Q-04 sorts: newest, oldest, updated, valid; an amount sort is NOT offered (no stored total)", ["newest", "oldest", "updated", "valid"].every((s) => parse({ sort: s }).ok) && !parse({ sort: "amount-high" }).ok && !parse({ sort: "amount-low" }).ok);
check("Q-05 an array or object value is refused, never passed on (no operators)", !parse({ q: ["a", "b"] }).ok && !parse({ status: { $ne: "x" } }).ok && !parse({ currency: ["INR"] }).ok);
r = parse({ q: "  FBM-QT-\u0000AB\n  CD  " });
check("Q-06 the search text is normalised: control characters and runs of spaces collapse", r.ok && r.value.q === "FBM-QT- AB CD");
check("Q-07 a search longer than 60 characters is refused", !parse({ q: "x".repeat(61) }).ok && parse({ q: "x".repeat(60) }).ok);
r = parse({ q: '{"$gt":""}' });
check("Q-08 operator-looking text is just text (it is escaped before it reaches a pattern)", r.ok && r.value.q === '{"$gt":""}');
check("Q-09 currency: three letters, upper-cased; anything else refused", parse({ currency: "inr" }).value?.currency === "INR" && !parse({ currency: "RUPEE" }).ok && !parse({ currency: "I1R" }).ok);
check("Q-10 validity: active, expiring, expired only", ["active", "expiring", "expired"].every((v) => parse({ validity: v }).ok) && !parse({ validity: "soon" }).ok);
check("Q-11 date basis: created, sent, updated only", ["created", "sent", "updated"].every((v) => parse({ range: "30d", dateBasis: v }).ok) && !parse({ dateBasis: "deleted" }).ok);
r = parse({ range: "7d" });
check("Q-12 a preset range gives a half-open window of 7 days ending after today (India time)", r.ok && r.value.to.getTime() - r.value.from.getTime() === 7 * DAY && r.value.rangeKey === "7d");
r = parse({ range: "custom", startDate: "2026-10-01", endDate: "2026-10-31" });
check("Q-13 a custom range covers both end days (31 days)", r.ok && r.value.to.getTime() - r.value.from.getTime() === 31 * DAY);
check("Q-14 a custom range with a missing, impossible, reversed or future date is refused", !parse({ range: "custom" }).ok && !parse({ range: "custom", startDate: "2026-02-31", endDate: "2026-03-01" }).ok && !parse({ range: "custom", startDate: "2026-10-31", endDate: "2026-10-01" }).ok && !parse({ range: "custom", startDate: "2026-11-01", endDate: "2027-01-01" }).ok);
check("Q-15 an unknown range is refused", !parse({ range: "forever" }).ok);
check("Q-16 page and limit: whole numbers only, limit at most 50, page at most 1000", !parse({ limit: "51" }).ok && parse({ limit: "50" }).ok && !parse({ page: "0" }).ok && !parse({ page: "1.5" }).ok && !parse({ page: "1001" }).ok && !parse({ limit: "abc" }).ok);
r = parse({ status: "nope", sort: "nope" });
check("Q-17 every bad field is reported, not only the first", !r.ok && "status" in r.fields && "sort" in r.fields);

// ---------- status mapping
const past = new Date(NOW - DAY);
const soon = new Date(NOW + 3 * DAY);
const far = new Date(NOW + 30 * DAY);
const S = (s, v) => R.supplierStatus(s, v, new Date(NOW));
check("S-01 a draft is Draft (the only status a buyer never sees)", S("DRAFT", far) === "DRAFT");
check("S-02 sent and valid is Submitted; sent with 3 days left is Submitted and expiring", S("SENT", far) === "ACTIVE" && S("SENT", soon) === "EXPIRING_SOON");
check("S-03 sent or revision-requested past its validity is Expired (decided by the server clock, never stored)", S("SENT", past) === "EXPIRED" && S("REVISION_REQUESTED", past) === "EXPIRED");
check("S-04 accepted, rejected, withdrawn keep their status even after the validity date", S("ACCEPTED", past) === "ACCEPTED" && S("REJECTED", past) === "REJECTED" && S("WITHDRAWN", past) === "WITHDRAWN");
check("S-05 labels: Submitted, Revision Requested, Withdrawn are never worded as Rejected", R.SUPPLIER_STATUS_LABEL.ACTIVE === "Submitted" && R.SUPPLIER_STATUS_LABEL.WITHDRAWN === "Withdrawn" && R.SUPPLIER_STATUS_LABEL.REJECTED === "Rejected");

// ---------- withdrawal policy
const W = (s, current = true, v = far) => R.canWithdraw(s, current, v, new Date(NOW));
check("W-01 a sent or revision-requested current version still valid can be withdrawn", W("SENT") && W("REVISION_REQUESTED"));
check("W-02 accepted and rejected can NOT be withdrawn (a closed decision)", !W("ACCEPTED") && !W("REJECTED"));
check("W-03 draft, withdrawn and superseded can not be withdrawn", !W("DRAFT") && !W("WITHDRAWN") && !W("SUPERSEDED"));
check("W-04 an expired one has nothing left to withdraw", !W("SENT", true, past));
check("W-05 an older (non-current) version can not be withdrawn", !W("SENT", false));
check("W-06 a supplier can never set an accepted or rejected status: the only status this module can produce for an action is WITHDRAWN", R.parseWithdrawal({ confirm: true, status: "ACCEPTED" }).ok === false);
check("W-07 withdrawal needs explicit confirmation", !R.parseWithdrawal({}).ok && !R.parseWithdrawal({ confirm: "yes" }).ok && R.parseWithdrawal({ confirm: true }).ok);
let w = R.parseWithdrawal({ confirm: true, reason: "  Stock   sold out \n" });
check("W-08 the reason is normalised; an empty reason is null", w.ok && w.reason === "Stock sold out" && R.parseWithdrawal({ confirm: true, reason: "  " }).reason === null);
check("W-09 a reason over 500 characters or a non-text reason is refused; unknown body fields are refused", !R.parseWithdrawal({ confirm: true, reason: "x".repeat(501) }).ok && !R.parseWithdrawal({ confirm: true, reason: 5 }).ok && !R.parseWithdrawal({ confirm: true, buyerId: "x" }).ok);
check("W-10 no body is refused", !R.parseWithdrawal(null).ok);

// ---------- CSV safety
check("C-01 a cell is always quoted and quotes are doubled", R.csvCell('a "b"') === '"a ""b"""' && R.csvCell(5) === '"5"' && R.csvCell(null) === '""');
check("C-02 a formula-looking cell is neutralised (= + - @ tab CR)", ["=1+1", "+1", "-1", "@SUM(A1)", "\t x", "\r x"].every((v) => R.csvCell(v).startsWith('"\'')));
check("C-03 an ordinary product name is untouched", R.csvCell("Cotton Fabric 120 GSM") === '"Cotton Fabric 120 GSM"');
check("C-04 the export cap is 5,000 rows", R.EXPORT_MAX_ROWS === 5000);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
