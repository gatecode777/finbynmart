import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";

// Page 27: explain("executionStats") of the My Inquiries queries, on the throwaway database only (finbynmart_test).
// One buyer with 20,000 inquiries among 30 other buyers with 1,000 each; removes everything it added. The server must have run once
// against this database so the indexes of src/lib/inquiries/service.ts exist.
const require = createRequire("R:/indiamartref/");
const { MongoClient, ObjectId } = require("mongodb");
const env = Object.fromEntries(fs.readFileSync("R:/indiamartref/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const client = await new MongoClient(env.MONGODB_URI).connect();
const col = client.db("finbynmart_test").collection("inquiries");
const tag = `explain-${Date.now()}`;
const AL = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const refOf = (n) => { let x = n + 1; let out = ""; for (let k = 0; k < 8; k++) { out = AL[x % 32] + out; x = Math.floor(x / 32); } return `FBM-INQ-E${out.slice(1)}`; };
const statuses = ["NEW", "NEW", "NOTIFIED", "IN_PROGRESS", "REPLIED", "QUOTED", "CLOSED", "CLOSED", "CANCELLED", "REJECTED"];
const sup = [["shree-textiles", "Shree Textiles"], ["sunrise-hub", "Sunrise Hub"], ["SLR9999", "Zenith Packaging"], ["SLR0042", "Delta Works"], ["SLR0043", "Echo Mills"]];
let counter = 0;
const make = (buyerId, n) => Array.from({ length: n }, (_, i) => { const at = new Date(Date.now() - i * 40_000_000); const [k, name] = sup[i % 5]; return { buyerId, buyerType: "REGISTERED", reference: refOf(counter++ + 5_000_000), supplierKey: k, supplierName: name, source: "catalog", productName: `Product ${i % 997}`, quantity: 100, unit: "Piece", inquiryType: ["GET_BEST_QUOTE", "PRODUCT_INQUIRY", "GENERAL_INQUIRY", "BULK_REQUIREMENT"][i % 4], status: statuses[i % 10], statusHistory: [], note: tag, createdAt: at, updatedAt: new Date(at.getTime() + (i % 7) * 3_600_000) }; });
const buyer = new ObjectId();
try {
for (let i = 0; i < 20000; i += 5000) await col.insertMany(make(buyer, 5000), { ordered: false });
for (let b = 0; b < 30; b++) await col.insertMany(make(new ObjectId(), 1000), { ordered: false });

const stages = (p) => [...new Set(JSON.stringify(p).match(/"stage":"[A-Z_]+"/g)?.map((x) => x.slice(9, -1)) ?? [])].join(" > ");
const idx = (p) => [...new Set(JSON.stringify(p).match(/"indexName":"[A-Za-z_0-9.-]+"/g)?.map((x) => x.slice(13, -1)) ?? [])].join(",");
const show = (name, ex) => { const s = ex.executionStats; console.log(`${name}: ${stages(ex.queryPlanner.winningPlan)} [${idx(ex.queryPlanner.winningPlan)}]; keys ${s.totalKeysExamined}, docs ${s.totalDocsExamined}, returned ${s.nReturned}, ${s.executionTimeMillis} ms`); };
const PROJ = { reference: 1, supplierName: 1, productName: 1, status: 1, createdAt: 1, updatedAt: 1 };
const f = (extra = {}) => ({ buyerId: buyer, ...extra });
const list = (filter, sort, skip = 0) => col.find(filter, { projection: PROJ }).sort(sort).skip(skip).limit(20).explain("executionStats");
const NEWEST = { createdAt: -1, _id: -1 };

show("newest (all)", await list(f(), NEWEST));
show("oldest (all)", await list(f(), { createdAt: 1, _id: 1 }));
show("recently updated", await list(f(), { updatedAt: -1, _id: -1 }));
show("status = CLOSED", await list(f({ status: { $in: ["CLOSED"] } }), NEWEST));
show("awaiting (NEW, new, NOTIFIED, IN_PROGRESS)", await list(f({ status: { $in: ["NEW", "new", "NOTIFIED", "IN_PROGRESS"] } }), NEWEST));
show("date window", await list(f({ createdAt: { $gte: new Date(Date.now() - 30 * 86_400_000), $lt: new Date() } }), NEWEST));
show("supplier filter", await list(f({ supplierKey: "SLR0042" }), NEWEST));
show("type filter", await list(f({ inquiryType: "BULK_REQUIREMENT" }), NEWEST));
show("search (product or supplier text)", await list({ $and: [f(), { $or: [{ reference: { $regex: "^product 12", $options: "i" } }, { productName: { $regex: "product 12", $options: "i" } }, { supplierName: { $regex: "product 12", $options: "i" } }] }] }, NEWEST));
show("last page (skip 19,980)", await list(f(), NEWEST, 19980));
show("count of the buyer's list (total)", await col.find(f()).explain("executionStats"));
const agg = await col.aggregate([{ $match: f() }, { $group: { _id: "$status", n: { $sum: 1 } } }]).explain("executionStats");
console.log("summary group by status:", stages(agg), "| keys", JSON.stringify(agg).match(/"totalKeysExamined":(\d+)/)?.[1], "docs", JSON.stringify(agg).match(/"totalDocsExamined":(\d+)/)?.[1]);
const one = await col.findOne(f());
show("detail by reference (+ buyer)", await col.find({ reference: one.reference, buyerId: buyer }).explain("executionStats"));
const fac = await col.aggregate([{ $match: f() }, { $group: { _id: "$supplierKey", name: { $first: "$supplierName" }, n: { $sum: 1 } } }, { $sort: { name: 1 } }]).explain("executionStats");
console.log("facets (suppliers):", stages(fac), "| keys", JSON.stringify(fac).match(/"totalKeysExamined":(\d+)/)?.[1], "docs", JSON.stringify(fac).match(/"totalDocsExamined":(\d+)/)?.[1]);
} finally {
  await col.deleteMany({ note: tag });
  await client.close();
}
