/**
 * Review rules shared by the browser form and the server: limits, categories and validation. Pure (no imports), so
 * the same function checks the form before sending and the API after receiving, and node can unit-test it directly.
 *
 * Policy (also in the page spec):
 *  - Any signed-in BUYER account may review a supplier once. A supplier account may not.
 *  - A new review is PENDING until a moderator approves it; nothing is public before that.
 *  - The Verified Buyer badge needs order or transaction evidence. The platform has no such records, so no review
 *    is verified and nothing in this module can make one so.
 *  - A review may be edited by its author within EDIT_WINDOW_DAYS of submission; editing a published review sends
 *    it back to moderation. The author may delete their own review at any time.
 */

export const REVIEW_LIMITS = { titleMin: 5, titleMax: 120, textMin: 20, textMax: 3000 } as const;
export const EDIT_WINDOW_DAYS = 7;

/** Rated 1 to 5, each optional. "Overall Experience" is the overall rating itself, so it is not a category. */
export const REVIEW_CATEGORIES = [
  { value: "product-quality", label: "Product Quality" },
  { value: "service-support", label: "Service & Support" },
  { value: "delivery-logistics", label: "Delivery & Logistics" },
  { value: "communication", label: "Communication" },
  { value: "value-for-money", label: "Value for Money" },
] as const;

export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number]["value"];

export const categoryLabel = (value: string): string => REVIEW_CATEGORIES.find((category) => category.value === value)?.label ?? value;

export interface ReviewInput {
  rating: number;
  title: string;
  text: string;
  categoryRatings: Partial<Record<ReviewCategory, number>>;
  /** null = the buyer did not answer. */
  wouldRecommend: boolean | null;
}

export type ReviewValidation = { ok: true; value: ReviewInput } | { ok: false; fields: Record<string, string> };

/** Single line: control characters and runs of whitespace collapse to one space. */
export const normaliseTitle = (value: string): string => value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
/** Keeps line breaks (at most one blank line in a row); the words themselves are never changed. */
export const normaliseText = (value: string): string =>
  value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LINK = /(https?:\/\/|www\.)\S+/i;
const PHONE = /(?:\+?\d[\s().-]*){10,}/;

/** Reviews are public, so private contact details and promotional links are refused (the text is never rewritten). */
export const hasContactDetails = (value: string): boolean => EMAIL.test(value) || LINK.test(value) || PHONE.test(value);

const rating = (value: unknown): number | null => {
  const n = typeof value === "string" && /^[1-5]$/.test(value.trim()) ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

export function validateReviewInput(raw: unknown): ReviewValidation {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};

  const overall = rating(body.rating);
  if (overall === null) fields.rating = "Choose a rating from 1 to 5 stars.";

  const title = typeof body.title === "string" ? normaliseTitle(body.title) : "";
  if (title.length < REVIEW_LIMITS.titleMin || title.length > REVIEW_LIMITS.titleMax) fields.title = `Give your review a title of ${REVIEW_LIMITS.titleMin} to ${REVIEW_LIMITS.titleMax} characters.`;

  const text = typeof body.text === "string" ? normaliseText(body.text) : "";
  if (text.length < REVIEW_LIMITS.textMin || text.length > REVIEW_LIMITS.textMax) fields.text = `Write your review in ${REVIEW_LIMITS.textMin} to ${REVIEW_LIMITS.textMax.toLocaleString("en-IN")} characters.`;

  if (!fields.title && !fields.text && (hasContactDetails(title) || hasContactDetails(text))) {
    fields.text = "Please remove email addresses, phone numbers and links from your review.";
  }

  const categoryRatings: Partial<Record<ReviewCategory, number>> = {};
  const given = body.categoryRatings;
  if (given !== undefined && given !== null) {
    if (typeof given !== "object" || Array.isArray(given)) fields.categoryRatings = "Category ratings are not valid.";
    else {
      for (const [key, value] of Object.entries(given as Record<string, unknown>)) {
        const category = REVIEW_CATEGORIES.find((item) => item.value === key);
        const score = rating(value);
        if (!category) fields.categoryRatings = `"${key.slice(0, 40)}" is not a review category.`;
        else if (score === null) fields.categoryRatings = `Rate ${category.label} from 1 to 5, or leave it out.`;
        else categoryRatings[category.value] = score;
      }
    }
  }

  const recommend = body.wouldRecommend;
  if (recommend !== undefined && recommend !== null && typeof recommend !== "boolean") fields.wouldRecommend = "Answer yes or no, or leave it out.";

  if (Object.keys(fields).length > 0 || overall === null) return { ok: false, fields };
  return { ok: true, value: { rating: overall, title, text, categoryRatings, wouldRecommend: typeof recommend === "boolean" ? recommend : null } };
}

/** "Priya Sharma" -> "Priya S."; one name stays as it is. Only this is ever shown publicly, never the email. */
export function publicDisplayName(fullName: string): string {
  const parts = normaliseTitle(fullName).split(" ").filter(Boolean);
  if (parts.length === 0) return "Buyer";
  const first = parts[0].slice(0, 24);
  return parts.length === 1 ? first : `${first} ${[...parts[parts.length - 1]][0].toUpperCase()}.`;
}

export const initialsOf = (displayName: string): string => {
  const parts = displayName.replace(/\./g, "").split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "B") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

/** True while the author may still edit or delete: EDIT_WINDOW_DAYS from submission. */
export const withinEditWindow = (createdAt: Date, now: Date = new Date()): boolean => now.getTime() - createdAt.getTime() <= EDIT_WINDOW_DAYS * 86_400_000;
