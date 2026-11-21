// INTEGRATION test (writes to a database): Recently Viewed (Page 32): one row per buyer and product under concurrent recording, newest-first order, cursor pagination with ties, the
// RECENT_CAP trim (including concurrent recording around the cap), ownership isolation for list / remove / clear, idempotent remove and clear. Runs ONLY against an explicitly configured,
// transaction-capable, isolated test database (it-guard.mjs). NOT run in the build environment.
//   FINBYN_TEST_MODE=1 TEST_MONGODB_URI=... TEST_MONGODB_DB=finbyn_it_recent TEST_DB_CONFIRM=finbyn_it_recent AUTH_SECRET=<any test value> \
//     node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-recently-viewed.mjs
// HTTP-level behaviour (401 / 403 by role, cross-site refusal, private caching) and the browser flow need signed-in sessions and are NOT covered here: see docs/page-designs/PAGE_32_RECENTLY_VIEWED.md.
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isolatedDb } from "./it-guard.mjs";

const t = await isolatedDb();
process.env.AUTH_SECRET ??= "integration-test-secret-integration";
const S = await import("../../../src/lib/recentlyViewed/service.ts");
const R = await import("../../../src/lib/recentlyViewed/rules.ts");
const col = await S.recentCollection();
const a = new ObjectId().toHexString(), b = new ObjectId().toHexString();
const mine = (u) => col.countDocuments({ userId: new ObjectId(u) });
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log("PASS ", name); };

await check("recording creates one entry, repeats keep one row and move it to the top", async () => {
  await S.recordView(a, "1001", new Date(Date.now() - 5000));
  await S.recordView(a, "1002", new Date(Date.now() - 4000));
  await S.recordView(a, "1001", new Date());
  assert.equal(await mine(a), 2);
  const page = await S.listRecent(a, null);
  assert.deepEqual(page.items.map((i) => i.key), ["1001", "1002"]);
});
await check("an older late write never moves an entry backwards ($max)", async () => {
  await S.recordView(a, "1002", new Date(Date.now() - 600_000));
  assert.equal((await S.listRecent(a, null)).items[0].key, "1001");
  const row = await col.findOne({ userId: new ObjectId(a), productKey: "1002" });
  assert.ok(row.lastViewedAt.getTime() > Date.now() - 100_000);
});
await check("25 simultaneous views of one product make exactly one row", async () => {
  await Promise.all(Array.from({ length: 25 }, () => S.recordView(a, "2000")));
  assert.equal(await col.countDocuments({ userId: new ObjectId(a), productKey: "2000" }), 1);
});
await check("the stored row holds only buyer, key and time", async () => {
  const row = await col.findOne({ userId: new ObjectId(a), productKey: "2000" });
  assert.deepEqual(Object.keys(row).sort(), ["_id", "lastViewedAt", "productKey", "userId"]);
});
await check("two buyers cannot see, remove or clear each other's entries", async () => {
  await S.recordView(b, "1001");
  const mineA = (await S.listRecent(a, null)).items, mineB = (await S.listRecent(b, null)).items;
  assert.equal(mineB.length, 1);
  await S.removeEntry(b, mineA[0].id); // A's entry id used by B: removes nothing
  assert.equal(await mine(a), 3);
  await S.clearHistory(b);
  assert.equal(await mine(b), 0);
  assert.equal(await mine(a), 3);
});
await check("remove is idempotent and clear is idempotent", async () => {
  const id = (await S.listRecent(a, null)).items[0].id;
  await S.removeEntry(a, id); await S.removeEntry(a, id);
  assert.equal(await mine(a), 2);
  await S.clearHistory(a); await S.clearHistory(a);
  assert.equal(await mine(a), 0);
});
await check("an entry can be recreated by a later genuine view after removal or clear", async () => {
  await S.recordView(a, "1001");
  assert.equal(await mine(a), 1);
  await S.clearHistory(a);
});
await check("cursor pagination: newest first, deterministic ties, no duplicate or missing entry across pages", async () => {
  const same = new Date();
  await col.insertMany(Array.from({ length: 45 }, (_, i) => ({ userId: new ObjectId(a), productKey: `p${i}`, lastViewedAt: i < 30 ? same : new Date(same.getTime() - i * 1000) })));
  const seen = []; let cursor = null, pages = 0;
  do { const p = await S.listRecent(a, cursor, 20); seen.push(...p.items.map((i) => i.id)); cursor = p.nextCursor ? R.decodeCursor(p.nextCursor) : null; pages++; } while (cursor && pages < 10);
  assert.equal(pages, 3); assert.equal(seen.length, 45); assert.equal(new Set(seen).size, 45);
  const all = await col.find({ userId: new ObjectId(a) }).sort({ lastViewedAt: -1, _id: -1 }).toArray();
  assert.deepEqual(seen, all.map((r) => r._id.toHexString()));
  await S.clearHistory(a);
});
await check("the cap keeps the newest RECENT_CAP entries and trims the oldest", async () => {
  for (let i = 0; i < R.RECENT_CAP + 5; i++) await S.recordView(a, `c${i}`, new Date(Date.now() - (R.RECENT_CAP + 5 - i) * 1000));
  assert.equal(await mine(a), R.RECENT_CAP);
  assert.equal(await col.countDocuments({ userId: new ObjectId(a), productKey: { $in: ["c0", "c1", "c2", "c3", "c4"] } }), 0);
  assert.ok(await col.findOne({ userId: new ObjectId(a), productKey: `c${R.RECENT_CAP + 4}` }));
});
await check("concurrent recording around the cap: never fewer than the cap, a later record restores the bound, and the unique index still holds", async () => {
  await Promise.all(Array.from({ length: 30 }, (_, i) => S.recordView(a, `n${i}`)));
  assert.ok((await mine(a)) >= R.RECENT_CAP);
  await S.recordView(a, "settle");
  assert.equal(await mine(a), R.RECENT_CAP);
  const dup = await col.aggregate([{ $match: { userId: new ObjectId(a) } }, { $group: { _id: "$productKey", n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).toArray();
  assert.equal(dup.length, 0);
});
await check("the listing and cap queries use the indexes (no collection scan)", async () => {
  const plan = await col.find({ userId: new ObjectId(a) }).sort({ lastViewedAt: -1, _id: -1 }).limit(21).explain("queryPlanner");
  assert.ok(!JSON.stringify(plan).includes("COLLSCAN") && JSON.stringify(plan).includes("recent_newest"));
});

await S.clearHistory(a); await S.clearHistory(b);
await t.client.close();
console.log(`\n${passed} passed, 0 failed`);
process.exit(0);
