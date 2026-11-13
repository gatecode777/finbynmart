import { NextResponse } from "next/server";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { getConversation, sendBuyerReply } from "@/lib/inquiries/conversations";
import { RESPONSES_MAX_PAGE_SIZE, RESPONSES_PAGE_SIZE } from "@/lib/supplier/inquiryRules";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; conversation: string }> };

/** GET: one page (newest first) of ONE supplier conversation of the buyer's own requirement. */
async function handleGET(request: Request, { params }: Ctx) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`buyer-conversation-read:${guard.user.id}`, 300, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const { id, conversation } = await params;
  const sp = new URL(request.url).searchParams;
  const size = Math.min(RESPONSES_MAX_PAGE_SIZE, Math.max(1, Number(sp.get("limit")) || RESPONSES_PAGE_SIZE));
  try {
    const page = await getConversation(guard.user.id, id, conversation, { limit: size, cursor: sp.get("cursor") });
    if (!page) return fail("Conversation not found.", 404);
    return NextResponse.json({ ok: true, data: page }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("buyer conversation read failed", (error as Error).message);
    return fail("We couldn't load the conversation right now. Please try again.", 503);
  }
}

/** POST {message, idempotencyKey}: the buyer's private reply to THIS supplier only. Author, recipient and time are decided by the server. */
async function handlePOST(request: Request, { params }: Ctx) {
  if (isCrossSiteWrite(request)) return fail("This request was blocked because it did not come from this site.", 403);
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 6_000);
  if (!body) return fail("Send the message as JSON.", 400);
  const limit = await rateLimit(`buyer-conversation-send:${guard.user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const { id, conversation } = await params;
  try {
    // only `message` and `idempotencyKey` are read: a sender, supplier, company or type in the body is ignored
    const r = await sendBuyerReply(guard.user.id, id, conversation, { message: body.message, idempotencyKey: body.idempotencyKey });
    if (!r.ok) return fail(r.message, r.status, r.fields);
    return NextResponse.json({ ok: true, message: r.replayed ? "Your message was already sent." : "Your message was sent to this supplier.", data: r.message, replayed: r.replayed }, { status: r.replayed ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("buyer reply failed", (error as Error).message);
    return fail("We couldn't send your message right now. Nothing was sent. Please try again.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/inquiries/:id/conversations/:conversation", handleGET);
export const POST = withApiPerf("POST api/buyer/inquiries/:id/conversations/:conversation", handlePOST);
