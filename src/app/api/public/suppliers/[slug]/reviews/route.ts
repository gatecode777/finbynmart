import { NextResponse } from "next/server";
import { apiError, limitedResponse } from "@/lib/api/publicResponse";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { parsePublicReviewQuery } from "@/lib/reviews/publicApi";
import { getSupplierReviewView } from "@/lib/reviews/store";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/suppliers/<slug>/reviews: the published reviews of the supplier named in the path, with the rating
 * summary, the metrics that have a real source, facet counts, filters, sort and server-side pagination (10 by default,
 * 50 at most). The supplier always comes from the path; unsupported parameters are a 400. Pending, rejected, hidden and
 * deleted reviews are never part of the answer, and neither is anything that identifies the author.
 */
async function handleGET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const limited = await limitedResponse(request, "public-reviews", 120);
  if (limited) return limited;

  const { slug } = await params;
  const supplier = getPublicSupplierBySlug(slug.trim().toLowerCase());
  if (!supplier) return apiError(404, "NOT_FOUND", "That supplier is not available.");

  const parsed = parsePublicReviewQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return apiError(400, "VALIDATION_ERROR", "Check the highlighted parameters.", parsed.fields);

  try {
    const view = await getSupplierReviewView(supplier.slug, parsed.query);
    const { results, applied } = view;
    return NextResponse.json(
      {
        ok: true,
        data: {
          supplier: { id: supplier.id, slug: supplier.slug, name: supplier.name, url: supplier.url },
          summary: view.summary,
          metrics: view.metrics,
          reviews: results.items,
          facets: view.facets,
          appliedFilters: { rating: applied.rating, category: applied.category, verifiedBuyer: applied.verified, range: applied.range || null, sort: applied.sort },
          ignoredFilters: view.ignored,
        },
        meta: {
          currentPage: results.page,
          pageSize: results.pageSize,
          totalItems: results.total,
          totalPages: results.totalPages,
          hasNext: results.page < results.totalPages,
          hasPrevious: results.page > 1,
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" } },
    );
  } catch (error) {
    console.error("public reviews failed", error);
    return apiError(500, "SERVER_ERROR", "Reviews could not be loaded right now. Please try again.");
  }
}

export const GET = withApiPerf("GET api/public/suppliers/:slug/reviews", handleGET);
