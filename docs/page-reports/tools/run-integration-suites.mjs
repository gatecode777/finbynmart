// Runs the seven integration suites one after another against the ISOLATED test database named by the guard's variables, each in its own database
// (finbyn_it_<suite>), and prints PASS / FAIL / BLOCKED per suite. It never reads MONGODB_URI/MONGODB_DB; the guard inside each suite re-checks everything.
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_run TEST_DB_CONFIRM=finbyn_it_run node docs/page-reports/tools/run-integration-suites.mjs
import { spawnSync } from "node:child_process";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const need = ["FINBYN_TEST_MODE", "TEST_MONGODB_URI", "TEST_MONGODB_DB", "TEST_DB_CONFIRM"].filter((n) => !process.env[n]);
if (need.length) {
  console.log(`BLOCKED: set ${need.join(", ")} (names only shown). Nothing was run.`);
  process.exit(2);
}
const suites = [["it-supplier-flows", "supplier"], ["it-lead-distribution", "leads"], ["it-approved-flow", "catalog"], ["it-conversation-flow", "conv"], ["it-requirement-flow", "req"], ["it-specifications-flow", "spec"], ["it-admin-products", "adminprod"], ["it-admin-inquiries", "admininq"], ["it-admin-suppliers", "adminsup"], ["it-admin-verification", "verify"], ["it-admin-categories", "categories"], ["it-recently-viewed", "recent"], ["it-admin-buyers", "adminbuy"], ["it-admin-quotations", "adminqt"], ["it-admin-notifications", "adminnotif"], ["it-admin-reports", "adminrep"], ["it-admin-settings", "adminset"], ["it-admin-audit-logs", "adminaud"]];
const rows = [];
for (const [file, tag] of suites) {
  const db = `finbyn_it_${tag}`;
  const env = { ...process.env, TEST_MONGODB_DB: db, TEST_DB_CONFIRM: db, AUTH_SECRET: process.env.AUTH_SECRET ?? "integration-test-secret-integration" };
  const r = spawnSync(process.execPath, ["--import", "./docs/page-reports/tools/alias-register.mjs", `docs/page-reports/tools/${file}.mjs`], { cwd: root, env, encoding: "utf8", timeout: 600_000 });
  const out = `${r.stdout}\n${r.stderr}`;
  const verdict = r.status === 0 ? "PASS" : r.status === 2 ? "BLOCKED" : "FAIL";
  rows.push({ file, verdict, passed: (out.match(/^PASS /gm) ?? []).length, detail: verdict === "PASS" ? "" : out.split("\n").filter((l) => /Error|REFUSING|AssertionError|FAIL/.test(l)).slice(0, 3).join(" | ").slice(0, 300) });
  console.log(`${verdict.padEnd(7)} ${file} (${rows.at(-1).passed} checks) ${rows.at(-1).detail}`);
}
process.exit(rows.every((r) => r.verdict === "PASS") ? 0 : 1);
