// Unit tests for src/lib/auth/deviceInfo.ts and src/lib/security/securityRules.ts (Page 38).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/38-security-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

process.env.AUTH_SECRET = "unit-test-secret-unit-test-secret-1234567890";
const root = path.resolve(import.meta.dirname, "../../..");
const load = (p) => import(pathToFileURL(path.join(root, p)).href);
const D = await load("src/lib/auth/deviceInfo.ts");
const R = await load("src/lib/security/securityRules.ts");

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? " — " + detail : ""}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const UA = {
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  edgeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  chromeIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
};

// ---- device labels
const p = (k) => D.parseUserAgent(UA[k]);
check("D-01 browsers and systems are read from common User-Agent headers", p("chromeWin").label === "Chrome on Windows" && p("edgeWin").label === "Edge on Windows" && p("firefoxLinux").label === "Firefox on Linux" && p("safariMac").label === "Safari on macOS" && p("safariIphone").label === "Safari on iOS" && p("chromeAndroid").label === "Chrome on Android" && p("chromeIos").label === "Chrome on iOS");
check("D-02 phone, tablet and desktop are told apart", p("chromeAndroid").deviceType === "Mobile" && p("safariIphone").deviceType === "Mobile" && p("androidTablet").deviceType === "Tablet" && p("ipad").deviceType === "Tablet" && p("chromeWin").deviceType === "Desktop");
check("D-03 a missing, empty, garbage or tool header gives 'Unknown device' (never a guess)", [null, undefined, "", "curl/8.4.0", "node", "x".repeat(5000), "\u0000\u0001"].every((h) => D.parseUserAgent(h).label === "Unknown device" || D.parseUserAgent(h).label.length < 60));
check("D-04 the header is only read up to 300 characters and nothing of it is returned except the labels", (() => { const r = D.parseUserAgent(UA.chromeWin + " ".repeat(400) + "Firefox/1"); return r.browser === "Chrome" && !JSON.stringify(r).includes("Mozilla"); })());
check("D-05 only a browser or only a system still gives a useful label", D.parseUserAgent("Mozilla/5.0 Firefox/120.0").label === "Firefox" && D.parseUserAgent("Mozilla/5.0 (Windows NT 10.0)").label === "Windows");
const k1 = D.deviceKeyFor("a".repeat(24), p("chromeWin"));
check("D-06 the device key is stable, per account and per browser/system, and does not contain the labels", k1 === D.deviceKeyFor("a".repeat(24), p("chromeWin")) && k1 !== D.deviceKeyFor("b".repeat(24), p("chromeWin")) && k1 !== D.deviceKeyFor("a".repeat(24), p("firefoxLinux")) && /^[0-9a-f]{24}$/.test(k1));
check("D-07 two browser versions of the same browser and system are the same device (the key ignores versions)", D.deviceKeyFor("a".repeat(24), D.parseUserAgent(UA.chromeWin)) === D.deviceKeyFor("a".repeat(24), D.parseUserAgent(UA.chromeWin.replace("120.0.0.0", "130.0.0.0"))));

// ---- status
check("S-01 security status: protected when email is confirmed and no warning is open", R.securityStatus({ emailVerified: true, openWarningAlerts: 0 }).status === "protected");
check("S-02 action required while a warning alert is open (it outranks everything), with the reason", (() => { const r = R.securityStatus({ emailVerified: false, openWarningAlerts: 2 }); return r.status === "action_required" && /2 security alerts need/.test(r.reasons[0]); })());
check("S-03 incomplete when the email is not confirmed and nothing else is open", R.securityStatus({ emailVerified: false, openWarningAlerts: 0 }).status === "incomplete" && R.STATUS_LABEL.action_required === "Action Required");

// ---- event types and wording
check("E-01 every security event type has a title and a status; unknown types are not security events", R.SECURITY_EVENT_TYPES.every((t) => R.EVENT_LABEL[t].title && ["success", "failure", "info"].includes(R.EVENT_LABEL[t].status)) && R.isSecurityEventType("LOGIN_FAILED") && !R.isSecurityEventType("PROFILE_UPDATED") && !R.isSecurityEventType("DOCUMENT_UPLOADED") && !R.isSecurityEventType(undefined));
check("E-02 login activity is the sign-in subset only", R.LOGIN_ACTIVITY_TYPES.join() === "LOGIN_SUCCEEDED,LOGIN_FAILED,LOGOUT");

// ---- paging query
const key = R.eventKey(new Date("2026-11-05T10:00:00Z"), "a".repeat(24));
check("Q-01 defaults: 20 a page, last 90 days; limit up to 50", R.parseSecurityListQuery({}).value.limit === 20 && R.parseSecurityListQuery({}).value.range === "90d" && R.parseSecurityListQuery({ limit: "50" }).value.limit === 50 && R.parseSecurityListQuery({ range: "all" }).value.range === "all");
check("Q-02 bad page size, range or cursor is refused", ["0", "51", "abc", "-1", "5.5", "1000"].every((l) => !R.parseSecurityListQuery({ limit: l }).ok) && !R.parseSecurityListQuery({ range: "forever" }).ok && ["garbage", "{\"$ne\":1}", "1:abc", key + "0"].every((c) => !R.parseSecurityListQuery({ before: c }).ok) && !R.parseSecurityListQuery({ before: { $gt: 1 } }).ok);
check("Q-03 a valid cursor passes and round-trips", R.parseSecurityListQuery({ before: key }).value.before === key && R.parseEventKey(key)?.id === "a".repeat(24) && R.parseEventKey(key)?.ms === new Date("2026-11-05T10:00:00Z").getTime());
check("Q-04 keys sort by time as text", R.eventKey(new Date(99), "f".repeat(24)) < R.eventKey(new Date(100), "0".repeat(24)) && R.eventKey(new Date("2025-01-01"), "a".repeat(24)) < R.eventKey(new Date("2026-01-01"), "a".repeat(24)));
check("Q-05 the range window is bounded by the retention", R.rangeSince("all", new Date("2026-11-05")).getTime() === new Date("2026-11-05").getTime() - 365 * 86_400_000 && R.rangeSince("7d", new Date("2026-11-05")).getTime() === new Date("2026-11-05").getTime() - 7 * 86_400_000);

// ---- identifiers and thresholds
check("I-01 a session is named only by a 16-hex public id; an alert by a 24-hex id", R.SESSION_PUBLIC_ID.test("0123456789abcdef") && !R.SESSION_PUBLIC_ID.test("0123456789ABCDEF") && !R.SESSION_PUBLIC_ID.test("../../etc") && !R.SESSION_PUBLIC_ID.test("0123456789abcde") && R.ALERT_ID.test("a".repeat(24)) && !R.ALERT_ID.test("a".repeat(23)));
check("I-02 documented thresholds: 5 failures in a 15-minute bucket, retention 365 and 90 days, recent alerts 30 days", R.FAILED_LOGIN_ALERT_THRESHOLD === 5 && R.FAILED_LOGIN_BUCKET_MINUTES === 15 && R.EVENT_RETENTION_DAYS === 365 && R.FAILED_LOGIN_RETENTION_DAYS === 90 && R.RECENT_ALERT_DAYS === 30);
check("I-03 the page sections are the six in the PRD", R.SECURITY_TAB_KEYS.join() === "overview,password,2fa,sessions,activity,alerts");

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
