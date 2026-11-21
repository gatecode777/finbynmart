// Admin Inquiry Management (Page 57): STATIC structure checks of the guards, the transaction design and the UI. These read source text: they catch a regression of a rule that
// was designed in, but they do NOT prove runtime behaviour (that is it-admin-inquiries.mjs, BLOCKED without an isolated database). run: node docs/page-reports/tools/72-admin-inquiries-structure-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const api = "src/app/api/admin/inquiries";
const routes = { list: `${api}/route.ts`, detail: `${api}/[reference]/route.ts`, recipients: `${api}/[reference]/recipients/route.ts`, activity: `${api}/[reference]/activity/route.ts`, routing: `${api}/[reference]/routing/route.ts`, distribution: `${api}/[reference]/distribution/route.ts`, exportRoute: `${api}/export/route.ts` };
const src = Object.fromEntries(Object.entries(routes).map(([k, p]) => [k, read(p)]));
const ops = read("src/lib/admin/inquiryOps.ts") + read("src/lib/admin/auditLog.ts");
const dist = read("src/lib/leads/distribution.ts");
const ui = read("src/components/admin/AdminInquiryReview.tsx") + read("src/components/admin/AdminInquiriesWorkspace.tsx");

check("every admin inquiry route guards with a capability before any work, and no route is public", Object.values(src).every((s) => /requireAdminApi\("inquiries\.[a-z]+"\)/.test(s)));
check("each read has its own capability on top of inquiries.read", /requireAdminApi\("inquiries\.recipients"\)/.test(src.recipients) && /requireAdminApi\("inquiries\.audit"\)/.test(src.activity) && /includes\("inquiries\.read"\)/.test(src.recipients) && /includes\("inquiries\.read"\)/.test(src.activity));
check("every state-changing route refuses cross-site requests, is rate limited and bounds the payload", ["routing", "distribution", "exportRoute"].every((k) => /isCrossSiteWrite\(request\)/.test(src[k]) && /rateLimit\(/.test(src[k]) && /readSmallJson\(request, (1_000|2_000)\)/.test(src[k])));
check("mutations read only the allowed body fields (no actor, status, eligibility or owner from the client)", /companyId: body\.companyId/.test(src.routing) && !/adminId|actorId|status:|supplierKey/.test(src.routing.replace(/\/\*[\s\S]*?\*\//g, "")) && /action, reason|reason: body\.reason, idempotencyKey: body\.idempotencyKey, expectedRev: body\.expectedRev/.test(src.distribution) && /ACTIONS\[action\]\.cap/.test(src.distribution));
check("pause/resume and retry/routing are separate capabilities", /pause: \{ cap: "inquiries\.distribution"/.test(src.distribution) && /retry: \{ cap: "inquiries\.routing"/.test(src.distribution) && /requireAdminApi\("inquiries\.routing"\)/.test(src.routing));
check("the export needs inquiries.read as well and is audited by counts and filter names, not content", /includes\("inquiries\.read"\)/.test(src.exportRoute) && (() => { const m = src.exportRoute.match(/insertOne\(\{[^]*?INQUIRIES_EXPORTED[^]*?\}\)/); return !!m && /rows: rows\.length/.test(m[0]) && !/message|requirement|buyer|reason/.test(m[0]); })());
check("every change and its audit row commit in ONE snapshot transaction, and the audit row carries the unique operation key", /withTransaction/.test(ops) && /readConcern: \{ level: "snapshot" \}, writeConcern: \{ w: "majority" \}/.test(ops) && /audit\.insertOne\([^]*?operationKey: p\.operationKey/.test(ops) && /audit_operation_unique/.test(ops) && /unique: true/.test(ops));
check("a replay is detected by the operation key and a changed request under the same key is a 409", /replayOf/.test(ops) && /prev\.bodyHash === p\.bodyHash/.test(ops) && /already used for a different request/.test(ops));
check("pause/resume/retry are conditional on the job state AND the admin revision, and increment it", /state: job\.state, \.\.\.\(revOf\(job\) === 0/.test(ops) && /\$inc: \{ adminRev: 1 \}/.test(ops) && /revOf\(job\) !== p\.expectedRev/.test(ops));
check("pausing drops the lease so a worker that loaded the job earlier cannot write about it again", /unset = \{ leaseOwner: "", leaseUntil: "" \}/.test(ops));
check("the worker's recipient commit writes the job document inside its transaction (the write a concurrent pause conflicts with) and abandons a paused job without writing a state", /findOneAndUpdate\(\{ _id: job\._id, state: "PROCESSING", leaseOwner: job\.leaseOwner \}/.test(dist) && /r === "paused"/.test(dist) && /abandoned/.test(dist) && /if \(abandoned\) \{/.test(dist));
check("routing repair reuses the worker's recipient routine, never a direct insert, and recomputes eligibility on the server (frozen candidate + current policy + not the direct company)", /addRecipientIn\(cur\.job, nowCand, session, false, "ADMIN_ROUTING"\)/.test(ops) && !/inquiry_recipients|recipients\.insertOne/.test(ops.replace(/distributionCollections/g, "")) && /await freeze\(job\)/.test(ops) && /outside the matching cutoff/.test(ops) && /directCompanyId/.test(ops));
check("the DIRECT recipient is only presented, never inserted", /kind: "DIRECT"/.test(ops) && !/insertOne\(\{[^}]*kind: "DIRECT"/.test(ops));
check("the lead notice is delivered after the commit by the existing routine (failure leaves it queued for the sweep)", /await deliverNotice\(recipientId\)\.catch\(\(\) => undefined\)/.test(ops) && /result\.ok && recipientId/.test(ops));
check("moderation is not offered: no restrict capability or route exists", !/inquiries\.restrict/.test(read("src/lib/admin/permissions.ts")) && /Restrict inquiry/.test(ui) && /disabled aria-describedby/.test(ui));
check("the UI shows reasons as field-linked errors, native modal dialogs and a tablist with keyboard navigation", /aria-invalid=\{reasonError \? true : undefined\}/.test(ui) && /aria-describedby=\{reasonError/.test(ui) && /role="alert"/.test(ui) && (ui.match(/<dialog /g) ?? []).length === 2 && /role="tablist"/.test(ui) && /ArrowRight/.test(ui) && /role="tabpanel"/.test(ui));
check("a request is never reported as a success unless the server answered ok, and a conflict reloads the state", /res\?\.ok && json\?\.ok/.test(ui) && /flashToast\("success"/.test(ui) && /res\?\.status === 409\) reload\(\)/.test(ui));
check("the idempotency key changes only when the request changes (so a retry reuses it)", /keyFor\(sig\)/.test(ui) && /keyRef\.current\.sig !== sig/.test(ui));
check("list state and the open review are kept in the URL, search is debounced and stale requests are cancelled", /history\.replaceState/.test(ui) && /setTimeout\(\(\) => void load\(\), q \? 300 : 0\)/.test(ui) && /abort\.current\?\.abort\(\)/.test(ui));
check("the page passes its own path, filters and open review to the sign-in return", /requireAdminPage\(returnPath\(qs\), "inquiries\.read"\)/.test(read("src/app/admin/inquiries/page.tsx")));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
