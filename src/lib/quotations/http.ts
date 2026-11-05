import { NextResponse } from "next/server";
import { fail, readSmallJson } from "@/lib/auth/http";
import { buyerGuard, json } from "@/lib/buyer/api";
import { REFERENCE_PATTERN, validateDecision, validateRevisionRequest, type DecisionResult, type RevisionResult } from "./quotationRules";
import { decideQuotation, requestRevision } from "./service";

/** The three buyer writes share one pipeline: session, rate limit, reference check, body validation, then the service. */
type Action = "accept" | "reject" | "revision";

const STATUS: Record<string, number> = { NOT_FOUND: 404, STALE: 409, NOT_ALLOWED: 409, ALREADY_ACCEPTED: 409 };

export async function handleQuotationAction(request: Request, referenceParam: Promise<{ reference: string }>, action: Action): Promise<NextResponse> {
  const guard = await buyerGuard({ key: "quotation-decision", limit: 30, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const { reference } = await referenceParam;
  if (!REFERENCE_PATTERN.test(reference)) return json({ ok: false, message: "That quotation was not found." }, 404);
  const body = await readSmallJson(request, 4_000);
  if (!body) return fail("Invalid request.");

  try {
    if (action === "revision") {
      const checked: RevisionResult = validateRevisionRequest(body);
      if (!checked.ok) return json({ ok: false, message: "Check the highlighted fields.", fields: checked.fields }, 400);
      const result = await requestRevision(guard.user.id, reference, checked.value);
      return result.ok
        ? json({ ok: true, message: "Your revision request was saved. The supplier is not notified automatically yet, so a new version cannot be expected through this site.", supplierNotified: false }, 201)
        : json({ ok: false, code: result.code, message: result.message }, STATUS[result.code]);
    }
    const checked: DecisionResult = validateDecision(body, action);
    if (!checked.ok) return json({ ok: false, message: "Check the request.", fields: checked.fields }, 400);
    const result = await decideQuotation(guard.user.id, reference, action, checked.value);
    return result.ok
      ? json({ ok: true, message: action === "accept" ? "You accepted this quotation. This records your decision only: order processing is not available yet, and nothing was charged or ordered." : "You rejected this quotation.", status: result.status, statusLabel: result.statusLabel, supplierNotified: false })
      : json({ ok: false, code: result.code, message: result.message }, STATUS[result.code]);
  } catch (error) {
    console.error("quotation action failed", action, (error as Error).message);
    return json({ ok: false, message: "We couldn't complete that right now. Nothing was changed. Please try again." }, 503);
  }
}
