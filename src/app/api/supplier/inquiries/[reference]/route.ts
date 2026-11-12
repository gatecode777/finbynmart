import { requireSupplierApi } from "@/lib/auth/guards";
import { error, limit, reply } from "@/lib/supplier/quoteHttp";
import { getInquiryDetail } from "@/lib/supplier/inquiryService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/supplier/inquiries/<reference> : one inquiry addressed to the session company's own sellers: the buyer's requirement as written, the buyer's
 * business name (nothing else about them), what the company may do next. Unknown, malformed and another seller's reference are the same 404; nothing is
 * read before the company is resolved. Private, never cached.
 */
async function handleGET(_request: Request, context: { params: Promise<{ reference: string }> }) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-inquiry-read", 240, 60);
  if (limited) return limited;
  const { reference } = await context.params;
  try {
    const data = await getInquiryDetail(guard.context, reference);
    return data ? reply({ ok: true, data }) : error(404, "Inquiry not found.", "NOT_FOUND");
  } catch (e) {
    console.error("inquiry detail failed", (e as Error).message);
    return error(503, "We could not load this inquiry.");
  }
}

export const GET = withApiPerf("GET api/supplier/inquiries/:reference", handleGET);
