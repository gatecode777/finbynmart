import { REVIEW_CATEGORIES } from "./rules";
import { REVIEW_MAX_PAGE_SIZE, REVIEW_RANGES, REVIEW_SORTS, type ReviewQuery, type ReviewRange, type ReviewSort } from "./query";

const ALLOWED = new Set(["page", "limit", "rating", "category", "verifiedBuyer", "range", "sort"]);

/**
 * Strict parsing for the API: an unknown parameter, an unsupported value, a bad page or a limit above 50 is a 400 with
 * the offending parameter named, rather than being quietly ignored (the page itself is the lenient reader). Values are
 * matched against fixed lists; nothing from the query string is ever passed to the database as an operator.
 */
export function parsePublicReviewQuery(search: URLSearchParams): { ok: true; query: ReviewQuery } | { ok: false; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  for (const key of new Set(search.keys())) if (!ALLOWED.has(key)) fields[key] = "This parameter is not supported.";

  const values = (name: string) => [...new Set(search.getAll(name).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean))];

  const ratingValues = values("rating");
  const badRating = ratingValues.find((value) => !/^[1-5]$/.test(value));
  if (badRating !== undefined) fields.rating = `"${badRating.slice(0, 20)}" is not a rating. Use whole numbers from 1 to 5.`;

  const categoryValues = values("category");
  const categories: readonly string[] = REVIEW_CATEGORIES.map((category) => category.value);
  const badCategory = categoryValues.find((value) => !categories.includes(value));
  if (badCategory !== undefined) fields.category = `"${badCategory.slice(0, 40)}" is not a review category. Use: ${categories.join(", ")}.`;

  const verifiedRaw = search.get("verifiedBuyer");
  if (verifiedRaw !== null && !["true", "false", "1", "0", ""].includes(verifiedRaw)) fields.verifiedBuyer = "Use true or false.";

  const rangeRaw = search.get("range") ?? "";
  const range = REVIEW_RANGES.find((option) => option.value === rangeRaw)?.value as ReviewRange | undefined;
  if (range === undefined) fields.range = `Use one of: ${REVIEW_RANGES.filter((option) => option.value).map((option) => option.value).join(", ")}.`;

  const sortRaw = search.get("sort");
  const sort = sortRaw === null || sortRaw === "" ? "relevant" : (REVIEW_SORTS.find((option) => option.value === sortRaw)?.value as ReviewSort | undefined);
  if (!sort) fields.sort = `Use one of: ${REVIEW_SORTS.map((option) => option.value).join(", ")}.`;

  const integer = (name: string, min: number, max: number): number | undefined => {
    const raw = search.get(name);
    if (raw === null || raw === "") return undefined;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
      fields[name] = `Must be a whole number from ${min} to ${max}.`;
      return undefined;
    }
    return value;
  };
  const page = integer("page", 1, 100_000);
  const limit = integer("limit", 1, REVIEW_MAX_PAGE_SIZE);

  if (Object.keys(fields).length > 0 || !sort || range === undefined) return { ok: false, fields };
  return {
    ok: true,
    query: {
      rating: ratingValues.map(Number).sort((a, b) => b - a),
      category: categoryValues,
      verified: verifiedRaw === "true" || verifiedRaw === "1",
      range,
      sort,
      page: page ?? 1,
      limit,
    },
  };
}
