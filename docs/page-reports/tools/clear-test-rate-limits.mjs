import fs from "node:fs";
import { createRequire } from "node:module";

// Clears only the rate-limit counters of the throwaway test database (never the live one).
const require = createRequire("R:/indiamartref/");
const { MongoClient } = require("mongodb");
const TEST_DB = "finbynmart_test";
const env = Object.fromEntries(fs.readFileSync("R:/indiamartref/.env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
if (env.MONGODB_DB === TEST_DB) throw new Error("Refusing: the configured live database is named like the test database.");
const client = await new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).connect();
const result = await client.db(TEST_DB).collection("rate_limits").deleteMany({});
console.log(`cleared ${result.deletedCount} rate-limit counters in ${TEST_DB}`);
await client.close();
