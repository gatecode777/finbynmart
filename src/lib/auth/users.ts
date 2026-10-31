import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";

export type UserRole = "buyer" | "supplier";

export interface UserDoc {
  _id?: ObjectId;
  name: string;
  email: string; // stored lower-case
  passwordHash: string;
  role: UserRole;
  /** Supplier registration details; present only for role "supplier". */
  supplier?: { businessName: string; phone: string; city: string; offering: string };
  createdAt: Date;
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

export async function findUserByEmail(email: string) {
  return (await users()).findOne({ email: email.trim().toLowerCase() });
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
