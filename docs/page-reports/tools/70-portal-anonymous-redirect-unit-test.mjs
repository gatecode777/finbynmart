// Anonymous visitors to /admin/* and /supplier/* must be sent to sign-in with THE PAGE THEY ASKED FOR as `next`. The layouts cannot know the path, so they must not
// redirect anonymous visitors to a fixed page, and EVERY page in those portals must run its own guard (or be a pure redirect alias): that is also the real protection,
// because a layout and its page render independently. Static checks, no database. run: node docs/page-reports/tools/70-portal-anonymous-redirect-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name === "page.tsx" ? [path.join(d, e.name)] : []));
const read = (p) => fs.readFileSync(p, "utf8");

const adminLayout = read(path.join(root, "src/app/admin/layout.tsx"));
const supplierLayout = read(path.join(root, "src/app/supplier/layout.tsx"));
check("the admin layout no longer sends anonymous visitors to a fixed page", !/sign-in\?next=%2Fadmin%2Finquiries/.test(adminLayout) && /if \(!user\) return <>\{children\}<\/>/.test(adminLayout));
check("the admin layout still refuses a signed-in account without a capability, and renders the shell only after that check", /redirect\("\/forbidden\?portal=admin"\)/.test(adminLayout) && adminLayout.indexOf("permissions.length === 0") < adminLayout.indexOf("<AdminShell>"));
check("the supplier layout renders no shell for an anonymous visitor and still runs the supplier guard for everyone else", /if \(!\(await getCurrentUser\(\)\.catch\(\(\) => null\)\)\) return <>\{children\}<\/>/.test(supplierLayout) && supplierLayout.indexOf("return <>{children}</>") < supplierLayout.indexOf("requireSupplierPage(") && /<SupplierShell/.test(supplierLayout));

// the admin dashboard answers an anonymous visitor with the admin sign-in form (no shell, no data) instead of a redirect
const guard = /require(Admin|AnyAdmin|Supplier)Page\(|redirect\(|permanentRedirect\(|if \(!user\) return <AdminSignIn \/>/;
for (const portal of ["admin", "supplier"]) {
  const pages = walk(path.join(root, "src/app", portal));
  const unguarded = pages.filter((f) => !guard.test(read(f))).map((f) => path.relative(root, f));
  check(`every ${portal} page runs its own guard or is a redirect alias (${pages.length} pages)`, unguarded.length === 0 && pages.length > 0);
}
check("a guarded page passes ITS OWN path as `next` (no page hard-codes another portal page)", walk(path.join(root, "src/app/admin")).every((f) => { const s = read(f); const m = s.match(/requireAdminPage\("([^"]+)"/); return !m || f.replace(/\\/g, "/").includes(m[1].replace(/\/$/, "")) || m[1] === "/admin"; }));
check("the admin dashboard answers an anonymous visitor with the admin sign-in form (next = /admin/dashboard, no registration links, no data) and /admin only redirects to it", /if \(!user\) return <AdminSignIn \/>/.test(read(path.join(root, "src/app/admin/dashboard/page.tsx"))) && /next="\/admin\/dashboard" hideRegister/.test(read(path.join(root, "src/components/admin/AdminSignIn.tsx"))) && /redirect\("\/admin\/dashboard"\)/.test(read(path.join(root, "src/app/admin/page.tsx"))));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
