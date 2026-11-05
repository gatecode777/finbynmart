import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { LOGIN_PATH } from "./resetMessages";
import { resetConfirmationMinutes } from "./securityConfig";
import type { UserRole } from "./users";

/**
 * Proof, for the "password reset successful" page, that a reset really completed in THIS browser.
 *
 * Page 20's reset route sets the cookie only after the transaction committed. The cookie holds nothing but the id of the
 * `security_events` row that transaction wrote, an expiry, and an HMAC signature (domain-separated from the session cookie,
 * so a session cookie can never pass as a confirmation and the reverse). It holds no email, role, token or password.
 * The role and the session-revocation result are read from that stored event, never from the cookie or the URL. The cookie
 * is httpOnly, path-limited to /password-reset, short-lived, is not read by `getCurrentUser()`, and therefore cannot be used
 * to sign in or to call any API. A query parameter such as ?success=true is ignored.
 */
export const CONFIRMATION_COOKIE = "finbyn_reset_ok";
export const CONFIRMATION_PATH = "/password-reset";

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must be set to a random string of 32+ characters");
  return value;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(`reset-confirmation:${payload}`).digest("base64url");

export function createConfirmationValue(eventId: string, now = Date.now()): { value: string; maxAgeSeconds: number } {
  const maxAgeSeconds = resetConfirmationMinutes() * 60;
  const payload = Buffer.from(JSON.stringify({ e: eventId, x: now + maxAgeSeconds * 1000 })).toString("base64url");
  return { value: `${payload}.${sign(payload)}`, maxAgeSeconds };
}

export type ConfirmationReadResult = { state: "INVALID" } | { state: "EXPIRED" } | { state: "OK"; eventId: string };

/** Checks the signature and the expiry only; the stored event is checked by getPasswordResetConfirmation. */
export function readConfirmationValue(value: string | undefined, now = Date.now()): ConfirmationReadResult {
  if (!value || value.length > 400) return { state: "INVALID" };
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return { state: "INVALID" };
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { state: "INVALID" };
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { e?: unknown; x?: unknown };
    if (typeof e !== "string" || !ObjectId.isValid(e) || typeof x !== "number") return { state: "INVALID" };
    return x > now ? { state: "OK", eventId: e } : { state: "EXPIRED" };
  } catch {
    return { state: "INVALID" };
  }
}

/** Where a person signs in after a reset, from the stored role. An unknown role gets the generic sign-in page, never a guess. */
export function resolveAccountLoginDestination(role: unknown): { accountType: "BUYER" | "SUPPLIER" | null; loginPath: string } {
  if (role === "buyer") return { accountType: "BUYER", loginPath: LOGIN_PATH.buyer };
  if (role === "supplier") return { accountType: "SUPPLIER", loginPath: LOGIN_PATH.supplier };
  return { accountType: null, loginPath: "/sign-in" };
}

export type PasswordResetConfirmation =
  | { state: "VALID"; accountType: "BUYER" | "SUPPLIER" | null; loginPath: string; sessionsRevoked: boolean; completedAt: string }
  | { state: "MISSING" | "INVALID" | "EXPIRED" | "UNAVAILABLE" };

/**
 * Reads the confirmation for the current request. Returns only safe fields. One cookie read and, when the cookie is genuine and
 * unexpired, one lookup of a single event row by _id with a minimal projection (no user document is loaded).
 * The event's own age is checked too, so a signed cookie cannot outlive the confirmation window.
 */
export async function getPasswordResetConfirmation(): Promise<PasswordResetConfirmation> {
  const value = (await cookies()).get(CONFIRMATION_COOKIE)?.value;
  if (!value) return { state: "MISSING" };
  const read = readConfirmationValue(value);
  if (read.state !== "OK") return { state: read.state };
  try {
    const event = await (await getDb()).collection("security_events").findOne({ _id: new ObjectId(read.eventId), type: "PASSWORD_RESET" }, { projection: { at: 1, role: 1, sessionsRevoked: 1 } });
    if (!event || !(event.at instanceof Date)) return { state: "INVALID" };
    if (Date.now() - event.at.getTime() > resetConfirmationMinutes() * 60_000) return { state: "EXPIRED" };
    const destination = resolveAccountLoginDestination(event.role as UserRole | undefined);
    // reported exactly as stored: only an event that recorded the revocation says so
    return { state: "VALID", accountType: destination.accountType, loginPath: destination.loginPath, sessionsRevoked: event.sessionsRevoked === true, completedAt: event.at.toISOString() };
  } catch {
    return { state: "UNAVAILABLE" };
  }
}
