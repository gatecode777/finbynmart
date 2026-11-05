import { NextResponse } from "next/server";
import { clean, fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveProduct } from "@/lib/catalog/productRef";
import { rateLimit } from "@/lib/security/rateLimit";
import { addToWishlist, listWishlist } from "@/lib/wishlist/service";
import { SAVED_CAP } from "@/lib/wishlist/savedProductsRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/buyer/wishlist: the signed-in buyer's saved product keys. Anonymous visitors get authenticated:false (not an error). */
async function handleGET() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ ok: true, authenticated: false, productIds: [] }, { headers: { "Cache-Control": "no-store" } });
  try {
    return NextResponse.json({ ok: true, authenticated: true, productIds: await listWishlist(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("wishlist read failed", error);
    return fail("We couldn't load your saved products.", 503);
  }
}

/** POST /api/buyer/wishlist { productId }: save a product. Saving twice is harmless (reported as alreadySaved). */
async function handlePOST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return fail("Sign in to save products.", 401);

  const limit = await rateLimit(`wishlist:${user.id}`, 60, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const body = await readSmallJson(request, 1000);
  const product = body ? resolveProduct(clean(body.productId, 80)) : undefined;
  if (!product) return fail("That product is not available.", 404);

  try {
    const added = await addToWishlist(user.id, product.key, product.name);
    if (added === "limit") return fail(`You can keep up to ${SAVED_CAP} saved products. Remove one to save another.`, 409);
    return NextResponse.json({ ok: true, saved: true, alreadySaved: !added }, { status: added ? 201 : 200 });
  } catch (error) {
    console.error("wishlist add failed", error);
    return fail("We couldn't save this product right now.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/wishlist", handleGET);
export const POST = withApiPerf("POST api/buyer/wishlist", handlePOST);
