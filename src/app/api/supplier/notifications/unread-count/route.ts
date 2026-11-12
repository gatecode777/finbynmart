import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { countUnreadSupplierNotifications, seedWelcomeIfEmpty } from "@/lib/supplier/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSupplierApi();
  if ("response" in auth) return auth.response;

  await seedWelcomeIfEmpty(auth.user.id, auth.context.profile.displayName);
  const unread = await countUnreadSupplierNotifications(auth.user.id);
  return NextResponse.json({ ok: true, data: { unread } });
}

