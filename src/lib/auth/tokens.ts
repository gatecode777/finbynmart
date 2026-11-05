import { createHash, randomBytes } from "node:crypto";
import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { findAccountForToken, statusOf } from "./users";
import { resetTtlMinutes, verifyTtlHours } from "./securityConfig";

/**
 * One-time tokens for email verification and password reset, in the `auth_tokens` collection.
 *
 * Only a SHA-256 hash of the token is stored (the raw token exists in the emailed link and nowhere else). A token works once
 * (consumed by an atomic conditional update), expires, and issuing a new one for the same purpose revokes the earlier ones.
 * Used, revoked and expired rows are KEPT for a day after expiry (`purgeAt`, a TTL index) so a visitor with an old link is
 * told "already used" or "expired" instead of "unknown"; the TTL only cleans storage, every check still tests the state.
 */
export type TokenPurpose = "verify_email" | "reset_password";

export type TokenState = "VALID" | "INVALID" | "EXPIRED" | "ALREADY_USED" | "REVOKED" | "ACCOUNT_UNAVAILABLE";

const KEEP_AFTER_EXPIRY_MS = 24 * 3_600_000;

/** Lifetimes come from securityConfig (reset: 30 minutes by default, confirmation: 24 hours). Read at issue time so a change applies to new links. */
export const tokenTtlMs = (purpose: TokenPurpose): number => (purpose === "reset_password" ? resetTtlMinutes() * 60_000 : verifyTtlHours() * 3_600_000);

export interface TokenDoc {
  _id?: ObjectId;
  userId: ObjectId;
  purpose: TokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  /** Set when a newer token replaced this one or a reset invalidated it. */
  revokedAt?: Date | null;
  /** When the row may be deleted (expiry plus a day). */
  purgeAt: Date;
  createdAt: Date;
  /** Safe request metadata: a truncated hash of the client address, never the address itself. */
  requestMetadata?: { ipHash: string };
}

let indexReady: Promise<unknown> | undefined;

export async function tokensCollection(): Promise<Collection<TokenDoc>> {
  const collection = (await getDb()).collection<TokenDoc>("auth_tokens");
  indexReady ??= (async () => {
    // an earlier version expired rows with a TTL on expiresAt; it would delete rows the states above rely on
    await collection.dropIndex("expiresAt_1").catch(() => undefined);
    await Promise.all([
      collection.createIndex({ tokenHash: 1 }, { unique: true }),
      collection.createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0 }),
      collection.createIndex({ userId: 1, purpose: 1 }),
    ]);
  })();
  await indexReady;
  return collection;
}

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Raw tokens are 43 URL-safe characters; anything else cannot be one of ours. */
export const isTokenShape = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

export async function issueToken(userId: ObjectId, purpose: TokenPurpose, clientAddress?: string): Promise<{ token: string; expiresAt: Date }> {
  const collection = await tokensCollection();
  const now = new Date();
  await collection.updateMany({ userId, purpose, usedAt: null, revokedAt: null }, { $set: { revokedAt: now } });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + tokenTtlMs(purpose));
  await collection.insertOne({
    userId,
    purpose,
    tokenHash: hashToken(token),
    expiresAt,
    usedAt: null,
    revokedAt: null,
    purgeAt: new Date(expiresAt.getTime() + KEEP_AFTER_EXPIRY_MS),
    createdAt: now,
    ...(clientAddress ? { requestMetadata: { ipHash: hashToken(clientAddress).slice(0, 16) } } : {}),
  });
  return { token, expiresAt };
}

/**
 * What state a link is in, without using it. Order: used, expired (a replaced link that has also expired is just expired), revoked, then whether the account can still be recovered.
 * Reads only the token row and a minimal account projection; never returns anything about the account.
 */
export async function inspectToken(raw: unknown, purpose: TokenPurpose): Promise<TokenState> {
  if (!isTokenShape(raw)) return "INVALID";
  const doc = await (await tokensCollection()).findOne({ tokenHash: hashToken(raw), purpose }, { projection: { userId: 1, expiresAt: 1, usedAt: 1, revokedAt: 1 } });
  if (!doc) return "INVALID";
  if (doc.usedAt) return "ALREADY_USED";
  if (doc.expiresAt.getTime() <= Date.now()) return "EXPIRED";
  if (doc.revokedAt) return "REVOKED";
  const account = await findAccountForToken(doc.userId);
  if (!account || statusOf(account) === "SUSPENDED") return "ACCOUNT_UNAVAILABLE";
  return "VALID";
}

/** Whether the token is currently usable, without using it. */
export async function peekToken(raw: unknown, purpose: TokenPurpose): Promise<boolean> {
  return (await inspectToken(raw, purpose)) === "VALID";
}

/** Uses the token exactly once. Returns the user it was issued for, or null when it is unknown, used, revoked, expired or for another purpose. */
export async function consumeToken(raw: unknown, purpose: TokenPurpose): Promise<ObjectId | null> {
  if (!isTokenShape(raw)) return null;
  const doc = await (await tokensCollection()).findOneAndUpdate(
    { tokenHash: hashToken(raw), purpose, usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
  );
  return doc ? doc.userId : null;
}
