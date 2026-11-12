import { NextResponse } from "next/server";
import { requireSupplierApi, forbiddenResponse } from "@/lib/auth/guards";
import { clean, cleanMultiline, fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { rateLimit } from "@/lib/security/rateLimit";
import { getDraft, readDraftInput, updateDraft } from "@/lib/supplier/productDraftService";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
type Ctx = { params: Promise<{ reference: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  if (!guard.context.permissions.manageProducts) return forbiddenResponse();
  const draft = await getDraft(guard.context, (await params).reference);
  if (!draft) return fail("Draft not found.", 404);
  return NextResponse.json({ ok: true, data: draft }, { headers: NO_STORE });
}

/** Revision-guarded update. The response carries the server's own review (checklist), which is authoritative. */
export async function PATCH(request: Request, { params }: Ctx) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  if (!guard.context.permissions.manageProducts) return forbiddenResponse();

  const limit = await rateLimit(`supplier-product-draft:${guard.user.id}`, 60, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const body = await readSmallJson(request, 20_000);
  if (!body) return fail("Invalid or oversized request.", 413);
  const rev = typeof body.expectedRevision === "number" && Number.isInteger(body.expectedRevision) ? body.expectedRevision : 0;
  if (rev < 1) return fail("expectedRevision is required.", 422);

  const result = await updateDraft(guard.context, (await params).reference, rev, readDraftInput(body, clean, cleanMultiline));
  if (!result.ok) return NextResponse.json({ ok: false, message: result.message, fields: result.fields }, { status: result.status });
  return NextResponse.json({ ok: true, message: "Draft saved.", data: result.draft }, { headers: NO_STORE });
}
