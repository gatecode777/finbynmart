import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rateLimit";
import { createSupplierProduct, getSupplierProducts } from "@/lib/supplier/productService";

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

export async function POST(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const limit = await rateLimit(`supplier-add-product:${guard.user.id}`, 30, 60);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, message: "Too many requests. Please wait." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const result = await createSupplierProduct(guard.context, {
    name: String(b.name ?? ""),
    sku: b.sku ? String(b.sku) : undefined,
    categoryName: String(b.categoryName ?? ""),
    price: Number(b.price ?? 0),
    unit: b.unit ? String(b.unit) : "Piece",
    stock: Number(b.stock ?? 0),
    description: b.description ? String(b.description) : undefined,
    imageUrl: b.imageUrl ? String(b.imageUrl) : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
  }

  return NextResponse.json(
    { ok: true, message: "Product created successfully.", data: result.product },
    { status: 201, headers: { "Cache-Control": "private, no-store" } }
  );
}
