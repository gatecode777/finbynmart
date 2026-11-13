import { supportGuard, json } from "@/lib/buyer/api";
import { getBuyerSecurityOverview } from "@/lib/buyer/security";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/security/overview: the buyer's security status (with the criteria that produced it), two-step verification (not available), the number
 * of active sessions, open alerts, where the recorded login history starts, and what this server can really do (`capabilities`). Private, never cached.
 */
async function handleGET() {
  const guard = await supportGuard();
  if ("response" in guard) return guard.response;
  try {
    const overview = await getBuyerSecurityOverview(guard.user.id);
    return overview ? json({ ok: true, data: overview }) : json({ ok: false, message: "Not found." }, 404);
  } catch (error) {
    console.error("buyer security overview failed", (error as Error).message);
    return json({ ok: false, message: "Security information could not be loaded.", data: { status: "unavailable" } }, 503);
  }
}

export const GET = withApiPerf("GET api/buyer/security/overview", handleGET);
