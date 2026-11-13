// Supplier lead inbox integration: STATIC structure checks of the existing services and screens (no database).
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/65-supplier-lead-inbox-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const R = await import("../../../src/lib/supplier/inquiryInboxRules.ts");

const list = read("src/lib/supplier/inquiryListService.ts");
const ui = read("src/components/supplier/inquiries/SupplierInboxWorkspace.tsx");
const acc = read("src/lib/leads/access.ts");
const dash = read("src/lib/supplier/dashboardService.ts");
const route = read("src/app/api/supplier/inquiries/list/route.ts");

check("the inbox has the three views with the required wording", R.INBOX_KINDS.map((k) => k.key).join() === "all,direct,matched" && R.INBOX_KINDS.find((k) => k.key === "direct").badge === "Buyer selected your company." && R.INBOX_KINDS.find((k) => k.key === "matched").badge === "Matches products your company supplies.");
check("the default view is All and the heading is Inquiries & Leads", /useState<InboxKind>\("all"\)/.test(ui) && /Inquiries &amp; Leads/.test(read("src/app/supplier/inquiries/page.tsx")));
check("All reads DIRECT (supplier keys) and MATCHED (denormalised key) in one indexed query, one row per inquiry", /\$or: \[\{ supplierKey: \{ \$in: keys \} \}, \{ matchedSupplierKeys: \{ \$in: keys \} \}\]/.test(list));
check("a matched row is shown only when this company's ACTIVE recipient relationship exists (the denormalised key is an index hint, not proof)", /state: "ACTIVE", inquiryId: \{ \$in: matchedIds \}/.test(list) && /if \(!direct && !mine\) return \[\]/.test(list));
check("matched rows carry the recipient's OWN status; a buyer close/cancel still shows", /CLOSED\.includes\(d\.status\) \? d\.status : mine\.status/.test(list));
check("the matching-leads list is the company's own recipient rows (company from the session) with no selected-supplier field", /companyId: ctx\.companyId, state: "ACTIVE"/.test(list) && !/supplierName/.test(list.slice(list.indexOf("async function listMatched"))));
check("rows show the delivery location and the DIRECT/MATCHED source", /location: locationOf/.test(list) && /r\.kind === "DIRECT" \? "Direct" : "Matched"/.test(ui) && /Delivery/.test(ui));
check("status tabs are not offered in All (their counts would mix two state models)", /kind !== "all" && <div className=\{s\.tabs\}/.test(ui));
check("search is escaped and anchored for references, bounded, paginated (max 50) and debounced with stale-request cancellation", /escapeRe\(term\)/.test(list) && /INBOX_MAX/.test(list) && /setTimeout\(\(\) => void load\(\), q \? 300 : 0\)/.test(ui) && /abort\.current\?\.abort\(\)/.test(ui));
check("a failed load is shown as an error with Retry, never as an empty list", /role="alert" className=\{s\.err\}/.test(ui) && /Could not load inquiries/.test(ui));
check("the list route needs a supplier session and the viewInquiries permission, is rate limited and private", /requireSupplierApi/.test(route) && /viewInquiries/.test(route) && /rateLimit/.test(route) && /private, no-store/.test(route));
check("the dashboard counts follow the inbox's scope: direct + matching leads, one per inquiry", /matchedReceivedCount\(context\.companyId/.test(dash) && /matchedPendingCount\(context\.companyId\)/.test(dash) && /matchedRecent\(context\.companyId/.test(dash));
check("matched pending = recipient status NEW on a requirement that is not closed", /status: "NEW" \}/.test(acc) && /\$nin: CLOSED_SET/.test(acc));
check("stale 'not available yet' copy about replies and the inquiries page is gone", !/replying inside Finbyn Mart is not available yet/.test(read("src/components/supplier/inquiries/ResponsePanel.tsx")) && !/inquiries list page is not built yet/.test(read("src/app/supplier/inquiries/[inquiryReference]/page.tsx")) && !/No inquiries: no seller is linked/.test(read("src/components/supplier/dashboard/SupplierDashboard.tsx")));
check("every supplier-side read of an inquiry for a reply or quotation goes through findInquiryFor (membership + recipient relationship on every mutation)", ["quoteService", "inquiryService", "quotationService", "quotationVersions"].every((f) => /findInquiryFor/.test(read(`src/lib/supplier/${f}.ts`))));
check("a supplier reply is idempotent per company + user + key and writes the message, the status step and the buyer notice intent in ONE transaction", /idempotency_scope_key/.test(read("src/lib/supplier/inquiryService.ts")) && /withTransaction/.test(read("src/lib/supplier/inquiryService.ts")) && /outbox\.insertOne/.test(read("src/lib/supplier/inquiryService.ts")));
check("quoting a MATCHED lead is possible only through the recipient's own view (its key, name and product), never a forged inquiry", /supplierKey: r\.recipientSupplierKey/.test(acc) && /findInquiryFor\(context, \{ reference \}, session\)/.test(read("src/lib/supplier/quoteService.ts")));
check("the buyer's private reply reaches only this supplier's conversation and notifies it once", /buyer-reply:\$\{m\._id\}/.test(read("src/lib/inquiries/conversations.ts")) && /supplierKey: c\.supplierKey/.test(read("src/lib/inquiries/conversations.ts")));
check("notification preferences suppress only the notice: the lead's authorized record is independent", /SKIPPED_PREFERENCE/.test(read("src/lib/leads/distribution.ts")) && /SKIPPED_PREFERENCE/.test(read("src/lib/inquiries/conversations.ts")));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
