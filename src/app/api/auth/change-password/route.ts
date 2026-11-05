import { NextResponse } from "next/server";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { checkBuyerPassword } from "@/lib/auth/buyerRegistration";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getCurrentUser, startSession } from "@/lib/auth/session";
import { changePasswordHash, findUserById } from "@/lib/auth/users";
import { rateLimit } from "@/lib/security/rateLimit";
import { recordProfileEvent } from "@/lib/buyer/profile";
import { ObjectId } from "mongodb";
import { notifyPasswordChanged } from "@/lib/buyer/notifications";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * POST { currentPassword, newPassword, confirmPassword } for the signed-in account (buyer or supplier).
 * The current password must be right (checked with the shared scrypt verify; each attempt that gets that far counts against a
 * limit of 5 per 10 minutes), the new one must pass the same policy as registration and reset and differ from the current one. The hash is
 * replaced and the session version bumped in one update, so every OTHER device is signed out; this device gets a fresh cookie
 * with the new version and stays signed in.
 */
async function handlePOST(request: Request) {
  const session = await getCurrentUser().catch(() => null);
  if (!session) return NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401, headers: NO_STORE });
  const body = await readSmallJson(request, 2_000);
  if (!body) return fail("Invalid request.");
  const fields: Record<string, string> = {};
  if (typeof body.currentPassword !== "string" || body.currentPassword.length === 0) fields.currentPassword = "Enter your current password.";
  const problem = checkBuyerPassword(body.newPassword);
  if (problem) fields.newPassword = problem;
  if (typeof body.confirmPassword !== "string" || body.confirmPassword !== body.newPassword) fields.confirmPassword = "Your passwords do not match.";
  if (!fields.newPassword && body.newPassword === body.currentPassword) fields.newPassword = "Choose a password different from your current one.";
  if (Object.keys(fields).length > 0) return NextResponse.json({ ok: false, message: "Check the highlighted fields.", fields }, { status: 400, headers: NO_STORE });

  // Only an attempt that really tests the current password counts: typos, weak or mismatched new passwords never use up the limit.
  const limit = await rateLimit(`change-password:${session.id}`, 5, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const user = await findUserById(session.id);
  if (!user || !(await verifyPassword(body.currentPassword as string, user.passwordHash))) {
    return NextResponse.json({ ok: false, message: "Your current password is not correct.", fields: { currentPassword: "Your current password is not correct." } }, { status: 400, headers: NO_STORE });
  }
  const sessionVersion = await changePasswordHash(user._id, await hashPassword(body.newPassword as string));
  await recordProfileEvent(new ObjectId(session.id), "PASSWORD_CHANGED", []);
  await startSession(session.id, sessionVersion);
  if (user.role === "buyer") await notifyPasswordChanged(session.id, sessionVersion);
  return NextResponse.json({ ok: true, message: "Your password was changed. You were signed out of your other devices." }, { headers: NO_STORE });
}

export const POST = withApiPerf("POST api/auth/change-password", handlePOST);
