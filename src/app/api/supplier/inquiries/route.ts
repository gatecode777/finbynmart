import { requireSupplierApi } from "@/lib/auth/guards";
import { error, limit, pageParams, reply } from "@/lib/supplier/quoteHttp";
import { PICKER_MAX_PAGE_SIZE, PICKER_PAGE_SIZE, listQuotableInquiries } from "@/lib/supplier/quoteService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/supplier/inquiries?q=&page=&limit= : the inquiries the session's company may QUOTE (addressed to its own sellers, from a registered buyer,
 * not closed / cancelled / declined), newest first, 20 per page (50 at most). This is the picker for Create Quotation; it is not the Page 40 inquiries
 * workspace. The company is the session's; no company or seller parameter is read. Buyer = business name only. Private, never cached.
 */
async function handleGET(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-quotations", 240, 60);
  if (limited) return limited;
  const params = pageParams(new URL(request.url), PICKER_PAGE_SIZE, PICKER_MAX_PAGE_SIZE);
  if (!params.ok) return reply({ ok: false, message: "Check the search.", fields: params.fields }, 422);
  try {
    const result = await listQuotableInquiries(guard.context, params);
    return reply({ ok: true, items: result.items, data: { noSellers: result.noSellers }, meta: result.meta });
  } catch (e) {
    console.error("quotable inquiries failed", (e as Error).message);
    return error(503, "We could not load your inquiries.");
  }
}

export const GET = withApiPerf("GET api/supplier/inquiries", handleGET);
