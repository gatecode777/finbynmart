import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { getSavedSuppliersSummary } from "@/lib/wishlist/savedSuppliers";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/saved-suppliers/summary: the five numbers over ALL of the signed-in buyer's saved suppliers (total saved, verified,
 * active, product categories, states) and the choices of the filters (categories, states, cities, supplier types, verification),
 * all from what they really saved and the live catalogue. There is no country number: supplier records store no country.
 */
async function handleGET() {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ ok: true, data: await getSavedSuppliersSummary(guard.user.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("saved suppliers summary failed", (error as Error).message);
    return fail("We couldn't load your saved suppliers summary.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/saved-suppliers/summary", handleGET);
