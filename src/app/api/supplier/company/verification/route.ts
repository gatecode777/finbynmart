import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { getSupplierVerification, submitVerification } from "@/lib/verification/service";
import { NO_STORE, opResponse } from "@/lib/verification/http";

export const dynamic = "force-dynamic";

/** The signed-in supplier's OWN verification status: policy requirements, its latest submission, the safe decision reason. Never an internal note, a reviewer or another company. Reading never creates anything. */
export async function GET() {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  try {
    const view = await getSupplierVerification(guard.user.id);
    if (!view) return fail("Company not found.", 404);
    return NextResponse.json({ ok: true, data: view }, { headers: NO_STORE });
  } catch (error) {
    console.error("supplier verification read failed", (error as Error).message);
    return fail("Verification could not be loaded. Please try again.", 503);
  }
}

/** POST { idempotencyKey }: submit the company's current evidence for review as a new revision. The company comes from the session; the body carries nothing else. */
export async function POST(request: Request) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`supplier-verification-submit:${guard.user.id}`, 10, 3600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const body = await readSmallJson(request, 1_000);
  if (!body) return fail("Invalid or oversized request.", 413);
  try {
    return opResponse(await submitVerification(guard.user.id, body.idempotencyKey));
  } catch (error) {
    console.error("supplier verification submit failed", (error as Error).message);
    return fail("Your submission could not be saved. Nothing was submitted. Please try again.", 503);
  }
}
