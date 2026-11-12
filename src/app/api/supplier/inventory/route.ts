import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { getInventory } from "@/lib/supplier/inventoryService";

export const dynamic = "force-dynamic";

/** Positions page + scoped summary. There is deliberately no balance PATCH: stock changes only through POST /adjustments (ledger). */
export async function GET(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const sp = new URL(request.url).searchParams;
  const allowed = ["all", "IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "untracked"];
  const status = allowed.includes(sp.get("status") ?? "") ? sp.get("status")! : "all";
  const result = await getInventory(guard.context, { q: sp.get("q") ?? undefined, status, page: Number(sp.get("page")) || 1, limit: Number(sp.get("limit")) || 20 });
  return NextResponse.json({ ok: true, data: result }, { headers: { "Cache-Control": "private, no-store" } });
}
