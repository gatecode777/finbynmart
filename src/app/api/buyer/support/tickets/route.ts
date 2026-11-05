import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { buyerGuard, json } from "@/lib/buyer/api";
import { attachmentLimits, createBuyerTicket, listBuyerTickets } from "@/lib/support/ticketService";
import { readSupportUpload } from "@/lib/support/uploadRequest";
import { FORBIDDEN_TICKET_FIELDS, parseTicketQuery, validateTicket } from "@/lib/support/ticketRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/support/tickets?q=&status=&categoryId=&relatedEntityType=&range=&dateFrom=&dateTo=&sort=&page=&limit=
 * The signed-in buyer's own tickets (the buyer comes from the session; a buyerId parameter is never read), 20 a page, at most 50.
 * Every parameter is validated; nothing from the query reaches the database except as an escaped literal or an exact value.
 */
async function handleGET(request: Request) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const query = parseTicketQuery(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.ok) return fail("Check the filters.", 400, query.fields);
  try {
    const result = await listBuyerTickets(guard.user.id, query.value);
    return NextResponse.json({ ok: true, tickets: result.tickets, meta: result.meta }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("buyer tickets read failed", (error as Error).message);
    return fail("We couldn't load your tickets.", 503);
  }
}

/**
 * POST /api/buyer/support/tickets: multipart/form-data with `payload` (JSON: category, related?, subject, description, idempotencyKey)
 * and `files` (0 to 5 PDF / JPG / PNG, 10 MB each by default), or the same payload as plain JSON when there are no files.
 * Nothing but those fields is read: a status, priority, agent, owner or reference sent by the client is refused. The ticket starts
 * OPEN. The answer is sent only after the ticket (and its files) were saved, and it says plainly that no support team replies
 * through this site yet.
 */
async function handlePOST(request: Request) {
  const guard = await buyerGuard({ key: "support-ticket", limit: 10, windowSeconds: 3600 });
  if ("response" in guard) return guard.response;
  const limits = attachmentLimits();
  const upload = await readSupportUpload(request, limits);
  if (!upload.ok) return upload.response;
  const { payload, files } = upload;
  for (const key of FORBIDDEN_TICKET_FIELDS) if (key in (payload as Record<string, unknown>)) return json({ ok: false, message: "Check the highlighted fields.", fields: { [key]: "This value cannot be sent." } }, 400);

  const checked = validateTicket(payload);
  if (!checked.ok) return json({ ok: false, message: "Check the highlighted fields.", fields: checked.fields }, 400);

  try {
    const result = await createBuyerTicket({ id: guard.user.id, name: guard.user.name, email: guard.user.email }, checked.value, files);
    if (!result.ok) return json({ ok: false, code: result.code, message: result.message, fields: { [result.field]: result.message } }, result.code === "STORAGE_UNAVAILABLE" ? 503 : 400);
    return json(
      {
        ok: true,
        duplicate: result.duplicate,
        ticket: result.ticket,
        attachments: result.attachments,
        supportNotified: false,
        message: result.duplicate ? `This ticket was already saved as ${result.ticket.reference}.` : `Your ticket ${result.ticket.reference} was saved. No support team replies through this site yet, so keep the reference.`,
      },
      result.duplicate ? 200 : 201,
    );
  } catch (error) {
    console.error("buyer ticket create failed", (error as Error).message);
    return json({ ok: false, message: "We couldn't save your ticket right now. Nothing was saved. Please try again." }, 503);
  }
}

export const GET = withApiPerf("GET api/buyer/support/tickets", handleGET);
export const POST = withApiPerf("POST api/buyer/support/tickets", handlePOST);
