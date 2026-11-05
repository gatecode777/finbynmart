import fs from "node:fs";
import { createRequire } from "node:module";

// Page 24: explain("executionStats") for the address book queries, on the throwaway database only (finbynmart_test).
// Seeds 50 addresses for each of 200 fake buyers (10,000 rows) so the planner has to pick the buyer-scoped index, then removes them.
const require = createRequire("R:/indiamartref/");
const { MongoClient, ObjectId } = require("mongodb");
const env = Object.fromEntries(fs.readFileSync("R:/indiamartref/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const client = await new MongoClient(env.MONGODB_URI).connect();
const col = client.db("finbynmart_test").collection("buyer_addresses");
const tag = `explain-${Date.now()}`;
const buyers = Array.from({ length: 200 }, () => new ObjectId());
const rows = buyers.flatMap((buyerId) => Array.from({ length: 50 }, (_, i) => ({ buyerId, label: `${tag} ${i}`, purposes: i % 2 ? ["DELIVERY"] : ["BUSINESS", "BILLING"], addressLine1: "Road", country: "India", state: "Rajasthan", city: "Jaipur", postalCode: "302001", isDefaultBilling: false, isDefaultDelivery: false, version: 1, createdAt: new Date(Date.now() - i * 1000), updatedAt: new Date() })));
await col.insertMany(rows);
const buyerId = buyers[0];
const plan = (p) => JSON.stringify(p).match(/"stage":"[A-Z_]+"/g)?.map((x) => x.slice(9, -1)) ?? [];
const show = (name, ex) => { const s = ex.executionStats; console.log(`${name}: stages ${[...new Set(plan(ex.queryPlanner.winningPlan))].join(" > ")}; keys ${s.totalKeysExamined}, docs ${s.totalDocsExamined}, returned ${s.nReturned}, ${s.executionTimeMillis} ms`); };
show("list (buyer, newest first)", await col.find({ buyerId }).sort({ createdAt: -1 }).limit(50).explain("executionStats"));
show("list filtered by purpose", await col.find({ buyerId, purposes: "DELIVERY" }).sort({ createdAt: -1 }).limit(50).explain("executionStats"));
show("list with text search", await col.find({ buyerId, $or: [{ label: /jaipur/i }, { city: /jaipur/i }] }).sort({ createdAt: -1 }).limit(50).explain("executionStats"));
show("read one (_id + buyer)", await col.find({ _id: rows[0]._id, buyerId }).explain("executionStats"));
show("count for the 50 cap", await col.find({ buyerId }).explain("executionStats"));
const agg = await col.aggregate([{ $match: { buyerId } }, { $group: { _id: null, total: { $sum: 1 } } }]).explain("executionStats");
console.log("statistics aggregation: stages", [...new Set(plan(agg))].join(" > "), "| keys", JSON.stringify(agg).match(/"totalKeysExamined":(\d+)/)?.[1], "docs", JSON.stringify(agg).match(/"totalDocsExamined":(\d+)/)?.[1]);
await col.deleteMany({ label: { $regex: `^${tag}` } });
await client.close();
