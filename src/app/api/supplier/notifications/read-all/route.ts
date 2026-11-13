import { NextResponse } from "next/server";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { rateLimit } from "@/lib/security/rateLimit";
import { requireSupplierApi } from "@/lib/auth/guards";
import { markAllSupplierNotificationsRead } from "@/lib/supplier/notifications";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  if (isCrossSiteWrite(request)) return NextResponse.json({ ok: false, message: "This request was blocked." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  const auth = await requireSupplierApi();
  if ("response" in auth) return auth.response;
  const limit = await rateLimit(`supplier-notif-readall:${auth.user.id}`, 30, 600);
  if (!limit.ok) return NextResponse.json({ ok: false, message: "Too many requests. Please wait." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const modified = await markAllSupplierNotificationsRead(auth.user.id);
  return NextResponse.json({ ok: true, success: true, data: { count: modified } }, { headers: { "Cache-Control": "private, no-store" } });
}
