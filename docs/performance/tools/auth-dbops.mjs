// Database operations behind one signed-in page view, counted by the MongoDB profiler of a THROWAWAY database (test-db-up.mjs + test-db-seed.mjs; the server must use the same URI/DB).
// run: BASE=http://localhost:3100 node docs/performance/tools/auth-dbops.mjs   (reads .test-db-uri; refuses anything but a 127.0.0.1 finbyn_it_* database)
import fs from "node:fs";
import { MongoClient } from "mongodb";
const BASE = process.env.BASE ?? "http://localhost:3100", PW = "Test-Passw0rd!x1", DB = process.env.MONGODB_DB ?? "finbyn_it_cpu";
const uri = fs.readFileSync(new URL("../../../.test-db-uri", import.meta.url), "utf8").trim();
if (!/^mongodb:\/\/127\.0\.0\.1[:/]/.test(uri) || !DB.startsWith("finbyn_it_")) throw new Error("refusing: not the local throwaway database");
const client = await new MongoClient(uri).connect(); const db = client.db(DB);
await db.command({ profile: 2 });
const login = async (email) => { const r = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email, password: PW }) }); return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; "); };
const PLAN = [["supplier@test.invalid", ["/supplier/dashboard", "/supplier/inquiries", "/supplier/quotations", "/supplier/products"]], ["buyer@test.invalid", ["/buyer/dashboard", "/buyer/inquiries", "/buyer/quotations"]], ["admin@test.invalid", ["/admin/dashboard", "/admin/inquiries"]]];
let total = 0;
for (const [email, paths] of PLAN) {
  const cookie = await login(email); if (!cookie) { console.log("login failed for", email.split("@")[0]); continue; }
  for (const path of paths) {
    await fetch(BASE + path, { headers: { cookie }, redirect: "manual" }).then((r) => r.arrayBuffer()); // warm: indexes, caches
    await db.command({ profile: 0 }); await db.collection("system.profile").drop().catch(() => {}); await db.command({ profile: 2 });
    const t = performance.now(); const r = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" }); await r.arrayBuffer(); const ms = performance.now() - t;
    await new Promise((res) => setTimeout(res, 300));
    const ops = (await db.collection("system.profile").find({ ns: { $not: /system\.profile/ }, op: { $in: ["query", "command", "update", "insert", "remove", "getmore"] } }).toArray()).filter((o) => o.command?.find || o.command?.aggregate || o.command?.update || o.command?.count || o.op === "query" || o.op === "update");
    const by = {}; for (const o of ops) { const c = o.ns.split(".").slice(1).join("."); by[c] = (by[c] ?? 0) + 1; }
    total += ops.length;
    console.log(`${email.split("@")[0].padEnd(9)} ${path.padEnd(24)} HTTP ${r.status} ${ms.toFixed(0).padStart(4)} ms  ${String(ops.length).padStart(2)} ops  ${Object.entries(by).map(([k, v]) => `${k}:${v}`).join(" ")}`);
  }
}
console.log("TOTAL ops over", PLAN.reduce((n, p) => n + p[1].length, 0), "page views:", total);
await db.command({ profile: 0 }); await client.close();
