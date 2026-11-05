import { NextResponse } from "next/server";
import { apiError, limitedResponse } from "@/lib/api/publicResponse";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { REVIEW_PAGE_SIZE } from "@/lib/reviews/query";
import { getSupplierReviewView } from "@/lib/reviews/store";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/public/suppliers/<slug>/reviews/summary: average (null when nothing is published), counts and distribution. */
async function handleGET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const limited = await limitedResponse(request, "public-reviews", 120);
  if (limited) return limited;

  const { slug } = await params;
  const supplier = getPublicSupplierBySlug(slug.trim().toLowerCase());
  if (!supplier) return apiError(404, "NOT_FOUND", "That supplier is not available.");
  if (new URL(request.url).searchParams.size > 0) return apiError(400, "VALIDATION_ERROR", "This endpoint takes no parameters.", { query: "No parameters are supported." });

  try {
    const view = await getSupplierReviewView(supplier.slug, { rating: [], category: [], verified: false, range: "", sort: "relevant", page: 1, limit: REVIEW_PAGE_SIZE });
    return NextResponse.json(
      { ok: true, data: { supplier: { id: supplier.id, slug: supplier.slug, name: supplier.name, url: supplier.url }, summary: view.summary, metrics: view.metrics } },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" } },
    );
  } catch (error) {
    console.error("public review summary failed", error);
    return apiError(500, "SERVER_ERROR", "The rating summary could not be loaded right now. Please try again.");
  }
}

export const GET = withApiPerf("GET api/public/suppliers/:slug/reviews/summary", handleGET);
