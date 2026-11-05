import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";

export type UserRole = "buyer" | "supplier";

/**
 * ACTIVE can sign in. PENDING_EMAIL_VERIFICATION is a new account that must follow the emailed link first (only used when an
 * email provider is configured, otherwise nobody could ever verify). Accounts created before this field existed have no
 * accountStatus and count as ACTIVE.
 */
export type AccountStatus = "ACTIVE" | "PENDING_EMAIL_VERIFICATION" | "SUSPENDED";

export interface UserDoc {
  _id?: ObjectId;
  name: string;
  email: string; // stored lower-case
  passwordHash: string;
  role: UserRole;
  /** Supplier registration details; present only for role "supplier". */
  supplier?: { businessName: string; phone: string; city: string; offering: string };
  /** Buyer registration details (Page 15). The company is whatever the person typed: nothing here is verified. */
  phone?: { countryCode: string; number: string; normalized: string };
  companyName?: string;
  companyStatus?: "UNVERIFIED";
  accountStatus?: AccountStatus;
  emailVerified?: boolean;
  /** Always false: there is no SMS provider, so no number has ever been verified. */
  phoneVerified?: boolean;
  consent?: { acceptedAt: Date; policyVersion: string };
  lastLoginAt?: Date | null;
  /** Bumped by a password reset; a session cookie carries the version it was issued at, so older cookies stop working. Absent = 0. */
  sessionVersion?: number;
  passwordChangedAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

let indexReady: Promise<unknown> | undefined;

async function users(): Promise<Collection<UserDoc>> {
  const collection = (await getDb()).collection<UserDoc>("users");
  indexReady ??= collection.createIndex({ email: 1 }, { unique: true });
  await indexReady;
  return collection;
}

export function toPublicUser(user: UserDoc & { _id: ObjectId }): PublicUser {
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
}

export const statusOf = (user: Pick<UserDoc, "accountStatus">): AccountStatus => user.accountStatus ?? "ACTIVE";

export async function findUserByEmail(email: string) {
  return (await users()).findOne({ email: email.trim().toLowerCase() });
}

/** Recovery needs only these fields (and never the hash): indexed on email, minimal projection. */
export async function findRecoveryAccount(email: string) {
  return (await users()).findOne({ email: email.trim().toLowerCase() }, { projection: { name: 1, email: 1, accountStatus: 1 } });
}

/** Whether a reset token's account can still be recovered: it must exist and not be suspended. Minimal projection. */
export async function findAccountForToken(id: ObjectId) {
  return (await users()).findOne({ _id: id }, { projection: { accountStatus: 1, role: 1 } });
}

export async function findUserById(id: string) {
  if (!ObjectId.isValid(id)) return null;
  return (await users()).findOne({ _id: new ObjectId(id) });
}

/** Returns null when the email is already registered. */
export async function createUser(input: Omit<UserDoc, "_id" | "createdAt">) {
  const doc: UserDoc = { ...input, email: input.email.trim().toLowerCase(), createdAt: new Date() };
  try {
    const result = await (await users()).insertOne(doc);
    return { ...doc, _id: result.insertedId };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return null;
    throw error;
  }
}

export async function markEmailVerified(userId: ObjectId): Promise<void> {
  const now = new Date();
  const collection = await users();
  await collection.updateOne({ _id: userId }, { $set: { emailVerified: true, updatedAt: now } });
  // only a pending account is activated: a suspended one stays suspended
  await collection.updateOne({ _id: userId, accountStatus: "PENDING_EMAIL_VERIFICATION" }, { $set: { accountStatus: "ACTIVE" } });
}

export async function setPasswordHash(userId: ObjectId, passwordHash: string): Promise<void> {
  await (await users()).updateOne({ _id: userId }, { $set: { passwordHash, updatedAt: new Date() } });
}

export async function recordLogin(userId: ObjectId): Promise<void> {
  await (await users()).updateOne({ _id: userId }, { $set: { lastLoginAt: new Date() } });
}

/** Replaces the password hash and bumps the session version in one update (every session cookie issued before stops working). Returns the new version. */
export async function changePasswordHash(userId: ObjectId, passwordHash: string): Promise<number> {
  const now = new Date();
  const updated = await (await users()).findOneAndUpdate({ _id: userId }, { $set: { passwordHash, passwordChangedAt: now, updatedAt: now }, $inc: { sessionVersion: 1 } }, { returnDocument: "after", projection: { sessionVersion: 1 } });
  if (!updated) throw new Error("account not found");
  return updated.sessionVersion ?? 0;
}

/** Signs the account out of every device: bumps the session version only (the caller then issues this device a fresh cookie). Returns the new version. */
export async function bumpSessionVersion(userId: ObjectId): Promise<number> {
  const updated = await (await users()).findOneAndUpdate({ _id: userId }, { $set: { updatedAt: new Date() }, $inc: { sessionVersion: 1 } }, { returnDocument: "after", projection: { sessionVersion: 1 } });
  if (!updated) throw new Error("account not found");
  return updated.sessionVersion ?? 0;
}
