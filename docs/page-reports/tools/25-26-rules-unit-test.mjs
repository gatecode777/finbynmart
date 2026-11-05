// Unit tests for src/lib/buyer/settingsRules.ts and notificationRules.ts (pure modules).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/25-26-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const load = (file) => import(pathToFileURL(path.join(root, file)).href);
const S = await load("src/lib/buyer/settingsRules.ts");
const N = await load("src/lib/buyer/notificationRules.ts");

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const good = (over = {}) => ({ notifications: { inquiries: true, company: false }, dashboardRange: "7d", version: 0, ...over });

let r = S.validateSettings(good());
check("S-01 a valid settings body passes and is returned as typed values", r.ok && r.value.notifications.company === false && r.value.dashboardRange === "7d" && r.value.version === 0);
check("S-02 the dashboard period must be one of the five presets (custom, empty and unknown refused)", ["custom", "", "1y", 7, null, { $ne: "" }].every((v) => S.validateSettings(good({ dashboardRange: v })).fields?.dashboardRange) && S.DASHBOARD_RANGES.length === 5);
check("S-03 notification values must be real booleans", S.validateSettings(good({ notifications: { inquiries: "true", company: true } })).fields?.["notifications.inquiries"] && S.validateSettings(good({ notifications: { inquiries: 1, company: true } })).fields?.["notifications.inquiries"] && S.validateSettings(good({ notifications: { company: true } })).fields?.["notifications.inquiries"]);
check("S-04 the required account category cannot be sent or switched off", S.validateSettings(good({ notifications: { inquiries: true, company: true, account: false } })).fields?.["notifications.account"]?.includes("required"));
check("S-05 an unknown notification category is refused", S.validateSettings(good({ notifications: { inquiries: true, company: true, marketing: true } })).fields?.["notifications.marketing"]);
check("S-06 unknown top-level keys are refused (buyerId, role, language, currency, timezone)", ["buyerId", "role", "language", "currency", "timezone", "_id"].every((k) => S.validateSettings({ ...good(), [k]: "x" }).fields?.[k]));
check("S-07 version must be a whole number of 0 or more", [-1, 1.5, "1", null, undefined].every((v) => S.validateSettings(good({ version: v })).fields?.version) && S.validateSettings(good({ version: 4 })).value?.version === 4);
check("S-08 non-object bodies are refused without throwing", [null, undefined, "x", 5, [], true].every((v) => S.validateSettings(v).ok === false));
check("S-09 defaults: all optional categories on, period 30 days; account is the only required category", S.DEFAULT_SETTINGS.notifications.inquiries && S.DEFAULT_SETTINGS.notifications.company && S.DEFAULT_SETTINGS.dashboardRange === "30d" && S.REQUIRED_CATEGORIES.join() === "account");

let q = N.parseNotificationQuery({});
check("Q-01 defaults: all categories, all statuses, page 1, 20 per page", JSON.stringify(q.value) === JSON.stringify({ category: "all", status: "all", page: 1, limit: 20 }));
check("Q-02 known categories and statuses are accepted, anything else refused", ["inquiries", "company", "account", "all"].every((category) => N.parseNotificationQuery({ category }).ok) && ["unread", "read", "all"].every((status) => N.parseNotificationQuery({ status }).ok) && ["promo", "ALL", "{}", ["x"], "1"].every((category) => !N.parseNotificationQuery({ category }).ok) && ["new", "UNREAD", ["x"]].every((status) => !N.parseNotificationQuery({ status }).ok));
check("Q-03 page 1 to 1000 and limit 1 to 50 as whole numbers", !N.parseNotificationQuery({ page: 0 }).ok && !N.parseNotificationQuery({ page: 1001 }).ok && !N.parseNotificationQuery({ page: "x" }).ok && !N.parseNotificationQuery({ limit: 0 }).ok && !N.parseNotificationQuery({ limit: 51 }).ok && !N.parseNotificationQuery({ limit: 2.5 }).ok && N.parseNotificationQuery({ page: "3", limit: "50" }).value?.limit === 50 && N.NOTIFICATION_MAX_PAGE_SIZE === 50 && N.NOTIFICATION_PAGE_SIZE === 20);

const safe = ["/buyer/profile?tab=documents", "/buyer/settings?tab=settings", "/account/inquiries", "/buyer/addresses"];
const unsafe = ["https://evil.example/buyer/x", "//evil.example/buyer/x", "/\\evil.example", "javascript:alert(1)", "/buyer/../admin", "/buyer//x", "/admin/users", "/api/buyer/profile", "buyer/profile", "/buyer/%2f%2fevil", "/buyer/x%5cy", "/buyer/\u0000", "", null, undefined, 5, "/buyer/" + "a".repeat(250), "/buyer/profile#frag", "/buyer/a b"];
check("L-01 only paths inside the buyer area or the buyer's inquiry list are safe links", safe.every((l) => N.isSafeNotificationLink(l)));
check("L-02 schemes, hosts, protocol-relative paths, backslashes, traversal, encoded slashes, other areas, API paths and non-strings are refused", unsafe.every((l) => !N.isSafeNotificationLink(l)), unsafe.filter((l) => N.isSafeNotificationLink(l)).join("|"));
check("L-03 retention is 180 days and the unread badge stops counting at 100", N.NOTIFICATION_RETENTION_DAYS === 180 && N.UNREAD_COUNT_CAP === 100);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n" + failures.join("\n"));
  process.exit(1);
}
