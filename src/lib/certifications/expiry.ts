/**
 * Date and expiry rules for certifications. Pure (no imports), so it is used by the server, the engine and the
 * node-run unit tests alike.
 *
 * Policy (also in the page spec):
 *  - Issue and expiry dates are DATE-ONLY values, stored and compared as "YYYY-MM-DD" text. They carry no time and no
 *    timezone, so a server in another timezone cannot move them by a day.
 *  - "Today" is the calendar date in India (Asia/Kolkata), where the business operates.
 *  - A certificate is valid THROUGH its expiry date: on the expiry date it is still valid ("expires today"), and it is
 *    expired from the next day on.
 *  - "Expiring soon" means valid and due within the next 90 calendar days, today and day 90 included.
 *  - A certificate with no expiry date never expires and is never "expiring soon".
 */

export const EXPIRY_TIMEZONE = "Asia/Kolkata";
export const EXPIRING_SOON_DAYS = 90;

export type ExpiryState = "none" | "valid" | "expiring" | "expired";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** True for a real calendar date written as YYYY-MM-DD (so 2026-02-30 and 2027-02-29 are rejected, 2028-02-29 is not). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Today's date in India as YYYY-MM-DD. `now` exists so tests can pin the clock. */
export function todayInIndia(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: EXPIRY_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayNumber(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  return new Date((dayNumber(iso) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** Whole calendar days from `today` to `date` (negative when `date` is in the past). */
export function daysUntil(date: string, today: string): number {
  return dayNumber(date) - dayNumber(today);
}

export function expiryState(expiryDate: string | null | undefined, today: string): ExpiryState {
  if (!expiryDate) return "none";
  const days = daysUntil(expiryDate, today);
  if (days < 0) return "expired";
  return days <= EXPIRING_SOON_DAYS ? "expiring" : "valid";
}

/** "12 Jan 2023". Fixed month names, so the text does not depend on the server's locale. */
export function formatDate(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}
