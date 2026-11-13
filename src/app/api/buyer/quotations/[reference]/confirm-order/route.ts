import { clean, readSmallJson } from "@/lib/auth/http";
import { buyerGuard, json } from "@/lib/buyer/api";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { confirmOrder, getConfirmationState } from "@/lib/orders/orderConfirmation";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET: whether the signed-in buyer can confirm this accepted quotation, or the order that already exists. Read-only. */
async function handleGET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await buyerGuard();
  if ("response" in guard) return guard.response;
  const state = await getConfirmationState(guard.user.id, (await params).reference);
  return state ? json({ ok: true, data: state }) : json({ ok: false, message: "Nothing to confirm." }, 404);
}

/**
 * POST { idempotencyKey }: the buyer's EXPLICIT confirmation of an accepted quotation. Creates one order from the accepted version's stored
 * commercial fields; no payment is collected. Same quotation again returns the same order; a key used for another quotation is a 409.
 */
async function handlePOST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  if (isCrossSiteWrite(request)) return json({ ok: false, message: "This request was blocked." }, 403);
  const guard = await buyerGuard({ key: "order-confirm", limit: 10, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 1_000);
  if (!body) return json({ ok: false, message: "Invalid request." }, 413);
  try {
    const r = await confirmOrder(guard.user.id, (await params).reference, clean(body.idempotencyKey, 90));
    if (!r.ok) return json({ ok: false, code: r.code, message: r.message }, r.status);
    return json({ ok: true, message: r.replayed ? "This order was already confirmed." : "Order confirmed. No payment was taken.", data: { reference: r.reference, inventory: r.inventory } }, r.replayed ? 200 : 201);
  } catch (error) {
    console.error("order confirmation failed", (error as Error).message);
    return json({ ok: false, message: "We could not confirm the order right now. Nothing was created. Please try again." }, 503);
  }
}

export const GET = withApiPerf("GET api/buyer/quotations/:reference/confirm-order", handleGET);
export const POST = withApiPerf("POST api/buyer/quotations/:reference/confirm-order", handlePOST);
