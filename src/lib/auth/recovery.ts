import { after, NextResponse } from "next/server";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import { checkEmail } from "@/lib/inquiries/rules";
import { normalizeEmail } from "@/lib/auth/buyerRegistration";
import { findRecoveryAccount, statusOf } from "@/lib/auth/users";
import { sendAccountEmail } from "@/lib/auth/mail";
import { emailConfigured } from "@/lib/email/provider";
import { RECOVERY_PER_EMAIL_PER_HOUR, RECOVERY_PER_IP_PER_HOUR, resendCooldownSeconds, resetTtlMinutes } from "@/lib/auth/securityConfig";

/** The same words for every address, whatever the account is (or is not). */
export const GENERIC_RECOVERY_MESSAGE = "If an eligible account exists for this email address, password reset instructions will be sent.";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Shared by POST /api/auth/forgot-password and POST /api/auth/forgot-password/resend (one system, one cooldown).
 *
 * Order: client-address limit -> small JSON body -> email syntax -> email provider present? -> limits (cooldown, email per hour)
 * -> the generic answer; then (after the response) indexed lookup, eligibility, token and email.
 *
 * Eligibility policy: any account that is not SUSPENDED. A buyer or supplier who never confirmed the address (including
 * every account created before confirmation existed) is eligible, because the reset link itself proves control of the
 * mailbox and using it confirms the address. The role is read from the stored account, never from the request, and is
 * never returned. A request that would send nothing (unknown, suspended) is answered exactly like one that sends.
 *
 * The limits and the "email is not set up" answer depend only on the request, never on the account, so they cannot be used
 * to tell registered addresses from unregistered ones.
 */
export async function handleRecoveryRequest(request: Request): Promise<NextResponse> {
  const perIp = await rateLimit(`forgot:${clientIp(request)}`, RECOVERY_PER_IP_PER_HOUR, 3600);
  if (!perIp.ok) return tooMany(perIp.retryAfterSeconds);

  const body = await readSmallJson(request, 1_000);
  if (!body) return fail("Invalid request.");
  const email = checkEmail(body.email);
  if (!email.ok) return fail("Enter a valid email address.", 400, { email: email.error });
  if (!emailConfigured()) {
    return fail("Email is not set up on this site yet, so a reset link cannot be sent. Contact support to recover your account.", 503, { email: "not_configured" });
  }

  const address = normalizeEmail(email.value);
  const cooldown = await rateLimit(`forgot-cd:${address}`, 1, resendCooldownSeconds());
  if (!cooldown.ok) return tooMany(cooldown.retryAfterSeconds);
  const perEmail = await rateLimit(`forgot-email:${address}`, RECOVERY_PER_EMAIL_PER_HOUR, 3600);
  if (!perEmail.ok) return tooMany(perEmail.retryAfterSeconds);

  // The lookup and the email happen AFTER the answer is sent (after()), so the response takes the same time for a registered
  // and an unregistered address. A failure is logged on the server; the person always sees the generic answer.
  after(async () => {
    try {
      const user = await findRecoveryAccount(address);
      if (user && statusOf(user) !== "SUSPENDED") await sendAccountEmail(request, user, "reset_password");
    } catch (error) {
      console.error("password recovery failed", error instanceof Error ? error.name : "error");
    }
  });
  return NextResponse.json({ ok: true, message: GENERIC_RECOVERY_MESSAGE, cooldownSeconds: resendCooldownSeconds(), validMinutes: resetTtlMinutes() }, { headers: NO_STORE });
}
