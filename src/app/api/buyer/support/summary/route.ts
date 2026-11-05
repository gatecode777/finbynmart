import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { getBuyerTicketSummary } from "@/lib/support/ticketService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/support/summary: the four numbers over ALL of the signed-in buyer's tickets (total, open, in progress, resolved),
 * counted from the stored statuses with one grouped read. Open means needing attention (open, assigned, reopened, waiting for you),
 * in progress means being worked on, resolved means resolved or closed.
 */
async function handleGET() {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ ok: true, data: { summary: await getBuyerTicketSummary(guard.user.id) } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("buyer ticket summary failed", (error as Error).message);
    return fail("We couldn't load your ticket summary.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/support/summary", handleGET);
