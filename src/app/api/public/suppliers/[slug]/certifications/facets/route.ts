import { NextResponse } from "next/server";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { apiError, limitedResponse, parsePublicCertificationQuery } from "@/lib/certifications/publicApi";
import { getSupplierCertificationView } from "@/lib/certifications/store";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/public/suppliers/<slug>/certifications/facets: filter options with live counts for the current selection. */
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
    return NextResponse.json(
      { ok: true, data: { supplier: { slug: supplier.slug }, facets: view.facets, statistics: view.stats, matching: view.results.total, ignoredFilters: view.ignored } },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" } },
    );
  } catch (error) {
    console.error("public certification facets failed", error);
    return apiError(500, "SERVER_ERROR", "Filters could not be loaded right now. Please try again.");
  }
}

export const GET = withApiPerf("GET api/public/suppliers/:slug/certifications/facets", handleGET);
