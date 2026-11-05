import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { findUserById, statusOf, toPublicUser, type PublicUser } from "./users";

const COOKIE = "finbyn_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must be set to a random string of 32+ characters");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function createToken(userId: string, version: number): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, v: version, exp: Date.now() + MAX_AGE_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string): { sub: string; v: number } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { sub, exp, v } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub: string; exp: number; v?: number };
    return typeof sub === "string" && exp > Date.now() ? { sub, v: typeof v === "number" ? v : 0 } : null;
  } catch {
    return null;
  }
}

/** `sessionVersion` is the user's current version (0 when the account has never had a password reset). */
export async function startSession(userId: string, sessionVersion = 0): Promise<void> {
  (await cookies()).set(COOKIE, createToken(userId, sessionVersion), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  const claims = token ? readToken(token) : null;
  if (!claims) return null;
  const user = await findUserById(claims.sub);
  // a cookie issued before the last password reset carries an older version and is refused
  if (user && (user.sessionVersion ?? 0) !== claims.v) return null;
  // a suspended (or never-verified) account loses its existing session at once
  return user && statusOf(user) === "ACTIVE" ? toPublicUser({ ...user, _id: user._id }) : null;
}
