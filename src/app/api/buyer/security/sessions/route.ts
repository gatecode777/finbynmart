import { supportGuard, json } from "@/lib/buyer/api";
import { getBuyerSessions } from "@/lib/buyer/securitySessions";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/security/sessions: the buyer's active sessions (never expired or revoked ones), the current one first and marked. Each has a random
 * public id, device label, creation and last-active time and "Unknown" for the region. No token, cookie, hash, IP address or User-Agent is returned.
 */
async function handleGET() {
  const guard = await supportGuard();
  if ("response" in guard) return guard.response;
  try {
    const answer = await getBuyerSessions(guard.user.id);
    return answer ? json({ ok: true, data: answer }) : json({ ok: false, message: "Not found." }, 404);
  } catch (error) {
    console.error("buyer sessions read failed", (error as Error).message);
    return json({ ok: false, message: "Your sessions could not be loaded." }, 503);
  }
}

export const GET = withApiPerf("GET api/buyer/security/sessions", handleGET);
