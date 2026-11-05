import { ObjectId } from "mongodb";
import type { PublicUser } from "@/lib/auth/users";
import { publicDisplayName, withinEditWindow, EDIT_WINDOW_DAYS, type ReviewInput } from "./rules";
import { invalidateReviews, reviews } from "./store";
import type { OwnReview, ReviewDoc, ReviewStatus } from "./types";

/**
 * Buyer-side writes and reads of reviews. Every query names the signed-in buyer's id, so one account can never read,
 * change or delete another's review (a foreign id is simply "not found"). Verification and moderation fields are set
 * here by the backend only; nothing from the request body reaches them.
 */

const EDITABLE: ReviewStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export function toOwnReview(doc: ReviewDoc, now: Date = new Date()): OwnReview {
  return {
    id: doc._id.toString(),
    supplierSlug: doc.supplierSlug,
    rating: doc.rating,
    title: doc.title,
    text: doc.text,
    categoryRatings: doc.categoryRatings ?? {},
    wouldRecommend: doc.wouldRecommend ?? null,
    status: doc.status,
    moderationReason: doc.status === "REJECTED" ? doc.moderationReason ?? null : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    canEdit: EDITABLE.includes(doc.status) && withinEditWindow(doc.createdAt, now),
  };
}

const validId = (id: string) => /^[a-f0-9]{24}$/i.test(id);

export type CreateResult = { ok: true; review: OwnReview } | { ok: false; code: "FORBIDDEN" | "DUPLICATE" };

/** Only a buyer account may review; a second live review of the same supplier is refused. Saved as PENDING. */
export async function createBuyerReview(user: PublicUser, supplierSlug: string, input: ReviewInput): Promise<CreateResult> {
  if (user.role !== "buyer") return { ok: false, code: "FORBIDDEN" };
  const now = new Date();
  const doc: Omit<ReviewDoc, "_id"> = {
    supplierSlug,
    buyerId: new ObjectId(user.id),
    displayName: publicDisplayName(user.name),
    ...input,
    // No order or transaction records exist, so nothing can qualify a review as verified.
    verifiedBuyer: false,
    verificationSource: null,
    status: "PENDING",
    moderationReason: null,
    moderatedBy: null,
    moderatedAt: null,
    publishedAt: null,
    active: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  try {
    const result = await (await reviews()).insertOne(doc as ReviewDoc);
    invalidateReviews(supplierSlug);
    return { ok: true, review: toOwnReview({ ...doc, _id: result.insertedId }, now) };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return { ok: false, code: "DUPLICATE" };
    throw error;
  }
}

export async function listOwnReviews(userId: string): Promise<OwnReview[]> {
  const docs = await (await reviews()).find({ buyerId: new ObjectId(userId), deletedAt: null }).sort({ createdAt: -1 }).limit(200).toArray();
  return docs.map((doc) => toOwnReview(doc));
}

export async function getOwnReview(userId: string, id: string): Promise<OwnReview | null> {
  if (!validId(id)) return null;
  const doc = await (await reviews()).findOne({ _id: new ObjectId(id), buyerId: new ObjectId(userId), deletedAt: null });
  return doc ? toOwnReview(doc) : null;
}

/** The buyer's live review of one supplier, if any (drives the Write a Review panel). */
export async function getOwnReviewForSupplier(userId: string, supplierSlug: string): Promise<OwnReview | null> {
  const doc = await (await reviews()).findOne({ buyerId: new ObjectId(userId), supplierSlug, deletedAt: null, active: true });
  return doc ? toOwnReview(doc) : null;
}

export type UpdateResult = { ok: true; review: OwnReview } | { ok: false; code: "NOT_FOUND" | "LOCKED" | "WINDOW_CLOSED" };

/**
 * Edits the author's own review within the edit window. A review that was published (or rejected) goes back to PENDING,
 * so changed text is never public before a moderator has seen it. The moderation fields are cleared, not editable.
 */
export async function updateOwnReview(userId: string, id: string, input: ReviewInput): Promise<UpdateResult> {
  if (!validId(id)) return { ok: false, code: "NOT_FOUND" };
  const collection = await reviews();
  const mine = { _id: new ObjectId(id), buyerId: new ObjectId(userId), deletedAt: null };
  const current = await collection.findOne(mine);
  if (!current || current.status === "DELETED") return { ok: false, code: "NOT_FOUND" };
  if (!EDITABLE.includes(current.status)) return { ok: false, code: "LOCKED" };
  const now = new Date();
  const windowStart = new Date(now.getTime() - EDIT_WINDOW_DAYS * 86_400_000);
  const updated = await collection.findOneAndUpdate(
    { ...mine, status: { $in: EDITABLE }, createdAt: { $gte: windowStart } },
    { $set: { ...input, status: "PENDING", publishedAt: null, moderationReason: null, moderatedBy: null, moderatedAt: null, updatedAt: now } },
    { returnDocument: "after" },
  );
  if (updated) invalidateReviews(updated.supplierSlug);
  return updated ? { ok: true, review: toOwnReview(updated, now) } : { ok: false, code: "WINDOW_CLOSED" };
}

/** Soft delete: the review leaves every public count at once and the buyer may write a new one later. */
export async function deleteOwnReview(userId: string, id: string): Promise<boolean> {
  if (!validId(id)) return false;
  const now = new Date();
  const deleted = await (await reviews()).findOneAndUpdate(
    { _id: new ObjectId(id), buyerId: new ObjectId(userId), deletedAt: null },
    { $set: { status: "DELETED", deletedAt: now, updatedAt: now }, $unset: { active: "" } },
    { returnDocument: "before", projection: { supplierSlug: 1 } },
  );
  if (deleted) invalidateReviews(deleted.supplierSlug);
  return Boolean(deleted);
}
