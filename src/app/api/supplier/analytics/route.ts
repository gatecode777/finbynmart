import { NextResponse } from "next/server";
import { requireSupplierApi, forbiddenResponse } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { buildReport } from "@/lib/supplier/analyticsService";
import { parseRange } from "@/lib/supplier/analyticsRules";

export const dynamic = "force-dynamic";

/** One bounded report for the page: summary, trend and top products share one date range and one cutoff (generatedAt). */
export async function GET(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  if (!guard.context.permissions.viewAnalytics) return forbiddenResponse();
  const limit = await rateLimit(`supplier-analytics:${guard.user.id}`, 120, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const sp = new URL(request.url).searchParams;
  const parsed = parseRange(sp.get("start") ?? "", sp.get("end") ?? "");
  if (!parsed.ok) return fail(parsed.message, 422);
  const currency = (sp.get("currency") ?? "").toUpperCase().slice(0, 3) || null;
  const report = await buildReport(guard.context, parsed.range, currency);
  return NextResponse.json({ ok: true, data: report }, { headers: { "Cache-Control": "private, no-store" } });
}
