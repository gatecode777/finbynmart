// Unit tests for src/lib/support/{ticketRules,faq,channels}.ts and the attachment checks in ticketService.ts.
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/36-support-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const load = (p) => import(pathToFileURL(path.join(root, p)).href);
const R = await load("src/lib/support/ticketRules.ts");
const F = await load("src/lib/support/faq.ts");
const C = await load("src/lib/support/channels.ts");
const S = await load("src/lib/support/ticketService.ts");

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const KEY = "k1234567890abcdef12";
const good = { category: "orders-delivery", subject: "Order delivery delay", description: "My order has not arrived yet.", idempotencyKey: KEY };
const V = (o = {}) => R.validateTicket({ ...good, ...o });

check("T-01 a valid ticket passes, with the text cleaned and the related record optional", V().ok && V().value.related === null && V({ related: { type: "order", reference: "FBM-ORD-QAAAAA01" } }).value.related.type === "order");
check("T-02 category is required and must be one of the eleven configured values", !V({ category: "" }).ok && !V({ category: undefined }).ok && !V({ category: "nope" }).ok && R.SUPPORT_CATEGORIES.length === 11 && R.SUPPORT_CATEGORIES.every((c) => V({ category: c.value }).ok));
check("T-03 subject: 5 to 150 characters, no markup; whitespace does not count", !V({ subject: "abcd" }).ok && V({ subject: "abcde" }).ok && V({ subject: "a".repeat(150) }).ok && !V({ subject: "a".repeat(151) }).ok && !V({ subject: "     " }).ok && !V({ subject: "<b>hello</b>" }).ok && !V({ subject: 12345 }).ok);
check("T-04 description: 10 to 1,000 characters, whitespace-only refused, no markup, line breaks kept", !V({ description: "short" }).ok && V({ description: "x".repeat(1000) }).ok && !V({ description: "x".repeat(1001) }).ok && !V({ description: "   \n \t  " }).ok && !V({ description: "<script>alert(1)</script> hello" }).ok && V({ description: "line one is here\nline two is here" }).value.description.includes("\n"));
check("T-05 related: a type from the list (inquiry, quotation, order, product) and a reference-like text; invoice and payment do not exist; a bad shape is refused", V({ related: { type: "inquiry", reference: "FBM-INQ-AAAAAAAA" } }).ok && !V({ related: { type: "invoice", reference: "X" } }).ok && !V({ related: { type: "payment", reference: "X" } }).ok && !V({ related: { type: "order", reference: "a b" } }).ok && !V({ related: { type: "order" } }).ok && !V({ related: "order" }).ok && V({ related: null }).ok && V({ related: "" }).ok);
check("T-06 fields only the server sets are refused: status, priority, buyerId, assignedAgentId, reference, events...", ["status", "priority", "buyerId", "assignedAgentId", "ticketReference", "events", "createdAt", "internalNotes", "anything"].every((k) => { const r = V({ [k]: "x" }); return !r.ok && k in r.fields; }) && R.FORBIDDEN_TICKET_FIELDS.includes("priority"));
check("T-07 the submission key is required (16 to 64 safe characters): it is what makes a retried or double-clicked submit one ticket", !V({ idempotencyKey: "short" }).ok && !V({ idempotencyKey: undefined }).ok && !V({ idempotencyKey: "has spaces in it 1234" }).ok && V({ idempotencyKey: "a".repeat(64) }).ok && !V({ idempotencyKey: "a".repeat(65) }).ok);
check("T-08 several problems are reported together on their own fields", (() => { const r = R.validateTicket({ subject: "x", description: "", category: "" }); return !r.ok && ["category", "subject", "description", "idempotencyKey"].every((k) => k in r.fields); })());

check("S-01 eight statuses, each with a label; the three card groups cover every status exactly once", R.TICKET_STATUSES.length === 8 && R.TICKET_STATUSES.every((s) => R.STATUS_LABEL[s]) && R.TICKET_STATUSES.every((s) => ["open", "in_progress", "resolved"].includes(R.groupOf(s))) && Object.values(R.GROUP_STATUSES).flat().length === 8);
check("S-02 grouping: open = open, assigned, reopened, waiting for you; in progress = in progress, waiting for support; resolved = resolved, closed", R.groupOf("OPEN") === "open" && R.groupOf("ASSIGNED") === "open" && R.groupOf("REOPENED") === "open" && R.groupOf("WAITING_FOR_BUYER") === "open" && R.groupOf("IN_PROGRESS") === "in_progress" && R.groupOf("WAITING_FOR_SUPPORT") === "in_progress" && R.groupOf("RESOLVED") === "resolved" && R.groupOf("CLOSED") === "resolved");
check("S-03 valid transitions are allowed (open to assigned, assigned to in progress, resolved to closed or reopened, closed to reopened)", R.canTransition("OPEN", "ASSIGNED") && R.canTransition("ASSIGNED", "IN_PROGRESS") && R.canTransition("RESOLVED", "CLOSED") && R.canTransition("RESOLVED", "REOPENED") && R.canTransition("CLOSED", "REOPENED"));
check("S-04 invalid transitions are refused (closed cannot jump to in progress, resolved cannot go back to open, nothing moves to itself)", !R.canTransition("CLOSED", "IN_PROGRESS") && !R.canTransition("RESOLVED", "OPEN") && !R.canTransition("OPEN", "REOPENED") && R.TICKET_STATUSES.every((s) => !R.canTransition(s, s)));

check("R-01 ticket references: FBM-SUP-YYYYMM-XXXXXX; the Contact Us form's 8-character references are not tickets", R.TICKET_REFERENCE_PATTERN.test("FBM-SUP-202611-7K3M9Q") && !R.TICKET_REFERENCE_PATTERN.test("FBM-SUP-7K3M9QX2") && !R.TICKET_REFERENCE_PATTERN.test("FBM-SUP-202611-7K3M9I") && !R.TICKET_REFERENCE_PATTERN.test("FBM-SUP-202611-7K3M9") && !R.TICKET_REFERENCE_PATTERN.test("fbm-sup-202611-7k3m9q"));
check("R-02 generated references match the pattern, carry the month in India time, and do not repeat in 2,000 draws", (() => { const seen = new Set(); for (let i = 0; i < 2000; i++) seen.add(S.generateTicketReference(new Date("2026-11-05T10:00:00Z"))); return seen.size === 2000 && [...seen].every((r) => R.TICKET_REFERENCE_PATTERN.test(r) && r.startsWith("FBM-SUP-202611-")); })() && S.generateTicketReference(new Date("2026-10-31T19:00:00Z")).startsWith("FBM-SUP-202611-") && S.generateTicketReference(new Date("2026-10-31T17:00:00Z")).startsWith("FBM-SUP-202610-"));

const Q = (o = {}) => R.parseTicketQuery(o);
check("Q-01 defaults: newest, page 1, 20 per page, all statuses", JSON.stringify({ ...Q().value, window: null }) === JSON.stringify({ q: "", status: "all", categoryId: null, relatedEntityType: null, window: null, sort: "newest", page: 1, limit: 20 }));
check("Q-02 status accepts all and each of the eight (any case); category and related type are from the lists; sort is one of three", R.STATUS_FILTER_VALUES.every((s) => Q({ status: s }).ok) && Q({ status: "WAITING_FOR_BUYER" }).ok && !Q({ status: "pending" }).ok && Q({ categoryId: "quotations" }).ok && !Q({ categoryId: "x" }).ok && Q({ relatedEntityType: "order" }).ok && !Q({ relatedEntityType: "invoice" }).ok && ["newest", "oldest", "updated"].every((s) => Q({ sort: s }).ok) && !Q({ sort: "priority" }).ok);
check("Q-03 search: trimmed and collapsed, 60 allowed, 61 refused, objects refused; page 1 to 1000 and limit 1 to 50, whole numbers; operator-style input refused", Q({ q: "  FBM   SUP " }).value.q === "FBM SUP" && Q({ q: "a".repeat(60) }).ok && !Q({ q: "a".repeat(61) }).ok && !Q({ q: { $ne: "" } }).ok && !Q({ page: "0" }).ok && !Q({ page: "1001" }).ok && !Q({ limit: "51" }).ok && Q({ limit: "50", page: "1000" }).ok && !Q({ limit: "1.5" }).ok);
check("Q-04 date windows use the India-time rules: presets and custom pairs accepted; reversed, half-given or unknown refused; unknown parameters (buyerId) ignored", Q({ range: "30d" }).value.window.key === "30d" && Q({ range: "custom", dateFrom: "2026-01-01", dateTo: "2026-01-31" }).ok && !Q({ range: "custom", dateFrom: "2026-02-01", dateTo: "2026-01-01" }).ok && !Q({ range: "custom", dateFrom: "2026-01-01" }).ok && !Q({ range: "forever" }).ok && Q({ buyerId: "x" }).ok && !("buyerId" in Q({ buyerId: "x" }).value));

const SRC = [
  { id: "a", category: "orders", question: "Published one", answer: "Alpha answer", published: true, order: 2 },
  { id: "b", category: "orders", question: "Draft one", answer: "Hidden draft text", published: false, order: 1 },
  { id: "c", category: "products", question: "Another published", answer: "Beta answer", published: true, order: 1 },
];
check("F-01 only published FAQs are returned; a draft never is, whatever the category or search", F.getPublishedFaqs({}, SRC).map((f) => f.id).join() === "c,a" && F.getPublishedFaqs({ q: "hidden draft" }, SRC).length === 0 && F.getPublishedFaqs({ category: "orders" }, SRC).map((f) => f.id).join() === "a");
check("F-02 FAQ search covers question and answer, ignores case, and is bounded", F.getPublishedFaqs({ q: "ALPHA" }, SRC).map((f) => f.id).join() === "a" && F.getPublishedFaqs({ q: "another" }, SRC).length === 1 && F.getPublishedFaqs({ q: "zzz" }, SRC).length === 0);
check("F-03 a category with no published FAQ is not offered (a draft does not make one)", (() => { const c = F.getFaqCategories(SRC); return c.map((x) => x.value).sort().join() === "orders,products" && c.find((x) => x.value === "orders").count === 1; })());
check("F-04 the shipped FAQ content: every item is published with a question and an answer, and it states no policy that does not exist (no payment options, fees, refund or return windows, delivery promises, response times)", F.FAQS.length >= 10 && F.FAQS.every((f) => f.question.length > 5 && f.answer.length > 20) && !F.FAQS.some((f) => /refund (within|policy)|return (window|within|policy)|\b\d+\s*(business\s*)?(hours|days)\b|free (shipping|delivery)|\bfees?\b|we guarantee|guaranteed (delivery|refund|price|response)|money-back|24\s*\/\s*7|payment (options|methods)|credit card|UPI|escrow/i.test(f.question + " " + f.answer)) && !R.FAQ_CATEGORIES.some((c) => /payment|delivery|return/i.test(c.label)));

check("C-01 with nothing configured the channels are only the ticket, Contact Us and chat marked not available: no e-mail, no phone, nothing Online", (() => { const c = C.getSupportChannels({}); return c.map((x) => x.key).join() === "ticket,contact,chat" && c.find((x) => x.key === "chat").available === false && !JSON.stringify(c).match(/online/i) && c.every((x) => !x.detail); })());
check("C-02 a configured e-mail, phone and hours appear exactly as configured (mailto and tel links)", (() => { const c = C.getSupportChannels({ SUPPORT_EMAIL: "help@example.org", SUPPORT_PHONE: "+91 80 0000 0000", SUPPORT_HOURS: "Mon - Fri, 10:00 - 17:00" }); const e = c.find((x) => x.key === "email"), p = c.find((x) => x.key === "phone"); return e.detail === "help@example.org" && e.href === "mailto:help@example.org" && p.detail === "+91 80 0000 0000" && p.href === "tel:+918000000000" && p.note === "Mon - Fri, 10:00 - 17:00"; })());
check("C-03 an invalid e-mail or phone is ignored (not shown), markup in the hours is dropped; live chat stays not available however it is configured", (() => { const c = C.getSupportChannels({ SUPPORT_EMAIL: "not-an-email", SUPPORT_PHONE: "call me", SUPPORT_HOURS: "<b>x</b>", SUPPORT_CHAT: "online" }); return !c.some((x) => x.key === "email" || x.key === "phone") && c.find((x) => x.key === "chat").available === false; })() && C.getSupportChannels({ SUPPORT_PHONE: "+91 80 0000 0000", SUPPORT_HOURS: "<b>x</b>" }).find((x) => x.key === "phone").note === null);

const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(100, 1)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 2)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 3)]);
const lim = { maxFiles: 5, maxMb: 10, maxBytes: 10 * 1024 * 1024, types: ["pdf", "jpg", "png"] };
const A = (files) => S.checkAttachments(files, lim);
check("U-01 PDF, PNG and JPG (also .jpeg) whose content really is that type are accepted", A([{ name: "a.pdf", bytes: pdf }, { name: "b.png", bytes: png }, { name: "c.jpg", bytes: jpg }, { name: "d.JPEG", bytes: jpg }]).ok);
check("U-02 the content decides: a text file named .pdf, a PNG named .jpg and an unknown type are refused; so is an empty file", !A([{ name: "a.pdf", bytes: Buffer.from("hello world, not a pdf at all") }]).ok && !A([{ name: "a.jpg", bytes: png }]).ok && !A([{ name: "a.exe", bytes: pdf }]).ok && !A([{ name: "a.pdf", bytes: Buffer.alloc(0) }]).ok && !A([{ name: "noext", bytes: pdf }]).ok);
check("U-03 limits: five files are fine, six refused; a file over the limit is refused; the limits come from the configuration", A(Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.pdf`, bytes: pdf }))).ok && !A(Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.pdf`, bytes: pdf }))).ok && !A([{ name: "big.pdf", bytes: Buffer.concat([pdf, Buffer.alloc(lim.maxBytes)]) }]).ok && S.checkAttachments([{ name: "a.pdf", bytes: pdf }, { name: "b.pdf", bytes: pdf }], { ...lim, maxFiles: 1 }).ok === false);
check("U-04 limits configuration: defaults 5 files and 10 MB; a valid environment value is used within the ceilings; an invalid or too large value falls back to the default", (() => { const keep = { f: process.env.SUPPORT_ATTACH_MAX_FILES, m: process.env.SUPPORT_ATTACH_MAX_MB }; try { delete process.env.SUPPORT_ATTACH_MAX_FILES; delete process.env.SUPPORT_ATTACH_MAX_MB; const d = S.attachmentLimits(); process.env.SUPPORT_ATTACH_MAX_FILES = "3"; process.env.SUPPORT_ATTACH_MAX_MB = "2"; const c = S.attachmentLimits(); process.env.SUPPORT_ATTACH_MAX_FILES = "99"; process.env.SUPPORT_ATTACH_MAX_MB = "abc"; const b = S.attachmentLimits(); return d.maxFiles === 5 && d.maxMb === 10 && c.maxFiles === 3 && c.maxMb === 2 && b.maxFiles === 5 && b.maxMb === 10; } finally { for (const [k, v] of [["SUPPORT_ATTACH_MAX_FILES", keep.f], ["SUPPORT_ATTACH_MAX_MB", keep.m]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } } })());

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n" + failures.join("\n"));
  process.exit(1);
}
