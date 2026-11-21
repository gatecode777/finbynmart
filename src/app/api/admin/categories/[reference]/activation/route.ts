import { ObjectId } from "mongodb";
import { forbiddenResponse, requireAdminApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { setActivation } from "@/lib/admin/categoryManagement";
import { opResponse } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/categories/<reference>/activation { isActive, reason, expectedRev, idempotencyKey } (categories.activation plus categories.read). Only those four fields are read: an actor, a
 * parent, a slug, a name or any other category field in the body is ignored. Main categories only. 409 for a stale revision or no change; a repeat of an applied request is 200 with replay: true.
 * There is deliberately no create, rename, move or slug route: see docs/admin/PAGE_55_CATEGORY_MANAGEMENT.md.
 */
export async function POST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("categories.activation");
  if ("response" in guard) return guard.response;
  if (!guard.permissions.includes("categories.read")) return forbiddenResponse();
  const limit = await rateLimit(`admin-categories-activation:${guard.user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const body = await readSmallJson(request, 2_000);
  if (!body) return fail("Invalid or oversized request.", 413);
  try {
    return opResponse(await setActivation(new ObjectId(guard.user.id), (await params).reference, { isActive: body.isActive, reason: body.reason, expectedRev: body.expectedRev, idempotencyKey: body.idempotencyKey }));
  } catch (error) {
    console.error("admin category activation failed", (error as Error).message);
    return fail("The change could not be saved. Nothing was changed. Please try again.", 503);
  }
}
