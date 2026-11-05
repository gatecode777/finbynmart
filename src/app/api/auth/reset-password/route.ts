import { NextResponse } from "next/server";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import { checkBuyerPassword } from "@/lib/auth/buyerRegistration";
import { hashPassword } from "@/lib/auth/password";
import { createHash } from "node:crypto";
import { endSession } from "@/lib/auth/session";
import { inspectToken, isTokenShape } from "@/lib/auth/tokens";
import { ensureSecurityEventIndexes, resetPasswordWithToken } from "@/lib/auth/passwordReset";
import { LOGIN_PATH, RESET_MESSAGES, toPublicState } from "@/lib/auth/resetMessages";
import { CONFIRMATION_COOKIE, CONFIRMATION_PATH, createConfirmationValue } from "@/lib/auth/resetConfirmation";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST { token, password, confirmPassword }: sets a new password with a reset token.
 *
 * Order: limit -> small body -> password rules and confirmation (400 on the field) -> token check WITHOUT using it (an
 * unusable link never costs a hash and a weak password never burns a good link) -> hash the new password with the shared
 * scrypt function -> one transaction (lib/auth/passwordReset.ts): consume the token, replace the hash, bump the session
 * version, confirm the address, revoke the account's other tokens, write a security event.
 * The role and the sign-in destination come from the stored account. Nothing in the request can set a user, role or redirect.
 * Success is reported only after the transaction committed, together with a short-lived signed confirmation cookie for
 * /password-reset/success. The browser's own session cookie is cleared; every older
 * session of the account stops working because its version no longer matches.
 */
async function handlePOST(request: Request) {
  const address = clientIp(request);
  const limit = await rateLimit(`reset:${address}`, 20, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const body = await readSmallJson(request, 2_000);
  if (!body) return fail("Invalid request.");

  const fields: Record<string, string> = {};
  const problem = checkBuyerPassword(body.password);
  if (problem) fields.password = problem;
  if (typeof body.confirmPassword !== "string" || body.confirmPassword !== body.password) fields.confirmPassword = "Your passwords do not match.";
  if (Object.keys(fields).length > 0) return fail("Check the highlighted fields.", 400, fields);

  const stages: Record<string, number> = {};
  const t0 = performance.now();
  try {
    const state = isTokenShape(body.token) ? await inspectToken(body.token, "reset_password") : "INVALID";
    stages.tokenLookupMs = Math.round(performance.now() - t0);
    if (state !== "VALID") {
      const shown = toPublicState(state);
      return NextResponse.json({ ok: false, message: RESET_MESSAGES[shown], code: shown, fields: { token: shown } }, { status: 400, headers: NO_STORE });
    }

    const t1 = performance.now();
    const hash = await hashPassword(body.password as string);
    stages.hashMs = Math.round(performance.now() - t1);

    const outcome = await resetPasswordWithToken(body.token, hash, createHash("sha256").update(address).digest("hex").slice(0, 16));
    if (!outcome.ok) {
      const shown = toPublicState(outcome.state);
      return NextResponse.json({ ok: false, message: RESET_MESSAGES[shown], code: shown, fields: { token: shown } }, { status: 400, headers: NO_STORE });
    }
    stages.transactionMs = outcome.ms.transaction;
    await ensureSecurityEventIndexes().catch(() => undefined);
    await endSession();
    if (process.env.FINBYN_PERF === "1") console.log(JSON.stringify({ type: "perf", kind: "reset-stages", route: "POST api/auth/reset-password", ...stages, totalMs: Math.round(performance.now() - t0) }));
    const redirectTo = outcome.role === "supplier" ? LOGIN_PATH.supplier : LOGIN_PATH.buyer;
    // Proof for the success page, issued only now that the transaction has committed (see lib/auth/resetConfirmation.ts).
    const confirmation = createConfirmationValue(outcome.eventId);
    const response = NextResponse.json({ ok: true, message: "Your password has been updated successfully.", data: { redirectTo, confirmationPath: "/password-reset/success" } }, { headers: NO_STORE });
    response.cookies.set(CONFIRMATION_COOKIE, confirmation.value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: CONFIRMATION_PATH, maxAge: confirmation.maxAgeSeconds });
    return response;
  } catch (error) {
    console.error("reset password failed", error instanceof Error ? error.name : "error");
    return NextResponse.json({ ok: false, message: "The reset is unavailable right now. Nothing was changed. Please try again.", code: "UNAVAILABLE" }, { status: 503, headers: NO_STORE });
  }
}

export const POST = withApiPerf("POST api/auth/reset-password", handlePOST);
