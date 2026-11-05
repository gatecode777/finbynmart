import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { getBuyerOrderFacets, getBuyerOrderSummary } from "@/lib/orders/service";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/orders/summary: the five numbers over ALL of the signed-in buyer's orders (total, processing, in transit,
 * delivered, active issues), the count of every status tab, the suppliers and currencies that appear in their orders, and what
 * this deployment can really do. There is deliberately NO payment, refund or invoice figure: those modules do not exist, and a
 * zero would claim otherwise. Counts come from the stored statuses; nothing is estimated.
 */
async function handleGET() {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  try {
    const [counts, facets] = await Promise.all([getBuyerOrderSummary(guard.user.id), getBuyerOrderFacets(guard.user.id)]);
    return NextResponse.json(
      { ok: true, data: { summary: counts.summary, tabCounts: counts.tabCounts, facets, capabilities: { payments: false, invoices: false, shipmentTracking: false, returns: false, cancellationRequest: true, export: true } } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("buyer order summary failed", (error as Error).message);
    return fail("We couldn't load your order summary.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/orders/summary", handleGET);
