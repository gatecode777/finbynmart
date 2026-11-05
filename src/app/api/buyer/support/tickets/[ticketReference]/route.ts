import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { TICKET_REFERENCE_PATTERN } from "@/lib/support/ticketRules";
import { getBuyerTicketOverview } from "@/lib/support/conversationService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/support/tickets/<ticketReference>: the signed-in buyer's own ticket: reference, subject, category, status, dates, what
 * it is about, and the actions the buyer may take NOW (reply, reopen, feedback) with the reason when one is not allowed. The
 * conversation, timeline, files and related record have their own routes. Another buyer's, an unknown and a malformed reference
 * answer the same 404.
 */
async function handleGET(_request: Request, { params }: { params: Promise<{ ticketReference: string }> }) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const { ticketReference } = await params;
  if (!TICKET_REFERENCE_PATTERN.test(ticketReference)) return fail("That ticket was not found.", 404);
  try {
    const overview = await getBuyerTicketOverview(guard.user.id, ticketReference);
    return overview ? NextResponse.json({ ok: true, data: overview }, { headers: { "Cache-Control": "private, no-store" } }) : fail("That ticket was not found.", 404);
  } catch (error) {
    console.error("buyer ticket read failed", (error as Error).message);
    return fail("We couldn't load this ticket.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/support/tickets/:ticketReference", handleGET);
