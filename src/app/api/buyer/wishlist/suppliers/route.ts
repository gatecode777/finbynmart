import { NextResponse } from "next/server";
import { clean, fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveSupplier } from "@/lib/catalog/productRef";
import { rateLimit } from "@/lib/security/rateLimit";
import { listSavedSuppliers, saveSupplier } from "@/lib/wishlist/supplierService";
import { SAVED_SUPPLIER_CAP } from "@/lib/wishlist/savedSuppliersRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/buyer/wishlist/suppliers: the signed-in buyer's saved supplier ids. Anonymous visitors get authenticated:false (not an error). */
async function handleGET() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ ok: true, authenticated: false, supplierIds: [] }, { headers: { "Cache-Control": "no-store" } });
  try {
    return NextResponse.json({ ok: true, authenticated: true, supplierIds: await listSavedSuppliers(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("saved suppliers read failed", error);
    return fail("We couldn't load your saved suppliers.", 503);
  }
}

/** POST /api/buyer/wishlist/suppliers { supplierId }: save a supplier. The supplier must exist; saving twice is harmless. */
async function handlePOST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return fail("Sign in to save suppliers.", 401);

  const limit = await rateLimit(`wishlist:${user.id}`, 60, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const body = await readSmallJson(request, 1000);
  const supplier = body ? resolveSupplier(clean(body.supplierId, 80)) : undefined;
  if (!supplier) return fail("That supplier is not available.", 404);

  try {
    const added = await saveSupplier(user.id, supplier.key, supplier.name);
    if (added === "limit") return fail(`You can keep up to ${SAVED_SUPPLIER_CAP} saved suppliers. Remove one to save another.`, 409);
    return NextResponse.json({ ok: true, saved: true, alreadySaved: !added }, { status: added ? 201 : 200 });
  } catch (error) {
    console.error("save supplier failed", error);
    return fail("We couldn't save this supplier right now.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/wishlist/suppliers", handleGET);
export const POST = withApiPerf("POST api/buyer/wishlist/suppliers", handlePOST);
