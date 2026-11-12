import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { parseDashboardRange } from "@/lib/buyer/dateRange";
import { rateLimitReserved } from "@/lib/security/rateLimit";
import { getSupplierDashboard } from "@/lib/supplier/dashboardService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/supplier/dashboard?range=7d|30d|90d|this-month|previous-month|custom[&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD]
 * The supplier company is the one the SESSION's account owns (401 without a session, a real 403 for a non-supplier or an inactive company). A
 * companyId, supplierId, role or similar parameter is never read, so nobody else's dashboard can be requested. The answer is the lightweight overview
 * (numbers, snapshot, five recent inquiries, five top products, capabilities); the chart has its own route. Private, never cached.
 */
async function handleGET(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limit = await rateLimitReserved(`supplier-dashboard:${guard.user.id}`, 120, 60);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const params = new URL(request.url).searchParams;
  const range = parseDashboardRange({ range: params.get("range") ?? undefined, startDate: params.get("startDate") ?? undefined, endDate: params.get("endDate") ?? undefined });
  if (!range.ok) return fail(range.error, 400, { range: range.error });
  const data = await getSupplierDashboard(guard.context, range.value);
  return NextResponse.json(
    { ok: true, data, meta: { range: range.value.key, label: range.value.label, startDate: range.value.startDate, endDate: range.value.endDate, timezone: range.value.timezone } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiPerf("GET api/supplier/dashboard", handleGET);
