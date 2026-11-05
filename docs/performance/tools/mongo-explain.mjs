// MongoDB query audit: explain("executionStats") for every query the application runs against MongoDB, at several data volumes.
//
//   node docs/performance/tools/mongo-explain.mjs --sizes 1000,10000,50000 [--keep]
//
// ONLY the throwaway database `finbynmart_test` is touched (the script refuses anything else). Synthetic documents carry
// `__perf: true` and are removed at the end (unless --keep), together with nothing else. The queries below are copied from
// the application (lib/reviews, lib/certifications, lib/inquiries, lib/auth, lib/wishlist, lib/security/rateLimit):
// when one of those changes, change it here too.
import fs from "node:fs";
import { createRequire } from "node:module";

const ROOT = "R:/indiamartref";
const require = createRequire(`${ROOT}/`);
const { MongoClient, ObjectId } = require("mongodb");
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, t, i, all) => (t.startsWith("--") ? [...acc, [t.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]] : acc), []));
const SIZES = (args.sizes || "1000,10000").split(",").map(Number);
const OUT = args.out || "docs/performance/results/mongo-explain.json";

const env = Object.fromEntries(fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === "finbynmart_test") throw new Error("Refusing: the configured live database is named like the test database.");
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const db = client.db("finbynmart_test");

const SUPPLIERS = ["shree-textiles", "sunrise-hub", "modern-apparels", "ruchi-creations", "classic-retail"];
const pick = (i) => SUPPLIERS[i % SUPPLIERS.length];
const CROCK = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ref = (i) => `FBM-INQ-${[...Array(8)].map((_, k) => CROCK[(i * 7 + k * 13 + (i >> k)) % 32]).join("")}`;
const day = 86_400_000;

// make sure the indexes the application creates exist (the application creates them lazily on first use)
async function ensureIndexes() {
  await db.collection("reviews").createIndex({ supplierSlug: 1, status: 1, publishedAt: -1 });
  await db.collection("reviews").createIndex({ buyerId: 1, createdAt: -1 });
  await db.collection("reviews").createIndex({ buyerId: 1, supplierSlug: 1 }, { unique: true, partialFilterExpression: { active: true } });
  await db.collection("certifications").createIndex({ supplierSlug: 1, verificationStatus: 1 });
  const inq = db.collection("inquiries");
  await inq.createIndex({ buyerId: 1, createdAt: -1 });
  await inq.createIndex({ supplierKey: 1, createdAt: -1 });
  await inq.createIndex({ reference: 1 }, { unique: true, sparse: true });
  await inq.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });
  await inq.createIndex({ "guest.email": 1, createdAt: -1 }, { sparse: true });
}

async function seed(size) {
  const reviews = Array.from({ length: size }, (_, i) => ({ supplierSlug: pick(i), buyerId: new ObjectId(), displayName: "Perf P.", rating: 1 + (i % 5), title: `Perf review ${i}`, text: "Synthetic review text for the performance audit.".repeat(3), categoryRatings: { "product-quality": 1 + (i % 5) }, wouldRecommend: i % 3 === 0 ? true : null, verifiedBuyer: false, verificationSource: null, status: i % 10 === 0 ? "PENDING" : "APPROVED", publishedAt: new Date(Date.now() - (i % 400) * day), createdAt: new Date(), updatedAt: new Date(), deletedAt: null, __perf: true }));
  const certs = Array.from({ length: Math.round(size / 4) }, (_, i) => ({ supplierSlug: pick(i), name: `Perf certificate ${i}`, certificationType: "quality-management", issuingAuthority: `Authority ${i % 12}`, issueDate: "2024-01-01", expiryDate: i % 4 === 0 ? null : "2030-01-01", verificationStatus: i % 7 === 0 ? "PENDING" : "VERIFIED", createdAt: new Date(), updatedAt: new Date(), deletedAt: null, __perf: true }));
  const buyers = Array.from({ length: 50 }, () => new ObjectId());
  const inquiries = Array.from({ length: size * 2 }, (_, i) => ({ reference: `${ref(i).slice(0, 8)}${(i + 1000000000).toString(32).toUpperCase().slice(-8).replace(/[ILOU]/g, "7")}`, buyerId: i % 5 === 0 ? undefined : buyers[i % 50], buyerType: i % 5 === 0 ? "GUEST" : "REGISTERED", ...(i % 5 === 0 ? { guest: { name: "Perf", email: `perf${i % 500}@example.test`, phone: "+91 9876543210" } } : {}), supplierKey: pick(i), supplierSlug: pick(i), supplierName: "Perf", source: "sample", quantity: 1 + (i % 500), unit: "Piece", message: "Synthetic inquiry message for the audit.", inquiryType: "GENERAL_INQUIRY", status: "NEW", idempotencyKey: `perfkey${i.toString().padStart(10, "0")}abcdef`, createdAt: new Date(Date.now() - i * 60_000), __perf: true }));
  for (let i = 0; i < reviews.length; i += 5000) await db.collection("reviews").insertMany(reviews.slice(i, i + 5000), { ordered: false });
  for (let i = 0; i < certs.length; i += 5000) await db.collection("certifications").insertMany(certs.slice(i, i + 5000), { ordered: false });
  // references must be unique: encode the running number in the 32-character reference alphabet
  const enc = (n) => Array.from({ length: 8 }, (_, k) => CROCK[(n >> (5 * (7 - k))) & 31]).join("");
  inquiries.forEach((d, i) => { d.reference = `FBM-INQ-${enc(i + 1)}`; });
  for (let i = 0; i < inquiries.length; i += 5000) await db.collection("inquiries").insertMany(inquiries.slice(i, i + 5000), { ordered: false });
  return { buyers, firstRef: inquiries[7].reference, lastRef: inquiries.at(-1).reference, guestEmail: "perf10@example.test", buyer: buyers[3] };
}

const flatten = (plan, out = []) => { if (!plan) return out; out.push(plan.stage + (plan.indexName ? `(${plan.indexName})` : "")); flatten(plan.inputStage, out); (plan.inputStages ?? []).forEach((p) => flatten(p, out)); return out; };

async function explain(name, collection, run, expectIndex) {
  const cursor = run(db.collection(collection));
  const info = await cursor.explain("executionStats");
  const stats = info.executionStats;
  const stages = flatten(info.queryPlanner.winningPlan);
  const t0 = performance.now();
  await run(db.collection(collection)).toArray();
  const wall = performance.now() - t0;
  return { name, collection, returned: stats.nReturned, keysExamined: stats.totalKeysExamined, docsExamined: stats.totalDocsExamined, serverMs: stats.executionTimeMillis, wallMs: Math.round(wall), plan: stages.join(" > "), collScan: stages.includes("COLLSCAN"), blockingSort: stages.includes("SORT"), expectIndex };
}

const report = { when: new Date().toISOString(), sizes: SIZES, runs: [] };
await ensureIndexes();
for (const size of SIZES) {
  await db.collection("reviews").deleteMany({ __perf: true });
  await db.collection("certifications").deleteMany({ __perf: true });
  await db.collection("inquiries").deleteMany({ __perf: true });
  const t0 = performance.now();
  const s = await seed(size);
  console.log(`\n== ${size} reviews, ${Math.round(size / 4)} certifications, ${size * 2} inquiries (loaded in ${Math.round(performance.now() - t0)} ms)`);
  const rows = [];
  const R = "reviews";
  rows.push(await explain("reviews: public list of one supplier (as the app runs it: up to 2000, allow-listed fields)", R, (c) => c.find({ supplierSlug: "shree-textiles", status: "APPROVED", deletedAt: null }, { projection: { supplierSlug: 1, displayName: 1, rating: 1, title: 1, text: 1, categoryRatings: 1, wouldRecommend: 1, verifiedBuyer: 1, publishedAt: 1 } }).limit(2000), "supplierSlug_1_status_1_publishedAt_-1"));
  rows.push(await explain("reviews: headline (ratings only)", R, (c) => c.find({ supplierSlug: "shree-textiles", status: "APPROVED", deletedAt: null }, { projection: { rating: 1, publishedAt: 1 } }).limit(2000), "supplierSlug_1_status_1_publishedAt_-1"));
  rows.push(await explain("reviews: a buyer's own review of one supplier", R, (c) => c.find({ buyerId: s.buyer, supplierSlug: "shree-textiles", deletedAt: null, active: true }).limit(1), "buyerId_1_supplierSlug_1"));
  rows.push(await explain("reviews: a buyer's list, newest first", R, (c) => c.find({ buyerId: s.buyer, deletedAt: null }).sort({ createdAt: -1 }).limit(200), "buyerId_1_createdAt_-1"));
  const C = "certifications";
  rows.push(await explain("certifications: public list of one supplier (up to 500)", C, (c) => c.find({ supplierSlug: "shree-textiles", verificationStatus: { $in: ["VERIFIED", "EXPIRED"] }, deletedAt: null }).limit(500), "supplierSlug_1_verificationStatus_1"));
  const I = "inquiries";
  rows.push(await explain("inquiries: by reference (confirmation page)", I, (c) => c.find({ reference: s.firstRef }).limit(1), "reference_1"));
  rows.push(await explain("inquiries: by idempotency key (retry check)", I, (c) => c.find({ idempotencyKey: "perfkey0000000007abcdef" }).limit(1), "idempotencyKey_1"));
  rows.push(await explain("inquiries: buyer's list, newest first (limit 100)", I, (c) => c.find({ buyerId: s.buyer }).sort({ createdAt: -1 }).limit(100), "buyerId_1_createdAt_-1"));
  rows.push(await explain("inquiries: buyer duplicate check (supplier, product, quantity, last 10 minutes)", I, (c) => c.find({ buyerId: s.buyer, supplierKey: "shree-textiles", productKey: null, quantity: 5, createdAt: { $gte: new Date(Date.now() - 600000) } }).limit(1), "buyerId_1_createdAt_-1"));
  rows.push(await explain("inquiries: guest duplicate check (same email, supplier, quantity, last 10 minutes)", I, (c) => c.find({ "guest.email": s.guestEmail, supplierKey: "shree-textiles", productKey: null, quantity: 5, createdAt: { $gte: new Date(Date.now() - 600000) } }).limit(1), "guest.email_1_createdAt_-1"));
  rows.push(await explain("inquiries: a supplier's newest (for the supplier inbox, not built yet)", I, (c) => c.find({ supplierKey: "shree-textiles" }).sort({ createdAt: -1 }).limit(20), "supplierKey_1_createdAt_-1"));
  for (const r of rows) console.log(`${r.collScan ? "COLLSCAN " : r.blockingSort ? "SORT     " : "ok       "} keys=${String(r.keysExamined).padStart(6)} docs=${String(r.docsExamined).padStart(6)} ret=${String(r.returned).padStart(5)} server=${String(r.serverMs).padStart(4)}ms wall=${String(r.wallMs).padStart(4)}ms  ${r.name}`);
  report.runs.push({ size, rows });
}
if (args.keep !== "true") {
  await db.collection("reviews").deleteMany({ __perf: true });
  await db.collection("certifications").deleteMany({ __perf: true });
  await db.collection("inquiries").deleteMany({ __perf: true });
}
fs.mkdirSync(OUT.replace(/[^/\\]+$/, ""), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\nwritten ${OUT}`);
await client.close();
