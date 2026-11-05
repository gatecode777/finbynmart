import { NextResponse } from "next/server";
import { PRODUCTS_PAGE_SIZE, getSupplierProductListing } from "@/lib/catalog/categoryListing";
import { toPublicFacets, toPublicProduct } from "@/lib/catalog/publicProduct";
import { parsePublicProductQuery } from "@/lib/catalog/publicProductQuery";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { clientIp, rateLimitReserved } from "@/lib/security/rateLimit";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/suppliers/<slug>/products: one supplier's products with the same search, filters, sort, pagination
 * and facets as /api/public/products. The supplier is the one named in the path; a `seller` parameter is refused,
 * so a client cannot ask for another supplier's products through this route. Counts and facets are this supplier's.
 */
async function handleGET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const limit = await rateLimitReserved(`public-suppliers:${clientIp(request)}`, 120, 60);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, code: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const { slug } = await params;
  const supplier = getPublicSupplierBySlug(slug.trim().toLowerCase());
  if (!supplier) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "That supplier is not available." }, { status: 404 });

  const search = new URL(request.url).searchParams;
  if (search.has("seller")) {
    return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", message: "Check the highlighted parameters.", fields: { seller: "The supplier is set by the path and cannot be changed." } }, { status: 400 });
  }
  const parsed = parsePublicProductQuery(search);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", message: "Check the highlighted parameters.", fields: parsed.fields }, { status: 400 });
  }

  try {
    const listing = getSupplierProductListing(supplier.slug, parsed.query, { pageSize: PRODUCTS_PAGE_SIZE });
    if (!listing) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "That supplier has no listed products." }, { status: 404 });
    const { results, applied } = listing;
    return NextResponse.json(
      {
        ok: true,
        data: {
          supplier: { id: supplier.id, slug: supplier.slug, name: supplier.name, url: supplier.url, productCount: supplier.productCount },
          products: results.items.map(toPublicProduct),
          facets: toPublicFacets(listing),
          appliedFilters: {
            q: applied.q || null,
            category: applied.category,
            subcategory: applied.sub,
            supplierType: applied.type,
            colour: applied.colour,
            moq: applied.moq || null,
            moqUnit: applied.moqUnit || null,
            minMOQ: applied.minMoq ?? null,
            maxMOQ: applied.maxMoq ?? null,
            minPrice: applied.minPrice ?? null,
            maxPrice: applied.maxPrice ?? null,
            sort: applied.sort,
          },
          ignoredFilters: listing.ignored,
        },
        meta: {
          currentPage: results.page,
          pageSize: results.pageSize,
          totalItems: results.total,
          totalPages: results.totalPages,
          hasNextPage: results.hasNextPage,
          hasPreviousPage: results.hasPreviousPage,
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (error) {
    console.error("supplier products failed", error);
    return NextResponse.json({ ok: false, code: "INTERNAL_ERROR", message: "We couldn't load this supplier's products right now. Please try again." }, { status: 503 });
  }
}

export const GET = withApiPerf("GET api/public/suppliers/:slug/products", handleGET);
