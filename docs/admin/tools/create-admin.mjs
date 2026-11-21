// Creates ONE administrator account the way an operator would (docs/admin/ADMIN_ACCESS.md): role admin, every capability, e-mail already confirmed, password hashed with the application's own function.
// It refuses when the account already exists. It prints only the database NAME and the result, never the URI or the password. The password is read from the environment (never stored in the repository).
// It uses MONGODB_URI / MONGODB_DB from the process environment, or from the git-ignored .env.local when they are not set.
// run:  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' ADMIN_NAME='Finbyn Mart' node --import ./docs/page-reports/tools/alias-register.mjs docs/admin/tools/create-admin.mjs
import fs from "node:fs";
const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase(), password = process.env.ADMIN_PASSWORD ?? "", name = (process.env.ADMIN_NAME ?? "Administrator").trim();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !password) throw new Error("set ADMIN_EMAIL and ADMIN_PASSWORD");
if (!process.env.MONGODB_URI || !process.env.MONGODB_DB) {
  for (const line of fs.readFileSync(new URL("../../../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = /^\s*(MONGODB_URI|MONGODB_DB|AUTH_SECRET)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
if (!process.env.MONGODB_URI || !process.env.MONGODB_DB) throw new Error("no database configured");
const { createUser } = await import("../../../src/lib/auth/users.ts");
const { hashPassword } = await import("../../../src/lib/auth/password.ts");
const { ADMIN_CAPABILITIES } = await import("../../../src/lib/admin/permissions.ts");
const user = await createUser({ name, email, passwordHash: await hashPassword(password), role: "admin", accountStatus: "ACTIVE", emailVerified: true, phoneVerified: false, adminPermissions: [...ADMIN_CAPABILITIES] });
console.log(user ? `created administrator ${email} in database "${process.env.MONGODB_DB}" with ${ADMIN_CAPABILITIES.length} capabilities` : `NOT created: an account with ${email} already exists`);
process.exit(user ? 0 : 1);
