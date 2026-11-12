// Unit tests for src/lib/quotations/revisionRules.ts and quotationCompare.ts (Page 44; pure modules) and the withdrawal parser.
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/44-quotation-versions-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const load = (f) => import(pathToFileURL(path.join(root, f)).href);
const V = await load("src/lib/quotations/revisionRules.ts");
const C = await load("src/lib/quotations/quotationCompare.ts");
const W = await load("src/lib/supplier/quotationRules.ts");
const Q = await load("src/lib/quotations/quoteRules.ts");

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === "object" && !Object.isFrozen(v) && deepFreeze(v)); return Object.freeze(o); };

// ---------- revision eligibility
const E = (o = {}) => V.revisionEligibility({ status: "SENT", isCurrent: true, hasOpenRevisionDraft: false, inquiryOpen: true, ...o });
check("R-01 the current version of a quotation still waiting on the buyer (SENT or REVISION_REQUESTED) can be revised", E().ok && E({ status: "REVISION_REQUESTED" }).ok);
check("R-02 an ACCEPTED version cannot be revised: it is immutable and no amendment process exists (said in words)", (() => { const x = E({ status: "ACCEPTED" }); return !x.ok && x.code === "NOT_ALLOWED" && /immutable/.test(x.message) && /amendment/.test(x.message); })());
check("R-03 rejected, withdrawn and draft versions cannot be revised, each with its own reason", ["REJECTED", "WITHDRAWN", "DRAFT", "SUPERSEDED", "SOMETHING"].every((s) => { const x = E({ status: s }); return !x.ok && x.code === "NOT_ALLOWED" && x.message.length > 20; }) && /draft/i.test(E({ status: "DRAFT" }).message));
check("R-04 a historical (not current) version cannot be revised: NOT_CURRENT, and that check comes first", (() => { const x = E({ isCurrent: false, status: "ACCEPTED", hasOpenRevisionDraft: true }); return !x.ok && x.code === "NOT_CURRENT"; })());
check("R-05 only one revision draft at a time: REVISION_EXISTS (continue it); a closed inquiry blocks too (INQUIRY_CLOSED)", (() => { const a = E({ hasOpenRevisionDraft: true }); const b = E({ inquiryOpen: false }); return !a.ok && a.code === "REVISION_EXISTS" && !b.ok && b.code === "INQUIRY_CLOSED"; })());
const reason = (t) => V.parseRevisionReason(t);
check("R-06 the revision reason: 3 to 300 characters, normalised; shorter, longer, blank, non-text refused", reason("  Price   revised \n for volume ").reason === "Price revised for volume" && !reason("ab").ok && !reason("x".repeat(301)).ok && reason("x".repeat(300)).ok && !reason("   ").ok && [5, null, ["x"], { a: 1 }, undefined].every((v) => !reason(v).ok));

// ---------- the editable input a revision starts from
const legacy = { currency: "INR", unit: "Meter", quantity: 500, unitPriceMinor: 74000, productName: "Cotton Fabric", productKey: "1163", moq: { quantity: 200, unit: "Meter" }, discount: { kind: "PERCENT", bp: 250 }, charges: [{ label: "Freight", minor: 150000 }, { label: "Packing", minor: 20050 }], terms: { deliveryMinDays: 7, incoterms: "EXW", remarks: "Plain note" } };
const now = Date.parse("2026-11-12T06:00:00Z");
const li = V.inputFromDoc(legacy, now);
check("I-01 a legacy record is rebuilt from ITS OWN stored fields: exact decimal strings, discount percent 2.5, freight and other charges separated", li.lines[0].unitPrice === "740.00" && li.lines[0].quantity === "500" && li.lines[0].unit === "Meter" && li.lines[0].moq === "200" && li.lines[0].discountKind === "PERCENT" && li.lines[0].discountValue === "2.5" && li.freight === "1500.00" && li.charges.length === 1 && li.charges[0].amount === "200.50" && li.currency === "INR" && li.leadTimeDays === "7" && li.deliveryTerms === "EXW" && li.notes === "Plain note");
check("I-02 what cannot be known is left BLANK for the supplier to decide: tax treatment, payment terms of a free-text record; and the validity is a NEW default date (a revised offer needs one)", li.taxRuleId === "" && li.paymentType === "" && li.advancePercent === "" && li.validUntil === Q.defaultValidity(now) && li.validUntil > "2026-11-12");
check("I-03 an amount discount maps to a decimal amount; an unknown delivery term is not guessed", V.inputFromDoc({ ...legacy, discount: { kind: "AMOUNT", minor: 25050 }, terms: { incoterms: "WEIRD" } }, now).lines[0].discountValue === "250.50" && V.inputFromDoc({ ...legacy, terms: { incoterms: "WEIRD" } }, now).deliveryTerms === "");
const snapInput = { currency: "INR", validUntil: "2026-12-01", lines: [{ id: "line-1", source: "CATALOGUE", productKey: "1163", name: "Cotton Fabric", quantity: "500", unit: "Meter", unitPrice: "740.00", moq: "", discountKind: "NONE", discountValue: "" }], taxRuleId: "gst", freight: "1500.00", charges: [], leadTimeDays: "10", deliveryTerms: "FOB", paymentType: "ADVANCE", advancePercent: "30", netDays: "", notes: "n" };
const si = V.inputFromDoc({ ...legacy, unitPriceMinor: 1, snapshot: { input: snapInput } }, now);
check("I-04 a version made by the create workflow copies its exact SUBMITTED inputs (the snapshot), not its mirror fields: price 740.00 even though the mirror says 0.01; tax rule, payment terms kept; only the validity is replaced", si.lines[0].unitPrice === "740.00" && si.taxRuleId === "gst" && si.paymentType === "ADVANCE" && si.advancePercent === "30" && si.lines[0].id === "line-1" && si.validUntil === Q.defaultValidity(now));
check("I-05 inputFromDoc never reads the catalogue or the clock beyond the default validity (it is a pure copy)", JSON.stringify(V.inputFromDoc(legacy, now)) === JSON.stringify(V.inputFromDoc(legacy, now)));

// ---------- version views and comparison
const base = (o = {}) => ({ version: 1, status: "SENT", currency: "INR", unit: "Meter", quantity: 500, unitPriceMinor: 12000, productName: "Cotton poplin fabric", productKey: "1163", discount: null, tax: { label: "Test", bp: 0 }, charges: [{ label: "Freight", minor: 150000 }], moq: { quantity: 100, unit: "Meter" }, terms: { deliveryMinDays: 10, deliveryMaxDays: 10, incoterms: "EXW", paymentTerms: "30% advance, balance as agreed", deliveryLocation: "Jaipur", remarks: "Note A" }, productSnapshot: { description: "d", specs: [{ label: "GSM", value: "120" }], features: [] }, validUntil: new Date("2026-11-27T18:29:59.999Z"), ...o });
const view = (o) => C.buildVersionView(base(o));
const v1 = view();
check("V-01 a stored-field version shows amounts worked out from its OWN fields: subtotal 60000.00, freight 1500.00, total 61500.00, source 'stored'", v1.amounts.subtotal === "60000.00" && v1.amounts.charges === "1500.00" && v1.amounts.total === "61500.00" && v1.amountsSource === "stored");
const snap = { amounts: { subtotal: "60000.00", discount: "0.00", taxable: "60000.00", tax: "0.00", freight: "1500.00", otherCharges: "0.00", total: "61500.00" } };
const vs = C.buildVersionView(base({ unitPriceMinor: 99999, snapshot: snap }));
check("V-02 a submitted version shows its STORED snapshot amounts even if other fields changed later (never recalculated): total 61500.00, source 'snapshot'", vs.amounts.total === "61500.00" && vs.amounts.subtotal === "60000.00" && vs.amountsSource === "snapshot");
check("V-03 a legacy record whose amounts cannot be worked out is 'unavailable': no total, no invented value", C.buildVersionView(base({ quantity: 0 })).amounts === null && C.buildVersionView(base({ quantity: 0 })).amountsSource === "unavailable");
check("V-04 the stable line id comes from the snapshot input, else the single legacy line is 'line-1'", C.buildVersionView(base({ snapshot: { ...snap, input: { lines: [{ id: "item_7" }] } } })).lines[0].id === "item_7" && v1.lines[0].id === "line-1" && C.buildVersionView(base({ snapshot: { ...snap, input: { lines: [{ id: "bad id!" }] } } })).lines[0].id === "line-1");

const cmp = (a, b) => C.compareViews(a, b);
check("C-01 identical versions: no changes, identical true", (() => { const c = cmp(v1, view({ version: 2 })); return c.identical && c.changes.length === 0 && c.commercialChanges === 0; })());
const v2 = view({ version: 2, unitPriceMinor: 11000, charges: [{ label: "Freight", minor: 200000 }, { label: "Packing", minor: 5000 }], terms: { ...base().terms, deliveryMinDays: 8, deliveryMaxDays: 8, remarks: "Note B" }, validUntil: new Date("2026-12-10T18:29:59.999Z"), quantity: 600 });
const c2 = cmp(v1, v2);
const get = (key) => c2.changes.find((c) => c.key === key);
check("C-02 meaningful changes are found: unit price, quantity, freight changed, packing added, lead time, notes, validity, total", get("line-1:price")?.before === "120.00" && get("line-1:price")?.after === "110.00" && get("line-1:qty")?.before === "500 Meter" && get("line-1:qty")?.after === "600 Meter" && get("charge:Freight") && get("charge:Packing")?.kind === "added" && get("term:lead")?.after === "8 days" && get("notes")?.after === "Note B" && get("valid")?.after === "2026-12-10" && get("total"));
check("C-03 a numeric difference only for the SAME currency, signed: unit price -10.00, freight +500.00, packing added has no delta, total difference exact", get("line-1:price").delta === "-10.00" && get("charge:Freight").delta === "+500.00" && get("charge:Packing").delta === null && get("total").delta === "+" + (Number(v2.amounts.total.replace(".", "")) - 6150000 > 0 ? v2.amounts.total.replace(/\d+\.\d\d$/, (x) => x) && ((BigInt(v2.amounts.total.replace(".", "")) - BigInt(6150000)) / BigInt(100)).toString() + "." + String((BigInt(v2.amounts.total.replace(".", "")) - BigInt(6150000)) % BigInt(100)).padStart(2, "0") : "0.00"));
const vu = view({ version: 2, currency: "USD", unitPriceMinor: 1500 });
const cu = cmp(v1, vu);
check("C-04 a currency change is reported as its own change, and NO amount difference is computed across currencies (every delta is null)", cu.currencyChanged && cu.changes.some((c) => c.group === "Currency" && c.before === "INR" && c.after === "USD") && cu.changes.every((c) => c.delta === null));
const named = (id, name) => ({ ...v1, version: 2, lines: [{ ...v1.lines[0], id, name }] });
const byId = cmp(v1, named("line-1", "Renamed fabric"));
const byOtherId = cmp(v1, named("line-2", "Cotton poplin fabric"));
check("C-05 lines are matched by STABLE ID, not name or position: same id with a new name is a name change; a different id with the SAME name is a removed line plus an added line", byId.changes.some((c) => c.key === "line-1:name" && c.before === "Cotton poplin fabric" && c.after === "Renamed fabric") && !byId.changes.some((c) => c.kind === "removed") && byOtherId.changes.some((c) => c.kind === "removed" && c.key === "line:line-1") && byOtherId.changes.some((c) => c.kind === "added" && c.key === "line:line-2"));
const fmt = cmp(v1, { ...v1, version: 2, lines: [{ ...v1.lines[0], name: "  COTTON   poplin   fabric " }] });
check("C-06 a difference of only spacing or letter case is FORMATTING ONLY (commercial false) and is counted separately", fmt.changes.length === 1 && fmt.changes[0].commercial === false && fmt.formattingOnly === 1 && fmt.commercialChanges === 0);
const spec = cmp(v1, view({ version: 2, productSnapshot: { description: "d", specs: [{ label: "GSM", value: "130" }], features: [] } }));
check("C-07 a specification change is shown as a change of the specifications text with the before and after values", spec.changes.some((c) => c.key === "line-1:specs" && /120/.test(c.before) && /130/.test(c.after)));
check("C-08 added and removed attachments are listed by name", (() => { const c = cmp(view({ attachments: [{ name: "a.pdf" }] }), view({ version: 2, attachments: [{ name: "b.pdf" }] })); return c.changes.some((x) => x.kind === "removed" && /a\.pdf/.test(x.label)) && c.changes.some((x) => x.kind === "added" && /b\.pdf/.test(x.label)); })());
check("C-09 every change has text labels for before and after and a group, so meaning never depends on colour", c2.changes.every((c) => c.group && c.label && (c.before !== null || c.after !== null) && ["added", "removed", "changed"].includes(c.kind)));
const frozenA = deepFreeze(JSON.parse(JSON.stringify(v1)));
const frozenB = deepFreeze(JSON.parse(JSON.stringify(v2)));
let threw = false;
try { cmp(frozenA, frozenB); } catch { threw = true; }
check("C-10 comparing two deep-frozen versions does not throw: a comparison cannot mutate either version", !threw);
check("C-11 comparing a version with itself is identical; a draft and a submitted version compare like any two", cmp(v1, v1).identical && cmp(view({ status: "DRAFT" }), v1).changes.length === 0);
check("C-12 decimal text for a total with a large value is exact (BigInt), no float drift: 9007199254740.99 vs 9007199254741.00 differs by +0.01", (() => { const a = { ...v1, amounts: { ...v1.amounts, total: "9007199254740.99" } }; const b = { ...v1, version: 2, amounts: { ...v1.amounts, total: "9007199254741.00" } }; return cmp(a, b).changes.find((c) => c.key === "total")?.delta === "+0.01"; })());

// ---------- withdrawal body
const wd = (b) => W.parseWithdrawal(b);
check("W-01 the withdrawal names the version being looked at (a whole number, optional); a text, zero, fractional or huge version is refused", wd({ confirm: true, expectedVersion: 3 }).expectedVersion === 3 && wd({ confirm: true }).expectedVersion === null && ["3", 0, 1.5, 1e9, -1].every((v) => !wd({ confirm: true, expectedVersion: v }).ok));
check("W-02 still refused: no confirmation, a status, a buyer id, extra fields", !wd({ expectedVersion: 1 }).ok && !wd({ confirm: true, status: "ACCEPTED" }).ok && !wd({ confirm: true, buyerId: "x" }).ok);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
