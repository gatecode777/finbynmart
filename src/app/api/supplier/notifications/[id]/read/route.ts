import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { markSupplierNotificationRead } from "@/lib/supplier/notifications";

export const dynamic = "force-dynamic";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSupplierApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const ok = await markSupplierNotificationRead(auth.user.id, id);
  return NextResponse.json({ ok, success: ok });
}

