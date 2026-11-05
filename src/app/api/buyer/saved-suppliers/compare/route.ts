import { readSmallJson } from "@/lib/auth/http";
import { buyerGuard, json } from "@/lib/buyer/api";
import { compareSavedSuppliers } from "@/lib/wishlist/savedSuppliers";
import { COMPARE_MAX, COMPARE_MIN, parseSupplierKeys } from "@/lib/wishlist/savedSuppliersRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/buyer/saved-suppliers/compare { supplierIds: [2 to 4 stored keys] }
 * Side by side, only the buyer's OWN saved and still-listed suppliers, from the live catalogue. Changes nothing. Missing values are
 * null (Not Provided); nothing is scored, ranked or called best. Anything not the buyer's (or no longer listed) is one 404.
 */
async function handlePOST(request: Request) {
  const guard = await buyerGuard({ key: "saved-suppliers-compare", limit: 120, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 1_500);
  const keys = parseSupplierKeys(body?.supplierIds, COMPARE_MIN, COMPARE_MAX);
  if (!keys.ok) return json({ ok: false, message: keys.message, fields: { supplierIds: keys.message } }, 400);
  try {
    const result = await compareSavedSuppliers(guard.user.id, keys.keys);
    return result.ok ? json({ ok: true, data: result.value }) : json({ ok: false, code: result.code, message: result.message }, result.code === "NOT_FOUND" ? 404 : 400);
  } catch (error) {
    console.error("saved suppliers compare failed", (error as Error).message);
    return json({ ok: false, message: "We couldn't compare these suppliers." }, 503);
  }
}

export const POST = withApiPerf("POST api/buyer/saved-suppliers/compare", handlePOST);
