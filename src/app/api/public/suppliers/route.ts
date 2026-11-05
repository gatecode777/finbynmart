import { NextResponse } from "next/server";
import { normalizeImage } from "@/lib/catalog/publicProduct";
import { parsePublicSupplierQuery } from "@/lib/catalog/publicSupplierQuery";
import { getSupplierListing } from "@/lib/catalog/supplierListing";
import { clientIp, rateLimitReserved } from "@/lib/security/rateLimit";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/suppliers: the public supplier directory (search, filters, sort, pagination, facets).
 * Reads the same engine as the /suppliers page. Public fields only: no email, phone or owner is ever loaded.
 * Supplier search also matches the names of a supplier's products, and a supplier appears once however many match.
 */
async function handleGET(request: Request) {
  const limit = await rateLimitReserved(`public-suppliers:${clientIp(request)}`, 120, 60);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, code: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const parsed = parsePublicSupplierQuery(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, code: "VALIDATION_ERROR", message: "Check the highlighted parameters.", fields: parsed.fields }, { status: 400 });
  }

  try {
    const listing = getSupplierListing(parsed.query);
    const { results, applied } = listing;
    return NextResponse.json(
      {
        ok: true,
        data: {
          suppliers: results.items.map((s) => ({
            id: s.id,
            slug: s.slug,
            name: s.name,
            url: s.url,
            initials: s.initials,
            location: { city: s.city, state: s.state },
            industry: s.industry,
            productCount: s.productCount,
            categories: s.categories,
            image: normalizeImage(s.image),
            memberSince: s.memberSince,
            // There is no verification workflow: every supplier is unverified.
            verificationStatus: s.verificationStatus,
          })),
          statistics: {
            suppliers: listing.totals.suppliers,
            industries: listing.totals.industries,
            cities: listing.totals.cities,
            states: listing.totals.states,
            verified: listing.totals.verified,
            products: listing.totals.products,
          },
          facets: {
            industries: listing.facets.industries,
            states: listing.facets.states,
            cities: listing.facets.cities,
            categories: listing.facets.categories,
            verification: listing.facets.verification ?? [],
          },
          appliedFilters: {
            q: applied.q || null,
            industry: applied.industry,
            state: applied.state,
            city: applied.city,
            category: applied.category,
            verificationStatus: applied.verification,
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
    console.error("public suppliers failed", error);
    return NextResponse.json({ ok: false, code: "INTERNAL_ERROR", message: "We couldn't load suppliers right now. Please try again." }, { status: 503 });
  }
}

export const GET = withApiPerf("GET api/public/suppliers", handleGET);
