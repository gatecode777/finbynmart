import { NextResponse } from "next/server";
import { fail, readJson, str } from "@/lib/auth/http";
import { verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { findUserByEmail, toPublicUser } from "@/lib/auth/users";
import { validateSignIn } from "@/lib/validations/account";

export async function POST(request: Request) {
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
    await startSession(user._id.toString());
    return NextResponse.json({ ok: true, user: toPublicUser({ ...user, _id: user._id }) });
  } catch (error) {
    console.error("login failed", error);
    return fail("Sign-in is unavailable right now. Please try again.", 503);
  }
}
