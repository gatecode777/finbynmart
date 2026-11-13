import { NextResponse } from "next/server";
import { fail, readSmallJson } from "@/lib/auth/http";
import { buyerGuard, json } from "@/lib/buyer/api";
import { REFERENCE_PATTERN, validateDecision, validateRevisionRequest, type DecisionResult, type RevisionResult } from "./quotationRules";
import { decideQuotation, requestRevision, quotationsCollection } from "./service";
import { notifySellerOwner } from "@/lib/supplier/notifyOwner";

/** Tells the supplier company (in-app, only if it did not switch quotation notices off). Returns whether a notice was recorded. */
async function noticeSupplier(reference: string, action: Action): Promise<boolean> {
  const q = await (await quotationsCollection()).findOne({ reference, isCurrent: true }, { projection: { supplierKey: 1, productName: 1, version: 1 } }).catch(() => null);
  if (!q) return false;
  const what = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "asked for a revision of";
  return notifySellerOwner(q.supplierKey, { category: "quotations", type: `QUOTATION_${action.toUpperCase()}`, title: `Quotation ${what}`, body: `A buyer ${what} your quotation ${reference} (version ${q.version}).`, link: `/supplier/quotations/${reference}`, dedupeKey: `quote:${reference}:${q.version}:${action}` });
}

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
      if (!result.ok) return json({ ok: false, code: result.code, message: result.message }, STATUS[result.code]);
      const notified = await noticeSupplier(reference, "revision");
      return json({ ok: true, message: notified ? "Your revision request was saved and the supplier was notified in the portal. No e-mail is sent." : "Your revision request was saved. The supplier could not be notified in the portal (no linked supplier account, or notices are switched off), so a new version cannot be expected.", supplierNotified: notified }, 201);
    }
    const checked: DecisionResult = validateDecision(body, action);
    if (!checked.ok) return json({ ok: false, message: "Check the request.", fields: checked.fields }, 400);
    const result = await decideQuotation(guard.user.id, reference, action, checked.value);
    if (!result.ok) return json({ ok: false, code: result.code, message: result.message }, STATUS[result.code]);
    const notified = await noticeSupplier(reference, action);
    return json({ ok: true, message: action === "accept" ? `You accepted this quotation. This records your decision only: nothing was charged and no order exists until you confirm it. ${notified ? "The supplier was notified in the portal." : "The supplier could not be notified in the portal."}` : `You rejected this quotation. ${notified ? "The supplier was notified in the portal." : "The supplier could not be notified in the portal."}`, status: result.status, statusLabel: result.statusLabel, supplierNotified: notified });
  } catch (error) {
    console.error("quotation action failed", action, (error as Error).message);
    return json({ ok: false, message: "We couldn't complete that right now. Nothing was changed. Please try again." }, 503);
  }
}
