import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { listSavedProducts } from "@/lib/wishlist/savedProducts";
import { parseSavedQuery } from "@/lib/wishlist/savedProductsRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/saved-products?q=&category=&sort=&page=&limit=
 * The signed-in buyer's own saved products with their catalogue details (the buyer comes from the session; a buyerId parameter is
 * never read). Saving and removing use the existing routes: POST /api/buyer/wishlist and DELETE /api/buyer/wishlist/[productId].
 */
async function handleGET(request: Request) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const query = parseSavedQuery(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.ok) return fail("Check the filters.", 400, query.fields);
  try {
    const data = await listSavedProducts(guard.user.id, query.value);
    return NextResponse.json({ ok: true, data, meta: { total: data.total, page: data.page, limit: data.limit, totalPages: data.totalPages } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("saved products read failed", (error as Error).message);
    return fail("We couldn't load your saved products.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/saved-products", handleGET);
