import { ObjectId, type Collection, type Filter } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import {
  ALERT_RETENTION_DAYS,
  EVENT_LABEL,
  EVENT_RETENTION_DAYS,
  FAILED_LOGIN_ALERT_THRESHOLD,
  FAILED_LOGIN_BUCKET_MINUTES,
  FAILED_LOGIN_RETENTION_DAYS,
  eventKey,
  isSecurityEventType,
  parseEventKey,
  rangeSince,
  type EventStatus,
  type SecurityEventType,
  type SecurityListQuery,
} from "./securityRules";

/**
 * The account's security history. One collection, `security_events` (it already held password-reset, password-change and sign-out events
 * from earlier pages; those rows stay and keep their shape), and one for the alerts raised from it, `security_alerts`. Events are written
 * by the code that really performs the action (sign-in, sign-out, session revocation, password change); nothing here invents one, and
 * reading a page never writes one. No IP address, password, token, cookie or raw User-Agent is stored: only a device label.
 */
export interface SecurityEventDoc {
  _id?: ObjectId;
  userId: ObjectId;
  type: string;
  at: Date;
  /** Older rows (profile and password events) carry a field list instead. */
  fields?: string[];
  sessionPublicId?: string;
  deviceLabel?: string;
  deviceKey?: string;
  /** Sign-in from a browser/OS combination this account had not used before. */
  newDevice?: boolean;
  /** LOGIN_FAILED: how many failures fell in this bucket. SIGNED_OUT_EVERYWHERE / SESSION_REVOKED: how many sessions were ended. */
  count?: number;
  alertId?: string;
  /** One row per value for this account (the failed-sign-in bucket, an alert): a retry cannot add a second. */
  dedupeKey?: string;
  purgeAt?: Date;
}

let eventIndexes: Promise<unknown> | undefined;
export async function securityEventsCollection(): Promise<Collection<SecurityEventDoc>> {
  const col = (await getDb()).collection<SecurityEventDoc>("security_events");
  eventIndexes ??= Promise.all([
    // the timeline: this account's events, newest first (the same index the earlier pages created, plus the id as tie-break)
    col.createIndex({ userId: 1, at: -1, _id: -1 }, { name: "user_events_newest" }),
    // login activity: the account's sign-in events, newest first, without reading the others
    col.createIndex({ userId: 1, type: 1, at: -1, _id: -1 }, { name: "user_events_by_type" }),
    col.createIndex({ userId: 1, dedupeKey: 1 }, { unique: true, name: "user_event_once", partialFilterExpression: { dedupeKey: { $exists: true } } }),
    col.createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0, name: "event_retention" }),
  ]);
  await eventIndexes;
  return col;
}

const days = (n: number, from = new Date()) => new Date(from.getTime() + n * 86_400_000);
const isDuplicateKey = (e: unknown) => (e as { code?: number }).code === 11000;

/** Writes one event. Never throws: a failed write must not break the action it describes (it is logged by type only). Returns whether a row was written. */
export async function recordSecurityEvent(userId: ObjectId, type: SecurityEventType, extra: Partial<Omit<SecurityEventDoc, "_id" | "userId" | "type" | "at" | "purgeAt">> = {}, now = new Date()): Promise<boolean> {
  try {
    await (await securityEventsCollection()).insertOne({ userId, type, at: now, ...extra, purgeAt: days(EVENT_RETENTION_DAYS, now) });
    return true;
  } catch (error) {
    if (!isDuplicateKey(error)) console.error("security event not recorded", type);
    return false;
  }
}

/**
 * A failed sign-in for an account that exists. Failures are counted in buckets of FAILED_LOGIN_BUCKET_MINUTES: ONE row per bucket with a count,
 * so someone repeatedly guessing a password cannot fill the owner's history. Returns the bucket's count after this failure.
 */
export async function recordFailedLogin(userId: ObjectId, deviceLabel: string, now = new Date()): Promise<number> {
  const col = await securityEventsCollection();
  const bucket = Math.floor(now.getTime() / (FAILED_LOGIN_BUCKET_MINUTES * 60_000));
  const filter = { userId, dedupeKey: `failed:${bucket}` };
  const update = { $inc: { count: 1 }, $setOnInsert: { type: "LOGIN_FAILED", at: now, deviceLabel, purgeAt: days(FAILED_LOGIN_RETENTION_DAYS, now) } };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const doc = await col.findOneAndUpdate(filter, update, { upsert: true, returnDocument: "after", projection: { count: 1 } });
      return doc?.count ?? 1;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      // two failures raced to create the same bucket: the second finds the first's row on the retry
    }
  }
  return 1;
}

export const FAILED_ALERT_THRESHOLD = FAILED_LOGIN_ALERT_THRESHOLD;

// ---------- reading ----------
export interface SecurityEventDto {
  id: string;
  type: SecurityEventType;
  title: string;
  description: string;
  status: EventStatus;
  at: string;
  deviceLabel: string | null;
  count: number | null;
  newDevice: boolean;
}

function describe(e: SecurityEventDoc): string {
  switch (e.type) {
    case "LOGIN_SUCCEEDED":
      return e.newDevice ? "Signed in from a browser and system not used with this account before." : "Signed in.";
    case "LOGIN_FAILED":
      return `${e.count ?? 1} ${(e.count ?? 1) === 1 ? "attempt" : "attempts"} with a wrong password.`;
    case "LOGOUT":
      return "This session was ended by signing out.";
    case "PASSWORD_CHANGED":
      return "The password was changed while signed in. Other devices were signed out.";
    case "PASSWORD_RESET":
      return "The password was reset with an emailed link. Every device was signed out.";
    case "SIGNED_OUT_EVERYWHERE":
      return typeof e.count === "number" ? `${e.count} other ${e.count === 1 ? "device was" : "devices were"} signed out.` : "Other devices were signed out.";
    case "SESSION_REVOKED":
      return "A signed-in device was signed out from the security page.";
    default:
      return "A security alert was raised for this account.";
  }
}

function toDto(e: SecurityEventDoc & { _id: ObjectId }): SecurityEventDto {
  const type = e.type as SecurityEventType;
  return { id: e._id.toHexString(), type, title: EVENT_LABEL[type].title, description: describe(e), status: EVENT_LABEL[type].status, at: e.at.toISOString(), deviceLabel: e.deviceLabel ?? null, count: typeof e.count === "number" ? e.count : null, newDevice: e.newDevice === true };
}

export interface EventPage {
  events: SecurityEventDto[];
  meta: { hasMore: boolean; nextCursor: string | null; since: string };
}

/** One page of the account's events (newest first). `types` limits it (login activity); older rows of other kinds (profile edits...) are never listed. */
export async function listSecurityEvents(userId: ObjectId, types: readonly SecurityEventType[], query: SecurityListQuery, now = new Date()): Promise<EventPage> {
  const since = rangeSince(query.range, now);
  const filter: Filter<SecurityEventDoc> = { userId, type: { $in: [...types] }, at: { $gte: since } };
  const k = query.before ? parseEventKey(query.before) : null;
  if (k) {
    const at = new Date(k.ms);
    Object.assign(filter, { $or: [{ at: { $lt: at } }, { at, _id: { $lt: new ObjectId(k.id) } }] });
  }
  const docs = (await (await securityEventsCollection())
    .find(filter, { projection: { type: 1, at: 1, deviceLabel: 1, count: 1, newDevice: 1 } })
    .sort({ at: -1, _id: -1 })
    .limit(query.limit + 1)
    .toArray()) as (SecurityEventDoc & { _id: ObjectId })[];
  const hasMore = docs.length > query.limit;
  const shown = (hasMore ? docs.slice(0, query.limit) : docs).filter((d) => isSecurityEventType(d.type));
  const last = shown.at(-1);
  return { events: shown.map(toDto), meta: { hasMore, nextCursor: hasMore && last ? eventKey(last.at, last._id.toHexString()) : null, since: since.toISOString() } };
}

/** When the first sign-in was recorded (null: none yet): the start of the history the page can show. */
export async function firstRecordedSignIn(userId: ObjectId): Promise<Date | null> {
  const first = await (await securityEventsCollection()).find({ userId, type: "LOGIN_SUCCEEDED" }, { projection: { at: 1 } }).sort({ at: 1 }).limit(1).toArray();
  return first[0]?.at ?? null;
}

export { ALERT_RETENTION_DAYS };
