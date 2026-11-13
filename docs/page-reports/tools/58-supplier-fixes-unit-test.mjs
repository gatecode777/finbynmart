// Supplier audit fixes: pure-rule checks plus STATIC regression checks on the source (no database, no server).
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/58-supplier-fixes-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };

// S-01 / S-02 / M-07: the self-verification endpoints and the second security implementation are gone
check("verify-email and verify-phone supplier routes no longer exist", !exists("src/app/api/supplier/security/verify-email/route.ts") && !exists("src/app/api/supplier/security/verify-phone/route.ts"));
check("the old supplierSecurityService and panel are removed", !exists("src/lib/supplier/securityService.ts") && !exists("src/components/supplier/profile/SupplierSecurityPanel.tsx"));
const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const src = walk("src").filter((f) => /\.(ts|tsx)$/.test(f));
check("nothing in src can set emailVerified without a token (only the token and reset-link paths write it)", src.filter((f) => /emailVerified:\s*true/.test(read(f))).every((f) => /auth\/(users|passwordReset)\.ts$/.test(f.split(path.sep).join("/"))));
check("nothing accepts a demo OTP", !src.some((f) => /demo\/testing code|any 6-digit code|otp\s*===?\s*["']123456["']/i.test(read(f))));
check("the genuine paths record provenance", /emailVerifiedVia: "token"/.test(read("src/lib/auth/users.ts")) && /emailVerifiedVia: "reset-link"/.test(read("src/lib/auth/passwordReset.ts")));

// D-04: the legacy create route
const pr = read("src/app/api/supplier/products/route.ts");
check("POST /api/supplier/products answers 405 and creates nothing", /status: 405/.test(pr) && !/createSupplierProduct/.test(pr) && !/stock/.test(pr.replace(/\/\*[\s\S]*?\*\//g, "")));
check("createSupplierProduct no longer exists", !src.some((f) => /createSupplierProduct/.test(read(f))));
check("catalogue products are no longer given an invented stock of 50", !/stock:\s*50/.test(read("src/lib/supplier/productService.ts")));

// M-03 / M-04: every supplier write route has the origin check (directly or through readWrite / the shared guard)
const writeRoutes = walk("src/app/api/supplier").filter((f) => f.endsWith("route.ts") && /export (async function|const) (POST|PATCH|DELETE|PUT)|async function handle(POST|PATCH|DELETE)/.test(read(f)));
const unguarded = writeRoutes.filter((f) => { const t = read(f); return !/isCrossSiteWrite|readWrite\(|gate\(/.test(t) && !/status: 405/.test(t); });
check(`all ${writeRoutes.length} supplier write routes enforce the origin check (unguarded: ${unguarded.join(", ") || "none"})`, unguarded.length === 0);
check("notification read routes are rate limited", /rateLimit/.test(read("src/app/api/supplier/notifications/read-all/route.ts")) && /rateLimit/.test(read("src/app/api/supplier/notifications/[id]/read/route.ts")));

// D-01: the mapping rules and the database-level exclusivity
const M = await import("../../../src/lib/admin/mappingRules.ts");
const good = { companyId: "a".repeat(24), sellerKey: "s-1", reason: "Ticket FBM-SUP-202611-ABC123 and trade licence", acknowledgeHistory: true };
check("a complete link request is valid", Object.keys(M.validateLink(good)).length === 0);
check("a reason is required", !!M.validateLink({ ...good, reason: "ok" }).reason);
check("acknowledging the history consequence is required", !!M.validateLink({ ...good, acknowledgeHistory: false }).acknowledgeHistory);
check("a malformed company id is refused", !!M.validateLink({ ...good, companyId: "x" }).companyId);
check("the ownership index is unique and partial", /company_seller_unique/.test(read("src/lib/supplier/company.ts")) && /unique: true, partialFilterExpression: \{ "sellerKeys\.0"/.test(read("src/lib/supplier/company.ts")));
check("linking runs in a transaction with its audit row", /withTransaction/.test(read("src/lib/admin/sellerMapping.ts")) && /admin_audit_log/.test(read("src/lib/admin/sellerMapping.ts")));
check("no code path lets a supplier write sellerKeys", !src.filter((f) => f.includes(path.join("src", "app", "api", "supplier")) || f.includes(path.join("src", "lib", "supplier"))).some((f) => /\$addToSet:\s*\{\s*sellerKeys|\$set:\s*\{[^}]*sellerKeys/.test(read(f))));

// M-01 / M-02 / M-09
const dash = read("src/lib/supplier/dashboardService.ts");
check("dashboard capability flags for replies and products are true", /responsesAvailable: true/.test(dash) && /productManagement: true/.test(dash));
check("Inquiries & Leads is a real link", /key: "inquiries"[^}]*href: "\/supplier\/inquiries"/.test(read("src/components/supplier/supplierNav.ts")) && exists("src/app/supplier/inquiries/page.tsx"));
check("QUOTATION_TAX_RULES is documented in .env.example", /QUOTATION_TAX_RULES=/.test(read(".env.example")));
console.log(`\n${passed} passed, 0 failed`);
