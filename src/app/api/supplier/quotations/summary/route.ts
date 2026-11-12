import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimitReserved } from "@/lib/security/rateLimit";
import { getSupplierQuotationSummary } from "@/lib/supplier/quotationService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/supplier/quotations/summary: the six lifetime counts (one logical quotation = its current version) for the session's company. One aggregation. */
async function handleGET() {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limit = await rateLimitReserved(`supplier-quotations:${guard.user.id}`, 240, 60);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  try {
    return NextResponse.json({ ok: true, data: await getSupplierQuotationSummary(guard.context) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("supplier quotation summary failed", (error as Error).message);
    return fail("We could not load the quotation summary.", 503);
  }
}

export const GET = withApiPerf("GET api/supplier/quotations/summary", handleGET);
