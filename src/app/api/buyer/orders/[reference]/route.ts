import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { REFERENCE_PATTERN } from "@/lib/orders/orderRules";
import { getBuyerOrderDetail } from "@/lib/orders/service";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/orders/<reference>: one of the signed-in buyer's own orders with its items, supplier, event history and the
 * actions this deployment really supports. Another buyer's reference, an unknown one and a malformed one answer the same 404.
 */
async function handleGET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const { reference } = await params;
  if (!REFERENCE_PATTERN.test(reference)) return fail("That order was not found.", 404);
  try {
    const detail = await getBuyerOrderDetail(guard.user.id, reference);
    return detail ? NextResponse.json({ ok: true, data: detail }, { headers: { "Cache-Control": "private, no-store" } }) : fail("That order was not found.", 404);
  } catch (error) {
    console.error("buyer order read failed", (error as Error).message);
    return fail("We couldn't load this order.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/orders/:reference", handleGET);
