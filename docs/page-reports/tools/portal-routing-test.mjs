// Multi-portal routing and isolation (role-based redirects, route protection, API role enforcement, session expiry, logout, navigation).
// Needs a running `next start` (BASE, default :3100) on MONGODB_DB=finbynmart_test. Removes its own users at the end.
import fs from "node:fs";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";

const BASE = process.env.BASE || "http://localhost:3100";
const ROOT = "R:/indiamartref";
const require = createRequire(`${ROOT}/`);
const { MongoClient } = require("mongodb");
const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === "finbynmart_test") throw new Error("Refusing: the configured live database is named like the test database.");
const client = await new MongoClient(env.MONGODB_URI).connect();
const db = client.db("finbynmart_test");
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const stamp = Date.now();
let n = 0;
const ip = () => `10.55.${(stamp % 200) + 1}.${++n % 250}`;
const PW = "portal test passphrase";
const sign = (p) => createHmac("sha256", env.AUTH_SECRET).update(p).digest("base64url");

class S {
  jar = new Map();
  async call(method, path, body) {
    const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", "x-forwarded-for": ip(), ...(this.jar.size ? { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    for (const line of res.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); if (/Max-Age=0/i.test(line) || pair.slice(i + 1) === "") this.jar.delete(pair.slice(0, i)); else this.jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text, location: res.headers.get("location") };
  }
}
const mkBuyer = async (tag) => { const s = new S(); const email = `t39-${stamp}-${tag}@example.test`; const r = await s.call("POST", "/api/auth/register/buyer", { name: `Portal ${tag}`, email, phone: { countryCode: "+91", number: "9876543210" }, companyName: "Portal Co", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" }); if (r.status !== 201) throw new Error(r.text); return { s, email }; };
const mkSupplier = async (tag) => { const s = new S(); const email = `t39-${stamp}-${tag}@example.test`; const r = await s.call("POST", "/api/auth/register/supplier", { businessName: "Portal Supplier Co", contactName: "Sia Rao", email, phone: { countryCode: "+91", number: "9876543211" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" }); if (r.status !== 201) throw new Error(r.text); return { s, email }; };
const login = async (email, next, extra = {}) => { const s = new S(); const r = await s.call("POST", "/api/auth/login", { email, password: PW, ...(next !== undefined ? { next } : {}), ...extra }); return { s, r }; };

try {
  const B = await mkBuyer("buyer"), SUP = await mkSupplier("supplier");

  // ---- redirects after sign-in
  const b1 = await login(B.email), b2 = await login(B.email, "/buyer/inquiries?status=open"), b3 = await login(B.email, "/products/abc");
  check("1 a buyer signing in is sent to /buyer/dashboard (resolved by the server from the account's role)", b1.r.status === 200 && b1.r.json.redirectTo === "/buyer/dashboard" && b1.r.json.user.role === "buyer");
  check("2 a buyer keeps a requested buyer page or public page", b2.r.json.redirectTo === "/buyer/inquiries?status=open" && b3.r.json.redirectTo === "/products/abc");
  const hostile = await Promise.all(["/supplier/dashboard", "/supplier/products", "/admin", "/super-admin/roles", "//evil.example", "https://evil.example/x", "/api/auth/me", "/"].map((x) => login(B.email, x)));
  check("3 a buyer is never sent to a supplier or admin page, another site or an API path: always the buyer dashboard", hostile.every((h) => h.r.json.redirectTo === "/buyer/dashboard"), hostile.map((h) => h.r.json.redirectTo).join(" "));
  const spoof = await login(B.email, undefined, { role: "supplier", portal: "SUPPLIER", redirectTo: "/supplier/dashboard" });
  check("4 a role or redirect sent in the request body is ignored: the account's stored role decides", spoof.r.json.redirectTo === "/buyer/dashboard" && spoof.r.json.user.role === "buyer");
  const s1 = await login(SUP.email), s2 = await login(SUP.email, "/buyer/dashboard"), s3 = await login(SUP.email, "/supplier/products"), s4 = await login(SUP.email, "/suppliers");
  check("5 a supplier lands on /supplier/dashboard and is never sent to a buyer page; requested supplier or public pages are kept", s1.r.json.redirectTo === "/supplier/dashboard" && s2.r.json.redirectTo === "/supplier/dashboard" && s3.r.json.redirectTo === "/supplier/products" && s4.r.json.redirectTo === "/suppliers");
  const wrong = await login(B.email, undefined, {}); void wrong;
  check("6 a failed sign-in returns no redirect", (await (async () => { const s = new S(); const r = await s.call("POST", "/api/auth/login", { email: B.email, password: "wrong password here" }); return r.status === 401 && r.json.redirectTo === undefined; })()));

  // ---- buyer routes and APIs against a supplier, and anonymous access
  const supPage = await s1.s.call("GET", "/buyer/dashboard");
  check("7 a supplier opening a buyer page sees 'Buyer accounts only' and none of the buyer's data (not a buyer dashboard)", supPage.status === 200 && /Buyer accounts only/.test(supPage.text) && !/My Inquiries|Saved Products|Order Summary/.test(supPage.text));
  const apis = ["/api/buyer/dashboard", "/api/buyer/orders", "/api/buyer/inquiries", "/api/buyer/saved-products", "/api/buyer/security/sessions", "/api/buyer/support/tickets", "/api/buyer/profile"];
  const supApi = await Promise.all(apis.map((a) => s1.s.call("GET", a)));
  check("8 every buyer API refuses a supplier account (403) with no data", supApi.every((r) => r.status === 403 && !/inquiries|orders|tickets/i.test(JSON.stringify(r.json?.data ?? ""))), supApi.map((r) => r.status).join(" "));
  const anonPages = await Promise.all(["/buyer/dashboard", "/buyer/orders", "/buyer/security?tab=sessions", "/buyer/support"].map((p) => new S().call("GET", p)));
  check("9 direct URL access without a session redirects to sign-in (keeping the page to return to) and shows nothing private", anonPages.every((r) => [302, 303, 307, 308].includes(r.status) && /\/sign-in\?next=/.test(r.location ?? "") && !/Portal buyer/.test(r.text)), anonPages.map((r) => r.status).join(" "));
  const anonApis = await Promise.all(apis.map((a) => new S().call("GET", a)));
  check("10 every buyer API refuses an anonymous request (401)", anonApis.every((r) => r.status === 401), anonApis.map((r) => r.status).join(" "));
  const supRoutes = await Promise.all(["/supplier/dashboard", "/supplier", "/supplier/products", "/admin", "/super-admin/roles"].map((p) => b1.s.call("GET", p)));
  check("11 a buyer asking for supplier routes is redirected to forbidden, admin is 404 (nothing is exposed)", [supRoutes[0], supRoutes[1], supRoutes[2]].every((r) => [302, 307, 308].includes(r.status) && /forbidden/.test(r.location ?? "")) && supRoutes[3].status === 404 && supRoutes[4].status === 404);

  // ---- navigation
  const dash = await b1.s.call("GET", "/buyer/dashboard");
  const hrefs = [...dash.text.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const nav = ["/buyer/dashboard", "/products", "/buyer/inquiries", "/buyer/quotations", "/buyer/orders", "/buyer/saved-products", "/buyer/saved-suppliers", "/buyer/compare-products", "/buyer/profile", "/buyer/addresses", "/buyer/settings", "/buyer/security", "/buyer/support"];
  check("12 the buyer's sidebar holds exactly the buyer modules (Dashboard, Product Explorer, My Inquiries, Quotations, Orders, Saved Products, Saved Suppliers, Compare Products, Profile & Company, Address Book, Settings & Notifications, Account Security, Help & Support)", nav.every((h) => hrefs.includes(h)), nav.filter((h) => !hrefs.includes(h)).join(","));
  check("13 no supplier-management or admin link is shown to a buyer", !hrefs.some((h) => /^\/(supplier|admin|super-admin)(\/|$)/.test(h)), hrefs.filter((h) => /^\/(supplier|admin|super-admin)/.test(h)).join(","));

  // ---- session expiry, logout, role in the browser
  const user = await db.collection("users").findOne({ email: B.email });
  const expiredPayload = Buffer.from(JSON.stringify({ sub: String(user._id), v: 0, exp: Date.now() - 1000 })).toString("base64url");
  const expired = new S(); expired.jar.set("finbyn_session", `${expiredPayload}.${sign(expiredPayload)}`);
  const exp = await expired.call("GET", "/buyer/dashboard");
  check("14 an expired session cookie is refused on a buyer page (redirect to sign-in) and on the API (401)", [302, 307, 308].includes(exp.status) && /sign-in/.test(exp.location ?? "") && (await expired.call("GET", "/api/buyer/dashboard")).status === 401);
  const ok = await b1.s.call("GET", "/api/buyer/dashboard");
  await b1.s.call("POST", "/api/auth/logout");
  const afterOut = await b1.s.call("GET", "/buyer/dashboard");
  check("15 logout ends the session: the buyer page works before and redirects to sign-in after", ok.status === 200 && [302, 307, 308].includes(afterOut.status) && /sign-in/.test(afterOut.location ?? ""));
  const role = new S(); role.jar.set("role", "supplier"); role.jar.set("portal", "SUPPLIER");
  check("16 a role kept in a cookie or browser storage grants nothing: a request with a 'role=supplier' cookie and no session is just anonymous (401)", (await role.call("GET", "/api/buyer/dashboard")).status === 401);
  const dup = await new S().call("POST", "/api/auth/register/supplier", { businessName: "Dup Co", contactName: "Dup Name", email: B.email, phone: { countryCode: "+91", number: "9876543212" }, city: "Pune", offering: "Packaging materials in bulk.", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: "2026-11-02" });
  check("17 multiple roles on one account are not supported (one role per account, set at registration): registering a supplier with a buyer's email is refused, so no browser can obtain a second role", dup.status === 409 && (await db.collection("users").countDocuments({ email: B.email })) === 1);
} finally {
  const mine = await db.collection("users").find({ email: { $regex: `^t39-${stamp}-` } }, { projection: { _id: 1 } }).toArray();
  const ids = mine.map((u) => u._id);
  await db.collection("auth_sessions").deleteMany({ userId: { $in: ids } });
  await db.collection("security_events").deleteMany({ userId: { $in: ids } });
  await db.collection("security_alerts").deleteMany({ userId: { $in: ids } });
  await db.collection("notifications").deleteMany({ buyerId: { $in: ids } });
  await db.collection("users").deleteMany({ _id: { $in: ids } });
  await client.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
