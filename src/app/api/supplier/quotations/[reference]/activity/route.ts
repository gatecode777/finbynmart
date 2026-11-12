import { requireSupplierApi } from "@/lib/auth/guards";
import { error, limit, reply } from "@/lib/supplier/quoteHttp";
import { getQuotationActivity } from "@/lib/supplier/quotationVersions";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/supplier/quotations/<reference>/activity : what really happened to this quotation across its versions (drafts, submissions, revisions, replacements, withdrawal, the buyer's recorded decisions, derived expiry), newest first, at most 50. No viewed / read / delivered event, no order, no payment. */
async function handleGET(_request: Request, context: { params: Promise<{ reference: string }> }) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-quotations", 240, 60);
  if (limited) return limited;
  const { reference } = await context.params;
  try {
    const data = await getQuotationActivity(guard.context, reference);
    return data ? reply({ ok: true, items: data.items, meta: { truncated: data.truncated } }) : error(404, "Quotation not found.", "NOT_FOUND");
  } catch (e) {
    console.error("quotation activity failed", (e as Error).message);
    return error(503, "We could not load the activity.");
  }
}

export const GET = withApiPerf("GET api/supplier/quotations/:reference/activity", handleGET);
