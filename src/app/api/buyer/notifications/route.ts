import { fail } from "@/lib/auth/http";
import { buyerGuard, json } from "@/lib/buyer/api";
import { listNotifications } from "@/lib/buyer/notifications";
import { parseNotificationQuery } from "@/lib/buyer/notificationRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/notifications?category=all|inquiries|company|account&status=all|unread|read&page=&limit=
 * The signed-in buyer's own notifications, newest first, 20 a page (at most 50). A buyerId parameter is never read.
 */
async function handleGET(request: Request) {
  const guard = await buyerGuard();
  if ("response" in guard) return guard.response;
  const params = new URL(request.url).searchParams;
  const query = parseNotificationQuery({ category: params.get("category") ?? undefined, status: params.get("status") ?? undefined, page: params.get("page") ?? undefined, limit: params.get("limit") ?? undefined });
  if (!query.ok) return fail(query.error, 400, { query: query.error });
  return json({ ok: true, data: await listNotifications(guard.user.id, query.value) });
}

export const GET = withApiPerf("GET api/buyer/notifications", handleGET);
