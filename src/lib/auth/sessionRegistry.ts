import { createHash, randomBytes } from "node:crypto";
import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { deviceKeyFor, parseUserAgent } from "./deviceInfo";

/**
 * The server-side record of every signed-in browser (Page 38). The cookie carries a random session id (`sid`); only its SHA-256 is
 * stored here, so a copy of the database cannot be used to sign in. The registry takes part in authentication (getCurrentUser reads it
 * on every request): a session with `revokedAt` set, or past `expiresAt`, is refused on its very next request. Cookies issued before the
 * registry existed carry no `sid`; they keep working until their own expiry (at most 7 days) unless AUTH_REQUIRE_SESSION_REGISTRY=1, and
 * are ended by "sign out everywhere" and password changes, which also raise the account's session version.
 */
export type RevokeReason = "user" | "other_devices" | "signed_out_everywhere" | "password_changed" | "password_reset" | "logout" | "rotated" | "limit";

export interface AuthSessionDoc {
  _id?: ObjectId;
  userId: ObjectId;
  /** Random, safe to show the owner; names the session in the API (the sid itself is never exposed). */
  publicId: string;
  sidHash: string;
  /** The account's session version when this session was issued or last re-issued. */
  v: number;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason?: RevokeReason;
  deviceLabel: string;
  browser: string;
  os: string;
  deviceType: string;
  deviceKey: string;
  /** Always null: no approved location source exists. */
  approxLocation: string | null;
}

export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** A session record is kept this long after it expires (for the history and the new-device check), then removed by a TTL index. */
export const SESSION_RETENTION_AFTER_EXPIRY_S = 30 * 24 * 60 * 60;
/** At most this many active sessions per account: starting another ends the one that was used least recently. */
export const MAX_ACTIVE_SESSIONS = 20;
/** lastActiveAt is written at most this often per session. */
export const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export const hashSid = (sid: string) => createHash("sha256").update(sid).digest("hex");
export const newSid = () => randomBytes(32).toString("base64url");
export const SID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

let indexes: Promise<unknown> | undefined;
export async function sessionsCollection(): Promise<Collection<AuthSessionDoc>> {
  const col = (await getDb()).collection<AuthSessionDoc>("auth_sessions");
  indexes ??= Promise.all([
    col.createIndex({ sidHash: 1 }, { unique: true, name: "session_sid_hash" }),
    col.createIndex({ publicId: 1 }, { unique: true, name: "session_public_id" }),
    // the buyer's own list and count: equality on user and "not revoked", newest activity first, no sort stage
    col.createIndex({ userId: 1, revokedAt: 1, lastActiveAt: -1 }, { name: "user_active_sessions" }),
    // "have we seen this browser/OS for this account before"
    col.createIndex({ userId: 1, deviceKey: 1 }, { name: "user_device_key" }),
    col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: SESSION_RETENTION_AFTER_EXPIRY_S, name: "session_retention" }),
  ]);
  await indexes;
  return col;
}

const activeFilter = (now: Date) => ({ revokedAt: null, expiresAt: { $gt: now } });

export interface CreatedSession {
  sid: string;
  publicId: string;
  deviceLabel: string;
}

/** Starts a registry session for a sign-in. Keeps the account under MAX_ACTIVE_SESSIONS by ending the least recently used one. */
export async function createRegistrySession(userId: ObjectId, version: number, userAgent: string | null, carry?: Pick<AuthSessionDoc, "createdAt">, now = new Date()): Promise<CreatedSession> {
  const col = await sessionsCollection();
  const info = parseUserAgent(userAgent);
  const sid = newSid();
  const publicId = randomBytes(8).toString("hex");
  await col.insertOne({
    userId,
    publicId,
    sidHash: hashSid(sid),
    v: version,
    createdAt: carry?.createdAt ?? now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_MS),
    revokedAt: null,
    deviceLabel: info.label,
    browser: info.browser,
    os: info.os,
    deviceType: info.deviceType,
    deviceKey: deviceKeyFor(userId.toHexString(), info),
    approxLocation: null,
  });
  // bound the inventory: the oldest-used sessions beyond the cap are ended (a normal account never gets near it)
  const live = await col.find({ userId, ...activeFilter(now) }, { projection: { _id: 1 } }).sort({ lastActiveAt: 1 }).limit(MAX_ACTIVE_SESSIONS + 5).toArray();
  if (live.length > MAX_ACTIVE_SESSIONS) {
    const extra = live.slice(0, live.length - MAX_ACTIVE_SESSIONS).map((d) => d._id!);
    await col.updateMany({ _id: { $in: extra } }, { $set: { revokedAt: now, revokedReason: "limit" } });
  }
  return { sid, publicId, deviceLabel: info.label };
}

export async function findActiveSession(sidHash: string, now = new Date()): Promise<AuthSessionDoc | null> {
  return (await sessionsCollection()).findOne({ sidHash, ...activeFilter(now) });
}

/** Records activity at most every TOUCH_INTERVAL_MS (the caller does not wait for it). */
export async function touchSession(doc: AuthSessionDoc, now = new Date()): Promise<void> {
  if (now.getTime() - doc.lastActiveAt.getTime() < TOUCH_INTERVAL_MS) return;
  await (await sessionsCollection()).updateOne({ sidHash: doc.sidHash, revokedAt: null, lastActiveAt: { $lt: new Date(now.getTime() - TOUCH_INTERVAL_MS) } }, { $set: { lastActiveAt: now } });
}

/** Moves a session to the account's new session version (the cookie is re-issued with it); the record, its creation time and its device stay. */
export async function bindSessionVersion(sidHash: string, version: number): Promise<void> {
  await (await sessionsCollection()).updateOne({ sidHash, revokedAt: null }, { $set: { v: version } });
}

export async function listActiveSessions(userId: ObjectId, version: number, now = new Date()): Promise<AuthSessionDoc[]> {
  return (await sessionsCollection())
    .find({ userId, revokedAt: null, expiresAt: { $gt: now }, v: version }, { projection: { sidHash: 1, publicId: 1, createdAt: 1, lastActiveAt: 1, deviceLabel: 1, browser: 1, os: 1, deviceType: 1, approxLocation: 1, expiresAt: 1 } })
    .sort({ lastActiveAt: -1 })
    .limit(MAX_ACTIVE_SESSIONS + 5)
    .toArray();
}

export async function countActiveSessions(userId: ObjectId, version: number, now = new Date()): Promise<number> {
  return (await sessionsCollection()).countDocuments({ userId, revokedAt: null, expiresAt: { $gt: now }, v: version });
}

/** Ends ONE of the account's own sessions by its public id. Returns the ended session, or null when it is not an active session of this account. */
export async function revokeOwnSession(userId: ObjectId, publicId: string, reason: RevokeReason, now = new Date()): Promise<AuthSessionDoc | null> {
  return (await sessionsCollection()).findOneAndUpdate({ userId, publicId, ...activeFilter(now) }, { $set: { revokedAt: now, revokedReason: reason } }, { returnDocument: "before", projection: { publicId: 1, deviceLabel: 1, sidHash: 1 } });
}

/** Ends every active session of the account except (optionally) one. Returns how many were active and are now ended. */
export async function revokeSessions(userId: ObjectId, reason: RevokeReason, exceptSidHash?: string, now = new Date()): Promise<number> {
  const result = await (await sessionsCollection()).updateMany({ userId, ...activeFilter(now), ...(exceptSidHash ? { sidHash: { $ne: exceptSidHash } } : {}) }, { $set: { revokedAt: now, revokedReason: reason } });
  return result.modifiedCount;
}

export async function revokeBySidHash(sidHash: string, reason: RevokeReason, now = new Date()): Promise<AuthSessionDoc | null> {
  return (await sessionsCollection()).findOneAndUpdate({ sidHash, revokedAt: null }, { $set: { revokedAt: now, revokedReason: reason } }, { returnDocument: "before", projection: { userId: 1, publicId: 1 } });
}

/** True when this browser/OS combination has never been used to sign in to the account (a record of it in any session, current or expired within the retention). */
export async function isKnownDevice(userId: ObjectId, deviceKey: string): Promise<boolean> {
  return Boolean(await (await sessionsCollection()).findOne({ userId, deviceKey }, { projection: { _id: 1 } }));
}

export async function hasAnySession(userId: ObjectId): Promise<boolean> {
  return Boolean(await (await sessionsCollection()).findOne({ userId }, { projection: { _id: 1 } }));
}
