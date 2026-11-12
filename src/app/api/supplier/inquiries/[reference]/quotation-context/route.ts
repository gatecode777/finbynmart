import { requireSupplierApi } from "@/lib/auth/guards";
import { error, limit, reply } from "@/lib/supplier/quoteHttp";
import { getQuotationContext } from "@/lib/supplier/quoteService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/supplier/inquiries/<reference>/quotation-context : one of the company's inquiries as a quotation is prepared for it (the buyer's requirement
 * as recorded, status, whether it can still be quoted, any open quotation, the defaults, the configured options and what is not available).
 * An unknown, malformed or another seller's reference is the same 404. The original requirement is read only: nothing here changes it.
 */
async function handleGET(_request: Request, context: { params: Promise<{ reference: string }> }) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-quotations", 240, 60);
  if (limited) return limited;
  const { reference } = await context.params;
  try {
    const data = await getQuotationContext(guard.context, reference);
    if (!data) return error(404, "Inquiry not found.", "NOT_FOUND");
    return reply({ ok: true, data });
  } catch (e) {
    console.error("quotation context failed", (e as Error).message);
    return error(503, "We could not load this inquiry.");
  }
}

export const GET = withApiPerf("GET api/supplier/inquiries/:reference/quotation-context", handleGET);
