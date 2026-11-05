import { NextResponse } from "next/server";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import { consumeToken } from "@/lib/auth/tokens";
import { markEmailVerified } from "@/lib/auth/users";
import { withApiPerf } from "@/lib/perf/instrument";

/** POST { token }: uses the emailed token once and confirms the address. The token is the only credential, so attempts are limited. */
async function handlePOST(request: Request) {
  const limit = await rateLimit(`verify:${clientIp(request)}`, 20, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const body = await readSmallJson(request, 1_000);
  if (!body) return fail("Invalid request.");
  try {
    const userId = await consumeToken(body.token, "verify_email");
    if (!userId) return fail("This confirmation link is invalid, already used or expired. Request a new one.", 400, { token: "invalid" });
    await markEmailVerified(userId);
    return NextResponse.json({ ok: true, message: "Your email address is confirmed. You can sign in." });
  } catch (error) {
    console.error("verify email failed", error);
    return fail("Confirmation is unavailable right now. Please try again.", 503);
  }
}

export const POST = withApiPerf("POST api/auth/verify-email", handlePOST);
