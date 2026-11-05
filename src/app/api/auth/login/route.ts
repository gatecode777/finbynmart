import { NextResponse } from "next/server";
import { fail, readJson, str, tooMany } from "@/lib/auth/http";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import { verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { findUserByEmail, recordLogin, statusOf, toPublicUser } from "@/lib/auth/users";
import { validateSignIn } from "@/lib/validations/account";
import { withApiPerf } from "@/lib/perf/instrument";

async function handlePOST(request: Request) {
  // Slow down password guessing: 10 attempts per 10 minutes per address.
  const limit = await rateLimit(`login:${clientIp(request)}`, 10, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const body = await readJson(request);
  if (!body) return fail("Invalid request.");

  const values = { email: str(body.email), password: str(body.password) };
  const errors = validateSignIn(values);
  if (Object.keys(errors).length > 0) return fail("Check the highlighted fields.", 400, errors);

  try {
    const user = await findUserByEmail(values.email);
    // Same message for unknown email and wrong password so accounts can't be probed.
    if (!user || !(await verifyPassword(values.password, user.passwordHash))) {
      return fail("Incorrect email or password.", 401);
    }
    // Only after the password is right, so the account's state is never revealed to someone who does not know it.
    const status = statusOf(user);
    if (status === "PENDING_EMAIL_VERIFICATION") {
      return NextResponse.json({ ok: false, message: "Confirm your email address first: follow the link we sent you, or request a new one.", code: "email_not_verified" }, { status: 403 });
    }
    if (status === "SUSPENDED") return fail("This account is not available. Contact support for help.", 403);
    await startSession(user._id.toString(), user.sessionVersion ?? 0);
    await recordLogin(user._id);
    return NextResponse.json({ ok: true, user: toPublicUser({ ...user, _id: user._id }) });
  } catch (error) {
    console.error("login failed", error);
    return fail("Sign-in is unavailable right now. Please try again.", 503);
  }
}

export const POST = withApiPerf("POST api/auth/login", handlePOST);
