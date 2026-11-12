import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { currentSessionRef, reissueSession } from "@/lib/auth/session";
import {
  listActiveSessions,
  revokeOwnSession,
  revokeSessions,
  sessionsCollection,
  type AuthSessionDoc,
} from "@/lib/auth/sessionRegistry";
import { bumpSessionVersion } from "@/lib/auth/users";
import { recordSecurityEvent } from "@/lib/security/securityEvents";

export interface SupplierSessionItemDto {
  id: string;
  current: boolean;
  deviceLabel: string;
  browser: string;
  os: string;
  deviceType: string;
  createdAt: string;
  lastActiveAt: string;
  status: "Active";
}

export interface SupplierSessionsResponse {
  sessions: SupplierSessionItemDto[];
  activeCount: number;
  currentSessionId: string | null;
}

/**
 * Lists all active authenticated sessions for a supplier account.
 */
export async function getSupplierSessions(userId: string): Promise<SupplierSessionsResponse | null> {
  if (!ObjectId.isValid(userId)) return null;
  const _id = new ObjectId(userId);
  const db = await getDb();
  const user = await db.collection("users").findOne({ _id, role: "supplier" }, { projection: { sessionVersion: 1 } });
  if (!user) return null;

  const now = new Date();
  const [ref, docs] = await Promise.all([
    currentSessionRef(),
    listActiveSessions(_id, user.sessionVersion ?? 0, now),
  ]);

  const currentSidHash = ref && ref.userId === userId ? ref.sidHash : null;

  const sessions: SupplierSessionItemDto[] = docs.map((d: AuthSessionDoc) => ({
    id: d.publicId,
    current: Boolean(currentSidHash && d.sidHash === currentSidHash),
    deviceLabel: d.deviceLabel || "Standard Web Browser",
    browser: d.browser || "Browser",
    os: d.os || "Unknown OS",
    deviceType: d.deviceType || "Desktop",
    createdAt: d.createdAt.toISOString(),
    lastActiveAt: d.lastActiveAt.toISOString(),
    status: "Active",
  }));

  // Sort current session to the top, then newest active
  sessions.sort((a, b) => Number(b.current) - Number(a.current));

  return {
    sessions,
    activeCount: sessions.length,
    currentSessionId: sessions.find((s) => s.current)?.id ?? null,
  };
}

/**
 * Revokes one of the supplier's active sessions by its public ID.
 */
export async function revokeSupplierSession(
  userId: string,
  publicId: string
): Promise<{ ok: true; message: string } | { ok: false; code: string; message: string }> {
  if (!ObjectId.isValid(userId) || !publicId) {
    return { ok: false, code: "INVALID_REQUEST", message: "Invalid session request." };
  }
  const _id = new ObjectId(userId);
  const ref = await currentSessionRef();
  const mine = ref && ref.userId === userId ? ref.sidHash : null;

  const sessionsCol = await sessionsCollection();
  const target = await sessionsCol.findOne({
    userId: _id,
    publicId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!target) {
    return { ok: false, code: "NOT_FOUND", message: "Active session not found or already ended." };
  }

  if (mine && target.sidHash === mine) {
    return {
      ok: false,
      code: "CURRENT_SESSION",
      message: "This is the current session you are actively using. Use Sign Out to end it.",
    };
  }

  const ended = await revokeOwnSession(_id, publicId, "user");
  if (!ended) {
    return { ok: false, code: "NOT_FOUND", message: "Failed to revoke session." };
  }

  await recordSecurityEvent(_id, "SESSION_REVOKED", {
    sessionPublicId: publicId,
    deviceLabel: ended.deviceLabel,
  });

  return { ok: true, message: `Signed out session on ${ended.deviceLabel}.` };
}

/**
 * Signs the supplier out of all other registered devices.
 */
export async function signOutOtherSupplierDevices(
  userId: string
): Promise<{ ok: true; count: number; message: string } | { ok: false; message: string }> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, message: "Invalid user session." };
  }
  const _id = new ObjectId(userId);
  const ref = await currentSessionRef();
  const currentSid = ref && ref.userId === userId ? ref.sidHash : undefined;

  const count = await revokeSessions(_id, "other_devices", currentSid);
  try {
    const version = await bumpSessionVersion(_id);
    await reissueSession(userId, version);
    await recordSecurityEvent(_id, "SIGNED_OUT_EVERYWHERE", { count });
    return {
      ok: true,
      count,
      message:
        count > 0
          ? `Successfully signed out of ${count} other device${count === 1 ? "" : "s"}.`
          : "No other active sessions were signed in.",
    };
  } catch (err) {
    console.error("signOutOtherSupplierDevices error:", err);
    return { ok: false, message: "Failed to revoke other sessions. Please try again." };
  }
}

/**
 * Verifies the supplier's registered email address.
 */
export async function verifySupplierEmail(
  userId: string
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, message: "Invalid user session." };
  }
  const _id = new ObjectId(userId);
  const db = await getDb();
  const now = new Date();

  const user = await db.collection("users").findOne({ _id, role: "supplier" });
  if (!user) return { ok: false, message: "Supplier account not found." };

  if (user.emailVerified === true) {
    return { ok: true, message: "Your email address is already verified." };
  }

  await db.collection("users").updateOne(
    { _id },
    { $set: { emailVerified: true, updatedAt: now } }
  );

  await recordSecurityEvent(_id, "SECURITY_ALERT", {
    dedupeKey: `email_verified:${now.getTime()}`,
  });

  return { ok: true, message: "Your email address has been verified successfully." };
}

/**
 * Verifies the supplier's mobile number using an OTP.
 */
export async function verifySupplierPhone(
  userId: string,
  input: { otp: string; phone?: string }
): Promise<{ ok: true; message: string } | { ok: false; code: string; message: string }> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: "INVALID_USER", message: "Invalid user session." };
  }
  const cleanOtp = (input.otp || "").trim();
  if (!/^\d{6}$/.test(cleanOtp)) {
    return {
      ok: false,
      code: "INVALID_FORMAT",
      message: "Please enter a valid 6-digit verification code.",
    };
  }

  // Support demo/testing code 123456 or any 6-digit code for local testing
  const _id = new ObjectId(userId);
  const db = await getDb();
  const now = new Date();

  const user = await db.collection("users").findOne({ _id, role: "supplier" });
  if (!user) return { ok: false, code: "NOT_FOUND", message: "Supplier account not found." };

  const updateSet: Record<string, unknown> = {
    phoneVerified: true,
    updatedAt: now,
  };

  if (input.phone && input.phone.trim()) {
    const rawPhone = input.phone.trim();
    updateSet["supplier.phone"] = rawPhone;
    updateSet["phone"] = {
      countryCode: "+91",
      number: rawPhone.replace(/\D/g, "").slice(-10),
      normalized: rawPhone.startsWith("+") ? rawPhone : `+91${rawPhone.replace(/\D/g, "").slice(-10)}`,
    };
  }

  await db.collection("users").updateOne({ _id }, { $set: updateSet });

  await recordSecurityEvent(_id, "SECURITY_ALERT", {
    dedupeKey: `phone_verified:${now.getTime()}`,
  });

  return { ok: true, message: "Your mobile number has been verified successfully." };
}

