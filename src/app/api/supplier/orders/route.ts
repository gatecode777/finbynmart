import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimitReserved } from "@/lib/security/rateLimit";
import { parseSupplierOrderQuery } from "@/lib/supplier/orderRules";
import { listSupplierOrders } from "@/lib/supplier/orderService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/supplier/orders?q=&status=all|awaiting|in_progress|ready|shipped|delivered|cancelled|attention|<exact status>&range=&startDate=&endDate=
 *   &dateBasis=placed|updated&currency=INR&sort=newest|oldest|updated|amount_high|amount_low&page=&limit=
 * The orders of the company the SESSION's account owns (a companyId, supplierId, supplierKey or buyerId parameter is never read). `data.counts` are the
 * order counts per chip under the search, date and currency filters (the status is not applied to them); `meta.total` is the exact count of the list
 * itself. 401 without a session, 403 for a non-supplier, an inactive company or a role without `viewOrders`, 400 for an invalid filter. Private, never cached.
 */
async function handleGET(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  if (!guard.context.permissions.viewOrders) return fail("Your role cannot view orders.", 403);
  const limit = await rateLimitReserved(`supplier-orders:${guard.user.id}`, 240, 60);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const query = parseSupplierOrderQuery(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.ok) return fail("Check the filters.", 400, query.fields);
  try {
    const page = await listSupplierOrders(guard.context, query.value);
    return NextResponse.json(
      { ok: true, orders: page.orders, data: { counts: page.counts, currencies: page.currencies, capabilities: page.capabilities, noSellers: page.noSellers }, meta: page.meta },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("supplier orders read failed", (error as Error).message);
    return fail("We could not load your orders.", 503);
  }
}

export const GET = withApiPerf("GET api/supplier/orders", handleGET);
