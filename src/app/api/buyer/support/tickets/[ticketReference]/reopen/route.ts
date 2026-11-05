import { fail, readSmallJson } from "@/lib/auth/http";
import { buyerGuard, json } from "@/lib/buyer/api";
import { FORBIDDEN_CONVERSATION_FIELDS, validateReopen } from "@/lib/support/conversationRules";
import { reopenBuyerTicket } from "@/lib/support/ticketActions";
import { TICKET_REFERENCE_PATTERN } from "@/lib/support/ticketRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/buyer/support/tickets/<ref>/reopen { reason }: reopens the buyer's own resolved or closed ticket (within 30 days, at most 3
 * times) with the reason they give, which is kept in the conversation. The status is changed by the server only: nothing about the
 * new status is read from the request. 5 per buyer per hour.
 */
async function handlePOST(request: Request, { params }: { params: Promise<{ ticketReference: string }> }) {
  const guard = await buyerGuard({ key: "support-reopen", limit: 5, windowSeconds: 3600 });
  if ("response" in guard) return guard.response;
  const { ticketReference } = await params;
  if (!TICKET_REFERENCE_PATTERN.test(ticketReference)) return fail("That ticket was not found.", 404);
  const body = await readSmallJson(request);
  if (!body) return json({ ok: false, message: "Send the reason for reopening." }, 400);
  for (const key of FORBIDDEN_CONVERSATION_FIELDS) if (key in body) return json({ ok: false, message: "Check the highlighted fields.", fields: { [key]: "This value cannot be sent." } }, 400);
  const checked = validateReopen(body);
  if (!checked.ok) return json({ ok: false, message: "Check the highlighted fields.", fields: checked.fields }, 400);
  try {
    const result = await reopenBuyerTicket({ id: guard.user.id, name: guard.user.name, email: guard.user.email }, ticketReference, checked.value.reason);
    if (!result.ok) return json({ ok: false, code: result.code, message: result.message }, result.code === "NOT_FOUND" ? 404 : 409);
    return json({ ok: true, message: "Your ticket was reopened. No support team replies through this site yet, so keep the reference.", data: { status: result.status, statusLabel: result.statusLabel, updatedLabel: result.updatedLabel }, supportNotified: false });
  } catch (error) {
    console.error("buyer ticket reopen failed", (error as Error).message);
    return json({ ok: false, message: "We couldn't reopen the ticket right now. Nothing was changed. Please try again." }, 503);
  }
}

export const POST = withApiPerf("POST api/buyer/support/tickets/:ticketReference/reopen", handlePOST);
