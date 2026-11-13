// Support staff tooling, notification producers and the product-list performance change: STATIC structure checks (no database).
// run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/61-support-notifications-perf-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };

const staff = read("src/lib/admin/supportStaff.ts");
check("internal notes are stored with visibility internal and public replies with visibility buyer", /visibility: input\.kind === "note" \? "internal" : "buyer"/.test(staff));
check("the staff identity is the signed-in admin, never a client field", /authorStaffId: staffId/.test(staff) && /new ObjectId\(guard\.user\.id\)/.test(read("src/app/api/admin/support/[reference]/route.ts")));
check("a status change uses the approved transition table and a conditional write", /canTransition\(t\.status, to\)/.test(staff) && /updateOne\(\{ _id: t\._id, status: t\.status \}/.test(staff));
check("a retry cannot create a second message (unique idempotency key per ticket)", /idempotencyKey: key/.test(staff) && /ticket_message_send_key/.test(read("src/lib/support/conversationService.ts")));
check("no notice or SLA is created for an internal note", /if \(input\.kind === "reply"\)\s*\{[\s\S]*notifySupplier/.test(staff));
check("owner-facing queries exclude internal notes (visibility buyer) and the message DTO is an allow-list", /visibility: "buyer"/.test(read("src/lib/support/conversationService.ts")) && !/authorStaffId/.test(read("src/lib/support/conversationService.ts").split("function messageDto")[1].split("}\n}")[0]));
check("every staff route needs the support.manage capability", (read("src/app/api/admin/support/route.ts") + read("src/app/api/admin/support/[reference]/route.ts")).match(/requireAdminApi\("support\.manage"\)/g).length === 3);
check("the staff list returns no requester e-mail or phone", !/email|phone/i.test(staff.split("listStaffTickets")[1].split("export interface StaffMessage")[0]));

const http = read("src/lib/quotations/http.ts");
check("a quotation decision notifies the supplier only after the service committed it", http.indexOf("decideQuotation(") < http.indexOf("noticeSupplier(reference, action)"));
check("the notice has a stable dedupe key and no message text", /dedupeKey: `quote:\$\{reference\}:\$\{q\.version\}:\$\{action\}`/.test(http) && !/body: .*message/.test(http));
check("a new inquiry notifies the owning company after the insert, with the product name only", /notifySellerOwner\(input\.supplierKey/.test(read("src/lib/inquiries/service.ts")) && /dedupeKey: `inquiry:\$\{reference\}`/.test(read("src/lib/inquiries/service.ts")));
check("the owner is resolved from unique seller ownership, never from a request", /findCompanyBySupplierKey\(sellerKey\)/.test(read("src/lib/supplier/notifyOwner.ts")) && /findOne\(\{ sellerKeys: key, status: "ACTIVE" \}/.test(read("src/lib/supplier/company.ts")));
check("notifySupplier still honours the preference for optional categories", /isSupplierCategoryEnabled/.test(read("src/lib/supplier/notifications.ts")));
const pref = read("src/lib/supplier/settingsRules.ts").split("export const CHANNELS")[0]; // the notice controls only, not the channel list
check("only the genuinely connected notice controls are enabled (inquiry, quotation, order); e-mail stays unavailable", (pref.match(/available: true/g) ?? []).length === 3 && /key: "marketingEmails"[^}]*available: false/.test(pref));

const prod = read("src/lib/supplier/productService.ts");
const list = prod.split("export async function getSupplierProducts")[1].split("export async function findOwnedProduct")[0];
check("the product list never loads all of a company's custom products", !/\.toArray\(\)[\s\S]*\.toArray\(\)[\s\S]*find\(base\)/.test(list) && /limit\(page \* limit\)/.test(list) && /countDocuments\(filter/.test(list));
check("the list reads at most a bounded window and sorts by indexed fields", /MERGE_WINDOW_MAX = 2000/.test(prod) && /supplier_products_by_name/.test(prod) && /supplier_products_by_price/.test(prod));
check("catalogue products are never given an invented stock or creation time", !/stock: 50/.test(prod) && /stock: null/.test(prod));
console.log(`\n${passed} passed, 0 failed`);
