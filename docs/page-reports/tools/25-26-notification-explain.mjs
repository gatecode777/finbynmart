import fs from "node:fs";
import { createRequire } from "node:module";

// Pages 25-26: explain("executionStats") for the notification queries, on the throwaway database only (finbynmart_test).
// Seeds 20,000 notifications for one buyer plus 2,000 for each of 40 others, runs the plans, then removes everything it added.
const require = createRequire("R:/indiamartref/");
const { MongoClient, ObjectId } = require("mongodb");
const env = Object.fromEntries(fs.readFileSync("R:/indiamartref/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const client = await new MongoClient(env.MONGODB_URI).connect();
const col = client.db("finbynmart_test").collection("notifications");
const tag = `explain-${Date.now()}`;
const mk = (buyerId, n) => Array.from({ length: n }, (_, i) => ({ buyerId, category: ["inquiries", "company", "account"][i % 3], type: "SEED", title: tag, body: "x", link: null, dedupeKey: `${tag}-${buyerId}-${i}`, isRead: i % 4 !== 0, readAt: i % 4 === 0 ? null : new Date(), createdAt: new Date(Date.now() - i * 60_000), purgeAt: new Date(Date.now() + 180 * 86_400_000) }));
const buyer = new ObjectId();
const others = Array.from({ length: 40 }, () => new ObjectId());
for (let i = 0; i < 20000; i += 5000) await col.insertMany(mk(buyer, 5000).map((d, k) => ({ ...d, dedupeKey: `${tag}-${buyer}-${i + k}`, createdAt: new Date(Date.now() - (i + k) * 60_000), isRead: (i + k) % 4 !== 0, readAt: (i + k) % 4 === 0 ? null : new Date() })));
for (const o of others) await col.insertMany(mk(o, 2000));
const stages = (p) => [...new Set(JSON.stringify(p).match(/"stage":"[A-Z_]+"/g)?.map((x) => x.slice(9, -1)) ?? [])].join(" > ");
const idx = (p) => [...new Set(JSON.stringify(p).match(/"indexName":"[a-z_A-Z0-9]+"/g)?.map((x) => x.slice(13, -1)) ?? [])].join(",");
const show = (name, ex) => { const s = ex.executionStats; console.log(`${name}: ${stages(ex.queryPlanner.winningPlan)} [${idx(ex.queryPlanner.winningPlan)}]; keys ${s.totalKeysExamined}, docs ${s.totalDocsExamined}, returned ${s.nReturned}, ${s.executionTimeMillis} ms`); };
show("list newest", await col.find({ buyerId: buyer }).sort({ createdAt: -1, _id: -1 }).limit(20).explain("executionStats"));
show("list unread", await col.find({ buyerId: buyer, isRead: false }).sort({ createdAt: -1, _id: -1 }).limit(20).explain("executionStats"));
show("list read", await col.find({ buyerId: buyer, isRead: true }).sort({ createdAt: -1, _id: -1 }).limit(20).explain("executionStats"));
show("list category", await col.find({ buyerId: buyer, category: "company" }).sort({ createdAt: -1, _id: -1 }).limit(20).explain("executionStats"));
show("list category + unread", await col.find({ buyerId: buyer, category: "company", isRead: false }).sort({ createdAt: -1, _id: -1 }).limit(20).explain("executionStats"));
show("deep page (skip 19,900)", await col.find({ buyerId: buyer }).sort({ createdAt: -1, _id: -1 }).skip(19900).limit(20).explain("executionStats"));
show("count total (filter)", await col.find({ buyerId: buyer, category: "company" }).explain("executionStats"));
show("unread count (limit 100)", await col.find({ buyerId: buyer, isRead: false }).limit(100).explain("executionStats"));
show("read one (_id + buyer)", await col.find({ _id: (await col.findOne({ buyerId: buyer }))._id, buyerId: buyer }).explain("executionStats"));
const ids = (await col.find({ buyerId: buyer, isRead: false }, { projection: { _id: 1 } }).sort({ createdAt: -1 }).limit(250).toArray()).map((d) => d._id);
const upd = async (label, opts) => { const t0 = performance.now(); const r = await col.updateMany({ _id: { $in: ids }, buyerId: buyer, isRead: false }, { $set: { isRead: true, readAt: new Date() } }, opts); console.log(`${label}: modified ${r.modifiedCount} in ${(performance.now() - t0).toFixed(0)} ms`); await col.updateMany({ _id: { $in: ids } }, { $set: { readAt: null, isRead: false } }); };
await upd("mark-all batch of 250, planner's choice", {});
await upd("mark-all batch of 250, hint _id", { hint: { _id: 1 } });
await upd("mark-all batch of 250, planner's choice (again)", {});
await upd("mark-all batch of 250, hint _id (again)", { hint: { _id: 1 } });
const plan = await client.db("finbynmart_test").command({ explain: { update: "notifications", updates: [{ q: { _id: { $in: ids }, buyerId: buyer, isRead: false }, u: { $set: { readAt: new Date() } }, multi: true }] }, verbosity: "executionStats" });
console.log("update plan:", stages(plan.queryPlanner.winningPlan), `[${idx(plan.queryPlanner.winningPlan)}]`, "keys", plan.executionStats?.totalKeysExamined, "docs", plan.executionStats?.totalDocsExamined);
await col.deleteMany({ title: tag });
await client.close();
