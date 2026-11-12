import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimitReserved } from "@/lib/security/rateLimit";
import { getSupplierOrderDetail } from "@/lib/supplier/orderService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/supplier/orders/<reference> : one order of the session's company, read only. A reference that is unknown, malformed or another supplier's
 * gives the same 404 (nothing is read before the company is known). No route changes an order: no supplier order workflow exists.
 */
async function handleGET(_request: Request, context: { params: Promise<{ reference: string }> }) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  if (!guard.context.permissions.viewOrders) return fail("Your role cannot view orders.", 403);
  const limit = await rateLimitReserved(`supplier-orders:${guard.user.id}`, 240, 60);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const { reference } = await context.params;
  try {
    const detail = await getSupplierOrderDetail(guard.context, reference);
    if (!detail) return fail("Order not found.", 404);
    return NextResponse.json({ ok: true, data: detail }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("supplier order detail failed", (error as Error).message);
    return fail("We could not load this order.", 503);
  }
}

export const GET = withApiPerf("GET api/supplier/orders/:reference", handleGET);
