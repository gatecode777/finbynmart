import { NextResponse } from "next/server";
import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { clientIp, rateLimitReserved } from "@/lib/security/rateLimit";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/products/<slug or id>/reviews?page=&limit=
 * There is no reviews collection and no review submission or moderation yet, so every product has zero
 * published reviews. The endpoint answers that truthfully (supported: false) instead of inventing any.
 * A rating shown on a sample listing is sample data and is not a review summary.
 */
async function handleGET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const limit = await rateLimitReserved(`public-products:${clientIp(request)}`, 120, 60);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, code: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const search = new URL(request.url).searchParams;
  const fields: Record<string, string> = {};
  const page = search.get("page");
  const size = search.get("limit");
  if (page !== null && (!/^\d+$/.test(page) || Number(page) < 1 || Number(page) > 1_000_000)) fields.page = "Must be a whole number of at least 1.";
  if (size !== null && (!/^\d+$/.test(size) || Number(size) < 1 || Number(size) > 50)) fields.limit = "Must be a whole number from 1 to 50.";
  if (Object.keys(fields).length) return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", message: "Check the highlighted parameters.", fields }, { status: 400 });

  const { slug } = await params;
  const key = slug.trim();
  const product = key.length <= 160 && /^[A-Za-z0-9._-]+$/.test(key) ? getPublicProductByKey(key) : undefined;
  if (!product) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "That product is not available." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    data: {
      supported: false,
      message: "Product reviews are not available yet.",
      reviews: [],
      summary: { average: null, count: 0, distribution: null },
    },
    meta: { currentPage: 1, pageSize: size ? Number(size) : 10, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
  });
}

export const GET = withApiPerf("GET api/public/products/:slug/reviews", handleGET);
