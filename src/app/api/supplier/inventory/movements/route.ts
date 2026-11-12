import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { getMovements } from "@/lib/supplier/inventoryService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const sp = new URL(request.url).searchParams;
  const data = await getMovements(guard.context, { page: Number(sp.get("page")) || 1, limit: Number(sp.get("limit")) || 20 });
  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
}
