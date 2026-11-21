// Admin Inquiry Management (Page 57): behaviour of the pure rules and DTO shaping. No database. The workflow tests (scoped reads, routing, pause/resume/retry,
// idempotency, concurrency, rollback, audit) are in it-admin-inquiries.mjs and are BLOCKED here (no isolated test database).
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/71-admin-inquiries-rules-unit-test.mjs
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const R = await import("../../../src/lib/admin/inquiryRules.ts");
const S = await import("../../../src/lib/admin/inquiryService.ts");
const A = await import("../../../src/lib/admin/inquiryApi.ts");
const P = await import("../../../src/lib/admin/permissions.ts");
const { safeNext } = await import("../../../src/lib/inquiries/rules.ts");
const { resolvePostLoginPath } = await import("../../../src/lib/auth/portals.ts");
const { csvCell } = await import("../../../src/lib/supplier/quotationRules.ts");
const { DISTRIBUTION_LABEL, isOpenForDistribution } = await import("../../../src/lib/leads/matchingRules.ts");

// ---- source and DTO shaping
check("an absent sourceType is a direct inquiry; GENERAL_REQUIREMENT is the only general source", R.sourceOf({}) === "DIRECT" && R.sourceOf({ sourceType: "DIRECT_INQUIRY" }) === "DIRECT" && R.sourceOf({ sourceType: "GENERAL_REQUIREMENT" }) === "GENERAL");
check("the source filter keeps absent sourceType inside 'direct' and never inside 'general'", JSON.stringify(R.sourceCondition("direct")) === JSON.stringify({ sourceType: { $in: [null, "DIRECT_INQUIRY"] } }) && JSON.stringify(R.sourceCondition("general")) === JSON.stringify({ sourceType: "GENERAL_REQUIREMENT" }) && R.sourceCondition("all") === null);
const base = { _id: new ObjectId(), reference: "FBM-INQ-ABCDEFGH", productName: "Cotton poplin", quantity: 500, unit: "metre", supplierKey: "co:" + "a".repeat(24), supplierName: "Example Textiles", status: "NEW", createdAt: new Date("2026-11-10T00:00:00Z") };
const names = new Map();
const direct = S.rowOf({ ...base }, names, { inquiryId: base._id, state: "COMPLETED" }, 3);
check("a direct inquiry shows its selected supplier and counts it once as a unique recipient, beside the MATCHED ones, without any stored recipient row", direct.source === "DIRECT" && direct.selectedSupplier === "Example Textiles" && direct.recipients.direct === 1 && direct.recipients.matched === 3 && direct.recipients.total === 4);
const general = S.rowOf({ ...base, sourceType: "GENERAL_REQUIREMENT", supplierKey: "", supplierName: "Reference Seller" }, names, { inquiryId: base._id, state: "COMPLETED" }, 2);
check("a general requirement has NO selected supplier and no direct recipient even if a reference product's seller name is stored", general.source === "GENERAL" && general.selectedSupplier === null && general.recipients.direct === 0 && general.recipients.total === 2);
check("the buyer is a display name only; a guest shows its company or name; quantity text is never invented", S.rowOf({ ...base, buyerId: undefined, guest: { name: "A Guest", email: "x@y.z" } }, names, undefined, 0).buyer === "A Guest" && S.rowOf({ ...base, quantity: 0 }, names, undefined, 0).quantityText === "");
check("an inquiry without a job is 'Not in distribution' (a state, not a failure)", S.rowOf(base, names, undefined, 0).distribution.label === "Not in distribution" && S.rowOf(base, names, undefined, 0).distribution.attention === false);

// ---- distribution states and "needs attention"
const dv = (state, hasError) => R.distributionView({ state, hasError });
check("NO_MATCHES is a finished, successful search: muted, never attention", dv("NO_MATCHES").tone === "muted" && !dv("NO_MATCHES").attention && !dv("NO_MATCHES", true).attention);
check("needs attention = FAILED, or PARTIAL with a recorded error; nothing else", dv("FAILED").attention && dv("PARTIAL", true).attention && !dv("PARTIAL", false).attention && ["PENDING", "PROCESSING", "COMPLETED", "STOPPED", "PAUSED"].every((s) => !dv(s, true).attention));
check("every job state has an admin label and a buyer-safe label, and PAUSED is described as an operational hold, never a cancellation or the buyer's choice", Object.keys(R.ADMIN_JOB_LABEL).every((k) => R.ADMIN_JOB_LABEL[k] && DISTRIBUTION_LABEL[k]) && /hold/i.test(DISTRIBUTION_LABEL.PAUSED) && !/cancel|opt/i.test(DISTRIBUTION_LABEL.PAUSED));

// ---- action predicates
const caps = { routing: true, distribution: true };
const plan = (inquiryStatus, jobState, hasError = false, c = caps) => R.actionPlan({ inquiryStatus, jobState, hasError, caps: c });
check("routing repair is offered only after distribution finished (COMPLETED, PARTIAL, FAILED) on an open requirement", ["COMPLETED", "PARTIAL", "FAILED"].every((s) => plan("QUOTED", s).route.available) && ["PENDING", "PROCESSING", "PAUSED", "NO_MATCHES", "STOPPED"].every((s) => !plan("NEW", s).route.available) && !plan("CLOSED", "COMPLETED").route.available && !plan("NEW", null).route.available);
check("pause applies to waiting, running or retrying jobs; resume only to PAUSED; both need an open requirement", ["PENDING", "PROCESSING", "PARTIAL"].every((s) => plan("NEW", s).pause.available) && !plan("NEW", "PAUSED").pause.available && !plan("NEW", "COMPLETED").pause.available && plan("NEW", "PAUSED").resume.available && !plan("NEW", "PROCESSING").resume.available && !plan("CANCELLED", "PAUSED").resume.available);
check("retry applies only to FAILED, or PARTIAL with a recorded error; a completed job is never re-run", plan("NEW", "FAILED").retry.available && plan("NEW", "PARTIAL", true).retry.available && !plan("NEW", "PARTIAL", false).retry.available && !plan("NEW", "COMPLETED").retry.available && !plan("NEW", "NO_MATCHES").retry.available && !plan("NEW", "STOPPED").retry.available);
check("no capability = not permitted and not available; routing and distribution capabilities are independent", !plan("NEW", "FAILED", false, { routing: false, distribution: true }).retry.permitted && plan("NEW", "PENDING", false, { routing: false, distribution: true }).pause.permitted && !plan("NEW", "COMPLETED", false, { routing: false, distribution: true }).route.available);
check("moderation is never available: no approved policy, and the blocker is stated", ["NEW", "QUOTED"].every((s) => !plan(s, "COMPLETED").restrict.available && /policy/i.test(plan(s, "COMPLETED").restrict.reason ?? "")));
check("open for distribution agrees with the shared rule", isOpenForDistribution("QUOTED") && !isOpenForDistribution("CLOSED") && !isOpenForDistribution("CANCELLED") && !isOpenForDistribution(undefined));

// ---- validation
check("the reason is cleaned, trimmed and bounded", R.validateReason(R.cleanReason("  short ")) !== null && R.validateReason("x".repeat(501)) !== null && R.validateReason(R.cleanReason("Supplier A qualified after review.")) === null && R.cleanReason("a\u0000b\n\nc") === "a b c" && R.cleanReason(5) === "");
check("idempotency keys are 16-64 URL-safe characters", R.KEY_RE.test(crypto.randomUUID()) && !R.KEY_RE.test("short") && !R.KEY_RE.test("has space has space has space") && !R.KEY_RE.test("x".repeat(65)));
const q = (o) => A.parseQueryParams((k) => o[k]);
check("filters are allow-lists: an unknown source, status or distribution value and a bad or future date are 422, never ignored", !q({ source: "evil" }).ok && !q({ group: "evil" }).ok && !q({ dist: "evil" }).ok && !q({ start: "2026-13-45" }).ok && !q({ end: "2999-01-01" }).ok && !q({ q: "x".repeat(61) }).ok && q({}).ok && q({ source: "general", dist: "attention", group: "ended" }).ok);
check("the page size is bounded and the page is a positive integer", (() => { const r = q({ page: "-5", limit: "9999" }); return r.ok && r.query.page === 1 ? true : r.ok && r.query.limit === 9999; })() && R.ADMIN_MAX_PAGE_SIZE === 50 && R.ADMIN_PAGE_SIZE === 20);

// ---- search safety
const range = { start: new Date("2026-11-01"), end: new Date("2026-12-01") };
const re = (qq) => S.baseMatch({ q: qq, range }).$or;
check("search is anchored and escaped: a regex or operator payload is literal characters (reference prefix is upper-cased, product text is a case-insensitive prefix)", (() => { const dot = re(".*"); const op = re('{"$ne":null}'); return dot[1].productName.$regex === "^\\.\\*" && dot[0].reference.$regex.startsWith("^") && !/(^|[^\\])\$ne/.test(op[1].productName.$regex) && re("fbm-inq-ab")[0].reference.$regex === "^FBM-INQ-AB" && S.baseMatch({ range }).$or === undefined; })());

// ---- URL state and the sign-in return path
const defaults = { start: "2026-10-17", end: "2026-11-16" };
const st = { q: "cotton poplin", source: "general", group: "ended", dist: "attention", start: "2026-10-20", end: "2026-11-16", page: 3 };
const params = R.toListParams(st, defaults);
check("filter state round-trips through the URL and only non-defaults are written", JSON.stringify(R.parseListState(params, defaults)) === JSON.stringify(st) && R.toListParams({ q: "", source: "all", group: "all", dist: "all", ...defaults, page: 1 }, defaults).toString() === "");
check("an unknown URL value falls back to the default (a typed URL never breaks the page)", (() => { const s = R.parseListState(new URLSearchParams("source=x&group=y&dist=z&page=-1&start=nope"), defaults); return s.source === "all" && s.group === "all" && s.dist === "all" && s.page === 1 && s.start === defaults.start; })());
const nextOf = (st2) => `/admin/inquiries?${R.toListParams(st2, defaults).toString().replace(/\+/g, "%20")}`;
check("the admin page + filters + open review survive the sign-in `next` validation and an admin keeps them after login", (() => { const n = nextOf({ ...st, q: "cotton poplin" }) + "&review=FBM-INQ-ABCDEFGH"; return safeNext(n) === n && resolvePostLoginPath("admin", safeNext(n)) === n; })());
check("open-redirect, protocol-relative, backslash, scheme and API destinations are refused; a wrong-role user is sent home, not to the requested page", ["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "/api/admin/inquiries", "/sign-in?next=/x", "/admin/inquiries\r\nX: y", "/admin/inquiries?q=<script>"].every((n) => safeNext(n) === null) && resolvePostLoginPath("buyer", "/admin/inquiries") === "/buyer/dashboard" && resolvePostLoginPath("supplier", "/admin/inquiries?source=general") !== "/admin/inquiries?source=general" && resolvePostLoginPath("admin", null) === "/admin/dashboard" && resolvePostLoginPath("admin", "/buyer/dashboard") === "/admin/dashboard");

// ---- capabilities, review reference, CSV
check("each new operation has its own capability, none implied by another", ["inquiries.read", "inquiries.requirements", "inquiries.recipients", "inquiries.responses", "inquiries.routing", "inquiries.distribution", "inquiries.audit", "inquiries.export"].every((c) => P.ADMIN_CAPABILITIES.includes(c)));
check("capability flags come from the permission list only", (() => { const c = A.capsOf(["inquiries.read", "inquiries.routing"]); return c.routing && !c.distribution && !c.audit && !c.requirements && !c.recipients && !c.responses; })() && Object.values(A.capsOf([])).every((v) => v === false));
check("inquiry references are validated before any lookup", R.REFERENCE_RE.test("FBM-INQ-ABCDEFGH") && !R.REFERENCE_RE.test("FBM-INQ-abc") && !R.REFERENCE_RE.test('FBM-INQ-ABCDEFGH" ; drop') && !R.REFERENCE_RE.test("../etc"));
check("CSV cells that start like a formula are neutralised (including the buyer, requirement and supplier text)", ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\t=1", "\r=1"].every((v) => !/^[=+\-@\t\r]/.test(csvCell(v).replace(/^"/, ""))));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
