// Admin dashboard (Page 50): tool list, capability gating and static contracts (no server, no database).
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/99-admin-dashboard-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
let n = 0; const check = (name, ok) => { assert.ok(ok, name); n++; console.log("PASS ", name); };
const D = await import("../../../src/lib/admin/dashboard.ts");
const P = await import("../../../src/lib/admin/permissions.ts");
const shell = fs.readFileSync(path.join(root, "src/components/admin/AdminShell.tsx"), "utf8");
const builtHrefs = [...shell.matchAll(/href: "(\/admin\/[a-z-]+)", built: true/g)].map((m) => m[1]).filter((h) => h !== "/admin/dashboard"); // the dashboard is the page itself
const toolHrefs = D.DASHBOARD_TOOLS.map((t) => t.href);

check("every page the sidebar marks built is a dashboard tool (nothing is hidden from the start page) and every tool has its page file", builtHrefs.every((h) => toolHrefs.includes(h)) && toolHrefs.every((h) => fs.existsSync(path.join(root, "src/app", h, "page.tsx"))));
check("no tool points at an unbuilt page (subscriptions, payments, content)", !toolHrefs.some((h) => /subscriptions|payments|content/.test(h)));
check("an administrator with no capability sees only Settings (their own account); one with a capability sees that tool", D.toolsFor([]).map((t) => t.href).join() === "/admin/settings" && D.toolsFor(["buyers.read"]).some((t) => t.href === "/admin/buyers") && !D.toolsFor(["buyers.read"]).some((t) => t.href === "/admin/suppliers"));
check("Reports opens with any one reports capability, and no capability implies another page", D.toolsFor(["reports.orders"]).some((t) => t.href === "/admin/reports") && !D.toolsFor(["reports.orders"]).some((t) => t.href === "/admin/audit-logs") && D.toolsFor(["audit.read"]).some((t) => t.href === "/admin/audit-logs"));
check("with every capability all tools show", D.toolsFor([...P.ADMIN_CAPABILITIES]).length === D.DASHBOARD_TOOLS.length);
check("every tool capability is a real capability", D.DASHBOARD_TOOLS.every((t) => t.needs === null || [].concat(t.needs).every((c) => P.ADMIN_CAPABILITIES.includes(c))));
const src = fs.readFileSync(path.join(root, "src/lib/admin/dashboard.ts"), "utf8"), page = fs.readFileSync(path.join(root, "src/app/admin/dashboard/page.tsx"), "utf8");
check("each count is gated by the capability of the queue behind it, read from the database, failing alone as null (never zero), with one definition", /needs: "products\.review"/.test(src) && /needs: "verification\.read"/.test(src) && /needs: "support\.manage"/.test(src) && /needs: "inquiries\.read"/.test(src) && /needs: "notifications\.read"/.test(src) && /value = null/.test(src) && /permissions\.includes\(d\.needs\)/.test(src) && !/cache|setTimeout|Math\.random/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")));
check("the support definition excludes tickets waiting for the buyer, resolved and closed; distribution counts FAILED or PARTIAL with an error only (not NO_MATCHES)", JSON.stringify(D.SUPPORT_AWAITING) === JSON.stringify(["OPEN", "WAITING_FOR_SUPPORT", "REOPENED"]) && /state: "FAILED"/.test(src) && /state: "PARTIAL", lastError: \{ \$exists: true \}/.test(src) && !/NO_MATCHES/.test(src));
check("no invented metrics: no revenue, payment, subscription, trend, ranking or forecast on the dashboard; a failed count says it could not be loaded, not zero", !/revenue|payment|subscription|trend|ranking|forecast|growth/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/Subscriptions?|[Pp]ayments?/g, "") + page.replace(/\/\*[\s\S]*?\*\//g, "")) && /Could not be loaded/.test(page) && /s\.value === null \? "—"/.test(page));
check("the page is read-only: no write, no fetch, no mutation on render", !/insertOne|updateOne|deleteOne|fetch\(|router\.|POST/.test(src + page) && /force-dynamic/.test(page));
console.log(`\n${n} passed, 0 failed`);
