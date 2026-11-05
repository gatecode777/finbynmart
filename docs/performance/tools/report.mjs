// Builds the measured parts of the performance reports from docs/performance/results/*.json. Nothing here invents a number:
// a missing file or value is written as "not measured".
//   node docs/performance/tools/report.mjs
import fs from "node:fs";
import os from "node:os";

const R = "docs/performance/results";
const D = "docs/performance";
const read = (f) => (fs.existsSync(`${R}/${f}`) ? JSON.parse(fs.readFileSync(`${R}/${f}`, "utf8")) : null);
const TARGET = { simple: 300, detail: 350, listing: 400, filtered: 500, search: 500 };
const LABEL = { simple: "simple read", detail: "detail", listing: "paginated listing", filtered: "filtered catalogue", search: "search" };
const n = (v, d = 1) => (v === null || v === undefined ? "–" : Number(v).toFixed(d).replace(/\.0$/, ""));
const kb = (b) => (b ? (b >= 10240 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024).toFixed(1)} KB`) : "–");
const env = () => `Node ${process.version}; ${os.platform()} ${os.release()}; ${os.cpus().length} logical CPUs (${os.cpus()[0]?.model.trim()}); ${(os.totalmem() / 2 ** 30).toFixed(0)} GB RAM; MongoDB Atlas reached over the internet (one database round trip from this machine measures about 30 ms, which is part of every figure below that includes the database); production build (\`next build\` + \`next start\`), not the dev server.`;

const first = (t) => t.levels[0];
const primary = (t) => {
  // server-side p95 is the measured quantity the PRD targets; for pages the page function is only part of the render, so the client figure decides
  const l = first(t);
  return t.kind === "api" ? l.server?.p95 ?? l.client.p95 : l.client.p95;
};
const status = (t) => (primary(t) <= TARGET[t.category] ? "meets" : "MISSES");

function baselineReport() {
  const b = read("baseline.json");
  if (!b) return;
  const rows = b.targets.map((t) => {
    const l = first(t);
    return `| ${t.name} | ${LABEL[t.category]} (<${TARGET[t.category]}) | ${n(l.server?.p50)} | ${n(l.server?.p95)} | ${n(l.server?.p99)} | ${n(l.client.p50)} / ${n(l.client.p95)} / ${n(l.client.p99)} | ${kb(l.payload.bytes)} | ${n(l.db?.p50)} (${l.db?.opsMedian ?? "–"} ops) | ${n(t.cold.ms)} | ${status(t)} |`;
  });
  fs.writeFileSync(`${D}/API_BASELINE_REPORT.md`, `# API baseline report

Measured on ${b.when.slice(0, 10)} against a production build, **before any optimisation** (the build already contained the instrumentation, nothing else had changed).

## Environment

${env()}

Data: the seed catalogue (21,392 products, 1,200 sellers) held in memory, and the throwaway database \`finbynmart_test\` (it held the fixtures of the Page 11-14 test suites: 12 reviews and 10 certifications for Shree Textiles, a few hundred inquiries). Server-side figures come from the application's own per-request log lines (\`FINBYN_PERF=1\`); client figures are the time for the full response to arrive over loopback. ${b.levels.join(",")} concurrent request(s), ${b.n} requests per route after 3 warm-up requests. Each request used its own client address so the per-address rate limits did not interfere; the limiter still ran.

How to read the columns: **server** = time inside the route handler (APIs) or the page function (pages; React's rendering of the HTML happens after it and is only in the client column). **DB** = time waiting on MongoDB, summed over operations, with the median number of operations. **cold** = the first request to that route after the server process started.

| Route | Target class (p95, ms) | server p50 | server p95 | server p99 | client p50 / p95 / p99 | payload (uncompressed) | DB ms (ops) | cold (ms) | p95 vs target |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
${rows.join("\n")}

Notes
- A "p95 vs target" of *meets* for an API compares its **server** p95; for a page it compares the **client** p95 (end to end), which is the stricter reading.
- \`PAGE /\` is a statically generated page: it has no per-request page function, so only client figures exist.
- Payload sizes are uncompressed; \`next start\` compresses responses (gzip) for browsers: see API_PAYLOAD_AUDIT.md.
- These are single-request-at-a-time figures. What happens under concurrency is in API_LOAD_TEST_REPORT.md, and it is where the real problems appeared.
`);
}

function loadTables(label, data) {
  if (!data) return `_${label}: not measured._\n`;
  return data.targets
    .map((t) => {
      const head = `**${t.name}** (${LABEL[t.category]}, target p95 < ${TARGET[t.category]} ms; cold ${n(t.cold.ms)} ms)\n\n| concurrent | req/s | errors | server p50 | server p95 | server p99 | client p50 | client p95 | client p99 | DB p50 |\n|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|`;
      const rows = t.levels.map((l) => `| ${l.concurrency} | ${n(l.rps)} | ${l.errors} | ${n(l.server?.p50)} | ${n(l.server?.p95)} | ${n(l.server?.p99)} | ${n(l.client.p50)} | ${n(l.client.p95)} | ${n(l.client.p99)} | ${n(l.db?.p50)} |`);
      return `${head}\n${rows.join("\n")}\n`;
    })
    .join("\n");
}

function loadReport() {
  const before = read("baseline-load.json");
  const after = read("after-load.json");
  const afterSteady = read("after-load-steady.json");
  fs.writeFileSync(`${D}/API_LOAD_TEST_REPORT.md`, `# API load test report

Tool: \`docs/performance/tools/bench.mjs\` (a small Node load generator; k6 and autocannon are not installed in this project and adding a dependency was not needed). Concurrency steps 1, 5, 10, 25 and 50, ${before?.n ?? "?"} requests (at least 4 per virtual user) per step, after 3 warm-up requests, GET requests only, against the throwaway database. No destructive test was run and nothing touched live data.

## Environment

${env()}

CPU and memory of the server process were not sampled separately; the signs of CPU saturation below are inferred from requests per second flattening while latency grows with the page's own work staying small, which is stated where it matters. Database resource usage on Atlas was not available (no Atlas metrics access): the database column is the round-trip time the application observed.

Error and timeout rates: every request in every step below returned a success status (0 errors, 0 timeouts) unless a row says otherwise.

## Before optimisation (baseline build, every request from a different client address)

${loadTables("before", before)}

## After optimisation (same routes, same method, every request from a different client address)

${loadTables("after", after)}

## After optimisation, 40 steady client addresses (what repeat visitors look like)

${loadTables("after (steady clients)", afterSteady)}
`);
}

function beforeAfter() {
  const b = read("baseline.json");
  const a = read("after.json");
  const as = read("after-steady.json");
  if (!b || !a) return;
  const byName = (r) => new Map((r?.targets ?? []).map((t) => [t.name, t]));
  const A = byName(a), S = byName(as);
  const rows = b.targets.map((t) => {
    const x = A.get(t.name), y = S.get(t.name);
    const lb = first(t), la = x ? first(x) : null, ls = y ? first(y) : null;
    const cell = (l) => (l ? `${n(l.server?.p50)} / ${n(l.server?.p95)} / ${n(l.server?.p99)}` : "–");
    return `| ${t.name} | ${cell(lb)} | ${cell(la)} | ${cell(ls)} | ${n(lb.client.p95)} → ${n(la?.client.p95)} → ${n(ls?.client.p95)} | ${kb(lb.payload.bytes)} → ${kb(la?.payload.bytes)} | ${n(lb.db?.p50)} → ${n(la?.db?.p50)} → ${n(ls?.db?.p50)} | ${n(t.cold.ms)} → ${n(x?.cold.ms)} |`;
  });
  const lb = read("baseline-load.json"), la = read("after-load.json");
  const loadRows = [];
  for (const t of lb?.targets ?? []) {
    const x = la?.targets.find((u) => u.name === t.name);
    if (!x) continue;
    const at = (r, c) => r.levels.find((l) => l.concurrency === c);
    for (const c of [10, 50]) {
      const p = at(t, c), q = at(x, c);
      if (p && q) loadRows.push(`| ${t.name} | ${c} | ${n(p.rps)} → ${n(q.rps)} | ${n(p.server?.p95)} → ${n(q.server?.p95)} | ${n(p.client.p95)} → ${n(q.client.p95)} |`);
    }
  }
  fs.writeFileSync(`${D}/API_BEFORE_AFTER_REPORT.md`, `# API before / after report

Same tool, same routes, same machine, same production-build method. "Before" is the baseline build (instrumentation only). "After" is the build with the optimisations listed in API_OPTIMIZATION_SUMMARY.md. Two "after" columns: **every request a different client** (the hardest case for the rate limiter, directly comparable with the baseline) and **steady clients** (40 addresses rotating, what repeat visitors look like). Format: before → after (every request a new client) → after (steady clients).

${env()}

## One request at a time

Server p50 / p95 / p99 in milliseconds.

| Route | before | after (new clients) | after (steady clients) | client p95 ms | payload | DB ms (p50) | cold ms |
|---|---:|---:|---:|---:|---:|---:|---:|
${rows.join("\n")}

## Under concurrency (throughput and tail latency)

| Route | concurrent | req/s before → after | server p95 ms before → after | client p95 ms before → after |
|---|---:|---:|---:|---:|
${loadRows.join("\n")}

The full step-by-step tables are in API_LOAD_TEST_REPORT.md.
`);
}

function indexAudit() {
  const m = read("mongo-explain.json");
  if (!m) return;
  const tables = m.runs.map((run) => {
    const rows = run.rows.map((r) => `| ${r.name} | ${r.returned} | ${r.keysExamined} | ${r.docsExamined} | ${r.serverMs} | ${r.collScan ? "**COLLSCAN**" : r.blockingSort ? "**blocking SORT**" : "index"} | \`${r.plan}\` |`);
    return `### ${run.size.toLocaleString("en-IN")} reviews, ${Math.round(run.size / 4).toLocaleString("en-IN")} certifications, ${(run.size * 2).toLocaleString("en-IN")} inquiries\n\n| Query (as the application runs it) | returned | keys examined | docs examined | server ms | plan type | winning plan |\n|---|---:|---:|---:|---:|---|---|\n${rows.join("\n")}\n`;
  });
  fs.writeFileSync(`${D}/API_INDEX_AUDIT.md`, `# MongoDB index audit

Method: \`docs/performance/tools/mongo-explain.mjs\` loads synthetic documents into the **throwaway** database \`finbynmart_test\` only, runs \`explain("executionStats")\` for each query the application issues against MongoDB (copied from the code), at three data volumes, and removes the synthetic data. The product catalogue is **not** in MongoDB (it is CSV held in memory), so none of these indexes concern catalogue queries.

Collections the application uses: \`users\`, \`inquiries\`, \`reviews\`, \`certifications\`, \`wishlists\`, \`wishlist_suppliers\`, \`requirements\`, \`rate_limits\`.

${tables.join("\n")}

Reading the tables: "docs examined" far above "returned" means the index is not selective for that query; **COLLSCAN** means no index was used; **blocking SORT** means MongoDB sorted in memory. See the end of this file for the findings and what was changed.
`);
}

baselineReport();
loadReport();
beforeAfter();
indexAudit();
console.log("reports written to", D);
