import { ObjectId } from "mongodb";
import { forbiddenResponse, requireAdminApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { pauseDistribution, resumeDistribution, retryDistribution } from "@/lib/admin/inquiryOps";
import { opResponse } from "@/lib/admin/inquiryHttp";
import type { AdminCapability } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

const ACTIONS = {
  pause: { cap: "inquiries.distribution", run: pauseDistribution },
  resume: { cap: "inquiries.distribution", run: resumeDistribution },
  retry: { cap: "inquiries.routing", run: retryDistribution },
} as const satisfies Record<string, { cap: AdminCapability; run: typeof pauseDistribution }>;

/**
 * POST /api/admin/inquiries/<reference>/distribution { action: "pause" | "resume" | "retry", reason, expectedRev, idempotencyKey }.
 * pause and resume need inquiries.distribution, retry needs inquiries.routing (each also needs inquiries.read). The actor comes from the session; the job's state, lease and counters
 * are never taken from the body. 409 for a stale revision or a state that does not allow the action; a repeat of an applied request is 200 with replay: true.
 */
export async function POST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAdminApi("inquiries.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-inquiry-distribution:${guard.user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const body = await readSmallJson(request, 2_000);
  if (!body) return fail("Invalid or oversized request.", 413);
  const action = typeof body.action === "string" && Object.hasOwn(ACTIONS, body.action) ? (body.action as keyof typeof ACTIONS) : null;
  if (!action) return fail("Unknown action.", 422);
  if (!guard.permissions.includes(ACTIONS[action].cap)) return forbiddenResponse();
  try {
    return opResponse(await ACTIONS[action].run(new ObjectId(guard.user.id), (await params).reference, { reason: body.reason, idempotencyKey: body.idempotencyKey, expectedRev: body.expectedRev }));
  } catch (error) {
    console.error("admin inquiry distribution failed", (error as Error).message);
    return fail("The change could not be saved. Nothing was changed. Please try again.", 503);
  }
}
