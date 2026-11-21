import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { listAdminQuotations } from "@/lib/admin/quotationManagement";
import { validateListState } from "@/lib/admin/quotationAdminRules";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/quotations?q=&status=&page=&limit= : READ-ONLY. Current submitted quotations (one row per quotation; no draft, revision draft or older version), capability quotations.read.
 * Filters are validated (an unknown status, page, limit or a search that is not a reference is a 422). Newest submission first, 20 per page (max 50). A row holds references, supplier name,
 * total with its currency, status and dates: no buyer detail, message or draft data. Nothing is written and no timestamp is touched.
 */
export async function GET(request: Request) {
  const guard = await requireAdminApi("quotations.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-quotations:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const sp = new URL(request.url).searchParams;
  const v = validateListState((k) => sp.get(k));
  if (!v.ok) return NextResponse.json({ ok: false, message: "Check the filters.", fields: v.fields }, { status: 422, headers: NO_STORE });
  try {
    return NextResponse.json({ ok: true, data: await listAdminQuotations(v.state, Number(sp.get("limit")) || undefined) }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin quotations list failed", (error as Error).message);
    return fail("The quotations could not be loaded. Please try again.", 503);
  }
}
