import { NextResponse } from "next/server";
import { fail, tooMany } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { cancelBuyerInquiry } from "@/lib/inquiries/service";
import { rateLimit } from "@/lib/security/rateLimit";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/buyer/inquiries/<id>/cancel: the buyer withdraws their own inquiry while it is still new, notified or in
 * progress. A replied, quoted, closed, cancelled or rejected inquiry cannot be cancelled (409). The change is logged.
 */
async function handlePATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // buyer accounts only: the identity is the session's, never a parameter
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const limit = await rateLimit(`inquiry-cancel:${user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const { id } = await params;
  try {
    const result = await cancelBuyerInquiry(user.id, id);
    if (result.ok) return NextResponse.json({ ok: true, message: "Your inquiry was cancelled.", inquiry: result.inquiry }, { headers: { "Cache-Control": "no-store" } });
    if (result.code === "NOT_FOUND") return fail("That inquiry was not found.", 404);
    return fail(`This inquiry can no longer be cancelled (status: ${result.status}).`, 409);
  } catch (error) {
    console.error("buyer inquiry cancel failed", (error as Error).message);
    return fail("We couldn't cancel your inquiry right now. Please try again.", 503);
  }
}

export const PATCH = withApiPerf("PATCH api/buyer/inquiries/:id/cancel", handlePATCH);
