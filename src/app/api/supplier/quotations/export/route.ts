import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { getDb } from "@/lib/db/mongo";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { parseSupplierQuery } from "@/lib/supplier/quotationRules";
import { exportSupplierQuotationsCsv } from "@/lib/supplier/quotationService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/supplier/quotations/export { q?, status?, range?, startDate?, endDate?, dateBasis?, validity?, currency? }
 * The session company's own quotations under those filters as a CSV download (current versions, at most 5,000 rows, newest created first). The file is
 * built and sent in this one response: nothing is stored, so there is no link to share and nothing to expire. Buyer = business name only; no
 * contact, internal note or other supplier's data. Each export is logged (counts and filter names, never values). 10 per 10 minutes per user.
 */
async function handlePOST(request: Request) {
  if (isCrossSiteWrite(request)) return fail("This request was blocked.", 403);
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`supplier-quotation-export:${guard.user.id}`, 10, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const body = await readSmallJson(request, 2_000);
  if (!body) return fail("Invalid request.");
  // page, limit and sort do not apply to a file: the row cap is the only bound
  const { page: _page, limit: _limit, sort: _sort, ...filters } = body;
  void _page;
  void _limit;
  void _sort;
  const query = parseSupplierQuery(filters);
  if (!query.ok) return fail("Check the filters.", 400, query.fields);
  try {
    const result = await exportSupplierQuotationsCsv(guard.context, query.value);
    await (await getDb())
      .collection("security_events")
      .insertOne({ userId: new ObjectId(guard.user.id), type: "supplier_quotations_exported", at: new Date(), rows: result.rows, truncated: result.truncated, filters: Object.keys(filters).filter((k) => filters[k] !== "" && filters[k] !== undefined) })
      .catch(() => undefined);
    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="finbyn-mart-supplier-quotations.csv"',
        "X-Content-Type-Options": "nosniff",
        "X-Export-Rows": String(result.rows),
        "X-Export-Truncated": String(result.truncated),
      },
    });
  } catch (error) {
    console.error("supplier quotation export failed", (error as Error).message);
    return fail("We could not prepare your export. Nothing was downloaded. Please try again.", 503);
  }
}

export const POST = withApiPerf("POST api/supplier/quotations/export", handlePOST);
