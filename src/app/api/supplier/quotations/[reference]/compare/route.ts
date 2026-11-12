import { requireSupplierApi } from "@/lib/auth/guards";
import { error, failureResponse, limit, reply } from "@/lib/supplier/quoteHttp";
import { compareVersions } from "@/lib/supplier/quotationVersions";
import { parseVersionNumber } from "@/lib/supplier/quotationService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/supplier/quotations/<reference>/compare?from=<version>&to=<version> : the differences between two versions of ONE of the company's quotations.
 * Both must be whole version numbers of the same quotation and the same company, or it is the same 404 as an unknown quotation (a version of another
 * quotation can never be named, because only this reference is searched). Only those two documents are read; nothing is written. Lines are matched by their
 * stable id; a numeric difference appears only for amounts in the same currency.
 */
async function handleGET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-quotations", 240, 60);
  if (limited) return limited;
  const params = new URL(request.url).searchParams;
  const from = parseVersionNumber(params.get("from") ?? undefined);
  const to = parseVersionNumber(params.get("to") ?? undefined);
  if (from === null || to === null) return reply({ ok: false, code: "VALIDATION", message: "Choose two versions to compare.", fields: { ...(from === null ? { from: "A whole version number is required." } : {}), ...(to === null ? { to: "A whole version number is required." } : {}) } }, 422);
  const { reference } = await context.params;
  try {
    const result = await compareVersions(guard.context, reference, from, to);
    return result.ok ? reply({ ok: true, data: result.result }) : failureResponse(result);
  } catch (e) {
    console.error("compare failed", (e as Error).message);
    return error(503, "We could not compare these versions.");
  }
}

export const GET = withApiPerf("GET api/supplier/quotations/:reference/compare", handleGET);
