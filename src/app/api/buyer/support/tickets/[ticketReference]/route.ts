import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { TICKET_REFERENCE_PATTERN } from "@/lib/support/ticketRules";
import { getBuyerTicketDetail } from "@/lib/support/ticketService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/support/tickets/<ticketReference>: one of the signed-in buyer's own tickets with its description, attachments (names
 * and sizes, with an owner-checked download link, never a storage path) and the buyer-visible history. Another buyer's, an unknown and
 * a malformed reference answer the same 404. The conversation itself is Page 37; this contract stays compatible with it.
 */
async function handleGET(_request: Request, { params }: { params: Promise<{ ticketReference: string }> }) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const { ticketReference } = await params;
  if (!TICKET_REFERENCE_PATTERN.test(ticketReference)) return fail("That ticket was not found.", 404);
  try {
    const detail = await getBuyerTicketDetail(guard.user.id, ticketReference);
    return detail ? NextResponse.json({ ok: true, data: detail }, { headers: { "Cache-Control": "private, no-store" } }) : fail("That ticket was not found.", 404);
  } catch (error) {
    console.error("buyer ticket read failed", (error as Error).message);
    return fail("We couldn't load this ticket.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/support/tickets/:ticketReference", handleGET);
