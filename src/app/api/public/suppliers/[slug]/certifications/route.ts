import { NextResponse } from "next/server";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { apiError, limitedResponse, parsePublicCertificationQuery } from "@/lib/certifications/publicApi";
import { getSupplierCertificationView } from "@/lib/certifications/store";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/suppliers/<slug>/certifications: the approved, public certifications of the supplier named in the
 * path, with statistics, facet counts, filters, sort and server-side pagination (8 by default, 50 at most). The
 * supplier always comes from the path, never from a parameter; unsupported parameters are a 400.
 */
async function handleGET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const limited = await limitedResponse(request, "public-certifications", 120);
  if (limited) return limited;

  const { slug } = await params;
  const supplier = getPublicSupplierBySlug(slug.trim().toLowerCase());
  if (!supplier) return apiError(404, "NOT_FOUND", "That supplier is not available.");

  const parsed = parsePublicCertificationQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return apiError(400, "VALIDATION_ERROR", "Check the highlighted parameters.", parsed.fields);

  try {
    const view = await getSupplierCertificationView(supplier.slug, parsed.query);
    const { results, applied } = view;
    return NextResponse.json(
      {
        ok: true,
        data: {
          supplier: { id: supplier.id, slug: supplier.slug, name: supplier.name, url: supplier.url },
          statistics: view.stats,
          certifications: results.items,
          facets: view.facets,
          appliedFilters: { status: applied.status, type: applied.type, authority: applied.authority, expiry: applied.expiry, sort: applied.sort },
          ignoredFilters: view.ignored,
        },
        meta: {
          page: results.page,
          pageSize: results.pageSize,
          total: results.total,
          totalPages: results.totalPages,
          hasNext: results.page < results.totalPages,
          hasPrevious: results.page > 1,
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" } },
    );
  } catch (error) {
    console.error("public certifications failed", error);
    return apiError(500, "SERVER_ERROR", "Certifications could not be loaded right now. Please try again.");
  }
}

export const GET = withApiPerf("GET api/public/suppliers/:slug/certifications", handleGET);
