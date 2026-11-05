import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { parseListQuery } from "@/lib/inquiries/buyerListRules";
import { listBuyerInquiryPage } from "@/lib/inquiries/buyerList";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/buyer/inquiries?q=&status=&inquiryType=&supplierId=&categoryId=&range=&dateFrom=&dateTo=&sort=&page=&limit=
 * The signed-in buyer's own inquiries (the buyer comes from the session; a buyerId parameter is never read), 20 a page, at most 50.
 * Every parameter is validated; nothing from the query reaches the database except as an escaped literal or an exact value.
 * `data.statusCounts` are counted under the other filters so every status tab shows what it would return.
 */
async function handleGET(request: Request) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const query = parseListQuery(params);
  if (!query.ok) return fail("Check the filters.", 400, query.fields);

  try {
    const result = await listBuyerInquiryPage(guard.user.id, query.value);
    return NextResponse.json({ ok: true, inquiries: result.inquiries, data: { statusCounts: result.statusCounts, appliedFilters: { q: query.value.q, status: query.value.status, inquiryType: query.value.inquiryType, supplierId: query.value.supplierId, categoryId: query.value.categoryId, range: query.value.window?.key ?? null, dateFrom: query.value.window?.startDate ?? null, dateTo: query.value.window?.endDate ?? null, sort: query.value.sort } }, meta: result.meta }, { headers: PRIVATE });
  } catch (error) {
    console.error("buyer inquiries read failed", (error as Error).message);
    return fail("We couldn't load your inquiries.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/inquiries", handleGET);
