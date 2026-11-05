import { NextResponse } from "next/server";
import { clean, fail, tooMany } from "@/lib/auth/http";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveSupplier } from "@/lib/catalog/productRef";
import { rateLimit } from "@/lib/security/rateLimit";
import { removeSavedSupplier } from "@/lib/wishlist/supplierService";
import { withApiPerf } from "@/lib/perf/instrument";

/** DELETE /api/buyer/wishlist/suppliers/<supplierId>: remove a saved supplier from the signed-in buyer's own list. */
async function handleDELETE(_request: Request, { params }: { params: Promise<{ supplierId: string }> }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return fail("Sign in to manage saved suppliers.", 401);

  const limit = await rateLimit(`wishlist:${user.id}`, 60, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const { supplierId } = await params;
  // The key stored is the supplier's canonical id, so a slug or an id both find the same row.
  const supplier = resolveSupplier(clean(supplierId, 80));
  if (!supplier) return fail("That supplier is not available.", 404);

  try {
    const removed = await removeSavedSupplier(user.id, supplier.key);
    return NextResponse.json({ ok: true, saved: false, removed });
  } catch (error) {
    console.error("remove saved supplier failed", error);
    return fail("We couldn't update your saved suppliers right now.", 503);
  }
}

export const DELETE = withApiPerf("DELETE api/buyer/wishlist/suppliers/:supplierId", handleDELETE);
