// Unit tests for src/lib/compare/comparisonRules.ts (pure module).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/35-comparison-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const R = await import(pathToFileURL(path.join(root, "src/lib/compare/comparisonRules.ts")).href);

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

check("L-01 limits: two to four products, one definition shared by the service and the pages", R.COMPARE_PRODUCTS_MIN === 2 && R.COMPARE_PRODUCTS_MAX === 4);
check("S-01 row status: all the same is 'same'", R.rowStatus(["58 inch", "58 inch", "58 inch"]) === "same");
check("S-02 row status: different values is 'differs' (120 GSM against 160 GSM), whatever the case or spacing of equal ones", R.rowStatus(["120 GSM", "160 GSM"]) === "differs" && R.rowStatus(["Plain  Weave", "plain weave"]) === "same");
check("S-03 a missing value is NOT a value: equal values with one missing is 'incomplete', never 'differs' and never zero", R.rowStatus(["58 inch", null, "58 inch"]) === "incomplete" && R.rowStatus(["58 inch", null, "60 inch"]) === "differs" && R.rowStatus(["", "58 inch"]) === "incomplete");
check("S-04 nothing stated anywhere is 'empty' (the row is not drawn)", R.rowStatus([null, null]) === "empty" && R.rowStatus(["", "  "]) === "empty" && R.rowStatus([]) === "empty");
check("N-01 the lowest number is chosen only when EVERY product has a usable number; a missing, zero, negative or non-finite one means no emphasis (never 'lowest' of the rest)", JSON.stringify(R.lowestIndexes([185, 205, 165, 310])) === "[2]" && R.lowestIndexes([185, null, 165]).length === 0 && R.lowestIndexes([0, 5]).length === 0 && R.lowestIndexes([-1, 5]).length === 0 && R.lowestIndexes([Infinity, 5]).length === 0);
check("N-02 ties share the emphasis; fewer than two products never get one", JSON.stringify(R.lowestIndexes([100, 100, 120])) === "[0,1]" && R.lowestIndexes([100]).length === 0 && R.lowestIndexes([]).length === 0);
const P = (currency, unit, min) => ({ currency, unit, min });
check("P-01 prices in one currency and one unit are comparable: the lowest is found", (() => { const c = R.priceCompatibility([P("INR", "Piece", 185), P("INR", "piece", 165)]); return c.currencyCompatible && c.unitCompatible && JSON.stringify(c.lowest) === "[1]"; })());
check("P-02 different units: not comparable, no lowest, nothing converted", (() => { const c = R.priceCompatibility([P("INR", "Meter", 185), P("INR", "Kg", 165)]); return c.currencyCompatible && !c.unitCompatible && c.lowest.length === 0; })());
check("P-03 different currencies: not comparable, no lowest, nothing converted (there is no exchange-rate service)", (() => { const c = R.priceCompatibility([P("INR", "Meter", 185), P("USD", "Meter", 3)]); return !c.currencyCompatible && c.unitCompatible && c.lowest.length === 0; })());
check("P-04 a missing price anywhere means no lowest", R.priceCompatibility([P("INR", "Meter", 185), P("INR", "Meter", null)]).lowest.length === 0);
const M = (quantity, unit) => ({ quantity, unit });
check("M-01 minimum orders: comparable only when every product states one, in the same unit", (() => { const c = R.moqCompatibility([M(500, "meter"), M(300, "Meter")]); return c.comparable && JSON.stringify(c.lowest) === "[1]"; })());
check("M-02 a missing minimum order (never zero), or different units, means not comparable", !R.moqCompatibility([M(500, "meter"), null]).comparable && !R.moqCompatibility([M(500, "meter"), M(300, "kg")]).comparable && R.moqCompatibility([M(500, "meter"), null]).lowest.length === 0 && !R.moqCompatibility([M(500, "meter")]).comparable);
const S = (group, label) => ({ group, label });
check("A-01 specification rows: an attribute two products share is a shared row, grouped by its own group; ordered by how many products have it", (() => { const rows = R.planSpecRows([[S("Fabric", "GSM"), S("Fabric", "Width")], [S("Fabric", "GSM")]]); return rows[0].label === "GSM" && !rows[0].specific && rows[1].label === "Width" && rows[1].specific; })());
check("A-02 attributes of only one product (a different category) are listed apart as 'specific', not forced onto the others", (() => { const rows = R.planSpecRows([[S("Machine", "Motor Power")], [S("Fabric", "GSM")]]); return rows.length === 2 && rows.every((r) => r.specific); })());
check("A-03 with a single product every attribute is shown as it is (nothing is 'specific' to compare against)", (() => { const rows = R.planSpecRows([[S("Fabric", "GSM"), S("Fabric", "Width")]]); return rows.length === 2 && rows.every((r) => !r.specific); })());
check("A-04 the same label in two different groups stays two rows; the table is capped at 16 specification rows; shared rows come first", (() => { const a = R.planSpecRows([[S("A", "X"), S("B", "X")], [S("A", "X"), S("B", "X")]]); const many = R.planSpecRows([Array.from({ length: 40 }, (_, i) => S("G", `L${i}`))]); const mixed = R.planSpecRows([[S("G", "only-a"), S("G", "both")], [S("G", "both")]]); return a.length === 2 && many.length === R.MAX_SPEC_ROWS && mixed[0].label === "both"; })());
check("A-05 spec keys are stable and unique per group and label", R.specKey(S("A", "X")) === "spec:A|X" && R.specKey(S("A", "X")) !== R.specKey(S("B", "X")));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n" + failures.join("\n"));
  process.exit(1);
}
