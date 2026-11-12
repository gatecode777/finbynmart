import { buyerGuard, json } from "@/lib/buyer/api";
import { signOutOtherDevices } from "@/lib/buyer/securitySessions";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST (no body): signs the buyer out of every OTHER device (the same service as Account Security, /api/buyer/security/sessions/revoke-others).
 * Registered sessions are revoked and counted, the account's session version is raised (which also ends cookies issued before the session
 * registry existed) and THIS device keeps its own session with a cookie for the new version.
 */
async function handlePOST(request: Request) {
  if (isCrossSiteWrite(request)) return json({ ok: false, message: "This request was not allowed." }, 403);
  const guard = await buyerGuard({ key: "buyer-signout-everywhere", limit: 5, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const result = await signOutOtherDevices(guard.user.id);
  if (!result.ok) return json({ ok: false, message: result.message, count: result.count }, 503);
  return json({ ok: true, count: result.count, message: "You were signed out of every other device. This device stays signed in." });
}

export const POST = withApiPerf("POST api/buyer/settings/sign-out-everywhere", handlePOST);
