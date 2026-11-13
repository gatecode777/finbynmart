// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/57-admin-inquiry-rules-unit-test.mjs
import assert from "node:assert/strict";
const r = await import("../../../src/lib/admin/inquiryRules.ts");
const all = ["new", "NEW", "NOTIFIED", "IN_PROGRESS", "REPLIED", "QUOTED", "CLOSED", "CANCELLED", "REJECTED"];
for (const s of all) {
  const groups = r.ADMIN_STATUS_GROUPS.filter((g) => g.statuses && g.statuses.includes(s));
  assert.equal(groups.length, 1, `${s} belongs to exactly one group`);
  assert.ok(r.STATUS_LABEL[s], `${s} has a label`);
}
assert.equal(r.ADMIN_STATUS_GROUPS[0].key, "all");
assert.ok(r.ADMIN_MAX_PAGE_SIZE >= r.ADMIN_PAGE_SIZE && r.ADMIN_EXPORT_MAX === 5000);
console.log("ok");
