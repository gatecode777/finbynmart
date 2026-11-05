import { NextResponse } from "next/server";
import { requireBuyerApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimitReserved } from "@/lib/security/rateLimit";
import { parseDashboardRange } from "@/lib/buyer/dateRange";
import { getBuyerDashboardOverview } from "@/lib/buyer/dashboard";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/dashboard?range=7d|30d|90d|this-month|previous-month|custom[&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD]
 * The buyer is the signed-in account (401 without a session, 403 for a non-buyer). A buyerId, userId or similar parameter is
 * never read, so nobody else's dashboard can be requested. Answers are private and never cached.
 */
async function handleGET(request: Request) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const limit = await rateLimitReserved(`buyer-dashboard:${guard.user.id}`, 120, 60);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const params = new URL(request.url).searchParams;
  const range = parseDashboardRange({ range: params.get("range") ?? undefined, startDate: params.get("startDate") ?? undefined, endDate: params.get("endDate") ?? undefined });
  if (!range.ok) return fail(range.error, 400, { range: range.error });

  const overview = await getBuyerDashboardOverview(guard.user.id, range.value);
  return NextResponse.json({ ok: true, data: overview }, { headers: { "Cache-Control": "private, no-store" } });
}

export const GET = withApiPerf("GET api/buyer/dashboard", handleGET);
