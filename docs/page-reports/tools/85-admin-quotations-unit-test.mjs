// Admin Quotation Management (Page 58): rules, status/filter consistency and read-only code contracts (no database). Query integration, draft privacy and real authorization are covered by
// it-admin-quotations.mjs (BLOCKED without an isolated database).
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/85-admin-quotations-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let n = 0; const check = (name, ok) => { assert.ok(ok, name); n++; console.log("PASS ", name); };
const R = await import("../../../src/lib/admin/quotationAdminRules.ts");
const M = await import("../../../src/lib/admin/quotationManagement.ts");
const Q = await import("../../../src/lib/quotations/quotationRules.ts");

check("list state: defaults, trimmed reference text, unknown status falls back in the page and is a 422 in the API; operators, spaces and overlong text are refused", (() => { const ok = R.parseListState(new URLSearchParams("q=%20FBM-QT-ab12&status=accepted&page=2")); const bad = ["status=paid", "page=0", "page=1001", "limit=0", "limit=51", `q=${"A".repeat(41)}`, "q=%7B%22%24ne%22%3A1%7D", "q=.*", "q=FBM%20QT", "q=a%7Cb"].map((s) => R.validateListState((k) => new URLSearchParams(s).get(k))); return ok.q === "FBM-QT-ab12" && ok.status === "accepted" && ok.page === 2 && R.parseListState(new URLSearchParams("status=zzz&q=%24ne")).status === "all" && R.parseListState(new URLSearchParams("q=%24ne")).q === "" && bad.every((b) => !b.ok) && R.validateListState(() => null).ok; })());
check("URL carries only the reference text, status and page", R.toListParams({ q: "FBM-QT-1", status: "expired", page: 3 }).toString() === "q=FBM-QT-1&status=expired&page=3" && R.toListParams(R.EMPTY_STATE).toString() === "");
check("amount helpers: minor units to a two-decimal string without floats, and numeric equality of decimal strings", R.minorToDecimal(2400000) === "24000.00" && R.minorToDecimal(5) === "0.05" && R.minorToDecimal(123456789012) === "1234567890.12" && R.sameAmount("24000", "24000.00") && R.sameAmount("24000.0", "24000.00") && !R.sameAmount("24000.01", "24000.00") && !R.sameAmount("x", "1") && R.sameAmount("0.00", "-0"));

// the filters must partition exactly what the badges show (same rule as the buyer pages: effectiveStatus at one reference time)
const evalCond = (doc, c) => {
  if (!c) return true;
  return Object.entries(c).every(([k, v]) => {
    const x = doc[k];
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("$in" in v) return v.$in.includes(x);
      if ("$ne" in v) return x !== v.$ne;
      return (!("$gt" in v) || x > v.$gt) && (!("$lte" in v) || x <= v.$lte);
    }
    return x === v;
  });
};
const now = new Date("2026-11-20T10:00:00.000Z");
const at = (ms) => new Date(now.getTime() + ms);
const D = 86_400_000;
const docs = [];
for (const status of ["SENT", "REVISION_REQUESTED", "ACCEPTED", "REJECTED", "WITHDRAWN"]) for (const off of [-30 * D, -1, 0, 1, 3 * D, 7 * D - 1, 7 * D, 7 * D + 1, 30 * D]) docs.push({ status, validUntil: at(off) });
const toFilter = { active: "ACTIVE", expiring: "EXPIRING_SOON", revision: "REVISION_REQUESTED", accepted: "ACCEPTED", rejected: "REJECTED", expired: "EXPIRED", withdrawn: "WITHDRAWN" };
check("every submitted quotation matches exactly ONE status filter and that filter is the one its badge names (incl. the expiry boundaries now, now+1ms, +7d); an accepted quotation past its date stays Accepted", docs.every((d) => { const eff = Q.effectiveStatus(d.status, d.validUntil, now); const hits = Object.keys(toFilter).filter((f) => evalCond(d, M.statusCondition(f, now))); return hits.length === 1 && toFilter[hits[0]] === eff; }) && Q.effectiveStatus("ACCEPTED", at(-30 * D), now) === "ACCEPTED" && evalCond({ status: "ACCEPTED", validUntil: at(-30 * D) }, M.statusCondition("accepted", now)) && !evalCond({ status: "ACCEPTED", validUntil: at(-30 * D) }, M.statusCondition("expired", now)) && M.statusCondition("all", now) === null);
check("list filter: current submitted versions only (isCurrent, not DRAFT); search is an anchored, escaped, upper-case reference prefix on the quotation or requirement reference", (() => { const f = M.listFilter({ q: "fbm-qt-a.b", status: "all" }, now); const [base, search] = f.$and; return base.isCurrent === true && base.status.$ne === "DRAFT" && search.$or.length === 2 && search.$or[0].reference.$regex === "^FBM-QT-A\\.B" && search.$or[1].inquiryReference.$regex === "^FBM-QT-A\\.B" && f.$and.length === 2 && M.listFilter({ q: "", status: "accepted" }, now).$and.length === 2; })());

// read-only guarantees and visibility
const svc = read("src/lib/admin/quotationManagement.ts");
const list = read("src/app/api/admin/quotations/route.ts");
const one = read("src/app/api/admin/quotations/[reference]/route.ts");
const code = svc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
check("read-only: the service and routes contain no insert, update, delete, replace, bulk or aggregation-write operation and export only GET handlers", !/\.(insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|replaceOne|findOneAndUpdate|findOneAndDelete|bulkWrite|\$out|\$merge)\b|\$out|\$merge/.test(code) && /export async function GET/.test(list + one) && !/export async function (POST|PATCH|PUT|DELETE)/.test(list + one) && !/withTransaction|startSession/.test(code));
check("drafts stay private: the list and detail both require isCurrent and status not DRAFT, the detail projection excludes the working copy, internal user ids, attachments and the snapshot's raw inputs, and revision drafts (isCurrent false) are never read", /isCurrent: true, status: \{ \$ne: "DRAFT" \}/.test(svc) && (svc.match(/status: \{ \$ne: "DRAFT" \}/g) ?? []).length >= 3 && /draft: 0/.test(svc) && /"snapshot\.input": 0/.test(svc) && /buyerId: 0/.test(svc) && !/\bdraft\b\s*[:?.]/.test(code.replace(/draft: 0/, "")) );
check("one row per logical quotation: the list filters isCurrent (never every revision), the count uses the same filter, and earlier submitted versions appear only as labelled history in the detail", /countDocuments\(filter\)/.test(svc) && /find\(\{ reference, status: \{ \$ne: "DRAFT" \} \}/.test(svc) && /current: v\.isCurrent/.test(svc) && /earlier/.test(read("src/components/admin/AdminQuotationReview.tsx")));
check("sort is newest SUBMISSION first (sentAt, never a draft timestamp) with the unique _id tie-break; skip/limit bounded; indexes declared; every query is by reference or the indexed filter", /sort\(\{ sentAt: -1, _id: -1 \}\)/.test(svc) && !/updatedAt|savedAt/.test(code.split("export async function getAdminQuotation")[0]) && /admin_quotations_newest/.test(svc) && /admin_quotations_by_requirement/.test(svc) && /MAX_PAGE_SIZE/.test(svc));
check("money: amounts come from the version's stored fields and snapshot via the existing totals/breakdown helpers; no catalogue, tax-configuration or supplier-profile read; mismatches are reported as data notes, never rewritten", /breakdownRows\(d\)/.test(svc) && /totals\(d\)/.test(svc) && !/QUOTATION_TAX_RULES|getPublicProduct|getPublicSupplier|catalog/i.test(code) && /sameAmount\(snap\.amounts\.total/.test(svc) && /nothing was changed/.test(svc));
check("a General Requirement never gets a 'Selected supplier' label; the requested product and the offered product are separate fields; missing optional values read 'Not provided'", /kind === "GENERAL" \? "Responding supplier"/.test(svc) && /"Selected supplier" : "Matched supplier"/.test(svc) && /Buyer requested/.test(read("src/components/admin/AdminQuotationReview.tsx")) && /Supplier offered/.test(read("src/components/admin/AdminQuotationReview.tsx")) && /Not provided/.test(read("src/components/admin/AdminQuotationReview.tsx")));
check("no buyer detail, message, buyer reason or private data in the detail DTO; the buyer decision is the type and date only; no order data or order link", !/decision: d\.decision \? \{[^}]*reason/.test(svc) && !/message:\s*e\.|events\.map/.test(svc) && !/orders?Collection|quotationReference/.test(code) && !/\/admin\/orders|View Order/.test(read("src/components/admin/AdminQuotationReview.tsx")) && !/email|phone|guest/i.test(code));
check("permissions: both routes and the page require the explicit quotations.read capability on the server; the requirement link needs inquiries.read; the capability is in the allow-list with no wildcard", /requireAdminApi\("quotations\.read"\)/.test(list) && /requireAdminApi\("quotations\.read"\)/.test(one) && /requireAdminPage\(next, "quotations\.read"\)/.test(read("src/app/admin/quotations/page.tsx")) && /inquiries: guard\.permissions\.includes\("inquiries\.read"\)/.test(one) && /caps\.inquiries \? `\/admin\/inquiries\?review=/.test(svc) && /"quotations\.read"/.test(read("src/lib/admin/permissions.ts")));
check("routes: list and detail are rate limited, private no-store, 422 for bad filters, 404 for unknown, malformed or draft-only references", /rateLimit\(/.test(list) && /rateLimit\(/.test(one) && /NO_STORE/.test(list + one) && /status: 422/.test(list) && /status: 404/.test(one) && /QUOTATION_REF_RE\.test\(reference\)/.test(svc));
check("UI: failure shows Retry without an empty list, stale responses ignored, filters kept, empty states per brief, read-only wording, no sample data, no export or action buttons; sidebar links to /admin/quotations", (() => { const ws = read("src/components/admin/AdminQuotationsWorkspace.tsx"), rv = read("src/components/admin/AdminQuotationReview.tsx"); return /signal\.aborted\) return/.test(ws) && /Retry/.test(ws) && /No submitted quotations yet\./.test(ws) && /No quotations match these filters\./.test(ws) && /This page is read-only/.test(ws) && /currencies are never combined/.test(ws) && !/QTN-10dd|Sample Supplier|exportCsv|Download/.test(ws + rv) && !/method: "(POST|PATCH|PUT|DELETE)"/.test(ws + rv) && /key: "quotations".*href: "\/admin\/quotations", built: true/.test(read("src/components/admin/AdminShell.tsx")); })());
check("the buyer-side filters were only exported for reuse (tabFilter), not changed", /export function tabFilter/.test(read("src/lib/quotations/service.ts")) && /case "expired":\s*\n\s*return \{ status: \{ \$in: \["SENT", "REVISION_REQUESTED"\] \}, validUntil: \{ \$lte: now \} \};/.test(read("src/lib/quotations/service.ts")));
console.log(`\n${n} passed, 0 failed`);
