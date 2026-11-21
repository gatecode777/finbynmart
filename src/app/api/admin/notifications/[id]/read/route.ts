import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { markRead } from "@/lib/admin/notifications";
import { isEventId } from "@/lib/admin/notificationRules";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/notifications/<id>/read (capability notifications.read; no body is read). Records this administrator's own receipt, idempotently, with a server timestamp; only for an event
 * whose capability the administrator holds now. Unknown, malformed and unauthorized ids are the same 404. It changes nothing about the related task and nothing for any other administrator.
 * Returns the authoritative unread count.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("notifications.read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!isEventId(id)) return NextResponse.json({ ok: false, message: "Notification not found." }, { status: 404, headers: NO_STORE });
  const limit = await rateLimit(`admin-notifications-write:${guard.user.id}`, 300, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  try {
    const r = await markRead(new ObjectId(guard.user.id), guard.permissions, id);
    return r.ok ? NextResponse.json({ ok: true, data: { unreadCount: r.unreadCount } }, { headers: NO_STORE }) : NextResponse.json({ ok: false, message: "Notification not found." }, { status: 404, headers: NO_STORE });
  } catch (error) {
    console.error("admin notification read failed", (error as Error).message);
    return fail("The notification could not be marked as read. Nothing was changed. Please try again.", 503);
  }
}
