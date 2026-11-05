import { NextResponse } from "next/server";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import { checkEmail } from "@/lib/inquiries/rules";
import { normalizeEmail } from "@/lib/auth/buyerRegistration";
import { findUserByEmail, statusOf } from "@/lib/auth/users";
import { sendAccountEmail } from "@/lib/auth/mail";
import { emailConfigured } from "@/lib/email/provider";
import { withApiPerf } from "@/lib/perf/instrument";

/**
 * POST { email }: sends a new confirmation link to an account that is still waiting for one. The answer is the same whether
 * or not the address has an account, so this cannot be used to find out who is registered. Limited per address and per email.
 */
async function handlePOST(request: Request) {
  const limit = await rateLimit(`resend:${clientIp(request)}`, 10, 3600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const body = await readSmallJson(request, 1_000);
  if (!body) return fail("Invalid request.");
  const email = checkEmail(body.email);
  if (!email.ok) return fail("Enter a valid email address.", 400, { email: email.error });
  if (!emailConfigured()) return fail("Email is not set up on this site yet, so no message can be sent.", 503, { email: "not_configured" });

  const address = normalizeEmail(email.value);
  const perEmail = await rateLimit(`resend-email:${address}`, 3, 3600);
  if (!perEmail.ok) return tooMany(perEmail.retryAfterSeconds);
  try {
    const user = await findUserByEmail(address);
    if (user && statusOf(user) === "PENDING_EMAIL_VERIFICATION") await sendAccountEmail(request, user, "verify_email");
    return NextResponse.json({ ok: true, message: "If that address is waiting for confirmation, a new link is on its way." });
  } catch (error) {
    console.error("resend verification failed", error);
    return fail("This is unavailable right now. Please try again.", 503);
  }
}

export const POST = withApiPerf("POST api/auth/resend-verification", handlePOST);
