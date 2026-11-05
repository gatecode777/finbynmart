import { NextResponse } from "next/server";
import { getPublicProductByKey, getRelatedItems } from "@/lib/catalog/productDetail";
import { toPublicProduct } from "@/lib/catalog/publicProduct";
import { clientIp, rateLimitReserved } from "@/lib/security/rateLimit";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/public/products/<slug or id>/related?limit=8: same subcategory first, then the same category. Never includes the product itself. */
async function handleGET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const limit = await rateLimitReserved(`public-products:${clientIp(request)}`, 120, 60);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, code: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const raw = new URL(request.url).searchParams.get("limit");
  if (raw !== null && (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 12)) {
    return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", message: "Check the highlighted parameters.", fields: { limit: "Must be a whole number from 1 to 12." } }, { status: 400 });
  }

  const { slug } = await params;
  const key = slug.trim();
  const product = key.length <= 160 && /^[A-Za-z0-9._-]+$/.test(key) ? getPublicProductByKey(key) : undefined;
  if (!product) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "That product is not available." }, { status: 404 });

  const items = getRelatedItems(product, raw ? Number(raw) : 8);
  return NextResponse.json({ ok: true, data: { products: items.map(toPublicProduct) }, meta: { totalItems: items.length } }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}

export const GET = withApiPerf("GET api/public/products/:slug/related", handleGET);
