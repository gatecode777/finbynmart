import { NextResponse } from "next/server";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import { inspectToken } from "@/lib/auth/tokens";
import { toPublicState } from "@/lib/auth/resetMessages";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST { token }: the state of a reset link, without using it: `{ ok: true, valid, state }` with state VALID, INVALID,
 * EXPIRED, ALREADY_USED or REVOKED. An account that can no longer be recovered is reported as INVALID, and nothing about the
 * account (id, email, role) is ever returned. A temporary failure is a 503, never "invalid".
 */
async function handlePOST(request: Request) {
  const limit = await rateLimit(`reset-validate:${clientIp(request)}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const body = await readSmallJson(request, 1_000);
  if (!body) return fail("Invalid request.");
  try {
    const state = toPublicState(await inspectToken(body.token, "reset_password"));
    return NextResponse.json({ ok: true, valid: state === "VALID", state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("reset token validation failed", error instanceof Error ? error.name : "error");
    return fail("Unable to verify this link right now. Please try again.", 503);
  }
}

export const POST = withApiPerf("POST api/auth/reset-password/validate", handlePOST);
