import { NextResponse } from "next/server";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { apiError, limitedResponse } from "@/lib/certifications/publicApi";
import { getPublicCertificationRecord } from "@/lib/certifications/store";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/public/certifications/<id>: one approved certification. Anything not public is a plain 404. */
async function handleGET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await limitedResponse(request, "public-certifications", 120);
  if (limited) return limited;

  const { id } = await params;
  try {
    const record = await getPublicCertificationRecord(id);
    if (!record) return apiError(404, "NOT_FOUND", "That certification is not available.");
    const supplier = getPublicSupplierBySlug(record.doc.supplierSlug);
    if (!supplier) return apiError(404, "NOT_FOUND", "That certification is not available.");
    return NextResponse.json(
      { ok: true, data: { certification: record.item, supplier: { id: supplier.id, slug: supplier.slug, name: supplier.name, url: supplier.url } } },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" } },
    );
  } catch (error) {
    console.error("public certification failed", error);
    return apiError(500, "SERVER_ERROR", "The certification could not be loaded right now. Please try again.");
  }
}

export const GET = withApiPerf("GET api/public/certifications/:id", handleGET);
