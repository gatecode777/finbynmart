import { NextResponse } from "next/server";
import { fail, readJson, str, tooMany } from "@/lib/auth/http";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import { deviceKeyFor, parseUserAgent } from "@/lib/auth/deviceInfo";
import { verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { hasAnySession, isKnownDevice } from "@/lib/auth/sessionRegistry";
import { findUserByEmail, recordLogin, statusOf, toPublicUser, type UserDoc } from "@/lib/auth/users";
import { notifyNewDeviceSignIn, notifyRepeatedFailedLogins } from "@/lib/buyer/notifications";
import { raiseAlert } from "@/lib/buyer/security";
import { FAILED_ALERT_THRESHOLD, recordFailedLogin, recordSecurityEvent } from "@/lib/security/securityEvents";
import { resolvePostLoginPath } from "@/lib/auth/portals";
import { safeNext } from "@/lib/inquiries/rules";
import { validateSignIn } from "@/lib/validations/account";
import { withApiPerf } from "@/lib/perf/instrument";

/**
 * A wrong password for an account that EXISTS is counted in that account's security history (one row per 15 minutes, with a count): only
 * the owner ever sees it, nothing is stored for an unknown email, and no IP address or password is kept. Reaching the threshold raises one
 * alert per hour. Recording never changes the answer the caller gets.
 */
async function recordFailure(user: UserDoc & { _id: NonNullable<UserDoc["_id"]> }, request: Request): Promise<void> {
  try {
    const info = parseUserAgent(request.headers.get("user-agent"));
    const count = await recordFailedLogin(user._id, info.label);
    if (user.role === "buyer" && count >= FAILED_ALERT_THRESHOLD) {
      const hour = Math.floor(Date.now() / 3_600_000);
      const id = await raiseAlert(user._id, { type: "REPEATED_FAILED_LOGINS", severity: "warning", title: "Repeated failed sign-in attempts", summary: `${count} sign-in attempts with a wrong password in a short time.`, recommended: "If this was not you, change your password and sign out other devices.", dedupeKey: `failed:${hour}` });
      if (id) await notifyRepeatedFailedLogins(user._id.toHexString(), hour, count);
    }
  } catch {
    console.error("failed sign-in not recorded");
  }
}

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
      if (user) await recordFailure({ ...user, _id: user._id }, request);
      return fail("Incorrect email or password.", 401, { password: "Incorrect email or password." }); // inline under the password field; one message for both causes
    }
    // Only after the password is right, so the account's state is never revealed to someone who does not know it.
    const status = statusOf(user);
    if (status === "PENDING_EMAIL_VERIFICATION") {
      return NextResponse.json({ ok: false, message: "Confirm your email address first: follow the link we sent you, or request a new one.", code: "email_not_verified" }, { status: 403 });
    }
    if (status === "SUSPENDED") return fail("This account is not available. Contact support for help.", 403);

    // Is this a browser/OS this account has used before? (decided BEFORE the new session exists, from the registry's records)
    const info = parseUserAgent(request.headers.get("user-agent"));
    const key = deviceKeyFor(user._id.toHexString(), info);
    const [known, hadHistory] = await Promise.all([isKnownDevice(user._id, key).catch(() => true), hasAnySession(user._id).catch(() => false)]);
    const newDevice = hadHistory && !known;

    const session = await startSession(user._id.toString(), user.sessionVersion ?? 0);
    await recordLogin(user._id);
    await recordSecurityEvent(user._id, "LOGIN_SUCCEEDED", { sessionPublicId: session.publicId, deviceLabel: session.deviceLabel, newDevice });
    if (newDevice && user.role === "buyer") {
      const id = await raiseAlert(user._id, { type: "NEW_DEVICE_SIGN_IN", severity: "info", title: "New device signed in", summary: `A sign-in from ${session.deviceLabel}, which this account had not used before.`, recommended: "If this was you, no action is needed. If not, change your password and sign out other devices.", dedupeKey: `newdevice:${session.publicId}` });
      if (id) await notifyNewDeviceSignIn(user._id.toHexString(), session.deviceLabel, session.publicId);
    }
    // the role was read from the account on the server; the browser only follows this path (a requested page is kept only if the role may open it)
    return NextResponse.json({ ok: true, user: toPublicUser({ ...user, _id: user._id }), redirectTo: resolvePostLoginPath(user.role, safeNext(body.next)) });
  } catch (error) {
    console.error("login failed", error);
    return fail("Sign-in is unavailable right now. Please try again.", 503);
  }
}

export const POST = withApiPerf("POST api/auth/login", handlePOST);
