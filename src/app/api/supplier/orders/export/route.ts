import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { getDb } from "@/lib/db/mongo";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { canExportOrders, parseSupplierOrderQuery } from "@/lib/supplier/orderRules";
import { exportSupplierOrdersCsv } from "@/lib/supplier/orderService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/supplier/orders/export { q?, status?, range?, startDate?, endDate?, dateBasis?, currency? }
 * The session company's own orders under those filters as a CSV download (at most 5,000 rows, newest first; a cut-off is announced in a header). The file
 * is built and sent in this one response: nothing is stored, so there is no link to share and nothing to expire, and there is no background job to wait
 * for. Buyer = business name only; no contact, address, payment or other supplier's data. Needs the `exportOrders` permission. Each export is logged
 * (counts and filter names, never values). 10 per 10 minutes per user (the exact limiter: it is a write-class request).
 */
async function handlePOST(request: Request) {
  if (isCrossSiteWrite(request)) return fail("This request was blocked.", 403);
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  if (!canExportOrders(guard.context.permissions)) return fail("Your role cannot export orders.", 403);
  const limit = await rateLimit(`supplier-order-export:${guard.user.id}`, 10, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const body = await readSmallJson(request, 2_000);
  if (!body) return fail("Invalid request.");
  // page, limit and sort do not apply to a file: the row cap is the only bound
  const { page: _page, limit: _limit, sort: _sort, ...filters } = body;
  void _page;
  void _limit;
  void _sort;
  const query = parseSupplierOrderQuery(filters);
  if (!query.ok) return fail("Check the filters.", 400, query.fields);
  try {
    const result = await exportSupplierOrdersCsv(guard.context, query.value);
    await (await getDb())
      .collection("security_events")
      .insertOne({ userId: new ObjectId(guard.user.id), type: "supplier_orders_exported", at: new Date(), rows: result.rows, truncated: result.truncated, filters: Object.keys(filters).filter((k) => filters[k] !== "" && filters[k] !== undefined && filters[k] !== null) })
      .catch(() => undefined);
    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="finbyn-mart-supplier-orders.csv"',
        "X-Content-Type-Options": "nosniff",
        "X-Export-Rows": String(result.rows),
        "X-Export-Truncated": String(result.truncated),
      },
    });
  } catch (error) {
    console.error("supplier order export failed", (error as Error).message);
    return fail("We could not prepare your export. Nothing was downloaded. Please try again.", 503);
  }
}

export const POST = withApiPerf("POST api/supplier/orders/export", handlePOST);
