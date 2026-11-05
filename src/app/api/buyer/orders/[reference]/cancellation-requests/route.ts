import { fail, readSmallJson } from "@/lib/auth/http";
import { buyerGuard, json } from "@/lib/buyer/api";
import { REFERENCE_PATTERN, validateCancellation } from "@/lib/orders/orderRules";
import { requestOrderCancellation } from "@/lib/orders/service";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/buyer/orders/<reference>/cancellation-requests { reason, confirm: true }
 * The buyer asks to cancel their own order before it is dispatched. This records the REQUEST only: the order is not cancelled, nothing
 * is refunded and the supplier is not notified (no supplier workflow, payment or notification module exists), and the answer says so.
 * A repeat, a dispatched / delivered / closed order and a foreign reference change nothing (409 / 404).
 */
async function handlePOST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await buyerGuard({ key: "order-cancel-request", limit: 20, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const { reference } = await params;
  if (!REFERENCE_PATTERN.test(reference)) return json({ ok: false, message: "That order was not found." }, 404);
  const body = await readSmallJson(request, 2_000);
  if (!body) return fail("Invalid request.");
  const checked = validateCancellation(body);
  if (!checked.ok) return json({ ok: false, message: "Check the highlighted fields.", fields: checked.fields }, 400);
  try {
    const result = await requestOrderCancellation(guard.user.id, reference, checked.value.reason);
    return result.ok
      ? json({ ok: true, status: result.status, statusLabel: result.statusLabel, supplierNotified: false, message: "Your cancellation request was saved. The order is not cancelled yet: the supplier has to agree, the supplier is not notified automatically, and nothing is refunded by this request." }, 201)
      : json({ ok: false, code: result.code, message: result.message }, result.code === "NOT_FOUND" ? 404 : 409);
  } catch (error) {
    console.error("order cancellation request failed", (error as Error).message);
    return json({ ok: false, message: "We couldn't save your request right now. Nothing was changed. Please try again." }, 503);
  }
}

export const POST = withApiPerf("POST api/buyer/orders/:reference/cancellation-requests", handlePOST);
