import { buyerGuard, json } from "@/lib/buyer/api";
import { markRead } from "@/lib/buyer/notifications";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** PATCH (no body): marks one of the signed-in buyer's notifications as read. Another buyer's id, an unknown id and a malformed id all answer 404. */
async function handlePATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await buyerGuard({ key: "buyer-notification-write", limit: 120, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const result = await markRead(guard.user.id, (await params).id);
  if (!result) return json({ ok: false, message: "Notification not found." }, 404);
  return json({ ok: true, message: "Marked as read.", data: result });
}

export const PATCH = withApiPerf("PATCH api/buyer/notifications/id/read", handlePATCH);
