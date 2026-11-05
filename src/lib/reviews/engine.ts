import { averageRating, exactAverage, percentOf } from "./rating";
import { REVIEW_CATEGORIES } from "./rules";
import { REVIEW_MAX_PAGE_SIZE, REVIEW_PAGE_SIZE, REVIEW_RANGES, type ReviewFacetOption, type ReviewQuery } from "./query";
import type { PublicReview } from "./types";

/**
 * Summary, metrics, facets, filters, sorting and pagination over ONE supplier's published reviews. The set is already
 * scoped by supplier and status in the database query; the work here is plain and deterministic.
 */

export interface ReviewSummary {
  total: number;
  /** One decimal place; null (no rating at all) when there are no published reviews. */
  average: number | null;
  exactAverage: number | null;
  /** Five to one star. `percent` is rounded for display, `count` is exact. */
  distribution: { rating: number; count: number; percent: number }[];
}

/** Only metrics with a real data source: a question buyers answered, and category ratings buyers gave. */
export interface ReviewMetrics {
  wouldRecommend: { percent: number; yes: number; answered: number } | null;
  productQuality: { average: number; count: number } | null;
}

export interface ReviewView {
  summary: ReviewSummary;
  metrics: ReviewMetrics;
  facets: { rating: ReviewFacetOption[]; category: ReviewFacetOption[]; buyerType: ReviewFacetOption[] | null; range: ReviewFacetOption[] };
  results: { items: PublicReview[]; total: number; page: number; pageSize: number; totalPages: number; from: number; to: number };
  applied: ReviewQuery;
  ignored: { param: string; value: string }[];
  activeFilters: number;
}

export function summarize(all: PublicReview[]): ReviewSummary {
  const total = all.length;
  const sum = all.reduce((acc, review) => acc + review.rating, 0);
  return {
    total,
    average: averageRating(sum, total),
    exactAverage: exactAverage(sum, total),
    distribution: [5, 4, 3, 2, 1].map((rating) => {
      const count = all.filter((review) => review.rating === rating).length;
      return { rating, count, percent: percentOf(count, total) };
    }),
  };
}

export function metricsOf(all: PublicReview[]): ReviewMetrics {
  const answered = all.filter((review) => review.wouldRecommend !== null);
  const yes = answered.filter((review) => review.wouldRecommend === true).length;
  const quality = all.flatMap((review) => review.categories.filter((category) => category.value === "product-quality").map((category) => category.rating));
  const qualityAverage = averageRating(quality.reduce((a, b) => a + b, 0), quality.length);
  return {
    wouldRecommend: answered.length > 0 ? { percent: percentOf(yes, answered.length), yes, answered: answered.length } : null,
    productQuality: qualityAverage !== null ? { average: qualityAverage, count: quality.length } : null,
  };
}

type Group = "rating" | "category" | "verified" | "range";

const timeOf = (review: PublicReview) => Date.parse(review.publishedAt);

/** Ties always fall back to the id, so the order never changes between requests. */
function compare(sort: ReviewQuery["sort"]) {
  const byId = (a: PublicReview, b: PublicReview) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const newest = (a: PublicReview, b: PublicReview) => timeOf(b) - timeOf(a);
  const primary: Record<ReviewQuery["sort"], (a: PublicReview, b: PublicReview) => number> = {
    // Most relevant: verified-buyer reviews first, then newest, then the higher rating.
    relevant: (a, b) => Number(b.verified) - Number(a.verified) || newest(a, b) || b.rating - a.rating,
    newest: (a, b) => newest(a, b) || b.rating - a.rating,
    oldest: (a, b) => -newest(a, b) || b.rating - a.rating,
    highest: (a, b) => b.rating - a.rating || newest(a, b),
    lowest: (a, b) => a.rating - b.rating || newest(a, b),
  };
  return (a: PublicReview, b: PublicReview) => primary[sort](a, b) || byId(a, b);
}

export function buildReviewView(all: PublicReview[], requested: ReviewQuery, now: number = Date.now()): ReviewView {
  const hasVerified = all.some((review) => review.verified);
  const presentCategories = new Set(all.flatMap((review) => review.categories.map((category) => category.value)));

  // Category filters the supplier's reviews have no data for are reported, never silently honoured.
  const ignored: ReviewView["ignored"] = [];
  // A verified-only request is honoured as asked: with no verified reviews it matches nothing (it never shows unverified ones).
  const applied: ReviewQuery = { ...requested, category: [] };
  for (const value of requested.category) {
    if (presentCategories.has(value)) applied.category.push(value);
    else ignored.push({ param: "category", value });
  }

  const cutoff = (() => {
    const days = REVIEW_RANGES.find((option) => option.value === applied.range)?.days;
    return days ? now - days * 86_400_000 : null;
  })();
  const rangeStart = (value: string) => {
    const days = REVIEW_RANGES.find((option) => option.value === value)?.days;
    return days ? now - days * 86_400_000 : null;
  };

  const matches: Record<Group, (review: PublicReview) => boolean> = {
    rating: (review) => applied.rating.length === 0 || applied.rating.includes(review.rating),
    category: (review) => applied.category.length === 0 || review.categories.some((category) => applied.category.includes(category.value)),
    verified: (review) => !applied.verified || review.verified,
    range: (review) => cutoff === null || timeOf(review) >= cutoff,
  };
  const passes = (review: PublicReview, skip?: Group) => (Object.keys(matches) as Group[]).every((group) => group === skip || matches[group](review));
  // Counts for one group ignore that group's own selection, so ticking a box never hides its siblings.
  const count = (group: Group, test: (review: PublicReview) => boolean) => all.filter((review) => passes(review, group) && test(review)).length;

  const facets: ReviewView["facets"] = {
    rating: [5, 4, 3, 2, 1].map((rating) => ({ value: String(rating), label: `${rating} Star`, count: count("rating", (review) => review.rating === rating) })),
    category: REVIEW_CATEGORIES.filter((category) => presentCategories.has(category.value)).map((category) => ({
      value: category.value,
      label: category.label,
      count: count("category", (review) => review.categories.some((item) => item.value === category.value)),
    })),
    buyerType: hasVerified
      ? [
          { value: "verified", label: "Verified Buyer", count: count("verified", (review) => review.verified) },
          { value: "all", label: "All Published Reviews", count: count("verified", () => true) },
        ]
      : null,
    range: REVIEW_RANGES.map((option) => {
      const start = rangeStart(option.value);
      return { value: option.value, label: option.label, count: count("range", (review) => start === null || timeOf(review) >= start) };
    }),
  };

  const matching = all.filter((review) => passes(review)).sort(compare(applied.sort));
  const pageSize = Math.min(Math.max(applied.limit ?? REVIEW_PAGE_SIZE, 1), REVIEW_MAX_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.max(1, applied.page);
  const start = (page - 1) * pageSize;
  const items = matching.slice(start, start + pageSize);

  return {
    summary: summarize(all),
    metrics: metricsOf(all),
    facets,
    results: { items, total: matching.length, page, pageSize, totalPages, from: items.length ? start + 1 : 0, to: start + items.length },
    applied,
    ignored,
    activeFilters: applied.rating.length + applied.category.length + (applied.verified ? 1 : 0) + (applied.range ? 1 : 0),
  };
}
