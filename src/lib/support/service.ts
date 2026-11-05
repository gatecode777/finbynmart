import { randomBytes } from "node:crypto";
import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import type { SupportRequestInput, SupportTopic } from "./rules";

/**
 * Contact Us requests, in the `support_requests` collection. Saving is all that happens: nobody at Finbyn Mart is emailed or
 * otherwise alerted (there is no notification service and no support inbox yet), and the stored `notification` says so. The
 * reference lets a person quote the request, and the idempotency key makes a retried submit return the same request.
 */
export interface SupportRequestDoc {
  _id?: ObjectId;
  reference: string;
  name: string;
  email: string;
  phone?: string;
  topic: SupportTopic;
  message: string;
  /** Set only from the session, never from the request body. */
  userId?: ObjectId;
  consent: { acceptedAt: Date; policyVersion: string };
  status: "NEW";
  idempotencyKey?: string;
  notification: { status: "BLOCKED"; reason: string };
  createdAt: Date;
}

let indexReady: Promise<unknown> | undefined;

async function requests(): Promise<Collection<SupportRequestDoc>> {
  const collection = (await getDb()).collection<SupportRequestDoc>("support_requests");
  indexReady ??= Promise.all([
    collection.createIndex({ reference: 1 }, { unique: true }),
    collection.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true }),
    collection.createIndex({ email: 1, createdAt: -1 }),
  ]);
  await indexReady;
  return collection;
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateSupportReference(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % 32];
  return `FBM-SUP-${out}`;
}

const isDuplicate = (error: unknown) => (error as { code?: number }).code === 11000;

export async function createSupportRequest(input: SupportRequestInput, userId?: string): Promise<{ reference: string; duplicate: boolean }> {
  const collection = await requests();
  if (input.idempotencyKey) {
    const existing = await collection.findOne({ idempotencyKey: input.idempotencyKey }, { projection: { reference: 1 } });
    if (existing) return { reference: existing.reference, duplicate: true };
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = generateSupportReference();
    const doc: SupportRequestDoc = {
      reference,
      name: input.name,
      email: input.email,
      ...(input.phone ? { phone: input.phone } : {}),
      topic: input.topic,
      message: input.message,
      ...(userId && ObjectId.isValid(userId) ? { userId: new ObjectId(userId) } : {}),
      consent: { acceptedAt: new Date(), policyVersion: input.consentPolicyVersion },
      status: "NEW",
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      notification: { status: "BLOCKED", reason: "No notification service or support inbox is connected." },
      createdAt: new Date(),
    };
    try {
      await collection.insertOne(doc);
      return { reference, duplicate: false };
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      // a concurrent retry of the same submission won the idempotency key: return its request
      if (input.idempotencyKey) {
        const winner = await collection.findOne({ idempotencyKey: input.idempotencyKey }, { projection: { reference: 1 } });
        if (winner) return { reference: winner.reference, duplicate: true };
      }
      // otherwise the 40-bit reference collided: try another
    }
  }
  throw new Error("could not allocate a support reference");
}
