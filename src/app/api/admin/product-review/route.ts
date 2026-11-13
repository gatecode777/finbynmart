import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { listPending } from "@/lib/admin/productReview";

export const dynamic = "force-dynamic";

/** The pending review queue (oldest first, 20 per page). Capability products.review. */
export async function GET(request: Request) {
  const guard = await requireAdminApi("products.review");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-review-read:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const data = await listPending(Number(new URL(request.url).searchParams.get("page")) || 1);
  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
}
