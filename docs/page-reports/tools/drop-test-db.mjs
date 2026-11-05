import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("R:/indiamartref/");
const { MongoClient } = require("mongodb");

// Safety: only ever drops the throwaway database, by exact name.
const TEST_DB = "finbynmart_test";
const env = Object.fromEntries(fs.readFileSync("R:/indiamartref/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === TEST_DB) throw new Error("Refusing: the configured live database is named like the test database.");
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const before = (await client.db(TEST_DB).listCollections().toArray()).map((c) => c.name);
await client.db(TEST_DB).dropDatabase();
const after = (await client.db().admin().listDatabases()).databases.map((d) => d.name);
console.log(`dropped ${TEST_DB} (collections were: ${before.join(", ") || "none"}); still present: ${after.includes(TEST_DB)}`);
await client.close();
