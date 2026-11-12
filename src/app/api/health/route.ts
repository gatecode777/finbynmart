import { NextResponse } from "next/server";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/health: liveness only. It says the server process is up and answering, nothing more: no database check, no version, no
 * configuration, no counts, so it is safe to expose to uptime monitors, load balancers and tooling. It is never cached. (Something outside
 * the application was already calling this address and getting a 404.)
 */
async function handleGET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withApiPerf("GET api/health", handleGET);
