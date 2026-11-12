import { ObjectId, type Collection, type Filter } from "mongodb";
import { currentSessionRef } from "@/lib/auth/session";
import { countActiveSessions } from "@/lib/auth/sessionRegistry";
import { getDb } from "@/lib/db/mongo";
import { formatSubmitted } from "@/lib/inquiries/confirmation";
import { recordSecurityEvent, firstRecordedSignIn } from "@/lib/security/securityEvents";
import { ALERT_RETENTION_DAYS, RECENT_ALERT_DAYS, STATUS_LABEL, eventKey, parseEventKey, securityStatus, type SecurityStatus } from "@/lib/security/securityRules";

/**
 * The buyer's Account Security page (Page 38), server side. Every function takes the buyer from the verified session (never from a
 * request) and every query names that buyer: another account's session, event or alert cannot be read, ended or acknowledged, and
 * is reported exactly like one that does not exist. Nothing here stores or returns a session token, a cookie, a password hash, an IP address or
 * a raw User-Agent.
 */
const DAY = 86_400_000;
const isDuplicateKey = (e: unknown) => (e as { code?: number }).code === 11000;
const usersCol = async () => (await getDb()).collection<{ _id: ObjectId; email: string; emailVerified?: boolean; phone?: { normalized: string }; phoneVerified?: boolean; sessionVersion?: number; accountStatus?: string; lastLoginAt?: Date | null; passwordChangedAt?: Date }>("users");

// ---------- alerts ----------
export type AlertSeverity = "info" | "warning";

export interface AlertDoc {
  _id?: ObjectId;
  userId: ObjectId;
  type: "NEW_DEVICE_SIGN_IN" | "REPEATED_FAILED_LOGINS" | "PASSWORD_CHANGED" | "DEVICE_SIGNED_OUT" | "OTHER_DEVICES_SIGNED_OUT";
  severity: AlertSeverity;
  title: string;
  summary: string;
  recommended: string;
  createdAt: Date;
  acknowledgedAt: Date | null;
  /** One alert per real occurrence (a device's first sign-in, an hour of failures, a password change): a retry cannot add a second. */
  dedupeKey: string;
  purgeAt: Date;
}

let alertIndexes: Promise<unknown> | undefined;
export async function alertsCollection(): Promise<Collection<AlertDoc>> {
  const col = (await getDb()).collection<AlertDoc>("security_alerts");
  alertIndexes ??= Promise.all([
    col.createIndex({ userId: 1, dedupeKey: 1 }, { unique: true, name: "user_alert_once" }),
    col.createIndex({ userId: 1, acknowledgedAt: 1, createdAt: -1, _id: -1 }, { name: "user_alerts_by_state" }),
    col.createIndex({ userId: 1, createdAt: -1, _id: -1 }, { name: "user_alerts_newest" }),
    col.createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0, name: "alert_retention" }),
  ]);
  await alertIndexes;
  return col;
}

/** Raises an alert for a real event (once per `dedupeKey`) and records it in the security history. Never throws. Returns the new alert's id, or null when it already existed. */
export async function raiseAlert(userId: ObjectId, input: Pick<AlertDoc, "type" | "severity" | "title" | "summary" | "recommended" | "dedupeKey">, now = new Date()): Promise<string | null> {
  try {
    const { insertedId } = await (await alertsCollection()).insertOne({ userId, ...input, createdAt: now, acknowledgedAt: null, purgeAt: new Date(now.getTime() + ALERT_RETENTION_DAYS * DAY) });
    await recordSecurityEvent(userId, "SECURITY_ALERT", { alertId: insertedId.toHexString() }, now);
    return insertedId.toHexString();
  } catch (error) {
    if (!isDuplicateKey(error)) console.error("security alert not recorded", input.type);
    return null;
  }
}

export interface AlertDto {
  id: string;
  type: AlertDoc["type"];
  severity: AlertSeverity;
  title: string;
  summary: string;
  recommended: string;
  createdAt: string;
  createdLabel: string;
  acknowledged: boolean;
  acknowledgedLabel: string | null;
}

const alertDto = (a: AlertDoc & { _id: ObjectId }): AlertDto => ({ id: a._id.toHexString(), type: a.type, severity: a.severity, title: a.title, summary: a.summary, recommended: a.recommended, createdAt: a.createdAt.toISOString(), createdLabel: formatSubmitted(a.createdAt.toISOString()), acknowledged: a.acknowledgedAt !== null, acknowledgedLabel: a.acknowledgedAt ? formatSubmitted(a.acknowledgedAt.toISOString()) : null });

export async function listAlerts(userId: ObjectId, query: { status: "all" | "open"; limit: number; before: string | null }): Promise<{ alerts: AlertDto[]; meta: { hasMore: boolean; nextCursor: string | null } }> {
  const filter: Filter<AlertDoc> = { userId, ...(query.status === "open" ? { acknowledgedAt: null } : {}) };
  const k = query.before ? parseEventKey(query.before) : null;
  if (k) {
    const at = new Date(k.ms);
    Object.assign(filter, { $or: [{ createdAt: { $lt: at } }, { createdAt: at, _id: { $lt: new ObjectId(k.id) } }] });
  }
  const docs = (await (await alertsCollection()).find(filter, { projection: { purgeAt: 0, dedupeKey: 0 } }).sort({ createdAt: -1, _id: -1 }).limit(query.limit + 1).toArray()) as (AlertDoc & { _id: ObjectId })[];
  const hasMore = docs.length > query.limit;
  const shown = hasMore ? docs.slice(0, query.limit) : docs;
  const last = shown.at(-1);
  return { alerts: shown.map(alertDto), meta: { hasMore, nextCursor: hasMore && last ? eventKey(last.createdAt, last._id.toHexString()) : null } };
}

export async function countOpenAlerts(userId: ObjectId, severity?: AlertSeverity, now = new Date()): Promise<number> {
  return (await alertsCollection()).countDocuments({ userId, acknowledgedAt: null, createdAt: { $gte: new Date(now.getTime() - RECENT_ALERT_DAYS * DAY) }, ...(severity ? { severity } : {}) });
}

/** Marks the buyer's own alert as seen. Idempotent: acknowledging again keeps the first time. null = not this buyer's alert (or no such alert). */
export async function acknowledgeAlert(userId: ObjectId, alertId: string, now = new Date()): Promise<AlertDto | null> {
  if (!ObjectId.isValid(alertId)) return null;
  const col = await alertsCollection();
  await col.updateOne({ _id: new ObjectId(alertId), userId, acknowledgedAt: null }, { $set: { acknowledgedAt: now } });
  const doc = (await col.findOne({ _id: new ObjectId(alertId), userId }, { projection: { purgeAt: 0, dedupeKey: 0 } })) as (AlertDoc & { _id: ObjectId }) | null;
  return doc ? alertDto(doc) : null;
}

// ---------- overview ----------
export interface SecurityOverview {
  status: SecurityStatus;
  statusLabel: string;
  reasons: string[];
  twoFactor: { supported: false; enabled: false; label: string; reason: string };
  sessions: { supported: true; activeCount: number; currentTracked: boolean };
  alerts: { openCount: number; windowDays: number };
  loginHistory: { supported: true; since: string | null; sinceLabel: string | null };
  account: { accountStatus: string; emailVerified: boolean; lastLoginLabel: string | null; passwordChangedLabel: string | null };
  capabilities: { sessions: true; revokeSession: true; signOutOthers: true; twoFactor: false; recoveryCodes: false };
}

export async function getBuyerSecurityOverview(userId: string, now = new Date()): Promise<SecurityOverview | null> {
  if (!ObjectId.isValid(userId)) return null;
  const _id = new ObjectId(userId);
  const user = await (await usersCol()).findOne({ _id }, { projection: { emailVerified: 1, sessionVersion: 1, accountStatus: 1, lastLoginAt: 1, passwordChangedAt: 1 } });
  if (!user) return null;
  const [ref, active, openAlerts, openWarnings, first] = await Promise.all([currentSessionRef(), countActiveSessions(_id, user.sessionVersion ?? 0, now), countOpenAlerts(_id, undefined, now), countOpenAlerts(_id, "warning", now), firstRecordedSignIn(_id)]);
  const { status, reasons } = securityStatus({ emailVerified: user.emailVerified === true, openWarningAlerts: openWarnings });
  return {
    status,
    statusLabel: STATUS_LABEL[status],
    reasons,
    twoFactor: { supported: false, enabled: false, label: "Not available", reason: "Two-step verification is not available yet: no secure second-factor service exists on this site, so it is not offered." },
    sessions: { supported: true, activeCount: active, currentTracked: Boolean(ref) },
    alerts: { openCount: openAlerts, windowDays: RECENT_ALERT_DAYS },
    loginHistory: { supported: true, since: first ? first.toISOString() : null, sinceLabel: first ? formatSubmitted(first.toISOString()) : null },
    account: { accountStatus: user.accountStatus ?? "ACTIVE", emailVerified: user.emailVerified === true, lastLoginLabel: user.lastLoginAt ? formatSubmitted(user.lastLoginAt.toISOString()) : null, passwordChangedLabel: user.passwordChangedAt ? formatSubmitted(user.passwordChangedAt.toISOString()) : null },
    capabilities: { sessions: true, revokeSession: true, signOutOthers: true, twoFactor: false, recoveryCodes: false },
  };
}
