import { fail, readSmallJson } from "@/lib/auth/http";
import { buyerGuard, json } from "@/lib/buyer/api";
import { FORBIDDEN_CONVERSATION_FIELDS, validateFeedback } from "@/lib/support/conversationRules";
import { submitBuyerFeedback } from "@/lib/support/ticketActions";
import { TICKET_REFERENCE_PATTERN } from "@/lib/support/ticketRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/buyer/support/tickets/<ref>/feedback { rating (1-5), feedbackText? }: feedback on the resolution of the buyer's own resolved
 * or closed ticket. One per ticket (a second is 409). The buyer and the ticket come from the session and the address, never from the
 * body. 10 per buyer per hour.
 */
async function handlePOST(request: Request, { params }: { params: Promise<{ ticketReference: string }> }) {
  const guard = await buyerGuard({ key: "support-feedback", limit: 10, windowSeconds: 3600 });
  if ("response" in guard) return guard.response;
  const { ticketReference } = await params;
  if (!TICKET_REFERENCE_PATTERN.test(ticketReference)) return fail("That ticket was not found.", 404);
  const body = await readSmallJson(request);
  if (!body) return json({ ok: false, message: "Send your rating." }, 400);
  for (const key of FORBIDDEN_CONVERSATION_FIELDS) if (key in body) return json({ ok: false, message: "Check the highlighted fields.", fields: { [key]: "This value cannot be sent." } }, 400);
  const checked = validateFeedback(body);
  if (!checked.ok) return json({ ok: false, message: "Check the highlighted fields.", fields: checked.fields }, 400);
  try {
    const result = await submitBuyerFeedback({ id: guard.user.id }, ticketReference, checked.value);
    if (!result.ok) return json({ ok: false, code: result.code, message: result.message }, result.code === "NOT_FOUND" ? 404 : 409);
    return json({ ok: true, message: "Thank you. Your feedback was saved.", data: { rating: result.rating, submittedLabel: result.submittedLabel } }, 201);
  } catch (error) {
    console.error("buyer ticket feedback failed", (error as Error).message);
    return json({ ok: false, message: "We couldn't save your feedback right now. Please try again." }, 503);
  }
}

export const POST = withApiPerf("POST api/buyer/support/tickets/:ticketReference/feedback", handlePOST);
