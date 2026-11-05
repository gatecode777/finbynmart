import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { getBuyerInquiryFacets, getBuyerInquirySummary } from "@/lib/inquiries/buyerList";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/inquiries/summary: the four summary numbers over ALL of the signed-in buyer's inquiries (total, awaiting
 * response, replied or quoted, closed), the count of every status tab, and the suppliers and categories that appear in their
 * history (the choices of the filters). Counts come from the stored statuses; nothing is estimated.
 */
async function handleGET() {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  try {
    const [counts, facets] = await Promise.all([getBuyerInquirySummary(guard.user.id), getBuyerInquiryFacets(guard.user.id)]);
    return NextResponse.json({ ok: true, data: { summary: counts.summary, statusCounts: counts.statusCounts, facets } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("buyer inquiry summary failed", (error as Error).message);
    return fail("We couldn't load your inquiry summary.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/inquiries/summary", handleGET);
