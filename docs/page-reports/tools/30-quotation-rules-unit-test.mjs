// Unit tests for src/lib/quotations/money.ts and quotationRules.ts (pure modules).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/30-quotation-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const load = (f) => import(pathToFileURL(path.join(root, f)).href);
const M = await load("src/lib/quotations/money.ts");
const R = await load("src/lib/quotations/quotationRules.ts");

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const price = (o) => M.priceBreakdown({ unitPriceMinor: 14800, quantity: 5000, ...o });

let b = price({}).value;
check("M-01 no discount, no tax: subtotal is unit price x quantity (Rs 148.00 x 5,000 = Rs 7,40,000.00), the total is only 'before tax' and no tax is invented", b.subtotalMinor === 74_000_000 && b.discountMinor === 0 && b.taxMinor === null && b.taxSpecified === false && b.totalMinor === 74_000_000);
b = price({ discount: { kind: "PERCENT", bp: 200 }, tax: { label: "GST", bp: 1800 } }).value;
check("M-02 2% discount then 18% tax on the discounted amount (the reference example): discount 14,800.00, taxable 7,25,200.00, tax 1,30,536.00, total 8,55,736.00", b.discountMinor === 1_480_000 && b.taxableMinor === 72_520_000 && b.taxMinor === 13_053_600 && b.totalMinor === 85_573_600 && b.taxSpecified);
b = price({ tax: { label: "GST", bp: 500 }, charges: [{ label: "Freight", minor: 100000 }, { label: "Packing", minor: 50000 }] }).value;
check("M-03 charges are added after tax and itemised in the sum: 5% GST on 7,40,000 = 37,000; + 1,500 charges = 7,78,500.00", b.taxMinor === 3_700_000 && b.chargesMinor === 150_000 && b.totalMinor === 74_000_000 + 3_700_000 + 150_000);
b = M.priceBreakdown({ unitPriceMinor: 333, quantity: 3, tax: { label: "GST", bp: 1800 } }).value;
check("M-04 percentages round half up to the minor unit (no floating point): 18% of 999 paise = 179.82 -> 180", b.taxMinor === 180 && b.totalMinor === 999 + 180);
b = M.priceBreakdown({ unitPriceMinor: 1, quantity: 1, discount: { kind: "PERCENT", bp: 5000 } }).value;
check("M-05 half a paisa rounds up (50% of 1 paisa = 1), exactly and repeatably", b.discountMinor === 1 && b.taxableMinor === 0);
const big = M.priceBreakdown({ unitPriceMinor: 123456789, quantity: 1000, tax: { label: "GST", bp: 1800 } }).value;
check("M-06 amounts well beyond float comfort stay exact: 1,234,567.89 x 1,000 = 1,234,567,890.00, tax 222,222,220.20, total 1,456,790,110.20", big.subtotalMinor === 123_456_789_000 && big.taxMinor === 22_222_222_020 && big.totalMinor === 145_679_011_020, JSON.stringify(big));
check("M-07 an amount discount cannot exceed the subtotal; bad inputs are refused, never rounded; a total beyond the safe range is refused instead of overflowing", !price({ discount: { kind: "AMOUNT", minor: 74_000_001 } }).ok && price({ discount: { kind: "AMOUNT", minor: 74_000_000 } }).value.taxableMinor === 0 && !M.priceBreakdown({ unitPriceMinor: 10.5, quantity: 1 }).ok && !M.priceBreakdown({ unitPriceMinor: -1, quantity: 1 }).ok && !M.priceBreakdown({ unitPriceMinor: 1, quantity: 0 }).ok && !M.priceBreakdown({ unitPriceMinor: 1, quantity: 1.5 }).ok && !price({ tax: { label: "GST", bp: 10001 } }).ok && !price({ discount: { kind: "PERCENT", bp: -1 } }).ok && !price({ charges: [{ label: "x", minor: 0.5 }] }).ok && !M.priceBreakdown({ unitPriceMinor: 1234567890123, quantity: 7000, tax: { label: "GST", bp: 1800 } }).ok);
check("M-08 a zero tax rate is a stated tax (0.00), different from no tax", price({ tax: { label: "GST", bp: 0 } }).value.taxMinor === 0 && price({ tax: { label: "GST", bp: 0 } }).value.taxSpecified === true);
check("M-09 money is shown from the integer: Indian grouping for INR, two decimals, a different currency keeps its own symbol", M.formatMoney(85_573_600, "INR") === "₹8,55,736.00" && M.formatMoney(5, "INR") === "₹0.05" && M.formatMoney(14800, "USD") === "$148.00" && M.formatMoney(123456789012345, "INR") === "₹12,34,56,78,90,123.45" && M.formatMoney(100, "AED") === "AED 1.00" && M.formatMoney(100, "XYZ") === "XYZ 1.00");
check("M-10 percentages print as stated (1800 -> 18%, 250 -> 2.5%)", M.formatPercent(1800) === "18%" && M.formatPercent(250) === "2.5%" && M.formatPercent(125) === "1.25%");

const now = new Date("2026-11-04T10:00:00Z");
const at = (days) => new Date(now.getTime() + days * 86_400_000);
check("S-01 an open quotation is Active, Expiring Soon within 7 days, and Expired from the moment its validity ends (the boundary instant is expired)", R.effectiveStatus("SENT", at(30), now) === "ACTIVE" && R.effectiveStatus("SENT", at(7), now) === "EXPIRING_SOON" && R.effectiveStatus("SENT", at(7.01), now) === "ACTIVE" && R.effectiveStatus("SENT", at(0.0001), now) === "EXPIRING_SOON" && R.effectiveStatus("SENT", now, now) === "EXPIRED" && R.effectiveStatus("SENT", at(-1), now) === "EXPIRED");
check("S-02 decided and closed quotations keep their stored status whatever the date; a revision request expires like an open one", R.effectiveStatus("ACCEPTED", at(-10), now) === "ACCEPTED" && R.effectiveStatus("REJECTED", at(-10), now) === "REJECTED" && R.effectiveStatus("WITHDRAWN", at(-10), now) === "WITHDRAWN" && R.effectiveStatus("SUPERSEDED", at(5), now) === "SUPERSEDED" && R.effectiveStatus("REVISION_REQUESTED", at(5), now) === "REVISION_REQUESTED" && R.effectiveStatus("REVISION_REQUESTED", at(-1), now) === "EXPIRED");
check("S-03 days left rounds up while valid", R.daysLeft(at(16.2), now) === 17 && R.daysLeft(at(1), now) === 1 && R.daysLeft(at(-0.5), now) <= 0);
const a = (s, cur = true, other = false) => R.allowedActions(s, cur, other);
check("S-04 what the buyer may do: accept/reject/revise an open current quotation; accept only if no other quotation of the inquiry is accepted; reject also while a revision is pending; nothing on an expired, decided, withdrawn or superseded one", JSON.stringify(a("ACTIVE")) === '{"accept":true,"reject":true,"requestRevision":true}' && a("EXPIRING_SOON").accept && !a("ACTIVE", true, true).accept && a("ACTIVE", true, true).reject && a("REVISION_REQUESTED").reject && !a("REVISION_REQUESTED").accept && !a("REVISION_REQUESTED").requestRevision && ["EXPIRED", "ACCEPTED", "REJECTED", "WITHDRAWN", "SUPERSEDED"].every((s) => Object.values(a(s)).every((v) => v === false)) && Object.values(a("ACTIVE", false)).every((v) => v === false));
check("R-01 references: FBM-QT- plus eight characters of the unambiguous alphabet", R.REFERENCE_PATTERN.test("FBM-QT-ABCD2345") && !R.REFERENCE_PATTERN.test("FBM-QT-ABCDILOU") && !R.REFERENCE_PATTERN.test("FBM-INQ-ABCD2345") && !R.REFERENCE_PATTERN.test("fbm-qt-abcd2345") && !R.REFERENCE_PATTERN.test("FBM-QT-ABCD234"));

const P = (o = {}) => R.parseQuotationQuery(o);
check("Q-01 list defaults: all, recently received, page 1, 20 per page", JSON.stringify(P({}).value) === JSON.stringify({ q: "", status: "all", sort: "received", page: 1, limit: 20 }));
check("Q-02 the seven tabs and three sorts are accepted (tabs also in capitals), anything else refused", R.STATUS_TABS.every((t) => P({ status: t.value }).ok) && P({ status: "ACCEPTED" }).value?.status === "accepted" && ["draft", "bogus", "{}", ["all"]].every((status) => !P({ status }).ok) && R.QUOTATION_SORTS.every((s) => P({ sort: s.value }).ok) && ["price", "reference", ["valid"]].every((sort) => !P({ sort }).ok));
check("Q-03 search is trimmed and bounded (60), objects refused; page 1-1000 and limit 1-50 are whole numbers; unknown parameters (buyerId) are ignored", P({ q: "  cotton   fabric " }).value?.q === "cotton fabric" && !P({ q: "x".repeat(61) }).ok && ![{ $ne: "" }, ["a"]].every((q) => P({ q }).ok) && !P({ page: "0" }).ok && !P({ page: "1001" }).ok && !P({ limit: "51" }).ok && !P({ limit: "x" }).ok && P({ buyerId: "x" }).ok && !("buyerId" in P({ buyerId: "x" }).value));

const D = (b, k = "accept") => R.validateDecision(b, k);
check("D-01 a decision needs the version being decided and an explicit confirm: true; unknown keys (status, price, buyerId) are refused", D({ version: 2, confirm: true }).ok && !D({ version: 2 }).ok && !D({ confirm: true }).ok && !D({ version: 0, confirm: true }).ok && !D({ version: 1, confirm: "true" }).ok && !D({ version: 1, confirm: true, status: "ACCEPTED" }).ok && !D({ version: 1, confirm: true, price: 1 }).ok && !D({ version: 1, confirm: true, buyerId: "x" }).ok && [null, "x", 5, []].every((x) => !D(x).ok));
check("D-02 a rejection may carry a reason (500 characters, no markup); an acceptance cannot", D({ version: 1, confirm: true, reason: "Too expensive for this quantity." }, "reject").value?.reason === "Too expensive for this quantity." && D({ version: 1, confirm: true }, "reject").value?.reason === null && !D({ version: 1, confirm: true, reason: "x".repeat(501) }, "reject").ok && !D({ version: 1, confirm: true, reason: "<b>" }, "reject").ok && !D({ version: 1, confirm: true, reason: "no" }, "accept").ok);
const V = (b) => R.validateRevisionRequest(b);
check("V-01 a revision request needs a listed reason, a message of 10-1,000 characters and the version; everything else is refused", V({ reason: "PRICE", message: "Please reduce the price for 5,000 meters.", version: 1 }).ok && !V({ reason: "PRICE", message: "short", version: 1 }).ok && !V({ reason: "NOPE", message: "A long enough message here.", version: 1 }).ok && !V({ reason: "PRICE", message: "x".repeat(1001), version: 1 }).ok && !V({ reason: "PRICE", message: "<script>alert(1)</script>", version: 1 }).ok && !V({ reason: "PRICE", message: "A long enough message here." }).ok && !V({ reason: "PRICE", message: "A long enough message here.", version: 1, status: "SENT" }).ok && R.REVISION_REASONS.length === 6);

const item = (o = {}) => ({ reference: "FBM-QT-AAAAAAAA", inquiryReference: "FBM-INQ-AAAAAAAA", currency: "INR", unit: "Meter", quantity: 5000, status: "ACTIVE", ...o });
let c = R.compatibility([item(), item({ reference: "FBM-QT-BBBBBBBB" })]);
check("C-01 same inquiry, currency, unit and quantity: comparable, no mismatch", c.sameInquiry && c.priceComparable && c.mismatches.length === 0);
c = R.compatibility([item(), item({ currency: "USD" })]);
check("C-02 different currencies are flagged and not price comparable", !c.priceComparable && c.mismatches.some((m) => m.field === "currency"));
c = R.compatibility([item(), item({ unit: "Kg" }), item({ quantity: 200 })]);
check("C-03 different units and quantities are each named", !c.priceComparable && c.mismatches.map((m) => m.field).sort().join() === "quantity,unit");
check("C-04 different inquiries are not the same inquiry; an expired one is flagged", !R.compatibility([item(), item({ inquiryReference: "FBM-INQ-BBBBBBBB" })]).sameInquiry && R.compatibility([item(), item({ status: "EXPIRED" })]).mismatches.some((m) => m.field === "status") && !R.compatibility([item({ inquiryReference: null }), item({ inquiryReference: null })]).sameInquiry);
check("C-05 limits: at least 2 and at most 4 quotations are compared", R.COMPARE_MIN === 2 && R.COMPARE_MAX === 4);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n" + failures.join("\n"));
  process.exit(1);
}
