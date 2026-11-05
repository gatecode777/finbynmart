import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * How a GUEST proves, for a short time, that an inquiry is theirs. The submission response sets a signed, httpOnly
 * cookie in the browser that submitted; the confirmation page accepts the reference only together with that cookie. The
 * reference alone opens nothing (it is printed on screen and may be shared), and nothing personal or secret is placed
 * in an address.
 *
 * The cookie holds up to a few {reference, expiry} entries under one HMAC signature (key: AUTH_SECRET, as the session
 * cookie). It is a confirmation window, not an account: it does not allow listing or tracking inquiries later.
 * Pure apart from the clock and the key, which tests pass in.
 */

export const GUEST_ACCESS_COOKIE = "finbyn_inquiry_access";
/** How long a confirmation stays openable after the submission. */
export const GUEST_ACCESS_SECONDS = 60 * 60;
/** The cookie outlives that window, so a guest who comes back later is told the link expired rather than "not found". */
export const GUEST_ACCESS_COOKIE_SECONDS = 24 * 60 * 60;
const MAX_ENTRIES = 5;

interface Entry {
  r: string;
  e: number;
}

function defaultKey(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must be set to a random string of 32+ characters");
  return value;
}

const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("base64url");

/** The entries of a cookie whose signature is valid; anything else (missing, forged, damaged) reads as empty. */
function read(cookie: string | undefined, key: string): Entry[] {
  if (!cookie) return [];
  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) return [];
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return [];
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    return Array.isArray(parsed) ? parsed.filter((entry): entry is Entry => entry && typeof entry.r === "string" && typeof entry.e === "number") : [];
  } catch {
    return [];
  }
}

/** The cookie value that allows `reference` for GUEST_ACCESS_SECONDS, keeping other still-valid entries. */
export function grantAccess(existing: string | undefined, reference: string, now: number = Date.now(), key: string = defaultKey()): string {
  const kept = read(existing, key).filter((entry) => entry.e > now - GUEST_ACCESS_COOKIE_SECONDS * 1000 && entry.r !== reference);
  const entries = [...kept, { r: reference, e: now + GUEST_ACCESS_SECONDS * 1000 }].slice(-MAX_ENTRIES);
  const payload = Buffer.from(JSON.stringify(entries)).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

/**
 * "valid" while the window is open; "expired" when the cookie really did allow this reference once (so the visitor is the
 * guest who submitted it); "none" for no cookie, a forged one, or another reference.
 */
export function checkAccess(cookie: string | undefined, reference: string, now: number = Date.now(), key: string = defaultKey()): "valid" | "expired" | "none" {
  const entry = read(cookie, key).find((item) => item.r === reference);
  if (!entry) return "none";
  return entry.e > now ? "valid" : "expired";
}
