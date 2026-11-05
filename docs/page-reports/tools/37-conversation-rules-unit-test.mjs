// Unit tests for src/lib/support/conversationRules.ts (Page 37) and the pure helpers around it.
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/37-conversation-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const load = (p) => import(pathToFileURL(path.join(root, p)).href);
const C = await load("src/lib/support/conversationRules.ts");
const R = await load("src/lib/support/ticketRules.ts");
const S = await load("src/lib/support/conversationService.ts");

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? " — " + detail : ""}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const KEY = "abcdefghijklmnop1234";
const DAY = 86_400_000;
const ALL = R.TICKET_STATUSES;

// ---- replies
check("R-01 a normal reply is valid; text is trimmed and line breaks are kept", (() => { const r = C.validateReply({ message: "  Hello\n\nthere  ", idempotencyKey: KEY }); return r.ok && r.value.message === "Hello\n\nthere"; })());
check("R-02 empty, whitespace-only and one-character replies are refused", ["", "   \n  ", "a", " b "].every((m) => { const r = C.validateReply({ message: m, idempotencyKey: KEY }); return !r.ok && r.fields.message; }));
check("R-03 a two-character reply is the minimum; 2,000 characters is the maximum, 2,001 is refused", C.validateReply({ message: "ok", idempotencyKey: KEY }).ok && C.validateReply({ message: "x".repeat(2000), idempotencyKey: KEY }).ok && !C.validateReply({ message: "x".repeat(2001), idempotencyKey: KEY }).ok);
check("R-04 markup characters are refused; a missing or malformed send key is refused", !C.validateReply({ message: "<b>hi there</b>", idempotencyKey: KEY }).ok && !C.validateReply({ message: "hello", idempotencyKey: "short" }).ok && !C.validateReply({ message: "hello" }).ok);
check("R-05 a sender, role, status, visibility or ticket field in a reply is refused as unknown", ["senderId", "senderRole", "role", "status", "visibility", "ticketId", "buyerId", "attachments"].every((k) => { const r = C.validateReply({ message: "hello", idempotencyKey: KEY, [k]: "x" }); return !r.ok && r.fields[k]; }) && ["senderRole", "visibility", "status", "buyerId"].every((k) => C.FORBIDDEN_CONVERSATION_FIELDS.includes(k)));
check("R-06 a non-object body is refused", !C.validateReply(null).ok && !C.validateReply("hello").ok && !C.validateReply([1]).ok);

// ---- what a status allows
const replyOk = ALL.filter((s) => C.replyState(s).allowed);
check("S-01 a reply is allowed on open, assigned, in progress, waiting (either side) and reopened tickets, and not on resolved or closed ones", replyOk.join() === "OPEN,ASSIGNED,IN_PROGRESS,WAITING_FOR_BUYER,WAITING_FOR_SUPPORT,REOPENED" && !C.replyState("RESOLVED").allowed && !C.replyState("CLOSED").allowed);
check("S-02 a blocked reply carries a reason that says to reopen", /Reopen/.test(C.replyState("RESOLVED").reason) && /closed/.test(C.replyState("CLOSED").reason) && C.replyState("OPEN").reason === null);
check("S-03 only a buyer reply on a ticket waiting for the buyer changes the status, and only to In Progress; that is an allowed transition", ALL.every((s) => (s === "WAITING_FOR_BUYER" ? C.replyTransition(s) === "IN_PROGRESS" : C.replyTransition(s) === null)) && R.canTransition("WAITING_FOR_BUYER", "IN_PROGRESS"));
const now = new Date("2026-11-05T10:00:00Z");
check("S-04 reopening: only resolved or closed tickets; others give a reason", ALL.every((s) => (s === "RESOLVED" || s === "CLOSED" ? C.reopenState(s, new Date(now - DAY), 0, now).allowed : !C.reopenState(s, null, 0, now).allowed)));
check("S-05 reopening: allowed on day 30, refused after 30 days, with the window in the reason", C.reopenState("RESOLVED", new Date(now - 30 * DAY), 0, now).allowed && (() => { const r = C.reopenState("CLOSED", new Date(now - 31 * DAY), 0, now); return !r.allowed && /30 days/.test(r.reason); })());
check("S-06 reopening: at most three times", C.reopenState("RESOLVED", new Date(now), 2, now).allowed && (() => { const r = C.reopenState("RESOLVED", new Date(now), 3, now); return !r.allowed && /3 times/.test(r.reason); })());
check("S-07 reopening is a transition the shared table allows from resolved and closed, and from nowhere else", R.canTransition("RESOLVED", "REOPENED") && R.canTransition("CLOSED", "REOPENED") && ALL.filter((s) => R.canTransition(s, "REOPENED")).join() === "RESOLVED,CLOSED");
check("S-08 feedback: only on resolved or closed, and only once", ALL.every((s) => C.feedbackState(s, false).allowed === (s === "RESOLVED" || s === "CLOSED")) && !C.feedbackState("RESOLVED", true).allowed && /already/.test(C.feedbackState("RESOLVED", true).reason));

// ---- reopen and feedback input
check("O-01 a reopen reason of 10 to 1,000 characters is valid; shorter, empty, longer, markup and extra fields are refused", C.validateReopen({ reason: "Still not working." }).ok && !C.validateReopen({ reason: "short" }).ok && !C.validateReopen({ reason: "  " }).ok && !C.validateReopen({ reason: "x".repeat(1001) }).ok && !C.validateReopen({ reason: "<script>alert(1)</script>" }).ok && !C.validateReopen({ reason: "Still not working.", status: "OPEN" }).ok && C.validateReopen({ reason: "x".repeat(1000) }).ok);
check("F-01 a rating is a whole number from 1 to 5 (a number, not text)", [1, 2, 3, 4, 5].every((n) => C.validateFeedback({ rating: n }).ok) && [0, 6, -1, 2.5, "5", null, undefined, NaN, true].every((n) => !C.validateFeedback({ rating: n }).ok));
check("F-02 the comment is optional, trimmed, at most 1,000 characters, without markup", (() => { const r = C.validateFeedback({ rating: 4, feedbackText: "  Good help  " }); return r.ok && r.value.feedbackText === "Good help"; })() && C.validateFeedback({ rating: 4 }).ok && C.validateFeedback({ rating: 4, feedbackText: "" }).ok && !C.validateFeedback({ rating: 4, feedbackText: "x".repeat(1001) }).ok && !C.validateFeedback({ rating: 4, feedbackText: "<b>x</b>" }).ok);
check("F-03 buyer, ticket, status or any other field in feedback is refused", ["buyerId", "ticketId", "status", "createdAt", "visibility"].every((k) => !C.validateFeedback({ rating: 5, [k]: "x" }).ok));

// ---- ordering and cursors
const k1 = C.orderKey(new Date(5), "m", "0a");
check("K-01 an ordering key sorts by time, then events before messages, then id; and is a valid cursor", C.orderKey(1, "m", "ff") < C.orderKey(2, "e", "00") && C.orderKey(5, "e", "ff") < C.orderKey(5, "m", "00") && C.orderKey(5, "m", "01") < C.orderKey(5, "m", "02") && C.parseKey(k1)?.ms === 5 && C.parseKey(k1)?.source === "m");
check("K-02 keys of dates far apart still sort correctly as text (zero-padded)", C.orderKey(new Date("2026-11-05"), "m", "aa") > C.orderKey(new Date("2025-01-01"), "m", "aa") && C.orderKey(99, "m", "aa") < C.orderKey(100, "m", "aa"));
check("K-03 a malformed cursor is refused: wrong shape, operators, objects, long ids", ["abc", "1:m:zz", "000000000000005:x:0a", "000000000000005:m:" + "a".repeat(25), "{$gt:1}", "000000000000005:m:0A"].every((c) => C.parseKey(c) === null) && !C.parsePageQuery({ before: "{\"$ne\":1}" }, "before").ok && !C.parsePageQuery({ before: { $ne: 1 } }, "before").ok);
check("K-04 page size: default 20, 1 to 50 accepted, 0, 51, text and negatives refused", C.parsePageQuery({}, "after").value.limit === 20 && C.parsePageQuery({ limit: "50" }, "after").value.limit === 50 && C.parsePageQuery({ limit: "1" }, "after").ok && ["0", "51", "abc", "-1", "5.5", "1000"].every((l) => !C.parsePageQuery({ limit: l }, "after").ok));
check("K-05 a valid cursor is passed through only under its own name", C.parsePageQuery({ after: k1 }, "after").value.cursor === k1 && C.parsePageQuery({ after: k1 }, "before").value.cursor === null);

// ---- pure service helpers
const ev = (type, status, at) => ({ type, status, at: new Date(at), actor: "support" });
check("H-01 the resolved date is the LAST status event to resolved or closed, and null while the ticket is not resolved", (() => {
  const events = [ev("STATUS_CHANGED", "RESOLVED", "2026-10-01"), ev("REOPENED", "REOPENED", "2026-10-05"), ev("STATUS_CHANGED", "CLOSED", "2026-10-09")];
  return S.resolvedAtOf({ events, status: "CLOSED" })?.toISOString().startsWith("2026-10-09") && S.resolvedAtOf({ events, status: "OPEN" }) === null && S.resolvedAtOf({ events: [], status: "RESOLVED", resolvedAt: new Date("2026-09-01") })?.toISOString().startsWith("2026-09-01") && S.resolvedAtOf({ events: [], status: "RESOLVED" }) === null;
})());
check("H-02 reopenings are counted from the recorded events", S.reopenCountOf({ events: [ev("CREATED"), ev("REOPENED"), ev("STATUS_CHANGED"), ev("REOPENED")] }) === 2 && S.reopenCountOf({ events: [] }) === 0);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
