import { ObjectId } from "mongodb";
import { forbiddenResponse, requireAdminApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { suspendCompany } from "@/lib/admin/supplierManagement";
import { opResponse } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/suppliers/<reference>/suspend { reason, noticeCode, expectedRev, idempotencyKey } (suppliers.suspend plus suppliers.read). Only those four fields are read: an actor, status,
 * owner or company in the body is ignored. 409 for a stale revision or a company that is not ACTIVE; a repeat of an applied request is 200 with replay: true. Nothing is deleted or revoked.
 */
export async function POST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("suppliers.suspend");
  if ("response" in guard) return guard.response;
  if (!guard.permissions.includes("suppliers.read")) return forbiddenResponse();
  const limit = await rateLimit(`admin-suppliers-status:${guard.user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const body = await readSmallJson(request, 2_000);
  if (!body) return fail("Invalid or oversized request.", 413);
  try {
    return opResponse(await suspendCompany(new ObjectId(guard.user.id), (await params).reference, { reason: body.reason, noticeCode: body.noticeCode, expectedRev: body.expectedRev, idempotencyKey: body.idempotencyKey }));
  } catch (error) {
    console.error("admin supplier suspend failed", (error as Error).message);
    return fail("The company could not be suspended. Nothing was changed. Please try again.", 503);
  }
}
