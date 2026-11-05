import { buyerGuard, json } from "@/lib/buyer/api";
import { countUnread } from "@/lib/buyer/notifications";
import { UNREAD_COUNT_CAP } from "@/lib/buyer/notificationRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET: how many unread notifications the signed-in buyer has, counted up to the cap (the badge shows "99+" at the cap). */
async function handleGET() {
  const guard = await buyerGuard();
  if ("response" in guard) return guard.response;
  const unread = await countUnread(guard.user.id);
  return json({ ok: true, data: { unread, capped: unread >= UNREAD_COUNT_CAP } });
}

export const GET = withApiPerf("GET api/buyer/notifications/unread-count", handleGET);
