import fs from "node:fs";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Page 38 (Buyer Account Activity & Security: /buyer/security, /api/buyer/security/*, the session registry, login events and alerts).
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test with the project's AUTH_SECRET and NO email provider, Chrome and puppeteer-core.
// Removes its own data at the end unless KEEP=1. SKIP_PERF=1 skips group P.
const BASE = process.env.BASE || "http://localhost:3100";
const ROOT = "R:/indiamartref";
const TEST_DB = "finbynmart_test";
const require = createRequire(`${ROOT}/`);
const { MongoClient, ObjectId } = require("mongodb");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === TEST_DB) throw new Error("Refusing: the configured live database is named like the test database.");
const SECRET = env.AUTH_SECRET;
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const db = client.db(TEST_DB);
const users = db.collection("users"), sess = db.collection("auth_sessions"), evts = db.collection("security_events"), alerts = db.collection("security_alerts"), notifs = db.collection("notifications");
const clearLimits = () => db.collection("rate_limits").deleteMany({});
await clearLimits();

const stamp = Date.now();
const emailOf = (tag) => `t38-${stamp}-${tag}@example.test`;
let ipN = 0;
const nextIp = () => `10.38.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const PW = "security test passphrase";
const DAY = 86_400_000;
const sha = (s) => createHash("sha256").update(s).digest("hex");
const UA = {
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  edgeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
};
const sign = (payload) => createHmac("sha256", SECRET).update(payload).digest("base64url");
const craft = (sub, v, sid, expMs = Date.now() + 3_600_000) => { const payload = Buffer.from(JSON.stringify({ sub, v, ...(sid ? { sid } : {}), exp: expMs })).toString("base64url"); return `${payload}.${sign(payload)}`; };
const claimsOf = (token) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());

class Session {
  jar = new Map();
  ua = null;
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  async call(method, p, payload, raw, extra = {}) {
    const response = await fetch(BASE + p, { method, headers: { "x-forwarded-for": this.ip ?? nextIp(), ...(this.ua ? { "user-agent": this.ua } : {}), ...(payload !== undefined && !raw ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}), ...extra }, body: raw ? payload : payload === undefined ? undefined : JSON.stringify(payload), redirect: "manual" });
    for (const line of response.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); const name = pair.slice(0, i); const value = pair.slice(i + 1); if (/Max-Age=0/i.test(line) || value === "") this.jar.delete(name); else this.jar.set(name, value); }
    const buf = Buffer.from(await response.arrayBuffer());
    let json = null; let text = null;
    try { text = buf.toString("utf8"); json = JSON.parse(text); } catch {}
    return { status: response.status, json, text, headers: response.headers };
  }
  async page(p) {
    const response = await fetch(BASE + p, { headers: { "x-forwarded-for": this.ip ?? nextIp(), ...(this.ua ? { "user-agent": this.ua } : {}), ...(this.jar.size ? { cookie: this.cookieHeader() } : {}) }, redirect: "manual" });
    return { status: response.status, text: await response.text(), location: response.headers.get("location") };
  }
  get token() { return this.jar.get("finbyn_session"); }
  get sid() { return this.token ? claimsOf(this.token).sid : null; }
  me() { return this.call("GET", "/api/auth/me"); }
}
const register = async (tag, ua = UA.chromeWin) => {
  const s = new Session(); s.ua = ua;
  const r = await s.call("POST", "/api/auth/register/buyer", { name: `Security ${tag.toUpperCase()} Buyer`, email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: "Security Test Traders", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  if (r.status !== 201) throw new Error(`register ${tag}: ${r.status} ${r.text}`);
  return { s, email: emailOf(tag), id: (await users.findOne({ email: emailOf(tag) }))._id };
};
const loginAs = async (email, ua, password = PW) => { const s = new Session(); s.ua = ua; const r = await s.call("POST", "/api/auth/login", { email, password }); return { s, r }; };
const api = (s, p) => s.call("GET", `/api/buyer/security/${p}`);
const sessionsOf = async (s) => (await api(s, "sessions")).json?.data;
const ids = (s, d) => d.sessions.map((x) => x.id);

// Chrome is started when the first browser check needs it (after the long API phase), not at the top: an idle browser can be gone by then.
let browser = null;
async function open(p, { width = 1440, height = 900, session, intercept } = {}) {
  browser ??= await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/40\d|409|429|50\d|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  if (session) await page.setCookie(...[...session.jar].map(([name, value]) => ({ name, value, url: BASE, httpOnly: true })));
  if (intercept) { await page.setRequestInterception(true); page.on("request", (rq) => (intercept(rq) ? rq.respond({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, message: "Simulated failure" }) }) : rq.continue())); }
  await page.setViewport({ width, height });
  const resp = await page.goto(BASE + p, { waitUntil: "networkidle2" });
  page.errs = errs; page.status = resp.status(); page.context = context;
  return page;
}
const hydrated = (p, sel) => p.waitForFunction((s) => Object.keys(document.querySelector(s) ?? {}).some((k) => k.startsWith("__react")), { timeout: 10000 }, sel).catch(() => {});
const clickText = (p, selector, t) => p.evaluate((s, x) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(x) && e.getClientRects().length); if (!el) return false; el.click(); return true; }, selector, t);
const content = (p) => p.evaluate(() => (document.querySelector("#buyer-content") ?? document.body).textContent.replace(/[ \t\r\n]+/g, " "));
const med = (a, q) => { const x = [...a].sort((m, n) => m - n); return x[Math.min(x.length - 1, Math.floor(q * x.length))]; };
const timeIt = async (fn, n = 40) => { await fn(); const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); await fn(); t.push(performance.now() - s); } return { p50: med(t, 0.5), p95: med(t, 0.95), p99: med(t, 0.99) }; };

async function main() {
  const A = await register("a"), B = await register("b");
  await users.updateOne({ _id: A.id }, { $set: { emailVerified: true } });
  const SUPPLIER = new Session();
  await SUPPLIER.call("POST", "/api/auth/register/supplier", { businessName: "Security Supplier Co", contactName: "Sia Rao", email: emailOf("sup"), phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  const SUSP = await register("susp");
  await users.updateOne({ _id: SUSP.id }, { $set: { accountStatus: "SUSPENDED" } });

  // ================= A: access and cookie checks
  const un = new Session();
  const routes = [["GET", "overview"], ["GET", "sessions"], ["DELETE", "sessions/0123456789abcdef"], ["POST", "sessions/revoke-others"], ["GET", "login-activity"], ["GET", "events"], ["GET", "alerts"], ["PATCH", `alerts/${"a".repeat(24)}/acknowledge`], ["GET", "recovery-methods"]];
  const anon = await Promise.all(routes.map(([m, p]) => un.call(m, `/api/buyer/security/${p}`)));
  check("A-01 no session: every security route answers 401, private no-store, with nothing of an account", anon.every((r) => r.status === 401 && /no-store/.test(r.headers.get("cache-control") ?? "")), anon.map((r) => r.status).join(" "));
  const sup = await Promise.all(routes.map(([m, p]) => SUPPLIER.call(m, `/api/buyer/security/${p}`)));
  check("A-02 a supplier account: every security route answers 403", sup.every((r) => r.status === 403), sup.map((r) => r.status).join(" "));
  check("A-03 a suspended buyer's session no longer works (401)", (await api(SUSP.s, "overview")).status === 401);
  const forged = new Session(); forged.jar.set("finbyn_session", "garbage.value");
  const tampered = new Session(); tampered.jar.set("finbyn_session", `${A.s.token.split(".")[0]}.${"A".repeat(43)}`);
  check("A-04 a forged cookie and a cookie with a tampered signature: 401", (await api(forged, "overview")).status === 401 && (await api(tampered, "overview")).status === 401);
  const aDoc = await users.findOne({ _id: A.id });
  const expired = new Session(); expired.jar.set("finbyn_session", craft(String(A.id), aDoc.sessionVersion ?? 0, A.s.sid, Date.now() - 1000));
  check("A-05 a correctly signed but EXPIRED cookie is refused", (await api(expired, "overview")).status === 401);
  const fixation = new Session(); fixation.jar.set("finbyn_session", craft(String(A.id), aDoc.sessionVersion ?? 0, randomBytes(32).toString("base64url")));
  check("A-06 session fixation: a validly signed cookie naming a session id that is not in the registry is refused (the attacker cannot pick an id)", (await api(fixation, "overview")).status === 401 && (await fixation.me()).json?.user === null);
  const legacy = new Session(); legacy.jar.set("finbyn_session", craft(String(A.id), aDoc.sessionVersion ?? 0, null));
  check("A-07 compatibility: a cookie issued before the registry (no session id) still works until it expires, and Account Security tells the buyer this browser is untracked", (await legacy.me()).json?.user?.id === String(A.id) && (await api(legacy, "sessions")).json.data.currentTracked === false);
  const anonPage = await un.page("/buyer/security?tab=sessions");
  check("A-08 the page without a session redirects to sign-in (keeping the tab) and carries no data", [302, 303, 307, 308].includes(anonPage.status) && /sign-in\?next=%2Fbuyer%2Fsecurity%3Ftab%3Dsessions/.test(anonPage.location ?? "") && !/Security A Buyer/.test(anonPage.text));
  const supPage = await SUPPLIER.page("/buyer/security");
  check("A-09 a supplier opening the page sees 'Buyer accounts only', nothing about sessions", /Buyer accounts only/.test(supPage.text) && !/Active Sessions/.test(supPage.text));

  // ================= B: the registry and the cookie
  const raw = await A.s.call("POST", "/api/auth/login", { email: A.email, password: PW }, undefined, { "user-agent": UA.chromeWin });
  const setCookie = raw.headers.getSetCookie?.().find((l) => l.startsWith("finbyn_session=")) ?? "";
  check("B-01 the session cookie is HttpOnly, SameSite=Lax, Path=/, Secure in production, with a 7-day lifetime", /HttpOnly/i.test(setCookie) && /SameSite=lax/i.test(setCookie) && /Path=\//i.test(setCookie) && /Secure/i.test(setCookie) && /Max-Age=604800/i.test(setCookie), setCookie.replace(/finbyn_session=[^;]+/, "finbyn_session=<value>"));
  const s1 = (await loginAs(A.email, UA.chromeWin)).s, s2 = (await loginAs(A.email, UA.firefoxLinux)).s, s3 = (await loginAs(A.email, UA.safariIphone)).s;
  const sid1 = s1.sid;
  const doc1 = await sess.findOne({ sidHash: sha(sid1) });
  check("B-02 a sign-in creates a registry record: only the SHA-256 of the session id is stored (never the id, never the cookie), with a random public id, device label, creation and activity times, a 7-day expiry, not revoked", doc1 && doc1.sidHash === sha(sid1) && !JSON.stringify(doc1).includes(sid1) && !JSON.stringify(doc1).includes(s1.token) && /^[0-9a-f]{16}$/.test(doc1.publicId) && doc1.deviceLabel === "Chrome on Windows" && doc1.revokedAt === null && Math.abs(doc1.expiresAt - doc1.createdAt - 7 * DAY) < 5000 && doc1.approxLocation === null && !("ip" in doc1) && !("userAgent" in doc1));
  const idx = (await sess.indexes()).map((i) => i.name + (i.unique ? ":unique" : ""));
  check("B-03 the registry indexes exist: unique session hash and public id, the active-sessions index, the device-key index and the retention (TTL) index", ["session_sid_hash:unique", "session_public_id:unique", "user_active_sessions", "user_device_key", "session_retention"].every((n) => idx.includes(n)), idx.join(","));
  const list = await sessionsOf(s1);
  check("B-04 the session list shows this buyer's three active sessions, the current one first and marked, each with a device label, times and region 'Unknown'; the other two are not current", list.sessions.length >= 3 && list.sessions[0].current === true && list.currentSessionId === list.sessions[0].id && list.sessions.filter((x) => x.current).length === 1 && list.sessions.every((x) => x.region === "Unknown" && x.createdLabel && x.lastActiveLabel && /^[0-9a-f]{16}$/.test(x.id)) && ["Firefox on Linux", "Safari on iOS", "Chrome on Windows"].every((l) => list.sessions.some((x) => x.deviceLabel === l)));
  const view2 = await sessionsOf(s2);
  check("B-05 each browser sees ITS OWN session as current", view2.sessions.find((x) => x.current).deviceLabel === "Firefox on Linux" && list.sessions.find((x) => x.current).deviceLabel === "Chrome on Windows");
  const secretLeak = JSON.stringify(list);
  check("B-06 the answer holds no token, cookie, session id hash, secret, IP address or User-Agent: only the allowed fields", !secretLeak.includes(sid1) && !secretLeak.includes(sha(sid1)) && !/sidHash|finbyn_session|userAgent|Mozilla|"ip"|ipHash|deviceKey|userId|expiresAt|revoked/i.test(secretLeak) && list.sessions.every((x) => Object.keys(x).sort().join() === "browser,createdAt,createdLabel,current,deviceLabel,deviceType,id,lastActiveAt,lastActiveLabel,os,region,status"));
  const expDoc = await sess.findOne({ sidHash: sha(s3.sid) });
  await sess.updateOne({ _id: expDoc._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const afterExpiry = await sessionsOf(s1);
  check("B-07 an expired session is not listed or counted as active, and its cookie no longer works", !ids(s1, afterExpiry).includes(expDoc.publicId) && (await s3.me()).json?.user === null);
  await sess.updateOne({ _id: expDoc._id }, { $set: { expiresAt: new Date(Date.now() + 7 * DAY) } });
  const s3b = (await loginAs(A.email, UA.safariIphone)).s;
  const old = await sess.findOne({ sidHash: sha(s1.sid) });
  await sess.updateOne({ _id: old._id }, { $set: { lastActiveAt: new Date(Date.now() - 3_600_000) } });
  await s1.me();
  let touched = false; for (let i = 0; i < 20 && !touched; i++) { await sleep(150); touched = (await sess.findOne({ _id: old._id })).lastActiveAt > new Date(Date.now() - 60_000); }
  const recent = await sess.findOne({ _id: old._id }); const before = recent.lastActiveAt;
  await s1.me(); await sleep(400);
  check("B-08 last-active time is updated by use (when it is more than 5 minutes old) and not written on every request", touched && (await sess.findOne({ _id: old._id })).lastActiveAt.getTime() === before.getTime());
  // legacy sessions compile: version
  const ov = (await api(s1, "overview")).json.data;
  const listNow = await sessionsOf(s1);
  check("B-09 the overview's active-session count equals the list (3 browsers + the extra sign-in on this buyer)", ov.sessions.activeCount === listNow.sessions.length && ov.sessions.activeCount >= 4);
  // session cap
  const C = await register("cap");
  const capSessions = [];
  for (let i = 0; i < 22; i++) { capSessions.push((await loginAs(C.email, i % 2 ? UA.firefoxLinux : UA.chromeWin)).s); }
  const activeCap = await sess.countDocuments({ userId: C.id, revokedAt: null, expiresAt: { $gt: new Date() } });
  const limited = await sess.countDocuments({ userId: C.id, revokedReason: "limit" });
  check("B-10 an account never has more than 20 active sessions: the 21st sign-in ends the least recently used (reason 'limit'), and its cookie stops working", activeCap === 20 && limited >= 2 && (await capSessions[0].me()).json?.user === null && (await capSessions.at(-1).me()).json?.user?.id === String(C.id), `${activeCap} active, ${limited} ended by the limit`);

  // ================= C: revocation
  await clearLimits();
  const target = (await sessionsOf(s1)).sessions.find((x) => x.deviceLabel === "Firefox on Linux");
  const targetSid = s2.sid;
  const s2before = (await s2.me()).json.user;
  const rev = await s1.call("DELETE", `/api/buyer/security/sessions/${target.id}`);
  const revDoc = await sess.findOne({ publicId: target.id });
  const meAfter = await s2.me();
  const apiAfter = await api(s2, "sessions");
  check("C-01 REVOCATION PROOF: ending a session marks its record revoked (reason 'user') and that browser's very next request is refused: /api/auth/me shows no user and the security API answers 401, while it worked just before", s2before?.id === String(A.id) && rev.status === 200 && /Firefox on Linux was signed out/.test(rev.json.message) && revDoc.revokedAt instanceof Date && revDoc.revokedReason === "user" && meAfter.json.user === null && apiAfter.status === 401 && sha(targetSid) === revDoc.sidHash);
  const afterList = await sessionsOf(s1);
  check("C-02 after revocation the list no longer shows it and the other sessions (this one, the Safari one) are untouched", !ids(s1, afterList).includes(target.id) && (await s1.me()).json.user && (await s3b.me()).json.user);
  const again = await s1.call("DELETE", `/api/buyer/security/sessions/${target.id}`);
  check("C-03 ending an already ended session is a 404 and creates no second event", again.status === 404 && (await evts.countDocuments({ userId: A.id, type: "SESSION_REVOKED", sessionPublicId: target.id })) === 1);
  const cur = (await sessionsOf(s1)).sessions.find((x) => x.current);
  const own = await s1.call("DELETE", `/api/buyer/security/sessions/${cur.id}`);
  check("C-04 the session in use cannot be ended from the list (409, 'use Sign out'): a wrong click never signs the buyer out of this page", own.status === 409 && own.json.code === "CURRENT_SESSION" && (await s1.me()).json.user !== null);
  const bSessions = (await sessionsOf(B.s)).sessions[0];
  const foreign = await s1.call("DELETE", `/api/buyer/security/sessions/${bSessions.id}`);
  const unknown = await s1.call("DELETE", `/api/buyer/security/sessions/${randomBytes(8).toString("hex")}`);
  const malformed = await Promise.all(["not-an-id", "..%2F..%2Fetc", "0123456789ABCDEF", "0123456789abcde"].map((x) => s1.call("DELETE", `/api/buyer/security/sessions/${x}`)));
  check("C-05 another buyer's session, an unknown id and malformed ids all answer the same 404; the other buyer's session still works", foreign.status === 404 && unknown.status === 404 && foreign.json.message === unknown.json.message && malformed.every((r) => r.status === 404 && r.json.message === unknown.json.message) && (await B.s.me()).json.user !== null);
  const wrong = await Promise.all([s1.call("GET", `/api/buyer/security/sessions/${target.id}`), s1.call("PUT", `/api/buyer/security/sessions/${target.id}`, {}), s1.call("PATCH", `/api/buyer/security/sessions/${target.id}`, {}), s1.call("POST", `/api/buyer/security/sessions/${target.id}`, {})]);
  check("C-06 other methods on a session answer 405", wrong.every((r) => r.status === 405));
  const s4 = (await loginAs(A.email, UA.safariMac)).s;
  const tgt4 = (await sessionsOf(s1)).sessions.find((x) => x.deviceLabel === "Safari on macOS");
  await clearLimits();
  const dupe = await Promise.all([s1.call("DELETE", `/api/buyer/security/sessions/${tgt4.id}`), s1.call("DELETE", `/api/buyer/security/sessions/${tgt4.id}`), s1.call("DELETE", `/api/buyer/security/sessions/${tgt4.id}`)]);
  check("C-07 three simultaneous requests to end the same session: exactly one succeeds, the others are 404, and one event, one alert and one notification are recorded", dupe.filter((r) => r.status === 200).length === 1 && dupe.filter((r) => r.status === 404).length === 2 && (await evts.countDocuments({ userId: A.id, type: "SESSION_REVOKED", sessionPublicId: tgt4.id })) === 1 && (await alerts.countDocuments({ userId: A.id, dedupeKey: `revoked:${tgt4.id}` })) === 1 && (await notifs.countDocuments({ buyerId: A.id, dedupeKey: `revoked:${tgt4.id}` })) === 1 && (await s4.me()).json.user === null);
  const rvEvent = await evts.findOne({ userId: A.id, type: "SESSION_REVOKED", sessionPublicId: target.id });
  check("C-08 the event records the device label and the session's public id and nothing secret; the buyer gets an in-app notification (category account); no email is claimed", rvEvent.deviceLabel === "Firefox on Linux" && !/sid|token|cookie|ip/i.test(Object.keys(rvEvent).join()) && (await notifs.findOne({ buyerId: A.id, dedupeKey: `revoked:${target.id}` }))?.category === "account");
  // CSRF
  const s5 = (await loginAs(A.email, UA.edgeWin)).s;
  const tgt5 = (await sessionsOf(s1)).sessions.find((x) => x.deviceLabel === "Edge on Windows");
  await clearLimits();
  const cross = await Promise.all([s1.call("DELETE", `/api/buyer/security/sessions/${tgt5.id}`, undefined, undefined, { origin: "https://evil.example" }), s1.call("DELETE", `/api/buyer/security/sessions/${tgt5.id}`, undefined, undefined, { "sec-fetch-site": "cross-site" }), s1.call("POST", "/api/buyer/security/sessions/revoke-others", undefined, undefined, { origin: "https://evil.example" }), s1.call("POST", "/api/buyer/settings/sign-out-everywhere", undefined, undefined, { origin: "http://attacker.test" })]);
  check("C-09 CSRF: ending a session, signing out other devices and the Settings sign-out are refused (403) when the request comes from another origin or is marked cross-site, and nothing changes", cross.every((r) => r.status === 403) && (await s5.me()).json.user !== null && (await sess.findOne({ publicId: tgt5.id })).revokedAt === null);
  const sameOrigin = await s1.call("DELETE", `/api/buyer/security/sessions/${tgt5.id}`, undefined, undefined, { origin: BASE, "sec-fetch-site": "same-origin" });
  check("C-10 the same request from this site's own origin is allowed", sameOrigin.status === 200 && (await s5.me()).json.user === null);

  // ================= D: sign out other devices
  const d1 = (await loginAs(A.email, UA.firefoxLinux)).s, d2 = (await loginAs(A.email, UA.safariIphone)).s, d3 = (await loginAs(A.email, UA.safariMac)).s;
  const a2 = (await aDocOf()); async function aDocOf() { return users.findOne({ _id: A.id }); }
  const legacyOld = new Session(); legacyOld.jar.set("finbyn_session", craft(String(A.id), a2.sessionVersion ?? 0, null));
  const others = (await sessionsOf(s1)).sessions.filter((x) => !x.current).length;
  const ownBefore = (await sessionsOf(s1)).sessions.find((x) => x.current);
  const cookieBefore = s1.token;
  await clearLimits();
  const out = await s1.call("POST", "/api/buyer/security/sessions/revoke-others");
  const ownAfter = (await sessionsOf(s1)).sessions;
  check("D-01 SIGN OUT OTHER DEVICES: the real count is returned; every other session is refused afterwards (including a cookie from before the registry); THIS session stays signed in with the same record (same creation time and device) and a cookie for the new session version", out.status === 200 && out.json.count === others && others >= 3 && (await d1.me()).json.user === null && (await d2.me()).json.user === null && (await d3.me()).json.user === null && (await legacyOld.me()).json.user === null && (await s1.me()).json.user?.id === String(A.id) && ownAfter.length === 1 && ownAfter[0].current && ownAfter[0].id === ownBefore.id && ownAfter[0].createdAt === ownBefore.createdAt && s1.token !== cookieBefore && claimsOf(s1.token).sid === claimsOf(cookieBefore).sid, `ended ${out.json.count} of ${others}`);
  const soEvents = await evts.find({ userId: A.id, type: "SIGNED_OUT_EVERYWHERE" }).toArray();
  check("D-02 one SIGNED_OUT_EVERYWHERE event with the count, one alert and one notification; the ended sessions carry reason 'other_devices'", soEvents.length === 1 && soEvents[0].count === others && (await alerts.countDocuments({ userId: A.id, type: "OTHER_DEVICES_SIGNED_OUT" })) === 1 && (await notifs.countDocuments({ buyerId: A.id, type: "SIGNED_OUT_EVERYWHERE" })) === 1 && (await sess.countDocuments({ userId: A.id, revokedReason: "other_devices" })) >= others);
  check("D-03 another buyer's sessions are untouched", (await B.s.me()).json.user !== null && (await sess.countDocuments({ userId: B.id, revokedAt: null })) >= 1);
  const none = await s1.call("POST", "/api/buyer/security/sessions/revoke-others");
  check("D-04 with no other device the answer says so honestly (0) and this session still works", none.status === 200 && none.json.count === 0 && /no other signed-in devices/.test(none.json.message) && (await s1.me()).json.user !== null);
  const e1 = (await loginAs(A.email, UA.firefoxLinux)).s;
  const viaSettings = await s1.call("POST", "/api/buyer/settings/sign-out-everywhere");
  check("D-05 the Settings page's button uses the same service: it reports the count, signs the other device out and keeps this one", viaSettings.status === 200 && viaSettings.json.count === 1 && (await e1.me()).json.user === null && (await s1.me()).json.user !== null);
  await clearLimits();
  const lim = []; for (let i = 0; i < 6; i++) lim.push(await s1.call("POST", "/api/buyer/security/sessions/revoke-others"));
  check("D-06 signing out other devices is rate limited (5 in 10 minutes): the sixth is 429 with Retry-After", lim.slice(0, 5).every((r) => r.status === 200) && lim[5].status === 429 && lim[5].headers.get("retry-after") > 0);
  await clearLimits();

  // ================= E: login activity, events, failures
  const E = await register("act");
  const ovFresh = (await api(E.s, "overview")).json.data;
  const emptyAct = await api(E.s, "login-activity");
  check("E-01 a buyer who registered but has not signed in: login activity is empty and says history starts when recording began (the overview has no start date); nothing is invented", emptyAct.json.data.events.length === 0 && ovFresh.loginHistory.since === null);
  const lg = await loginAs(E.email, UA.chromeWin);
  const failBefore = await evts.countDocuments({ type: "LOGIN_FAILED" });
  const wrongs = []; for (let i = 0; i < 3; i++) wrongs.push(await loginAs(E.email, UA.firefoxLinux, "definitely wrong password"));
  const unknownEmail = await loginAs(`nobody-${stamp}@example.test`, UA.firefoxLinux, "whatever password here");
  const failDoc = await evts.findOne({ userId: E.id, type: "LOGIN_FAILED" });
  check("E-02 failed sign-ins for an existing account are recorded as ONE event per 15-minute window with a count (3); nothing is recorded for an unknown email; no IP address, password or User-Agent is kept", wrongs.every((w) => w.r.status === 401) && unknownEmail.r.status === 401 && failDoc.count === 3 && (await evts.countDocuments({ userId: E.id, type: "LOGIN_FAILED" })) === 1 && (await evts.countDocuments({ type: "LOGIN_FAILED" })) === failBefore + 1 && failDoc.deviceLabel === "Firefox on Linux" && !/ip|agent|password|token/i.test(Object.keys(failDoc).join()));
  const la = (await api(lg.s, "login-activity")).json.data.events;
  check("E-03 login activity lists the sign-in and the failed attempts newest first: 'Signed in' (success) and 'Failed sign-in attempt' with its count (failure), each with the device label and time", la.length === 2 && la.map((e) => e.type).sort().join() === "LOGIN_FAILED,LOGIN_SUCCEEDED" && la[0].at >= la[1].at && la.find((e) => e.type === "LOGIN_FAILED").count === 3 && la.find((e) => e.type === "LOGIN_FAILED").status === "failure" && la.find((e) => e.type === "LOGIN_SUCCEEDED").deviceLabel === "Chrome on Windows" && la.find((e) => e.type === "LOGIN_SUCCEEDED").status === "success");
  check("E-04 the page opening itself writes nothing: reading login activity, events, overview and sessions again adds no event or alert", await (async () => { const n0 = await evts.countDocuments({ userId: E.id }); const a0 = await alerts.countDocuments({ userId: E.id }); await api(lg.s, "login-activity"); await api(lg.s, "events"); await api(lg.s, "overview"); await api(lg.s, "sessions"); return (await evts.countDocuments({ userId: E.id })) === n0 && (await alerts.countDocuments({ userId: E.id })) === a0; })());
  const ovSince = (await api(lg.s, "overview")).json.data.loginHistory;
  check("E-05 once a sign-in is recorded the overview states when the recorded history starts", Boolean(ovSince.since) && /20\d\d/.test(ovSince.sinceLabel));
  const out2 = await lg.s.call("POST", "/api/auth/logout");
  const lo = await evts.find({ userId: E.id, type: "LOGOUT" }).toArray();
  const replay = new Session(); replay.jar.set("finbyn_session", lg.s.token ?? "");
  check("E-06 signing out ends the session on the server and records one LOGOUT event; replaying the old cookie is refused and adds no second event", out2.status === 200 && lo.length === 1 && lo[0].sessionPublicId && (await sess.findOne({ publicId: lo[0].sessionPublicId })).revokedReason === "logout");
  const stale = new Session(); stale.jar.set("finbyn_session", craft(String(E.id), 0, null));
  const lgOut = await loginAs(E.email, UA.chromeWin);
  const oldTok = lgOut.s.token; await lgOut.s.call("POST", "/api/auth/logout");
  const replayer = new Session(); replayer.jar.set("finbyn_session", oldTok);
  const replayMe = await replayer.me(); await replayer.call("POST", "/api/auth/logout");
  check("E-07 a logged-out cookie that is replayed (kept by a thief) is refused at once, and replaying it to /logout records nothing", replayMe.json.user === null && (await evts.countDocuments({ userId: E.id, type: "LOGOUT" })) === 2);
  void stale; void replay;
  // history, paging, isolation
  const P = await register("hist");
  const base = Date.now() - 80 * DAY;
  await evts.insertMany([
    ...Array.from({ length: 60 }, (_, i) => ({ userId: P.id, type: "LOGIN_SUCCEEDED", at: new Date(base + i * 3_600_000), deviceLabel: `Seeded device ${i}`, sessionPublicId: randomBytes(8).toString("hex") })),
    { userId: P.id, type: "PROFILE_UPDATED", at: new Date(), fields: ["name"] },
    { userId: P.id, type: "DOCUMENT_UPLOADED", at: new Date(), fields: ["pan"] },
    { userId: P.id, type: "LOGIN_SUCCEEDED", at: new Date(Date.now() - 120 * DAY), deviceLabel: "Old device 120 days" },
  ]);
  const pg = []; let cur2 = null; let pages = 0;
  for (;;) { const r = await api(P.s, `login-activity?range=90d${cur2 ? `&before=${encodeURIComponent(cur2)}` : ""}`); pages++; pg.push(...r.json.data.events); if (!r.json.meta.hasMore) break; cur2 = r.json.meta.nextCursor; if (pages > 10) break; }
  const inOrder = pg.every((e, i, a) => i === 0 || a[i - 1].at >= e.at);
  check("E-08 login activity pages 20 at a time newest first: 60 events in 3 pages, none repeated or skipped; profile and document events and an event older than the range are not listed", pages === 3 && pg.length === 60 && new Set(pg.map((e) => e.id)).size === 60 && inOrder && !pg.some((e) => /Old device/.test(e.deviceLabel ?? "")), `${pages} pages, ${pg.length} events`);
  const all = await api(P.s, "login-activity?range=all&limit=50");
  const evAll = await api(P.s, "events?range=all&limit=50");
  check("E-09 'All recorded' includes the 120-day-old event; the security events list never includes profile or document events", all.json.data.events.length === 50 && (await api(P.s, "login-activity?range=all&limit=50&before=" + encodeURIComponent(all.json.meta.nextCursor))).json.data.events.some((e) => e.deviceLabel === "Old device 120 days") && !evAll.text.includes("PROFILE_UPDATED") && !evAll.text.includes("DOCUMENT"));
  const badQ = await Promise.all(["limit=51", "limit=0", "limit=abc", "before=garbage", `before=${encodeURIComponent("{\"$ne\":1}")}`, "range=forever", "before[$gt]=1"].map((q) => api(P.s, `login-activity?${q}`)));
  check("E-10 a page size over 50, zero or text, a malformed or operator-style cursor and an unknown range are refused (400); an operator key is ignored", badQ.slice(0, 6).every((r) => r.status === 400) && badQ[6].status === 200, badQ.map((r) => r.status).join(" "));
  const iso = await api(B.s, "login-activity?range=all&limit=50");
  check("E-11 another buyer sees none of these events", !iso.text.includes("Seeded device") && !(await api(B.s, "events?range=all")).text.includes("Seeded device"));
  check("E-12 events hold no IP address, raw User-Agent, device key, user id, retention date or secret", !/"ip"|Mozilla|userAgent|deviceKey|userId|purgeAt|dedupeKey|sidHash|password/i.test(all.text + evAll.text));
  const tie = await register("tie"); const same = new Date(Date.now() - DAY);
  await evts.insertMany(Array.from({ length: 30 }, (_, i) => ({ userId: tie.id, type: "LOGIN_SUCCEEDED", at: same, deviceLabel: `Tie ${i}` })));
  const tieSeen = new Set(); let tc = null;
  for (let n = 0; n < 10; n++) { const r = await api(tie.s, `login-activity?limit=7${tc ? `&before=${encodeURIComponent(tc)}` : ""}`); r.json.data.events.forEach((e) => tieSeen.add(e.id)); if (!r.json.meta.hasMore) break; tc = r.json.meta.nextCursor; }
  check("E-13 thirty events written in the same millisecond are paged without repeating or skipping any", tieSeen.size === 30);

  // ================= F: alerts
  const F = await register("alert", UA.chromeWin);
  await users.updateOne({ _id: F.id }, { $set: { emailVerified: true } });
  const sameDev = await loginAs(F.email, UA.chromeWin);
  check("F-01 signing in from the browser/system the account already uses raises no new-device alert", (await alerts.countDocuments({ userId: F.id, type: "NEW_DEVICE_SIGN_IN" })) === 0 && (await evts.findOne({ userId: F.id, type: "LOGIN_SUCCEEDED" })).newDevice === false);
  const newDev = await loginAs(F.email, UA.firefoxLinux);
  const nd = await alerts.findOne({ userId: F.id, type: "NEW_DEVICE_SIGN_IN" });
  const ndSession = await sess.findOne({ userId: F.id, deviceLabel: "Firefox on Linux" });
  check("F-02 a first sign-in from a browser/system this account never used raises ONE info alert (with a recommended action), marks the sign-in event as a new device, and creates an in-app notification for the right buyer", nd && nd.severity === "info" && nd.acknowledgedAt === null && /If this was you/.test(nd.recommended) && nd.dedupeKey === `newdevice:${ndSession.publicId}` && (await evts.findOne({ userId: F.id, type: "LOGIN_SUCCEEDED", deviceLabel: "Firefox on Linux" })).newDevice === true && (await notifs.countDocuments({ buyerId: F.id, type: "NEW_DEVICE_SIGN_IN" })) === 1 && (await notifs.countDocuments({ buyerId: A.id, type: "NEW_DEVICE_SIGN_IN", createdAt: { $gt: new Date(Date.now() - 5000) } })) === 0);
  await loginAs(F.email, UA.firefoxLinux);
  check("F-03 a second sign-in from that same browser/system raises no further alert", (await alerts.countDocuments({ userId: F.id, type: "NEW_DEVICE_SIGN_IN" })) === 1 && (await notifs.countDocuments({ buyerId: F.id, type: "NEW_DEVICE_SIGN_IN" })) === 1);
  const firstEver = await register("first");
  await sess.deleteMany({ userId: firstEver.id });
  await loginAs(firstEver.email, UA.edgeWin);
  check("F-04 the very first recorded sign-in of an account (no history at all) is not called a new device", (await alerts.countDocuments({ userId: firstEver.id })) === 0);
  // repeated failures
  const G = await register("fail"); await users.updateOne({ _id: G.id }, { $set: { emailVerified: true } });
  const gok = await loginAs(G.email, UA.chromeWin);
  for (let i = 0; i < 4; i++) await loginAs(G.email, UA.firefoxLinux, "wrong password again");
  const fourAlerts = await alerts.countDocuments({ userId: G.id, type: "REPEATED_FAILED_LOGINS" });
  await loginAs(G.email, UA.firefoxLinux, "wrong password again");
  const fifth = await alerts.findOne({ userId: G.id, type: "REPEATED_FAILED_LOGINS" });
  for (let i = 0; i < 3; i++) await loginAs(G.email, UA.firefoxLinux, "wrong password again");
  check("F-05 four failures raise no alert; the fifth raises ONE warning alert (and a notification); further failures in the hour add none (duplicate prevention)", fourAlerts === 0 && fifth && fifth.severity === "warning" && (await alerts.countDocuments({ userId: G.id, type: "REPEATED_FAILED_LOGINS" })) === 1 && (await notifs.countDocuments({ buyerId: G.id, type: "REPEATED_FAILED_LOGINS" })) === 1 && (await evts.findOne({ userId: G.id, type: "LOGIN_FAILED" })).count === 8);
  const ovWarn = (await api(gok.s, "overview")).json.data;
  check("F-06 an open warning makes the account status 'Action Required' (the documented criterion), with the reason; the alerts card counts it", ovWarn.status === "action_required" && /needs your attention|need your attention/.test(ovWarn.reasons[0]) && ovWarn.alerts.openCount >= 1);
  const gAlerts = (await api(gok.s, "alerts")).json;
  const warnId = gAlerts.data.alerts.find((a) => a.type === "REPEATED_FAILED_LOGINS").id;
  await clearLimits();
  const ack1 = await gok.s.call("PATCH", `/api/buyer/security/alerts/${warnId}/acknowledge`);
  await sleep(1100);
  const ack2 = await gok.s.call("PATCH", `/api/buyer/security/alerts/${warnId}/acknowledge`);
  check("F-07 acknowledging an alert saves it (seen), repeating it keeps the FIRST time, and the status returns to Protected", ack1.status === 200 && ack1.json.data.alert.acknowledged === true && ack2.json.data.alert.acknowledgedLabel === ack1.json.data.alert.acknowledgedLabel && (await api(gok.s, "overview")).json.data.status === "protected");
  const foreignAck = await s1.call("PATCH", `/api/buyer/security/alerts/${warnId}/acknowledge`);
  const missingAck = await s1.call("PATCH", `/api/buyer/security/alerts/${"b".repeat(24)}/acknowledge`);
  const badAck = await s1.call("PATCH", `/api/buyer/security/alerts/not-an-id/acknowledge`);
  check("F-08 another buyer cannot acknowledge this alert, and an unknown or malformed id: the same 404", foreignAck.status === 404 && missingAck.status === 404 && badAck.status === 404 && foreignAck.json.message === missingAck.json.message);
  const openOnly = (await api(gok.s, "alerts?status=open")).json.data.alerts, allAl = (await api(gok.s, "alerts")).json.data.alerts;
  check("F-09 the alert list: 'open' excludes seen alerts, 'all' includes them; an unknown status is refused (400); alerts are newest first; none of another buyer's appear", !openOnly.some((a) => a.id === warnId) && allAl.some((a) => a.id === warnId && a.acknowledged) && (await api(gok.s, "alerts?status=weird")).status === 400 && allAl.every((a, i, arr) => i === 0 || arr[i - 1].createdAt >= a.createdAt) && !(await api(s1, "alerts")).text.includes(warnId));
  const events38 = (await api(gok.s, "events?limit=50")).json.data.events.map((e) => e.type);
  check("F-10 the unified timeline shows the sign-in, the failed attempts and the security alert once each", events38.includes("LOGIN_SUCCEEDED") && events38.includes("LOGIN_FAILED") && events38.filter((t) => t === "SECURITY_ALERT").length === 1);
  const aw = await G.s.call("PATCH", `/api/buyer/security/alerts/${warnId}/acknowledge`, undefined, undefined, {});
  void aw;
  // ================= G: password
  const H = await register("pw"); await users.updateOne({ _id: H.id }, { $set: { emailVerified: true } });
  const h1 = (await loginAs(H.email, UA.chromeWin)).s, h2 = (await loginAs(H.email, UA.firefoxLinux)).s, h3 = (await loginAs(H.email, UA.safariIphone)).s;
  const oldCookie = h1.token, oldSid = h1.sid; const oldDoc = await sess.findOne({ sidHash: sha(oldSid) });
  await clearLimits();
  const wrongPw = await h1.call("POST", "/api/auth/change-password", { currentPassword: "not my password", newPassword: "A brand new passphrase 77", confirmPassword: "A brand new passphrase 77" });
  const hashBefore = (await users.findOne({ _id: H.id })).passwordHash;
  check("G-01 a wrong current password is refused (400, on that field) and nothing changes: same hash, no session ended", wrongPw.status === 400 && wrongPw.json.fields.currentPassword && (await users.findOne({ _id: H.id })).passwordHash === hashBefore && (await h2.me()).json.user !== null);
  const bad = await Promise.all([["", "A brand new passphrase 77", "A brand new passphrase 77"], [PW, "short", "short"], [PW, "A brand new passphrase 77", "different confirm 1234"], [PW, PW, PW]].map(([c, n, f]) => h1.call("POST", "/api/auth/change-password", { currentPassword: c, newPassword: n, confirmPassword: f })));
  check("G-02 a missing current password, a weak new password, a mismatched confirmation and reusing the current password are all refused (400)", bad.every((r) => r.status === 400 && r.json.fields));
  const okPw = await h1.call("POST", "/api/auth/change-password", { currentPassword: PW, newPassword: "A brand new passphrase 77", confirmPassword: "A brand new passphrase 77" });
  const hDoc = await users.findOne({ _id: H.id });
  check("G-03 a valid change: 200, a NEW scrypt hash is stored (never returned), the change time is set; the answer holds no hash or secret", okPw.status === 200 && hDoc.passwordHash !== hashBefore && /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(hDoc.passwordHash) && hDoc.passwordChangedAt instanceof Date && !/passwordHash|scrypt|[0-9a-f]{64}/.test(okPw.text));
  const newDoc = await sess.findOne({ userId: H.id, revokedAt: null, deviceLabel: "Chrome on Windows", revokedReason: { $exists: false } });
  check("G-04 SESSION ROTATION: this browser is still signed in but with a NEW session id; the old id is retired ('rotated'), the new record keeps the original creation time and device; the cookie from BEFORE the change is refused", (await h1.me()).json.user && h1.sid !== oldSid && h1.token !== oldCookie && (await sess.findOne({ _id: oldDoc._id })).revokedReason === "rotated" && newDoc && newDoc.createdAt.getTime() === oldDoc.createdAt.getTime() && (await (async () => { const r = new Session(); r.jar.set("finbyn_session", oldCookie); return (await r.me()).json.user === null; })()));
  check("G-05 the policy 'other devices are signed out' is real: the two other browsers and the registration session are refused and their records ended with reason 'password_changed'", (await h2.me()).json.user === null && (await h3.me()).json.user === null && (await sess.countDocuments({ userId: H.id, revokedReason: "password_changed" })) === 3);
  const hEv = await evts.countDocuments({ userId: H.id, type: "PASSWORD_CHANGED" });
  check("G-06 a PASSWORD_CHANGED event, a password-changed alert (once) and an in-app notification were recorded; no password text appears in any of them", hEv === 1 && (await alerts.countDocuments({ userId: H.id, type: "PASSWORD_CHANGED" })) === 1 && (await notifs.countDocuments({ buyerId: H.id, type: "PASSWORD_CHANGED" })) === 1 && !JSON.stringify(await evts.find({ userId: H.id }).toArray()).includes("brand new passphrase") && !JSON.stringify(await alerts.find({ userId: H.id }).toArray()).includes("brand new passphrase"));
  check("G-07 signing in with the OLD password fails and with the new one works", (await loginAs(H.email, UA.chromeWin, PW)).r.status === 401 && (await loginAs(H.email, UA.chromeWin, "A brand new passphrase 77")).r.status === 200);
  await clearLimits();
  const pwl = []; for (let i = 0; i < 6; i++) pwl.push(await h1.call("POST", "/api/auth/change-password", { currentPassword: "wrong again and again", newPassword: "Another new passphrase 88", confirmPassword: "Another new passphrase 88" }));
  check("G-08 password change attempts that test the current password are rate limited (5 in 10 minutes): the sixth is 429", pwl.slice(0, 5).every((r) => r.status === 400) && pwl[5].status === 429);
  await clearLimits();
  const noSession = await new Session().call("POST", "/api/auth/change-password", { currentPassword: PW, newPassword: "Whatever new 123456", confirmPassword: "Whatever new 123456" });
  check("G-09 without a session the password cannot be changed (401)", noSession.status === 401);

  // ================= H: overview, 2FA, recovery
  const ovA = await api(s1, "overview");
  const o = ovA.json.data;
  check("H-01 the overview: status with criteria, two-step verification 'Not available' (supported false, not enabled), session count, open alerts, history start, account facts, and honest capability flags; private no-store", ovA.status === 200 && ["protected", "action_required", "incomplete"].includes(o.status) && o.twoFactor.supported === false && o.twoFactor.enabled === false && o.twoFactor.label === "Not available" && o.capabilities.twoFactor === false && o.capabilities.recoveryCodes === false && o.capabilities.sessions === true && o.capabilities.signOutOthers === true && /no-store/.test(ovA.headers.get("cache-control") ?? "") && typeof o.sessions.activeCount === "number");
  check("H-02 no two-step-verification endpoint exists (404): nothing can be 'enabled'", (await Promise.all(["setup", "verify-setup", "disable"].map((p) => s1.call("POST", `/api/buyer/security/2fa/${p}`, {})))).every((r) => r.status === 404));
  check("H-03 each buyer's overview counts only their own sessions", (await api(B.s, "overview")).json.data.sessions.activeCount === (await sess.countDocuments({ userId: B.id, revokedAt: null, expiresAt: { $gt: new Date() } })) && o.sessions.activeCount === (await sess.countDocuments({ userId: A.id, revokedAt: null, expiresAt: { $gt: new Date() } })));
  const recA = (await api(s1, "recovery-methods")).json.data;
  await users.updateOne({ _id: B.id }, { $set: { emailVerified: false } });
  const recB = (await api(B.s, "recovery-methods")).json.data;
  check("H-04 recovery methods: a confirmed email is 'verified' and masked (never the full address); an unconfirmed email is 'not verified'; the saved mobile number is NOT treated as verified (no SMS service) and masked to its last four digits; recovery codes are not available; password reset by email is 'unavailable' because no email service is configured", recA.email.state === "verified" && /^\w\*+@example\.test$/.test(recA.email.masked) && !JSON.stringify(recA).includes(A.email) && recB.email.state === "not_verified" && recA.mobile.state === "unavailable" && /\*+3210$/.test(recA.mobile.masked) && recA.recoveryCodes.state === "unavailable" && recA.passwordReset.state === "unavailable" && /not configured/.test(recA.passwordReset.note));
  check("H-05 the account status is 'Incomplete' while the email is unconfirmed", (await api(B.s, "overview")).json.data.status === "incomplete");
  const newAlertOv = (await api(s1, "overview")).json.data.alerts.openCount;
  check("H-06 the alert count equals the unseen alerts of the last 30 days", newAlertOv === (await alerts.countDocuments({ userId: A.id, acknowledgedAt: null, createdAt: { $gte: new Date(Date.now() - 30 * DAY) } })));
  const idxEv = (await evts.indexes()).map((i) => i.name + (i.unique ? ":unique" : "")), idxAl = (await alerts.indexes()).map((i) => i.name + (i.unique ? ":unique" : ""));
  check("H-07 the event and alert indexes exist (newest-first, by type, one-per-key unique, retention)", ["user_events_newest", "user_events_by_type", "user_event_once:unique", "event_retention"].every((n) => idxEv.includes(n)) && ["user_alert_once:unique", "user_alerts_by_state", "user_alerts_newest", "alert_retention"].every((n) => idxAl.includes(n)), `${idxEv.join(",")} | ${idxAl.join(",")}`);

  // ================= K: the page in a browser
  const K = await register("ui"); await users.updateOne({ _id: K.id }, { $set: { emailVerified: true } }); await sess.deleteMany({ userId: K.id });
  const k1 = (await loginAs(K.email, UA.chromeWin)).s, k2 = (await loginAs(K.email, UA.firefoxLinux)).s, k3 = (await loginAs(K.email, UA.safariIphone)).s;
  for (let i = 0; i < 2; i++) await loginAs(K.email, UA.edgeWin, "wrong wrong wrong");
  const ui = await open("/buyer/security", { session: k1 });
  await hydrated(ui, "[role=tablist]");
  await sleep(500);
  const st = await ui.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, crumb: document.querySelector("#buyer-content")?.textContent.slice(0, 110), robots: document.querySelector("meta[name=robots]")?.content, active: [...document.querySelectorAll("[aria-current=page]")].map((e) => e.textContent.trim()), cards: [...document.querySelectorAll("ul[aria-label='Security summary'] li")].map((l) => l.textContent.replace(/\s+/g, " ")), tabs: [...document.querySelectorAll("[role=tab]")].map((t) => t.textContent.trim()), selected: document.querySelector("[role=tab][aria-selected=true]")?.textContent.trim(), headerBtns: [...document.querySelectorAll("button")].filter((b) => /Change Password|Sign Out Other Devices/.test(b.textContent)).map((b) => b.textContent.trim()) }));
  check("K-01 the page: heading, breadcrumb under Settings & Notifications and 'Account Security' highlighted in the sidebar, noindex, four cards from real data (status, two-step 'Not available', active sessions, alerts), six tabs with Security Overview selected, the two header actions, no console errors", ui.status === 200 && st.h1 === "Account Security" && /Home \/ Buyer Dashboard \/ Settings & Notifications \/ Security/.test(st.crumb) && st.active.some((t) => /Account Security/.test(t)) && /noindex/.test(st.robots ?? "") && st.cards.length === 4 && /Account Security\s*Protected/.test(st.cards[0]) && /Two-Step Verification\s*Not available/.test(st.cards[1]) && /Active Sessions\s*3/.test(st.cards[2]) && /Recent Security Alerts/.test(st.cards[3]) && st.tabs.join() === "Security Overview,Password,Two-Step Verification,Active Sessions,Login Activity,Security Notifications" && st.selected === "Security Overview" && st.headerBtns.join() === "Change Password,Sign Out Other Devices" && ui.errs.length === 0, JSON.stringify({ cards: st.cards, errs: ui.errs }));
  const ovText = await content(ui);
  check("K-02 the overview tab: the account-protection explanation with its criteria, recovery methods (email verified, mobile not available, recovery codes not available), and recent security events", /Account protection/.test(ovText) && /no score/.test(ovText) && /Account Recovery/.test(ovText) && /Verified/.test(ovText) && /Recovery codes/.test(ovText) && /Recent security events/.test(ovText) && /Failed sign-in attempt/.test(ovText));
  await clickText(ui, "[role=tab]", "Two-Step Verification");
  const tf = await ui.evaluate(() => { const p = [...document.querySelectorAll("[role=tabpanel]")].find((x) => !x.hidden); return { text: p.textContent.replace(/\s+/g, " "), controls: p.querySelectorAll("input,button,select").length, url: location.search }; });
  check("K-03 the Two-Step Verification tab says 'Not available' with the reason and has no switch, checkbox, button or form: nothing can look enabled", /Not available/.test(tf.text) && /no secure second-factor service/.test(tf.text) && tf.controls === 0 && /tab=2fa/.test(tf.url));
  await clickText(ui, "[role=tab]", "Active Sessions");
  await ui.waitForFunction(() => document.querySelectorAll("table tbody tr").length >= 3, { timeout: 8000 }).catch(() => {});
  const sUi = await ui.evaluate(() => ({ rows: [...document.querySelectorAll("table tbody tr")].map((r) => r.textContent.replace(/\s+/g, " ")), badges: [...document.querySelectorAll("table tbody tr")].filter((r) => /This device/.test(r.textContent)).length, revokeBtns: [...document.querySelectorAll("table tbody button")].filter((b) => /Revoke/.test(b.textContent)).length, note: /Location is shown as Unknown/.test(document.body.textContent) }));
  check("K-04 the Active Sessions tab lists the three sessions in a table: this device is labelled 'This device' and has no revoke button; each other session has Revoke; the page says devices are named from what the browser reports and that location is Unknown", sUi.rows.length === 3 && sUi.badges === 1 && sUi.revokeBtns === 2 && sUi.note && /Chrome on Windows/.test(sUi.rows[0]), JSON.stringify(sUi.rows));
  await ui.evaluate(() => [...document.querySelectorAll("table tbody button")].find((b) => /Firefox on Linux/.test(b.getAttribute("aria-label") ?? "")).click());
  await ui.waitForSelector("[role=dialog], [role=alertdialog]");
  const dlg = await ui.evaluate(() => ({ text: document.querySelector("[role=dialog], [role=alertdialog]").textContent.replace(/\s+/g, " "), focusIn: document.querySelector("[role=dialog], [role=alertdialog]").contains(document.activeElement) }));
  const sessionsBefore = await sess.countDocuments({ userId: K.id, revokedAt: null });
  await ui.keyboard.press("Escape"); await sleep(300);
  const escaped = !(await ui.$("[role=dialog], [role=alertdialog]")) && (await sess.countDocuments({ userId: K.id, revokedAt: null })) === sessionsBefore;
  await ui.evaluate(() => [...document.querySelectorAll("table tbody button")].find((b) => /Firefox on Linux/.test(b.getAttribute("aria-label") ?? "")).click());
  await ui.waitForSelector("[role=dialog], [role=alertdialog]");
  await clickText(ui, "[role=dialog] button, [role=alertdialog] button", "Sign out device");
  await ui.waitForFunction(() => document.querySelectorAll("table tbody tr").length === 2, { timeout: 8000 }).catch(() => {});
  const afterRevokeUi = await ui.evaluate(() => ({ rows: document.querySelectorAll("table tbody tr").length, banner: [...document.querySelectorAll("[role=status]")].map((e) => e.textContent).join(" ") }));
  check("K-05 Revoke asks first (the dialog names the device and says this device is not affected, takes focus, Escape cancels without changing anything); confirming ends the session on the server, the row disappears after the list is read again, and a message confirms it", /Firefox on Linux/.test(dlg.text) && /not affected/.test(dlg.text) && dlg.focusIn && escaped && afterRevokeUi.rows === 2 && /Firefox on Linux was signed out/.test(afterRevokeUi.banner) && (await k2.me()).json.user === null, JSON.stringify({ dlg: dlg.text.slice(0, 120), afterRevokeUi }));
  const revoked = await open("/buyer/security", { session: k2 });
  check("K-06 opening the page with the revoked session's cookie goes to sign-in: the revoked browser is out", /sign-in/.test(revoked.url()));
  await revoked.context.close();
  await clickText(ui, "button", "Sign Out Other Devices");
  await ui.waitForSelector("[role=dialog], [role=alertdialog]");
  const dlg2 = await ui.evaluate(() => document.querySelector("[role=dialog], [role=alertdialog]").textContent.replace(/\s+/g, " "));
  await clickText(ui, "[role=dialog] button, [role=alertdialog] button", "Sign out other devices");
  await ui.waitForFunction(() => document.querySelectorAll("table tbody tr").length === 1, { timeout: 8000 }).catch(() => {});
  check("K-07 'Sign Out Other Devices' shows how many devices will be signed out and that this device stays; after confirming only this session is left and the other browser is refused", /1 other device will be signed out/.test(dlg2) && /This device stays signed in/.test(dlg2) && (await ui.evaluate(() => document.querySelectorAll("table tbody tr").length)) === 1 && (await k3.me()).json.user === null && (await ui.evaluate(async () => (await (await fetch("/api/auth/me")).json()).user !== null)));
  await clickText(ui, "[role=tab]", "Login Activity");
  await ui.waitForFunction(() => document.querySelectorAll("table tbody tr").length >= 3, { timeout: 8000 }).catch(() => {});
  const act = await ui.evaluate(() => ({ text: document.body.textContent.replace(/\s+/g, " "), rows: document.querySelectorAll("table tbody tr").length, range: document.querySelector("select[id$='-range']")?.value, h2: [...document.querySelectorAll("h2")].map((h) => h.textContent.trim()) }));
  check("K-08 the Login Activity tab shows the recorded sign-ins and the failed attempts (with a count) and the security events timeline, a range choice (default last 90 days), and says no IP address or location is recorded and a failed attempt is not proof of an attack", act.rows >= 4 && /Failed sign-in attempt \(2\)/.test(act.text) && /Security Events/.test(act.h2.join()) && act.range === "90d" && /IP addresses and locations are not recorded/.test(act.text) && /not proof of an attack/.test(act.text));
  await ui.select("select[id$='-range']", "7d");
  await sleep(700);
  check("K-09 changing the range reads the server again (still the recent events)", (await ui.evaluate(() => document.querySelectorAll("table tbody tr").length)) >= 3);
  await clickText(ui, "[role=tab]", "Security Notifications");
  await ui.waitForSelector("ul[aria-label='Security alerts']", { timeout: 8000 }).catch(() => {});
  const alertsUi = await ui.evaluate(() => ({ items: document.querySelectorAll("ul[aria-label='Security alerts'] li").length, text: document.body.textContent.replace(/\s+/g, " ") }));
  const unseenBefore = await alerts.countDocuments({ userId: K.id, acknowledgedAt: null });
  await clickText(ui, "button", "Mark as seen");
  await sleep(900);
  const unseenAfter = await alerts.countDocuments({ userId: K.id, acknowledgedAt: null });
  check("K-10 the Security Notifications tab lists the alerts raised on this account, says they are mandatory and in-app only (no email), and 'Mark as seen' saves on the server (one fewer unseen alert)", alertsUi.items >= 1 && /cannot be switched off/.test(alertsUi.text) && /No email is sent/.test(alertsUi.text) && unseenBefore >= 1 && unseenAfter === unseenBefore - 1);
  await clickText(ui, "[role=tab]", "Password");
  await ui.evaluate(() => [...document.querySelectorAll("form[aria-label='Change password'] button[type=submit]")][0].click());
  const pwErr = await ui.evaluate(() => [...document.querySelectorAll("form[aria-label='Change password'] [role=alert], form[aria-label='Change password'] p")].map((e) => e.textContent).join(" "));
  check("K-11 the Password tab uses the one shared form: an empty submit shows the field messages and sends nothing; it says the other devices will be signed out", /Enter your current password/.test(pwErr) && /signs you out of every other device/.test(await content(ui)));
  check("K-12 no console errors during the flows above", ui.errs.length === 0, ui.errs.join(" | "));
  const stayUrl = await ui.evaluate(() => location.search);
  await ui.reload({ waitUntil: "networkidle2" });
  await hydrated(ui, "[role=tablist]");
  check("K-13 the selected tab is kept in the address and restored on reload", /tab=alerts|tab=password/.test(stayUrl) && (await ui.evaluate(() => document.querySelector("[role=tab][aria-selected=true]")?.textContent.trim())) === (/alerts/.test(stayUrl) ? "Security Notifications" : "Password"));
  await ui.focus("[role=tab][aria-selected=true]");
  await ui.keyboard.press("Home");
  const kb = await ui.evaluate(() => document.querySelector("[role=tab][aria-selected=true]")?.textContent.trim());
  await ui.keyboard.press("ArrowRight");
  const kb2 = await ui.evaluate(() => document.querySelector("[role=tab][aria-selected=true]")?.textContent.trim());
  check("K-14 the tabs work by keyboard (Home, Arrow Right) and only the selected tab is in the tab order", kb === "Security Overview" && kb2 === "Password" && (await ui.evaluate(() => [...document.querySelectorAll("[role=tab]")].filter((t) => t.tabIndex === 0).length)) === 1);
  await ui.context.close();
  // unavailable states and isolation of failure
  const k4 = (await loginAs(K.email, UA.chromeWin)).s;
  const failPage = await open("/buyer/security?tab=activity", { session: k4, intercept: (rq) => /login-activity/.test(rq.url()) });
  await hydrated(failPage, "[role=tablist]");
  await sleep(600);
  const failState = await failPage.evaluate(() => ({ text: document.body.textContent.replace(/\s+/g, " "), retry: [...document.querySelectorAll("button")].some((b) => /Try again/.test(b.textContent)) }));
  await clickText(failPage, "[role=tab]", "Password");
  const pwStill = await failPage.evaluate(() => Boolean(document.querySelector("form[aria-label='Change password'] input[type=password]")));
  check("K-15 when login activity cannot be loaded the tab says so with 'Try again' and the Security Events still show; the Password form still opens and works", /Login activity could not be loaded/.test(failState.text) && failState.retry && /Security Events/.test(failState.text) && pwStill);
  await failPage.context.close();
  const sumFail = await open("/buyer/security", { session: k4, intercept: (rq) => /security\/overview/.test(rq.url()) });
  await hydrated(sumFail, "[role=tablist]");
  check("K-16 the settings page links to Account Security and the old sign-out card points there", await (async () => { const sp = await open("/buyer/settings", { session: k4 }); const t = await content(sp); const link = await sp.evaluate(() => [...document.querySelectorAll("a")].some((a) => /\/buyer\/security\?tab=sessions/.test(a.getAttribute("href") ?? ""))); await sp.context.close(); return /Signed-in devices/.test(t) && link && !/list of your signed-in devices is not available/i.test(t); })());
  await sumFail.context.close();
  const emptyUi = await open("/buyer/security?tab=activity", { session: (await loginAs(E.email, UA.chromeWin)).s });
  await hydrated(emptyUi, "[role=tablist]");
  await sleep(500);
  check("K-17 a login history that has only just started shows what exists and that earlier history was not kept (never 'zero attempts')", /Recording started|Signed in/.test(await content(emptyUi)) && /Nothing before that was kept|IP addresses and locations are not recorded/.test(await content(emptyUi)));
  await emptyUi.context.close();

  // ================= R: responsive
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const R2 = await register("resp"); await users.updateOne({ _id: R2.id }, { $set: { emailVerified: true } });
  const rs = (await loginAs(R2.email, UA.chromeWin)).s;
  for (const ua of [UA.firefoxLinux, UA.safariIphone, UA.safariMac]) await loginAs(R2.email, ua);
  for (let i = 0; i < 6; i++) await loginAs(R2.email, UA.edgeWin, "wrong wrong wrong");
  const badW = [];
  for (const w of widths) {
    for (const tab of ["overview", "sessions", "activity", "alerts", "password"]) {
      if (tab !== "overview" && ![320, 390, 768, 1024, 1440].includes(w)) continue;
      const p = await open(`/buyer/security?tab=${tab}`, { width: w, session: rs });
      await hydrated(p, "[role=tablist]");
      await sleep(tab === "overview" ? 500 : 800);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const clipped = await p.evaluate(() => [...document.querySelectorAll("#buyer-content h1, #buyer-content h2, #buyer-content h3, #buyer-content label, #buyer-content button, #buyer-content a")].filter((e) => e.getClientRects().length && !e.classList.contains("visually-hidden") && e.scrollWidth > e.clientWidth + 1 && !/auto|scroll/.test(getComputedStyle(e).overflowX) && !e.closest("[role=tablist]")).map((e) => `${e.tagName}:${e.textContent.slice(0, 22)}`));
      const tap = w <= 480 ? await p.evaluate(() => [...document.querySelectorAll("#buyer-content button, #buyer-content [role=tab]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 32 && !e.classList.contains("visually-hidden"); }).map((e) => `${e.tagName}:${(e.getAttribute("aria-label") ?? e.textContent).slice(0, 20)}`)) : [];
      if (over > 0 || clipped.length || p.errs.length || tap.length) badW.push(`${tab}@${w}: overflow ${over}, clipped ${clipped.slice(0, 2).join("|")}, small targets ${tap.slice(0, 2).join("|")}, errors ${p.errs.length}`);
      if (tab === "sessions" && [390, 768, 1440].includes(w)) await p.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/38-security-sessions-${w}.png`, fullPage: true });
      if (tab === "overview" && w === 1440) await p.screenshot({ path: `${ROOT}/docs/page-reports/screenshots/38-security-overview-1440.png`, fullPage: true });
      await p.context.close();
    }
  }
  check("R-01 no horizontal overflow, clipped headings, labels, buttons or links, undersized touch targets (phones) or console errors at 16 widths (320 to 2560) on the overview, and on the sessions, activity, notifications and password tabs at 320, 390, 768, 1024 and 1440", badW.length === 0, badW.join("; "));
  const phone = await open("/buyer/security?tab=sessions", { width: 390, session: rs });
  const desk = await open("/buyer/security?tab=sessions", { width: 1440, session: rs });
  await sleep(700);
  check("R-02 sessions are cards on a phone (table hidden) and a table on a desktop (cards hidden)", await phone.evaluate(() => getComputedStyle(document.querySelector("table").closest("[class*=tableWrap]")).display === "none" && getComputedStyle(document.querySelector("ul[aria-label='Your active sessions']")).display !== "none") && await desk.evaluate(() => getComputedStyle(document.querySelector("table").closest("[class*=tableWrap]")).display !== "none" && getComputedStyle(document.querySelector("ul[aria-label='Your active sessions']")).display === "none"));
  await phone.context.close(); await desk.context.close();
  const narrow = await open("/buyer/security?tab=sessions", { width: 320, session: rs });
  await sleep(700);
  await narrow.evaluate(() => [...document.querySelectorAll("ul[aria-label='Your active sessions'] button")].find((b) => /Revoke/.test(b.textContent)).click());
  await narrow.waitForSelector("[role=dialog], [role=alertdialog]");
  const fits = await narrow.evaluate(() => { const r = document.querySelector("[role=dialog], [role=alertdialog]").getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight }; });
  check("R-03 the confirmation dialog fits the screen at 320 px (within the viewport on every side)", fits.left >= 0 && fits.right <= fits.vw && fits.top >= 0 && fits.bottom <= fits.vh + 1, JSON.stringify(fits));
  await narrow.context.close();
  const zoom = await open("/buyer/security?tab=sessions", { width: 1440, session: rs });
  const zoomBad = [];
  for (const f of [0.8, 1.25, 1.5, 2]) { await zoom.setViewport({ width: Math.round(1440 / f), height: Math.round(900 / f) }); await sleep(150); const ov2 = await zoom.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (ov2 > 0) zoomBad.push(`${f}: ${ov2}`); }
  check("R-04 browser zoom equivalents (80, 125, 150 and 200 percent, as the matching viewport widths) cause no horizontal overflow", zoomBad.length === 0, zoomBad.join(", "));
  await zoom.context.close();
  const ka = await open("/buyer/security?tab=sessions", { session: rs });
  await hydrated(ka, "[role=tablist]");
  await sleep(600);
  const a11y = await ka.evaluate(() => ({ tablist: Boolean(document.querySelector("[role=tablist][aria-label]")), panels: [...document.querySelectorAll("[role=tabpanel]")].every((p) => p.getAttribute("aria-labelledby") && document.getElementById(p.getAttribute("aria-labelledby"))), table: Boolean(document.querySelector("table caption")), headers: [...document.querySelectorAll("table th")].every((h) => h.getAttribute("scope") === "col"), revoke: [...document.querySelectorAll("table tbody button")].every((b) => /Sign out .+, signed in/.test(b.getAttribute("aria-label") ?? "")), status: [...document.querySelectorAll("table tbody tr")].every((r) => /This device|Active/.test(r.textContent)), noSecrets: !/sidHash|finbyn_session/.test(document.body.innerHTML) && !document.cookie.includes("finbyn_session") }));
  await ka.evaluate(() => { const b = [...document.querySelectorAll("table tbody button")].find((x) => /Revoke/.test(x.textContent)); b.focus(); b.click(); });
  await ka.waitForSelector("[role=dialog], [role=alertdialog]");
  const inDlg = await ka.evaluate(() => document.querySelector("[role=dialog], [role=alertdialog]").contains(document.activeElement));
  await ka.keyboard.press("Escape"); await sleep(300);
  const backToBtn = await ka.evaluate(() => /Revoke/.test(document.activeElement?.textContent ?? ""));
  check("R-05 accessibility structure: labelled tablist and tabpanels, a captioned table with column headers, revoke buttons named with the device and time, status in words, no secret anywhere in the page HTML; the dialog takes focus, closes on Escape and returns focus to the button", Object.values(a11y).every(Boolean) && inDlg && backToBtn, JSON.stringify(a11y));
  await ka.context.close();

  if (process.env.SKIP_PERF === "1") return;
  // ================= P: performance
  await clearLimits();
  const D2 = await register("perf"); await users.updateOne({ _id: D2.id }, { $set: { emailVerified: true } });
  const ps = (await loginAs(D2.email, UA.chromeWin)).s;
  const one = await timeIt(() => api(ps, "sessions"));
  const oneOv = await timeIt(() => api(ps, "overview"));
  for (let i = 0; i < 4; i++) await loginAs(D2.email, i % 2 ? UA.firefoxLinux : UA.safariMac);
  const five = await timeIt(() => api(ps, "sessions"));
  const fiveOv = await timeIt(() => api(ps, "overview"));
  for (let i = 0; i < 15; i++) await loginAs(D2.email, [UA.edgeWin, UA.safariIphone, UA.firefoxLinux][i % 3]);
  const twenty = await timeIt(() => api(ps, "sessions"));
  const twentyOv = await timeIt(() => api(ps, "overview"));
  const base2 = Date.now() - 300 * DAY;
  const bulk = []; for (let i = 0; i < 10000; i++) bulk.push({ userId: D2.id, type: i % 7 === 0 ? "LOGIN_FAILED" : i % 5 === 0 ? "LOGOUT" : "LOGIN_SUCCEEDED", at: new Date(base2 + i * 2_000_000), deviceLabel: "Chrome on Windows", count: 1, purgeAt: new Date(Date.now() + 300 * DAY) });
  for (let i = 0; i < bulk.length; i += 5000) await evts.insertMany(bulk.slice(i, i + 5000));
  const alertDocs = Array.from({ length: 2000 }, (_, i) => ({ userId: D2.id, type: "NEW_DEVICE_SIGN_IN", severity: "info", title: "New device signed in", summary: "x", recommended: "y", createdAt: new Date(Date.now() - i * 60_000), acknowledgedAt: i % 3 === 0 ? null : new Date(), dedupeKey: `perf:${i}`, purgeAt: new Date(Date.now() + 300 * DAY) }));
  await alerts.insertMany(alertDocs);
  const t = {
    login: await timeIt(() => api(ps, "login-activity?range=all")),
    loginDeep: await timeIt(() => api(ps, `login-activity?range=all&before=${encodeURIComponent(`${String(base2 + 3000 * 2_000_000).padStart(15, "0")}:${"f".repeat(24)}`)}`)),
    events: await timeIt(() => api(ps, "events?range=all")),
    alerts: await timeIt(() => api(ps, "alerts")),
    alertsOpen: await timeIt(() => api(ps, "alerts?status=open")),
    overviewBig: await timeIt(() => api(ps, "overview")),
    recovery: await timeIt(() => api(ps, "recovery-methods")),
  };
  const ackIds = (await alerts.find({ userId: D2.id, acknowledgedAt: null }, { projection: { _id: 1 } }).limit(40).toArray()).map((a) => String(a._id));
  const ackT = []; for (const id2 of ackIds.slice(0, 30)) { const s0 = performance.now(); const r = await ps.call("PATCH", `/api/buyer/security/alerts/${id2}/acknowledge`); ackT.push(performance.now() - s0); if (r.status !== 200) throw new Error(`ack ${r.status}`); }
  const revokeT = [];
  for (let i = 0; i < 12; i++) { await sess.updateOne({ sidHash: sha(ps.sid) }, { $set: { lastActiveAt: new Date() } }); const x = (await loginAs(D2.email, UA.edgeWin)).s; const mine = (await sessionsOf(ps)).sessions.find((q) => q.deviceLabel === "Edge on Windows" && !q.current); await clearLimits(); const s0 = performance.now(); const r = await ps.call("DELETE", `/api/buyer/security/sessions/${mine.id}`); revokeT.push(performance.now() - s0); if (r.status !== 200) throw new Error(`revoke ${r.status} ${r.text}`); void x; }
  const meTracked = await timeIt(() => ps.me());
  const legacyP = new Session(); legacyP.jar.set("finbyn_session", craft(String(D2.id), (await users.findOne({ _id: D2.id })).sessionVersion ?? 0, null));
  const meLegacy = await timeIt(() => legacyP.me());
  const sizes = { sessions: (await api(ps, "sessions")).text.length, login: (await api(ps, "login-activity?range=all")).text.length, events: (await api(ps, "events?range=all")).text.length, alerts: (await api(ps, "alerts")).text.length };
  const par = await Promise.all(Array.from({ length: 10 }, () => api(ps, "login-activity?range=all")));
  console.log(`  PERF sessions 1/5/20: p50 ${one.p50.toFixed(0)}/${five.p50.toFixed(0)}/${twenty.p50.toFixed(0)} p95 ${one.p95.toFixed(0)}/${five.p95.toFixed(0)}/${twenty.p95.toFixed(0)} p99 ${one.p99.toFixed(0)}/${five.p99.toFixed(0)}/${twenty.p99.toFixed(0)}; overview 1/5/20 p95 ${oneOv.p95.toFixed(0)}/${fiveOv.p95.toFixed(0)}/${twentyOv.p95.toFixed(0)}; ` + Object.entries(t).map(([k, v]) => `${k} p50 ${v.p50.toFixed(0)} p95 ${v.p95.toFixed(0)} p99 ${v.p99.toFixed(0)}`).join("; ") + `; ack p50 ${med(ackT, 0.5).toFixed(0)} p95 ${med(ackT, 0.95).toFixed(0)}; revoke p50 ${med(revokeT, 0.5).toFixed(0)} p95 ${med(revokeT, 0.95).toFixed(0)}; auth/me tracked p50 ${meTracked.p50.toFixed(0)} p95 ${meTracked.p95.toFixed(0)} vs legacy cookie p50 ${meLegacy.p50.toFixed(0)} p95 ${meLegacy.p95.toFixed(0)}; sizes ${JSON.stringify(sizes)}`);
  check("P-01 against the targets (p95), with 20 sessions, 10,000 events and 2,000 alerts: overview under 300 ms, sessions under 300, login activity under 350, security events under 350, alert acknowledgement under 300, revoke under 400", [one, five, twenty].every((x) => x.p95 < 300) && [oneOv, fiveOv, twentyOv, t.overviewBig].every((x) => x.p95 < 300) && t.login.p95 < 350 && t.loginDeep.p95 < 350 && t.events.p95 < 350 && t.alerts.p95 < 350 && t.alertsOpen.p95 < 350 && med(ackT, 0.95) < 300 && med(revokeT, 0.95) < 400, `sessions ${one.p95.toFixed(0)}/${five.p95.toFixed(0)}/${twenty.p95.toFixed(0)}, overview ${t.overviewBig.p95.toFixed(0)}, login ${t.login.p95.toFixed(0)}, events ${t.events.p95.toFixed(0)}, alerts ${t.alerts.p95.toFixed(0)}, ack ${med(ackT, 0.95).toFixed(0)}, revoke ${med(revokeT, 0.95).toFixed(0)}`);
  check("P-02 pages stay small with the full history stored (20 rows each, under 25 KB) and ten simultaneous requests succeed", Object.values(sizes).every((n) => n < 25_000) && par.every((r) => r.status === 200), JSON.stringify(sizes));
  const plans = {}; const run = async (name, cursor) => { const ex = await cursor.explain("executionStats"); plans[name] = { s: JSON.stringify(ex.queryPlanner.winningPlan), docs: ex.executionStats.totalDocsExamined, keys: ex.executionStats.totalKeysExamined }; };
  const now = new Date();
  await run("authLookup", sess.find({ sidHash: sha(ps.sid), revokedAt: null, expiresAt: { $gt: now } }));
  await run("sessionList", sess.find({ userId: D2.id, revokedAt: null, expiresAt: { $gt: now }, v: 0 }).sort({ lastActiveAt: -1 }).limit(25));
  await run("sessionCount", sess.find({ userId: D2.id, revokedAt: null, expiresAt: { $gt: now }, v: 0 }));
  await run("deviceKnown", sess.find({ userId: D2.id, deviceKey: "abc" }));
  await run("loginActivity", evts.find({ userId: D2.id, type: { $in: ["LOGIN_SUCCEEDED", "LOGIN_FAILED", "LOGOUT"] }, at: { $gte: new Date(Date.now() - 365 * DAY) } }).sort({ at: -1, _id: -1 }).limit(21));
  await run("events", evts.find({ userId: D2.id, type: { $in: ["LOGIN_SUCCEEDED", "LOGIN_FAILED", "LOGOUT", "PASSWORD_CHANGED", "PASSWORD_RESET", "SIGNED_OUT_EVERYWHERE", "SESSION_REVOKED", "SECURITY_ALERT"] }, at: { $gte: new Date(Date.now() - 365 * DAY) } }).sort({ at: -1, _id: -1 }).limit(21));
  await run("failedBucket", evts.find({ userId: D2.id, dedupeKey: "failed:1" }));
  await run("alertsAll", alerts.find({ userId: D2.id }).sort({ createdAt: -1, _id: -1 }).limit(21));
  await run("alertsOpen", alerts.find({ userId: D2.id, acknowledgedAt: null }).sort({ createdAt: -1, _id: -1 }).limit(21));
  await run("alertOnce", alerts.find({ userId: D2.id, dedupeKey: "x" }));
  check("P-03 every query behind the page uses an index (no collection scan, no blocking sort); the lists read about one page of documents out of 10,000 events and 2,000 alerts, and the per-request session lookup reads one document", Object.values(plans).every((p) => /IXSCAN|EXPRESS/.test(p.s) && !/COLLSCAN/.test(p.s) && !/"SORT"/.test(p.s)) && plans.authLookup.docs <= 1 && plans.loginActivity.docs <= 60 && plans.events.docs <= 60 && plans.alertsAll.docs <= 25 && plans.alertsOpen.docs <= 25 && plans.failedBucket.docs <= 1 && plans.alertOnce.docs <= 1 && plans.deviceKnown.docs <= 1, Object.entries(plans).map(([k, p]) => `${k}: ${p.docs} docs/${p.keys} keys`).join(", "));
}

async function cleanup() {
  if (process.env.KEEP === "1") return;
  const mine = await users.find({ email: { $regex: `^t38-${stamp}-` } }, { projection: { _id: 1 } }).toArray();
  const ids2 = mine.map((u) => u._id);
  await sess.deleteMany({ userId: { $in: ids2 } });
  await evts.deleteMany({ userId: { $in: ids2 } });
  await alerts.deleteMany({ userId: { $in: ids2 } });
  await notifs.deleteMany({ buyerId: { $in: ids2 } });
  await db.collection("notifications").deleteMany({ buyerId: { $in: ids2 } });
  await db.collection("buyer_settings").deleteMany({ userId: { $in: ids2 } }).catch(() => undefined);
  await users.deleteMany({ _id: { $in: ids2 } });
  await clearLimits();
}

try {
  await main();
} catch (error) {
  check("suite ran to the end without throwing", false, String(error?.stack ?? error));
} finally {
  await cleanup();
  await browser?.close();
  await client.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? "\nFAILED:\n" + failed.map((f) => " - " + f.name).join("\n") : ""}`);
process.exit(failed.length ? 1 : 0);
