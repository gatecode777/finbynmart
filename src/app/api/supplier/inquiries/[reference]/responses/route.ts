import { requireSupplierApi } from "@/lib/auth/guards";
import { error, limit, readWrite, reply } from "@/lib/supplier/quoteHttp";
import { parseListQuery, parseResponseBody } from "@/lib/supplier/inquiryRules";
import { getResponses, sendResponse } from "@/lib/supplier/inquiryService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/supplier/inquiries/<reference>/responses?limit=&cursor= : this inquiry's conversation, newest first, cursor-paged (20 by default, 50 at most). Same 404 rule as the detail. */
async function handleGET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-inquiry-read", 240, 60);
  if (limited) return limited;
  const query = parseListQuery(new URL(request.url).searchParams);
  if (!query.ok) return reply({ ok: false, message: "Check the request.", fields: query.fields }, 422);
  const { reference } = await context.params;
  try {
    const page = await getResponses(guard.context, reference, query);
    return page ? reply({ ok: true, items: page.items, meta: { nextCursor: page.nextCursor, limit: query.limit } }) : error(404, "Inquiry not found.", "NOT_FOUND");
  } catch (e) {
    console.error("inquiry responses failed", (e as Error).message);
    return error(503, "We could not load the responses.");
  }
}

/**
 * POST /api/supplier/inquiries/<reference>/responses { type: "RESPONSE" | "CLARIFICATION", message, idempotencyKey } (the key may be the Idempotency-Key header)
 * Only those three fields are accepted; an author, company, recipient, time, status or attachment in the body is a 422. The author, company, recipient,
 * time and the inquiry's own lifecycle steps are decided by the server. One transaction: the message, the allowed status steps, the notification outbox row
 * and the idempotency record commit together. The same key + same content returns the original result; the same key with different content is a 409.
 * 403 without the respond permission, 404 for an inquiry that is not the company's, 409 for a closed / cancelled / declined inquiry, 413 for a large body,
 * 429 when rate limited. The buyer's in-app notice follows the commit; the answer says whether it was recorded. No e-mail is sent or claimed.
 */
async function handlePOST(request: Request, context: { params: Promise<{ reference: string }> }) {
  const read = await readWrite(request);
  if (!read.ok) return read.response;
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-inquiry-respond", 30, 600, true);
  if (limited) return limited;
  const parsed = parseResponseBody(read.body, request.headers.get("idempotency-key"));
  if (!parsed.ok) return reply({ ok: false, code: "VALIDATION", message: "Check the highlighted fields.", fields: parsed.fields }, 422);
  const { reference } = await context.params;
  try {
    const result = await sendResponse(guard.context, guard.user, reference, parsed.value);
    if (!result.ok) return reply({ ok: false, code: result.code, message: result.message, ...(result.fields ? { fields: result.fields } : {}), ...(result.data !== undefined ? { data: result.data } : {}) }, result.status);
    return reply(
      {
        ok: true,
        message: result.buyerNotice === "recorded" ? "Sent. The buyer has an in-app notice." : result.buyerNotice === "pending" ? "Sent. The buyer's in-app notice is queued and will be delivered shortly." : "Sent. No in-app notice was recorded for the buyer (their notification settings may be off).",
        data: { message: result.message, inquiry: result.inquiry, replayed: result.replayed, buyerNotice: result.buyerNotice },
      },
      result.replayed ? 200 : 201,
    );
  } catch (e) {
    console.error("inquiry response failed", (e as Error).message);
    return error(503, "We could not send your message. Nothing was sent. You can retry safely.", "SERVER");
  }
}

export const GET = withApiPerf("GET api/supplier/inquiries/:reference/responses", handleGET);
export const POST = withApiPerf("POST api/supplier/inquiries/:reference/responses", handlePOST);
