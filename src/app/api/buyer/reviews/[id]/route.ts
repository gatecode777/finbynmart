import { NextResponse } from "next/server";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rateLimit";
import { EDIT_WINDOW_DAYS, validateReviewInput } from "@/lib/reviews/rules";
import { deleteOwnReview, getOwnReview, updateOwnReview } from "@/lib/reviews/service";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

const NOT_FOUND = "That review was not found.";

/** GET /api/buyer/reviews/<id>: the buyer's own review. Another buyer's id is "not found", the same as an unknown one. */
async function handleGET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return fail("Sign in to see your reviews.", 401);
  const { id } = await params;
  try {
    const review = await getOwnReview(user.id, id);
    return review ? NextResponse.json({ ok: true, review }, { headers: { "Cache-Control": "no-store" } }) : fail(NOT_FOUND, 404);
  } catch (error) {
    console.error("own review read failed", error);
    return fail("We couldn't load your review.", 503);
  }
}

/**
 * PATCH /api/buyer/reviews/<id> { rating, title, text, categoryRatings?, wouldRecommend? }: edit within the edit window.
 * The review goes back to PENDING, so changed text is never public before a moderator has seen it.
 */
async function handlePATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return fail("Sign in to edit your review.", 401);

  const limit = await rateLimit(`reviews-edit:${user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const body = await readSmallJson(request, 12_000);
  if (!body) return fail("Send the review as JSON.", 400);
  const parsed = validateReviewInput(body);
  if (!parsed.ok) return fail("Check the highlighted fields.", 400, parsed.fields);

  const { id } = await params;
  try {
    const result = await updateOwnReview(user.id, id, parsed.value);
    if (result.ok) {
      return NextResponse.json({ ok: true, message: "Your changes were saved. The review is waiting for moderation again.", review: result.review }, { headers: { "Cache-Control": "no-store" } });
    }
    if (result.code === "NOT_FOUND") return fail(NOT_FOUND, 404);
    if (result.code === "LOCKED") return fail("This review can no longer be edited.", 409);
    return fail(`A review can be edited for ${EDIT_WINDOW_DAYS} days after it was written. That time has passed.`, 409);
  } catch (error) {
    console.error("review update failed", error);
    return fail("We couldn't save your changes right now. Please try again.", 503);
  }
}

/** DELETE /api/buyer/reviews/<id>: the author removes their own review at any time. */
async function handleDELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return fail("Sign in to delete your review.", 401);

  const limit = await rateLimit(`reviews-edit:${user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const { id } = await params;
  try {
    return (await deleteOwnReview(user.id, id)) ? NextResponse.json({ ok: true, message: "Your review was deleted." }, { headers: { "Cache-Control": "no-store" } }) : fail(NOT_FOUND, 404);
  } catch (error) {
    console.error("review delete failed", error);
    return fail("We couldn't delete your review right now. Please try again.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/reviews/:id", handleGET);
export const PATCH = withApiPerf("PATCH api/buyer/reviews/:id", handlePATCH);
export const DELETE = withApiPerf("DELETE api/buyer/reviews/:id", handleDELETE);
