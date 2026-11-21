// Structured specifications + attribute matching (policy match-2) + bounded search limiter: pure rules, the real candidate repository on a filled snapshot, a runtime check
// of the bounded limiter against an UNREACHABLE database (nothing is read or written) and STATIC structure checks. No database.
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/67-specifications-matching-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
process.env.MONGODB_URI = "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=800"; // unreachable on purpose
process.env.MONGODB_DB = "finbyn_unused";
process.env.FINBYN_APPROVED_CACHE_MS = "86400000";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const { ObjectId } = await import("mongodb");
const A = await import("../../../src/lib/catalog/attributes.ts");
const S = await import("../../../src/lib/catalog/approvedStore.ts");
const C = await import("../../../src/lib/leads/catalogCandidates.ts");
const D = await import("../../../src/lib/leads/distribution.ts");
const R = await import("../../../src/lib/leads/matchingRules.ts");
const RL = await import("../../../src/lib/security/rateLimit.ts");

const NODE = "apparel-fashion";
const cell = (value, unit) => ({ value, ...(unit ? { unit } : {}) });
const okAttrs = { type: cell("fabric"), composition: cell("cotton"), colour: cell("Navy Blue"), gsm: cell("140"), width: cell("44", "inch") };

// ---- validation
const v = (raw, req = true, node = NODE) => A.validateAttributes(node, raw, { requireRequired: req });
check("a valid textile attribute set is accepted and typed", (() => { const r = v(okAttrs); return r.ok && r.value.gsm.value === 140 && r.value.width.unit === "inch" && r.value.composition.value === "cotton"; })());
check("required attributes are enforced for submission (type, composition, colour) but optional ones stay optional", !v({}).ok && Object.keys(v({}).errors).sort().join() === "colour,composition,type" && v({ type: cell("fabric"), composition: cell("cotton"), colour: cell("Red") }).ok);
check("an empty cell means 'not given': nothing is defaulted or invented", (() => { const r = v({ ...okAttrs, gsm: cell(""), width: cell("") }); return r.ok && r.value.gsm === undefined && r.value.width === undefined; })());
check("unknown (hidden) attributes are refused", !v({ ...okAttrs, secret: cell("x") }).ok && v({ ...okAttrs, secret: cell("x") }).errors.secret);
check("enumerations accept only listed values", !v({ ...okAttrs, composition: cell("unobtainium") }).ok);
check("numbers: bounds, decimals and plain format are enforced", !v({ ...okAttrs, gsm: cell("5") }).ok && !v({ ...okAttrs, gsm: cell("1500") }).ok && !v({ ...okAttrs, gsm: cell("140.5") }).ok && !v({ ...okAttrs, gsm: cell("1e3") }).ok && !v({ ...okAttrs, gsm: cell("-3") }).ok);
check("width bounds are checked in the base unit after a defined conversion (500 inch is too wide, 44 inch is fine)", !v({ ...okAttrs, width: cell("500", "inch") }).ok && v({ ...okAttrs, width: cell("44", "inch") }).ok && !v({ ...okAttrs, width: cell("44", "yard") }).ok);
check("a unit must be chosen where several exist", !v({ ...okAttrs, width: cell("44") }).ok);
check("text attributes are bounded and start with a letter", !v({ ...okAttrs, colour: cell("7") }).ok && !v({ ...okAttrs, colour: cell("<b>") }).ok && v({ ...okAttrs, colour: cell("Sky blue") }).ok);
check("a category with no attribute set carries no attributes", A.attributeSetFor("industrial-machinery") === null && v({}, true, "industrial-machinery").ok && !v({ gsm: cell("100") }, true, "industrial-machinery").ok);
check("subcategory nodes inherit their main category's set", A.attributeSetFor("apparel-fashion/men/men-tshirts")?.id === "textile");

// ---- matching semantics
const req = v(okAttrs).value;
const cand = (over) => ({ ...req, ...over });
const m = (c, r = req) => A.attributesMatch(NODE, r, c);
check("identical attributes match", m(cand({})));
check("same product type and colour but a different composition does NOT match", !m(cand({ composition: cell("polyester") })));
check("GSM within the 10% tolerance matches; outside it does not", m(cand({ gsm: cell(150) })) && m(cand({ gsm: cell(126) })) && !m(cand({ gsm: cell(160) })) && !m(cand({ gsm: cell(120) })));
check("width compares through the defined cm/inch factor: 44 inch equals 111.8 cm; 100 cm is not within 3%", m(cand({ width: cell(111.8, "cm") })) && !m(cand({ width: cell(100, "cm") })));
check("a candidate missing an attribute the requirement states is NOT a match", (() => { const c = { ...req }; delete c.gsm; return !m(c); })());
check("attributes the requirement leaves out are not required of the candidate", (() => { const loose = { type: cell("fabric"), composition: cell("cotton"), colour: cell("Navy Blue") }; return A.attributesMatch(NODE, loose, req); })());
check("a different colour does not match, normalised spelling does", !m(cand({ colour: cell("Red") })) && m(cand({ colour: cell("navy  blue") })));
check("'other' enumerations and product type 'other' never match, not even each other", (() => { const r2 = { ...req, composition: cell("other") }; const r3 = { ...req, type: cell("other") }; return !A.attributesMatch(NODE, r2, r2) && !A.attributesMatch(NODE, r3, r3); })());
check("an empty requirement or an unsupported category never matches", !A.attributesMatch(NODE, {}, req) && !A.attributesMatch("industrial-machinery", req, req));
check("an unknown unit is never compared", !m(cand({ width: cell(111.8, "yard") })));

// ---- the candidate repository on a snapshot (no database)
const H = (c) => c.repeat(24);
const item = (n, company, attributes, over = {}) => ({ id: `sp-${n.toString(16).padStart(24, "0")}`, slug: `p-${n}`, name: `Fabric ${n}`, description: null, nodeId: NODE, categoryName: "Apparel & Fashion", main: "apparel-fashion", sub: "apparel-fashion", images: [], attributes, specs: A.displayAttributes(NODE, attributes), pricing: { mode: "FIXED", min: 100, unit: "Metre" }, moq: null, supplier: { key: `co:${H(company)}`, slug: `c-${H(company)}`, name: `Co ${company}`, city: "Surat", companyId: H(company), since: null, description: null }, approvedAt: new Date().toISOString(), ...over });
S.setApproved([
  item(1, "a", req),
  item(2, "b", cand({ gsm: cell(145) })),
  item(3, "b", cand({ gsm: cell(138) })), // second matching product of company b: ONE lead
  item(4, "c", cand({ composition: cell("polyester") })), // same type/colour, other composition
  item(5, "d", (() => { const x = { ...req }; delete x.gsm; return x; })()), // missing a stated attribute
  item(6, "e", cand({ type: cell("shirt") })),
  item(7, "f", req, { nodeId: "home-lifestyle", main: "home-lifestyle" }),
]);
const found = C.supplierCandidates({ nodeId: NODE, attributes: req });
check("compatible products match; one company with several matching products yields ONE candidate", found.map((x) => x.companyId).join() === [H("a"), H("b")].join() && found.length === 2);
check("incompatible composition, missing attribute, other type and other category are excluded", !found.some((x) => [H("c"), H("d"), H("e"), H("f")].includes(x.companyId)));
check("the company's lowest product id is the recorded matching product (deterministic)", found.find((x) => x.companyId === H("b")).productKey === item(2, "b", {}).id);
check("the selected supplier's company is excluded from a direct inquiry's matches", !C.supplierCandidates({ nodeId: NODE, attributes: req }, H("a")).some((x) => x.companyId === H("a")));
check("approved supplier products and catalogue listings never match each other (no canonical mapping exists)", C.supplierCandidates({ nodeId: NODE, attributes: { type: cell("t-shirt"), composition: cell("cotton"), colour: cell("Grey") } }).length === 0);

// ---- display
check("a product card shows at most three genuine attributes in priority order", (() => { const card = S.toApprovedCard(item(9, "a", req)); return card.attributes.length === 3 && card.attributes.map((x) => x.label).join() === "Composition,Weight (GSM),Width"; })());
check("unknown attribute ids are never displayed and a product without attributes shows none", A.displayAttributes(NODE, { bogus: cell("x") }).length === 0 && S.toApprovedCard(item(10, "a", {})).attributes === undefined);

// ---- the job (policy versions)
const base = { _id: new ObjectId(), reference: "FBM-INQ-AAAAAAAA", buyerId: new ObjectId() };
const jSupplier = D.buildJob({ ...base, productKey: item(1, "a", {}).id, supplierKey: "" }, new Date());
check("an approved supplier product creates a SUPPLIER_ATTRIBUTES job under the current policy", jSupplier && jSupplier.policyVersion === "match-2" && jSupplier.requirement.kind === "SUPPLIER_ATTRIBUTES" && jSupplier.requirement.nodeId === NODE);
const jChanged = D.buildJob({ ...base, productKey: item(1, "a", {}).id, supplierKey: "", requirement: { nodeId: NODE, attributes: cand({ gsm: cell(200) }) } }, new Date());
check("the buyer's changed value becomes the matching criterion (not the product's own)", jChanged.requirement.attributes.gsm.value === 200);
check("an invalid or incomplete requirement snapshot creates no job (never a loose match)", D.buildJob({ ...base, productKey: item(1, "a", {}).id, supplierKey: "", requirement: { nodeId: NODE, attributes: { gsm: cell(200) } } }, new Date()) === null && D.buildJob({ ...base, productKey: "sp-" + "9".repeat(24), supplierKey: "" }, new Date()) === null);
check("an unsupported category creates no job", (() => { S.setApproved([item(20, "a", {}, { nodeId: "home-lifestyle", main: "home-lifestyle" })]); return D.buildJob({ ...base, productKey: item(20, "a", {}).id, supplierKey: "" }, new Date()) === null; })());
const jCatalogue = D.buildJob({ ...base, productKey: "1163", supplierKey: "" }, new Date());
check("a catalogue product keeps the exact catalogue rule under match-2", jCatalogue.requirement.kind === "CATALOGUE_EXACT" && Boolean(jCatalogue.requirement.signature) && jCatalogue.policyVersion === R.MATCHING_POLICY_VERSION);
check("historical jobs keep their policy: match-1 is known, a job without a kind is processed as the catalogue rule and nothing rewrites policyVersion", R.LEGACY_POLICY_VERSIONS.includes("match-1") && /job\.requirement\.signature!/.test(read("src/lib/leads/distribution.ts")) && !/policyVersion: MATCHING_POLICY_VERSION[^}]*\$set|\$set[^}]*policyVersion/.test(read("src/lib/leads/distribution.ts")));

// ---- the bounded limiter (runtime, unreachable database)
const t0 = performance.now();
const first = await RL.boundedRateLimit("t:search", 40, 60, 800);
const firstMs = performance.now() - t0;
const t1 = performance.now();
const second = await RL.boundedRateLimit("t:search", 40, 60, 800);
const secondMs = performance.now() - t1;
check(`with the database down the limiter answers within its deadline (${Math.round(firstMs)} ms), degraded, not failed open`, firstMs < 2500 && first.degraded === true && first.ok === true);
check(`later requests are not delayed at all (${Math.round(secondMs)} ms)`, secondMs < 50 && second.degraded === true);
let blocked = 0;
for (let i = 0; i < 40; i++) if (!(await RL.boundedRateLimit("t:flood", 40, 60, 800)).ok) blocked++;
check("the degraded policy still blocks abuse: a quarter of the normal limit (at least 10) per window and instance", blocked === 40 - 10);

// ---- static structure
const draft = read("src/lib/supplier/productDraftService.ts");
const review = read("src/lib/admin/productReview.ts");
const loader = read("src/lib/catalog/approvedProducts.ts");
const route = read("src/app/api/requirements/route.ts");
check("attributes persist draft -> submitted snapshot (copied from the draft) -> approved snapshot (copied from the review snapshot)", /"draft\.attributes": f\.draft\.attributes/.test(draft) && /attributes: cur\.draft\.attributes \?\? \{\}/.test(draft) && /snapshot: cur\.draft!\.review!\.snapshot/.test(review));
check("editing a draft never touches the live publication (pending edits stay private)", !/publication/.test(draft));
check("the admin sees the exact submitted specifications and approval re-validates them", /specifications: displayAttributes\(String\(s\.categoryId/.test(review) && /validateAttributes\(String\(snap\.categoryId/.test(review));
check("the public loader re-validates specifications from the approved snapshot only, dropping an invalid set whole", /validateAttributes\(node!\.id, s\.attributes/.test(loader) && /attributes-invalid/.test(loader));
check("server-side validation covers category relationship, types and required fields on save and on submit", /validateAttributes\(input\.categoryId, input\.attributes/.test(draft) && /requireRequired: true/.test(read("src/lib/supplier/productDraftRules.ts")));
check("only the chosen category's set is accepted from the browser: the body is read through an allow-list of plain cells", /function readAttributes/.test(draft) && /\^\[a-z\]\[a-z0-9_-\]\{0,19\}\$/.test(draft));
check("the requirement route validates buyer-changed attributes against the category and stores the authoritative snapshot", /validateAttributes\(item\.nodeId, merged/.test(route) && /requirement = \{ nodeId: item\.nodeId/.test(route) && /\.\.\.\(requirement \? \{ requirement \} : \{\}\)/.test(route));
check("the recipient recheck covers a company's own supplier key and that the product is still public", /isCompanyKey\(c\.sellerKey\)/.test(read("src/lib/leads/distribution.ts")) && /isProductPublicNow\(c\.productKey, session\)/.test(read("src/lib/leads/distribution.ts")));
check("an empty supplier key can never be an owned identity (filtered in the company context) and a general requirement is never DIRECT", /k\.length > 0/.test(read("src/lib/supplier/company.ts")) && /keys\.includes\(doc\.supplierKey\)/.test(read("src/lib/leads/access.ts")));
check("the public search uses the bounded limiter and the approved wait is bounded", /boundedRateLimit/.test(read("src/app/api/public/products/route.ts")) && /APPROVED_WAIT_MS = 1500/.test(loader));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
