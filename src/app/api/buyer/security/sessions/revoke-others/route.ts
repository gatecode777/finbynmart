import { buyerGuard, json } from "@/lib/buyer/api";
import { signOutOtherDevices } from "@/lib/buyer/securitySessions";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/buyer/security/sessions/revoke-others (no body): signs the buyer out of every other device. The answer carries the real number of
 * sessions ended. This device keeps its own session. 5 per buyer per 10 minutes; a request from another site is refused.
 */
async function handlePOST(request: Request) {
  if (isCrossSiteWrite(request)) return json({ ok: false, message: "This request was not allowed." }, 403);
  const guard = await buyerGuard({ key: "buyer-signout-everywhere", limit: 5, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  try {
    const result = await signOutOtherDevices(guard.user.id);
    if (!result.ok) return json({ ok: false, message: result.message, count: result.count }, 503);
    return json({ ok: true, count: result.count, message: result.count === 0 ? "There were no other signed-in devices. Sessions started before session tracking were also ended." : `${result.count} other ${result.count === 1 ? "device was" : "devices were"} signed out. This device stays signed in.` });
  } catch (error) {
    console.error("buyer sign out others failed", (error as Error).message);
    return json({ ok: false, message: "Other devices could not be signed out. Please try again." }, 503);
  }
}

export const POST = withApiPerf("POST api/buyer/security/sessions/revoke-others", handlePOST);
