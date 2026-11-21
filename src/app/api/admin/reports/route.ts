import { NextResponse } from "next/server";
import { forbiddenResponse, requireAnyAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { runReport } from "@/lib/admin/reportService";
import { CAPABILITIES, defaultRange, parseRange, permittedReports, reportOf, validateQuery } from "@/lib/admin/reportRules";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reports?report=&from=YYYY-MM-DD&to=YYYY-MM-DD : READ-ONLY aggregate counts. The administrator must hold at least one reports capability, and the REQUESTED report needs its own
 * (reports.buyers, reports.suppliers, reports.requirements, reports.quotations, reports.orders): another report is a 403 even for a direct call. Validated: an unknown report, impossible, inverted,
 * future or over-366-day dates and any other parameter are a 422. Dates are calendar days in Asia/Kolkata, both inclusive. The payload holds counts, labels and dates only: no name, e-mail, phone,
 * message or amount. A database failure is a 503, never zeros. Private, no-store; nothing is written.
 */
export async function GET(request: Request) {
  const guard = await requireAnyAdminApi(CAPABILITIES);
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-reports:${guard.user.id}`, 120, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const allowed = permittedReports(guard.permissions);
  const sp = new URL(request.url).searchParams;
  const q = validateQuery((k) => sp.get(k), sp.keys(), allowed[0].key);
  if (!q.ok) return NextResponse.json({ ok: false, message: "Check the report and the dates.", fields: q.fields }, { status: 422, headers: NO_STORE });
  const def = reportOf(q.value.report)!;
  if (!guard.permissions.includes(def.capability)) return forbiddenResponse();
  const range = parseRange(q.value.from || defaultRange().startDay, q.value.to || defaultRange().endDay);
  if (!range.ok) return NextResponse.json({ ok: false, message: range.message, fields: { range: range.message } }, { status: 422, headers: NO_STORE });
  try {
    return NextResponse.json({ ok: true, data: await runReport(q.value.report, range.range) }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin report failed", (error as Error).message);
    return fail("The report could not be generated. Please try again.", 503);
  }
}
