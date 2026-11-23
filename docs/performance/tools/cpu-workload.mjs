// Repeatable HTTP workload for comparing server CPU before/after a change (run against `next start` of a production build with a THROWAWAY database).
// Prints wall ms per route; read the server process CPU time before and after (see docs/performance/FLUID_CPU_AUDIT.md). run: BASE=http://localhost:3100 node docs/performance/tools/cpu-workload.mjs
const BASE = process.env.BASE ?? "http://localhost:3100";
const PLAN = [["/", 40], ["/help", 40], ["/about-us", 20], ["/buyer-guide", 20], ["/products", 20], ["/categories/apparel-fashion", 20], ["/categories", 20], ["/api/auth/me", 60], ["/robots.txt", 5]];
for (const [path, count] of PLAN) {
  const t = performance.now(); let bad = 0;
  for (let i = 0; i < count; i++) { const r = await fetch(BASE + path, { headers: { "user-agent": "cpu-workload" } }); await r.arrayBuffer(); if (r.status >= 500) bad++; }
  console.log(`${path.padEnd(32)} x${String(count).padEnd(3)} ${((performance.now() - t) / count).toFixed(1)} ms/req${bad ? `  (${bad} 5xx)` : ""}`);
}
