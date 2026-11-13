import { NextResponse } from "next/server";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { rateLimit } from "@/lib/security/rateLimit";
import { requireSupplierApi } from "@/lib/auth/guards";
import { markSupplierNotificationRead } from "@/lib/supplier/notifications";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isCrossSiteWrite(request)) return NextResponse.json({ ok: false, message: "This request was blocked." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  const auth = await requireSupplierApi();
  if ("response" in auth) return auth.response;
  const limit = await rateLimit(`supplier-notif-read:${auth.user.id}`, 120, 600);
  if (!limit.ok) return NextResponse.json({ ok: false, message: "Too many requests. Please wait." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const { id } = await params;
  const ok = await markSupplierNotificationRead(auth.user.id, id);
  return NextResponse.json({ ok, success: ok }, { headers: { "Cache-Control": "private, no-store" } });
}
