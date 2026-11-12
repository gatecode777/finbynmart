import { requireSupplierApi } from "@/lib/auth/guards";
import { error, failureResponse, limit, readWrite, reply } from "@/lib/supplier/quoteHttp";
import { previewDraft } from "@/lib/supplier/quoteService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/supplier/quotations/<reference>/preview { input?, expectedRevision? } : validates and calculates exactly as submission would and returns the
 * view to review (authoritative totals as decimal strings, what still blocks submission, the tax treatment). It writes nothing, submits nothing and tells
 * nobody. `input` is checked and used for the preview but NOT saved.
 */
async function handlePOST(request: Request, context: { params: Promise<{ reference: string }> }) {
  const read = await readWrite(request);
  if (!read.ok) return read.response;
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-quote-preview", 120, 600, true);
  if (limited) return limited;
  const { reference } = await context.params;
  try {
    const result = await previewDraft(guard.context, reference, { input: read.body.input, expectedRevision: read.body.expectedRevision });
    return result.ok ? reply({ ok: true, data: result.preview }) : failureResponse(result);
  } catch (e) {
    console.error("preview failed", (e as Error).message);
    return error(503, "We could not prepare the preview.");
  }
}

export const POST = withApiPerf("POST api/supplier/quotations/:reference/preview", handlePOST);
