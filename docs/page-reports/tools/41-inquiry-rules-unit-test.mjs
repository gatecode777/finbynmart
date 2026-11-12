// Unit tests for src/lib/supplier/inquiryRules.ts (Page 41; pure module: message validation, status plan, eligibility, cursors).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/41-inquiry-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const load = (f) => import(pathToFileURL(path.join(root, f)).href);
const R = await load("src/lib/supplier/inquiryRules.ts");
const I = await load("src/lib/inquiries/rules.ts");

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const KEY = "a".repeat(16);
const body = (o = {}) => ({ type: "RESPONSE", message: "We can supply 500 metres within ten days.", idempotencyKey: KEY, ...o });

// ---------- message validation
let r = R.parseResponseBody(body());
check("M-01 a normal response parses: type, cleaned message, key", r.ok && r.value.type === "RESPONSE" && r.value.message === "We can supply 500 metres within ten days." && r.value.idempotencyKey === KEY);
check("M-02 a clarification parses", R.parseResponseBody(body({ type: "CLARIFICATION", message: "Which GSM do you need for this order?" })).ok);
check("M-03 only RESPONSE and CLARIFICATION are message types (no 'status', no lower case, no operator)", ["", "reply", "response", "ASK", { $ne: "x" }, 5, null].every((t) => !R.parseResponseBody(body({ type: t })).ok));
check("M-04 a message under 10 characters is refused; exactly 10 meaningful characters passes; over 2,000 is refused; exactly 2,000 passes", !R.parseResponseBody(body({ message: "too short" })).ok && R.parseResponseBody(body({ message: "Ten chars!" })).ok && !R.parseResponseBody(body({ message: "word ".repeat(401) })).ok && R.parseResponseBody(body({ message: ("lorem ipsum " + "x".repeat(2000)).slice(0, 2000) })).ok);
check("M-05 'meaningful': one repeated character, only punctuation, only digits of one kind, blank are refused (aaaaaaaaaaaa, !!!!!!!!!!!!, 111111111111, spaces)", ["aaaaaaaaaaaa", "!!!!!!!!!!!!", "111111111111", "            ", "...?!?!?!..."].every((m) => !R.parseResponseBody(body({ message: m })).ok) && R.isMeaningful("Price per metre?") === true);
check("M-06 plain-text cleaning: control characters become spaces, CRLF becomes one line break, runs of spaces collapse, three blank lines become one, ends are trimmed", R.cleanMessage("  a\u0000b\r\n\r\n\r\n\r\nc   d\t\te  ") === "a b\n\nc d e");
check("M-07 NFKC normalisation (full-width digits and ligatures)", R.cleanMessage("ＡＢＣ１２３ ﬁne") === "ABC123 fine");
check("M-08 HTML is kept as text (never interpreted) and a script tag is not removed or executed here", R.parseResponseBody(body({ message: "Please see <script>alert(1)</script> our price" })).value.message === "Please see <script>alert(1)</script> our price");
check("M-09 a non-text message (number, array, object with an operator) is refused", [5, ["x"], { $gt: "" }, null, undefined].every((m) => !R.parseResponseBody(body({ message: m })).ok));
check("M-10 FORGED fields are refused, not silently ignored: author, authorUserId, supplierKey, supplierCompanyId, buyerId, createdAt, status, attachments, messageId", ["author", "authorUserId", "supplierKey", "supplierCompanyId", "buyerId", "createdAt", "status", "attachments", "messageId"].every((k) => { const x = R.parseResponseBody(body({ [k]: "x" })); return !x.ok && "_" in x.fields && x.fields._.includes(k); }));
check("M-11 the idempotency key: 16 to 64 letters, digits, - and _; missing, short, long, spaces refused; the header can supply it", !R.parseResponseBody({ type: "RESPONSE", message: body().message }).ok && !R.parseResponseBody(body({ idempotencyKey: "short" })).ok && !R.parseResponseBody(body({ idempotencyKey: "a".repeat(65) })).ok && !R.parseResponseBody(body({ idempotencyKey: "has space has space" })).ok && R.parseResponseBody({ type: "RESPONSE", message: body().message }, KEY).ok);
r = R.parseResponseBody({ type: "nope", message: "x", idempotencyKey: "k", extra: 1 });
check("M-12 every problem is reported at once (type, message, key, forbidden field)", !r.ok && ["type", "message", "idempotencyKey", "_"].every((k) => k in r.fields));

// ---------- eligibility
const E = (status, buyer = true) => R.replyEligibility(status, buyer);
check("E-01 open inquiries can be answered: NEW, NOTIFIED, IN_PROGRESS, REPLIED, QUOTED and the legacy lower-case 'new'", ["NEW", "NOTIFIED", "IN_PROGRESS", "REPLIED", "QUOTED", "new", undefined].every((s) => E(s).ok));
check("E-02 closed, cancelled and declined inquiries cannot be answered (INQUIRY_CLOSED), with the reason in words", ["CLOSED", "CANCELLED", "REJECTED"].every((s) => { const x = E(s); return !x.ok && x.code === "INQUIRY_CLOSED" && x.message.length > 20; }));
check("E-03 a guest inquiry (no buyer account) cannot be answered (NOT_ELIGIBLE)", (() => { const x = E("NEW", false); return !x.ok && x.code === "NOT_ELIGIBLE"; })());
check("E-04 the respond permission predicate is exactly the permission flag", R.canRespond({ respondToInquiries: true }) === true && R.canRespond({ respondToInquiries: false }) === false && R.canRespond({}) === false);

// ---------- the inquiry's own lifecycle
const P = (s, t) => R.statusPlan(s, t).join(">");
check("S-01 RESPONSE: NEW and NOTIFIED go IN_PROGRESS > REPLIED, IN_PROGRESS goes to REPLIED, the legacy 'new' behaves as NEW", P("NEW", "RESPONSE") === "IN_PROGRESS>REPLIED" && P("NOTIFIED", "RESPONSE") === "IN_PROGRESS>REPLIED" && P("IN_PROGRESS", "RESPONSE") === "REPLIED" && P("new", "RESPONSE") === "IN_PROGRESS>REPLIED");
check("S-02 RESPONSE does not move an inquiry that is already REPLIED or QUOTED (no downgrade, no change)", P("REPLIED", "RESPONSE") === "" && P("QUOTED", "RESPONSE") === "");
check("S-03 CLARIFICATION only starts handling (NEW / NOTIFIED > IN_PROGRESS); it never sets REPLIED, QUOTED or a 'waiting' status (none exists)", P("NEW", "CLARIFICATION") === "IN_PROGRESS" && P("NOTIFIED", "CLARIFICATION") === "IN_PROGRESS" && P("IN_PROGRESS", "CLARIFICATION") === "" && P("REPLIED", "CLARIFICATION") === "");
check("S-04 NO message ever closes, cancels, rejects or quotes an inquiry, whatever the starting status", ["NEW", "NOTIFIED", "IN_PROGRESS", "REPLIED", "QUOTED", "CLOSED", "CANCELLED", "REJECTED"].every((s) => ["RESPONSE", "CLARIFICATION"].every((t) => R.statusPlan(s, t).every((x) => !["CLOSED", "CANCELLED", "REJECTED", "QUOTED"].includes(x)))));
check("S-05 every planned step is a transition the shared lifecycle allows, in order", ["NEW", "NOTIFIED", "IN_PROGRESS"].every((s) => { let cur = I.normaliseStatus(s); return R.statusPlan(s, "RESPONSE").every((next) => { const ok = I.canTransition(cur, next); cur = next; return ok; }); }));
check("S-06 terminal inquiries produce no steps", ["CLOSED", "CANCELLED", "REJECTED"].every((s) => P(s, "RESPONSE") === "" && P(s, "CLARIFICATION") === ""));

// ---------- cursors and list queries
const cur = { t: 1_762_900_000_000, id: "a".repeat(24) };
const enc = R.encodeCursor(cur);
check("C-01 a cursor round-trips and is URL safe", JSON.stringify(R.decodeCursor(enc)) === JSON.stringify(cur) && /^[A-Za-z0-9_-]+$/.test(enc));
check("C-02 malformed cursors are refused: not base64url, wrong shape, operator payloads, bad id, negative time, too long, non-text", [R.encodeCursor.name && "!!!", "abc", Buffer.from('{"$gt":1}').toString("base64url"), Buffer.from(JSON.stringify({ t: 1, id: "zz" })).toString("base64url"), Buffer.from(JSON.stringify({ t: -5, id: "a".repeat(24) })).toString("base64url"), Buffer.from(JSON.stringify({ t: "1", id: "a".repeat(24) })).toString("base64url"), "A".repeat(101), 5, null, ""].every((c) => R.decodeCursor(c) === null));
const q = (s) => R.parseListQuery(new URLSearchParams(s));
check("C-03 list query: default 20, 50 allowed, 51 / 0 / 1.5 / abc refused, a bad cursor refused, a good cursor passes", q("").ok && q("").limit === 20 && q("limit=50").ok && !q("limit=51").ok && !q("limit=0").ok && !q("limit=1.5").ok && !q("limit=abc").ok && !q("cursor=bad!").ok && q(`cursor=${enc}`).ok && q(`cursor=${enc}`).cursor.id === cur.id);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
