import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { forbiddenResponse, requireAdminApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import type { AdminCapability } from "@/lib/admin/permissions";
import { verificationCapsOf } from "./caps";
import { decide, type OpResult } from "./service";
import type { Decision } from "./rules";

export const NO_STORE = { "Cache-Control": "private, no-store" };

export function opResponse(r: OpResult): NextResponse {
  if (r.ok) return NextResponse.json({ ok: true, replay: r.replay, message: r.message, ...(r.reference ? { reference: r.reference } : {}) }, { headers: NO_STORE });
  return NextResponse.json({ ok: false, message: r.message, ...(r.fields ? { fields: r.fields } : {}) }, { status: r.status, headers: NO_STORE });
}

const CAP: Record<Decision, AdminCapability> = { approve: "verification.approve", "request-changes": "verification.requestChanges", reject: "verification.reject" };

/**
 * The one handler behind approve, request-changes and reject. Each needs its own capability plus verification.read. Only reasonCode, internalNote, checklist, expectedRev and idempotencyKey are
 * read from the body: a reviewer, company, state or verification result sent by the client is ignored. The actor comes from the session.
 */
export async function decisionRoute(action: Decision, request: Request, params: Promise<{ reference: string }>): Promise<Response> {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi(CAP[action]);
  if ("response" in guard) return guard.response;
  if (!guard.permissions.includes("verification.read")) return forbiddenResponse();
  const limit = await rateLimit(`admin-verification-decision:${guard.user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const body = await readSmallJson(request, 4_000);
  if (!body) return fail("Invalid or oversized request.", 413);
  try {
    return opResponse(await decide(action, new ObjectId(guard.user.id), (await params).reference, { reasonCode: body.reasonCode, internalNote: body.internalNote, checklist: body.checklist, expectedRev: body.expectedRev, idempotencyKey: body.idempotencyKey }, verificationCapsOf(guard.permissions)));
  } catch (error) {
    console.error("admin verification decision failed", (error as Error).message);
    return fail("The decision could not be saved. Nothing was changed. Please try again.", 503);
  }
}
