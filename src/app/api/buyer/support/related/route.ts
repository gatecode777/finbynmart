import { fail } from "@/lib/auth/http";
import { buyerGuard, json } from "@/lib/buyer/api";
import { RELATED_TYPES } from "@/lib/support/ticketRules";
import { listRelatedOptions } from "@/lib/support/ticketService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/support/related?type=inquiry|quotation|order|product: the buyer's OWN records of that kind to choose from (at most 20,
 * newest first; products are their saved products). Nothing of another buyer can appear.
 */
async function handleGET(request: Request) {
  const guard = await buyerGuard();
  if ("response" in guard) return guard.response;
  const type = RELATED_TYPES.find((t) => t.value === new URL(request.url).searchParams.get("type"))?.value;
  if (!type) return fail("Choose one of: inquiry, quotation, order, product.", 400, { type: "Choose a type." });
  try {
    return json({ ok: true, data: { options: await listRelatedOptions(guard.user.id, type) } });
  } catch (error) {
    console.error("support related options failed", (error as Error).message);
    return fail("We couldn't load your records.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/support/related", handleGET);
