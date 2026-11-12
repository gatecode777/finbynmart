import { requireSupplierApi } from "@/lib/auth/guards";
import { limit, pageParams, reply } from "@/lib/supplier/quoteHttp";
import { PICKER_MAX_PAGE_SIZE, PICKER_PAGE_SIZE, searchOwnProducts } from "@/lib/supplier/quoteService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/supplier/quotation-products?q=&page=&limit= : name search over the session company's OWN products only (never the whole catalogue), 20 per page, 50 at most. */
async function handleGET(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-quotations", 240, 60);
  if (limited) return limited;
  const params = pageParams(new URL(request.url), PICKER_PAGE_SIZE, PICKER_MAX_PAGE_SIZE);
  if (!params.ok) return reply({ ok: false, message: "Check the search.", fields: params.fields }, 422);
  const result = searchOwnProducts(guard.context, params);
  return reply({ ok: true, items: result.items, meta: result.meta });
}

export const GET = withApiPerf("GET api/supplier/quotation-products", handleGET);
