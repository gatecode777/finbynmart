import type { Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { createTtlCache, ttlSetting, withTimeout } from "@/lib/perf/ttlCache";
import { buildReviewView, type ReviewView } from "./engine";
import { averageRating } from "./rating";
import type { ReviewQuery } from "./query";
import { REVIEW_CATEGORIES, initialsOf } from "./rules";
import type { PublicReview, ReviewDoc } from "./types";

/**
 * Read side of the `reviews` collection. Everything public goes through here, so the access rule lives in one place:
 * a review is public only when its status is APPROVED and it is not deleted, and every query is scoped to the supplier
 * the URL resolved to. The author, the moderation fields and the verification evidence never leave this module.
 */

/** Upper bound of reviews read for one supplier at a time (the list itself is paged to 10 to 50). */
const MAX_PER_SUPPLIER = 2000;
const HEADLINE_TIMEOUT_MS = 1500;

const PROJECTION = {
  supplierSlug: 1,
  displayName: 1,
  rating: 1,
  title: 1,
  text: 1,
  categoryRatings: 1,
  wouldRecommend: 1,
  verifiedBuyer: 1,
  verificationSource: 1,
  publishedAt: 1,
} as const;

let indexReady: Promise<unknown> | undefined;

export async function reviews(): Promise<Collection<ReviewDoc>> {
  const collection = (await getDb()).collection<ReviewDoc>("reviews");
  indexReady ??= Promise.all([
    // The public query: one supplier's approved reviews, newest first.
    collection.createIndex({ supplierSlug: 1, status: 1, publishedAt: -1 }),
    // A buyer's own reviews.
    collection.createIndex({ buyerId: 1, createdAt: -1 }),
    // One live review per buyer and supplier; a deleted review frees the slot (it loses `active`).
    collection.createIndex({ buyerId: 1, supplierSlug: 1 }, { unique: true, partialFilterExpression: { active: true } }),
  ]);
  await indexReady;
  return collection;
}

export const publishedFilter = (supplierSlug: string) => ({ supplierSlug, status: "APPROVED" as const, deletedAt: null });

/** Explicit allow-list projection from the stored record to what a visitor may see; null for a record that cannot be shown. */
export function toPublicReview(doc: ReviewDoc): PublicReview | null {
  if (!doc.publishedAt || Number.isNaN(doc.publishedAt.getTime())) return null;
  return {
    id: doc._id.toString(),
    displayName: doc.displayName,
    initials: initialsOf(doc.displayName),
    rating: doc.rating,
    title: doc.title,
    text: doc.text,
    publishedAt: doc.publishedAt.toISOString(),
    categories: REVIEW_CATEGORIES.filter((category) => typeof doc.categoryRatings?.[category.value] === "number").map((category) => ({ value: category.value, label: category.label, rating: doc.categoryRatings[category.value] as number })),
    wouldRecommend: typeof doc.wouldRecommend === "boolean" ? doc.wouldRecommend : null,
    // Verified only with recorded evidence; the platform has no order records, so this is false for every review.
    verified: doc.verifiedBuyer === true && Boolean(doc.verificationSource),
  };
}

/**
 * Published reviews are public data read by every visitor of a supplier's pages, so one supplier's list is kept for a short
 * time (FINBYN_REVIEW_CACHE_MS, default 30 s) and concurrent readers share one database read. A review written, edited or
 * deleted through this application clears the entry at once (invalidateReviews); a change made any other way (a moderator
 * editing the database, another server instance) shows within the TTL. See docs/performance/API_CACHE_STRATEGY.md.
 */
const listCache = createTtlCache<PublicReview[]>({ name: "reviews.list", ttlMs: ttlSetting("FINBYN_REVIEW_CACHE_MS", 30_000), maxEntries: 300 });
const headlineCache = createTtlCache<{ count: number; average: number | null }>({ name: "reviews.headline", ttlMs: ttlSetting("FINBYN_REVIEW_CACHE_MS", 30_000), maxEntries: 1000 });

export function invalidateReviews(supplierSlug: string): void {
  listCache.delete(supplierSlug);
  headlineCache.delete(supplierSlug);
}

export async function listPublishedReviews(supplierSlug: string): Promise<PublicReview[]> {
  return listCache.get(supplierSlug, async () => {
    const docs = await (await reviews()).find(publishedFilter(supplierSlug), { projection: PROJECTION }).limit(MAX_PER_SUPPLIER).toArray();
    return docs.map(toPublicReview).filter((review): review is PublicReview => review !== null);
  });
}

export async function getSupplierReviewView(supplierSlug: string, query: ReviewQuery, now: number = Date.now()): Promise<ReviewView> {
  return buildReviewView(await listPublishedReviews(supplierSlug), query, now);
}

/**
 * Count and average for the tab and the header, computed by the database ($group returns one small document instead of up
 * to 2,000 reviews) and kept like the list. Undefined (nothing shown) when the database cannot be reached or answers too
 * slowly: an optional number in a tab never holds a page back.
 */
export async function getReviewHeadlineSafe(supplierSlug: string): Promise<{ count: number; average: number | null } | undefined> {
  try {
    return await withTimeout(
      headlineCache.get(supplierSlug, async () => {
        const [row] = await (await reviews())
          .aggregate<{ count: number; sum: number }>([
            { $match: { ...publishedFilter(supplierSlug), publishedAt: { $type: "date" } } },
            { $group: { _id: null, count: { $sum: 1 }, sum: { $sum: "$rating" } } },
          ])
          .toArray();
        return { count: row?.count ?? 0, average: row ? averageRating(row.sum, row.count) : null };
      }),
      HEADLINE_TIMEOUT_MS,
    );
  } catch (error) {
    console.error("review headline failed", (error as Error).message);
    return undefined;
  }
}
