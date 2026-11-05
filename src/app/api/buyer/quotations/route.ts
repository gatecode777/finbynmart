import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { listBuyerQuotations } from "@/lib/quotations/service";
import { parseQuotationQuery } from "@/lib/quotations/quotationRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/quotations?q=&status=&sort=&page=&limit=
 * The signed-in buyer's own quotations (current versions only, never drafts; the buyer comes from the session, a buyerId parameter is
 * never read). `data` carries the tab counts and the summary numbers over all of the buyer's quotations.
 */
async function handleGET(request: Request) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const query = parseQuotationQuery(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.ok) return fail("Check the filters.", 400, query.fields);
  try {
    const page = await listBuyerQuotations(guard.user.id, query.value);
    return NextResponse.json({ ok: true, quotations: page.quotations, data: { tabCounts: page.tabCounts, summary: page.summary }, meta: page.meta }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("buyer quotations read failed", (error as Error).message);
    return fail("We couldn't load your quotations.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/quotations", handleGET);
