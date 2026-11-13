# Isolated test environment (integration, concurrency, transaction tests)

**Rule:** no test that writes may touch the live database. `docs/page-reports/tools/it-guard.mjs` is fail-closed: it refuses to run unless ALL of these hold
(a database name containing "test" is never enough):

1. `FINBYN_TEST_MODE=1`
2. `TEST_MONGODB_URI` and `TEST_MONGODB_DB` are set. There is no fallback to `MONGODB_URI` / `MONGODB_DB`.
3. `TEST_DB_CONFIRM` equals `TEST_MONGODB_DB`.
4. the database name matches `finbyn_it_<letters/digits/_>`.
5. neither the URI nor the database equals the production configuration (compared with the process environment and with `.env.local`), and the host is not the production host.
6. the server is transaction-capable (a replica set or mongos), because the code under test uses transactions. A standalone `mongod` will be refused.

Cleanup deletes only documents tagged with the run's `_fixture` id.

## Setting one up (not done automatically)
Use a throwaway database with its own credentials and least privilege (readWrite on the `finbyn_it_*` database only):
- an Atlas free/shared cluster **separate from production** with a dedicated database user, or
- a local single-node replica set (`mongod --replSet rs0` then `rs.initiate()`), or a container with the same.

Then, from the repository root:
```
FINBYN_TEST_MODE=1 TEST_MONGODB_URI="<test uri>" TEST_MONGODB_DB=finbyn_it_supplier TEST_DB_CONFIRM=finbyn_it_supplier \
  node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-supplier-flows.mjs
```
`it-lead-distribution.mjs` (lead distribution, use `TEST_MONGODB_DB=finbyn_it_leads`) is run the same way: `node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-lead-distribution.mjs`; scenarios are listed in `docs/leads/TEST_REPORT.md`.

`it-supplier-flows.mjs` covers: concurrent seller linking (exactly one company wins), repeat link safety, one order per accepted quotation under concurrency,
idempotency-key conflict, another buyer's quotation, tracked reservation with insufficient-stock rollback. **It has not been run yet** (no isolated database was available when it was written).

For a browser/E2E server against the same database: `TEST_DB=finbyn_it_supplier bash docs/page-reports/tools/build-and-serve-test.sh`, then revert the `tsconfig.json` edit Next makes. Without a test database, point `MONGODB_URI` at an unreachable address (as the static runtime probes in the fix report did) so that any accidental database access fails fast instead of reaching the live data.

## Exact steps for THIS machine (Windows 11, PowerShell). Verified missing on 2026-11-13: mongod, mongosh, Docker, Podman; WSL is not installed; winget v1.29 is available; no TEST_MONGODB_* variables
The suites need ONE missing dependency: a MongoDB server that can run a replica set (transactions). The verification rounds installed nothing.
1. Install MongoDB Community Server (administrator PowerShell; it adds a Windows service you do not have to use): `winget install --id MongoDB.Server -e`. The binary is normally `C:\Program Files\MongoDB\Server\<version>\bin\mongod.exe`.
2. Start the throwaway replica set (a SECOND mongod: loopback only, port 27018, data in the git-ignored `.test-mongo\`; leave the window open):
   `$env:MONGOD_BIN="C:\Program Files\MongoDB\Server\<version>\bin\mongod.exe"; node docs/page-reports/tools/start-test-replset.mjs`
   It prints the exact URI and records the process id, command, port and data folder in `.test-mongo\rs-27018.pid`, so the process can be verified before it is stopped.
3. In another PowerShell window from the repository root run the preflight (no database needed), then all four suites. The URI comes from step 2 and holds no secret (loopback, no credentials):
   `node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/it-preflight.mjs`
   `$env:FINBYN_TEST_MODE="1"; $env:TEST_MONGODB_URI="<uri printed in step 2>"; $env:TEST_MONGODB_DB="finbyn_it_run"; $env:TEST_DB_CONFIRM="finbyn_it_run"; node docs/page-reports/tools/run-integration-suites.mjs`
   The runner gives each suite its own database (finbyn_it_supplier, _leads, _catalog, _conv), never reads MONGODB_URI or MONGODB_DB, and prints PASS, FAIL or BLOCKED per suite. One suite alone: set the variables and run `node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/<suite>.mjs`.
4. Cleanup: Ctrl+C in the step-2 window (or stop only the process whose id is in the pid file after checking its command line contains `--replSet finbyn_it_rs`), then delete `.test-mongo\`. Each suite removes only its own fixtures.
Alternative with no local install: a separate Atlas cluster used ONLY for tests (its host must differ from production; the guard refuses a production host, URI or database name).
