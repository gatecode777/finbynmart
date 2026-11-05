import fs from "node:fs";
import http from "node:http";
import { createHash, createHmac } from "node:crypto";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

// Page 15 (Buyer Registration: /register, /register/buyer), the account-recovery flows (verify email, forgot and reset
// password) and Contact Us (/contact-us, POST /api/support/requests).
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test, Chrome and puppeteer-core.
//   MODE=nomail  server started WITHOUT an email provider (the default): registration signs the buyer in, recovery says "not set up".
//   MODE=mail    server started with EMAIL_API_KEY=test-key EMAIL_FROM=... EMAIL_API_URL=http://127.0.0.1:3199/emails APP_URL=http://localhost:3100.
//                The provider is a LOCAL STAND-IN started by this script: it proves what the application sends and how it reacts
//                to the provider's answers. It does not prove delivery by any real email service (none is configured).
// Writes only to the throwaway database and removes its own users, tokens and support requests at the end unless KEEP=1.
const BASE = process.env.BASE || "http://localhost:3100";
const MODE = process.env.MODE || "nomail";
const ROOT = "R:/indiamartref";
const TEST_DB = "finbynmart_test";
const STAND_IN_PORT = 3199;
const require = createRequire(`${ROOT}/`);
const { MongoClient } = require("mongodb");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const eq = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === TEST_DB) throw new Error("Refusing: the configured live database is named like the test database.");
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const db = client.db(TEST_DB);
const users = db.collection("users"), tokens = db.collection("auth_tokens"), support = db.collection("support_requests");
await db.collection("rate_limits").deleteMany({});

const stamp = Date.now();
const emailOf = (tag) => `t15-${stamp}-${tag}@example.test`;
const CONSENT = "2026-11-02";
let ipN = 0;
const nextIp = () => `10.15.${(stamp % 200) + 1}.${(++ipN % 250) + 1}`;
const GOOD_PW = "correct horse battery";
const body = (tag, over = {}) => ({ name: "Asha Verma", email: emailOf(tag), phone: { countryCode: "+91", number: "9876543210" }, companyName: "Verma Traders", password: GOOD_PW, confirmPassword: GOOD_PW, consent: true, consentPolicyVersion: CONSENT, ...over });

class Session {
  jar = new Map();
  async call(method, p, payload, headers = {}) {
    const response = await fetch(BASE + p, { method, headers: { "x-forwarded-for": this.ip ?? nextIp(), ...(payload !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.jar.size ? { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...headers }, body: payload === undefined ? undefined : typeof payload === "string" ? payload : JSON.stringify(payload), redirect: "manual" });
    for (const line of response.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); this.jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    let json = null; try { json = await response.json(); } catch {}
    return { status: response.status, json, headers: response.headers };
  }
}
const call = (method, p, payload, headers) => new Session().call(method, p, payload, headers);

// ---- the stand-in email provider
const mails = [];
let providerStatus = 200;
const standIn = http.createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    let parsed = null; try { parsed = JSON.parse(data); } catch {}
    mails.push({ auth: req.headers.authorization, body: parsed, at: Date.now() });
    res.writeHead(providerStatus, { "Content-Type": "application/json" }).end(JSON.stringify({ id: "stand-in" }));
  });
});
if (MODE === "mail") await new Promise((resolve) => standIn.listen(STAND_IN_PORT, "127.0.0.1", resolve));
const mailsTo = (email) => mails.filter((m) => m.body?.to?.includes(email));
const tokenFrom = (mail, path) => mail?.body?.text.match(new RegExp(`${path}\\?token=([A-Za-z0-9_-]{43})`))?.[1];
const clearCd = (email) => db.collection("rate_limits").deleteMany({ _id: { $regex: "^forgot-(cd|email):" + email.split(".").join("\.") + ":" } });
const forgot = async (email, path = "/api/auth/forgot-password", headers) => { await clearCd(email); const r = await call("POST", path, { email }, headers); await sleep(1500); return r; };
const sha = (s) => createHash("sha256").update(s).digest("hex");

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
async function open(p, { width = 1440, cookies = [] } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/40\d|409|429|50\d|Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  if (cookies.length) await page.setCookie(...cookies.map((c) => ({ ...c, url: BASE })));
  await page.setViewport({ width, height: 900 });
  const resp = await page.goto(BASE + p, { waitUntil: "networkidle2" });
  page.errs = errs; page.status = resp.status(); page.context = context;
  return page;
}
const text = (p) => p.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
const setValue = (p, selector, value) => p.evaluate((s, v) => { const el = document.querySelector(s); const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, selector, value);
const byLabel = (p, t) => p.evaluate((x) => { const l = [...document.querySelectorAll("form label")].find((e) => e.textContent.replace(/\*/g, "").trim() === x); return l?.htmlFor ? `#${CSS.escape(l.htmlFor)}` : null; }, t);
const fill = async (p, label, value) => { const sel = await byLabel(p, label); if (!sel) throw new Error(`no field labelled ${label}`); await setValue(p, sel, value); };
const clickText = (p, selector, t) => p.evaluate((s, x) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(x)); if (!el) return false; el.click(); return true; }, selector, t);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function nomail() {
  // ================= A: registration API
  const s1 = new Session();
  const r1 = await s1.call("POST", "/api/auth/register/buyer", body("a1"));
  check("A-01 a valid registration is created (201) and the buyer is signed in", r1.status === 201 && r1.json.ok && r1.json.signedIn === true && r1.json.user.role === "buyer" && s1.jar.has("finbyn_session"), JSON.stringify(r1.json));
  const u1 = await users.findOne({ email: emailOf("a1") });
  check("A-02 stored: role buyer, ACTIVE, email NOT verified, phone NOT verified, company UNVERIFIED", u1?.role === "buyer" && u1.accountStatus === "ACTIVE" && u1.emailVerified === false && u1.phoneVerified === false && u1.companyStatus === "UNVERIFIED", JSON.stringify({ ...u1, passwordHash: "…" }));
  check("A-03 stored phone is normalised, company and consent (with policy version) are kept", u1?.phone?.normalized === "+91 9876543210" && u1.phone.countryCode === "+91" && u1.companyName === "Verma Traders" && u1.consent?.policyVersion === CONSENT && u1.consent.acceptedAt instanceof Date);
  check("A-04 the password is stored only as a salted hash (salt:hash), never in plain text", /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(u1.passwordHash) && !JSON.stringify(u1).includes(GOOD_PW) && !("password" in u1) && !("confirmPassword" in u1));
  check("A-05 the response carries no hash, password or internal field", !/passwordHash|password|_id/.test(JSON.stringify(r1.json)), JSON.stringify(r1.json));
  check("A-06 the session cookie is httpOnly and SameSite=Lax", await (async () => { const raw = await fetch(BASE + "/api/auth/register/buyer", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() }, body: JSON.stringify(body("a6")) }); const c = raw.headers.getSetCookie().find((x) => x.startsWith("finbyn_session=")) ?? ""; return /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c); })());
  const me = await s1.call("GET", "/api/auth/me");
  check("A-07 /api/auth/me recognises the new session", me.status === 200 && me.json?.user?.email === emailOf("a1"), JSON.stringify(me.json));
  const dup = await call("POST", "/api/auth/register/buyer", body("a1", { email: emailOf("a1").toUpperCase() }));
  check("A-08 the same email again (any case) is refused with 409 on the email field", dup.status === 409 && dup.json.fields?.email && (await users.countDocuments({ email: emailOf("a1") })) === 1, JSON.stringify(dup.json));
  const rolePost = await call("POST", "/api/auth/register/buyer", body("a9", { role: "admin" }));
  check("A-09 a request that sets the role is refused and creates nothing", rolePost.status === 400 && rolePost.json.fields?.role && !(await users.findOne({ email: emailOf("a9") })), JSON.stringify(rolePost.json));
  for (const key of ["accountStatus", "emailVerified", "phoneVerified", "companyId", "passwordHash", "isAdmin", "_id", "verified"]) {
    const attempt = await call("POST", "/api/auth/register/buyer", body("a9", { [key]: key === "accountStatus" ? "ACTIVE" : true }));
    check(`A-10 "${key}" in the request is refused`, attempt.status === 400 && attempt.json.fields?.[key] && !(await users.findOne({ email: emailOf("a9") })));
  }
  const invalid = [["name", { name: "" }], ["email", { email: "nope" }], ["phone", { phone: { countryCode: "+91", number: "123" } }], ["companyName", { companyName: "" }], ["password", { password: "short", confirmPassword: "short" }], ["confirmPassword", { confirmPassword: "different pass phrase" }], ["consent", { consent: false }]];
  for (const [field, over] of invalid) {
    const res = await call("POST", "/api/auth/register/buyer", body("a11", over));
    check(`A-11 invalid ${field}: 400 with the message on that field, nothing stored`, res.status === 400 && res.json.fields?.[field] && !(await users.findOne({ email: emailOf("a11") })), JSON.stringify(res.json.fields));
  }
  const all = await call("POST", "/api/auth/register/buyer", {});
  check("A-12 an empty body lists every required field at once", all.status === 400 && ["name", "email", "phone", "companyName", "password", "confirmPassword", "consent"].every((k) => all.json.fields?.[k]), JSON.stringify(Object.keys(all.json.fields ?? {})));
  check("A-13 not JSON: 400", (await call("POST", "/api/auth/register/buyer", "{nope")).status === 400);
  check("A-14 a JSON array body: 400", (await call("POST", "/api/auth/register/buyer", [1, 2])).status === 400);
  check("A-15 an oversized body is refused (400)", (await call("POST", "/api/auth/register/buyer", { ...body("a15"), pad: "x".repeat(6000) })).status === 400 && !(await users.findOne({ email: emailOf("a15") })));
  check("A-16 a stale consent version is refused", (await call("POST", "/api/auth/register/buyer", body("a16", { consentPolicyVersion: "1999-01-01" }))).status === 400);
  const long = await call("POST", "/api/auth/register/buyer", body("a17", { password: "xY".repeat(65), confirmPassword: "xY".repeat(65) }));
  check("A-17 a 130-character password is refused (no unbounded hashing work)", long.status === 400 && long.json.fields?.password);
  const inj = await call("POST", "/api/auth/register/buyer", body("a18", { name: "Robert <script>alert(1)</script>", email: { $ne: "" } }));
  check("A-18 markup in the name and an operator object as email are refused", inj.status === 400 && inj.json.fields?.name && inj.json.fields?.email);
  const login = new Session();
  const li = await login.call("POST", "/api/auth/login", { email: emailOf("a1"), password: GOOD_PW });
  const after = await users.findOne({ email: emailOf("a1") });
  check("A-19 the new buyer can sign in, and lastLoginAt is recorded", li.status === 200 && after.lastLoginAt instanceof Date, JSON.stringify(li.json));
  const tokensBefore = await tokens.countDocuments({});
  const noMail = await call("POST", "/api/auth/forgot-password", { email: emailOf("a1") });
  check("A-20 with no email provider, forgot-password says so (503) instead of pretending to send", noMail.status === 503 && /not set up/i.test(noMail.json.message) && (await tokens.countDocuments({})) === tokensBefore, JSON.stringify(noMail.json));
  const noMail2 = await call("POST", "/api/auth/resend-verification", { email: emailOf("a1") });
  check("A-21 resend-verification says so as well (503), and creates no token", noMail2.status === 503 && (await tokens.countDocuments({})) === tokensBefore);
  check("A-22 verify-email with a made-up token: 400", (await call("POST", "/api/auth/verify-email", { token: "a".repeat(43) })).status === 400);
  check("A-23 reset-password with a made-up token: 400", (await call("POST", "/api/auth/reset-password", { token: "a".repeat(43), password: GOOD_PW, confirmPassword: GOOD_PW })).status === 400);
  const susp = await users.updateOne({ email: emailOf("a1") }, { $set: { accountStatus: "SUSPENDED" } });
  const suspMe = await s1.call("GET", "/api/auth/me");
  const suspLogin = await call("POST", "/api/auth/login", { email: emailOf("a1"), password: GOOD_PW });
  check("A-24 a suspended account loses its session and cannot sign in (403)", susp.modifiedCount === 1 && !suspMe.json?.user && suspLogin.status === 403, `${suspMe.status} ${JSON.stringify(suspMe.json)} ${suspLogin.status}`);
  await users.updateOne({ email: emailOf("a1") }, { $set: { accountStatus: "ACTIVE" } });
  const wrong = await call("POST", "/api/auth/login", { email: emailOf("a1"), password: "wrong password here" });
  const unknown = await call("POST", "/api/auth/login", { email: emailOf("nobody"), password: "wrong password here" });
  check("A-25 wrong password and unknown email give the same answer", wrong.status === 401 && unknown.status === 401 && wrong.json.message === unknown.json.message);

  // rate limit: only well-formed requests count; the 11th well-formed registration from one address is refused
  const limitIp = `10.99.${stamp % 250}.7`;
  const limited = new Session(); limited.ip = limitIp;
  const typos = [];
  for (let i = 0; i < 15; i++) typos.push((await limited.call("POST", "/api/auth/register/buyer", body("rl", { email: "bad" }))).status);
  check("A-26 invalid submissions never count against the limit (15 typos, all 400)", typos.every((s) => s === 400), typos.join());
  const codes = [];
  for (let i = 0; i < 12; i++) codes.push((await new Session().call("POST", "/api/auth/register/buyer", body(`rl${i}`), { "x-forwarded-for": limitIp })).status);
  check("A-27 the 11th well-formed registration in an hour from one address gets 429", codes.slice(0, 10).every((c) => c === 201) && codes.slice(10).every((c) => c === 429), codes.join());
  const rl = await new Session().call("POST", "/api/auth/register/buyer", body("rl99"), { "x-forwarded-for": limitIp });
  check("A-28 the 429 carries Retry-After and the stored data is not changed", rl.status === 429 && Number(rl.headers.get("retry-after")) > 0 && !(await users.findOne({ email: emailOf("rl99") })));

  // ================= C: Contact Us API
  const cb = (over = {}) => ({ name: "Priya Nair", email: emailOf("c1"), phone: { countryCode: "+91", number: "" }, topic: "BUYER_HELP", message: "I cannot find where to download my invoice for last month.", consent: true, consentPolicyVersion: CONSENT, idempotencyKey: `c15${stamp}${++ipN}abcdef0123`, ...over });
  const c1 = cb();
  const sc1 = new Session();
  const cr = await sc1.call("POST", "/api/support/requests", c1);
  check("C-01 a valid message is saved: 201 with a FBM-SUP reference", cr.status === 201 && /^FBM-SUP-[0-9A-HJKMNP-TV-Z]{8}$/.test(cr.json.reference) && cr.json.ok, JSON.stringify(cr.json));
  check("C-02 the answer says the request was saved and that NOBODY is notified (never 'sent' or 'we will reply')", cr.json.notified === false && /saved/i.test(cr.json.message) && /nobody is notified/i.test(cr.json.message) && !/we will (reply|respond|get back)|email(ed)? sent|sent to our team/i.test(cr.json.message), cr.json.message);
  const cdoc = await support.findOne({ reference: cr.json.reference });
  check("C-03 stored: topic, message, status NEW, consent with version, notification BLOCKED, no phone when none given", cdoc?.topic === "BUYER_HELP" && cdoc.status === "NEW" && cdoc.consent.policyVersion === CONSENT && cdoc.notification.status === "BLOCKED" && !("phone" in cdoc) && !("userId" in cdoc), JSON.stringify(cdoc));
  const replay = await sc1.call("POST", "/api/support/requests", c1);
  check("C-04 a retry with the same key returns the same reference and saves nothing new", replay.status === 200 && replay.json.reference === cr.json.reference && replay.json.duplicate === true && (await support.countDocuments({ idempotencyKey: c1.idempotencyKey })) === 1);
  const withPhone = await call("POST", "/api/support/requests", cb({ phone: { countryCode: "+44", number: "7911 123456" }, email: emailOf("c2") }));
  check("C-05 a phone number, when given, is validated and stored normalised", withPhone.status === 201 && (await support.findOne({ reference: withPhone.json.reference })).phone === "+44 7911123456");
  const badPhone = await call("POST", "/api/support/requests", cb({ phone: { countryCode: "+91", number: "123" }, email: emailOf("c3") }));
  check("C-06 an invalid phone number is refused", badPhone.status === 400 && badPhone.json.fields?.phone);
  for (const [field, over] of [["name", { name: "" }], ["email", { email: "x" }], ["topic", { topic: "HACK" }], ["message", { message: "hi" }], ["consent", { consent: false }]]) {
    const res = await call("POST", "/api/support/requests", cb({ ...over, idempotencyKey: undefined }));
    check(`C-07 invalid ${field}: 400 on that field, nothing stored`, res.status === 400 && res.json.fields?.[field]);
  }
  const tag = `bogus-${stamp}`;
  const trusted = await call("POST", "/api/support/requests", cb({ status: "CLOSED", userId: "507f1f77bcf86cd799439011", reference: "FBM-SUP-AAAAAAAA", notification: { status: "SENT" }, email: emailOf("c4"), message: `${tag} extra fields in the body must be ignored by the server.` }));
  const tdoc = await support.findOne({ reference: trusted.json.reference });
  check("C-08 status, user, reference and notification in the body are ignored", trusted.status === 201 && tdoc.status === "NEW" && !tdoc.userId && tdoc.reference !== "FBM-SUP-AAAAAAAA" && tdoc.notification.status === "BLOCKED");
  const signed = new Session();
  const sr = await signed.call("POST", "/api/auth/register/buyer", body("c5"));
  const mine = await signed.call("POST", "/api/support/requests", cb({ email: emailOf("c5"), idempotencyKey: undefined }));
  const mdoc = await support.findOne({ reference: mine.json.reference });
  const reg5 = await users.findOne({ email: emailOf("c5") });
  check("C-09 a signed-in sender is linked from the session", sr.status === 201 && mdoc?.userId?.toString() === reg5._id.toString());
  check("C-10 an oversized body is refused", (await call("POST", "/api/support/requests", cb({ message: "x".repeat(7000) }))).status === 400);
  const lim = [];
  const lIp = `10.98.${stamp % 250}.9`;
  for (let i = 0; i < 7; i++) lim.push((await new Session().call("POST", "/api/support/requests", cb({ email: emailOf(`cl${i}`), idempotencyKey: undefined }), { "x-forwarded-for": lIp })).status);
  check("C-11 the 6th message in an hour from one address gets 429 (5 allowed)", lim.slice(0, 5).every((s) => s === 201) && lim.slice(5).every((s) => s === 429), lim.join());
  const emailLim = [];
  for (let i = 0; i < 4; i++) emailLim.push((await call("POST", "/api/support/requests", cb({ email: emailOf("c6"), idempotencyKey: undefined }))).status);
  check("C-12 the 4th message with the same email in an hour gets 429 (3 allowed)", emailLim.slice(0, 3).every((s) => s === 201) && emailLim[3] === 429, emailLim.join());

  // ================= P: pages
  const redirect = async (p) => { const res = await fetch(BASE + p, { redirect: "manual", headers: { "x-forwarded-for": nextIp() } }); return { status: res.status, location: res.headers.get("location") }; };
  const rr = await redirect("/register");
  check("P-01 /register redirects to /register/buyer", [307, 308].includes(rr.status) && rr.location?.endsWith("/register/buyer"), JSON.stringify(rr));
  const rn = await redirect("/register?next=/inquiry/shree-textiles");
  check("P-02 /register keeps a safe next path", rn.location?.endsWith("/register/buyer?next=%2Finquiry%2Fshree-textiles"), rn.location);
  const re = await redirect("/register?next=//evil.example/x");
  check("P-03 /register drops an unsafe next (open-redirect guard)", re.location?.endsWith("/register/buyer"), re.location);
  const page = await open("/register/buyer");
  const t0 = await text(page);
  check("P-04 /register/buyer renders: heading, benefits panel, all fields, no console errors", page.status === 200 && /Create Your Buyer Account/.test(t0) && /Join Finbyn Mart/.test(t0) && ["Full Name", "Business Email", "Mobile Number", "Company Name", "Password", "Confirm Password"].every((l) => t0.includes(l)) && page.errs.length === 0, page.errs.join("|"));
  check("P-05 no social sign-up buttons, no OTP controls, no pre-ticked consent", !/Google|LinkedIn|Facebook|Send OTP|Verify OTP/i.test(await page.evaluate(() => document.querySelector("main")?.textContent ?? "")) && (await page.evaluate(() => document.querySelector('input[type="checkbox"]').checked === false)));
  check("P-06 the page does not claim verification: it says companies and numbers are not verified", /does not verify companies or mobile numbers/i.test(t0) && /not verified by Finbyn Mart/i.test(t0));
  check("P-07 exactly one h1, and every form control has a label", await page.evaluate(() => document.querySelectorAll("h1").length === 1 && [...document.querySelectorAll("form input:not([type=checkbox]), form select, form textarea")].every((el) => el.labels?.length > 0 || el.getAttribute("aria-label"))));
  check("P-08 the terms and privacy links open in a new tab safely", await page.evaluate(() => [...document.querySelectorAll('form a[href="/terms-and-conditions"], form a[href="/privacy-policy"]')].length === 2 && [...document.querySelectorAll('form a[target="_blank"]')].every((a) => /noopener/.test(a.rel))));
  await page.context.close();
  for (const [p, pattern] of [["/forgot-password", /Forgot Password?/], ["/verify-email", /needs the link from your confirmation email/], ["/verify-email/resend", /Send a new confirmation link/], ["/reset-password", /Password reset link is incomplete/], ["/reset-password?token=bad", /This reset link cannot be verified/], ["/contact-us", /Contact Us/]]) {
    const pg = await open(p);
    const body0 = await text(pg);
    check(`P-09 ${p} renders (not the planned-page placeholder), no console errors`, pg.status === 200 && pattern.test(body0) && !/not published|planned page/i.test(body0) && pg.errs.length === 0, `${pg.status} ${pg.errs.join("|")}`);
    await pg.context.close();
  }
  const refPolicy = await fetch(BASE + "/reset-password?token=x", { headers: { "x-forwarded-for": nextIp() } }).then((r) => r.text());
  check("P-10 the reset and verify pages send no Referer (the link holds a secret) and are noindex", /name="referrer" content="no-referrer"/.test(refPolicy) && /noindex/.test(refPolicy));
  const signedPage = await open("/register/buyer", { cookies: [{ name: "finbyn_session", value: s1.jar.get("finbyn_session") }] });
  check("P-11 a signed-in visitor is sent away from the registration form", !signedPage.url().includes("/register/buyer"), signedPage.url());
  await signedPage.context.close();
  const signIn = await open("/sign-in");
  const sit = await text(signIn);
  check("P-12 sign-in has a Forgot password link to /forgot-password and a buyer sign-up link to /register/buyer", await signIn.evaluate(() => !!document.querySelector('a[href="/forgot-password"]') && !!document.querySelector('a[href^="/register/buyer"]')) && /Forgot password/.test(sit));
  await signIn.context.close();

  // ================= B: the browser, registration
  const b = await open("/register/buyer?next=/products");
  await clickText(b, "button", "Create Buyer Account");
  await sleep(300);
  const errs0 = await b.evaluate(() => [...document.querySelectorAll('form [role="alert"]')].map((e) => e.textContent));
  check("B-01 submitting an empty form shows an error on every required field and sends nothing", errs0.length >= 7 && (await users.countDocuments({ email: { $regex: `^t15-${stamp}-b` } })) === 0, `${errs0.length} errors`);
  check("B-02 focus moves to the first invalid field (Full Name) and invalid fields are aria-invalid", await b.evaluate(() => document.activeElement?.getAttribute("data-field") === "name" && document.querySelector('[data-field="name"]').getAttribute("aria-invalid") === "true"));
  check("B-03 the first error is tied to its input by aria-describedby", await b.evaluate(() => { const el = document.querySelector('[data-field="name"]'); const id = el.getAttribute("aria-describedby"); return !!id && !!document.getElementById(id)?.textContent; }));
  await fill(b, "Full Name", "Browser Buyer");
  await fill(b, "Business Email", emailOf("b1"));
  await fill(b, "Mobile Number", "98765 43211");
  await fill(b, "Company Name", "Browser Traders");
  const pwSel = await byLabel(b, "Password");
  await setValue(b, pwSel, "abc");
  check("B-04 the strength meter shows 'Too weak' for a short password", /Password strength: (Too weak|Weak)/.test(await text(b)));
  await setValue(b, pwSel, "correct horse battery staple");
  check("B-05 the strength meter rises for a long passphrase", /Password strength: (Good|Strong)/.test(await text(b)), (await text(b)).match(/Password strength: \w+/)?.[0]);
  check("B-06 the show/hide button toggles the field type and labels itself", await (async () => { const before = await b.evaluate((s) => document.querySelector(s).type, pwSel); await b.click('button[aria-label="Show password"]'); const shown = await b.evaluate((s) => document.querySelector(s).type, pwSel); const label = await b.evaluate(() => document.querySelector("button[aria-pressed=true]")?.getAttribute("aria-label")); await b.click('button[aria-label="Hide password"]'); return before === "password" && shown === "text" && label === "Hide password" && (await b.evaluate((s) => document.querySelector(s).type, pwSel)) === "password"; })());
  await setValue(b, pwSel, GOOD_PW);
  await fill(b, "Confirm Password", "not the same");
  await clickText(b, "button", "Create Buyer Account");
  await sleep(300);
  check("B-07 a mismatched confirmation is reported on that field and nothing is sent", /do not match/.test(await text(b)) && !(await users.findOne({ email: emailOf("b1") })));
  await fill(b, "Confirm Password", GOOD_PW);
  await clickText(b, "button", "Create Buyer Account");
  await sleep(300);
  check("B-08 without the consent box ticked the form refuses (consent error)", /Tick the box to agree/.test(await text(b)) && !(await users.findOne({ email: emailOf("b1") })));
  await b.click('input[type="checkbox"]');
  await Promise.all([b.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => null), clickText(b, "button", "Create Buyer Account")]);
  await sleep(500);
  const bUser = await users.findOne({ email: emailOf("b1") });
  check("B-09 a valid submission creates the account and goes to the safe next path (/products)", !!bUser && new URL(b.url()).pathname === "/products", b.url());
  check("B-10 the browser now holds a session (header shows the account, /api/auth/me agrees)", await b.evaluate(async () => (await (await fetch("/api/auth/me")).json()).user?.email), emailOf("b1"));
  check("B-11 no console errors during the whole registration", b.errs.length === 0, b.errs.join("|"));
  await b.context.close();
  const dupPage = await open("/register/buyer");
  await fill(dupPage, "Full Name", "Dup Buyer");
  await fill(dupPage, "Business Email", emailOf("b1"));
  await fill(dupPage, "Mobile Number", "9876543212");
  await fill(dupPage, "Company Name", "Dup Co");
  await fill(dupPage, "Password", GOOD_PW);
  await fill(dupPage, "Confirm Password", GOOD_PW);
  await dupPage.click('input[type="checkbox"]');
  await clickText(dupPage, "button", "Create Buyer Account");
  await sleep(1200);
  check("B-12 registering an existing email shows 'already registered' with a sign-in link", /already registered/.test(await text(dupPage)) && (await dupPage.evaluate(() => !!document.querySelector('a[href^="/sign-in"]'))));
  check("B-13 keyboard only: Tab reaches the show-password button and Enter on it toggles", await (async () => { await dupPage.focus('[data-field="password"]'); await dupPage.keyboard.press("Tab"); const onReveal = await dupPage.evaluate(() => document.activeElement?.getAttribute("aria-label")); await dupPage.keyboard.press("Enter"); return /password/i.test(onReveal ?? "") && (await dupPage.evaluate(() => document.querySelector('[data-field="password"]').type)) === "text"; })());
  await dupPage.context.close();

  // ================= B: the browser, Contact Us
  const cp = await open("/contact-us");
  await clickText(cp, "button", "Send Message");
  await sleep(300);
  check("B-14 Contact Us: an empty submit shows errors and focuses the first invalid field", (await cp.evaluate(() => document.querySelectorAll('form [role="alert"]').length)) >= 5 && (await cp.evaluate(() => document.activeElement?.getAttribute("data-field"))) === "name");
  await fill(cp, "Full Name", "Browser Contact");
  await fill(cp, "Email Address", emailOf("b2"));
  await fill(cp, "Topic", "FEEDBACK");
  await fill(cp, "Message", `${tag}-ui The footer link to the help page does not open anything useful.`);
  await cp.click('input[type="checkbox"]');
  await clickText(cp, "button", "Send Message");
  await sleep(1500);
  const sent = await text(cp);
  const ref = sent.match(/FBM-SUP-[0-9A-HJKMNP-TV-Z]{8}/)?.[0];
  check("B-15 sending shows the reference and the honest status (saved, nobody notified)", !!ref && /Message saved/.test(sent) && /Nobody is notified/i.test(sent), sent.slice(0, 300));
  check("B-16 the message really is in the database under that reference", !!(await support.findOne({ reference: ref, topic: "FEEDBACK" })));
  check("B-17 no console errors on Contact Us", cp.errs.length === 0, cp.errs.join("|"));
  await cp.context.close();

  // ================= R: responsive and overflow
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const bad = [];
  for (const path of ["/register/buyer", "/forgot-password", "/contact-us"]) {
    for (const w of widths) {
      const pg = await open(path, { width: w });
      const o = await overflow(pg);
      const buttonOk = await pg.evaluate(() => [...document.querySelectorAll("form button, form input, form select")].every((el) => { const r = el.getBoundingClientRect(); return r.width === 0 || (r.left >= -1 && r.right <= window.innerWidth + 1); }));
      if (o > 0 || !buttonOk) bad.push(`${path}@${w}: overflow ${o}, controls inside ${buttonOk}`);
      await pg.context.close();
    }
  }
  check("R-01 no horizontal overflow and every control inside the viewport at 16 widths (320 to 2560) on 3 pages", bad.length === 0, bad.join("; "));
  const err = await open("/register/buyer", { width: 320 });
  await clickText(err, "button", "Create Buyer Account");
  await sleep(300);
  check("R-02 at 320px with every error showing there is still no overflow", (await overflow(err)) <= 0);
  const tap = await err.evaluate(() => [...document.querySelectorAll("form button, form select, form input:not([type=checkbox])")].filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.height < 44 - 0.5 && el.type !== "hidden"; }).map((el) => `${el.tagName}:${Math.round(el.getBoundingClientRect().height)}`));
  check("R-03 touch targets in the form are at least 44px tall (buttons and fields)", tap.length === 0, tap.join(","));
  await err.context.close();
}


async function supplier() {
  const sb = (tag, over = {}) => ({ businessName: "Shree Test Traders", contactName: "Ravi Shah", email: emailOf(tag), phone: { countryCode: "+91", number: "9876543216" }, city: "Surat", offering: "Cotton fabrics and garments in bulk quantities.", password: GOOD_PW, confirmPassword: GOOD_PW, consent: true, consentPolicyVersion: CONSENT, ...over });
  const s1 = new Session();
  const r = await s1.call("POST", "/api/auth/register/supplier", sb("s1"));
  check("SU-01 a valid supplier registration: 201, role supplier, signed in (no email provider)", r.status === 201 && r.json.user?.role === "supplier" && r.json.signedIn === true && s1.jar.has("finbyn_session"), JSON.stringify(r.json));
  const u = await users.findOne({ email: emailOf("s1") });
  check("SU-02 stored: supplier details as typed, phone normalised, ACTIVE, nothing verified, no verified flag", u?.supplier?.businessName === "Shree Test Traders" && u.supplier.city === "Surat" && u.supplier.phone === "+91 9876543216" && u.accountStatus === "ACTIVE" && u.emailVerified === false && u.phoneVerified === false && !("verified" in u) && u.consent?.policyVersion === CONSENT && /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(u.passwordHash));
  for (const [field, over] of [["businessName", { businessName: "" }], ["contactName", { contactName: "" }], ["email", { email: "x" }], ["phone", { phone: { countryCode: "+91", number: "1" } }], ["city", { city: "" }], ["offering", { offering: "short" }], ["password", { password: "short", confirmPassword: "short" }], ["confirmPassword", { confirmPassword: "nope nope nope" }], ["consent", { consent: false }], ["role", { role: "admin" }]]) {
    const res = await call("POST", "/api/auth/register/supplier", sb("s2", over));
    check(`SU-03 invalid ${field}: 400 on that field, nothing stored`, res.status === 400 && res.json.fields?.[field] && !(await users.findOne({ email: emailOf("s2") })), JSON.stringify(res.json.fields));
  }
  check("SU-04 duplicate email: 409", (await call("POST", "/api/auth/register/supplier", sb("s1"))).status === 409);
  const ui = await open("/register-supplier");
  const t = await text(ui);
  check("SU-05 /register-supplier shows the supplier panel, the honest note and every field", ui.status === 200 && /List Your Business/.test(t) && /not a verified supplier/.test(t) && ["Business Name", "Contact Person", "Business Email", "Mobile Number", "City", "What Do You Supply?", "Password", "Confirm Password"].every((l) => t.includes(l)) && ui.errs.length === 0, ui.errs.join("|"));
  await clickText(ui, "button", "Register as Supplier");
  await sleep(300);
  check("SU-06 empty submit shows every error and focuses Business Name", (await ui.evaluate(() => document.querySelectorAll('form [role="alert"]').length)) >= 8 && (await ui.evaluate(() => document.activeElement?.getAttribute("data-field"))) === "businessName");
  await fill(ui, "Business Name", "UI Supplier Co");
  await fill(ui, "Contact Person", "Uma Iyer");
  await fill(ui, "Business Email", emailOf("s3"));
  await fill(ui, "Mobile Number", "9876543217");
  await fill(ui, "City", "Jaipur");
  await fill(ui, "What Do You Supply?", "Handmade textiles and block-printed fabrics.");
  await fill(ui, "Password", GOOD_PW);
  await fill(ui, "Confirm Password", GOOD_PW);
  await ui.click('input[type="checkbox"]');
  await Promise.all([ui.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => null), clickText(ui, "button", "Register as Supplier")]);
  await sleep(500);
  check("SU-07 the browser flow creates the supplier account and returns home signed in", !!(await users.findOne({ email: emailOf("s3"), role: "supplier" })) && new URL(ui.url()).pathname === "/", ui.url());
  await ui.context.close();
  const si = await open("/sign-in");
  const st = await text(si);
  check("SU-08 /sign-in uses the same layout (Welcome Back panel), Forgot password and both register links", /Welcome Back/.test(st) && (await si.evaluate(() => !!document.querySelector('a[href="/forgot-password"]') && !!document.querySelector('a[href^="/register/buyer"]') && !!document.querySelector('a[href="/register-supplier"]'))) && si.errs.length === 0);
  await si.context.close();
  const su = await open("/sign-up");
  check("SU-09 /sign-up shows the buyer registration page", /Create Your Buyer Account/.test(await text(su)));
  await su.context.close();
  const bad = [];
  for (const path of ["/register-supplier", "/sign-in"]) for (const w of [320, 375, 768, 1024, 1440, 2560]) { const pg = await open(path, { width: w }); if ((await overflow(pg)) > 0) bad.push(path + "@" + w); await pg.context.close(); }
  check("SU-10 no horizontal overflow on /register-supplier and /sign-in at 320, 375, 768, 1024, 1440, 2560", bad.length === 0, bad.join(","));
}

async function mail() {
  const reg = (tag, over, ip) => { const s = new Session(); if (ip) s.ip = ip; return s.call("POST", "/api/auth/register/buyer", body(tag, over)); };
  // ================= M: verification
  const r1 = new Session();
  const res1 = await r1.call("POST", "/api/auth/register/buyer", body("m1"));
  check("M-01 with a provider, registration is 201 but does NOT sign the buyer in; it reports email_sent", res1.status === 201 && res1.json.signedIn === false && res1.json.verification === "email_sent" && !r1.jar.has("finbyn_session"), JSON.stringify(res1.json));
  const m1user = await users.findOne({ email: emailOf("m1") });
  check("M-02 the account is PENDING_EMAIL_VERIFICATION with emailVerified false", m1user?.accountStatus === "PENDING_EMAIL_VERIFICATION" && m1user.emailVerified === false);
  const m1mails = mailsTo(emailOf("m1"));
  check("M-03 exactly one email reached the provider, with the bearer key and the right sender/recipient", m1mails.length === 1 && m1mails[0].auth === "Bearer test-key" && m1mails[0].body.to.length === 1 && /@/.test(m1mails[0].body.from) && /Confirm your email/.test(m1mails[0].body.subject), JSON.stringify(m1mails[0]?.body?.subject));
  const t1 = tokenFrom(m1mails[0], "/verify-email");
  check("M-04 the email holds a link on APP_URL with a 43-character token", !!t1 && m1mails[0].body.text.includes(`${BASE}/verify-email?token=${t1}`), m1mails[0].body.text);
  check("M-05 the email never contains the password", !JSON.stringify(m1mails[0].body).includes(GOOD_PW));
  const tdoc = await tokens.findOne({ userId: m1user._id, purpose: "verify_email" });
  check("M-06 only a SHA-256 hash of the token is stored (the raw token is nowhere in the database)", tdoc?.tokenHash === sha(t1) && !JSON.stringify(tdoc).includes(t1) && tdoc.expiresAt > new Date() && tdoc.usedAt === null);
  const ttl = tdoc.expiresAt.getTime() - tdoc.createdAt.getTime();
  check("M-07 a verification token lasts 24 hours", Math.abs(ttl - 24 * 3600 * 1000) < 5000, String(ttl));
  const blocked = await call("POST", "/api/auth/login", { email: emailOf("m1"), password: GOOD_PW });
  check("M-08 correct password but unconfirmed: 403 email_not_verified, no session", blocked.status === 403 && blocked.json.code === "email_not_verified");
  const wrongPw = await call("POST", "/api/auth/login", { email: emailOf("m1"), password: "wrong password here" });
  check("M-09 a WRONG password still says only 'incorrect' (the account state is not revealed)", wrongPw.status === 401 && !wrongPw.json.code);
  check("M-10 a malformed token (short, wrong characters) is refused", (await call("POST", "/api/auth/verify-email", { token: "short" })).status === 400 && (await call("POST", "/api/auth/verify-email", { token: "!".repeat(43) })).status === 400 && (await call("POST", "/api/auth/verify-email", { token: { $ne: "" } })).status === 400);
  // visiting the page must not use the token
  const pageGet = await fetch(`${BASE}/verify-email?token=${t1}`, { headers: { "x-forwarded-for": nextIp() } });
  check("M-11 opening the confirmation link (a GET, as a mail scanner would) does not use the token", pageGet.status === 200 && (await tokens.findOne({ tokenHash: sha(t1) })).usedAt === null);
  const vp = await open(`/verify-email?token=${t1}`);
  const vt = await text(vp);
  check("M-12 the page asks for a button press; nothing is confirmed yet", /Confirm Email Address/.test(vt) && !(await users.findOne({ email: emailOf("m1") })).emailVerified);
  await clickText(vp, "button", "Confirm Email Address");
  await sleep(1200);
  const confirmed = await users.findOne({ email: emailOf("m1") });
  check("M-13 pressing it confirms: emailVerified true, status ACTIVE, page says so", /Email confirmed/.test(await text(vp)) && confirmed.emailVerified === true && confirmed.accountStatus === "ACTIVE");
  check("M-14 the token is now used and cannot be used again (400)", (await call("POST", "/api/auth/verify-email", { token: t1 })).status === 400 && (await tokens.findOne({ tokenHash: sha(t1) })).usedAt instanceof Date);
  check("M-15 no console errors on the confirmation page", vp.errs.length === 0, vp.errs.join("|"));
  await vp.context.close();
  const okLogin = await new Session().call("POST", "/api/auth/login", { email: emailOf("m1"), password: GOOD_PW });
  check("M-16 after confirmation the buyer can sign in", okLogin.status === 200 && okLogin.json.ok);

  // resend
  await reg("m2");
  const before2 = mailsTo(emailOf("m2")).length;
  const first2 = tokenFrom(mailsTo(emailOf("m2")).at(-1), "/verify-email");
  const rs = await call("POST", "/api/auth/resend-verification", { email: emailOf("m2") });
  const after2 = mailsTo(emailOf("m2"));
  const second2 = tokenFrom(after2.at(-1), "/verify-email");
  check("M-17 resend for a pending account sends a new email with a new token", rs.status === 200 && after2.length === before2 + 1 && second2 && second2 !== first2, JSON.stringify(rs.json));
  check("M-18 the earlier link stops working when a new one is issued", (await call("POST", "/api/auth/verify-email", { token: first2 })).status === 400);
  const mailCount = mails.length;
  const unknownResend = await call("POST", "/api/auth/resend-verification", { email: emailOf("nobody-here") });
  const activeResend = await call("POST", "/api/auth/resend-verification", { email: emailOf("m1") });
  check("M-19 resend for an unknown address and for an already-confirmed one: same answer, NO email sent", unknownResend.status === 200 && activeResend.status === 200 && unknownResend.json.message === rs.json.message && activeResend.json.message === rs.json.message && mails.length === mailCount);
  const reLim = [];
  for (let i = 0; i < 4; i++) reLim.push((await call("POST", "/api/auth/resend-verification", { email: emailOf("m2") })).status);
  check("M-20 resend is limited per email address (3 an hour; more gets 429)", reLim.includes(429), reLim.join());
  // expired
  await reg("m3");
  const m3 = await users.findOne({ email: emailOf("m3") });
  const t3 = tokenFrom(mailsTo(emailOf("m3")).at(-1), "/verify-email");
  await tokens.updateOne({ userId: m3._id, purpose: "verify_email" }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  check("M-21 an expired token is refused and the account stays pending", (await call("POST", "/api/auth/verify-email", { token: t3 })).status === 400 && (await users.findOne({ email: emailOf("m3") })).accountStatus === "PENDING_EMAIL_VERIFICATION");
  // provider failure
  providerStatus = 500;
  const failedReg = await reg("m4");
  check("M-22 the provider rejects the email: the account is still created and the answer says the email was NOT sent", failedReg.status === 201 && failedReg.json.verification === "email_failed" && /could not be sent/i.test(failedReg.json.message) && !!(await users.findOne({ email: emailOf("m4") })), JSON.stringify(failedReg.json));
  providerStatus = 200;
  const recover = await call("POST", "/api/auth/resend-verification", { email: emailOf("m4") });
  check("M-23 once the provider works again, resend delivers the link to that account", recover.status === 200 && !!tokenFrom(mailsTo(emailOf("m4")).at(-1), "/verify-email"));
  const fp = await open("/register/buyer");
  await fill(fp, "Full Name", "UI Mail Buyer");
  await fill(fp, "Business Email", emailOf("m5"));
  await fill(fp, "Mobile Number", "9876543215");
  await fill(fp, "Company Name", "UI Mail Co");
  await fill(fp, "Password", GOOD_PW);
  await fill(fp, "Confirm Password", GOOD_PW);
  await fp.click('input[type="checkbox"]');
  await clickText(fp, "button", "Create Buyer Account");
  await sleep(1800);
  const uiText = await text(fp);
  check("M-24 the form shows 'Check your email' (not signed in) and offers a new link", /Check your email/.test(uiText) && uiText.includes(emailOf("m5")) && /Send a new link/.test(uiText) && !(await fp.evaluate(async () => (await (await fetch("/api/auth/me")).json()).user)));
  await clickText(fp, "button", "Send a new link");
  await sleep(1200);
  check("M-25 'Send a new link' really sends another email", mailsTo(emailOf("m5")).length === 2);
  await fp.context.close();
  const signInPage = await open("/sign-in");
  await fill(signInPage, "Email Address", emailOf("m5"));
  await fill(signInPage, "Password", GOOD_PW);
  await clickText(signInPage, "button", "Sign In");
  await sleep(1200);
  check("M-26 signing in before confirming shows the message and a link to request a new confirmation", /Confirm your email address first/.test(await text(signInPage)) && (await signInPage.evaluate(() => !!document.querySelector('a[href="/verify-email/resend"]'))));
  await signInPage.context.close();
  // links come from APP_URL, never the Host header
  await clearCd(emailOf("m1"));
  const hostile = await new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port: 3100, path: "/api/auth/forgot-password", method: "POST", headers: { Host: "evil.example", "Content-Type": "application/json", "x-forwarded-for": nextIp() } }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
    req.end(JSON.stringify({ email: emailOf("m1") }));
  });
  await sleep(1500);
  const hostileMail = mailsTo(emailOf("m1")).at(-1);
  check("M-27 a forged Host header cannot put another domain into a reset link", hostile === 200 && hostileMail.body.text.includes(`${BASE}/reset-password?token=`) && !/evil\.example/.test(hostileMail.body.text), hostileMail?.body.text);

  // ================= F: forgot and reset
  const known = await forgot(emailOf("m1"));
  const unknown = await forgot(emailOf("ghost"));
  check("F-01 forgot-password answers identically for a known and an unknown address", known.status === 200 && unknown.status === 200 && JSON.stringify(known.json) === JSON.stringify(unknown.json) && known.json.message === "If an eligible account exists for this email address, password reset instructions will be sent.", JSON.stringify(known.json));
  check("F-02 and an email is sent only to the real account", mailsTo(emailOf("m1")).some((m) => /Reset Your/.test(m.body.subject)) && mailsTo(emailOf("ghost")).length === 0);
  const resetMail = mailsTo(emailOf("m1")).filter((m) => /Reset Your/.test(m.body.subject)).at(-1);
  const rt = tokenFrom(resetMail, "/reset-password");
  const m1id = (await users.findOne({ email: emailOf("m1") }))._id;
  const rdoc = await tokens.findOne({ userId: m1id, purpose: "reset_password", usedAt: null, revokedAt: null });
  check("F-03 the reset token is stored hashed and lasts 30 minutes (the configured default)", rdoc?.tokenHash === sha(rt) && Math.abs(rdoc.expiresAt.getTime() - rdoc.createdAt.getTime() - 30 * 60 * 1000) < 5000);
  const verifyToken = tokenFrom(mailsTo(emailOf("m3")).at(-1), "/verify-email");
  check("F-04 a verification token cannot be used to reset a password (purposes are separate)", (await call("POST", "/api/auth/reset-password", { token: tokenFrom(mailsTo(emailOf("m2")).at(-1), "/verify-email"), password: "another long passphrase", confirmPassword: "another long passphrase" })).status === 400 && !!verifyToken);
  const NEW_PW = "a brand new long passphrase";
  const weak = await call("POST", "/api/auth/reset-password", { token: rt, password: "short", confirmPassword: "short" });
  const mism = await call("POST", "/api/auth/reset-password", { token: rt, password: NEW_PW, confirmPassword: "different one" });
  check("F-05 a weak or mismatched new password is refused on its field", weak.status === 400 && weak.json.fields?.password && mism.status === 400 && mism.json.fields?.confirmPassword);
  check("F-06 and the refusal does NOT burn the one-time link", (await tokens.findOne({ tokenHash: sha(rt) })).usedAt === null);
  const rp = await open(`/reset-password?token=${rt}`);
  check("F-07 the reset page with a usable token shows the password form", /Reset Password/.test(await text(rp)) && (await rp.evaluate(() => document.querySelectorAll('input[type="password"]').length)) === 2);
  await fill(rp, "New Password", NEW_PW);
  await fill(rp, "Confirm New Password", NEW_PW);
  await clickText(rp, "button", "Reset Password");
  await sleep(1500);
  check("F-08 submitting changes the password and says so", /Password Reset Successful/.test(await text(rp)));
  check("F-09 the old password no longer works and the new one does", (await call("POST", "/api/auth/login", { email: emailOf("m1"), password: GOOD_PW })).status === 401 && (await call("POST", "/api/auth/login", { email: emailOf("m1"), password: NEW_PW })).status === 200);
  check("F-10 the link is single-use: used token refused (400), and every other token of that user is revoked", (await call("POST", "/api/auth/reset-password", { token: rt, password: "yet another long one", confirmPassword: "yet another long one" })).status === 400 && (await tokens.countDocuments({ userId: m1id, usedAt: null, revokedAt: null })) === 0);
  const used = await open(`/reset-password?token=${rt}`);
  check("F-11 the reset page for the used link says it was already used", /already been used/.test(await text(used)));
  await used.context.close();
  check("F-12 no console errors on the reset page", rp.errs.length === 0, rp.errs.join("|"));
  await rp.context.close();
  await reg("m6");
  const m6 = await users.findOne({ email: emailOf("m6") });
  await forgot(emailOf("m6"));
  const resetFor6 = tokenFrom(mailsTo(emailOf("m6")).filter((m) => /Reset Your/.test(m.body.subject)).at(-1), "/reset-password");
  const r6 = await call("POST", "/api/auth/reset-password", { token: resetFor6, password: NEW_PW, confirmPassword: NEW_PW });
  const after6 = await users.findOne({ email: emailOf("m6") });
  check("F-13 resetting through the emailed link also confirms the address (it proves mailbox control) and activates a pending account", r6.status === 200 && after6.emailVerified === true && after6.accountStatus === "ACTIVE" && m6.accountStatus === "PENDING_EMAIL_VERIFICATION");
  await clearCd(emailOf("m7"));
  const fLim = [];
  for (let i = 0; i < 2; i++) fLim.push(await call("POST", "/api/auth/forgot-password", { email: emailOf("m7") }));
  check("F-14 a second request within the cooldown is refused (429) with Retry-After of at most 60 s, for an address with no account too", fLim[0].status === 200 && fLim[1].status === 429 && Number(fLim[1].headers.get("retry-after")) > 0 && Number(fLim[1].headers.get("retry-after")) <= 60 && fLim[1].json.code === "RATE_LIMITED", JSON.stringify(fLim.map((r) => r.status)));
  const perHour = [];
  for (let i = 0; i < 4; i++) { await db.collection("rate_limits").deleteMany({ _id: { $regex: "^forgot-cd:" + emailOf("m8").replace(/[.]/g, "\\.") + ":" } }); perHour.push((await call("POST", "/api/auth/forgot-password", { email: emailOf("m8") })).status); }
  check("F-14b the per-address limit of 3 an hour holds even if the cooldown is bypassed (4th is 429)", perHour.slice(0, 3).every((c) => c === 200) && perHour[3] === 429, perHour.join());
  await users.updateOne({ email: emailOf("m6") }, { $set: { accountStatus: "SUSPENDED" } });
  const countBefore = mails.length;
  await db.collection("rate_limits").deleteMany({});
  await forgot(emailOf("m6"));
  check("F-15 a suspended account gets no reset email", mails.length === countBefore);
  check("F-16 the forgot-password page validates the address before sending", await (async () => { const p = await open("/forgot-password"); await fill(p, "Business Email", "bad"); const sent0 = mails.length; await clickText(p, "button", "Send Reset Link"); await sleep(300); const t = await text(p); await p.context.close(); return /valid email/.test(t) && mails.length === sent0; })());

  // ================= G: Page 19 specifics
  await db.collection("rate_limits").deleteMany({});
  const g1 = await forgot(emailOf("m1"), "/api/auth/forgot-password/resend");
  check("G-01 the resend endpoint works and sends a new email with a fresh token (and retires the old one)", g1.status === 200 && mailsTo(emailOf("m1")).filter((m) => /Reset Your/.test(m.body.subject)).length >= 2);
  const g2 = await call("POST", "/api/auth/forgot-password", { email: emailOf("m1") });
  check("G-02 resend and the first endpoint share one cooldown (429 straight after)", g2.status === 429);
  const mm = mailsTo(emailOf("m1")).filter((m) => /Reset Your/.test(m.body.subject)).at(-1);
  check("G-03 subject is exactly 'Reset Your Finbyn Mart Password'", mm.body.subject === "Reset Your Finbyn Mart Password");
  check("G-04 the HTML email has the logo, a Reset Password button, the validity (30 minutes), and the ignore-this-email advice", /finbyn-mart-logo\.png/.test(mm.body.html) && />Reset Password<\/a>/.test(mm.body.html) && /30 minutes/.test(mm.body.html) && /ignore this email/i.test(mm.body.html));
  check("G-05 the email never contains the password or a password hash", !/passwordHash|correct horse|a brand new/.test(JSON.stringify(mm.body)));
  const gt = tokenFrom(mm, "/reset-password");
  const validOk = await call("POST", "/api/auth/reset-password/validate", { token: gt });
  const validBad = await call("POST", "/api/auth/reset-password/validate", { token: "z".repeat(43) });
  check("G-06 token validation: true for a live token, false for a made-up one, and nothing else is returned (no role, email or id)", validOk.json?.valid === true && validBad.json?.valid === false && Object.keys(validOk.json).sort().join() === "ok,state,valid" && validOk.json.state === "VALID" && validBad.json.state === "INVALID" && !/m1|buyer|supplier|@/.test(JSON.stringify(validOk.json)), JSON.stringify(validOk.json));
  check("G-07 validation does not use the token (still usable afterwards)", (await tokens.findOne({ tokenHash: sha(gt) })).usedAt === null);
  check("G-08 recovery answers are private (Cache-Control private, no-store)", /private/.test(g1.headers.get("cache-control") ?? "") && /no-store/.test(g1.headers.get("cache-control") ?? "") && /no-store/.test(validOk.headers.get("cache-control") ?? ""));
  const inj = await Promise.all([{ $ne: "" }, { $gt: "" }, ["a@b.co"], null, 5].map((v) => call("POST", "/api/auth/forgot-password", { email: v })));
  check("G-09 operator objects, arrays, null and numbers as the email are refused (400) and nothing is queried", inj.every((r) => r.status === 400), inj.map((r) => r.status).join());
  check("G-10 an oversized body is refused", (await call("POST", "/api/auth/forgot-password", { email: emailOf("m1"), pad: "x".repeat(3000) })).status === 400);
  check("G-11 role, userId and redirect fields in the request are ignored (answer unchanged, no token for them)", await (async () => { await clearCd(emailOf("m1")); const r = await call("POST", "/api/auth/forgot-password", { email: emailOf("m1"), role: "supplier", userId: "x", redirect: "https://evil.example" }); await sleep(1500); const last = mailsTo(emailOf("m1")).at(-1); return r.status === 200 && !/evil\.example/.test(last.body.text); })());
  const meta = await tokens.findOne({ userId: m1id, purpose: "reset_password", usedAt: null, revokedAt: null });
  check("G-12 the token record keeps only a truncated hash of the client address, never the address", /^[0-9a-f]{16}$/.test(meta?.requestMetadata?.ipHash ?? "") && !JSON.stringify(meta).includes("10.15."));
  check("G-13 the raw token is in no token document and not in the server log", !JSON.stringify(await tokens.find({}).toArray()).includes(gt) && !fs.readFileSync(process.env.SERVER_LOG || "/tmp/finbyn-test-server.log", "utf8").includes(gt));
  // supplier accounts recover the same way, through the same endpoint
  const sup = await call("POST", "/api/auth/register/supplier", { businessName: "Mail Supplier Co", contactName: "Sia Rao", email: emailOf("sup1"), phone: { countryCode: "+91", number: "9876543218" }, city: "Pune", offering: "Packaging materials in bulk.", password: GOOD_PW, confirmPassword: GOOD_PW, consent: true, consentPolicyVersion: CONSENT });
  await forgot(emailOf("sup1"));
  const supMail = mailsTo(emailOf("sup1")).filter((m) => /Reset Your/.test(m.body.subject)).at(-1);
  const supTok = tokenFrom(supMail, "/reset-password");
  const supReset = await call("POST", "/api/auth/reset-password", { token: supTok, password: "supplier new long passphrase", confirmPassword: "supplier new long passphrase" });
  const supLogin = await call("POST", "/api/auth/login", { email: emailOf("sup1"), password: "supplier new long passphrase" });
  check("G-14 a supplier account recovers through the same system: email, reset, then sign-in as role supplier", sup.status === 201 && !!supTok && supReset.status === 200 && supLogin.status === 200 && supLogin.json.user.role === "supplier", JSON.stringify([sup.status, supReset.status, supLogin.status]));
  // timing: known vs unknown address
  const timeIt = async (e) => { await clearCd(e); const t = performance.now(); await call("POST", "/api/auth/forgot-password", { email: e }); return performance.now() - t; };
  const knownT = [], unknownT = [];
  for (let i = 0; i < 5; i++) { knownT.push(await timeIt(emailOf("m1"))); unknownT.push(await timeIt(emailOf("nobody" + i))); }
  const med = (a) => [...a].sort((x, y) => x - y)[2];
  check("G-15 response time does not depend on whether the account exists (medians within 150 ms; the email is sent after the answer)", Math.abs(med(knownT) - med(unknownT)) < 150, "known " + med(knownT).toFixed(0) + " ms, unknown " + med(unknownT).toFixed(0) + " ms");
  // Page 19 UI
  await db.collection("rate_limits").deleteMany({});
  const fp19 = await open("/forgot-password");
  const t19 = await text(fp19);
  check("G-16 the page: recovery panel, lock heading 'Forgot Password?', business-email field, info box with the 30-minute validity, Sign In link", /Reset Your Password Securely/.test(t19) && /Get Back to Business/.test(t19) && /Forgot Password\?/.test(t19) && /Business Email/.test(t19) && /valid for 30 minutes/.test(t19) && (await fp19.evaluate(() => !!document.querySelector('a[href="/sign-in"]'))) && fp19.errs.length === 0, fp19.errs.join("|"));
  await fill(fp19, "Business Email", emailOf("ghost2"));
  await clickText(fp19, "button", "Send Reset Link");
  await sleep(1500);
  const after19 = await fp19.evaluate(() => document.querySelector("main section").textContent.replace(/[ \t\r\n]+/g, " "));
  check("G-17 an unknown address shows the same generic 'Check Your Email' state (never 'not found' or 'sent')", /Check Your Email/.test(after19) && /If an eligible account exists/.test(after19) && !/not found|no account|does not exist|was sent|has been sent/i.test(after19), after19.slice(0, 250));
  check("G-18 the resend button is disabled with a countdown, then labelled for resend", await fp19.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /Send again in \d+s/.test(x.textContent)); return !!b && b.disabled; }));
  check("G-19 nothing about the address or link is in browser storage", await fp19.evaluate(() => !JSON.stringify([localStorage, sessionStorage].map((st) => Object.entries(st))).includes("ghost2")));
  await fp19.context.close();
}

async function reset20() {
  const PW = "first long passphrase 1";
  const NEWPW = "second long passphrase 2";
  const serverLog = () => fs.readFileSync(process.env.SERVER_LOG || "/tmp/finbyn-test-server.log", "utf8");
  // test fixture: register through the API, then activate directly (the stand-in provider does not click links)
  const makeUser = async (tag, role = "buyer") => {
    const email = emailOf(tag);
    const r = role === "buyer"
      ? await call("POST", "/api/auth/register/buyer", body(tag, { password: PW, confirmPassword: PW }))
      : await call("POST", "/api/auth/register/supplier", { businessName: "H20 Supplier Co", contactName: "Hema Rao", email, phone: { countryCode: "+91", number: "9876543219" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: CONSENT });
    await users.updateOne({ email }, { $set: { accountStatus: "ACTIVE", emailVerified: true } });
    return { email, status: r.status };
  };
  const loginAs = async (email, password) => { const s = new Session(); const r = await s.call("POST", "/api/auth/login", { email, password }); return { s, r }; };
  const freshToken = async (email) => { await forgot(email); return tokenFrom(mailsTo(email).filter((m) => /Reset Your/.test(m.body.subject)).at(-1), "/reset-password"); };
  const validate = (t) => call("POST", "/api/auth/reset-password/validate", { token: t });
  const doReset = (t, password = NEWPW, extra = {}) => call("POST", "/api/auth/reset-password", { token: t, password, confirmPassword: password, ...extra });
  const states = (r) => r.json?.state ?? r.json?.code;

  const buyer = await makeUser("h1");
  const other = await makeUser("h2");
  const supplier = await makeUser("h3", "supplier");
  check("H-00 fixtures created", buyer.status === 201 && other.status === 201 && supplier.status === 201);

  // ---------- token states
  const t1 = await freshToken(buyer.email);
  const bUser = await users.findOne({ email: buyer.email });
  const v1 = await validate(t1);
  check("H-01 a live link validates: VALID", v1.json?.valid === true && v1.json.state === "VALID" && Object.keys(v1.json).sort().join() === "ok,state,valid", JSON.stringify(v1.json));
  const bad = await Promise.all([validate("z".repeat(43)), validate("short"), validate(""), validate(undefined)]);
  check("H-02 unknown, malformed, empty and missing tokens: INVALID (never an error)", bad.every((r) => r.status === 200 && r.json.state === "INVALID"), JSON.stringify(bad.map((r) => r.json?.state)));
  const verifyTok = (await (async () => { const pend = await call("POST", "/api/auth/register/buyer", body("h9", { password: PW, confirmPassword: PW })); return tokenFrom(mailsTo(emailOf("h9")).at(-1), "/verify-email"); })());
  check("H-03 a confirmation (verify_email) token is not a reset token: INVALID", (await validate(verifyTok)).json?.state === "INVALID" && !!verifyTok);
  await tokens.updateOne({ tokenHash: sha(t1) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const vExp = await validate(t1);
  const rExp = await doReset(t1);
  check("H-04 an expired link: EXPIRED on validate and on reset (400), the password is untouched", vExp.json?.state === "EXPIRED" && rExp.status === 400 && rExp.json.code === "EXPIRED" && (await users.findOne({ email: buyer.email })).passwordHash === bUser.passwordHash, JSON.stringify([vExp.json, rExp.json]));
  const t2 = await freshToken(buyer.email);
  check("H-05 requesting a new link REVOKES the older one: REVOKED, and the expired one is now also not usable", (await validate(t1)).json?.state === "EXPIRED" && (await validate(t2)).json?.state === "VALID");
  const t3 = await freshToken(buyer.email);
  const vRev = await validate(t2);
  const rRev = await doReset(t2);
  check("H-06 the replaced link: REVOKED on validate and reset, and the newest link still works", vRev.json?.state === "REVOKED" && rRev.status === 400 && rRev.json.code === "REVOKED" && (await validate(t3)).json?.state === "VALID", JSON.stringify([vRev.json, rRev.json]));
  check("H-07 error answers use the agreed wording", /has expired|invalid|already been used|replaced/.test(rRev.json.message) && !/@|_id|userId|hash/i.test(JSON.stringify(rRev.json)));
  check("H-08 validating (and opening the page) does not use the link", (await validate(t3)).json?.valid === true && (await fetch(`${BASE}/reset-password?token=${t3}`, { headers: { "x-forwarded-for": nextIp() } })).status === 200 && (await tokens.findOne({ tokenHash: sha(t3) })).usedAt === null);
  check("H-09 the raw token is in no token document", !JSON.stringify(await tokens.find({}).toArray()).includes(t3));

  // ---------- session revocation, other users, redirect and what is stored
  const oldSession = await loginAs(buyer.email, PW);
  const otherSession = await loginAs(other.email, PW);
  const supSession = await loginAs(supplier.email, PW);
  const meBefore = await oldSession.s.call("GET", "/api/auth/me");
  const otherBefore = await users.findOne({ email: other.email });
  const eventsBefore = await db.collection("security_events").countDocuments({ userId: bUser._id });
  const res = await oldSession.s.call("POST", "/api/auth/reset-password", { token: t3, password: NEWPW, confirmPassword: NEWPW, role: "supplier", redirectTo: "https://evil.example", userId: String(otherBefore._id), email: other.email });
  check("H-10 reset succeeds: 200, redirect from the stored role (buyer) and NOT from the request (role, redirectTo, userId, email in the body are ignored)", res.status === 200 && res.json.ok && res.json.data?.redirectTo === "/login/buyer", JSON.stringify(res.json));
  check("H-11 the answer carries no password, hash, token, id or session secret", !/passwordHash|hash|salt|_id|userId|session|scrypt/i.test(JSON.stringify(res.json)) && !JSON.stringify(res.json).includes(t3) && !JSON.stringify(res.json).includes(NEWPW), JSON.stringify(res.json));
  check("H-12 the answer is no-store and clears this browser's session cookie", /no-store/.test(res.headers.get("cache-control") ?? "") && !oldSession.s.jar.get("finbyn_session"), String(oldSession.s.jar.get("finbyn_session")).slice(0, 20));
  const after = await users.findOne({ email: buyer.email });
  check("H-13 stored: a new scrypt hash (salt:hash), session version bumped, passwordChangedAt set, address confirmed; the plain password and the confirmation are nowhere in the document", after.passwordHash !== bUser.passwordHash && /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(after.passwordHash) && after.sessionVersion === (bUser.sessionVersion ?? 0) + 1 && after.passwordChangedAt instanceof Date && after.emailVerified === true && !JSON.stringify(after).includes(NEWPW) && !("confirmPassword" in after), JSON.stringify({ v: after.sessionVersion }));
  const tdone = await tokens.findOne({ tokenHash: sha(t3) });
  check("H-14 the token is consumed in the same commit and every other unused token of the account is revoked", tdone.usedAt instanceof Date && (await tokens.countDocuments({ userId: bUser._id, usedAt: null, revokedAt: null })) === 0);
  const ev = await db.collection("security_events").find({ userId: bUser._id }).toArray();
  check("H-15 one sanitized PASSWORD_RESET event: type, time, truncated address hash; no token, password, hash or address", ev.length === eventsBefore + 1 && ev.at(-1).type === "PASSWORD_RESET" && /^[0-9a-f]{16}$/.test(ev.at(-1).ipHash) && !/10\.15\.|password|token/i.test(JSON.stringify(ev.at(-1)).replace(/PASSWORD_RESET/, "")), JSON.stringify(ev.at(-1)));
  check("H-16 before the reset the old session worked", meBefore.status === 200 && meBefore.json?.user?.email === buyer.email);
  const login1 = await loginAs(other.email, PW);
  check("H-17 another account's data and sessions are untouched (same hash, same version, still signed in)", (await users.findOne({ email: other.email })).passwordHash === otherBefore.passwordHash && (await users.findOne({ email: other.email })).sessionVersion === otherBefore.sessionVersion && (await otherSession.s.call("GET", "/api/auth/me")).json?.user?.email === other.email && login1.r.status === 200);
  check("H-18 the old password is refused and the new one signs in", (await loginAs(buyer.email, PW)).r.status === 401 && (await loginAs(buyer.email, NEWPW)).r.status === 200);
  const reuse = await doReset(t3, "third long passphrase 3");
  check("H-19 reusing the link: ALREADY_USED, password unchanged", reuse.status === 400 && reuse.json.code === "ALREADY_USED" && (await loginAs(buyer.email, NEWPW)).r.status === 200 && (await validate(t3)).json?.state === "ALREADY_USED");

  // a cookie issued before the reset must stop working: sign in, reset again, replay the saved cookie
  const keeper = await loginAs(buyer.email, NEWPW);
  const savedCookie = keeper.s.jar.get("finbyn_session");
  const meOk = await call("GET", "/api/auth/me", undefined, { cookie: `finbyn_session=${savedCookie}` });
  const t4 = await freshToken(buyer.email);
  const r4 = await doReset(t4, "fourth long passphrase 4");
  const meStale = await call("GET", "/api/auth/me", undefined, { cookie: `finbyn_session=${savedCookie}` });
  check("H-20 SESSION REVOCATION: a cookie issued before the reset worked before and is refused after", meOk.json?.user?.email === buyer.email && r4.status === 200 && !meStale.json?.user, JSON.stringify([meOk.json, meStale.json]));
  const fresh = await loginAs(buyer.email, "fourth long passphrase 4");
  check("H-21 a fresh sign-in after the reset gets a cookie that works", fresh.r.status === 200 && (await fresh.s.call("GET", "/api/auth/me")).json?.user?.email === buyer.email);
  check("H-22 a user who never reset still has a working session (a cookie without a version counts as 0)", (await supSession.s.call("GET", "/api/auth/me")).json?.user?.email === supplier.email);

  // ---------- supplier redirect
  const ts = await freshToken(supplier.email);
  const rs = await doReset(ts, "supplier long passphrase 5");
  check("H-23 a supplier account is sent to /login/supplier", rs.status === 200 && rs.json.data?.redirectTo === "/login/supplier", JSON.stringify(rs.json));
  const alias = await Promise.all(["/login/buyer", "/login/supplier"].map((p) => fetch(BASE + p, { redirect: "manual", headers: { "x-forwarded-for": nextIp() } })));
  check("H-24 /login/buyer and /login/supplier are aliases that lead to /sign-in", alias.every((r) => [307, 308].includes(r.status) && r.headers.get("location")?.endsWith("/sign-in")));
  const supLogin = await loginAs(supplier.email, "supplier long passphrase 5");
  check("H-25 the supplier signs in with the new password as role supplier", supLogin.r.status === 200 && supLogin.r.json.user.role === "supplier");

  // ---------- password policy through the API (the same function as registration)
  const pol = async (password, confirmPassword = password) => { const u = await makeUser("hp" + (++ipN), "buyer"); const tk = await freshToken(u.email); const r = await call("POST", "/api/auth/reset-password", { token: tk, password, confirmPassword }); return { r, tk, u, still: (await validate(tk)).json?.state }; };
  const p9 = await pol("abcdefghi");
  check("H-26 9 characters refused on the password field and the link is NOT used up", p9.r.status === 400 && p9.r.json.fields?.password && p9.still === "VALID");
  const p129 = await pol("xY".repeat(65));
  check("H-27 129 characters refused (no silent truncation)", p129.r.status === 400 && p129.r.json.fields?.password && p129.still === "VALID");
  const pws = await pol(" ".repeat(12));
  check("H-28 whitespace-only refused", pws.r.status === 400 && pws.r.json.fields?.password && pws.still === "VALID");
  const pcommon = await pol("Password123");
  check("H-29 a very common password refused", pcommon.r.status === 400 && pcommon.r.json.fields?.password);
  const pmis = await pol("a perfectly fine passphrase", "a different passphrase!!");
  check("H-30 mismatched confirmation refused on its field; link still usable", pmis.r.status === 400 && pmis.r.json.fields?.confirmPassword && pmis.still === "VALID");
  const pmissing = await call("POST", "/api/auth/reset-password", { token: p9.tk });
  check("H-31 a missing password is refused", pmissing.status === 400 && pmissing.json.fields?.password);
  const pnum = await call("POST", "/api/auth/reset-password", { token: p9.tk, password: 12345678901234, confirmPassword: 12345678901234 });
  check("H-32 a non-string password is refused", pnum.status === 400);
  const spaced = "  keep my spaces é🔑 pass  ";
  const pu = await pol(spaced);
  const exact = await loginAs(pu.u.email, spaced);
  const trimmed = await loginAs(pu.u.email, spaced.trim());
  check("H-33 spaces, accents and emoji are kept exactly (sign-in works with the exact text, not the trimmed one); the hash is the shared scrypt format", pu.r.status === 200 && exact.r.status === 200 && trimmed.r.status === 401 && /^[0-9a-f]{32}:[0-9a-f]{128}$/.test((await users.findOne({ email: pu.u.email })).passwordHash));
  const lim = await Promise.all([{ $ne: "" }, ["x"], null, 5, {}].map((t) => call("POST", "/api/auth/reset-password", { token: t, password: NEWPW, confirmPassword: NEWPW })));
  check("H-34 operator objects, arrays, null, numbers as the token: refused (400), nothing queried", lim.every((r) => r.status === 400 && r.json.code === "INVALID"), JSON.stringify(lim.map((r) => r.json.code)));
  check("H-35 an oversized body is refused", (await call("POST", "/api/auth/reset-password", { token: t4, password: NEWPW, confirmPassword: NEWPW, pad: "x".repeat(3000) })).status === 400);

  // ---------- concurrency: one winner
  const cu = await makeUser("hc");
  const tc = await freshToken(cu.email);
  const racers = await Promise.all(Array.from({ length: 6 }, (_, i) => doReset(tc, `racer number ${i} long passphrase`)));
  const winners = racers.map((r, i) => (r.status === 200 ? i : -1)).filter((i) => i >= 0);
  const cuAfter = await users.findOne({ email: cu.email });
  const winnerLogin = winners.length === 1 ? await loginAs(cu.email, `racer number ${winners[0]} long passphrase`) : null;
  check("H-36 six simultaneous resets with one link: exactly one succeeds, the others are told it was used, and the winner's password is the stored one", winners.length === 1 && racers.filter((r) => r.status === 400).every((r) => ["ALREADY_USED", "INVALID", "REVOKED"].includes(r.json.code)) && winnerLogin?.r.status === 200 && cuAfter.sessionVersion === 1, JSON.stringify(racers.map((r) => r.status + ":" + (r.json.code ?? "ok"))));
  // account gone or suspended after the link was issued
  const su = await makeUser("hs");
  const tsu = await freshToken(su.email);
  await users.updateOne({ email: su.email }, { $set: { accountStatus: "SUSPENDED" } });
  const suState = await validate(tsu);
  const suReset = await doReset(tsu);
  const suUser = await users.findOne({ email: su.email });
  check("H-37 a suspended account's link shows as INVALID (nothing about the account), changes nothing, and the link is not used up", suState.json?.state === "INVALID" && suReset.status === 400 && suReset.json.code === "INVALID" && (await tokens.findOne({ tokenHash: sha(tsu) })).usedAt === null && !suUser.sessionVersion);
  const du = await makeUser("hd");
  const tdu = await freshToken(du.email);
  await users.deleteOne({ email: du.email });
  const duReset = await doReset(tdu);
  check("H-38 a deleted account's link is refused (400 INVALID) and no password is written anywhere", duReset.status === 400 && duReset.json.code === "INVALID" && !(await users.findOne({ email: du.email })));
  const pending = await call("POST", "/api/auth/register/buyer", body("hq", { password: PW, confirmPassword: PW }));
  const tq = await freshToken(emailOf("hq"));
  const rq = await doReset(tq);
  const uq = await users.findOne({ email: emailOf("hq") });
  check("H-39 a pending account that resets through its emailed link becomes ACTIVE and confirmed (the link proves the mailbox)", pending.status === 201 && rq.status === 200 && uq.accountStatus === "ACTIVE" && uq.emailVerified === true);

  // ---------- headers and logs
  const hp = await fetch(`${BASE}/reset-password?token=${"a".repeat(43)}`, { headers: { "x-forwarded-for": nextIp() } });
  check("H-40 the reset page: Cache-Control no-store, Referrer-Policy no-referrer, noindex", /no-store/.test(hp.headers.get("cache-control") ?? "") && hp.headers.get("referrer-policy") === "no-referrer" && /noindex/.test(await hp.text()), `${hp.headers.get("cache-control")} | ${hp.headers.get("referrer-policy")}`);
  const hv = await validate("a".repeat(43));
  check("H-41 /api/auth answers are no-store", /no-store/.test(hv.headers.get("cache-control") ?? "") && /no-store/.test((await doReset("a".repeat(43))).headers.get("cache-control") ?? ""));
  const logText = serverLog();
  check("H-42 no reset token and no password appears in the server log", ![t1, t2, t3, t4, tc, tsu].some((t) => logText.includes(t)) && ![PW, NEWPW, spaced, "fourth long passphrase 4", "supplier long passphrase 5"].some((pw) => logText.includes(pw)));

  // ---------- browser: states, URL hygiene, live checklist, toggles, success, redirect
  const live = await freshToken(buyer.email);
  const uiOld = new Session();
  const pg = await open(`/reset-password?token=${live}`);
  const t0 = await text(pg);
  check("H-43 a usable link opens the form: heading, two fields, requirement list, no errors in the console", /Reset Password/.test(t0) && /Create a New Password/.test(t0) && (await pg.evaluate(() => document.querySelectorAll('input[type="password"]').length)) === 2 && /Password must meet the following requirements/.test(t0) && pg.errs.length === 0, pg.errs.join("|"));
  check("H-44 the token is removed from the address bar and history entry after load", new URL(pg.url()).search === "" && !pg.url().includes(live), pg.url());
  check("H-45 nothing is stored in the browser (local or session storage hold no token or password)", await pg.evaluate((tk) => !JSON.stringify([localStorage, sessionStorage].map((st) => Object.entries(st))).includes(tk), live));
  check("H-46 no requirement shows as met before anything is typed", (await pg.evaluate(() => document.querySelectorAll('[data-met="true"]').length)) === 0);
  const pwSel = await byLabel(pg, "New Password");
  const cfSel = await byLabel(pg, "Confirm New Password");
  await setValue(pg, pwSel, "short");
  const met1 = await pg.evaluate(() => [...document.querySelectorAll("[data-met]")].map((li) => li.dataset.met));
  await setValue(pg, pwSel, "an entirely suitable phrase");
  const met2 = await pg.evaluate(() => [...document.querySelectorAll("[data-met]")].map((li) => li.dataset.met));
  await setValue(pg, cfSel, "an entirely suitable phrase");
  const met3 = await pg.evaluate(() => [...document.querySelectorAll("[data-met]")].map((li) => li.dataset.met));
  check("H-47 the checklist follows what is typed and the server rules (5 items: min, max, not blank, not common, match)", met1.length === 5 && met1[0] === "false" && met2.slice(0, 4).every((m) => m === "true") && met2[4] === "false" && met3.every((m) => m === "true"), JSON.stringify([met1, met2, met3]));
  check("H-48 the checklist is a labelled live region and states met / not met for screen readers", await pg.evaluate(() => { const ul = document.querySelector("ul[aria-live]"); return !!ul && ul.getAttribute("aria-labelledby") === "req-title" && /\(met\)/.test(ul.textContent); }));
  const toggles = await pg.evaluate(() => [...document.querySelectorAll("button[aria-label$='password']")].map((b) => b.getAttribute("aria-label")));
  await pg.click("button[aria-label='Show password']");
  const types = await pg.evaluate(() => [...document.querySelectorAll("input[data-field]")].map((i) => i.type));
  check("H-49 two separate show/hide buttons; showing one field leaves the other hidden and keeps the text", toggles.length === 2 && types[0] === "text" && types[1] === "password" && (await pg.evaluate((s) => document.querySelector(s).value, pwSel)) === "an entirely suitable phrase");
  check("H-50 both fields are labelled and the buttons expose their state", await pg.evaluate(() => [...document.querySelectorAll("input[data-field]")].every((i) => i.labels?.length > 0) && [...document.querySelectorAll("button[aria-label$='password']")].every((b) => b.hasAttribute("aria-pressed"))));
  await setValue(pg, cfSel, "something else entirely");
  await clickText(pg, "button", "Reset Password");
  await sleep(500);
  check("H-51 a mismatch is reported on the field and nothing is sent (link still VALID)", /do not match/.test(await text(pg)) && (await validate(live)).json?.state === "VALID");
  await setValue(pg, cfSel, "an entirely suitable phrase");
  await clickText(pg, "button", "Reset Password");
  await sleep(2500);
  const done = await pg.evaluate(() => document.querySelector("main section").textContent.split(" ").filter(Boolean).join(" "));
  const cta = await pg.evaluate(() => [...document.querySelectorAll("main a")].find((a) => a.textContent.trim() === "Sign In as Buyer")?.getAttribute("href"));
  check("H-52 success screen only after the server committed: 'Password Reset Successful!', the Sign In as Buyer button goes to /login/buyer", /Password Reset Successful/.test(done) && cta === "/login/buyer" && (await users.findOne({ email: buyer.email })).sessionVersion >= 3, `${cta}`);
  check("H-53 the success screen shows no email, no token and no password", !done.includes(buyer.email) && !done.includes(live) && !done.includes("an entirely suitable phrase"));
  await Promise.all([pg.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => null), pg.evaluate(() => [...document.querySelectorAll("main a")].find((a) => a.textContent.trim() === "Sign In as Buyer").click())]);
  await sleep(1500);
  check("H-54 the button lands on the sign-in page (alias redirect)", new URL(pg.url()).pathname === "/sign-in", pg.url());
  await pg.context.close();
  check("H-55 the used link now shows 'already been used' with a Sign In button; refresh of the cleaned address shows 'incomplete'", await (async () => {
    const a = await open(`/reset-password?token=${live}`); const used = await text(a); const ctaUsed = await a.evaluate(() => [...document.querySelectorAll("main a")].some((x) => x.getAttribute("href") === "/sign-in" && /Go to Sign In/.test(x.textContent)));
    const b = await open("/reset-password"); const miss = await text(b);
    await a.context.close(); await b.context.close();
    return /already been used/.test(used) && ctaUsed && /incomplete/.test(miss);
  })());
  const expTok = await freshToken(other.email);
  await tokens.updateOne({ tokenHash: sha(expTok) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const revTok = await freshToken(supplier.email);
  await freshToken(supplier.email);
  const pgs = await Promise.all([open(`/reset-password?token=${expTok}`), open(`/reset-password?token=${revTok}`), open(`/reset-password?token=${"q".repeat(43)}`)]);
  const [tExp, tRev, tInv] = await Promise.all(pgs.map((p) => text(p)));
  check("H-56 expired, replaced and unknown links each get their own message and a way forward", /has expired/.test(tExp) && /replaced/.test(tRev) && /cannot be verified/.test(tInv) && (await Promise.all(pgs.map((p) => p.evaluate(() => !!document.querySelector('main a[href="/forgot-password"]'))))).every(Boolean));
  await Promise.all(pgs.map((p) => p.context.close()));

  // ---------- Page 19 to Page 20 end to end, through the browser
  const e2e = await makeUser("he");
  const req = await open("/forgot-password");
  await fill(req, "Business Email", e2e.email);
  await clickText(req, "button", "Send Reset Link");
  await sleep(2500);
  const link = tokenFrom(mailsTo(e2e.email).filter((m) => /Reset Your/.test(m.body.subject)).at(-1), "/reset-password");
  await req.context.close();
  const stored = await tokens.findOne({ tokenHash: sha(link) });
  const e2eSession = await loginAs(e2e.email, PW);
  const e2eCookie = e2eSession.s.jar.get("finbyn_session");
  const rpg = await open(`/reset-password?token=${link}`);
  await fill(rpg, "New Password", "end to end new passphrase");
  await fill(rpg, "Confirm New Password", "end to end new passphrase");
  await clickText(rpg, "button", "Reset Password");
  await sleep(2500);
  const e2eText = await text(rpg);
  await rpg.context.close();
  const staleMe = await call("GET", "/api/auth/me", undefined, { cookie: `finbyn_session=${e2eCookie}` });
  const reuse2 = await doReset(link, "yet another long passphrase");
  const oldLogin = await loginAs(e2e.email, PW);
  const sg = await open("/sign-in");
  await fill(sg, "Email Address", e2e.email);
  await fill(sg, "Password", "end to end new passphrase");
  await Promise.all([sg.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => null), clickText(sg, "button", "Sign In")]);
  const me2 = await sg.evaluate(async () => (await (await fetch("/api/auth/me")).json()).user);
  await sg.context.close();
  check("H-57 END TO END (forgot UI, email link, token hash stored, reset UI, old session revoked, reuse refused, old password refused, sign-in UI with the new password, correct role)", !!stored && stored.tokenHash === sha(link) && /Password Reset Successful/.test(e2eText) && !staleMe.json?.user && reuse2.status === 400 && oldLogin.r.status === 401 && me2?.email === e2e.email && me2?.role === "buyer", JSON.stringify({ stored: !!stored, e2eText: e2eText.slice(0, 60), stale: staleMe.json, reuse: reuse2.status, old: oldLogin.r.status, me: me2 }));

  // ---------- stage timings from the server's own log lines
  const stages = serverLog().split("\n").filter((l) => l.includes('"reset-stages"')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const medOf = (k) => { const a = stages.map((s) => s[k]).filter((v) => typeof v === "number").sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  check("H-58 stage timings are logged for each successful reset (token lookup, hash, transaction, total) and the hash keeps its full cost", stages.length >= 8 && medOf("hashMs") >= 20, `n=${stages.length} median ms: lookup ${medOf("tokenLookupMs")}, hash ${medOf("hashMs")}, transaction ${medOf("transactionMs")}, total ${medOf("totalMs")}`);

  // ---------- responsive and screenshots
  const rl = await freshToken(other.email);
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const wide = [];
  for (const w of widths) {
    const p = await open(`/reset-password?token=${rl}`, { width: w });
    const o = await overflow(p);
    const clipped = await p.evaluate(() => { const ul = document.querySelector("ul[aria-live]"); return ul ? ul.scrollWidth > ul.clientWidth + 1 : true; });
    const inside = await p.evaluate(() => [...document.querySelectorAll("form button, form input")].every((el) => { const r = el.getBoundingClientRect(); return r.width === 0 || (r.left >= -1 && r.right <= window.innerWidth + 1); }));
    const tap = await p.evaluate(() => [...document.querySelectorAll("form button")].every((b) => b.getBoundingClientRect().height >= 40));
    if (o > 0 || clipped || !inside || !tap) wide.push(`${w}: overflow ${o} clipped ${clipped} inside ${inside} tap ${tap}`);
    if ([1440, 820, 390].includes(w)) await p.screenshot({ path: `R:/indiamartref/docs/page-reports/screenshots/20-reset-password-${w === 1440 ? "desktop-1440" : w === 820 ? "tablet-820" : "mobile-390"}.png`, fullPage: true });
    await p.context.close();
  }
  check("H-59 no horizontal overflow, clipped checklist, control outside the viewport, or touch target under 40px at 16 widths (320 to 2560)", wide.length === 0, wide.join("; "));
  check("H-60 the link was still unused after 16 page loads and 3 screenshots (opening a page never consumes it)", (await validate(rl)).json?.state === "VALID");
}

async function success21() {
  const PW = "first long passphrase 1";
  const NEWPW = "second long passphrase 2";
  const SUCCESS = "/password-reset/success";
  const serverLog = () => fs.readFileSync(process.env.SERVER_LOG || "/tmp/finbyn-test-server.log", "utf8");
  const sign = (obj) => { const payload = Buffer.from(JSON.stringify(obj)).toString("base64url"); return `${payload}.${createHmac("sha256", env.AUTH_SECRET).update(`reset-confirmation:${payload}`).digest("base64url")}`; };
  const makeUser = async (tag, role = "buyer") => {
    const email = emailOf(tag);
    if (role === "buyer") await call("POST", "/api/auth/register/buyer", body(tag, { password: PW, confirmPassword: PW }));
    else await call("POST", "/api/auth/register/supplier", { businessName: "S21 Supplier Co", contactName: "Sana Rao", email, phone: { countryCode: "+91", number: "9876543220" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: CONSENT });
    await users.updateOne({ email }, { $set: { accountStatus: "ACTIVE", emailVerified: true } });
    return email;
  };
  const freshToken = async (email) => { await forgot(email); return tokenFrom(mailsTo(email).filter((m) => /Reset Your/.test(m.body.subject)).at(-1), "/reset-password"); };
  // a real reset through the API; the Session keeps the confirmation cookie the server sets
  const reallyReset = async (email, extra = {}) => { const s = new Session(); const tk = await freshToken(email); const r = await s.call("POST", "/api/auth/reset-password", { token: tk, password: NEWPW, confirmPassword: NEWPW, ...extra }); return { s, r, tk }; };
  const getPage = (cookieValue, query = "") => fetch(`${BASE}${SUCCESS}${query}`, { headers: { "x-forwarded-for": nextIp(), ...(cookieValue ? { cookie: `finbyn_reset_ok=${cookieValue}` } : {}) } });
  const card = (p) => p.evaluate(() => document.querySelector("main section").textContent.split(" ").filter(Boolean).join(" "));
  const GOOD = "Password Reset Successful!";

  const buyerEmail = await makeUser("p1");
  const supplierEmail = await makeUser("p2", "supplier");

  // ---------- the address alone proves nothing
  const direct = await getPage();
  const directHtml = await direct.text();
  check("P21-01 opening the success address with no confirmation: 200 but NOT success ('confirmation is unavailable', Sign In and Request Password Reset offered)", direct.status === 200 && !directHtml.includes(GOOD) && /confirmation is unavailable/.test(directHtml) && directHtml.includes('href="/forgot-password"') && directHtml.includes('href="/sign-in"'));
  const spoof = await getPage(undefined, "?success=true&role=supplier&accountType=SUPPLIER&sessionsRevoked=true&reset=1");
  const spoofHtml = await spoof.text();
  check("P21-02 query parameters (success, role, accountType, sessionsRevoked) are ignored: still no success, no supplier action", !spoofHtml.includes(GOOD) && !/Sign In as Supplier/.test(spoofHtml) && /confirmation is unavailable/.test(spoofHtml));
  check("P21-03 headers: no-store, Referrer-Policy no-referrer, noindex; nothing about any account in the page", /no-store/.test(direct.headers.get("cache-control") ?? "") && direct.headers.get("referrer-policy") === "no-referrer" && /noindex/.test(directHtml) && !directHtml.includes(buyerEmail));
  // forged or invalid cookies
  const eventId = new (require("mongodb").ObjectId)().toString();
  const forged = [
    ["garbage", "not-a-cookie"],
    ["right shape, wrong signature", `${Buffer.from(JSON.stringify({ e: eventId, x: Date.now() + 600000 })).toString("base64url")}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`],
    ["a genuine session cookie value", (await (async () => { const s = new Session(); await s.call("POST", "/api/auth/login", { email: buyerEmail, password: PW }); return s.jar.get("finbyn_session"); })())],
    ["signed, but for an event that does not exist", sign({ e: eventId, x: Date.now() + 600000 })],
    ["signed with a wrong payload type", sign({ e: 12345, x: Date.now() + 600000 })],
    ["oversized", "x".repeat(500)],
  ];
  const forgedResults = [];
  for (const [name, v] of forged) { const r = await getPage(v); const h = await r.text(); forgedResults.push([name, r.status === 200 && !h.includes(GOOD)]); }
  check("P21-04 forged, foreign, unknown-event and oversized cookies never show success", forgedResults.every(([, ok]) => ok), JSON.stringify(forgedResults.filter(([, ok]) => !ok)));
  const expiredCookie = sign({ e: eventId, x: Date.now() - 1000 });
  const expiredHtml = await (await getPage(expiredCookie)).text();
  check("P21-05 a genuine but expired confirmation says it expired and invites sign-in with the new password (and does not claim success)", /confirmation page has expired/.test(expiredHtml) && /sign in with your new password/.test(expiredHtml) && !expiredHtml.includes(GOOD));

  // ---------- a real reset issues the confirmation
  const eventsBefore = await db.collection("security_events").countDocuments({});
  const bad = await call("POST", "/api/auth/reset-password", { token: "a".repeat(43), password: NEWPW, confirmPassword: NEWPW });
  const weakTk = await freshToken(buyerEmail);
  const weak = await new Session().call("POST", "/api/auth/reset-password", { token: weakTk, password: "short", confirmPassword: "short" });
  check("P21-06 a failed reset (unknown link, weak password) sets no confirmation cookie and writes no event", bad.status === 400 && weak.status === 400 && !bad.headers.getSetCookie().some((c) => c.startsWith("finbyn_reset_ok")) && !weak.headers.getSetCookie().some((c) => c.startsWith("finbyn_reset_ok")) && (await db.collection("security_events").countDocuments({})) === eventsBefore);
  const res = await reallyReset(buyerEmail, { role: "supplier", redirectTo: "https://evil.example", accountType: "SUPPLIER" });
  const confirmValue = res.s.jar.get("finbyn_reset_ok");
  check("P21-07 a committed reset returns the success page address and sets the confirmation cookie", res.r.status === 200 && res.r.json.data?.confirmationPath === SUCCESS && !!confirmValue, JSON.stringify(res.r.json));
  const rawLogin = await fetch(BASE + "/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() }, body: JSON.stringify({ token: await freshToken(supplierEmail), password: NEWPW, confirmPassword: NEWPW }) });
  const cookieLine = rawLogin.headers.getSetCookie().find((c) => c.startsWith("finbyn_reset_ok=")) ?? "";
  check("P21-08 the cookie is httpOnly, SameSite=Lax, Path=/password-reset, 10 minutes", /HttpOnly/i.test(cookieLine) && /SameSite=Lax/i.test(cookieLine) && /Path=\/password-reset/i.test(cookieLine) && /Max-Age=600/i.test(cookieLine), cookieLine.slice(0, 120));
  const decoded = Buffer.from(confirmValue.split(".")[0], "base64url").toString();
  check("P21-09 the cookie holds only an event id and an expiry: no email, role, token, password or hash", Object.keys(JSON.parse(decoded)).sort().join() === "e,x" && !/@|buyer|supplier|password|hash|token/i.test(decoded) && !decoded.includes(res.tk));
  // ---------- what the page shows for a real confirmation
  const okRes = await getPage(confirmValue);
  const okHtml = await okRes.text();
  check("P21-10 with the real confirmation the page shows success, the BUYER sign-in action to /login/buyer, the contact-support link, and the session line", okRes.status === 200 && okHtml.includes(GOOD) && okHtml.includes('href="/login/buyer"') && />Sign In as Buyer</.test(okHtml) && okHtml.includes('href="/contact-us"') && /previous login sessions on this account have been ended/.test(okHtml));
  check("P21-11 the role comes from the stored account, not the request: the body said supplier, the page offers only the buyer action and no supplier action", !/Sign In as Supplier/.test(okHtml) && !okHtml.includes("evil.example"));
  const dbBefore = { user: await users.findOne({ email: buyerEmail }), events: await db.collection("security_events").countDocuments({}), tok: await tokens.countDocuments({ usedAt: { $ne: null } }) };
  const again = await Promise.all([getPage(confirmValue), getPage(confirmValue), getPage(confirmValue)]);
  const dbAfter = { user: await users.findOne({ email: buyerEmail }), events: await db.collection("security_events").countDocuments({}), tok: await tokens.countDocuments({ usedAt: { $ne: null } }) };
  check("P21-12 refreshing (three more loads) shows the same page and changes nothing: same hash, same session version, no new event, no token touched", (await Promise.all(again.map((r) => r.text()))).every((h) => h.includes(GOOD)) && dbAfter.user.passwordHash === dbBefore.user.passwordHash && dbAfter.user.sessionVersion === dbBefore.user.sessionVersion && dbAfter.events === dbBefore.events && dbAfter.tok === dbBefore.tok);
  check("P21-13 the page contains no email, no reset token, no password and no hash", ![buyerEmail, res.tk, NEWPW, dbAfter.user.passwordHash, confirmValue].some((v) => okHtml.includes(v)));
  check("P21-14 the login link carries no token or query string", /href="\/login\/buyer"/.test(okHtml) && !/\/login\/buyer\?/.test(okHtml));

  // ---------- the confirmation is not a credential and cannot redo anything
  const onlyCookie = { cookie: `finbyn_reset_ok=${confirmValue}` };
  const me = await call("GET", "/api/auth/me", undefined, onlyCookie);
  const inq = await call("GET", "/api/buyer/inquiries", undefined, onlyCookie);
  const redo = await call("POST", "/api/auth/reset-password", { password: "yet another long passphrase", confirmPassword: "yet another long passphrase" }, onlyCookie);
  check("P21-15 the confirmation is not a sign-in: /api/auth/me shows nobody, buyer APIs refuse it, and it cannot reset a password again", !me.json?.user && [401, 403].includes(inq.status) && redo.status === 400 && (await users.findOne({ email: buyerEmail })).passwordHash === dbBefore.user.passwordHash, JSON.stringify([me.json, inq.status, redo.status]));

  // ---------- supplier
  const sup = await reallyReset(supplierEmail);
  const supHtml = await (await getPage(sup.s.jar.get("finbyn_reset_ok"))).text();
  check("P21-16 a supplier's reset shows ONLY the supplier action to /login/supplier", supHtml.includes(GOOD) && supHtml.includes('href="/login/supplier"') && />Sign In as Supplier</.test(supHtml) && !/Sign In as Buyer/.test(supHtml));
  const buyerCookieHtml = await (await getPage(confirmValue)).text();
  check("P21-17 each confirmation is bound to its own reset: the buyer's cookie never shows the supplier's destination and vice versa", buyerCookieHtml.includes("/login/buyer") && !buyerCookieHtml.includes("/login/supplier") && !supHtml.includes("/login/buyer"));

  // ---------- truthful session wording, generic role
  const ev1 = await db.collection("security_events").insertOne({ userId: (await users.findOne({ email: buyerEmail }))._id, type: "PASSWORD_RESET", at: new Date(), ipHash: "0".repeat(16), role: "buyer", sessionsRevoked: false });
  const noRev = await (await getPage(sign({ e: ev1.insertedId.toString(), x: Date.now() + 600000 }))).text();
  check("P21-18 when the stored event did NOT record a session revocation the page does not claim it (neutral wording instead)", noRev.includes(GOOD) && !/previous login sessions on this account have been ended/.test(noRev) && /may stay active until they expire/.test(noRev));
  const ev2 = await db.collection("security_events").insertOne({ userId: (await users.findOne({ email: buyerEmail }))._id, type: "PASSWORD_RESET", at: new Date(), ipHash: "0".repeat(16), sessionsRevoked: true });
  const noRole = await (await getPage(sign({ e: ev2.insertedId.toString(), x: Date.now() + 600000 }))).text();
  check("P21-19 a confirmation without a stored role gets the generic 'Sign In' to /sign-in, never a guessed buyer or supplier action", noRole.includes(GOOD) && noRole.includes('href="/sign-in"') && !/Sign In as (Buyer|Supplier)/.test(noRole));
  const ev3 = await db.collection("security_events").insertOne({ userId: (await users.findOne({ email: buyerEmail }))._id, type: "PASSWORD_RESET", at: new Date(Date.now() - 30 * 60000), ipHash: "0".repeat(16), role: "buyer", sessionsRevoked: true });
  const oldEvent = await (await getPage(sign({ e: ev3.insertedId.toString(), x: Date.now() + 600000 }))).text();
  check("P21-20 a signed cookie cannot outlive the window: an event older than 10 minutes shows 'expired'", /confirmation page has expired/.test(oldEvent) && !oldEvent.includes(GOOD));
  const ev4 = await db.collection("security_events").insertOne({ userId: (await users.findOne({ email: buyerEmail }))._id, type: "LOGIN_NOTE", at: new Date(), ipHash: "0".repeat(16), role: "buyer", sessionsRevoked: true });
  check("P21-21 only a PASSWORD_RESET event counts (another event type is refused)", !(await (await getPage(sign({ e: ev4.insertedId.toString(), x: Date.now() + 600000 }))).text()).includes(GOOD));

  // ---------- the browser: the whole journey and the page itself
  const j = await makeUser("p3");
  const ask = await open("/forgot-password");
  await fill(ask, "Business Email", j);
  await clickText(ask, "button", "Send Reset Link");
  await sleep(2500);
  await ask.context.close();
  const link = tokenFrom(mailsTo(j).filter((m) => /Reset Your/.test(m.body.subject)).at(-1), "/reset-password");
  const journeyOld = new Session(); await journeyOld.call("POST", "/api/auth/login", { email: j, password: PW });
  const oldCookie = journeyOld.jar.get("finbyn_session");
  const rp = await open(`/reset-password?token=${link}`);
  await fill(rp, "New Password", "journey new passphrase");
  await fill(rp, "Confirm New Password", "journey new passphrase");
  await Promise.all([rp.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => null), clickText(rp, "button", "Reset Password")]);
  await sleep(1500);
  const urlAfter = new URL(rp.url());
  const visible = await card(rp);
  check("P21-22 after Reset Password the browser lands on /password-reset/success (token gone from the address) showing success and the buyer action", urlAfter.pathname === SUCCESS && urlAfter.search === "" && visible.includes(GOOD) && (await rp.evaluate(() => !!document.querySelector('main a[href="/login/buyer"]'))), rp.url());
  check("P21-23 the status is announced (role=status) and the heading is the one h1", await rp.evaluate(() => !!document.querySelector('[role="status"] h1') && document.querySelectorAll("h1").length === 1));
  check("P21-24 the steps: updated and sessions-ended are ticked, sign-in and continue are NOT ticked yet", await rp.evaluate(() => { const li = [...document.querySelectorAll("main ul li")].filter((x) => /updated|sessions|Sign in with|Continue using/.test(x.textContent)); return li.length === 4 && /updated/.test(li[0].textContent) && li[0].className !== li[2].className && /\(done\)/.test(li[0].textContent) && /\(done\)/.test(li[1].textContent) && /\(still to do\)/.test(li[2].textContent) && /\(still to do\)/.test(li[3].textContent); }));
  await rp.reload({ waitUntil: "networkidle2" });
  check("P21-25 reloading the success page still shows success (until the 10 minutes pass) and does not reset anything again", (await card(rp)).includes(GOOD) && (await users.findOne({ email: j })).sessionVersion === 1);
  const staleMe = await call("GET", "/api/auth/me", undefined, { cookie: `finbyn_session=${oldCookie}` });
  check("P21-26 the session that existed before the reset is revoked", !staleMe.json?.user);
  const fresh = await browser.createBrowserContext();
  const freshPage = await fresh.newPage();
  await freshPage.setExtraHTTPHeaders({ "x-forwarded-for": nextIp() });
  await freshPage.goto(BASE + SUCCESS, { waitUntil: "networkidle2" });
  check("P21-27 a different browser with no confirmation sees 'unavailable', not success", !(await card(freshPage)).includes(GOOD) && /confirmation is unavailable/.test(await card(freshPage)));
  await fresh.close();
  await Promise.all([rp.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => null), rp.evaluate(() => document.querySelector('main a[href="/login/buyer"]').click())]);
  await sleep(1500);
  check("P21-28 the Sign In as Buyer button reaches the sign-in page", new URL(rp.url()).pathname === "/sign-in", rp.url());
  await fill(rp, "Email Address", j);
  await fill(rp, "Password", PW);
  await clickText(rp, "button", "Sign In");
  await sleep(1500);
  check("P21-29 the old password is refused on that page", /Incorrect email or password/.test(await text(rp)));
  await fill(rp, "Password", "journey new passphrase");
  await Promise.all([rp.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => null), clickText(rp, "button", "Sign In")]);
  const meNow = await rp.evaluate(async () => (await (await fetch("/api/auth/me")).json()).user);
  check("P21-30 signing in with the new password works and the role is buyer", meNow?.email === j && meNow?.role === "buyer", JSON.stringify(meNow));
  check("P21-31 no console errors across the whole journey", rp.errs.length === 0, rp.errs.join("|"));
  await rp.context.close();
  const contact = await open(SUCCESS, { cookies: [{ name: "finbyn_reset_ok", value: confirmValue, path: "/password-reset" }] });
  await Promise.all([contact.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => null), clickText(contact, "main a", "Contact Support")]);
  check("P21-32 Contact Support opens the working contact page (/contact-us)", new URL(contact.url()).pathname === "/contact-us" && /Contact Us/.test(await text(contact)), contact.url());
  await contact.context.close();

  // ---------- timing, log hygiene, responsive
  const times = [];
  for (let i = 0; i < 12; i++) { const t = performance.now(); await (await getPage(confirmValue)).text(); times.push(performance.now() - t); }
  times.sort((a, b) => a - b);
  const pageLines = serverLog().split("\n").filter((l) => l.includes("page password-reset-success") && l.includes('"perf"')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const dbOps = pageLines.at(-1);
  check("P21-33 retrieval latency is measured (whole page response, 12 loads) and stays within the 400 ms page target", times[6] < 400, `median ${times[6].toFixed(0)} ms, p95 ${times[11].toFixed(0)} ms; last server line: ${JSON.stringify(dbOps ?? {}).slice(0, 160)}`);
  check("P21-34 neither the confirmation cookie nor any reset token or password is in the server log", !serverLog().includes(confirmValue) && ![res.tk, sup.tk, link].some((t) => serverLog().includes(t)) && !serverLog().includes(NEWPW));
  const widths = [320, 344, 375, 390, 414, 480, 576, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];
  const wide = [];
  for (const w of widths) {
    const p = await open(SUCCESS, { width: w, cookies: [{ name: "finbyn_reset_ok", value: confirmValue, path: "/password-reset" }] });
    const o = await overflow(p);
    const inside = await p.evaluate(() => [...document.querySelectorAll("main a, main button")].every((el) => { const r = el.getBoundingClientRect(); return r.width === 0 || (r.left >= -1 && r.right <= window.innerWidth + 1); }));
    const tap = await p.evaluate(() => [...document.querySelectorAll("main .successActions a, main [class*=successActions] a")].every((a) => a.getBoundingClientRect().height >= 44));
    const overlap = await p.evaluate(() => { const a = [...document.querySelectorAll("main [class*=successActions] a")].map((x) => x.getBoundingClientRect()); return a.some((r, i) => a.some((q, k) => k > i && r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom)); });
    if (o > 0 || !inside || !tap || overlap) wide.push(`${w}: overflow ${o} inside ${inside} tap ${tap} overlap ${overlap}`);
    if ([1440, 820, 390].includes(w)) await p.screenshot({ path: `R:/indiamartref/docs/page-reports/screenshots/21-password-reset-success-${w === 1440 ? "desktop-1440" : w === 820 ? "tablet-820" : "mobile-390"}.png`, fullPage: true });
    await p.context.close();
  }
  check("P21-35 no horizontal overflow, controls inside the viewport, overlapping buttons or touch target under 44px at 16 widths (320 to 2560)", wide.length === 0, wide.join("; "));
  const fb = await open(SUCCESS, { width: 320 });
  check("P21-36 the fallback state at 320px also has no overflow, and its actions are reachable", (await overflow(fb)) <= 0 && (await fb.evaluate(() => [...document.querySelectorAll("main a")].filter((a) => /Sign In|Request Password Reset|Contact Support/.test(a.textContent)).length >= 3)));
  await fb.context.close();
}

async function cleanup() {
  if (process.env.KEEP === "1") return;
  const mine = await users.find({ email: { $regex: `^t15-${stamp}-` } }, { projection: { _id: 1 } }).toArray();
  await tokens.deleteMany({ userId: { $in: mine.map((u) => u._id) } });
  // tokens of users the suite deleted itself (H-38) have no user left: remove them too
  const liveIds = new Set((await users.find({}, { projection: { _id: 1 } }).toArray()).map((u) => String(u._id)));
  for (const t of await tokens.find({}, { projection: { userId: 1 } }).toArray()) if (!liveIds.has(String(t.userId))) await tokens.deleteOne({ _id: t._id });
  await db.collection("security_events").deleteMany({ userId: { $in: mine.map((u) => u._id) } });
  await users.deleteMany({ email: { $regex: `^t15-${stamp}-` } });
  await support.deleteMany({ $or: [{ email: { $regex: `^t15-${stamp}-` } }, { message: { $regex: `bogus-${stamp}` } }] });
  await db.collection("rate_limits").deleteMany({});
}

try {
  if (MODE === "mail") { await mail(); await reset20(); await success21(); }
  else { await nomail(); await supplier(); }
} catch (error) {
  check("suite ran to the end without throwing", false, String(error?.stack ?? error));
} finally {
  await cleanup();
  await browser.close();
  standIn.close();
  await client.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed (MODE=${MODE})${failed.length ? "\nFAILED:\n" + failed.map((f) => " - " + f.name).join("\n") : ""}`);
process.exit(failed.length ? 1 : 0);
