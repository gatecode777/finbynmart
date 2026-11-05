import { NextResponse } from "next/server";
import { clean, fail, tooMany } from "@/lib/auth/http";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rateLimit";
import { removeFromWishlist } from "@/lib/wishlist/service";
import { withApiPerf } from "@/lib/perf/instrument";

/** DELETE /api/buyer/wishlist/<productId>: remove a saved product from the signed-in buyer's own list. */
async function handleDELETE(_request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return fail("Sign in to manage saved products.", 401);

  const limit = await rateLimit(`wishlist:${user.id}`, 60, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const { productId } = await params;
  const key = clean(productId, 80);
  if (!key) return fail("That product is not available.", 404);

  try {
    const removed = await removeFromWishlist(user.id, key);
    return NextResponse.json({ ok: true, saved: false, removed });
  } catch (error) {
    console.error("wishlist remove failed", error);
    return fail("We couldn't update your saved products right now.", 503);
  }
}

export const DELETE = withApiPerf("DELETE api/buyer/wishlist/:productId", handleDELETE);
