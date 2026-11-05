import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { fail, readSmallJson } from "@/lib/auth/http";
import { buyerGuard, json, PRIVATE } from "@/lib/buyer/api";
import { getDb } from "@/lib/db/mongo";
import { parseOrderQuery } from "@/lib/orders/orderRules";
import { exportBuyerOrdersCsv } from "@/lib/orders/service";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/buyer/orders/export { q?, status?, supplierId?, currency?, range?, dateFrom?, dateTo?, sort? }
 * The signed-in buyer's own orders under those filters as a CSV download (at most 5,000 rows, newest first). The file is generated
 * and sent in this one response: nothing is stored, so there is no link to share and nothing to expire. Only the buyer's own orders,
 * and no payment, address, contact or internal field exists in the file. Each export is logged (counts and filter names, no values).
 */
async function handlePOST(request: Request) {
  const guard = await buyerGuard({ key: "order-export", limit: 10, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 2_000);
  if (!body) return fail("Invalid request.");
  // page and limit do not apply to a file: the cap is the only bound
  const { page: _page, limit: _limit, ...filters } = body as Record<string, unknown>;
  void _page; void _limit;
  const query = parseOrderQuery(filters);
  if (!query.ok) return json({ ok: false, message: "Check the filters.", fields: query.fields }, 400);
  try {
    const result = await exportBuyerOrdersCsv(guard.user.id, query.value);
    await (await getDb()).collection("security_events").insertOne({ userId: new ObjectId(guard.user.id), type: "orders_exported", at: new Date(), rows: result.rows, truncated: result.truncated, filters: Object.keys(filters).filter((k) => filters[k] !== "" && filters[k] !== undefined) }).catch(() => undefined);
    return new NextResponse(result.csv, {
      status: 200,
      headers: { ...PRIVATE, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="finbyn-mart-orders.csv"', "X-Content-Type-Options": "nosniff", "X-Export-Rows": String(result.rows), "X-Export-Truncated": String(result.truncated) },
    });
  } catch (error) {
    console.error("order export failed", (error as Error).message);
    return json({ ok: false, message: "We couldn't prepare your export. Nothing was downloaded. Please try again." }, 503);
  }
}

export const POST = withApiPerf("POST api/buyer/orders/export", handlePOST);
