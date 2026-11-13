// Fail-closed guard for every integration test that WRITES to a database. Import it first:  import { isolatedDb } from "./it-guard.mjs";
// It refuses to continue unless ALL of these hold (a database name containing "test" is never enough):
//   1. FINBYN_TEST_MODE=1
//   2. TEST_MONGODB_URI and TEST_MONGODB_DB are set (there is NO fallback to MONGODB_URI / MONGODB_DB)
//   3. TEST_DB_CONFIRM equals TEST_MONGODB_DB (a deliberate second confirmation)
//   4. the test database name matches ^finbyn_it_[a-z0-9_]{4,40}$
//   5. neither the URI nor the database equals the production configuration (read from the process environment AND from .env.local)
//   6. the server is transaction-capable (replica set or mongos), because the code under test uses transactions
// Cleanup is restricted to documents carrying this run's fixture tag.
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

const root = path.resolve(import.meta.dirname, "../../..");
const fail = (m) => { console.error(`REFUSING TO RUN: ${m}`); process.exit(2); };

function productionConfig() {
  const out = { uris: new Set(), dbs: new Set() };
  if (process.env.MONGODB_URI) out.uris.add(process.env.MONGODB_URI);
  if (process.env.MONGODB_DB) out.dbs.add(process.env.MONGODB_DB);
  try {
    const text = fs.readFileSync(path.join(root, ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(MONGODB_URI|MONGODB_DB)\s*=\s*(.*)$/.exec(line);
      if (m) (m[1] === "MONGODB_URI" ? out.uris : out.dbs).add(m[2].trim().replace(/^["']|["']$/g, ""));
    }
  } catch { /* no .env.local: only the process environment is compared */ }
  return out;
}
const hostsOf = (uri) => { try { return new URL(uri.replace(/^mongodb(\+srv)?:/, "http:")).host.split(",").map((h) => h.toLowerCase()); } catch { return [uri]; } };

export async function isolatedDb() {
  if (process.env.FINBYN_TEST_MODE !== "1") fail("set FINBYN_TEST_MODE=1");
  const uri = process.env.TEST_MONGODB_URI, db = process.env.TEST_MONGODB_DB;
  if (!uri || !db) fail("set TEST_MONGODB_URI and TEST_MONGODB_DB (no fallback to the ordinary variables exists)");
  if (process.env.TEST_DB_CONFIRM !== db) fail("set TEST_DB_CONFIRM to the exact test database name");
  if (!/^finbyn_it_[a-z0-9_]{4,40}$/.test(db)) fail("the test database name must match finbyn_it_<letters/digits/_>");
  const prod = productionConfig();
  if (prod.uris.has(uri) || prod.dbs.has(db)) fail("the test URI or database equals the production configuration");
  const prodHosts = new Set([...prod.uris].flatMap(hostsOf));
  if (hostsOf(uri).some((h) => prodHosts.has(h))) fail("the test server host is the production host");
  const client = new MongoClient(uri);
  await client.connect();
  const hello = await client.db("admin").command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid") { await client.close(); fail("the test server is not transaction-capable (needs a replica set or mongos)"); }
  // the application code under test reads these
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = db;
  const runId = `it-${Date.now().toString(36)}`;
  return {
    client, db: client.db(db), runId,
    /** Every fixture document must carry this tag so cleanup can never touch anything else. */
    tag: (doc) => ({ ...doc, _fixture: runId }),
    cleanup: async (collections) => { for (const c of collections) await client.db(db).collection(c).deleteMany({ _fixture: runId }); await client.close(); },
  };
}
