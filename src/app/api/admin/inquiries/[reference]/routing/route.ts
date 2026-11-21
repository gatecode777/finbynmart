import { ObjectId } from "mongodb";
import { forbiddenResponse, requireAdminApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { routeRecipient } from "@/lib/admin/inquiryOps";
import { opResponse } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/inquiries/<reference>/routing { companyId, reason, idempotencyKey }: adds ONE matched recipient by administrative routing repair
 * (inquiries.routing, plus inquiries.read and inquiries.recipients). Only those three fields are read: an actor, status, eligibility or supplier key in the body is ignored. The server
 * decides eligibility (frozen matching candidate that qualifies now, no existing recipient, not the selected supplier) and commits through the worker's recipient routine with its audit row.
 */
export async function POST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("inquiries.routing");
  if ("response" in guard) return guard.response;
  if (!guard.permissions.includes("inquiries.read") || !guard.permissions.includes("inquiries.recipients")) return forbiddenResponse();
  const limit = await rateLimit(`admin-inquiry-routing:${guard.user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const body = await readSmallJson(request, 2_000);
  if (!body) return fail("Invalid or oversized request.", 413);
  try {
    return opResponse(await routeRecipient(new ObjectId(guard.user.id), (await params).reference, { reason: body.reason, idempotencyKey: body.idempotencyKey, companyId: body.companyId }));
  } catch (error) {
    console.error("admin inquiry routing failed", (error as Error).message);
    return fail("The recipient could not be added. Nothing was changed. Please try again.", 503);
  }
}
