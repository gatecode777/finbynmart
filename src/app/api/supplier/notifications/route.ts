import { NextRequest, NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { listSupplierNotifications } from "@/lib/supplier/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireSupplierApi();
  if ("response" in auth) return auth.response;

  const url = request.nextUrl;
  const statusParam = url.searchParams.get("status");
  const status = statusParam === "all" ? "all" : "unread";
  const limit = parseInt(url.searchParams.get("limit") || "8", 10);
  const page = parseInt(url.searchParams.get("page") || "1", 10);

  const data = await listSupplierNotifications(auth.user.id, {
    status,
    limit: isNaN(limit) ? 8 : limit,
    page: isNaN(page) ? 1 : page,
  });

  return NextResponse.json({ ok: true, data });
}

