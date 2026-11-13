// Buyer requirement tracking, private supplier conversations and offer comparison: pure rules and STATIC structure checks (no database).
// run: AUTH_SECRET=unit-test-secret-unit-test-secret node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/64-buyer-conversations-unit-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
process.env.AUTH_SECRET ??= "unit-test-secret-unit-test-secret";
const root = path.resolve(import.meta.dirname, "../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log("PASS ", name); };
const { ObjectId } = await import("mongodb");
const Q = await import("../../../src/lib/quotations/quotationRules.ts");
const R = await import("../../../src/lib/supplier/inquiryRules.ts");
const C = await import("../../../src/lib/inquiries/conversations.ts");

const base = { reference: "A", inquiryReference: "FBM-INQ-AAAAAAAA", currency: "INR", unit: "Piece", quantity: 100, status: "SENT" };
const same = Q.compatibility([{ ...base, productKey: "p1" }, { ...base, reference: "B", productKey: "p1" }]);
check("same product, currency, unit and quantity are like for like", same.priceComparable && same.mismatches.length === 0);
const diffProduct = Q.compatibility([{ ...base, productKey: "p1" }, { ...base, reference: "B", productKey: "p2" }]);
check("different products are 'not directly comparable' with the specific reason", !diffProduct.priceComparable && diffProduct.mismatches.some((m) => m.field === "product" && /not directly comparable/.test(m.note)));
const unknownProduct = Q.compatibility([{ ...base, productKey: null }, { ...base, reference: "B", productKey: "p2" }]);
check("an unrecorded product is never claimed to differ", !unknownProduct.mismatches.some((m) => m.field === "product"));
check("currency, unit and quantity differences are each named and block price comparison", (() => { const c = Q.compatibility([{ ...base }, { ...base, reference: "B", currency: "USD", unit: "Box", quantity: 50 }]); return !c.priceComparable && ["currency", "unit", "quantity"].every((f) => c.mismatches.some((m) => m.field === f)); })());
check("an expired offer is flagged and nothing is ranked or called best", Q.compatibility([{ ...base }, { ...base, reference: "B", status: "EXPIRED" }]).mismatches.some((m) => m.field === "status") && !/>s*(best|cheapest|lowest)/i.test(read("src/components/buyer/quotations/CompareView.tsx")) && !/Best (value|price|offer)/.test(read("src/components/buyer/quotations/CompareView.tsx").replace(/"best value"/g, "")));

check("the supplier may send only RESPONSE or CLARIFICATION; BUYER_REPLY exists only as a stored type", R.MESSAGE_TYPES.map((t) => t.value).join() === "RESPONSE,CLARIFICATION" && R.MESSAGE_TYPE_LABEL.BUYER_REPLY === "Buyer reply");
const inq = new ObjectId(), inq2 = new ObjectId();
const t1 = C.conversationToken(inq, "SLR0001");
check("a conversation token is deterministic, opaque (no key inside) and unique per supplier and per requirement", t1 === C.conversationToken(inq, "SLR0001") && t1 !== C.conversationToken(inq, "SLR0002") && t1 !== C.conversationToken(inq2, "SLR0001") && !t1.includes("SLR0001") && /^[A-Za-z0-9_-]{24}$/.test(t1));

const svc = read("src/lib/inquiries/conversations.ts");
const post = read("src/app/api/buyer/inquiries/[id]/conversations/[conversation]/route.ts");
const list = read("src/app/api/buyer/inquiries/[id]/conversations/route.ts");
const msgs = read("src/lib/inquiries/messages.ts");
check("the requirement is always loaded by reference AND the session buyer", /inquiry\.buyerId\?\.toHexString\(\) === buyerId/.test(svc) && /ownedInquiry\(buyerId, reference\)/.test(svc));
check("every conversation read and write names inquiry, buyer and ONE supplier key", /inquiryId: c\.inquiry\._id, buyerId: c\.owner, supplierKey: c\.supplierKey/.test(svc) && /supplierKey: c\.supplierKey,\n    supplierCompanyId: company\._id/.test(svc));
check("a supplier is addressed by the server's token, resolved only among suppliers that replied or quoted (a matched company that merely has access is never reachable)", /distinct\("supplierKey"/.test(svc) && /sender: \{ \$ne: "BUYER" \}/.test(svc) && /conversationToken\(inquiry\._id!, k\) === token/.test(svc));
check("counts and offers exclude drafts, buyer replies and older versions", /status: \{ \$ne: "DRAFT" \}/.test(svc) && /isCurrent: true/.test(svc) && (svc.match(/sender: \{ \$ne: "BUYER" \}/g) ?? []).length >= 3);
check("labels are the required wording", /"Selected supplier"/.test(svc) && /"Additional matching supplier"/.test(svc));
check("a reply is exactly-once (unique buyer + key index, same key + same text = original, other text = 409)", /buyer_message_idempotency/.test(msgs) && /IDEMPOTENCY_CONFLICT/.test(svc) && /replayed: true/.test(svc));
check("a closed requirement refuses new messages but keeps history readable", /CLOSED\.includes\(c\.inquiry\.status\)/.test(svc) && /status: 409, code: "CLOSED"/.test(svc));
check("the notice is a durable intent on the row, deduplicated by the message id, preference-respecting and swept by the worker", /notice: \{ state: "PENDING", attempts: 0 \}/.test(svc) && /dedupeKey = `buyer-reply:\$\{m\._id\}`/.test(svc) && /SKIPPED_PREFERENCE/.test(svc) && /sweepBuyerReplyNotices/.test(read("src/lib/leads/distribution.ts")));
check("the notice carries no message text", !/body: m\.body|body: text/.test(svc.slice(svc.indexOf("deliverBuyerReplyNotice(id"))));
check("the reply route checks origin, auth, rate limit and reads only message + idempotencyKey", /isCrossSiteWrite\(request\)/.test(post) && /requireBuyerApi/.test(post) && /rateLimit\(/.test(post) && /body\.message, idempotencyKey: body\.idempotencyKey/.test(post) && !/body\.(supplier|company|sender|type|buyer)/.test(post));
check("both routes are buyer-only, private and no-store", /requireBuyerApi/.test(list) && /no-store/.test(list) && /no-store/.test(post));
check("conversations never create orders, accept offers or reject competitors", !/ordersCollection|confirmOrder|decideQuotation|requestRevision|collection\("orders"\)/.test(svc));
check("the supplier sees the buyer's reply inside its OWN conversation only (message rows carry that recipient's key)", /supplierKey: \{ \$in: party\.supplierKeys \}/.test(msgs) && /m\.type === "BUYER_REPLY" \? "Buyer replied"/.test(read("src/lib/supplier/inquiryService.ts")));
check("the requirement list shows batched reply and offer counts (no N+1)", /countsForInquiries\(buyerId, docs\.map/.test(read("src/lib/inquiries/buyerList.ts")) && /responseCount/.test(read("src/components/buyer/inquiries/BuyerInquiryTable.tsx")));
check("the conversation UI shows the recipient, keeps the text on failure, reuses one key per text and announces results", (() => { const u = read("src/components/buyer/inquiries/detail/SupplierConversations.tsx"); return /Reply to \{s\.name\}/.test(u) && /Only \{s\.name\} will see this message/.test(u) && /attempt\.current\.text !== message/.test(u) && /role="status"/.test(u) && /aria-describedby/.test(u) && /abort\.current\?\.abort\(\)/.test(u) && !/setText\(""\);\n\s+attempt\.current = null;\n\s+setAnnounce\(msg/.test(u); })());
check("comparison keeps stacked cards on narrow screens and labels the source of each offer", /compareCards/.test(read("src/components/buyer/quotations/CompareView.tsx")) && /Additional matching supplier/.test(read("src/components/buyer/quotations/CompareView.tsx")));
check("comparison only reads this buyer's current, submitted offers of ONE requirement", /buyerId, isCurrent: true, status: \{ \$ne: "DRAFT" \}/.test(read("src/lib/quotations/service.ts")) && /DIFFERENT_INQUIRIES/.test(read("src/lib/quotations/service.ts")));
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
