import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { getSupplierProducts } from "@/lib/supplier/productService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const sort = (url.searchParams.get("sort") as "newest" | "price_asc" | "price_desc" | "name_asc") ?? undefined;
  const page = url.searchParams.get("page") ? Number(url.searchParams.get("page")) : 1;
  const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 15;

  const result = await getSupplierProducts(guard.context, { q, category, status, sort, page, limit });
  return NextResponse.json(
    { ok: true, data: result },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Creating a product here was retired (audit D-04): it accepted a client price and stock and bypassed the draft rules, moderation and the inventory
 * ledger. Products are created as drafts through POST /api/supplier/products/drafts. 405 so a stale client fails loudly instead of silently.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, message: "This endpoint no longer creates products. Use /api/supplier/products/drafts." },
    { status: 405, headers: { Allow: "GET", "Cache-Control": "private, no-store" } },
  );
}
