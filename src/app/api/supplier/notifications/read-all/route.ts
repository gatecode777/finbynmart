import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { markAllSupplierNotificationsRead } from "@/lib/supplier/notifications";

export const dynamic = "force-dynamic";

export async function PATCH() {
  const auth = await requireSupplierApi();
  if ("response" in auth) return auth.response;

  const modified = await markAllSupplierNotificationsRead(auth.user.id);
  return NextResponse.json({ ok: true, success: true, data: { count: modified } });
}

