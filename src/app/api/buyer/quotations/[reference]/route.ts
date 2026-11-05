import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { getBuyerQuotationDetail } from "@/lib/quotations/service";
import { REFERENCE_PATTERN } from "@/lib/quotations/quotationRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/quotations/<reference>[?version=N]: one of the signed-in buyer's own quotations (the current version, or an earlier
 * one by its number) with its supplier, inquiry, price breakdown, commercial terms, versions, events and the actions allowed now.
 * Another buyer's reference, an unknown one, a draft and a malformed one all answer the same 404. Version history is part of this
 * answer (at most 20 versions), so there is no separate history route.
 */
async function handleGET(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const { reference } = await params;
  const raw = new URL(request.url).searchParams.get("version");
  const version = raw === null ? undefined : Number(raw);
  if (!REFERENCE_PATTERN.test(reference) || (version !== undefined && (!Number.isInteger(version) || version < 1))) return fail("That quotation was not found.", 404);
  try {
    const detail = await getBuyerQuotationDetail(guard.user.id, reference, version);
    return detail ? NextResponse.json({ ok: true, data: detail }, { headers: { "Cache-Control": "private, no-store" } }) : fail("That quotation was not found.", 404);
  } catch (error) {
    console.error("buyer quotation read failed", (error as Error).message);
    return fail("We couldn't load this quotation.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/quotations/:reference", handleGET);
