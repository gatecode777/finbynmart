import type { ObjectId } from "mongodb";
import type { ReviewCategory } from "./rules";

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "HIDDEN" | "DELETED";

/** The record as stored in the `reviews` collection. */
export interface ReviewDoc {
  _id: ObjectId;
  /** Public slug of the reviewed supplier; every public query is scoped by it. */
  supplierSlug: string;
  /** The author. Never leaves the server. */
  buyerId: ObjectId;
  /** "Priya S.": the only name ever shown publicly. */
  displayName: string;
  rating: number;
  title: string;
  text: string;
  categoryRatings: Partial<Record<ReviewCategory, number>>;
  wouldRecommend: boolean | null;
  /** Set by the backend from order evidence only. The platform has no order records, so it is always false. */
  verifiedBuyer: boolean;
  verificationSource: string | null;
  status: ReviewStatus;
  /** Shown to the author when the review was rejected; never public. */
  moderationReason?: string | null;
  moderatedBy?: string | null;
  moderatedAt?: Date | null;
  /** Date of approval: the date shown on the page and used for sorting and the date filter. */
  publishedAt?: Date | null;
  /** True while the review counts as the buyer's review of this supplier (one per buyer and supplier). */
  active?: true;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

/** What a visitor is shown, built by an explicit allow-list. */
export interface PublicReview {
  id: string;
  displayName: string;
  initials: string;
  rating: number;
  title: string;
  text: string;
  /** ISO timestamp of publication. */
  publishedAt: string;
  categories: { value: string; label: string; rating: number }[];
  wouldRecommend: boolean | null;
  verified: boolean;
}

/** What an author sees of their own review. */
export interface OwnReview {
  id: string;
  supplierSlug: string;
  rating: number;
  title: string;
  text: string;
  categoryRatings: Partial<Record<ReviewCategory, number>>;
  wouldRecommend: boolean | null;
  status: ReviewStatus;
  /** Only for a rejected review. */
  moderationReason: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}
