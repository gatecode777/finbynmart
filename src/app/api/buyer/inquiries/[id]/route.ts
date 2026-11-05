import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { getBuyerInquiryDetail } from "@/lib/inquiries/buyerDetail";
import { getBuyerInquiry } from "@/lib/inquiries/service";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/buyer/inquiries/<id>: one of the signed-in buyer's own inquiries. Anyone else's id is "not found". */
async function handleGET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // buyer accounts only: the identity is the session's, never a parameter
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const user = guard.user;
  const { id } = await params;
  try {
    // ?view=detail returns the full details used by the Inquiry Details page (what exists, plus honest capability flags)
    if (new URL(request.url).searchParams.get("view") === "detail") {
      const detail = await getBuyerInquiryDetail(user.id, id);
      return detail ? NextResponse.json({ ok: true, data: detail }, { headers: { "Cache-Control": "private, no-store" } }) : fail("That inquiry was not found.", 404);
    }
    const inquiry = await getBuyerInquiry(user.id, id);
    return inquiry ? NextResponse.json({ ok: true, inquiry }, { headers: { "Cache-Control": "no-store" } }) : fail("That inquiry was not found.", 404);
  } catch (error) {
    console.error("buyer inquiry read failed", (error as Error).message);
    return fail("We couldn't load your inquiry.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/inquiries/:id", handleGET);
