import { requireSupplierApi } from "@/lib/auth/guards";
import { error, limit, reply } from "@/lib/supplier/quoteHttp";
import { listVersions, parseVersionList } from "@/lib/supplier/quotationService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/supplier/quotations/<reference>/versions?limit=&cursor= : version SUMMARIES of one of the company's quotations (number, status, current / accepted /
 * draft, dates, total, validity, revision reason), newest first, 20 per page (50 at most); `cursor` is the lowest version already shown. No line items, events or
 * snapshot input: a full version is read only when it is selected (GET /api/supplier/quotations/<reference>?version=n). Unknown, malformed and another
 * supplier's reference are the same 404.
 */
async function handleGET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-quotations", 240, 60);
  if (limited) return limited;
  const query = parseVersionList(new URL(request.url).searchParams);
  if (!query.ok) return reply({ ok: false, message: "Check the request.", fields: query.fields }, 422);
  const { reference } = await context.params;
  try {
    const page = await listVersions(guard.context, reference, query);
    return page ? reply({ ok: true, items: page.items, data: { versions: page.items }, meta: { total: page.total, limit: query.limit, nextCursor: page.nextCursor } }) : error(404, "Quotation not found.", "NOT_FOUND");
  } catch (e) {
    console.error("supplier quotation versions failed", (e as Error).message);
    return error(503, "We could not load the versions.");
  }
}

export const GET = withApiPerf("GET api/supplier/quotations/:reference/versions", handleGET);
