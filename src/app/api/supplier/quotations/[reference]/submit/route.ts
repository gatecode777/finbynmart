import { requireSupplierApi } from "@/lib/auth/guards";
import { error, failureResponse, limit, readWrite, reply } from "@/lib/supplier/quoteHttp";
import { submitQuotation } from "@/lib/supplier/quoteService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/supplier/quotations/<reference>/submit { confirm: true, expectedRevision, expectedTotal, expectedTaxRuleVersion, idempotencyKey }
 * (the key may instead be the Idempotency-Key header). One atomic transaction: claim of the key, the draft becomes SENT with an immutable commercial
 * snapshot, the inquiry follows its lifecycle, a notification outbox row is written. The server recalculates the total; a total or tax treatment different
 * from the one reviewed is a 409 with the new calculation, never a silent change. The same key with the same body returns the original result; with a
 * changed body, 409. 422 for what is missing or invalid, including an unresolved tax treatment. The buyer's in-app notice is sent after the commit and
 * the answer says whether it was recorded; no e-mail is sent or claimed.
 */
async function handlePOST(request: Request, context: { params: Promise<{ reference: string }> }) {
  const read = await readWrite(request);
  if (!read.ok) return read.response;
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-quote-submit", 20, 600, true);
  if (limited) return limited;
  const { reference } = await context.params;
  const body = { ...read.body, idempotencyKey: read.body.idempotencyKey ?? request.headers.get("idempotency-key") ?? undefined };
  try {
    const result = await submitQuotation(guard.context, guard.user, reference, body as never);
    if (!result.ok) return failureResponse(result);
    return reply({
      ok: true,
      message: result.buyerNotice === "recorded" ? "Quotation submitted. The buyer has an in-app notice." : result.buyerNotice === "pending" ? "Quotation submitted. The buyer's in-app notice is queued and will be delivered shortly." : "Quotation submitted. No in-app notice was recorded for the buyer (their notification settings may be off).",
      data: { ...result.response, replayed: result.replayed, buyerNotice: result.buyerNotice, href: `/supplier/quotations/${result.response.reference}` },
    });
  } catch (e) {
    console.error("submit failed", (e as Error).message);
    return error(503, "We could not submit the quotation. Nothing was sent. You can retry safely with the same key.", "SERVER");
  }
}

export const POST = withApiPerf("POST api/supplier/quotations/:reference/submit", handlePOST);
