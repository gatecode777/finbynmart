// Database-FREE preflight for the four integration suites: imports every module they import (catches import-time errors and circular-import
// problems), checks their syntax, and states whether the isolated-database prerequisites are present. It connects to nothing and writes nothing.
//   node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-preflight.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
process.env.AUTH_SECRET ??= "preflight-secret-preflight-secret";
const root = path.resolve(import.meta.dirname, "../../..");
let failed = 0;
const step = (name, ok, detail = "") => { console.log(`${ok ? "PASS " : "FAIL "} ${name}${detail ? ` - ${detail}` : ""}`); if (!ok) failed++; };
const suites = ["it-supplier-flows", "it-lead-distribution", "it-approved-flow", "it-conversation-flow", "it-requirement-flow", "it-specifications-flow", "it-admin-products", "it-admin-inquiries", "it-admin-suppliers", "it-admin-verification", "it-admin-categories", "it-recently-viewed", "it-admin-buyers", "it-admin-quotations", "it-admin-notifications", "it-admin-reports", "it-admin-settings", "it-admin-audit-logs"];
for (const s of suites) {
  try { execFileSync(process.execPath, ["--check", path.join(root, "docs/page-reports/tools", `${s}.mjs`)], { stdio: "pipe" }); step(`${s}.mjs syntax`, true); } catch (e) { step(`${s}.mjs syntax`, false, String(e.stderr).slice(0, 200)); }
}
const modules = [
  "lib/admin/sellerMapping", "lib/orders/orderConfirmation", "lib/catalog/productRef", "lib/catalog/data",
  "lib/inquiries/service", "lib/leads/distribution", "lib/leads/access", "lib/leads/catalogCandidates", "lib/supplier/company", "lib/supplier/inquiryService",
  "lib/catalog/approvedProducts", "lib/admin/productManagement", "lib/admin/inquiryOps", "lib/admin/supplierManagement", "lib/admin/categoryManagement", "lib/verification/service", "lib/verification/identity", "lib/supplier/companyEligibility", "lib/admin/inquiryService", "lib/admin/productList", "lib/catalog/attributes", "lib/admin/productReview", "lib/inquiries/buyerList", "lib/validations/requirement", "lib/catalog/approvedStore", "lib/catalog/productDetail", "lib/catalog/supplierDetail", "lib/catalog/categoryListing",
  "lib/supplier/inquiryListService", "lib/inquiries/conversations", "lib/inquiries/messages", "lib/quotations/service", "lib/supplier/quoteService", "lib/supplier/quotationVersions", "lib/supplier/quotationService", "lib/admin/productReview",
];
for (const m of modules) {
  try { await import(`../../../src/${m}.ts`); step(`import ${m}`, true); } catch (e) { step(`import ${m}`, false, String(e.message).split("\n")[0].slice(0, 200)); }
}
const need = { FINBYN_TEST_MODE: process.env.FINBYN_TEST_MODE === "1", TEST_MONGODB_URI: Boolean(process.env.TEST_MONGODB_URI), TEST_MONGODB_DB: Boolean(process.env.TEST_MONGODB_DB), TEST_DB_CONFIRM: Boolean(process.env.TEST_DB_CONFIRM) };
console.log("\nisolated-database prerequisites (names only, no values):", JSON.stringify(need));
const ready = Object.values(need).every(Boolean);
console.log(ready ? "READY: run the suites." : "BLOCKED: the integration suites cannot run until the four variables above are set for a transaction-capable test database (docs/testing/TEST_ENVIRONMENT.md).");
console.log(failed ? `\n${failed} preflight check(s) FAILED` : "\npreflight checks passed (this proves the suites load, not that they pass)");
process.exit(failed ? 1 : 0);
