// Automatic matching lead distribution: pure rules, the real catalogue signature index and STATIC structure checks (no database).
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/62-lead-matching-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const R = await import("../../../src/lib/leads/matchingRules.ts");
const C = await import("../../../src/lib/leads/catalogCandidates.ts");
const { getCatalog } = await import("../../../src/lib/catalog/data.ts");

const sig = (categoryId, name, colour) => R.signatureOf({ categoryId, name, colour });
check("names compare ignoring case, spacing and punctuation only", R.normaliseKey("  Cotton  Poplin-Fabric! ") === "cotton poplin fabric");
check("same category + same name + same colour is equivalent", R.isEquivalent(sig("c1", "Cotton Poplin", "Blue"), sig("c1", "cotton  poplin", "blue")));
check("same name in another category is NOT equivalent (category alone or name alone never matches)", !R.isEquivalent(sig("c1", "Cotton Poplin", "Blue"), sig("c2", "Cotton Poplin", "Blue")));
check("a name that merely contains the requested name is NOT equivalent (no substring matching)", !R.isEquivalent(sig("c1", "Cotton Poplin", ""), sig("c1", "Cotton Poplin Premium", "")));
check("a different colour is NOT equivalent when the request states a colour", !R.isEquivalent(sig("c1", "Cotton Poplin", "Blue"), sig("c1", "Cotton Poplin", "Red")));
check("the colour is not invented when the request states none", R.isEquivalent(sig("c1", "Cotton Poplin", ""), sig("c1", "Cotton Poplin", "Red")));
check("a candidate with missing evidence is never an exact match", !R.isEquivalent(sig("c1", "Cotton Poplin", "Blue"), R.signatureOf({ categoryId: "c1", name: "", colour: "Blue" })) && !R.isEquivalent(sig("c1", "x", ""), null));
check("a request without a category or name has no signature (nothing is broadcast)", R.signatureOf({ categoryId: "", name: "x" }) === null && R.signatureOf({ categoryId: "c", name: "!!!" }) === null);
check("backoff is bounded exponential", R.backoffMs(1) === 30000 && R.backoffMs(2) === 60000 && R.backoffMs(20) === 900000);
check("states: no candidates = no eligible matches, failures = partial, otherwise completed", R.finalState({ created: 0, candidates: 0, failedBatches: 0 }) === "NO_MATCHES" && R.finalState({ created: 3, candidates: 3, failedBatches: 0 }) === "COMPLETED" && R.finalState({ created: 1, candidates: 3, failedBatches: 1 }) === "PARTIAL");
check("a closed or cancelled inquiry is not open for distribution", !R.isOpenForDistribution("CANCELLED") && !R.isOpenForDistribution("CLOSED") && !R.isOpenForDistribution("REJECTED") && R.isOpenForDistribution("NEW") && R.isOpenForDistribution("new"));
check("the buyer-facing labels never promise a number of replies or completion before it is true", Object.values(R.DISTRIBUTION_LABEL).every((l) => !/will|guarantee|all suppliers/i.test(l)) && R.DISTRIBUTION_LABEL.PENDING === "Processing");
check("the mandatory-sharing notice has the required wording", R.SHARING_NOTICE === "Your requirement will also be shared with suppliers offering matching products.");

// ---- the real catalogue
const { products } = getCatalog();
let withMatches = 0, checked = 0;
for (const p of products.slice(0, 4000)) {
  const req = C.requirementOf(p.id);
  if (!req) continue;
  checked++;
  const cands = C.equivalentCandidates(req.signature, req.sellerKey);
  assert.ok(cands.every((c) => c.sellerKey !== req.sellerKey), "the direct seller is never a candidate");
  assert.equal(new Set(cands.map((c) => c.sellerKey)).size, cands.length, "one candidate per seller");
  for (const c of cands) {
    const cp = getCatalog().productById.get(Number(c.productKey));
    assert.equal(R.normaliseKey(cp.name), req.signature.nameKey, "candidate name equals requested name");
    assert.equal(`${cp.categoryName}|${cp.department}|${cp.productType}`, req.signature.categoryId, "candidate category equals requested category");
    if (req.signature.colourKey) assert.equal(R.normaliseKey(cp.colour), req.signature.colourKey);
  }
  assert.deepEqual(cands, [...cands].sort((a, b) => (a.sellerKey < b.sellerKey ? -1 : 1)), "deterministic order");
  if (cands.length) withMatches++;
}
check(`catalogue: ${checked} requests checked, every candidate is exact (same category, name, colour), unique per seller, never the direct seller`, checked > 1000);
check(`catalogue: equivalence really exists in the data (${withMatches} of ${checked} requests have at least one other seller)`, withMatches > 0);

// ---- static structure
const svc = read("src/lib/inquiries/service.ts");
const dist = read("src/lib/leads/distribution.ts");
const acc = read("src/lib/leads/access.ts");
const route = read("src/app/api/internal/distribution/route.ts");
const form = read("src/components/inquiry/InquiryWorkspace/InquiryWorkspace.tsx");
check("the inquiry and its job commit in ONE transaction", /insertOne\(doc, \{ session \}\)[\s\S]{0,80}insertJob\(job, session\)/.test(svc));
check("only registered buyers' catalogue product inquiries get a job (no guest fan-out)", /!inquiry\.buyerId \|\| !inquiry\.productKey/.test(dist));
check("a recipient is unique per inquiry + company and a job is unique per inquiry", /inquiryId: 1, companyId: 1 \}, \{ unique: true/.test(dist) && /inquiryId: 1 \}, \{ unique: true, name: "job_inquiry"/.test(dist));
check("a job is claimed by an atomic conditional lease and expired leases are recoverable", /findOneAndUpdate/.test(dist) && /leaseUntil: \{ \$lt: now \}/.test(dist) && /attempts: \{ \$lt: MAX_ATTEMPTS \}/.test(dist));
check("each recipient commit re-checks that the inquiry is open and the company is active and owns the seller", /isOpenForDistribution\(inquiry\.status\)/.test(dist) && /status: "ACTIVE" as const, sellerKeys: c\.sellerKey/.test(dist) && /isCompanyKey\(c\.sellerKey\)/.test(dist));
check("the candidate list is frozen once (the matching cutoff) and the direct supplier's company is excluded", /if \(!job\.frozen\)/.test(dist) && /seen = new Set<string>\(direct/.test(dist));
check("the notice is a separate durable step (PENDING on the recipient, delivered after commit, swept by the worker) and preferences only suppress the notice", /notice: \{ state: "PENDING"/.test(dist) && /SKIPPED_PREFERENCE/.test(dist) && /"notice\.state": "PENDING"/.test(dist));
check("the worker route fails closed without a secret and compares in constant time", /DISTRIBUTION_WORKER_SECRET/.test(route) && /status: 503/.test(route) && /timingSafeEqual/.test(route));
check("the form shows the mandatory notice with no checkbox and the submit wording is Send Requirement", /SHARING_NOTICE/.test(form) && /Send Requirement/.test(form) && !/matchingConsent|shareWithOthers|optOut/i.test(form));
check("a MATCHED view hides the selected supplier, the shared history and guest fields, and carries the recipient's own key", /matchedSupplierKeys: _m, idempotencyKey: _i, statusHistory: _h, guest: _g, supplierSlug: _s/.test(acc) && /supplierKey: r\.recipientSupplierKey/.test(acc));
for (const f of ["quoteService", "inquiryService", "quotationService", "quotationVersions", "orderService"]) check(`${f} reads inquiries only through findInquiryFor`, /findInquiryFor/.test(read(`src/lib/supplier/${f}.ts`)) && !/inquiriesCollection\(\)\)\.findOne\(\{[^}]*supplierKey: \{ \$in: keys/.test(read(`src/lib/supplier/${f}.ts`)));
check("a matched supplier's reply or quotation moves ITS OWN status, not the shared inquiry", /recipients\.updateOne\(\{ inquiryId: inquiry\._id, companyId: context\.companyId/.test(acc));
console.log(`\n${passed} passed, 0 failed`);
