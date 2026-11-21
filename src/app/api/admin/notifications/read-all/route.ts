import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { markAllRead } from "@/lib/admin/notifications";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/notifications/read-all (capability notifications.read; no body is read). "Mark all currently authorized notifications as read": the server moves THIS administrator's cutoff to
 * the newest authorized event that exists now (independent of any tab or type filter). Newer events stay unread; other administrators are untouched; a repeat is a no-op. Returns the
 * authoritative unread count.
 */
export async function POST(request: Request) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("notifications.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-notifications-write:${guard.user.id}`, 300, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  try {
    return NextResponse.json({ ok: true, data: await markAllRead(new ObjectId(guard.user.id), guard.permissions) }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin notifications read-all failed", (error as Error).message);
    return fail("The notifications could not be marked as read. Nothing was changed. Please try again.", 503);
  }
}
