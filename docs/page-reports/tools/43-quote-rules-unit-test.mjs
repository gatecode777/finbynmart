// Unit tests for src/lib/quotations/decimal.ts and quoteRules.ts (Page 43; pure modules shared by the browser preview and the server).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/43-quote-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const load = (f) => import(pathToFileURL(path.join(root, f)).href);
const D = await load("src/lib/quotations/decimal.ts");
const Q = await load("src/lib/quotations/quoteRules.ts");
const M = await load("src/lib/quotations/money.ts");

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const NOW = new Date("2026-11-12T06:00:00Z");

// ---------- exact decimals
check("D-01 money text parses to exact minor units: 120 -> 12000, 120.5 -> 12050, 120.50 -> 12050, 0.05 -> 5", D.parseMoney("120").value === 12000 && D.parseMoney("120.5").value === 12050 && D.parseMoney("120.50").value === 12050 && D.parseMoney("0.05").value === 5);
check("D-02 more than 2 decimals is REFUSED, not rounded (120.505, 0.001)", !D.parseMoney("120.505").ok && !D.parseMoney("0.001").ok);
check("D-03 malformed amounts are refused: sign, exponent, separators, hex, spaces inside, empty, '.5', '5.', letters, NaN, Infinity", ["-1", "+1", "1e3", "1,200.00", "0x10", "1 0", "", ".5", "5.", "abc", "NaN", "Infinity"].every((v) => !D.parseMoney(v).ok));
check("D-04 non-text amounts are refused (number, null, array, object)", [12.5, null, ["1"], { a: 1 }, undefined].every((v) => !D.parseMoney(v).ok));
check("D-05 a very large amount is refused (over 1,000,000,000.00) and the largest allowed one is exact", !D.parseMoney("1000000000.01").ok && D.parseMoney("1000000000.00").value === 100_000_000_000);
check("D-06 float-trap amounts stay exact: 0.1, 0.2, 1.15, 19.99 -> 10, 20, 115, 1999", D.parseMoney("0.1").value === 10 && D.parseMoney("0.2").value === 20 && D.parseMoney("1.15").value === 115 && D.parseMoney("19.99").value === 1999);
check("D-07 formatDecimal is the inverse and keeps 2 places: 12050 -> 120.50, 5 -> 0.05, 0 -> 0.00, 100000000000 -> 1000000000.00", D.formatDecimal(12050) === "120.50" && D.formatDecimal(5) === "0.05" && D.formatDecimal(0) === "0.00" && D.formatDecimal(100_000_000_000) === "1000000000.00");
check("D-08 percentages: 12 -> 1200 bp, 12.5 -> 1250, 0 -> 0, 100 -> 10000; 100.01, 101, -1, 1.234, abc refused", D.parsePercent("12").value === 1200 && D.parsePercent("12.5").value === 1250 && D.parsePercent("0").value === 0 && D.parsePercent("100").value === 10000 && ["100.01", "101", "-1", "1.234", "abc", ""].every((v) => !D.parsePercent(v).ok));
check("D-09 quantity is a whole number 1..1,000,000: 500 ok; 0, 5.5, 1e3, -1, 1000001, '' refused (fractional quantities are not supported, never rounded)", D.parseQuantity("500").value === 500 && ["0", "5.5", "1e3", "-1", "1000001", ""].every((v) => !D.parseQuantity(v).ok));

// ---------- the reference fixture (illustrative, with a TEST-only explicit non-taxable rule)
const TEST_RULE = { id: "TEST-NOT-APPLICABLE", version: "test-1", label: "Test fixture: not applicable", kind: "NOT_APPLICABLE", bp: null };
const base = () => ({ ...Q.emptyInput(NOW.getTime()), currency: "INR", lines: [{ ...Q.emptyLine(), name: "Cotton poplin fabric", quantity: "500", unit: "Meter", unitPrice: "120.00" }], freight: "1500.00", leadTimeDays: "10", deliveryTerms: "EXW", paymentType: "ON_DELIVERY" });
let c = Q.computeQuote(base(), TEST_RULE);
check("F-01 fixture: 500 m x INR 120.00, discount 0, freight 1,500.00, explicit non-taxable TEST rule -> total 61500.00", c.subtotal === "60000.00" && c.discount === "0.00" && c.taxable === "60000.00" && c.tax === "0.00" && c.freight === "1500.00" && c.total === "61500.00" && c.taxResolved && c.priced, JSON.stringify(c));
c = Q.computeQuote(base(), null);
check("F-02 tax unresolved: NO final total, a provisional amount before tax (61500.00) and 'pending'", c.total === null && c.provisional === "61500.00" && c.tax === null && !c.taxResolved && c.subtotal === "60000.00");
check("F-03 an explicit zero treatment is different from missing configuration: EXEMPT and NOT_APPLICABLE give tax 0.00 and a total; no rule gives none", Q.computeQuote(base(), { ...TEST_RULE, kind: "EXEMPT" }).total === "61500.00" && Q.computeQuote(base(), null).total === null);
const rate = (bp) => ({ id: "TEST-RATE", version: "t", label: "Test rate", kind: "RATE", bp });
c = Q.computeQuote(base(), rate(1800));
check("F-04 a configured RATE is applied to the taxable amount only, and freight is added after tax (test rate 18%: tax 10800.00, total 72300.00)", c.tax === "10800.00" && c.total === "72300.00");
const withLine = (patch) => ({ ...base(), freight: "", lines: [{ ...base().lines[0], ...patch }] });
c = Q.computeQuote(withLine({ discountKind: "PERCENT", discountValue: "2.5" }), TEST_RULE);
check("F-05 percent discount 2.5% of 60000.00 = 1500.00; taxable 58500.00", c.discount === "1500.00" && c.taxable === "58500.00" && c.total === "58500.00");
c = Q.computeQuote(withLine({ discountKind: "AMOUNT", discountValue: "250.50" }), TEST_RULE);
check("F-06 amount discount 250.50 -> taxable 59749.50", c.discount === "250.50" && c.taxable === "59749.50");
c = Q.computeQuote(withLine({ quantity: "1", unitPrice: "0.05" }), rate(1000));
check("F-07 rounding boundary: tax on 0.05 at 10% is 0.005 and rounds HALF UP to 0.01 (once, at the tax line)", c.tax === "0.01" && c.total === "0.06", JSON.stringify(c));
c = Q.computeQuote(withLine({ quantity: "1", unitPrice: "0.04" }), rate(1000));
check("F-08 just below the boundary: 0.04 at 10% = 0.004 -> 0.00", c.tax === "0.00" && c.total === "0.04");
c = Q.computeQuote(withLine({ quantity: "3", unitPrice: "33.33" }), rate(1250));
check("F-09 12.5% on 99.99 = 12.49875 -> 12.50 (exact integer math, no float drift)", c.taxable === "99.99" && c.tax === "12.50" && c.total === "112.49", JSON.stringify(c));
c = Q.computeQuote(withLine({ discountKind: "AMOUNT", discountValue: "70000.00" }), TEST_RULE);
check("F-10 a discount larger than the subtotal is refused (no negative amount)", c.total === null && c.issues.some((m) => /discount/i.test(m)), JSON.stringify(c.issues));
c = Q.computeQuote(withLine({ quantity: "1000000", unitPrice: "1000000000.00" }), TEST_RULE);
check("F-11 overflow: 1,000,000 x 1,000,000,000.00 is refused as too large, no total", c.total === null && c.issues.some((m) => /too large/i.test(m)));
c = Q.computeQuote(withLine({ unitPrice: "12x" }), TEST_RULE);
check("F-12 malformed input gives no total and a message, and never throws", c.total === null && c.issues.length > 0);
c = Q.computeQuote({ ...base(), lines: [] }, TEST_RULE);
check("F-13 no line item: no total", c.total === null && c.issues.length > 0);
c = Q.computeQuote({ ...base(), charges: [{ label: "Packing", amount: "200.00" }, { label: "Insurance", amount: "99.99" }] }, TEST_RULE);
check("F-14 approved additional charges are summed after tax with freight: 1500.00 + 200.00 + 99.99 -> other charges 299.99, total 61799.99", c.otherCharges === "299.99" && c.total === "61799.99", JSON.stringify(c));
check("F-15 the quotation calculation is the existing money module: same subtotal / total as priceBreakdown directly", (() => { const r = M.priceBreakdown({ unitPriceMinor: 12000, quantity: 500, discount: null, tax: { label: "x", bp: 0 }, charges: [{ label: "Freight", minor: 150000 }] }); return r.ok && D.formatDecimal(r.value.totalMinor) === "61500.00" && D.formatDecimal(r.value.subtotalMinor) === "60000.00"; })());
check("F-16 results are plain strings (no BigInt, no float) so they serialise safely", (() => { const c2 = Q.computeQuote(base(), TEST_RULE); return JSON.stringify(c2).includes('"total":"61500.00"') && Object.values(c2).every((v) => typeof v !== "bigint"); })());

// ---------- validity (India time)
const end = Q.validityEnd("2026-11-27");
check("V-01 the validity date ends at 23:59:59.999 India time (18:29:59.999 UTC)", end?.toISOString() === "2026-11-27T18:29:59.999Z", end?.toISOString());
check("V-02 not real calendar dates give null (2026-02-31, 2026-13-01, garbage)", Q.validityEnd("2026-02-31") === null && Q.validityEnd("2026-13-01") === null && Q.validityEnd("tomorrow") === null);
check("V-03 India day text of an instant just after midnight IST is the next day (2026-11-12T19:00Z -> 2026-11-13)", Q.istDateText(Date.parse("2026-11-12T19:00:00Z")) === "2026-11-13");

// ---------- validation for submission
const ctx = (over = {}) => ({ inquiry: { quantity: 500, unit: "Meter", productName: "Cotton poplin fabric" }, taxRules: [TEST_RULE], now: NOW, ...over });
const ready = () => ({ ...base(), taxRuleId: TEST_RULE.id, validUntil: "2026-11-27" });
check("S-01 the reference quotation passes submission validation", Object.keys(Q.validateForSubmit(ready(), ctx())).length === 0, JSON.stringify(Q.validateForSubmit(ready(), ctx())));
check("S-02 an empty draft fails with a message per missing field (price, tax, lead time, delivery, payment, name)", (() => { const f = Q.validateForSubmit({ ...Q.emptyInput(NOW.getTime()) }, ctx()); return ["lines.0.name", "lines.0.quantity", "lines.0.unitPrice", "taxRuleId", "leadTimeDays", "deliveryTerms", "paymentType"].every((k) => k in f); })());
check("S-03 no tax configured on the platform gives a clear BLOCKED message; configured-but-unselected asks to select", /No tax treatment is configured/.test(Q.validateForSubmit({ ...ready(), taxRuleId: "" }, ctx({ taxRules: [] })).taxRuleId) && /Select the approved/.test(Q.validateForSubmit({ ...ready(), taxRuleId: "" }, ctx()).taxRuleId));
check("S-04 a tax rule that is not in the configured list is refused (changed or forged)", "taxRuleId" in Q.validateForSubmit({ ...ready(), taxRuleId: "gst-18-forged" }, ctx()));
check("S-05 validity in the past (or ended today) is refused; more than 90 days is refused", "validUntil" in Q.validateForSubmit({ ...ready(), validUntil: "2026-11-11" }, ctx()) && "validUntil" in Q.validateForSubmit({ ...ready(), validUntil: "2027-03-01" }, ctx()) && !("validUntil" in Q.validateForSubmit({ ...ready(), validUntil: "2026-11-12" }, ctx())));
check("S-06 unit must be the buyer's unit: no conversion between metres, rolls, kilograms, pieces", /not converted/.test(Q.validateForSubmit({ ...ready(), lines: [{ ...ready().lines[0], unit: "Roll" }] }, ctx())["lines.0.unit"]) && !("lines.0.unit" in Q.validateForSubmit({ ...ready(), lines: [{ ...ready().lines[0], unit: "meter" }] }, ctx())));
check("S-07 a zero price is refused (no approved zero-price policy)", /zero price/.test(Q.validateForSubmit({ ...ready(), lines: [{ ...ready().lines[0], unitPrice: "0.00" }] }, ctx())["lines.0.unitPrice"]));
check("S-08 MOQ is checked in the line's own unit: offering 100 with a MOQ of 200 Meter is refused; 500 with MOQ 200 passes", /below your own minimum/.test(Q.validateForSubmit({ ...ready(), lines: [{ ...ready().lines[0], quantity: "100", moq: "200" }] }, ctx())["lines.0.quantity"]) && !("lines.0.quantity" in Q.validateForSubmit({ ...ready(), lines: [{ ...ready().lines[0], moq: "200" }] }, ctx())));
check("S-09 discount amount above the item subtotal is refused; a chosen discount with no value is refused", "lines.0.discountValue" in Q.validateForSubmit({ ...ready(), lines: [{ ...ready().lines[0], discountKind: "AMOUNT", discountValue: "70000.00" }] }, ctx()) && "lines.0.discountValue" in Q.validateForSubmit({ ...ready(), lines: [{ ...ready().lines[0], discountKind: "PERCENT", discountValue: "" }] }, ctx()));
check("S-10 payment terms: advance needs a percentage of at least 1; days need a number", "advancePercent" in Q.validateForSubmit({ ...ready(), paymentType: "ADVANCE", advancePercent: "" }, ctx()) && "advancePercent" in Q.validateForSubmit({ ...ready(), paymentType: "ADVANCE", advancePercent: "0.5" }, ctx()) && !("advancePercent" in Q.validateForSubmit({ ...ready(), paymentType: "ADVANCE", advancePercent: "30" }, ctx())) && "netDays" in Q.validateForSubmit({ ...ready(), paymentType: "NET_DAYS", netDays: "" }, ctx()));
check("S-11 an additional charge needs a name", "charges.0.label" in Q.validateForSubmit({ ...ready(), charges: [{ label: "", amount: "10.00" }] }, ctx()));
check("S-12 lead time must be at least 1 day", "leadTimeDays" in Q.validateForSubmit({ ...ready(), leadTimeDays: "0" }, ctx()));

// ---------- normalising what a client sent
let n = Q.normaliseInput({ currency: "inr", total: "1.00", grandTotal: "1", supplierKey: "evil", buyerId: "x", status: "SENT", createdBy: "y", lines: [{ id: "a b", name: "  Fabric   A ", quantity: "10", unit: "Meter", unitPrice: "5.00", total: "50.00", productKey: "1" }] });
check("N-01 only allow-listed fields survive: totals, supplierKey, buyerId, status, createdBy are dropped; currency upper-cased; spaces collapsed; a bad line id is replaced", !("total" in n.value) && !("supplierKey" in n.value) && !("status" in n.value) && !("createdBy" in n.value) && n.value.currency === "INR" && n.value.lines[0].name === "Fabric A" && n.value.lines[0].id === "line-1" && !("total" in n.value.lines[0]));
check("N-02 more than the configured maximum of line items is refused", "lines" in Q.normaliseInput({ lines: [{}, {}] }).fields && Q.MAX_LINES === 1);
check("N-03 malformed numbers are refused even in a DRAFT (price '12x', quantity '5.5', discount '101%', freight '-1'); empty means not filled in yet", (() => { const f = Q.normaliseInput({ lines: [{ unitPrice: "12x", quantity: "5.5", discountKind: "PERCENT", discountValue: "101" }], freight: "-1" }).fields; return "lines.0.unitPrice" in f && "lines.0.quantity" in f && "lines.0.discountValue" in f && "freight" in f; })() && Object.keys(Q.normaliseInput({ lines: [{ unitPrice: "", quantity: "" }], freight: "" }).fields).length === 0);
check("N-04 non-text values are refused (a number or object where text is required)", "currency" in Q.normaliseInput({ currency: 5 }).fields && "notes" in Q.normaliseInput({ notes: { a: 1 } }).fields && "lines.0.name" in Q.normaliseInput({ lines: [{ name: ["x"] }] }).fields);
check("N-05 limits: notes over 500 characters and names over 120 are refused; control characters are replaced", "notes" in Q.normaliseInput({ notes: "x".repeat(501) }).fields && "lines.0.name" in Q.normaliseInput({ lines: [{ name: "n".repeat(121) }] }).fields && Q.normaliseInput({ notes: "a\u0000b" }).value.notes === "a b");
check("N-06 unknown currency, delivery terms, payment type and impossible dates are refused", "currency" in Q.normaliseInput({ currency: "XYZ" }).fields && "deliveryTerms" in Q.normaliseInput({ deliveryTerms: "XXX" }).fields && "paymentType" in Q.normaliseInput({ paymentType: "CRYPTO" }).fields && "validUntil" in Q.normaliseInput({ validUntil: "2026-02-31" }).fields);
check("N-07 an operator-style object in a text field is refused, never passed on", "taxRuleId" in Q.normaliseInput({ taxRuleId: { $ne: "" } }).fields);
check("N-08 the body itself may be anything: null, an array or a string normalises to an empty input without throwing", [null, [], "x", 5, undefined].every((v) => { const r = Q.normaliseInput(v); return typeof r.value.currency === "string"; }));
check("N-09 idempotency keys: 16 to 64 letters, digits, - and _ only", Q.IDEMPOTENCY_KEY.test("a".repeat(16)) && !Q.IDEMPOTENCY_KEY.test("short") && !Q.IDEMPOTENCY_KEY.test("has space ".repeat(3)) && !Q.IDEMPOTENCY_KEY.test("a".repeat(65)));
check("N-10 payment text is built from the structured choice, never from free text", Q.paymentText({ paymentType: "ADVANCE", advancePercent: "30", netDays: "" }) === "30% advance, balance as agreed" && Q.paymentText({ paymentType: "NET_DAYS", advancePercent: "", netDays: "45" }) === "Payment within 45 days" && Q.paymentText({ paymentType: "", advancePercent: "", netDays: "" }) === null);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
