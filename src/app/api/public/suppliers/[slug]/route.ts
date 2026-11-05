import { NextResponse } from "next/server";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { clientIp, rateLimitReserved } from "@/lib/security/rateLimit";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/suppliers/<slug>: the public supplier profile (identity, location, industry, verification status,
 * membership year, real product count, photos of its own products). Public fields only: no contact details, no
 * private records. A supplier that does not exist is a 404.
 */
async function handleGET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const limit = await rateLimitReserved(`public-suppliers:${clientIp(request)}`, 120, 60);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, code: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const { slug } = await params;
  const supplier = getPublicSupplierBySlug(slug.trim().toLowerCase());
  if (!supplier) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "That supplier is not available." }, { status: 404 });

  const { products, ...profile } = supplier;
  void products;
  return NextResponse.json({ ok: true, data: { supplier: profile } }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}

export const GET = withApiPerf("GET api/public/suppliers/:slug", handleGET);
