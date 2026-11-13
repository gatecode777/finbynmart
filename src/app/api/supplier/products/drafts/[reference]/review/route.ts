import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSupplierApi, forbiddenResponse } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { rateLimit } from "@/lib/security/rateLimit";
import { submitForReview, withdrawReview } from "@/lib/supplier/productDraftService";

export const dynamic = "force-dynamic";

/** POST { action: "submit", expectedRevision } or { action: "withdraw" }. A supplier can only submit or withdraw: approval is a separate admin capability and route. */
export async function POST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  if (!guard.context.permissions.manageProducts) return forbiddenResponse();
  const limit = await rateLimit(`supplier-product-review:${guard.user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const body = await readSmallJson(request, 1_000);
  if (!body) return fail("Invalid or oversized request.", 413);
  const { reference } = await params;
  let result;
  if (body.action === "submit") {
    const rev = typeof body.expectedRevision === "number" && Number.isInteger(body.expectedRevision) ? body.expectedRevision : 0;
    if (rev < 1) return fail("expectedRevision is required.", 422);
    result = await submitForReview(guard.context, new ObjectId(guard.user.id), reference, rev);
  } else if (body.action === "withdraw") {
    result = await withdrawReview(guard.context, reference);
  } else return fail("action must be submit or withdraw.", 422);
  if (!result.ok) return NextResponse.json({ ok: false, message: result.message, fields: result.fields }, { status: result.status });
  return NextResponse.json({ ok: true, message: body.action === "submit" ? "Submitted for review. Nothing is published until a reviewer approves it." : "Submission withdrawn. You can edit the draft again.", data: result.draft }, { headers: { "Cache-Control": "private, no-store" } });
}
