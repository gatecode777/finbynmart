import { NextResponse } from "next/server";
import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { clientIp, rateLimitReserved } from "@/lib/security/rateLimit";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/products/<slug or id>: the public product detail (normalised DTO, public fields only).
 * Returns 404 for an unknown product. There is no draft, rejected or suspended state in the data, so
 * everything that exists is public; supplier contact details are never loaded.
 */
async function handleGET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const limit = await rateLimitReserved(`public-products:${clientIp(request)}`, 120, 60);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, code: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const { slug } = await params;
  const key = slug.trim();
  if (!key || key.length > 160 || !/^[A-Za-z0-9._-]+$/.test(key)) {
    return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "That product is not available." }, { status: 404 });
  }

  try {
    const product = getPublicProductByKey(key);
    if (!product) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "That product is not available." }, { status: 404 });
    return NextResponse.json({ ok: true, data: { product } }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch (error) {
    console.error("public product failed", error);
    return NextResponse.json({ ok: false, code: "INTERNAL_ERROR", message: "We couldn't load this product right now. Please try again." }, { status: 503 });
  }
}

export const GET = withApiPerf("GET api/public/products/:slug", handleGET);
