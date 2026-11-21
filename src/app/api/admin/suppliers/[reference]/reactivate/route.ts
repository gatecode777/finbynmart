import { ObjectId } from "mongodb";
import { forbiddenResponse, requireAdminApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { reactivateCompany } from "@/lib/admin/supplierManagement";
import { opResponse } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/suppliers/<reference>/reactivate { reason, expectedRev, idempotencyKey } (suppliers.reactivate plus suppliers.read). Restores company access only: it never verifies the
 * company, approves a product, clears a product's own unpublish restriction, reopens a requirement, restores a quotation, moves seller ownership or replays a lead.
 */
export async function POST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("suppliers.reactivate");
  if ("response" in guard) return guard.response;
  if (!guard.permissions.includes("suppliers.read")) return forbiddenResponse();
  const limit = await rateLimit(`admin-suppliers-status:${guard.user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const body = await readSmallJson(request, 2_000);
  if (!body) return fail("Invalid or oversized request.", 413);
  try {
    return opResponse(await reactivateCompany(new ObjectId(guard.user.id), (await params).reference, { reason: body.reason, expectedRev: body.expectedRev, idempotencyKey: body.idempotencyKey }));
  } catch (error) {
    console.error("admin supplier reactivate failed", (error as Error).message);
    return fail("The company could not be reactivated. Nothing was changed. Please try again.", 503);
  }
}
