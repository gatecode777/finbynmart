// Seeds THREE test identities into the THROWAWAY test database only (buyer and supplier through the real registration endpoints, admin inserted like an operator would).
// Refuses to run unless the server's database is the in-memory finbyn_it_* one: it reads MONGODB_URI / MONGODB_DB from the environment and requires the URI to be 127.0.0.1 and the name finbyn_it_*.
// run: MONGODB_URI=$(cat .test-db-uri) MONGODB_DB=finbyn_it_portals BASE=http://localhost:3100 node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/test-db-seed.mjs
import { MongoClient } from "mongodb";
const uri = process.env.MONGODB_URI ?? "", dbName = process.env.MONGODB_DB ?? "", BASE = process.env.BASE ?? "http://localhost:3100";
if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(uri) || !/^finbyn_it_[a-z0-9_]+$/.test(dbName)) throw new Error("refusing: not the local throwaway test database");
const { hashPassword } = await import("../../../src/lib/auth/password.ts");
const { ADMIN_CAPABILITIES } = await import("../../../src/lib/admin/permissions.ts");
const { CONSENT_VERSION } = await import("../../../src/lib/legal.ts");
const PW = "Test-Passw0rd!x1";
const post = async (path, body) => { const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
const b = await post("/api/auth/register/buyer", { name: "Test Buyer", email: "buyer@test.invalid", phone: { countryCode: "+91", number: "9876543210" }, companyName: "Test Buyer Traders", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: CONSENT_VERSION });
console.log("buyer", b.status, b.j.message ?? JSON.stringify(b.j.fields ?? {}));
const s = await post("/api/auth/register/supplier", { contactName: "Test Supplier", email: "supplier@test.invalid", phone: { countryCode: "+91", number: "9876543211" }, businessName: "Test Supplier Works", city: "Surat", offering: "Cotton fabric", password: PW, confirmPassword: PW, consent: true, consentPolicyVersion: CONSENT_VERSION });
console.log("supplier", s.status, s.j.message ?? JSON.stringify(s.j.fields ?? {}));
const client = await MongoClient.connect(uri);
const users = client.db(dbName).collection("users");
await users.updateOne({ email: "admin@test.invalid" }, { $setOnInsert: { name: "Test Admin", email: "admin@test.invalid", passwordHash: await hashPassword(PW), role: "admin", accountStatus: "ACTIVE", emailVerified: true, adminPermissions: [...ADMIN_CAPABILITIES], createdAt: new Date() } }, { upsert: true });
console.log("admin ok; roles:", (await users.find({}, { projection: { role: 1, email: 1 } }).toArray()).map((u) => u.role + ":" + u.email).join(", "));
await client.close();
