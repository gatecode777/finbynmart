import { ObjectId } from "mongodb";
import { currentSessionRef, reissueSession } from "@/lib/auth/session";
import { listActiveSessions, revokeOwnSession, revokeSessions, sessionsCollection } from "@/lib/auth/sessionRegistry";
import { bumpSessionVersion } from "@/lib/auth/users";
import { getDb } from "@/lib/db/mongo";
import { emailConfigured } from "@/lib/email/provider";
import { formatSubmitted } from "@/lib/inquiries/confirmation";
import { recordSecurityEvent } from "@/lib/security/securityEvents";
import { notifyDeviceSignedOut, notifySignedOutEverywhere } from "./notifications";
import { raiseAlert } from "./security";

/**
 * Sessions, their revocation and the recovery methods of the buyer's Account Security page (Page 38). Same rules as security.ts: the buyer
 * comes from the verified session, every query names that buyer, another account's session is reported exactly like one that does not
 * exist, and no token, cookie, hash, IP address or raw User-Agent is ever stored or returned.
 */
const usersCol = async () => (await getDb()).collection<{ _id: ObjectId; email: string; emailVerified?: boolean; phone?: { normalized: string }; phoneVerified?: boolean; sessionVersion?: number }>("users");

export interface SessionDto {
  id: string;
  current: boolean;
  deviceLabel: string;
  browser: string;
  os: string;
  deviceType: string;
  /** Always "Unknown": no approved location source exists, so a place is never guessed. */
  region: string;
  createdAt: string;
  createdLabel: string;
  lastActiveAt: string;
  lastActiveLabel: string;
  status: "Active";
}

export interface SessionsAnswer {
  sessions: SessionDto[];
  currentSessionId: string | null;
  /** False when this browser's cookie predates the registry: it works, but cannot be listed or ended individually. */
  currentTracked: boolean;
}

export async function getBuyerSessions(userId: string, now = new Date()): Promise<SessionsAnswer | null> {
  if (!ObjectId.isValid(userId)) return null;
  const _id = new ObjectId(userId);
  const user = await (await usersCol()).findOne({ _id }, { projection: { sessionVersion: 1 } });
  if (!user) return null;
  const [ref, docs] = await Promise.all([currentSessionRef(), listActiveSessions(_id, user.sessionVersion ?? 0, now)]);
  const mine = ref && ref.userId === userId ? ref.sidHash : null;
  const sessions = docs.map<SessionDto>((d) => ({
    id: d.publicId,
    current: mine !== null && d.sidHash === mine,
    deviceLabel: d.deviceLabel,
    browser: d.browser,
    os: d.os,
    deviceType: d.deviceType,
    region: "Unknown",
    createdAt: d.createdAt.toISOString(),
    createdLabel: formatSubmitted(d.createdAt.toISOString()),
    lastActiveAt: d.lastActiveAt.toISOString(),
    lastActiveLabel: formatSubmitted(d.lastActiveAt.toISOString()),
    status: "Active",
  }));
  // the current session first, then by recent activity (the list is already in that order)
  sessions.sort((a, b) => Number(b.current) - Number(a.current));
  return { sessions, currentSessionId: sessions.find((s) => s.current)?.id ?? null, currentTracked: sessions.some((s) => s.current) };
}

export type RevokeOutcome = { ok: true; deviceLabel: string } | { ok: false; code: "NOT_FOUND" | "CURRENT_SESSION"; message: string };

/**
 * Ends ONE of the buyer's own sessions. It is a real revocation: the session record is marked revoked and the very next request that browser
 * makes is refused (the authentication layer reads the record). The current session cannot be ended here (use Sign out), so a click on the
 * wrong row never signs the buyer out of the page they are using. Another account's session and an unknown id are the same "not found".
 */
export async function revokeBuyerSession(userId: string, publicId: string): Promise<RevokeOutcome> {
  const _id = new ObjectId(userId);
  const ref = await currentSessionRef();
  const mine = ref && ref.userId === userId ? ref.sidHash : null;
  // look first only to protect the current session; the revocation itself is one conditional update by (owner, id, still active)
  const found = await (await sessionsCollection()).findOne({ userId: _id, publicId, revokedAt: null, expiresAt: { $gt: new Date() } }, { projection: { sidHash: 1 } });
  if (!found) return { ok: false, code: "NOT_FOUND", message: "That session was not found." };
  if (mine && found.sidHash === mine) return { ok: false, code: "CURRENT_SESSION", message: "This is the session you are using. Use Sign out to end it." };
  const ended = await revokeOwnSession(_id, publicId, "user");
  if (!ended) return { ok: false, code: "NOT_FOUND", message: "That session was not found." };
  await recordSecurityEvent(_id, "SESSION_REVOKED", { sessionPublicId: publicId, deviceLabel: ended.deviceLabel });
  await raiseAlert(_id, { type: "DEVICE_SIGNED_OUT", severity: "info", title: "A device was signed out", summary: `${ended.deviceLabel} was signed out from the security page.`, recommended: "If you did not do this, change your password.", dedupeKey: `revoked:${publicId}` });
  await notifyDeviceSignedOut(userId, publicId);
  return { ok: true, deviceLabel: ended.deviceLabel };
}

export type SignOutOthersOutcome = { ok: true; count: number; version: number } | { ok: false; count: number; message: string };

/**
 * Signs the buyer out of every OTHER device. Registered sessions are revoked (and counted); the account's session version is then raised, which
 * also ends cookies issued before the registry existed; this device keeps its own record and receives a cookie for the new version. The one
 * implementation behind both the Settings page button and the Account Security page. A failure after the registered sessions were ended is
 * reported as such, not as success.
 */
export async function signOutOtherDevices(userId: string): Promise<SignOutOthersOutcome> {
  const _id = new ObjectId(userId);
  const ref = await currentSessionRef();
  const count = await revokeSessions(_id, "other_devices", ref && ref.userId === userId ? ref.sidHash : undefined);
  let version: number;
  try {
    version = await bumpSessionVersion(_id);
    await reissueSession(userId, version);
  } catch {
    return { ok: false, count, message: `${count} registered ${count === 1 ? "device was" : "devices were"} signed out, but sessions started before session tracking could not be ended. Try again.` };
  }
  await recordSecurityEvent(_id, "SIGNED_OUT_EVERYWHERE", { count });
  await raiseAlert(_id, { type: "OTHER_DEVICES_SIGNED_OUT", severity: "info", title: "Other devices were signed out", summary: `${count} other ${count === 1 ? "device was" : "devices were"} signed out of your account.`, recommended: "If you did not do this, change your password.", dedupeKey: `signout:${version}` });
  await notifySignedOutEverywhere(userId, version);
  return { ok: true, count, version };
}

// ---------- recovery ----------
export type MethodState = "verified" | "not_verified" | "not_set_up" | "unavailable";

export interface RecoveryMethods {
  email: { state: MethodState; masked: string | null; note: string };
  mobile: { state: MethodState; masked: string | null; note: string };
  recoveryCodes: { state: "unavailable"; note: string };
  passwordReset: { state: "available" | "unavailable"; note: string };
}

const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  return local && domain ? `${local[0]}${"*".repeat(Math.min(6, Math.max(2, local.length - 1)))}@${domain}` : "***";
};
const maskPhone = (n: string) => (n.length >= 4 ? `${"*".repeat(Math.max(2, n.length - 4))}${n.slice(-4)}` : "****");

export async function getRecoveryMethods(userId: string): Promise<RecoveryMethods | null> {
  if (!ObjectId.isValid(userId)) return null;
  const user = await (await usersCol()).findOne({ _id: new ObjectId(userId) }, { projection: { email: 1, emailVerified: 1, phone: 1, phoneVerified: 1 } });
  if (!user) return null;
  const emailOk = user.emailVerified === true;
  const mail = emailConfigured();
  return {
    email: { state: emailOk ? "verified" : "not_verified", masked: maskEmail(user.email), note: emailOk ? "Confirmed. A password reset link can be sent here." : "Not confirmed. An unconfirmed address is not used to recover your account." },
    mobile: user.phone ? { state: "unavailable", masked: maskPhone(user.phone.normalized), note: "Mobile verification is not available yet: there is no SMS service, so no number is ever treated as a recovery method." } : { state: "not_set_up", masked: null, note: "No mobile number is saved." },
    recoveryCodes: { state: "unavailable", note: "Recovery codes belong to two-step verification, which is not available yet." },
    passwordReset: mail && emailOk ? { state: "available", note: "Use Forgot password on the sign-in page: the link is sent to your confirmed address." } : { state: "unavailable", note: !mail ? "Password reset by email is not available: the email service is not configured on this server." : "Confirm your email address first." },
  };
}
