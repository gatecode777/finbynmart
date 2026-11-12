import { requireSupplierApi } from "@/lib/auth/guards";
import { error, failureResponse, limit, reply } from "@/lib/supplier/quoteHttp";
import { getDraft } from "@/lib/supplier/quoteService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/supplier/quotations/<reference>/draft : the editable draft with its revision, the inquiry, the server calculation and the configured options. 404 for anything outside the company, 409 once submitted. */
async function handleGET(_request: Request, context: { params: Promise<{ reference: string }> }) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-quotations", 240, 60);
  if (limited) return limited;
  const { reference } = await context.params;
  try {
    const result = await getDraft(guard.context, reference);
    return result.ok ? reply({ ok: true, data: result.draft }) : failureResponse(result);
  } catch (e) {
    console.error("draft read failed", (e as Error).message);
    return error(503, "We could not load this draft.");
  }
}

export const GET = withApiPerf("GET api/supplier/quotations/:reference/draft", handleGET);
