import { requireSupplierApi } from "@/lib/auth/guards";
import { error, limit, reply } from "@/lib/supplier/quoteHttp";
import { getRelatedQuotations } from "@/lib/supplier/inquiryService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/supplier/inquiries/<reference>/quotations : the company's current quotations for THIS inquiry (at most 20), the same row shape as the quotations list. */
async function handleGET(_request: Request, context: { params: Promise<{ reference: string }> }) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-inquiry-read", 240, 60);
  if (limited) return limited;
  const { reference } = await context.params;
  try {
    const rows = await getRelatedQuotations(guard.context, reference);
    return rows ? reply({ ok: true, items: rows }) : error(404, "Inquiry not found.", "NOT_FOUND");
  } catch (e) {
    console.error("inquiry quotations failed", (e as Error).message);
    return error(503, "We could not load the quotations.");
  }
}

export const GET = withApiPerf("GET api/supplier/inquiries/:reference/quotations", handleGET);
