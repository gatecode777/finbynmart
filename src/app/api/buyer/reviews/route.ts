import { NextResponse } from "next/server";
import { clean, fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { getCurrentUser } from "@/lib/auth/session";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { rateLimit } from "@/lib/security/rateLimit";
import { validateReviewInput } from "@/lib/reviews/rules";
import { createBuyerReview, listOwnReviews } from "@/lib/reviews/service";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/buyer/reviews: the signed-in buyer's own reviews with their status. */
async function handleGET() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return fail("Sign in to see your reviews.", 401);
  try {
    return NextResponse.json({ ok: true, reviews: await listOwnReviews(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("own reviews read failed", error);
    return fail("We couldn't load your reviews.", 503);
  }
}

/**
 * POST /api/buyer/reviews { supplierId, rating, title, text, categoryRatings?, wouldRecommend? }.
 * Pipeline: session -> supplier resolved on the server -> validation -> rate limit (valid submissions only) -> duplicate rule -> saved as PENDING.
 * Verification and moderation fields are never read from the body: anything sent for them is simply ignored.
 */
async function handlePOST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return fail("Sign in to write a review.", 401);
  if (user.role !== "buyer") return fail("Only buyer accounts can review suppliers.", 403);

  const body = await readSmallJson(request, 12_000);
  if (!body) return fail("Send the review as JSON.", 400);

  const supplier = getPublicSupplierBySlug(clean(body.supplierId, 80).toLowerCase());
  if (!supplier) return fail("That supplier is not available.", 404);

  const parsed = validateReviewInput(body);
  if (!parsed.ok) return fail("Check the highlighted fields.", 400, parsed.fields);

  // Only well-formed submissions count against the limit, so fixing a typo never locks a buyer out.
  const limit = await rateLimit(`reviews:${user.id}`, 5, 3600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  try {
    const result = await createBuyerReview(user, supplier.slug, parsed.value);
    if (!result.ok) {
      return result.code === "DUPLICATE"
        ? fail("You have already reviewed this supplier. You can edit your review instead.", 409)
        : fail("Only buyer accounts can review suppliers.", 403);
    }
    return NextResponse.json(
      { ok: true, message: "Thank you. Your review has been received and is waiting for moderation. It will appear on the page once it is approved.", review: result.review },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("review submit failed", error);
    return fail("We couldn't save your review right now. Please try again.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/reviews", handleGET);
export const POST = withApiPerf("POST api/buyer/reviews", handlePOST);
