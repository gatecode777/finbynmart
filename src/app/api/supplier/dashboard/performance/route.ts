import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { parseDashboardRange } from "@/lib/buyer/dateRange";
import { rateLimitReserved } from "@/lib/security/rateLimit";
import { getPerformance } from "@/lib/supplier/dashboardService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/supplier/dashboard/performance?range=...: inquiries received, quotations first sent and orders confirmed per day / week / month (IST) for the company's own sellers. Same access rules as the overview. */
async function handleGET(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limit = await rateLimitReserved(`supplier-dashboard:${guard.user.id}`, 120, 60);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const params = new URL(request.url).searchParams;
  const range = parseDashboardRange({ range: params.get("range") ?? undefined, startDate: params.get("startDate") ?? undefined, endDate: params.get("endDate") ?? undefined });
  if (!range.ok) return fail(range.error, 400, { range: range.error });
  try {
    const data = await getPerformance(guard.context, range.value);
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("supplier performance failed", (error as Error).message);
    return NextResponse.json({ ok: false, message: "The performance chart could not be loaded." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

export const GET = withApiPerf("GET api/supplier/dashboard/performance", handleGET);
