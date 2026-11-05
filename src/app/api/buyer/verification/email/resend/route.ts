import { buyerGuard, json } from "@/lib/buyer/api";
import { tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { sendAccountEmail } from "@/lib/auth/mail";
import { emailConfigured } from "@/lib/email/provider";
import { getBuyerUser } from "@/lib/buyer/profile";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST: sends a new confirmation link to the signed-in buyer's own address. No body is read (the address is the stored one,
 * never one from the request). Without an email provider it says so (503) and sends nothing; "sent" means the provider
 * accepted the message, not that it reached an inbox. One every 60 seconds and three an hour.
 */
async function handlePOST(request: Request) {
  const guard = await buyerGuard();
  if ("response" in guard) return guard.response;
  const user = await getBuyerUser(guard.user.id);
  if (!user) return json({ ok: false, message: "Not found." }, 404);
  if (user.emailVerified === true) return json({ ok: false, message: "Your email address is already confirmed." }, 409);
  if (!emailConfigured()) return json({ ok: false, message: "Email sending is not set up yet, so a confirmation link cannot be sent.", code: "not_configured" }, 503);
  const cooldown = await rateLimit(`buyer-verify-cd:${guard.user.id}`, 1, 60);
  if (!cooldown.ok) return tooMany(cooldown.retryAfterSeconds);
  const hourly = await rateLimit(`buyer-verify-hr:${guard.user.id}`, 3, 3600);
  if (!hourly.ok) return tooMany(hourly.retryAfterSeconds);
  const result = await sendAccountEmail(request, { _id: user._id, name: user.name, email: user.email }, "verify_email");
  if (result.status !== "sent") return json({ ok: false, message: "The confirmation email could not be sent just now. Please try again later." }, 502);
  return json({ ok: true, message: "A new confirmation link was sent to your email address." });
}

export const POST = withApiPerf("POST api/buyer/verification/email/resend", handlePOST);
