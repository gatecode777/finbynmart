import { NextResponse } from "next/server";
import { requireBuyerApi } from "@/lib/auth/guards";
import { tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import type { PublicUser } from "@/lib/auth/users";
import type { Conflict } from "./profile";

export const PRIVATE = { "Cache-Control": "private, no-store" };

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE });

/** Buyer identity from the session, then (for a write) a per-buyer limit on how often it may be used. */
export async function buyerGuard(write?: { key: string; limit: number; windowSeconds: number }): Promise<{ user: PublicUser } | { response: NextResponse }> {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard;
  if (write) {
    const limit = await rateLimit(`${write.key}:${guard.user.id}`, write.limit, write.windowSeconds);
    if (!limit.ok) return { response: tooMany(limit.retryAfterSeconds) };
  }
  return guard;
}

const CONFLICT_TEXT: Record<Conflict["code"], [number, string, string?]> = {
  CONFLICT: [409, "This was changed somewhere else since you opened it. Reload the page to see the latest and try again."],
  NOT_FOUND: [404, "Not found."],
  NAME_TAKEN: [409, "A company with this name is already registered on Finbyn Mart. Companies cannot be claimed here: contact support if this is your company.", "legalName"],
  HAS_COMPANY: [409, "You already have a company. Edit it instead of creating another."],
  NO_COMPANY: [409, "Add your company details first."],
  STORAGE_UNAVAILABLE: [503, "Document storage is not configured on this server, so documents cannot be uploaded yet."],
  VERIFIED_LOCKED: [409, "A verified document cannot be changed or removed here. Contact support."],
};

export function conflictResponse(code: Conflict["code"]) {
  const [status, message, field] = CONFLICT_TEXT[code];
  return json({ ok: false, message, code, ...(field ? { fields: { [field]: message } } : {}) }, status);
}

const ADDRESS_TEXT: Record<string, [number, string]> = {
  NOT_FOUND: [404, "Address not found."],
  CONFLICT: [409, "This address was changed somewhere else since you opened it. Reload the page to see the latest and try again."],
  LIMIT: [409, "You have reached the limit of 50 saved addresses. Remove one to add another."],
  NO_COMPANY: [409, "Add your company details first to link an address to your company."],
  PURPOSE_MISSING: [409, "This address does not have the matching purpose. Edit it and add the Billing or Delivery purpose first."],
};

export function addressFailure(code: string) {
  const [status, message] = ADDRESS_TEXT[code] ?? [409, "The address could not be saved."];
  return json({ ok: false, message, code }, status);
}
