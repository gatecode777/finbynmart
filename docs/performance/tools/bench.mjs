// Load and latency benchmark for the Finbyn Mart routes. No dependency beyond Node.
//
//   node docs/performance/tools/bench.mjs --label before --levels 1,5,10,25,50 --n 200 [--only products] [--log <server log>]
//
// Needs a running `next start` (BASE, default :3100) built from the code under test and started with FINBYN_PERF=1, so
// the server writes one JSON line per request (route, total ms, database ms, database operations). The server's own
// numbers are what the targets in the performance PRD refer to; the client numbers below add the loopback hop and the
// body download. Each request carries its own X-Forwarded-For (a pool of 4,000 addresses), so the per-address rate limits
// (which the application keeps) do not turn a load test into a wall of 429s: the limiter still runs and writes on every call.
//
// It only issues GET requests to public pages and APIs. It writes nothing and needs no cookie.
import fs from "node:fs";
import { TARGETS } from "./targets.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, token, i, all) => (token.startsWith("--") ? [...acc, [token.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]] : acc), []));
const BASE = process.env.BASE || args.base || "http://localhost:3100";
const LOG = args.log || process.env.FINBYN_LOG || "C:/Users/busin/AppData/Local/Temp/finbyn-test-server.log";
const LEVELS = (args.levels || "1").split(",").map(Number);
const N = Number(args.n || 100);
const WARM = Number(args.warm || 3);
const LABEL = args.label || "run";
const ONLY = args.only;
const OUT = args.out || `docs/performance/results/${LABEL}.json`;

// --ips N: how many distinct client addresses the requests rotate through (4,000 = nearly every request is a new visitor, the
// hardest case for the rate limiter; 40 = a few steady visitors).
const IPS = Number(args.ips || 4000);
const pool = Array.from({ length: IPS }, (_, i) => `10.${(i >> 8) & 255}.${i & 255}.${1 + (i % 250)}`);
let cursor = Math.floor(Math.random() * pool.length);
const nextIp = () => pool[cursor++ % pool.length];

const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] : null);
const round = (v) => (v === null ? null : Math.round(v * 10) / 10);

async function one(path) {
  const t0 = performance.now();
  let status = 0, bytes = 0, headers = {};
  try {
    const response = await fetch(BASE + path, { headers: { "x-forwarded-for": nextIp(), accept: "text/html,application/json", "accept-encoding": "identity" }, redirect: "manual" });
    status = response.status;
    headers = { cache: response.headers.get("cache-control"), timing: response.headers.get("server-timing") };
    bytes = (await response.arrayBuffer()).byteLength;
  } catch {
    status = 0;
  }
  return { ms: performance.now() - t0, status, bytes, ...headers };
}

function readLog(offset) {
  if (!fs.existsSync(LOG)) return { lines: [], size: 0 };
  const size = fs.statSync(LOG).size;
  if (size <= offset) return { lines: [], size };
  const fd = fs.openSync(LOG, "r");
  const buffer = Buffer.alloc(size - offset);
  fs.readSync(fd, buffer, 0, buffer.length, offset);
  fs.closeSync(fd);
  const lines = buffer.toString("utf8").split(/\r?\n/).filter((l) => l.startsWith('{"type":"perf"') || l.startsWith('{"type":"slow_route"')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return { lines, size };
}

async function runLevel(target, concurrency, total) {
  const logStart = fs.existsSync(LOG) ? fs.statSync(LOG).size : 0;
  const results = [];
  let issued = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (issued < total) {
      issued++;
      results.push(await one(target.path));
    }
  }));
  const wall = (performance.now() - started) / 1000;
  await new Promise((r) => setTimeout(r, 400));
  const { lines } = readLog(logStart);
  const mine = lines.filter((l) => l.kind === target.kind);
  const client = results.map((r) => r.ms).sort((a, b) => a - b);
  const server = mine.map((l) => l.totalMs).sort((a, b) => a - b);
  const db = mine.map((l) => l.dbMs).sort((a, b) => a - b);
  const ops = mine.map((l) => l.dbOps);
  const statuses = results.reduce((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
  const ok = results.filter((r) => r.status >= 200 && r.status < 400).length;
  return {
    concurrency,
    requests: results.length,
    rps: round(results.length / wall),
    errors: results.length - ok,
    statuses,
    client: { p50: round(percentile(client, 50)), p95: round(percentile(client, 95)), p99: round(percentile(client, 99)), max: round(client.at(-1)) },
    server: server.length ? { n: server.length, p50: round(percentile(server, 50)), p95: round(percentile(server, 95)), p99: round(percentile(server, 99)), max: round(server.at(-1)) } : null,
    db: db.length ? { p50: round(percentile(db, 50)), p95: round(percentile(db, 95)), opsMedian: ops.sort((a, b) => a - b)[Math.floor(ops.length / 2)] } : null,
    payload: { bytes: results[results.length - 1]?.bytes ?? 0 },
    cacheControl: results[0]?.cache ?? null,
  };
}

// --only a|b|c keeps the targets whose name or path contains any of the pieces
const pieces = ONLY ? ONLY.split("|") : null;
const targets = TARGETS.filter((t) => !pieces || pieces.some((p) => t.name.includes(p) || t.path.includes(p)));
const report = { label: LABEL, base: BASE, when: new Date().toISOString(), node: process.version, n: N, levels: LEVELS, targets: [] };
for (const target of targets) {
  // The first request after a start is the cold one: it is recorded on its own, then a few warm-ups, then the measured runs.
  const cold = await one(target.path);
  for (let i = 0; i < WARM; i++) await one(target.path);
  const levels = [];
  for (const level of LEVELS) levels.push(await runLevel(target, level, Math.max(N, level * 4)));
  report.targets.push({ name: target.name, path: target.path, kind: target.kind, category: target.category, cold: { ms: round(cold.ms), status: cold.status }, levels });
  const first = levels[0];
  console.log(`${target.name.padEnd(46)} c=${LEVELS[0]} server p50=${first.server?.p50 ?? "-"} p95=${first.server?.p95 ?? "-"} db p50=${first.db?.p50 ?? "-"} (${first.db?.opsMedian ?? "-"} ops) client p95=${first.client.p95} ${first.payload.bytes}B status=${JSON.stringify(first.statuses)}`);
}
fs.mkdirSync(OUT.replace(/[^/\\]+$/, ""), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\nwritten ${OUT}`);
