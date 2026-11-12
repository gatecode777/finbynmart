import { requireSupplierApi } from "@/lib/auth/guards";
import { error, limit, reply } from "@/lib/supplier/quoteHttp";
import { getActivity } from "@/lib/supplier/inquiryService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/supplier/inquiries/<reference>/activity : what really happened on this inquiry (received, status changes, responses, quotation events), newest first, at most 50 (`truncated` says if there was more). No security log, no other supplier, no invented event. */
async function handleGET(_request: Request, context: { params: Promise<{ reference: string }> }) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-inquiry-read", 240, 60);
  if (limited) return limited;
  const { reference } = await context.params;
  try {
    const data = await getActivity(guard.context, reference);
    return data ? reply({ ok: true, items: data.items, meta: { truncated: data.truncated } }) : error(404, "Inquiry not found.", "NOT_FOUND");
  } catch (e) {
    console.error("inquiry activity failed", (e as Error).message);
    return error(503, "We could not load the activity.");
  }
}

export const GET = withApiPerf("GET api/supplier/inquiries/:reference/activity", handleGET);
