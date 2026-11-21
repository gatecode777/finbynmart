// READ-ONLY assessment of the legacy `requirements` collection (records written by the old Post Your Requirement form, which no page, worker or supplier ever read).
// It NEVER writes, never notifies and never redistributes. It refuses to run unless you point it at a database explicitly and confirm it is read-only:
//   LEGACY_ASSESS_URI=... LEGACY_ASSESS_DB=... LEGACY_ASSESS_CONFIRM=read-only node docs/audits/tools/requirements-legacy-dryrun.mjs
// It has no fallback to MONGODB_URI / MONGODB_DB: pass a COPY or a snapshot when possible. Output is counts only (no names, no cities, no ids).
import { MongoClient } from "mongodb";

const uri = process.env.LEGACY_ASSESS_URI, db = process.env.LEGACY_ASSESS_DB;
if (!uri || !db || process.env.LEGACY_ASSESS_CONFIRM !== "read-only") {
  console.error("REFUSING TO RUN: set LEGACY_ASSESS_URI, LEGACY_ASSESS_DB and LEGACY_ASSESS_CONFIRM=read-only (names only shown; there is no fallback to the ordinary variables).");
  process.exit(2);
}
const client = new MongoClient(uri, { readPreference: "secondaryPreferred" });
try {
  await client.connect();
  const col = client.db(db).collection("requirements");
  const [total, withSupplier, bounds, users, byUnit] = await Promise.all([
    col.countDocuments({}),
    col.countDocuments({ supplierKey: { $exists: true, $ne: "" } }),
    col.aggregate([{ $group: { _id: null, first: { $min: "$createdAt" }, last: { $max: "$createdAt" } } }]).toArray(),
    col.distinct("userId").then((a) => a.length),
    col.aggregate([{ $group: { _id: { $ifNull: ["$unit", "(none)"] }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }]).toArray(),
  ]);
  const inquiries = client.db(db).collection("inquiries");
  const migrated = await inquiries.countDocuments({ sourceType: "GENERAL_REQUIREMENT" });
  console.log(JSON.stringify({
    legacyRequirements: total,
    addressedToASupplier: withSupplier,
    distinctBuyers: users,
    firstCreated: bounds[0]?.first ?? null,
    lastCreated: bounds[0]?.last ?? null,
    topUnits: byUnit.map((u) => ({ unit: u._id, n: u.n })),
    newGeneralRequirementsInInquiries: migrated,
    note: "Legacy rows carry free-text product names and no catalogue product, so they cannot be matched exactly. They are NOT redistributed or notified. A backfill would need an approved policy: map each to a catalogue product with the buyer's confirmation, keep ownership and createdAt, write NO supplier notices.",
  }, null, 2));
} finally {
  await client.close();
}
