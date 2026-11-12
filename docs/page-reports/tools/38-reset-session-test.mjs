// Page 38: a password reset ends every registered session (and the old cookies stop working). Needs a running `next start` (BASE, default :3100) on finbynmart_test.
// The reset token is inserted directly (no email provider exists to send one); everything else goes through the real routes.
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";

const BASE = process.env.BASE || "http://localhost:3100";
const ROOT = "R:/indiamartref";
const require = createRequire(`${ROOT}/`);
const { MongoClient } = require("mongodb");
const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const client = await new MongoClient(env.MONGODB_URI).connect();
const db = client.db("finbynmart_test");
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
let n = 0;
const ip = () => `10.77.${Math.floor(Math.random() * 200)}.${++n % 250}`;
const email = `t38-reset-${Date.now()}@example.test`;
const PW = "reset test passphrase";

async function call(jar, method, path, body, ua = "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36") {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", "x-forwarded-for": ip(), "user-agent": ua, ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}) }, body: body ? JSON.stringify(body) : undefined });
  for (const line of res.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); if (/Max-Age=0/i.test(line) || pair.slice(i + 1) === "") jar.delete(pair.slice(0, i)); else jar.set(pair.slice(0, i), pair.slice(i + 1)); }
  return { status: res.status, json: await res.json().catch(() => null) };
}

try {
  const a = new Map(), b = new Map(), c = new Map();
  await call(a, "POST", "/api/auth/register/buyer", { name: "Reset Buyer", email, phone: { countryCode: "+91", number: "9876543210" }, companyName: "Reset Co", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  await call(b, "POST", "/api/auth/login", { email, password: PW }, "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0");
  await call(c, "POST", "/api/auth/login", { email, password: PW }, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Version/17.1 Mobile/15E148 Safari/604.1");
  const user = await db.collection("users").findOne({ email });
  const before = await db.collection("auth_sessions").countDocuments({ userId: user._id, revokedAt: null });
  const meBefore = [(await call(a, "GET", "/api/auth/me")).json?.user, (await call(b, "GET", "/api/auth/me")).json?.user, (await call(c, "GET", "/api/auth/me")).json?.user];
  const token = randomBytes(32).toString("base64url");
  await db.collection("auth_tokens").insertOne({ userId: user._id, purpose: "reset_password", tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 600_000), usedAt: null, revokedAt: null, purgeAt: new Date(Date.now() + 86_400_000), createdAt: new Date() });
  const reset = await call(new Map(), "POST", "/api/auth/reset-password", { token, password: "A new reset passphrase 42", confirmPassword: "A new reset passphrase 42" });
  const meAfter = [(await call(a, "GET", "/api/auth/me")).json?.user, (await call(b, "GET", "/api/auth/me")).json?.user, (await call(c, "GET", "/api/auth/me")).json?.user];
  const after = await db.collection("auth_sessions").countDocuments({ userId: user._id, revokedAt: null });
  const reasons = await db.collection("auth_sessions").distinct("revokedReason", { userId: user._id });
  check("R-01 before the reset all three browsers are signed in and the registry holds three active sessions", meBefore.every(Boolean) && before === 3, `${before} active`);
  check("R-02 the reset succeeds (200)", reset.status === 200, JSON.stringify(reset.json).slice(0, 120));
  check("R-03 after the reset none of the three browsers is signed in (the session version moved), and no registry session is still active; each ended with reason 'password_reset'", meAfter.every((u) => !u) && after === 0 && reasons.length === 1 && reasons[0] === "password_reset", `${after} active, reasons ${reasons.join()}`);
  const signIn = await call(new Map(), "POST", "/api/auth/login", { email, password: "A new reset passphrase 42" });
  check("R-04 the new password signs in and starts a fresh registry session", signIn.status === 200 && (await db.collection("auth_sessions").countDocuments({ userId: user._id, revokedAt: null })) === 1);
  await db.collection("auth_sessions").deleteMany({ userId: user._id });
  await db.collection("security_events").deleteMany({ userId: user._id });
  await db.collection("auth_tokens").deleteMany({ userId: user._id });
  await db.collection("users").deleteOne({ _id: user._id });
} finally {
  await client.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
