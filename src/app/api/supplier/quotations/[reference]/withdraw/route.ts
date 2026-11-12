import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { parseWithdrawal } from "@/lib/supplier/quotationRules";
import { withdrawSupplierQuotation } from "@/lib/supplier/quotationService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/supplier/quotations/<reference>/withdraw { confirm: true, reason? }: withdraws the CURRENT version of one of the session company's
 * quotations while it is still waiting on the buyer and valid. Nothing is deleted: the status becomes WITHDRAWN and an event is recorded. The answer
 * is the real new state and whether an in-app notice was actually recorded for the buyer (their preferences may switch it off). A quotation the
 * buyer already accepted or rejected, one that expired, a draft and another supplier's all refuse (409 / 404); a status is never taken from the body.
 */
async function handlePOST(request: Request, context: { params: Promise<{ reference: string }> }) {
  if (isCrossSiteWrite(request)) return fail("This request was blocked.", 403);
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`supplier-quotation-withdraw:${guard.user.id}`, 20, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const input = parseWithdrawal(await readSmallJson(request, 2_000));
  if (!input.ok) return fail(input.error, 400);
  const { reference } = await context.params;
  try {
    const outcome = await withdrawSupplierQuotation(guard.context, reference, input.reason, new Date(), input.expectedVersion);
    if (!outcome.ok) return NextResponse.json({ ok: false, code: outcome.code, message: outcome.message }, { status: outcome.code === "NOT_FOUND" ? 404 : 409, headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json(
      {
        ok: true,
        message: outcome.buyerNotice === "recorded" ? "Quotation withdrawn. The buyer has an in-app notice." : outcome.buyerNotice === "pending" ? "Quotation withdrawn. The buyer's in-app notice is queued and will be delivered shortly." : "Quotation withdrawn. No in-app notice was recorded for the buyer (their notification settings may be off).",
        data: { status: outcome.status, statusLabel: outcome.statusLabel, buyerNotified: outcome.buyerNotified, buyerNotice: outcome.buyerNotice },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("supplier quotation withdraw failed", (error as Error).message);
    return fail("We could not withdraw this quotation. Nothing was changed. Please try again.", 503);
  }
}

export const POST = withApiPerf("POST api/supplier/quotations/:reference/withdraw", handlePOST);
