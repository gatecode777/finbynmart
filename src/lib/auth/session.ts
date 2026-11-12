import { createHmac, timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";
import { cookies, headers } from "next/headers";
import { bindSessionVersion, createRegistrySession, findActiveSession, hashSid, revokeBySidHash, SESSION_MAX_AGE_MS, SID_PATTERN, touchSession, type CreatedSession } from "./sessionRegistry";
import { findUserById, statusOf, toPublicUser, type PublicUser } from "./users";

const COOKIE = "finbyn_session";
const MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must be set to a random string of 32+ characters");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** `sid` names the session in the server-side registry (absent in cookies issued before the registry existed). */
function createToken(userId: string, version: number, sid: string | null): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, v: version, ...(sid ? { sid } : {}), exp: Date.now() + MAX_AGE_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

interface Claims {
  sub: string;
  v: number;
  sid: string | null;
}

function readToken(token: string): Claims | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { sub, exp, v, sid } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub: string; exp: number; v?: number; sid?: string };
    if (typeof sub !== "string" || !(exp > Date.now())) return null;
    if (sid !== undefined && (typeof sid !== "string" || !SID_PATTERN.test(sid))) return null;
    return { sub, v: typeof v === "number" ? v : 0, sid: sid ?? null };
  } catch {
    return null;
  }
}

async function readClaims(): Promise<Claims | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? readToken(token) : null;
}

async function setCookie(userId: string, version: number, sid: string | null): Promise<void> {
  (await cookies()).set(COOKIE, createToken(userId, version, sid), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

const userAgent = async () => (await headers()).get("user-agent");

/**
 * Starts a NEW session: a registry record (device label from the User-Agent, creation time, expiry) and a cookie carrying its id.
 * `sessionVersion` is the user's current version (0 when the account has never had a password reset). If the registry write fails the
 * error is thrown and no cookie is set: a session that could not be revoked is never issued.
 */
export async function startSession(userId: string, sessionVersion = 0): Promise<CreatedSession> {
  const created = await createRegistrySession(new ObjectId(userId), sessionVersion, await userAgent());
  await setCookie(userId, sessionVersion, created.sid);
  return created;
}

/**
 * After the account's session version was raised (sign out everywhere, other devices revoked): THIS device keeps its registry record,
 * creation time and device, and gets a cookie for the new version. A cookie that has no registry record (issued before the registry)
 * is upgraded to a registry session here.
 */
export async function reissueSession(userId: string, sessionVersion: number): Promise<void> {
  const claims = await readClaims();
  if (claims?.sid && claims.sub === userId) {
    const doc = await findActiveSession(hashSid(claims.sid));
    if (doc && doc.userId.toHexString() === userId) {
      await bindSessionVersion(doc.sidHash, sessionVersion);
      await setCookie(userId, sessionVersion, claims.sid);
      return;
    }
  }
  await startSession(userId, sessionVersion);
}

/**
 * After a credential change (password): a NEW session id replaces the current one (the old record is ended as "rotated"; the new one keeps
 * the original creation time and device), so an identifier that existed before the change can never be used afterwards.
 */
export async function rotateSession(userId: string, sessionVersion: number): Promise<CreatedSession> {
  const claims = await readClaims();
  const old = claims?.sid && claims.sub === userId ? await findActiveSession(hashSid(claims.sid)) : null;
  const created = await createRegistrySession(new ObjectId(userId), sessionVersion, await userAgent(), old ? { createdAt: old.createdAt } : undefined);
  if (old) await revokeBySidHash(old.sidHash, "rotated");
  await setCookie(userId, sessionVersion, created.sid);
  return created;
}

/** Ends the current session on the server (its registry record is revoked) and clears the cookie. Returns who was signed out, when it can be told. */
export async function endSession(): Promise<{ userId: string; publicId: string | null } | null> {
  const claims = await readClaims();
  let ended: { userId: string; publicId: string | null } | null = null;
  if (claims) {
    ended = { userId: claims.sub, publicId: null };
    if (claims.sid) {
      const revoked = await revokeBySidHash(hashSid(claims.sid), "logout").catch(() => null);
      if (revoked && revoked.userId.toHexString() === claims.sub) ended.publicId = revoked.publicId;
    }
  }
  (await cookies()).delete(COOKIE);
  return ended;
}

/** The current browser's session as named by its (verified) cookie. No database read. */
export async function currentSessionRef(): Promise<{ userId: string; sidHash: string } | null> {
  const claims = await readClaims();
  return claims?.sid ? { userId: claims.sub, sidHash: hashSid(claims.sid) } : null;
}

/** Set AUTH_REQUIRE_SESSION_REGISTRY=1 once the 7-day window for old cookies has passed: a cookie with no registry record is then refused. */
const registryRequired = () => process.env.AUTH_REQUIRE_SESSION_REGISTRY === "1";

export async function getCurrentUser(): Promise<PublicUser | null> {
  const claims = await readClaims();
  if (!claims) return null;
  // the account and its session record are read together: revocation costs no extra round trip
  const [user, session] = await Promise.all([findUserById(claims.sub), claims.sid ? findActiveSession(hashSid(claims.sid)) : Promise.resolve(null)]);
  if (!user) return null;
  // a cookie issued before the last password reset or sign-out-everywhere carries an older version and is refused
  if ((user.sessionVersion ?? 0) !== claims.v) return null;
  if (claims.sid) {
    // a revoked, expired or unknown session record (or one that belongs to someone else) is refused at once
    if (!session || session.userId.toHexString() !== claims.sub || session.v !== claims.v) return null;
    void touchSession(session).catch(() => undefined);
  } else if (registryRequired()) {
    return null;
  }
  // a suspended (or never-verified) account loses its existing session at once
  return statusOf(user) === "ACTIVE" ? toPublicUser({ ...user, _id: user._id }) : null;
}
