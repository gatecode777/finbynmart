import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { listNotifications, unreadCount } from "@/lib/admin/notifications";
import { parseQuery } from "@/lib/admin/notificationRules";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/notifications?tab=all|unread&type=&cursor=&limit= (capability notifications.read). The inbox is the SESSION administrator's own; no admin id is ever read from the request.
 * Only events whose capability the administrator holds RIGHT NOW are listed or counted. `?count=1` returns just the total authorized unread count (the header bell): it is never filtered by
 * tab or type. A GET never writes a read receipt. Unknown parameters, tab, type, cursor or limit are a 422; responses are private, no-store.
 */
export async function GET(request: Request) {
  const guard = await requireAdminApi("notifications.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-notifications:${guard.user.id}`, 600, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const sp = new URL(request.url).searchParams;
  const admin = new ObjectId(guard.user.id);
  try {
    if (sp.get("count") === "1") {
      const keys = [...sp.keys()].filter((k) => k !== "count");
      if (keys.length) return NextResponse.json({ ok: false, message: "Check the request.", fields: Object.fromEntries(keys.map((k) => [k, "This parameter is not supported."])) }, { status: 422, headers: NO_STORE });
      return NextResponse.json({ ok: true, data: { unreadCount: await unreadCount(admin, guard.permissions) } }, { headers: NO_STORE });
    }
    const q = parseQuery((k) => sp.get(k), sp.keys());
    if (!q.ok) return NextResponse.json({ ok: false, message: "Check the request.", fields: q.fields }, { status: 422, headers: NO_STORE });
    return NextResponse.json({ ok: true, data: await listNotifications(admin, guard.permissions, q.value) }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin notifications read failed", (error as Error).message);
    return fail("The notifications could not be loaded. Please try again.", 503);
  }
}
