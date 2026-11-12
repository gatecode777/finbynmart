import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireSupplierApi } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rateLimit";
import { attachmentLimits, createBuyerTicket, listBuyerTickets } from "@/lib/support/ticketService";
import { readSupportUpload } from "@/lib/support/uploadRequest";
import { FORBIDDEN_TICKET_FIELDS, parseTicketQuery, validateTicket } from "@/lib/support/ticketRules";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const query = parseTicketQuery(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.ok) return fail("Check the filters.", 400, query.fields);

  try {
    const result = await listBuyerTickets(guard.user.id, query.value);
    return NextResponse.json(
      { ok: true, tickets: result.tickets, meta: result.meta },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("supplier tickets read failed", (error as Error).message);
    return fail("We couldn't load your tickets.", 503);
  }
}

export async function POST(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const limit = await rateLimit(`supplier-support:${guard.user.id}`, 20, 3600);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, message: "Too many requests. Please wait." }, { status: 429 });
  }

  const limits = attachmentLimits();
  const upload = await readSupportUpload(request, limits);
  if (!upload.ok) return upload.response;

  const { payload, files } = upload;
  for (const forbidden of FORBIDDEN_TICKET_FIELDS) {
    if (forbidden in (payload as Record<string, unknown>)) {
      return fail("This field cannot be set directly.", 400, { [forbidden]: "This field cannot be set directly." });
    }
  }

  const valid = validateTicket(payload);
  if (!valid.ok) return fail("Check the ticket details.", 400, valid.fields);

  const outcome = await createBuyerTicket(
    { id: guard.user.id, name: guard.user.name, email: guard.user.email },
    valid.value,
    files
  );

  if (!outcome.ok) return fail(outcome.message, 400, { [outcome.field]: outcome.message });

  return NextResponse.json(
    {
      ok: true,
      ticket: outcome.ticket,
      message: outcome.duplicate ? "Your existing ticket was returned." : "Your support ticket was submitted.",
      duplicate: outcome.duplicate,
      attachedFiles: outcome.attachments,
    },
    { status: outcome.duplicate ? 200 : 201, headers: { "Cache-Control": "private, no-store" } }
  );
}
