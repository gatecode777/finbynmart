// Product moderation: pure rules + STATIC structure checks (no database).
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/60-product-moderation-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const R = await import("../../../src/lib/supplier/productDraftRules.ts");

check("a submitted-then-approved product in an active category is publicly eligible", R.isPubliclyEligible("APPROVED", true) === true);
check("an approved product in an INACTIVE category is not public (activation stays admin-controlled)", R.isPubliclyEligible("APPROVED", false) === false);
check("pending, rejected and never-submitted products are never public", [undefined, "PENDING", "REJECTED", ""].every((s) => R.isPubliclyEligible(s, true) === false));
check("every rejection reason has a code and safe supplier-facing text", R.REJECTION_REASONS.length >= 4 && R.REJECTION_REASONS.every((r) => r.code && r.text.length > 20));
check("reasonText only resolves known codes (a free-text reason cannot be shown to a supplier)", R.reasonText("IMAGES_UNSUITABLE") !== null && R.reasonText("anything the reviewer typed") === null);
const empty = R.reviewDraft({ ...R.EMPTY_DRAFT }, false, 0);
check("an empty draft cannot be submitted; a complete one can; nothing is ever publishable by the supplier", empty.canSubmit === false && empty.canPublish === false);
const full = R.reviewDraft({ ...R.EMPTY_DRAFT, name: "A", description: "d", pricingMode: "ON_REQUEST", moq: "5", quantityUnit: "kg" }, true, 1);
check("a complete draft with a category and an image can be submitted", full.canSubmit === true && full.canPublish === false);

const svc = read("src/lib/supplier/productDraftService.ts");
check("submitting re-validates on the server and snapshots the exact revision", /submitForReview/.test(svc) && /validate\(view\.input\)/.test(svc) && /snapshot = \{/.test(svc));
check("submitting is one conditional update on the exact revision", /"draft\.revision": expectedRevision, "draft\.review\.state": \{ \$ne: "PENDING" \}/.test(svc));
check("editing and image changes are refused while a revision is under review", (svc.match(/"draft\.review\.state": \{ \$ne: "PENDING" \}/g) ?? []).length >= 4);
check("the supplier DTO never carries the internal reviewer note", !/internalNote/.test(svc));

const adm = read("src/lib/admin/productReview.ts");
check("a decision is one transaction with a conditional update on state and exact revision plus an audit row", /withTransaction/.test(adm) && /"draft\.review\.submittedRevision": input\.expectedRevision/.test(adm) && /admin_audit_log/.test(adm));
check("approving needs the category to still be active and never changes category activation", /getManagementCategories\(\)\.some\(\(n\) => n\.id === cur\.draft!\.categoryId\)/.test(adm) && !/isActive\s*=/.test(adm));
check("rejection needs a code from the fixed list; the internal note is stored privately", /REJECTION_REASONS\.some/.test(adm) && /internalNote: note|\["draft\.review\.internalNote"\] = note/.test(adm));
check("a reviewer cannot decide their own submission", /submittedBy\.equals\(adminId\)/.test(adm));
check("approval stores the approved snapshot as the public content", /snapshot: cur\.draft!\.review!\.snapshot/.test(adm));
check("approval does not touch company verification", !/verificationStatus/.test(adm));

const sup = read("src/app/api/supplier/products/drafts/[reference]/review/route.ts");
check("the supplier route can only submit or withdraw (no approve path)", /action must be submit or withdraw/.test(sup) && !/APPROVE|publication/.test(sup));
check("the admin routes require the separate products.review capability", (read("src/app/api/admin/product-review/route.ts") + read("src/app/api/admin/product-review/[reference]/route.ts")).match(/requireAdminApi\("products\.review"\)/g).length === 3);
check("public reads use the approved snapshot, not the draft", /publication!\.snapshot/.test(read("src/lib/catalog/supplierPublished.ts")) && !/draft\./.test(read("src/lib/catalog/supplierPublished.ts").replace(/\/\*[\s\S]*?\*\//g, "")));
console.log(`\n${passed} passed, 0 failed`);
