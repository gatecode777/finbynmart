import type { SearchParams } from "@/lib/utils/searchParams";

/** Client-safe pieces of the review list: query shape, option lists, URL parsing and building. */

export type ReviewSort = "relevant" | "newest" | "oldest" | "highest" | "lowest";

/** "Most Helpful" is left out: there is no helpful voting. */
export const REVIEW_SORTS: { value: ReviewSort; label: string }[] = [
  { value: "relevant", label: "Most Relevant" },
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "highest", label: "Highest Rating" },
  { value: "lowest", label: "Lowest Rating" },
];

export type ReviewRange = "" | "30d" | "90d" | "12m";

export const REVIEW_RANGES: { value: ReviewRange; label: string; days: number | null }[] = [
  { value: "", label: "All time", days: null },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "12m", label: "Last 12 months", days: 365 },
];

export const REVIEW_PAGE_SIZE = 10;
export const REVIEW_MAX_PAGE_SIZE = 50;

export interface ReviewQuery {
  rating: number[];
  category: string[];
  verified: boolean;
  range: ReviewRange;
  sort: ReviewSort;
  page: number;
  limit?: number;
}

export const NO_REVIEW_FILTERS: Pick<ReviewQuery, "rating" | "category" | "verified" | "range"> = { rating: [], category: [], verified: false, range: "" };

export interface ReviewFacetOption {
  value: string;
  label: string;
  count: number;
}

const many = (value: string | string[] | undefined): string[] => {
  const raw = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return [...new Set(raw.map((item) => item.trim()).filter((item) => item && item.length <= 60))].slice(0, 20);
};
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Lenient parsing for the page: unknown sorts, ranges and bad numbers fall back to the defaults. */
export function parseReviewQuery(params: SearchParams): ReviewQuery {
  const page = Number(one(params.page));
  const limit = Number(one(params.limit));
  return {
    rating: [...new Set(many(params.rating).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 5))].sort((a, b) => b - a),
    category: many(params.category),
    verified: one(params.verified) === "1",
    range: REVIEW_RANGES.find((option) => option.value === one(params.range))?.value ?? "",
    sort: REVIEW_SORTS.find((option) => option.value === one(params.sort))?.value ?? "relevant",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: Number.isInteger(limit) && limit >= 1 ? Math.min(limit, REVIEW_MAX_PAGE_SIZE) : undefined,
  };
}

export function reviewParams(query: ReviewQuery, overrides: Partial<ReviewQuery> = {}): URLSearchParams {
  const merged = { ...query, ...overrides };
  const search = new URLSearchParams();
  for (const value of merged.rating) search.append("rating", String(value));
  for (const value of merged.category) search.append("category", value);
  if (merged.verified) search.set("verified", "1");
  if (merged.range) search.set("range", merged.range);
  if (merged.sort !== "relevant") search.set("sort", merged.sort);
  if (merged.limit !== undefined) search.set("limit", String(merged.limit));
  if (merged.page > 1) search.set("page", String(merged.page));
  return search;
}

export function reviewHref(basePath: string, query: ReviewQuery, overrides: Partial<ReviewQuery> = {}): string {
  const search = reviewParams(query, overrides).toString();
  return search ? `${basePath}?${search}` : basePath;
}
