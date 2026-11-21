import { ObjectId } from "mongodb";
import { forbiddenResponse, requireAdminApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { changeBuyerStatus } from "@/lib/admin/buyerManagement";
import { opResponse } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/buyers/<id>/status { action: "suspend" | "reactivate", reason, expectedRev, idempotencyKey }. Needs buyers.read plus the capability of the action (buyers.suspend or
 * buyers.reactivate). Only those four fields are read: an actor, role, email, name or any profile field in the body is ignored. Cross-site writes are refused. 409 for a stale revision, a changed
 * state or a reused key with another request; a repeat of an applied request is 200 with replay: true. Nothing is deleted.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("buyers.read");
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 2_000);
  if (!body) return fail("Invalid or oversized request.", 413);
  const action = body.action;
  if (action !== "suspend" && action !== "reactivate") return fail("Choose suspend or reactivate.", 422, { action: "Unknown action." });
  if (!guard.permissions.includes(action === "suspend" ? "buyers.suspend" : "buyers.reactivate")) return forbiddenResponse();
  const limit = await rateLimit(`admin-buyers-status:${guard.user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  try {
    return opResponse(await changeBuyerStatus(action, new ObjectId(guard.user.id), (await params).id, { reason: body.reason, expectedRev: body.expectedRev, idempotencyKey: body.idempotencyKey }));
  } catch (error) {
    console.error("admin buyer status failed", (error as Error).message);
    return fail("The account status could not be changed. Nothing was changed. Please try again.", 503);
  }
}
