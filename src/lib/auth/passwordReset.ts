import { getDb } from "@/lib/db/mongo";
import { hashToken, isTokenShape, inspectToken, type TokenDoc, type TokenState } from "./tokens";
import type { UserDoc, UserRole } from "./users";

/**
 * The single place a password reset is committed. Everything happens in ONE MongoDB transaction:
 *   1. the reset token is consumed with a conditional update (unused, not revoked, not expired, right purpose);
 *   2. the account's password hash is replaced, its session version is bumped (every older session cookie stops working),
 *      the address is confirmed (using the link proves control of the mailbox) and a pending account becomes ACTIVE;
 *   3. every other unused token of that account is revoked;
 *   4. a sanitized security event is written.
 * If any step fails nothing is kept: a failed password update cannot leave the token consumed, and a consumed token cannot
 * leave the old password in place. Two simultaneous requests with the same token: only one wins the conditional update.
 * The password hash is computed by the caller BEFORE the transaction (scrypt is deliberately slow; it must not hold a
 * transaction open), after the token was checked, so an invalid link never costs a hash.
 */
export type ResetOutcome = { ok: true; role: UserRole; eventId: string; ms: { transaction: number } } | { ok: false; state: TokenState };

export async function resetPasswordWithToken(rawToken: unknown, passwordHash: string, clientAddressHash: string): Promise<ResetOutcome> {
  if (!isTokenShape(rawToken)) return { ok: false, state: "INVALID" };
  const db = await getDb();
  const session = db.client.startSession();
  const started = performance.now();
  let committed: { role: UserRole; eventId: string } | null = null;
  try {
    await session.withTransaction(async () => {
      committed = null;
      const now = new Date();
      const tokens = db.collection<TokenDoc>("auth_tokens");
      const users = db.collection<UserDoc>("users");
      const token = await tokens.findOneAndUpdate(
        { tokenHash: hashToken(rawToken), purpose: "reset_password", usedAt: null, revokedAt: null, expiresAt: { $gt: now } },
        { $set: { usedAt: now } },
        { session },
      );
      if (!token) return; // nothing consumed; the state is worked out after the transaction
      const updated = await users.findOneAndUpdate(
        { _id: token.userId, accountStatus: { $ne: "SUSPENDED" } },
        { $set: { passwordHash, emailVerified: true, passwordChangedAt: now, updatedAt: now }, $inc: { sessionVersion: 1 } },
        { session, projection: { role: 1 }, returnDocument: "after" },
      );
      if (!updated) {
        // the account vanished or was suspended after the link was issued: undo the consumption
        await session.abortTransaction();
        return;
      }
      await users.updateOne({ _id: token.userId, accountStatus: "PENDING_EMAIL_VERIFICATION" }, { $set: { accountStatus: "ACTIVE" } }, { session });
      await tokens.updateMany({ userId: token.userId, usedAt: null, revokedAt: null }, { $set: { revokedAt: now } }, { session });
      // sessionsRevoked is true by construction: the session version was bumped in this same transaction (see PAGE_20_SESSION_REVOCATION.md)
      const event = await db.collection("security_events").insertOne({ userId: token.userId, type: "PASSWORD_RESET", at: now, ipHash: clientAddressHash, role: updated.role, sessionsRevoked: true }, { session });
      committed = { role: updated.role, eventId: event.insertedId.toString() };
    });
  } finally {
    await session.endSession();
  }
  const finished = committed as { role: UserRole; eventId: string } | null;
  if (finished) return { ok: true, role: finished.role, eventId: finished.eventId, ms: { transaction: Math.round(performance.now() - started) } };
  // Not committed. Say why, from the stored state (a concurrent request that won shows as ALREADY_USED).
  const state = await inspectToken(rawToken, "reset_password");
  return { ok: false, state: state === "VALID" ? "ACCOUNT_UNAVAILABLE" : state };
}

let eventsIndexReady: Promise<unknown> | undefined;
/** Ensures the security_events index exists (called once from the reset route). */
export async function ensureSecurityEventIndexes(): Promise<void> {
  eventsIndexReady ??= getDb().then((db) => db.collection("security_events").createIndex({ userId: 1, at: -1 }));
  await eventsIndexReady;
}
