import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { json } from "@/lib/buyer/api";
import { getBuyerRelatedDetails } from "@/lib/support/relatedDetails";
import { TICKET_REFERENCE_PATTERN } from "@/lib/support/ticketRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/buyer/support/tickets/<ref>/related: the record the ticket is about, read again now and only if it is still the buyer's. */
async function handleGET(_request: Request, { params }: { params: Promise<{ ticketReference: string }> }) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const { ticketReference } = await params;
  if (!TICKET_REFERENCE_PATTERN.test(ticketReference)) return fail("That ticket was not found.", 404);
  try {
    const result = await getBuyerRelatedDetails(guard.user.id, ticketReference);
    return result ? json({ ok: true, data: result }) : fail("That ticket was not found.", 404);
  } catch (error) {
    console.error("buyer ticket related read failed", (error as Error).message);
    return fail("We couldn't load the related details.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/support/tickets/:ticketReference/related", handleGET);
