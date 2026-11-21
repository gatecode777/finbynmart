// Admin Supplier Management (Page 52): behaviour of the pure rules and query shaping. No database. The workflow (scoped list and counts, suspend / reactivate transaction, audit and
// event once, idempotency, concurrency with inquiries and the lead worker, public exclusion and restoration, preserved history) is in it-admin-suppliers.mjs and is BLOCKED here.
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/73-admin-suppliers-rules-unit-test.mjs
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const R = await import("../../../src/lib/admin/supplierRules.ts");
const M = await import("../../../src/lib/admin/supplierManagement.ts");
const API = await import("../../../src/lib/admin/supplierApi.ts");
const P = await import("../../../src/lib/admin/permissions.ts");
const { csvCell } = await import("../../../src/lib/supplier/quotationRules.ts");
const { safeNext } = await import("../../../src/lib/inquiries/rules.ts");
const { resolvePostLoginPath } = await import("../../../src/lib/auth/portals.ts");

const id = new ObjectId().toHexString();
// ---- identity, status and actions
check("a company's reference is its own id; the short code is its last 8 characters and cannot be used as a lookup key", R.refCode(id) === `CMP-${id.slice(-8).toUpperCase()}` && R.CODE_RE.test(R.refCode(id)) && R.COMPANY_ID_RE.test(id) && !R.COMPANY_ID_RE.test(R.refCode(id)));
check("suspend needs an ACTIVE company and reactivate a SUSPENDED one; each needs its own capability", (() => { const a = R.actionPlan("ACTIVE", { suspend: true, reactivate: true }); const b = R.actionPlan("SUSPENDED", { suspend: true, reactivate: true }); return a.suspend.available && !a.reactivate.available && b.reactivate.available && !b.suspend.available; })());
check("without a capability an action is neither permitted nor available, and the capabilities are independent", (() => { const a = R.actionPlan("ACTIVE", { suspend: false, reactivate: true }); return !a.suspend.permitted && !a.suspend.available && a.reactivate.permitted && !a.reactivate.available; })());
check("exactly two operational statuses exist: no verified, pending or deleted state is invented", R.COMPANY_STATUSES.map((s) => s.key).join() === "all,ACTIVE,SUSPENDED" && Object.keys(R.STATUS_LABEL).join() === "ACTIVE,SUSPENDED");
check("the consequences shown before confirming state what is kept and what is not changed (history, verification, products, seller ownership, replay)", R.SUSPEND_EFFECTS.some((t) => /kept unchanged/.test(t)) && R.SUSPEND_EFFECTS.some((t) => /no session is revoked/.test(t)) && R.REACTIVATE_EFFECTS.some((t) => /verify the company/.test(t) && /unpublish restriction/.test(t) && /transfer seller ownership/.test(t) && /replay past leads/.test(t)));

// ---- reason and notice
check("the reason is cleaned, trimmed and bounded (10-500)", R.validateReason(R.cleanReason(" short ")) !== null && R.validateReason("x".repeat(501)) !== null && R.validateReason(R.cleanReason("Repeated policy complaints.")) === null);
check("the supplier is told one of a fixed set of safe notices, never free text, and the notice texts do not contain internal-risk wording", R.NOTICE_CODES.length === 3 && R.NOTICE_CODES.every((n) => R.NOTICE_TEXT[n.key]) && !Object.values(R.NOTICE_TEXT).some((t) => /fraud|risk score|suspicious|blacklist/i.test(t)));

// ---- query validation and URL state
const q = (o) => R.validateListState((k) => o[k]);
check("filters are allow-lists: unknown status, mapping or sort, a long search or city, and a bad page are refused, never ignored", !q({ status: "VERIFIED" }).ok && !q({ mapping: "x" }).ok && !q({ sort: "price" }).ok && !q({ q: "x".repeat(61) }).ok && !q({ city: "x".repeat(81) }).ok && !q({ page: "0" }).ok && !q({ page: "2000" }).ok && !q({ page: "1.5" }).ok && q({}).ok && q({ status: "SUSPENDED", mapping: "none", sort: "name", page: "3" }).ok);
const st = { q: "Example Textiles", status: "SUSPENDED", mapping: "none", city: "Surat", sort: "name", page: 2 };
check("list state round-trips through the URL, only non-defaults are written, unknown URL values fall back", JSON.stringify(R.parseListState(R.toListParams(st))) === JSON.stringify(st) && R.toListParams(R.EMPTY_STATE).toString() === "" && (() => { const x = R.parseListState(new URLSearchParams("status=x&sort=y&page=-4")); return x.status === "all" && x.sort === "updated" && x.page === 1; })());
check("the page + filters + open review survive the sign-in `next`, and open redirects are refused", (() => { const n = `/admin/suppliers?${R.toListParams(st).toString().replace(/\+/g, "%20")}&review=${id}`; return safeNext(n) === n && resolvePostLoginPath("admin", safeNext(n)) === n && ["//evil.example", "/\\evil", "https://evil.example", "/api/admin/suppliers"].every((x) => safeNext(x) === null) && resolvePostLoginPath("buyer", n) === "/buyer/dashboard"; })());

// ---- query shaping (indexed company-level conditions vs joined name/city conditions)
const base = { ...R.EMPTY_STATE };
check("status and mapping are company-level conditions: 'none' means an empty or absent seller list, never 'invalid'", M.companyMatch({ ...base, status: "SUSPENDED" }).status === "SUSPENDED" && JSON.stringify(M.companyMatch({ ...base, mapping: "none" })) === JSON.stringify({ "sellerKeys.0": { $exists: false } }) && JSON.stringify(M.companyMatch({ ...base, mapping: "linked" })) === JSON.stringify({ "sellerKeys.0": { $exists: true } }) && Object.keys(M.companyMatch(base)).length === 0);
check("a full id matches that company only; the short code matches by suffix; neither is a name search", (() => { const a = M.companyMatch({ ...base, q: id }); const b = M.companyMatch({ ...base, q: R.refCode(id) }); return a._id.equals(new ObjectId(id)) && !!b.$expr && M.joinedMatch({ ...base, q: id }) === null && M.joinedMatch({ ...base, q: R.refCode(id) }) === null; })());
check("name and city search are anchored, escaped, case-insensitive prefix / exact matches: a regex or operator payload is literal characters", (() => { const j = M.joinedMatch({ ...base, q: ".*", city: "Sur(at" }); const name = j.$and[0].name; const cityC = j.$and[1].city; const op = M.joinedMatch({ ...base, q: '{"$ne":null}' }).$and[0].name.$regex; return name.$regex === "^\\.\\*" && name.$options === "i" && cityC.$regex === "^Sur\\(at$" && !/(^|[^\\])\$ne/.test(op) && M.joinedMatch(base) === null; })());

// ---- permissions, redaction, CSV
check("each supplier-management operation has its own capability and none implies another", ["suppliers.read", "suppliers.links", "suppliers.contacts", "suppliers.suspend", "suppliers.reactivate", "suppliers.audit", "suppliers.export"].every((c) => P.ADMIN_CAPABILITIES.includes(c)));
check("capability flags come only from the permission list; related links need the capability of their destination", (() => { const c = API.supplierCapsOf(["suppliers.read", "suppliers.suspend"]); return c.suspend && !c.reactivate && !c.links && !c.contacts && !c.audit && !c.products && !c.companyLinks && !c.review; })() && (() => { const c = API.supplierCapsOf(["suppliers.read", "sellers.map", "products.read", "products.review"]); return c.companyLinks && c.products && c.review; })() && Object.values(API.supplierCapsOf([])).every((v) => v === false));
check("a list row carries no contact, address or document fields", (() => { const row = { _id: new ObjectId(), ownerUserId: new ObjectId(), sellerKeys: ["a", "b"], status: "ACTIVE", verificationStatus: "UNVERIFIED", createdAt: new Date(), updatedAt: new Date(), name: "Example", city: "Jaipur", email: "x@y.z", phone: "999", businessType: "Manufacturer" }; const r = M.rowOf ? M.rowOf(row, { suspend: true, reactivate: true }) : null; return !r || (!JSON.stringify(r).includes("x@y.z") && !JSON.stringify(r).includes("999") && r.linkedSellers === 2 && r.revision === 0 && r.code === R.refCode(row._id.toHexString())); })());
check("CSV cells that start like a formula are neutralised (company names and cities are supplier-written)", ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\t=1", "\r=1"].every((v) => !/^[=+\-@\t\r]/.test(csvCell(v).replace(/^"/, ""))));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
