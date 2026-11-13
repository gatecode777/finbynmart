// Starts a LOCAL, throwaway, single-node MongoDB replica set for the integration tests (transactions need a replica set).
// It does NOT install MongoDB: it needs a `mongod` you already have (MONGOD_BIN or on PATH). It binds to 127.0.0.1 only, uses a data folder inside the
// repository (.test-mongo, git-ignored) and has no credentials because it is unreachable from other machines. Keep this terminal open while testing.
//   node docs/page-reports/tools/start-test-replset.mjs
// It prints the variable NAMES and a loopback URI to use with it-guard.mjs (nothing secret).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

const root = path.resolve(import.meta.dirname, "../../..");
const bin = process.env.MONGOD_BIN || "mongod";
const port = Number(process.env.TEST_MONGO_PORT || 27018);
const dbpath = path.join(root, ".test-mongo", `rs-${port}`);
fs.mkdirSync(dbpath, { recursive: true });

const child = spawn(bin, ["--replSet", "finbyn_it_rs", "--port", String(port), "--bind_ip", "127.0.0.1", "--dbpath", dbpath, "--quiet"], { stdio: ["ignore", "inherit", "inherit"] });
// the process identity is recorded (git-ignored folder) so cleanup can verify it before stopping anything
const pidFile = path.join(root, ".test-mongo", `rs-${port}.pid`);
if (child.pid) fs.writeFileSync(pidFile, JSON.stringify({ pid: child.pid, bin, port, dbpath, startedAt: new Date().toISOString() }));
child.on("exit", () => fs.rmSync(pidFile, { force: true }));
child.on("error", (e) => { console.error(`Could not start "${bin}": ${e.message}\nInstall MongoDB Community Server, or set MONGOD_BIN to the full path of mongod.`); process.exit(1); });
process.on("SIGINT", () => { child.kill(); fs.rmSync(pidFile, { force: true }); process.exit(0); });

const uri = `mongodb://127.0.0.1:${port}/?replicaSet=finbyn_it_rs&directConnection=true`;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const c = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 800 });
  try {
    await c.connect();
    try { await c.db("admin").command({ replSetInitiate: { _id: "finbyn_it_rs", members: [{ _id: 0, host: `127.0.0.1:${port}` }] } }); } catch (e) { if (!/already initialized/i.test(e.message)) throw e; }
    await c.close();
    console.log("\nReplica set ready. In another terminal run the suite with:");
    console.log(`  FINBYN_TEST_MODE=1 TEST_MONGODB_URI="${uri}" TEST_MONGODB_DB=finbyn_it_supplier TEST_DB_CONFIRM=finbyn_it_supplier \\`);
    console.log("    node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-supplier-flows.mjs");
    console.log(`PowerShell:  $env:FINBYN_TEST_MODE="1"; $env:TEST_MONGODB_URI="${uri}"; $env:TEST_MONGODB_DB="finbyn_it_supplier"; $env:TEST_DB_CONFIRM="finbyn_it_supplier"; node docs/page-reports/tools/run-integration-suites.mjs`);
console.log("Ctrl+C stops the database. The process identity is in .test-mongo/rs-<port>.pid.");
    break;
  } catch { await c.close().catch(() => {}); }
}
