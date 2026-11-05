import { NextResponse } from "next/server";
import { PRODUCTS_PAGE_SIZE, getProductListing } from "@/lib/catalog/categoryListing";
import { getRelatedSearches, toPublicFacets, toPublicProduct } from "@/lib/catalog/publicProduct";
import { parsePublicProductQuery } from "@/lib/catalog/publicProductQuery";
import { clientIp, rateLimitReserved } from "@/lib/security/rateLimit";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/products: the public product listing (search, filters, sort, pagination, facets).
 * Reads the same engine as the All Products page, so the two always agree. Public data only: no seller
 * contact fields, no internal keys. Answers { ok, data: { products, facets, appliedFilters }, meta }.
 */
async function handleGET(request: Request) {
  const limit = await rateLimitReserved(`public-products:${clientIp(request)}`, 120, 60);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = parsePublicProductQuery(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION_ERROR", message: "Check the highlighted parameters.", fields: parsed.fields },
      { status: 400 },
    );
  }

  try {
    const listing = getProductListing(parsed.query, { pageSize: PRODUCTS_PAGE_SIZE });
    const { results } = listing;
    return NextResponse.json(
      {
        ok: true,
        data: {
          products: results.items.map(toPublicProduct),
          query: listing.applied.q || null,
          // About the search text alone, before any filter. There is no brand data, so no brand count.
          statistics: listing.search ? { products: listing.search.products, suppliers: listing.search.suppliers, categories: listing.search.categories } : null,
          relatedSearches: getRelatedSearches(listing.applied.q, listing.search),
          facets: toPublicFacets(listing),
          appliedFilters: {
            q: listing.applied.q || null,
            category: listing.applied.category,
            subcategory: listing.applied.sub,
            department: listing.applied.department,
            supplierType: listing.applied.type,
            state: listing.applied.state,
            city: listing.applied.city,
            colour: listing.applied.colour,
            seller: listing.applied.seller || null,
            moqUnit: listing.applied.moqUnit || null,
            minMOQ: listing.applied.minMoq ?? null,
            maxMOQ: listing.applied.maxMoq ?? null,
            moq: listing.applied.moq || null,
            minPrice: listing.applied.minPrice ?? null,
            maxPrice: listing.applied.maxPrice ?? null,
            sort: listing.applied.sort,
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
      // The catalog only changes with a deploy, so shared caches may keep a response briefly.
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (error) {
    console.error("public products failed", error);
    return NextResponse.json({ ok: false, code: "INTERNAL_ERROR", message: "We couldn't load products right now. Please try again." }, { status: 503 });
  }
}

export const GET = withApiPerf("GET api/public/products", handleGET);
