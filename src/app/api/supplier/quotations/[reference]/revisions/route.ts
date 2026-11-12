import { requireSupplierApi } from "@/lib/auth/guards";
import { error, failureResponse, limit, readWrite, reply } from "@/lib/supplier/quoteHttp";
import { createRevision } from "@/lib/supplier/quotationVersions";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/supplier/quotations/<reference>/revisions { baseVersion, reason, idempotencyKey } (the key may be the Idempotency-Key header)
 * Creates a revision DRAFT: version + 1 of the same quotation, a copy of the current version's own commercial data, NOT the current offer (the buyer keeps
 * seeing the current submitted version until the revision is submitted through the create-quotation workflow). Nothing is sent to the buyer. Only the current
 * version of a quotation still waiting on the buyer can be revised: an accepted, rejected, withdrawn, draft or historical version is refused (409), as is a
 * second revision draft (409 REVISION_EXISTS with the draft to continue). A reason of 3 to 300 characters is required. Idempotent: the same key and body
 * returns the original result, a changed body with the same key is 409. 403 without the permission, 404 outside the company, 413 / 422 / 429 as usual.
 */
async function handlePOST(request: Request, context: { params: Promise<{ reference: string }> }) {
  const read = await readWrite(request);
  if (!read.ok) return read.response;
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-quote-revise", 20, 600, true);
  if (limited) return limited;
  const { reference } = await context.params;
  const key = read.body.idempotencyKey ?? request.headers.get("idempotency-key") ?? undefined;
  try {
    const result = await createRevision(guard.context, guard.user, reference, { baseVersion: read.body.baseVersion, reason: read.body.reason, idempotencyKey: key });
    if (!result.ok) return failureResponse(result);
    return reply({ ok: true, message: "Revision draft created. The buyer has not been told: it is not the current offer until you submit it.", data: { reference: result.reference, version: result.version, editHref: result.editHref, replayed: result.replayed } }, result.replayed ? 200 : 201);
  } catch (e) {
    console.error("revision failed", (e as Error).message);
    return error(503, "We could not create the revision. Nothing was created. You can retry safely.", "SERVER");
  }
}

export const POST = withApiPerf("POST api/supplier/quotations/:reference/revisions", handlePOST);
