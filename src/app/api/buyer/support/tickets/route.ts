import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { buyerGuard, json } from "@/lib/buyer/api";
import { attachmentLimits, createBuyerTicket, listBuyerTickets, type UploadedFile } from "@/lib/support/ticketService";
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

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limits.maxFiles * limits.maxBytes + 256 * 1024) return json({ ok: false, message: `The upload is too large: at most ${limits.maxFiles} files of ${limits.maxMb} MB.`, fields: { attachments: "Too large." } }, 413);

  let payload: unknown;
  const files: UploadedFile[] = [];
  const type = request.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return json({ ok: false, message: "Send the ticket as a form upload." }, 400);
    }
    const raw = form.get("payload");
    try {
      payload = typeof raw === "string" && raw.length <= 8_000 ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }
    const sent = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (sent.length > limits.maxFiles) return json({ ok: false, message: `You can attach at most ${limits.maxFiles} files.`, fields: { attachments: `At most ${limits.maxFiles} files.` } }, 400);
    for (const f of sent) {
      if (f.size > limits.maxBytes) return json({ ok: false, message: `${f.name.slice(0, 60)} is larger than ${limits.maxMb} MB.`, fields: { attachments: `Each file can be at most ${limits.maxMb} MB.` } }, 413);
      files.push({ name: f.name, bytes: Buffer.from(await f.arrayBuffer()) });
    }
  } else {
    try {
      const text = await request.text();
      payload = text.length <= 8_000 ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ ok: false, message: "Send the ticket details." }, 400);
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
