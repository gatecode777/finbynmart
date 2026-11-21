// Admin Supplier Management (Page 52): STATIC structure checks of the guards, the transaction design, the cross-module enforcement and the UI. These read source text: they catch a
// regression of a rule that was designed in, but they do NOT prove runtime behaviour (that is it-admin-suppliers.mjs, BLOCKED without an isolated database).
// run: node docs/page-reports/tools/74-admin-suppliers-structure-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const api = "src/app/api/admin/suppliers";
const r = { list: read(`${api}/route.ts`), detail: read(`${api}/[reference]/route.ts`), activity: read(`${api}/[reference]/activity/route.ts`), suspend: read(`${api}/[reference]/suspend/route.ts`), reactivate: read(`${api}/[reference]/reactivate/route.ts`), exp: read(`${api}/export/route.ts`) };
const svc = read("src/lib/admin/supplierManagement.ts");
const elig = read("src/lib/supplier/companyEligibility.ts");
const dist = read("src/lib/leads/distribution.ts");
const inq = read("src/lib/inquiries/service.ts");
const guards = read("src/lib/auth/guards.ts");
const ui = read("src/components/admin/AdminSupplierReview.tsx") + read("src/components/admin/AdminSuppliersWorkspace.tsx");

check("every supplier-management route guards with a capability first", Object.values(r).every((s) => /requireAdminApi\("suppliers\.[a-z]+"\)/.test(s)));
check("suspend and reactivate have separate capabilities and each also needs suppliers.read", /requireAdminApi\("suppliers\.suspend"\)/.test(r.suspend) && /requireAdminApi\("suppliers\.reactivate"\)/.test(r.reactivate) && /includes\("suppliers\.read"\)/.test(r.suspend) && /includes\("suppliers\.read"\)/.test(r.reactivate));
check("activity and export need their own capability plus suppliers.read", /requireAdminApi\("suppliers\.audit"\)/.test(r.activity) && /requireAdminApi\("suppliers\.export"\)/.test(r.exp) && /includes\("suppliers\.read"\)/.test(r.activity) && /includes\("suppliers\.read"\)/.test(r.exp));
check("every state-changing route refuses cross-site requests, is rate limited and bounds the payload", [r.suspend, r.reactivate, r.exp].every((s) => /isCrossSiteWrite\(request\)/.test(s) && /rateLimit\(/.test(s) && /readSmallJson\(request, (1_000|2_000)\)/.test(s)));
check("the status routes read only their allowed body fields and never an actor, status, owner or company", /reason: body\.reason, noticeCode: body\.noticeCode, expectedRev: body\.expectedRev, idempotencyKey: body\.idempotencyKey/.test(r.suspend) && /reason: body\.reason, expectedRev: body\.expectedRev, idempotencyKey: body\.idempotencyKey/.test(r.reactivate) && !/body\.(status|actor|ownerUserId|companyId|adminId)/.test(r.suspend + r.reactivate));
check("there is no generic status or ownership PATCH/PUT/DELETE and no delete of a company", !/export async function (PATCH|PUT|DELETE)/.test(Object.values(r).join("\n")) && !/deleteOne|deleteMany/.test(svc));
check("the export is audited by counts and filter names, has no contact fields and is capped", /SUPPLIERS_EXPORTED/.test(r.exp) && /EXPORT_MAX/.test(r.exp) && !/email|phone/i.test(r.exp.replace(/\/\*[\s\S]*?\*\//g, "")));
check("the status change, its audit row and its recovery event commit in ONE snapshot transaction with a conditional update on status and revision", /withTransaction/.test(svc) && /readConcern: \{ level: "snapshot" \}, writeConcern: \{ w: "majority" \}/.test(svc) && /audit\.insertOne\([^]*?operationKey/.test(svc) && /events\.insertOne\(/.test(svc) && /status: want/.test(svc) && /statusRev/.test(svc));
check("a replay is detected by the operation key and a changed request under it is a 409", /prev\.bodyHash === bodyHash/.test(svc) && /already used for a different request/.test(svc));
check("the status change never touches verification, products, seller ownership or history", !/verificationStatus|sellerKeys\s*[:=]\s*\[|\$pull|\$addToSet|supplier_products|inquiries/.test(svc.replace(/\/\*[\s\S]*?\*\//g, "").split("export async function changeStatus")[1]?.split("export const suspendCompany")[0] ?? ""));
check("after the commit the public snapshot is refreshed and one notice is recorded from the stored event (a failure leaves it for the worker sweep)", /invalidateApproved\(\)/.test(svc) && /sweepStatusEvents/.test(svc) && /sweepStatusEvents\(\)/.test(dist) && /processStatusEvent\(eventId\)\.catch/.test(svc));
check("the supplier is told a fixed notice, never the internal reason", /NOTICE_TEXT\[ev\.noticeCode\]/.test(svc) && !/ev\.reason|suspension\.reason/.test(svc.split("export async function processStatusEvent")[1] ?? ""));
check("the lead commit checks the company with a WRITE to the company document, inside the transaction", /updateOne\([^]*?\$set: \{ guardAt: new Date\(\) \}/.test(dist) && /matchedCount === 1/.test(dist));
check("new inquiries refuse a suspended company's key at the start and again inside the submit transaction", /acceptsNewInquiries\(input\.supplierKey\)/.test(inq) && /guardCompanyWrite\(doc\.supplierKey, session\)/.test(inq) && /SUPPLIER_UNAVAILABLE/.test(inq) && /SUPPLIER_UNAVAILABLE/.test(read("src/app/api/public/inquiries/route.ts")));
check("authorization-grade product eligibility includes the owning company", /companyActiveNow\(d!\.companyId, session\)/.test(read("src/lib/catalog/approvedProducts.ts")) && /guardCompanyWrite/.test(elig) && /status !== "SUSPENDED"/.test(elig));
check("product approval refuses a suspended company's submission", /companyActiveNow\(cur\.companyId\)/.test(read("src/lib/admin/productReview.ts")));
check("a suspended company keeps ONLY support and account security: the guard opts in per page, every other supplier page and API still refuses it", /allowSuspended\?: boolean/.test(guards) && /opts\.allowSuspended && context\.company\.status === "SUSPENDED"/.test(guards) && /requireSupplierApi[^]*?status !== "ACTIVE"\) return \{ response: forbiddenResponse\(\) \}/.test(guards) && ["src/app/supplier/support/page.tsx", "src/app/supplier/security/page.tsx", "src/app/supplier/support/tickets/[ticketReference]/page.tsx"].every((p) => /allowSuspended: true/.test(read(p))) && !/allowSuspended/.test(read("src/app/supplier/orders/page.tsx") + read("src/app/supplier/quotations/page.tsx") + read("src/app/supplier/inquiries/page.tsx") + read("src/app/supplier/products/page.tsx")));
check("no session is revoked and no account is suspended by a company status change", !/sessionVersion|auth_sessions|accountStatus|signOutOtherDevices|revokeSession/.test(svc));
check("the page links to Company Links with a validated company id that only pre-fills a search (the destination re-authorizes)", /sellers\.map/.test(read("src/app/admin/company-links/page.tsx")) && /\^\[a-f0-9\]\{24\}\$/.test(read("src/app/admin/company-links/page.tsx")) && !/linkSeller|unlink/i.test(ui));
check("the UI shows no verification claim beyond 'Unverified', field-linked reason errors, native modal dialogs and a tablist", /verification\.label|Unverified/.test(ui) && !/Verified supplier|Not reviewed/.test(ui) && /aria-invalid=\{reasonError \? true : undefined\}/.test(ui) && (ui.match(/<dialog /g) ?? []).length === 2 && /role="tablist"/.test(ui) && /role="tabpanel"/.test(ui));
check("success is reported only after the server answered ok, a conflict reloads, and the idempotency key changes only with the request", /res\?\.ok && json\?\.ok/.test(ui) && /res\?\.status === 409\) reload\(\)/.test(ui) && /keyRef\.current\.sig !== sig/.test(ui));
check("list state and the open review are in the URL, search is debounced and stale requests are cancelled", /history\.replaceState/.test(ui) && /setTimeout\(\(\) => void load\(\), q \? 300 : 0\)/.test(ui) && /abort\.current\?\.abort\(\)/.test(ui));
check("Suppliers is a built sidebar entry and the page passes its own path, filters and review to the sign-in return", /key: "suppliers", label: "Suppliers"[^}]*built: true/.test(read("src/components/admin/AdminShell.tsx")) && /requireAdminPage\(next, "suppliers\.read"\)/.test(read("src/app/admin/suppliers/page.tsx")));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
