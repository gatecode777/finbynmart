import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSupplierApi, forbiddenResponse } from "@/lib/auth/guards";
import { clean, cleanMultiline, fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { rateLimit } from "@/lib/security/rateLimit";
import { createDraft, readDraftInput } from "@/lib/supplier/productDraftService";

export const dynamic = "force-dynamic";

/** Idempotent draft creation. The client sends one random idempotencyKey per new form. */
export async function POST(request: Request) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  if (!guard.context.permissions.manageProducts) return forbiddenResponse();

  const limit = await rateLimit(`supplier-product-draft:${guard.user.id}`, 60, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const body = await readSmallJson(request, 20_000);
  if (!body) return fail("Invalid or oversized request.", 413);
  const key = clean(body.idempotencyKey, 80);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(key)) return fail("A valid idempotencyKey is required.", 422);

  const result = await createDraft(guard.context, new ObjectId(guard.user.id), readDraftInput(body, clean, cleanMultiline), key);
  if (!result.ok) return NextResponse.json({ ok: false, message: result.message, fields: result.fields }, { status: result.status });
  return NextResponse.json({ ok: true, message: "Draft saved.", data: result.draft }, { status: result.created ? 201 : 200, headers: { "Cache-Control": "private, no-store" } });
}
