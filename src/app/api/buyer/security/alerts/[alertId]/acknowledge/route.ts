import { ObjectId } from "mongodb";
import { supportGuard, json } from "@/lib/buyer/api";
import { acknowledgeAlert } from "@/lib/buyer/security";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { ALERT_ID } from "@/lib/security/securityRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** PATCH /api/buyer/security/alerts/<alertId>/acknowledge (no body): marks the buyer's OWN alert as seen. Repeating it keeps the first time. Another account's alert and an unknown id answer the same 404. */
async function handlePATCH(request: Request, { params }: { params: Promise<{ alertId: string }> }) {
  if (isCrossSiteWrite(request)) return json({ ok: false, message: "This request was not allowed." }, 403);
  const guard = await supportGuard({ key: "buyer-alert-ack", limit: 60, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const { alertId } = await params;
  if (!ALERT_ID.test(alertId)) return json({ ok: false, message: "That alert was not found." }, 404);
  try {
    const alert = await acknowledgeAlert(new ObjectId(guard.user.id), alertId);
    return alert ? json({ ok: true, data: { alert } }) : json({ ok: false, message: "That alert was not found." }, 404);
  } catch (error) {
    console.error("buyer alert acknowledge failed", (error as Error).message);
    return json({ ok: false, message: "The alert could not be updated. Please try again." }, 503);
  }
}

export const PATCH = withApiPerf("PATCH api/buyer/security/alerts/:alertId/acknowledge", handlePATCH);
