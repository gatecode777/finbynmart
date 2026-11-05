import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiError, limitedResponse } from "@/lib/api/publicResponse";
import { getCurrentUser } from "@/lib/auth/session";
import { getInquiryConfirmation } from "@/lib/inquiries/confirmation";
import { GUEST_ACCESS_COOKIE, checkAccess } from "@/lib/inquiries/guestAccess";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/public/inquiries/<reference>: the confirmation of one saved inquiry, only for the buyer it belongs to (signed
 * in) or for the guest whose browser holds the signed confirmation cookie. A reference alone returns nothing: an
 * unknown reference and one the caller may not see give the same 404, so references cannot be probed. The answer is a
 * small DTO (no buyer or guest contact details, no internal fields) and is never cached.
 */
async function handleGET(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const limited = await limitedResponse(request, "public-inquiry-reference", 60);
  if (limited) return limited;

  const { reference } = await params;
  const user = await getCurrentUser().catch(() => null);
  const guest = checkAccess((await cookies()).get(GUEST_ACCESS_COOKIE)?.value, reference);

  try {
    const result = await getInquiryConfirmation(reference, { userId: user?.role === "buyer" ? user.id : undefined, guest });
    if (result.status === "ok") return NextResponse.json({ ok: true, data: result.data }, { headers: PRIVATE });
    if (result.status === "expired") return apiError(403, "GUEST_ACCESS_EXPIRED", "This confirmation link has expired. Sign in to your account to see your inquiries.", undefined, PRIVATE);
    return apiError(404, "NOT_FOUND", "That inquiry was not found.", undefined, PRIVATE);
  } catch (error) {
    console.error("inquiry confirmation failed", (error as Error).message);
    return apiError(500, "SERVER_ERROR", "The inquiry could not be loaded right now. Please try again.", undefined, PRIVATE);
  }
}

export const GET = withApiPerf("GET api/public/inquiries/:reference", handleGET);
