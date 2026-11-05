import { fail } from "@/lib/auth/http";
import { buyerGuard, json } from "@/lib/buyer/api";
import { markAllRead } from "@/lib/buyer/notifications";
import { parseNotificationQuery } from "@/lib/buyer/notificationRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** PATCH /api/buyer/notifications/read-all[?category=...] (no body): marks up to 200 of the signed-in buyer's unread notifications (of one category, or all) as read and says whether more remain (`more`), so the caller repeats. */
async function handlePATCH(request: Request) {
  const guard = await buyerGuard({ key: "buyer-notification-readall", limit: 300, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const category = new URL(request.url).searchParams.get("category") ?? undefined;
  const query = parseNotificationQuery({ category });
  if (!query.ok) return fail(query.error, 400, { category: query.error });
  const result = await markAllRead(guard.user.id, query.value.category);
  return json({ ok: true, message: result.changed === 0 ? "There was nothing unread." : "Marked as read.", data: result });
}

export const PATCH = withApiPerf("PATCH api/buyer/notifications/read-all", handlePATCH);
