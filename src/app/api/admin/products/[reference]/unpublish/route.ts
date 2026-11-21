import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { forbiddenResponse, requireAdminApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { unpublishProduct } from "@/lib/admin/productManagement";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/products/<reference>/unpublish { reason, expectedRevision }: takes a LIVE supplier-created listing out of public view (capabilities products.unpublish AND products.read).
 * Not a deletion: identity, drafts, review history, inquiries, quotations and orders are untouched. Only `reason` and `expectedRevision` are read: an actor, company, status or
 * source in the body is ignored. 409 on a stale revision or a changed lifecycle; a repeat of an already-applied unpublish is 200 with alreadyUnpublished: true and creates nothing new.
 */
export async function POST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("products.unpublish");
  if ("response" in guard) return guard.response;
  if (!guard.permissions.includes("products.read")) return forbiddenResponse();
  const limit = await rateLimit(`admin-products-unpublish:${guard.user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const body = await readSmallJson(request, 2_000);
  if (!body) return fail("Invalid or oversized request.", 413);
  try {
    const r = await unpublishProduct(new ObjectId(guard.user.id), (await params).reference, { reason: body.reason, expectedRevision: body.expectedRevision });
    if (!r.ok) return NextResponse.json({ ok: false, message: r.message, ...(r.fields ? { fields: r.fields } : {}) }, { status: r.status, headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({ ok: true, message: r.alreadyUnpublished ? "This listing was already unpublished." : "The listing was unpublished.", data: { alreadyUnpublished: r.alreadyUnpublished } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("admin product unpublish failed", (error as Error).message);
    return fail("The listing could not be unpublished. Nothing was changed. Please try again.", 503);
  }
}
