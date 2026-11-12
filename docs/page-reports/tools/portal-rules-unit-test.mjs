// Unit tests for src/lib/auth/portals.ts (multi-portal architecture rules).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/portal-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const P = await import(pathToFileURL(path.join(root, "src/lib/auth/portals.ts")).href);
let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? " — " + detail : ""}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

check("P-01 paths belong to the portal their prefix names; look-alike public paths do not", P.portalOfPath("/buyer/dashboard") === "BUYER" && P.portalOfPath("/buyer") === "BUYER" && P.portalOfPath("/supplier/dashboard") === "SUPPLIER" && P.portalOfPath("/supplier") === "SUPPLIER" && P.portalOfPath("/admin/users") === "ADMIN" && P.portalOfPath("/super-admin/roles") === "ADMIN" && ["/", "/suppliers", "/suppliers/acme", "/supplier-guide", "/supplier-membership", "/buyer-guide", "/administrator", "/products/x"].every((p) => P.portalOfPath(p) === "PUBLIC"));
check("P-02 a query string or fragment does not change the portal", P.portalOfPath("/buyer/orders?x=1") === "BUYER" && P.portalOfPath("/products?next=/buyer/x") === "PUBLIC" && P.portalOfPath("/supplier#a") === "SUPPLIER");
check("P-03 a buyer lands on the buyer dashboard", P.portalHome("buyer") === "/buyer/dashboard" && P.resolvePostLoginPath("buyer", null) === "/buyer/dashboard" && P.resolvePostLoginPath("buyer", undefined) === "/buyer/dashboard" && P.resolvePostLoginPath("buyer", "/") === "/buyer/dashboard");
check("P-04 a buyer keeps a requested buyer page or public page", P.resolvePostLoginPath("buyer", "/buyer/inquiries?status=open") === "/buyer/inquiries?status=open" && P.resolvePostLoginPath("buyer", "/products/abc") === "/products/abc" && P.resolvePostLoginPath("buyer", "/inquiry/shree?p=1") === "/inquiry/shree?p=1");
check("P-05 a buyer is never sent to a supplier or admin page, or off the site", ["/supplier/dashboard", "/supplier/products", "/admin", "/super-admin/roles", "//evil.example", "https://evil.example", "javascript:alert(1)", "buyer/dashboard"].every((n) => P.resolvePostLoginPath("buyer", n) === "/buyer/dashboard"));
check("P-06 when the supplier portal is built the supplier flag is on and a supplier lands on the supplier dashboard", P.SUPPLIER_PORTAL_AVAILABLE === true && P.portalHome("supplier") === "/supplier/dashboard" && P.resolvePostLoginPath("supplier", null) === "/supplier/dashboard" && P.resolvePostLoginPath("supplier", "/supplier/orders") === "/supplier/orders" && P.resolvePostLoginPath("supplier", "/suppliers") === "/suppliers");
check("P-07 a supplier is never sent to a buyer or admin page", ["/buyer/dashboard", "/buyer/orders", "/admin", "//evil.example"].every((n) => P.resolvePostLoginPath("supplier", n) === P.portalHome("supplier")));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
