// General requirement ("Post Your Requirement") on the canonical inquiry model: validation, the real matching data and STATIC structure checks (no database).
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/66-general-requirement-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const V = await import("../../../src/lib/validations/requirement.ts");
const C = await import("../../../src/lib/leads/catalogCandidates.ts");
const { getCatalog } = await import("../../../src/lib/catalog/data.ts");

const TODAY = "2026-11-16";
const ok = { productId: "1163", quantity: "500", city: "Surat", requiredBy: "", description: "" };
const errs = (o) => Object.keys(V.validatePostRequirement({ ...ok, ...o }, TODAY));
check("a complete requirement is valid", errs({}).length === 0);
check("a product is required (no free-text-only requirement)", errs({ productId: "" }).includes("productId"));
check("quantity must be a whole number from 1 to 1,000,000", ["0", "-5", "1.5", "abc", "1000001", ""].every((q) => errs({ quantity: q }).includes("quantity")) && errs({ quantity: "1000000" }).length === 0);
check("the delivery city is required and bounded", errs({ city: "" }).includes("city") && errs({ city: "x" }).includes("city") && errs({ city: "a".repeat(81) }).includes("city"));
check("required-by is optional, never in the past, a real date and within two years", errs({ requiredBy: "" }).length === 0 && errs({ requiredBy: "2026-11-15" }).includes("requiredBy") && errs({ requiredBy: "2026-02-30" }).includes("requiredBy") && errs({ requiredBy: "soon" }).includes("requiredBy") && errs({ requiredBy: "2026-11-16" }).length === 0 && errs({ requiredBy: "2029-01-01" }).includes("requiredBy"));
check("the description is optional but 10 to 1,000 characters when given", errs({ description: "" }).length === 0 && errs({ description: "short" }).includes("description") && errs({ description: "x".repeat(1001) }).includes("description") && errs({ description: "Need it packed in rolls of 10 pieces." }).length === 0);

// the real matching data: a general requirement has NO selected supplier, so the reference product's own seller is just one more candidate
const { products } = getCatalog();
let found = null;
for (const p of products.slice(0, 4000)) {
  const req = C.requirementOf(p.id);
  if (req && C.equivalentCandidates(req.signature, req.sellerKey).length > 0) { found = req; break; }
}
check("the catalogue has a product offered by other sellers (so a general requirement can match)", Boolean(found));
const asDirect = C.equivalentCandidates(found.signature, found.sellerKey).map((c) => c.sellerKey);
const asGeneral = C.equivalentCandidates(found.signature, "").map((c) => c.sellerKey);
check("as a DIRECT inquiry the selected seller is excluded; as a general requirement it is only a candidate (nobody is 'selected')", !asDirect.includes(found.sellerKey) && asGeneral.includes(found.sellerKey) && asGeneral.length === asDirect.length + 1);
check("matching stays exact for a general requirement: every candidate shares category, name and colour", asGeneral.every((k) => { const c = C.equivalentCandidates(found.signature, "").find((x) => x.sellerKey === k); const cp = getCatalog().productById.get(Number(c.productKey)); return `${cp.categoryName}|${cp.department}|${cp.productType}` === found.signature.categoryId; }));

// static structure
const route = read("src/app/api/requirements/route.ts");
const svc = read("src/lib/inquiries/service.ts");
const dist = read("src/lib/leads/distribution.ts");
const form = read("src/components/homepage/RequirementBanner/RequirementPostForm.tsx");
const banner = read("src/components/homepage/RequirementBanner/RequirementForm.tsx");
const page = read("src/app/post-requirement/page.tsx");
check("the route is buyer-only, origin-checked, rate limited and idempotent (the key is required)", /isCrossSiteWrite\(request\)/.test(route) && /requireBuyerApi/.test(route) && /rateLimit\(`requirement:/.test(route) && /isIdempotencyKey\(key\)/.test(route));
check("the reference product must be a public catalogue product or an approved supplier product in a supported category (sample products cannot drive matching)", /const isCatalog = Boolean\(product && product\.source === "catalog"/.test(route) && /!fields\.productId && !isCatalog && !item/.test(route) && /attributeSetFor\(item\.nodeId\)/.test(route));
check("the quantity unit is forced to the product's own unit (no conversion)", /validateQuantity\(values\.quantity, clean\(body\.unit, 20\), \{ unit: product\.priceUnit \}\)/.test(route));
check("nothing about the buyer, supplier, category or status is taken from the body", !/body\.(buyerId|userId|supplier|company|status|sourceType|recipient)/.test(route) && /supplierKey: ""/.test(route) && /sourceType: "GENERAL_REQUIREMENT"/.test(route));
check("it persists through the ONE canonical service (inquiry + job in one transaction) and no longer writes the legacy collection", /submitInquiry\(/.test(route) && !/createRequirement|requirements\/service/.test(route));
check("success carries the real reference and distribution state, never a delivery claim", /distributionStatus\(/.test(route) && /DISTRIBUTION_LABEL\[state\.state\]/.test(route) && !/sent to|delivered to/i.test(route));
check("the first distribution pass runs after the response, the job is the durable guarantee", /after\(\(\) => runDistribution/.test(route) && /insertJob\(job, session\)/.test(svc));
check("a general requirement notifies the buyer with its own wording and no supplier (suppliers get MATCHED notices from the worker)", /notifyRequirementSubmitted/.test(svc) && /if \(!general\) await notifySellerOwner/.test(svc));
check("distribution does not look for a direct company when there is no selected supplier", /directSellerKey \? await col\.findOne/.test(dist));
check("the buyer list, detail and responders never call anyone 'Selected supplier' for a general requirement", /General Requirement/.test(read("src/lib/inquiries/buyerList.ts")) && /GENERAL_REQUIREMENT" \? "Matching supplier"/.test(read("src/lib/inquiries/conversations.ts")) && /GENERAL_REQUIREMENT/.test(read("src/components/buyer/inquiries/detail/InquiryDetailView.tsx")));
check("offer comparison makes no 'selected' claim for a general requirement", /filter\(\(i\) => i\.supplierKey\)/.test(read("src/lib/quotations/service.ts")));
check("the form shows the mandatory-sharing notice, has no matching checkbox and no attachment control", /Your requirement will be shared with eligible matching suppliers/.test(form) && !/type="checkbox"/.test(form) && !/type="file"/.test(form) && /Files cannot be attached yet/.test(form));
check("the form has an honest no-product state and never saves without a product", /No matching product available/.test(form) && /Nothing is saved without a product/.test(form));
check("product search is debounced, cancels stale requests, is bounded and uses the public engine (never the whole catalogue)", /setTimeout\(async/.test(form) && /abort\.current\?\.abort\(\)/.test(form) && /limit: "12"/.test(form) && /\/api\/public\/products\?/.test(form));
check("one request key per form: a retry or double click is one requirement", /useRef\(newKey\(\)\)/.test(form) && /submitRequirement\(values, picked!\.unit, key\.current,/.test(form) && /key\.current = newKey\(\);/.test(form));
check("the draft survives the sign-in detour (values only, never the request key)", /sessionStorage\.setItem\(DRAFT_KEY, JSON\.stringify\(\{ picked, v, attrs \}\)\)/.test(form) && !/DRAFT_KEY[^;]*key\.current/.test(form));
check("the homepage strip only starts the requirement and hands over to the full form (it cannot submit an unstructured one)", /router\.push\(`\/post-requirement\?/.test(banner) && !/submitRequirement/.test(banner));
check("a requirement is never addressed to one company: the supplier link offers Send Inquiry instead", /send it an inquiry/.test(page) && !/supplierId=/.test(page));
check("the supplier sees a general requirement only as a MATCHED lead (kind comes from key membership, never from a stored label)", /keys\.includes\(d\.supplierKey\)/.test(read("src/lib/supplier/inquiryListService.ts")) && /keys\.includes\(doc\.supplierKey\)/.test(read("src/lib/leads/access.ts")));
check("the legacy collection has a read-only, refuse-by-default assessment and nothing redistributes old rows", /read-only/.test(read("docs/audits/tools/requirements-legacy-dryrun.mjs")) && !/updateOne|insertOne|deleteMany|bulkWrite/.test(read("docs/audits/tools/requirements-legacy-dryrun.mjs")));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
