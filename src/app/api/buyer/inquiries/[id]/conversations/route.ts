import { NextResponse } from "next/server";
import { fail, tooMany } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { listResponders } from "@/lib/inquiries/conversations";
import { rateLimit } from "@/lib/security/rateLimit";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/buyer/inquiries/<reference>/conversations: the suppliers that replied or quoted for the buyer's OWN requirement (never every matched company). */
async function handleGET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`buyer-conversations:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const { id } = await params;
  try {
    const data = await listResponders(guard.user.id, id);
    if (!data) return fail("That requirement was not found.", 404);
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("buyer conversations failed", (error as Error).message);
    return fail("We couldn't load the suppliers right now. Please try again.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/inquiries/:id/conversations", handleGET);
