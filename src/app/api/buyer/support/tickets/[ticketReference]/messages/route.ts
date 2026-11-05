import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { buyerGuard, json } from "@/lib/buyer/api";
import { FORBIDDEN_CONVERSATION_FIELDS, parsePageQuery, validateReply } from "@/lib/support/conversationRules";
import { createBuyerReply, listBuyerMessages } from "@/lib/support/conversationService";
import { TICKET_REFERENCE_PATTERN } from "@/lib/support/ticketRules";
import { attachmentLimits } from "@/lib/support/ticketService";
import { readSupportUpload } from "@/lib/support/uploadRequest";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ ticketReference: string }> };
const NOT_FOUND = () => fail("That ticket was not found.", 404);

/**
 * GET /api/buyer/support/tickets/<ref>/messages?limit=&before=: the buyer-visible conversation, newest page first, `before` walking back
 * to older messages (20 a page, at most 50). Only messages with visibility "buyer" are ever returned. The buyer's original description
 * is the first message and appears with the last (oldest) page.
 */
async function handleGET(request: Request, { params }: Ctx) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const { ticketReference } = await params;
  if (!TICKET_REFERENCE_PATTERN.test(ticketReference)) return NOT_FOUND();
  const query = parsePageQuery(Object.fromEntries(new URL(request.url).searchParams.entries()), "before");
  if (!query.ok) return fail("Check the page request.", 400, query.fields);
  try {
    const page = await listBuyerMessages(guard.user.id, ticketReference, query.value);
    return page ? json({ ok: true, data: { messages: page.messages }, meta: page.meta }) : NOT_FOUND();
  } catch (error) {
    console.error("buyer ticket messages read failed", (error as Error).message);
    return fail("We couldn't load the conversation.", 503);
  }
}

/**
 * POST /api/buyer/support/tickets/<ref>/messages: a buyer reply, as `multipart/form-data` (`payload` JSON { message, idempotencyKey } and
 * `files`) or JSON. The sender and role are the signed-in buyer: any sender, role, status, visibility or ticket field is refused. The
 * answer is the message as saved, sent only after it was saved. 30 replies per buyer per hour.
 */
async function handlePOST(request: Request, { params }: Ctx) {
  const guard = await buyerGuard({ key: "support-reply", limit: 30, windowSeconds: 3600 });
  if ("response" in guard) return guard.response;
  const { ticketReference } = await params;
  if (!TICKET_REFERENCE_PATTERN.test(ticketReference)) return NOT_FOUND();
  const upload = await readSupportUpload(request, attachmentLimits());
  if (!upload.ok) return upload.response;
  for (const key of FORBIDDEN_CONVERSATION_FIELDS) if (key in (upload.payload as Record<string, unknown>)) return json({ ok: false, message: "Check the highlighted fields.", fields: { [key]: "This value cannot be sent." } }, 400);
  const checked = validateReply(upload.payload);
  if (!checked.ok) return json({ ok: false, message: "Check the highlighted fields.", fields: checked.fields }, 400);
  try {
    const result = await createBuyerReply({ id: guard.user.id, name: guard.user.name, email: guard.user.email }, ticketReference, checked.value, upload.files);
    if (!result.ok) {
      if (result.code === "NOT_FOUND") return NOT_FOUND();
      const status = result.code === "NOT_ALLOWED" ? 409 : result.code === "STORAGE_UNAVAILABLE" ? 503 : 400;
      return json({ ok: false, code: result.code, message: result.message, fields: result.field ? { [result.field]: result.message } : undefined }, status);
    }
    return json({ ok: true, duplicate: result.duplicate, message: result.duplicate ? "This reply was already sent." : "Your reply was saved.", data: { message: result.message, status: result.status, statusChanged: result.statusChanged }, supportNotified: false }, result.duplicate ? 200 : 201);
  } catch (error) {
    console.error("buyer ticket reply failed", (error as Error).message);
    return json({ ok: false, message: "We couldn't save your reply right now. Nothing was sent. Please try again." }, 503);
  }
}

export const GET = withApiPerf("GET api/buyer/support/tickets/:ticketReference/messages", handleGET);
export const POST = withApiPerf("POST api/buyer/support/tickets/:ticketReference/messages", handlePOST);
