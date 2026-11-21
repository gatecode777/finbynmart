// Starts a THROWAWAY, in-memory, transaction-capable MongoDB (single-node replica set) for local verification. Nothing is persisted and the live database is never touched.
// run: node docs/page-reports/tools/test-db-up.mjs   (keeps running; writes the connection string to .test-db-uri, which is git-ignored; Ctrl+C or stop the process to discard everything)
import fs from "node:fs";
import { MongoMemoryReplSet } from "mongodb-memory-server";
const rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
fs.writeFileSync(new URL("../../../.test-db-uri", import.meta.url), rs.getUri());
console.log("test replica set up");
process.on("SIGINT", async () => { await rs.stop(); process.exit(0); });
setInterval(() => {}, 1 << 30);
