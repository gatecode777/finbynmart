/**
 * Rating arithmetic. Pure (no imports), so it is shared by the engine and unit-tested directly under node.
 *
 * Policy (also in the page spec):
 *  - Average = sum of the ratings of all published reviews / number of published reviews, kept at full precision and
 *    shown to ONE decimal place, rounded half up using integer arithmetic (so 4.25 shows 4.3, never 4.2 through a
 *    floating-point error).
 *  - No published reviews means there is no average (null), never 0.0.
 *  - A distribution percentage is count / total x 100, rounded half up to a whole number. The rounded figures are
 *    for display and may not add up to exactly 100; the counts are exact.
 */

/** Average to one decimal, half up; null when there are no ratings. */
export function averageRating(sum: number, count: number): number | null {
  if (!Number.isInteger(sum) || !Number.isInteger(count) || count <= 0) return null;
  return Math.floor((sum * 20 + count) / (2 * count)) / 10;
}

/** Full-precision average (for storage or comparison); null when there are no ratings. */
export function exactAverage(sum: number, count: number): number | null {
  return count > 0 ? sum / count : null;
}

/** Whole-number percentage, half up; 0 when the total is 0. */
export function percentOf(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.floor((count * 200 + total) / (2 * total));
}
