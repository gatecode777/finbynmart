/**
 * Exact decimal text <-> integer minor units for quotation amounts. Pure (no imports): the browser preview and the server use the SAME functions.
 *
 * Contract (docs/backend/PAGE_43_QUOTATION_CALCULATION_POLICY.md):
 *  - Amounts cross the API as decimal STRINGS ("120.00"), never as JavaScript floats. They are parsed here by text, never with Number() on a fraction.
 *  - Scale is 2 decimal places for every supported currency (INR, USD, EUR, GBP, AED, SGD). More than 2 places, a sign, an exponent, separators or
 *    anything that is not digits and one dot is REFUSED, never rounded.
 *  - Internally an amount is a whole number of minor units (paise / cents) that must stay a safe integer; the arithmetic itself is BigInt (money.ts).
 *  - Quantity is a whole number (the quotation model stores whole quantities; fractional quantities are not supported and are refused).
 *  - A percentage is text with at most 2 decimals, held as basis points (12.5 -> 1250), 0 to 100.
 */
export const MAX_SAFE_MINOR = Number.MAX_SAFE_INTEGER;
/** The largest unit price or charge accepted: 1,000,000,000.00 (a hard sanity limit well inside the safe-integer range). */
export const MAX_AMOUNT_MINOR = 100_000_000_000;
export const MAX_QUANTITY = 1_000_000;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const MONEY = /^(\d{1,12})(?:\.(\d{1,2}))?$/;

/** "120" | "120.5" | "120.50" -> 12000 | 12050 | 12050. Nothing else is accepted. */
export function parseMoney(text: unknown, label = "The amount"): Parsed<number> {
  if (typeof text !== "string") return { ok: false, error: `${label} must be text such as 120.00.` };
  const trimmed = text.trim();
  const match = MONEY.exec(trimmed);
  if (!match) return { ok: false, error: `${label} must be a positive amount with at most 2 decimal places (for example 120.00).` };
  const minor = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  if (minor > BigInt(MAX_AMOUNT_MINOR)) return { ok: false, error: `${label} is too large.` };
  return { ok: true, value: Number(minor) };
}

/** 12050 -> "120.50" (integer arithmetic on the text of the number: no float division). */
export function formatDecimal(minor: number): string {
  const negative = minor < 0;
  const abs = BigInt(Math.abs(minor));
  const whole = abs / BigInt(100);
  const frac = String(abs % BigInt(100)).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** "12" | "12.5" | "12.50" -> 1200 | 1250 | 1250 basis points; 0 to 100 inclusive. */
export function parsePercent(text: unknown, label = "The percentage"): Parsed<number> {
  if (typeof text !== "string") return { ok: false, error: `${label} must be text such as 12.5.` };
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return { ok: false, error: `${label} must be a number from 0 to 100 with at most 2 decimal places.` };
  const bp = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  if (bp > 10_000) return { ok: false, error: `${label} cannot be more than 100.` };
  return { ok: true, value: bp };
}

/** Whole quantity from 1 to MAX_QUANTITY. A fraction is refused (not supported), not rounded. */
export function parseQuantity(text: unknown, label = "The quantity"): Parsed<number> {
  if (typeof text !== "string") return { ok: false, error: `${label} must be a whole number.` };
  if (!/^\d{1,7}$/.test(text.trim())) return { ok: false, error: `${label} must be a whole number (fractional quantities are not supported).` };
  const n = Number(text.trim());
  if (n < 1) return { ok: false, error: `${label} must be at least 1.` };
  if (n > MAX_QUANTITY) return { ok: false, error: `${label} cannot be more than ${MAX_QUANTITY.toLocaleString("en-IN")}.` };
  return { ok: true, value: n };
}
