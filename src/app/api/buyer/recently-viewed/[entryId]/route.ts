import { NextResponse } from "next/server";
import { fail, tooMany } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { removeEntry } from "@/lib/recentlyViewed/service";
import { isEntryId } from "@/lib/recentlyViewed/rules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** DELETE /api/buyer/recently-viewed/[entryId] : remove one of this buyer's own entries. Idempotent (an entry that is already gone, or that belongs to someone else, gives the same answer and removes nothing of theirs). */
async function handleDELETE(request: Request, context: { params: Promise<{ entryId: string }> }) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  if (isCrossSiteWrite(request)) return fail("This request was blocked because it did not come from this site.", 403);
  const { entryId } = await context.params;
  if (!isEntryId(entryId)) return fail("That entry was not found.", 404);
  const limit = await rateLimit(`recent-remove:${guard.user.id}`, 120, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  try {
    await removeEntry(guard.user.id, entryId);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("recently viewed remove failed", (error as Error).message);
    return fail("We couldn't remove this entry.", 503);
  }
}

export const DELETE = withApiPerf("DELETE api/buyer/recently-viewed/[entryId]", handleDELETE);
