// READ-ONLY impact assessment for the retired supplier self-verification endpoints (audit S-01 / S-02).
// It never writes. It refuses to run unless you name an approved TEST database explicitly:
//   MONGODB_URI=<test uri> MONGODB_DB=finbyn_test APPROVED_DB=finbyn_test node docs/audits/tools/verification-provenance-dryrun.mjs
// Classification (counts only, no personal values are printed):
//   confirmed-bypass : a SECURITY_ALERT event with dedupeKey email_verified:<ms> / phone_verified:<ms> exists (written only by the removed endpoints)
//   genuine          : emailVerified with emailVerifiedVia = token | reset-link (written only after the fix)
//   ambiguous        : verified, but no provenance either way (older accounts, or evidence already purged by event retention)
import { MongoClient } from "mongodb";
const uri = process.env.MONGODB_URI, name = process.env.MONGODB_DB;
if (!uri || !name || process.env.APPROVED_DB !== name || !/test|staging|local/i.test(name)) {
  console.error("Refusing to run: set MONGODB_DB to an approved test/staging/local database and APPROVED_DB to the same name.");
  process.exit(2);
}
const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(name);
  const users = await db.collection("users").find({ role: "supplier", $or: [{ emailVerified: true }, { phoneVerified: true }] }, { projection: { emailVerified: 1, phoneVerified: 1, emailVerifiedVia: 1 } }).toArray();
  const evs = await db.collection("security_events").find({ type: "SECURITY_ALERT", dedupeKey: { $regex: "^(email|phone)_verified:\d+$" } }, { projection: { userId: 1, dedupeKey: 1 } }).toArray();
  const bypass = { email: new Set(), phone: new Set() };
  for (const e of evs) bypass[e.dedupeKey.startsWith("email") ? "email" : "phone"].add(String(e.userId));
  const out = { supplierAccountsChecked: users.length, email: { confirmedBypass: 0, genuine: 0, ambiguous: 0 }, phone: { confirmedBypass: 0, ambiguous: 0 } };
  for (const u of users) {
    const id = String(u._id);
    if (u.emailVerified) { if (bypass.email.has(id)) out.email.confirmedBypass++; else if (u.emailVerifiedVia) out.email.genuine++; else out.email.ambiguous++; }
    if (u.phoneVerified) { if (bypass.phone.has(id)) out.phone.confirmedBypass++; else out.phone.ambiguous++; }
  }
  console.log(JSON.stringify(out, null, 2));
  console.log("No changes were made. Remediation (clearing flags for confirmed-bypass accounts) must be a separate, reviewed script run by an operator.");
} finally {
  await client.close();
}
