import { fail, readSmallJson } from "@/lib/auth/http";
import { buyerGuard, json } from "@/lib/buyer/api";
import { compareBuyerQuotations } from "@/lib/quotations/service";
import { REFERENCE_PATTERN } from "@/lib/quotations/quotationRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/buyer/quotations/compare { references: [two to four] }: the buyer's own current quotations for ONE inquiry, side by side.
 * Choosing quotations to compare changes nothing: no status, no decision. Values that differ are marked; nothing is ranked.
 */
async function handlePOST(request: Request) {
  const guard = await buyerGuard({ key: "quotation-compare", limit: 120, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 1_000);
  const refs = body && Array.isArray(body.references) ? body.references : null;
  if (!refs || refs.length > 10 || !refs.every((r) => typeof r === "string" && REFERENCE_PATTERN.test(r))) return fail("Send between two and four quotation references.", 400, { references: "Choose between 2 and 4 quotations." });
  try {
    const result = await compareBuyerQuotations(guard.user.id, refs as string[]);
    return result.ok ? json({ ok: true, data: result.value }) : json({ ok: false, code: result.code, message: result.message }, result.code === "NOT_FOUND" ? 404 : 400);
  } catch (error) {
    console.error("quotation compare failed", (error as Error).message);
    return json({ ok: false, message: "We couldn't compare these quotations." }, 503);
  }
}

export const POST = withApiPerf("POST api/buyer/quotations/compare", handlePOST);
