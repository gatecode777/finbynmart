import { readSmallJson } from "@/lib/auth/http";
import { buyerGuard, json } from "@/lib/buyer/api";
import { parseSupplierKeys } from "@/lib/wishlist/savedSuppliersRules";
import { removeSavedSuppliers } from "@/lib/wishlist/supplierService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/buyer/saved-suppliers/bulk-remove { supplierIds: [1 to 20 stored keys] }
 * Removes the buyer's OWN bookmarks to those suppliers (nothing else: no supplier record is touched, another buyer's list is
 * unreachable). Answers with the real outcome per supplier: `removed` and `notSaved`. A key that is not valid refuses the whole request.
 */
async function handlePOST(request: Request) {
  const guard = await buyerGuard({ key: "saved-suppliers-bulk", limit: 30, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 3_000);
  const keys = parseSupplierKeys(body?.supplierIds);
  if (!keys.ok) return json({ ok: false, message: keys.message, fields: { supplierIds: keys.message } }, 400);
  try {
    const result = await removeSavedSuppliers(guard.user.id, keys.keys);
    return json({ ok: true, removedCount: result.removed.length, removed: result.removed, notSaved: result.notSaved });
  } catch (error) {
    console.error("saved suppliers bulk remove failed", (error as Error).message);
    return json({ ok: false, message: "We couldn't remove them right now. Nothing was changed." }, 503);
  }
}

export const POST = withApiPerf("POST api/buyer/saved-suppliers/bulk-remove", handlePOST);
