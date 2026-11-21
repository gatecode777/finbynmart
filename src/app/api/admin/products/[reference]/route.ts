import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { getProductDetail } from "@/lib/admin/productManagement";

export const dynamic = "force-dynamic";

/** GET /api/admin/products/<reference>: the approved (live) content, plus the pending-revision summary only for admins who may read review data. Unknown, malformed and not-listed references are one identical 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await requireAdminApi("products.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-products-read:${guard.user.id}`, 300, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  try {
    const d = await getProductDetail((await params).reference, { unpublish: guard.permissions.includes("products.unpublish"), review: guard.permissions.includes("products.review") });
    return d ? NextResponse.json({ ok: true, data: d }, { headers: { "Cache-Control": "private, no-store" } }) : fail("Product not found.", 404);
  } catch (error) {
    console.error("admin product detail failed", (error as Error).message);
    return fail("The product could not be loaded. Please try again.", 503);
  }
}
