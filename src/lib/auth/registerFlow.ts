import { NextResponse } from "next/server";
import { fail } from "@/lib/auth/http";
import { hashPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { createUser, toPublicUser, type UserDoc } from "@/lib/auth/users";
import { sendAccountEmail } from "@/lib/auth/mail";
import { emailConfigured } from "@/lib/email/provider";

/**
 * Creates the account and answers the request, for the buyer and supplier registration routes.
 * With an email provider the account starts PENDING_EMAIL_VERIFICATION, no session is opened and a confirmation link is
 * emailed; without one nobody could ever confirm, so the account is ACTIVE (emailVerified false) and the person is signed in.
 */
type NewAccount = Pick<UserDoc, "name" | "email" | "role" | "phone" | "companyName" | "supplier"> & { password: string; consentPolicyVersion: string };

export async function registerAccount(request: Request, input: NewAccount) {
  const verifyByEmail = emailConfigured();
  try {
    const { password, consentPolicyVersion, ...profile } = input;
    const user = await createUser({
      ...profile,
      passwordHash: await hashPassword(password),
      ...(input.role === "buyer" ? { companyStatus: "UNVERIFIED" as const } : {}),
      accountStatus: verifyByEmail ? "PENDING_EMAIL_VERIFICATION" : "ACTIVE",
      emailVerified: false,
      phoneVerified: false,
      consent: { acceptedAt: new Date(), policyVersion: consentPolicyVersion },
      lastLoginAt: null,
    });
    if (!user) return fail("An account with this email already exists.", 409, { email: "This email is already registered. Sign in instead." });

    if (!verifyByEmail) {
      await startSession(user._id.toString());
      return NextResponse.json({ ok: true, message: "Your account is ready.", user: toPublicUser(user), verification: "not_configured", signedIn: true }, { status: 201 });
    }
    const sent = await sendAccountEmail(request, user, "verify_email");
    return NextResponse.json(
      {
        ok: true,
        message: sent.status === "sent" ? "Account created. Confirm your email address to sign in." : "Account created, but the confirmation email could not be sent. Request a new one.",
        verification: sent.status === "sent" ? "email_sent" : "email_failed",
        signedIn: false,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("registration failed", error);
    return fail("Registration is unavailable right now. Please try again.", 503);
  }
}
