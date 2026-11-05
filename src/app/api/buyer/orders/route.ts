import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { parseOrderQuery } from "@/lib/orders/orderRules";
import { listBuyerOrders } from "@/lib/orders/service";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/buyer/orders?q=&status=&supplierId=&currency=&range=&dateFrom=&dateTo=&sort=&page=&limit=
 * The signed-in buyer's own orders (the buyer comes from the session; a buyerId parameter is never read), 20 a page, at most 50.
 * Every parameter is validated; nothing from the query reaches the database except as an escaped literal or an exact value.
 * `data.tabCounts` are counted under the other filters so every status tab shows what it would return. Payments, invoices,
 * shipment tracking and returns have no module, so `data.capabilities` says so and no figure for them is ever returned.
 */
async function handleGET(request: Request) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;

  const query = parseOrderQuery(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.ok) return fail("Check the filters.", 400, query.fields);

  try {
    const result = await listBuyerOrders(guard.user.id, query.value);
    const v = query.value;
    return NextResponse.json(
      { ok: true, orders: result.orders, data: { tabCounts: result.tabCounts, appliedFilters: { q: v.q, status: v.status, supplierId: v.supplierId, currency: v.currency, range: v.window?.key ?? null, dateFrom: v.window?.startDate ?? null, dateTo: v.window?.endDate ?? null, sort: v.sort } }, meta: result.meta },
      { headers: PRIVATE },
    );
  } catch (error) {
    console.error("buyer orders read failed", (error as Error).message);
    return fail("We couldn't load your orders.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/orders", handleGET);
