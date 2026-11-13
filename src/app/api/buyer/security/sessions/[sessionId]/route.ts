import { supportGuard, json } from "@/lib/buyer/api";
import { revokeBuyerSession } from "@/lib/buyer/securitySessions";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { SESSION_PUBLIC_ID } from "@/lib/security/securityRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/buyer/security/sessions/<sessionId>: ends one of the buyer's OWN other sessions (a real revocation: that browser's next request is refused).
 * The id is the random public id from the list. Another account's session, an unknown id and a malformed id all answer the same 404; the session
 * in use cannot be ended here (409). 20 per buyer per 10 minutes; a request from another site is refused.
 */
async function handleDELETE(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (isCrossSiteWrite(request)) return json({ ok: false, message: "This request was not allowed." }, 403);
  const guard = await supportGuard({ key: "buyer-session-revoke", limit: 20, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const { sessionId } = await params;
  if (!SESSION_PUBLIC_ID.test(sessionId)) return json({ ok: false, message: "That session was not found." }, 404);
  try {
    const result = await revokeBuyerSession(guard.user.id, sessionId);
    if (!result.ok) return json({ ok: false, code: result.code, message: result.message }, result.code === "NOT_FOUND" ? 404 : 409);
    return json({ ok: true, message: `${result.deviceLabel} was signed out.` });
  } catch (error) {
    console.error("buyer session revoke failed", (error as Error).message);
    return json({ ok: false, message: "The session could not be ended. Nothing was changed. Please try again." }, 503);
  }
}

export const DELETE = withApiPerf("DELETE api/buyer/security/sessions/:sessionId", handleDELETE);
