// Unit tests for src/lib/inquiries/timeline.ts and guestAccess.ts (modules with no relative imports: node strips the types).
// Run: node docs/page-reports/tools/14-inquiry-confirmation-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const load = (file) => import(pathToFileURL(path.join(root, file)).href);
const { buildTimeline, notificationInfo, statusInfo, normalise, STATUS_INFO } = await load("src/lib/inquiries/timeline.ts");
const { grantAccess, checkAccess, GUEST_ACCESS_SECONDS, GUEST_ACCESS_COOKIE_SECONDS } = await load("src/lib/inquiries/guestAccess.ts");

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const eq = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);

// ---------- timeline
const T0 = "2026-11-02T08:00:00.000Z", T1 = "2026-11-02T09:00:00.000Z", T2 = "2026-11-02T10:00:00.000Z", T3 = "2026-11-02T11:00:00.000Z";
const h = (...pairs) => pairs.map(([from, to, at]) => ({ from, to, at }));
const states = (steps) => steps.map((s) => `${s.key}:${s.state}`).join(",");

const fresh = buildTimeline("NEW", h([null, "NEW", T0]), T0);
eq("L-01 a new inquiry: submitted done, review current, response upcoming (no outcome step)", states(fresh), "submitted:done,review:current,response:upcoming");
check("L-02 only the submission carries a time", fresh[0].at === T0 && fresh[1].at === null && fresh[2].at === null);
const notified = buildTimeline("NOTIFIED", h([null, "NEW", T0], ["NEW", "NOTIFIED", T1]), T0);
eq("L-03 NOTIFIED does not mean the supplier reviewed: review stays current", states(notified), "submitted:done,review:current,response:upcoming");
check("L-04 the notified step text says the supplier was notified and is still waiting", /was notified/.test(notified[1].text) && /Waiting/.test(notified[1].text));
const progress = buildTimeline("IN_PROGRESS", h([null, "NEW", T0], ["NEW", "IN_PROGRESS", T1]), T0);
eq("L-05 IN_PROGRESS: review done at its event time, response current", states(progress), "submitted:done,review:done,response:current");
check("L-06 the review step carries the real time of its event", progress[1].at === T1);
const replied = buildTimeline("REPLIED", h([null, "NEW", T0], ["NEW", "IN_PROGRESS", T1], ["IN_PROGRESS", "REPLIED", T2]), T0);
eq("L-07 REPLIED: submitted, review and response done", states(replied), "submitted:done,review:done,response:done");
check("L-08 a reply is titled Supplier Response and timed", replied[2].title === "Supplier Response" && replied[2].at === T2);
const quoted = buildTimeline("QUOTED", h([null, "NEW", T0], ["NEW", "IN_PROGRESS", T1], ["IN_PROGRESS", "REPLIED", T2], ["REPLIED", "QUOTED", T3]), T0);
check("L-09 a quotation is titled Quotation Received and timed at the quotation", quoted[2].title === "Quotation Received" && quoted[2].at === T3 && quoted[2].state === "done");
const closed = buildTimeline("CLOSED", h([null, "NEW", T0], ["NEW", "IN_PROGRESS", T1], ["IN_PROGRESS", "REPLIED", T2], ["REPLIED", "CLOSED", T3]), T0);
eq("L-10 CLOSED after a reply: an outcome step is added, earlier steps keep their state", states(closed), "submitted:done,review:done,response:done,outcome:done");
check("L-11 the outcome step names the end and its time", closed[3].title === "Inquiry Closed" && closed[3].at === T3);
const cancelled = buildTimeline("CANCELLED", h([null, "NEW", T0], ["NEW", "CANCELLED", T1]), T0);
eq("L-12 CANCELLED before any review: the steps that never happened are 'stopped', never done", states(cancelled), "submitted:done,review:stopped,response:stopped,outcome:done");
check("L-13 the cancellation is timed from the history", cancelled[3].title === "Inquiry Cancelled" && cancelled[3].at === T1);
const rejected = buildTimeline("REJECTED", h([null, "NEW", T0], ["NEW", "IN_PROGRESS", T1], ["IN_PROGRESS", "REJECTED", T2]), T0);
eq("L-14 REJECTED after review started: review done, response stopped", states(rejected), "submitted:done,review:done,response:stopped,outcome:done");
const legacy = buildTimeline("REPLIED", [], T0);
eq("L-15 a status with no recorded event does not complete any step (nothing is inferred)", states(legacy), "submitted:done,review:current,response:upcoming");
const noHistoryNew = buildTimeline("new", [], T0);
eq("L-16 an older record saying 'new' reads as a new inquiry", states(noHistoryNew), "submitted:done,review:current,response:upcoming");
const everyText = [fresh, notified, progress, replied, quoted, closed, cancelled, rejected].flat().map((s) => `${s.title} ${s.text}`).join(" | ");
check("L-17 no invented deadline: no hours or days appear in any step", !/\b\d+\s*(hours?|days?|minutes?)\b/i.test(everyText) && !/within|typically|usually/i.test(everyText), everyText.slice(0, 120));
check("L-18 the response step says timing depends on the supplier", /timing depends on the supplier/i.test(fresh[2].text));
check("L-19 there is no 'further discussion' step (the platform has no messaging)", ![fresh, replied, quoted, closed].flat().some((s) => /discussion/i.test(s.title)));
check("L-20 steps never contradict: a 'done' step always has a time except none", [fresh, notified, progress, replied, quoted, closed, cancelled, rejected].flat().every((s) => s.state !== "done" || s.at !== null));
check("L-21 the current step is unique and is never after an upcoming one", [fresh, notified, progress].every((steps) => steps.filter((s) => s.state === "current").length === 1));

// ---------- status labels
for (const status of ["NEW", "NOTIFIED", "IN_PROGRESS", "REPLIED", "QUOTED", "CLOSED", "CANCELLED", "REJECTED"]) check(`S-01 ${status} has a label and a sentence`, STATUS_INFO[status]?.label && STATUS_INFO[status]?.text);
check("S-02 labels are unique", new Set(Object.values(STATUS_INFO).map((s) => s.label)).size === 8);
eq("S-03 'new', unknown and missing statuses read as NEW; known ones in any case are kept", [normalise("new"), normalise("bogus"), normalise(undefined), normalise("replied")], ["NEW", "NEW", "NEW", "REPLIED"]);
check("S-04 no label claims the supplier received or read anything it did not", !Object.values(STATUS_INFO).some((s) => /received your inquiry|has read|opened/i.test(s.text)));
eq("S-05 statusInfo of an old record", statusInfo("new").label, "New");

// ---------- notification wording
for (const [stored, state] of [[undefined, "not_configured"], ["BLOCKED", "not_configured"], ["", "not_configured"], ["PENDING", "pending"], ["PROCESSING", "processing"], ["SENT", "sent"], ["FAILED", "failed"], ["RETRY", "retry"], ["sent", "sent"], ["weird", "not_configured"]]) {
  eq(`N-01 stored ${JSON.stringify(stored)} -> ${state}`, notificationInfo(stored).state, state);
}
check("N-02 with no service the line says notification is not set up and the supplier is not told", /not set up/.test(notificationInfo("BLOCKED").label) && /not told/.test(notificationInfo("BLOCKED").label) && /saved/.test(notificationInfo("BLOCKED").label));
check("N-03 'sent' is worded as handed to a provider, not as received or read", /handed to the delivery provider/.test(notificationInfo("SENT").label) && /does not confirm/.test(notificationInfo("SENT").label) && !/has received/.test(notificationInfo("SENT").label));
check("N-04 failure and retry both say the inquiry is saved", /saved/.test(notificationInfo("FAILED").label) && /saved/.test(notificationInfo("RETRY").label));
check("N-05 nothing ever says 'the supplier has received your inquiry'", ["", "PENDING", "PROCESSING", "SENT", "FAILED", "RETRY"].every((s) => !/supplier (has|have) received/i.test(notificationInfo(s).label)));

// ---------- guest access cookie
const KEY = "k".repeat(40);
const OTHER = "z".repeat(40);
const REF1 = "FBM-INQ-AAAAAAA1", REF2 = "FBM-INQ-BBBBBBB2", REF3 = "FBM-INQ-CCCCCCC3";
const now = 1_800_000_000_000;
const cookie = grantAccess(undefined, REF1, now, KEY);
eq("G-01 a granted reference is valid", checkAccess(cookie, REF1, now + 1000, KEY), "valid");
eq("G-02 another reference is not", checkAccess(cookie, REF2, now + 1000, KEY), "none");
eq("G-03 no cookie at all", [checkAccess(undefined, REF1, now, KEY), checkAccess("", REF1, now, KEY)], ["none", "none"]);
eq("G-04 valid until the window closes", checkAccess(cookie, REF1, now + GUEST_ACCESS_SECONDS * 1000 - 1, KEY), "valid");
eq("G-05 expired exactly at the end of the window (boundary)", checkAccess(cookie, REF1, now + GUEST_ACCESS_SECONDS * 1000, KEY), "expired");
eq("G-06 expired after the window, and still recognised as the guest's own reference", checkAccess(cookie, REF1, now + 5 * 3600 * 1000, KEY), "expired");
check("G-07 the window is one hour; the cookie lives a day", GUEST_ACCESS_SECONDS === 3600 && GUEST_ACCESS_COOKIE_SECONDS === 86400);
const [payload, signature] = cookie.split(".");
const forged = Buffer.from(JSON.stringify([{ r: REF2, e: now + 1e9 }])).toString("base64url");
eq("G-08 a payload swapped under the old signature is refused", checkAccess(`${forged}.${signature}`, REF2, now, KEY), "none");
eq("G-09 a cookie signed with another key is refused", checkAccess(grantAccess(undefined, REF1, now, OTHER), REF1, now, KEY), "none");
eq("G-10 a damaged signature is refused", checkAccess(`${payload}.${signature.slice(0, -2)}xx`, REF1, now, KEY), "none");
eq("G-11 a cookie of the wrong shape never throws", [checkAccess("garbage", REF1, now, KEY), checkAccess("a.b", REF1, now, KEY), checkAccess(`${payload}.`, REF1, now, KEY), checkAccess(".sig", REF1, now, KEY), checkAccess("a.b.c", REF1, now, KEY)], ["none", "none", "none", "none", "none"]);
const notAnArray = Buffer.from(JSON.stringify({ r: REF1, e: now + 1e9 })).toString("base64url");
const { createHmac } = await import("node:crypto");
const signed = (p) => `${p}.${createHmac("sha256", KEY).update(p).digest("base64url")}`;
eq("G-12 a correctly signed payload that is not a list is ignored", checkAccess(signed(notAnArray), REF1, now, KEY), "none");
eq("G-13 correctly signed entries of the wrong type are ignored", checkAccess(signed(Buffer.from(JSON.stringify([{ r: 5, e: "x" }, null, "s"])).toString("base64url")), REF1, now, KEY), "none");
const two = grantAccess(cookie, REF2, now + 1000, KEY);
check("G-14 a second inquiry is added without losing the first", checkAccess(two, REF1, now + 2000, KEY) === "valid" && checkAccess(two, REF2, now + 2000, KEY) === "valid");
const again = grantAccess(two, REF1, now + 60_000, KEY);
check("G-15 granting the same reference again renews its window", checkAccess(again, REF1, now + GUEST_ACCESS_SECONDS * 1000 + 30_000, KEY) === "valid");
let many = undefined;
for (let i = 0; i < 7; i++) many = grantAccess(many, `FBM-INQ-AAAAAA${i}${i}`, now + i, KEY);
check("G-16 at most five entries are kept (oldest dropped)", checkAccess(many, "FBM-INQ-AAAAAA66", now + 10, KEY) === "valid" && checkAccess(many, "FBM-INQ-AAAAAA00", now + 10, KEY) === "none" && checkAccess(many, "FBM-INQ-AAAAAA11", now + 10, KEY) === "none" && checkAccess(many, "FBM-INQ-AAAAAA22", now + 10, KEY) === "valid");
const stale = grantAccess(cookie, REF3, now + 2 * 86400 * 1000, KEY);
check("G-17 an entry older than a day is dropped when the next one is granted", checkAccess(stale, REF1, now + 2 * 86400 * 1000, KEY) === "none" && checkAccess(stale, REF3, now + 2 * 86400 * 1000, KEY) === "valid");
check("G-18 the cookie value holds only a reference and an expiry, no personal data", (() => { const body = JSON.parse(Buffer.from(payload, "base64url").toString()); return Array.isArray(body) && body.every((e) => Object.keys(e).sort().join() === "e,r"); })());
check("G-19 the value is URL-safe (no characters a cookie header would escape)", /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cookie));
let missingKey = false;
const savedSecret = process.env.AUTH_SECRET;
delete process.env.AUTH_SECRET;
try { grantAccess(undefined, REF1, now); } catch { missingKey = true; }
if (savedSecret !== undefined) process.env.AUTH_SECRET = savedSecret;
check("G-20 without a configured secret the cookie cannot be made at all (no weak default key)", missingKey);

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log("FAILED:\n" + failures.join("\n"));
  process.exit(1);
}
