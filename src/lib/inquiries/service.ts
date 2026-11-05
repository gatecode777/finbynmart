import { randomBytes } from "node:crypto";
import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { BUYER_CANCELLABLE, INQUIRY_TYPES, REFERENCE_PATTERN, normaliseStatus, type GuestContact, type InquiryStatus, type InquiryType, type Located } from "./rules";
import { notifyInquirySubmitted } from "@/lib/buyer/notifications";

/**
 * The one `inquiries` collection. It first held quote requests from signed-in buyers only; it now also holds guest
 * inquiries, a reference number, the inquiry type, consent, a status history and the (honest) notification state.
 * Older records keep working: a missing `reference` or `inquiryType` is simply absent, and "new" reads as NEW.
 */
export interface InquiryDoc {
  _id?: ObjectId;
  /** FBM-INQ-XXXXXXXX: for identification, never for access. */
  reference?: string;
  /** Absent for a guest. Always taken from the session, never from a request. */
  buyerId?: ObjectId;
  buyerType?: "REGISTERED" | "GUEST";
  guest?: GuestContact;
  productKey?: string;
  productName?: string;
  /** Snapshot of the product's category when the inquiry was sent (null/absent for a general inquiry and for records written before this field existed: no category is ever guessed for them). */
  categoryKey?: string;
  categoryName?: string;
  supplierKey: string;
  supplierName: string;
  supplierSlug?: string;
  /** Where the supplier record comes from: the catalogue or the sample listings. Not where the inquiry was sent from. */
  source: "catalog" | "sample";
  quantity: number;
  unit?: string;
  message?: string;
  /** Old two-way type used by the profile and product forms. */
  type?: "quote" | "inquiry";
  inquiryType?: InquiryType;
  deliveryLocation?: Located;
  consent?: { accepted: true; at: Date; policyVersion: string | null; termsPath: string; privacyPath: string };
  idempotencyKey?: string;
  /** "new" on records written before the lifecycle existed; InquiryStatus afterwards. */
  status: string;
  statusHistory?: { from: InquiryStatus | null; to: InquiryStatus; actor: "buyer" | "guest" | "system"; at: Date; reason?: string }[];
  /** Internal. No email or notification service exists, so nothing is ever recorded as sent. */
  notification?: { status: "BLOCKED"; reason: string; at: Date };
  /** Guest records are kept for this long (the purge itself is not built yet). */
  retainUntil?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export type InquiryInput = Omit<InquiryDoc, "_id" | "buyerId" | "status" | "createdAt">;

const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const GUEST_RETENTION_MS = 730 * 86_400_000;
const NOTIFICATION_BLOCKED = "No email or in-app notification service is configured yet.";
let indexReady: Promise<unknown> | undefined;

/** The one inquiries collection (indexes ensured). Shared by the buyer list, the buyer detail and the confirmation page. */
export const inquiriesCollection = () => inquiries();

async function inquiries(): Promise<Collection<InquiryDoc>> {
  const collection = (await getDb()).collection<InquiryDoc>("inquiries");
  indexReady ??= Promise.all([
    collection.createIndex({ buyerId: 1, createdAt: -1 }),
    // My Inquiries (Page 27): buyer-scoped lists sort by (createdAt or updatedAt, _id) with an optional status filter, without a sort stage.
    collection.createIndex({ buyerId: 1, createdAt: -1, _id: -1 }, { name: "buyer_newest" }),
    collection.createIndex({ buyerId: 1, status: 1, createdAt: -1, _id: -1 }, { name: "buyer_status_newest" }),
    collection.createIndex({ buyerId: 1, updatedAt: -1, _id: -1 }, { name: "buyer_updated" }),
    collection.createIndex({ supplierKey: 1, createdAt: -1 }),
    // A reference is unique; older records have none (sparse).
    collection.createIndex({ reference: 1 }, { unique: true, sparse: true }),
    // A retry of the same submission carries the same key and finds the first record instead of making a second.
    collection.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true }),
    // The duplicate check for guests.
    collection.createIndex({ "guest.email": 1, createdAt: -1 }, { sparse: true }),
  ]);
  await indexReady;
  return collection;
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 40 random bits in Crockford base32 (no I, L, O, U): unguessable and easy to read out. */
export function generateReference(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % 32];
  return `FBM-INQ-${out}`;
}

const isDuplicateKey = (error: unknown) => (error as { code?: number }).code === 11000;
const keyOf = (error: unknown) => Object.keys((error as { keyPattern?: Record<string, number> }).keyPattern ?? {}).join(",");

export type Identity = { kind: "buyer"; buyerId: string } | { kind: "guest"; guest: GuestContact };

export type SubmitResult =
  | { ok: true; id: string; reference: string; status: InquiryStatus; replay: boolean }
  | { ok: false; code: "DUPLICATE" | "KEY_CONFLICT" };

const sameIdentity = (doc: InquiryDoc, identity: Identity) =>
  identity.kind === "buyer" ? doc.buyerId?.toString() === identity.buyerId : doc.guest?.email === identity.guest.email;

/**
 * Stores an inquiry from a registered buyer or a guest. A retry with the same idempotency key returns the first record
 * (no second one is written); a repeat of the same inquiry within minutes is refused; the reference is unique.
 */
export async function submitInquiry(identity: Identity, input: InquiryInput, idempotencyKey?: string): Promise<SubmitResult> {
  const collection = await inquiries();

  if (idempotencyKey) {
    const previous = await collection.findOne({ idempotencyKey });
    if (previous) {
      return sameIdentity(previous, identity) && previous.supplierKey === input.supplierKey
        ? { ok: true, id: previous._id!.toString(), reference: previous.reference ?? "", status: normaliseStatus(previous.status), replay: true }
        : { ok: false, code: "KEY_CONFLICT" };
    }
  }

  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
  const duplicate = await collection.findOne({
    ...(identity.kind === "buyer" ? { buyerId: new ObjectId(identity.buyerId) } : { "guest.email": identity.guest.email }),
    supplierKey: input.supplierKey,
    productKey: input.productKey ?? null,
    quantity: input.quantity,
    createdAt: { $gte: since },
  } as never);
  if (duplicate) {
    // The first of several identical simultaneous requests may already be stored: that is a retry, not a repeat.
    if (idempotencyKey && duplicate.idempotencyKey === idempotencyKey) {
      return { ok: true, id: duplicate._id!.toString(), reference: duplicate.reference ?? "", status: normaliseStatus(duplicate.status), replay: true };
    }
    return { ok: false, code: "DUPLICATE" };
  }

  const defined = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const now = new Date();
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = generateReference();
    const doc = {
      ...defined,
      reference,
      ...(identity.kind === "buyer" ? { buyerId: new ObjectId(identity.buyerId), buyerType: "REGISTERED" } : { guest: identity.guest, buyerType: "GUEST", retainUntil: new Date(now.getTime() + GUEST_RETENTION_MS) }),
      ...(idempotencyKey ? { idempotencyKey } : {}),
      status: "NEW",
      statusHistory: [{ from: null, to: "NEW", actor: identity.kind === "buyer" ? "buyer" : "guest", at: now }],
      notification: { status: "BLOCKED", reason: NOTIFICATION_BLOCKED, at: now },
      createdAt: now,
      updatedAt: now,
    } as InquiryDoc;
    try {
      const result = await collection.insertOne(doc);
      if (identity.kind === "buyer") await notifyInquirySubmitted(identity.buyerId, reference, input.supplierName);
      return { ok: true, id: result.insertedId.toString(), reference, status: "NEW", replay: false };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      if (keyOf(error).includes("idempotencyKey") && idempotencyKey) {
        // Two identical requests raced: the other one won, so this one reports that record.
        const winner = await collection.findOne({ idempotencyKey });
        if (winner && sameIdentity(winner, identity)) return { ok: true, id: winner._id!.toString(), reference: winner.reference ?? "", status: normaliseStatus(winner.status), replay: true };
        return { ok: false, code: "KEY_CONFLICT" };
      }
      // Otherwise the reference collided (about 1 in a trillion): draw another.
    }
  }
  throw new Error("could not generate a unique inquiry reference");
}

/** Older entry point of the profile and product forms (signed-in buyers). Same record, same reference and lifecycle. */
export async function createInquiry(buyerId: string, input: InquiryInput): Promise<{ id: string; reference: string } | null> {
  const inquiryType: InquiryType = input.type === "inquiry" ? (input.productKey ? "PRODUCT_INQUIRY" : "GENERAL_INQUIRY") : "GET_BEST_QUOTE";
  const result = await submitInquiry({ kind: "buyer", buyerId }, { ...input, inquiryType });
  return result.ok ? { id: result.id, reference: result.reference } : null;
}

/** The inquiry with this reference (unique index), or null. Callers must check who may see it. */
export async function findInquiryByReference(reference: string): Promise<InquiryDoc | null> {
  return (await inquiries()).findOne({ reference });
}

// ---------- buyer's own inquiries ----------

export interface BuyerInquiry {
  id: string;
  reference: string | null;
  supplierName: string;
  supplierSlug: string | null;
  productName: string | null;
  inquiryType: InquiryType | null;
  inquiryTypeLabel: string;
  quantity: number;
  unit: string | null;
  message: string | null;
  deliveryLocation: string | null;
  status: InquiryStatus;
  createdAt: string;
  cancelledAt: string | null;
  canCancel: boolean;
  /** Suppliers cannot reply through the platform yet, so there is never a response to show. */
  latestResponse: null;
}

export function toBuyerInquiry(doc: InquiryDoc): BuyerInquiry {
  const status = normaliseStatus(doc.status);
  const type = doc.inquiryType ?? (doc.type === "inquiry" ? (doc.productKey ? "PRODUCT_INQUIRY" : "GENERAL_INQUIRY") : "GET_BEST_QUOTE");
  return {
    id: doc._id!.toString(),
    reference: doc.reference ?? null,
    supplierName: doc.supplierName,
    supplierSlug: doc.supplierSlug ?? (doc.source === "sample" ? doc.supplierKey : null),
    productName: doc.productName ?? null,
    inquiryType: type,
    inquiryTypeLabel: INQUIRY_TYPES.find((item) => item.value === type)?.label ?? "Inquiry",
    quantity: doc.quantity,
    unit: doc.unit ?? null,
    message: doc.message ?? null,
    deliveryLocation: doc.deliveryLocation?.text ?? null,
    status,
    createdAt: doc.createdAt.toISOString(),
    cancelledAt: doc.cancelledAt?.toISOString() ?? null,
    canCancel: BUYER_CANCELLABLE.includes(status),
    latestResponse: null,
  };
}

const validId = (id: string) => /^[a-f0-9]{24}$/i.test(id);

/** Every query names the signed-in buyer, so another buyer's (or a guest's) inquiry is never reachable. */
export async function listBuyerInquiries(buyerId: string, status?: InquiryStatus): Promise<BuyerInquiry[]> {
  const filter: Record<string, unknown> = { buyerId: new ObjectId(buyerId) };
  if (status) filter.status = status === "NEW" ? { $in: ["NEW", "new"] } : status;
  const docs = await (await inquiries()).find(filter as never).sort({ createdAt: -1 }).limit(100).toArray();
  return docs.map(toBuyerInquiry);
}

/** By id or by reference. Either way the query names the buyer, so someone else's inquiry is never found. */
export async function getBuyerInquiry(buyerId: string, idOrReference: string): Promise<BuyerInquiry | null> {
  const byReference = /^FBM-INQ-[0-9A-HJKMNP-TV-Z]{8}$/.test(idOrReference);
  if (!byReference && !validId(idOrReference)) return null;
  const doc = await (await inquiries()).findOne({ ...(byReference ? { reference: idOrReference } : { _id: new ObjectId(idOrReference) }), buyerId: new ObjectId(buyerId) });
  return doc ? toBuyerInquiry(doc) : null;
}

export type CancelResult = { ok: true; inquiry: BuyerInquiry } | { ok: false; code: "NOT_FOUND" } | { ok: false; code: "NOT_CANCELLABLE"; status: InquiryStatus };

/** The buyer withdraws their own inquiry before the supplier has replied. The change is logged with the previous status. */
export async function cancelBuyerInquiry(buyerId: string, idOrReference: string): Promise<CancelResult> {
  const byReference = REFERENCE_PATTERN.test(idOrReference);
  if (!byReference && !validId(idOrReference)) return { ok: false, code: "NOT_FOUND" };
  const collection = await inquiries();
  // by reference or by id; either way the query names the buyer, so someone else's inquiry is never found
  const mine = { ...(byReference ? { reference: idOrReference } : { _id: new ObjectId(idOrReference) }), buyerId: new ObjectId(buyerId) };
  const now = new Date();
  const cancellable = [...BUYER_CANCELLABLE, "new"];
  const current = await collection.findOne(mine);
  if (!current) return { ok: false, code: "NOT_FOUND" };
  const from = normaliseStatus(current.status);
  const updated = await collection.findOneAndUpdate(
    { ...mine, status: { $in: cancellable } },
    { $set: { status: "CANCELLED", cancelledAt: now, updatedAt: now }, $push: { statusHistory: { from, to: "CANCELLED", actor: "buyer", at: now, reason: "Cancelled by the buyer" } } },
    { returnDocument: "after" },
  );
  return updated ? { ok: true, inquiry: toBuyerInquiry(updated) } : { ok: false, code: "NOT_CANCELLABLE", status: normaliseStatus(current.status) };
}
