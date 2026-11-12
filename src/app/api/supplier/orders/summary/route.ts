import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimitReserved } from "@/lib/security/rateLimit";
import { parseSupplierOrderQuery } from "@/lib/supplier/orderRules";
import { getSupplierOrderSummary } from "@/lib/supplier/orderService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/supplier/orders/summary?q=&range=&startDate=&endDate=&dateBasis=&currency= : the order counts per status group under those filters (the same
 * numbers the list route carries), with the scope spelled out. Counts only: no amount is ever summed across orders or currencies. `status`, `sort`,
 * `page` and `limit` are accepted and ignored. The company comes from the session.
 */
async function handleGET(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  if (!guard.context.permissions.viewOrders) return fail("Your role cannot view orders.", 403);
  const limit = await rateLimitReserved(`supplier-orders:${guard.user.id}`, 240, 60);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const { status: _status, sort: _sort, page: _page, limit: _limit, ...filters } = Object.fromEntries(new URL(request.url).searchParams.entries());
  void _status;
  void _sort;
  void _page;
  void _limit;
  const query = parseSupplierOrderQuery(filters);
  if (!query.ok) return fail("Check the filters.", 400, query.fields);
  try {
    const summary = await getSupplierOrderSummary(guard.context, query.value);
    return NextResponse.json({ ok: true, data: summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("supplier orders summary failed", (error as Error).message);
    return fail("We could not load the order counts.", 503);
  }
}

export const GET = withApiPerf("GET api/supplier/orders/summary", handleGET);
