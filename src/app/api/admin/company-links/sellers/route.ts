import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { searchSellers } from "@/lib/admin/sellerMapping";

export const dynamic = "force-dynamic";

/** Catalogue sellers by name, at most 20; flags a seller that already belongs to a company. */
export async function GET(request: Request) {
  const guard = await requireAdminApi("sellers.map");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-links-read:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const data = await searchSellers(new URL(request.url).searchParams.get("q") ?? "");
  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
}
