import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { TICKET_REFERENCE_PATTERN } from "@/lib/support/ticketRules";
import { readBuyerTicketAttachment } from "@/lib/support/conversationService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/support/tickets/<ticketReference>/attachments/<attachmentId>: streams one attachment, only to the ticket's own buyer.
 * There is no public or long-lived URL: the file lives in private storage under a random name, is re-checked by content on every read,
 * and is sent as a download with no-store caching and nosniff. Another buyer's ticket, an unknown attachment and a malformed id are
 * the same 404.
 */
async function handleGET(_request: Request, { params }: { params: Promise<{ ticketReference: string; attachmentId: string }> }) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const { ticketReference, attachmentId } = await params;
  if (!TICKET_REFERENCE_PATTERN.test(ticketReference)) return fail("That file was not found.", 404);
  try {
    const file = await readBuyerTicketAttachment(guard.user.id, ticketReference, attachmentId);
    if (!file) return fail("That file was not found.", 404);
    const safeName = file.name.replace(/[^\w. -]/g, "_").slice(0, 100) || "attachment";
    return new NextResponse(new Uint8Array(file.bytes), { status: 200, headers: { "Content-Type": file.mime, "Content-Disposition": `attachment; filename="${safeName}"`, "Content-Length": String(file.bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("ticket attachment read failed", (error as Error).message);
    return fail("We couldn't load this file.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/support/tickets/:ticketReference/attachments/:attachmentId", handleGET);
