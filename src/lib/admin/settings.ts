import { ObjectId } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { adminAuditLog } from "./auditLog";
import { ROLE_LABEL } from "./settingsRules";

/**
 * Admin Settings (Page 64): the SESSION administrator's own account. The account is addressed only by the id from the verified session, and every query also requires role "admin": there is no
 * userId parameter anywhere. Only safe fields are selected (never the password hash, tokens, session data or permissions).
 */
export interface AdminAccount { name: string; email: string; role: string; emailConfirmed: boolean }

export async function getAccount(adminId: ObjectId): Promise<AdminAccount | null> {
  const u = await (await getDb()).collection<{ _id: ObjectId; name?: string; email?: string; role?: string; emailVerified?: boolean }>("users").findOne({ _id: adminId, role: "admin" }, { projection: { name: 1, email: 1, emailVerified: 1 } });
  return u ? { name: (u.name ?? "").trim(), email: u.email ?? "", role: ROLE_LABEL, emailConfirmed: u.emailVerified === true } : null;
}

export type NameResult = { ok: true; name: string; changed: boolean } | { ok: false; status: 404 };

/**
 * Changes the display name and nothing else (not the e-mail, role, permissions, password, status or any business record). One transaction: the conditional update and an audit row that records
 * the fact of the change, not the names. Saving the same name is a no-op with no audit row.
 */
export async function updateDisplayName(adminId: ObjectId, name: string, now = new Date()): Promise<NameResult> {
  const users = (await getDb()).collection<{ _id: ObjectId; name?: string; role?: string }>("users");
  const audit = await adminAuditLog();
  const session = (await getMongoClient()).startSession();
  let out: NameResult = { ok: false, status: 404 };
  try {
    await session.withTransaction(async () => {
      const cur = await users.findOne({ _id: adminId, role: "admin" }, { projection: { name: 1 }, session });
      if (!cur) { out = { ok: false, status: 404 }; return; }
      if ((cur.name ?? "").trim() === name) { out = { ok: true, name, changed: false }; return; }
      const r = await users.updateOne({ _id: adminId, role: "admin" }, { $set: { name, updatedAt: now } }, { session });
      if (r.matchedCount !== 1) { out = { ok: false, status: 404 }; return; }
      await audit.insertOne({ _id: new ObjectId(), action: "ADMIN_DISPLAY_NAME_CHANGED", actorId: adminId, adminUserId: adminId, summary: "Display name changed by the account owner", at: now }, { session });
      out = { ok: true, name, changed: true };
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } finally {
    await session.endSession();
  }
  return out;
}
