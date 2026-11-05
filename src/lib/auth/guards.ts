import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./session";
import type { PublicUser } from "./users";

/**
 * Buyer-only access. The identity always comes from the signed session cookie (and the account must be ACTIVE: getCurrentUser
 * returns nothing for a suspended account or a revoked session). A request body, query string or header never names the buyer.
 */
export async function requireBuyerPage(nextPath: string): Promise<PublicUser | "NOT_A_BUYER"> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  return user.role === "buyer" ? user : "NOT_A_BUYER";
}

export async function requireBuyerApi(): Promise<{ user: PublicUser } | { response: NextResponse }> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return { response: NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401, headers: { "Cache-Control": "private, no-store" } }) };
  if (user.role !== "buyer") return { response: NextResponse.json({ ok: false, message: "This area is for buyer accounts." }, { status: 403, headers: { "Cache-Control": "private, no-store" } }) };
  return { user };
}
