import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { parseQuery } from "@/lib/admin/productList";
import { listProducts } from "@/lib/admin/productManagement";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/products?q=&status=&category=&supplier=&sort=updated|name&page=: the admin product list (capability products.read). Query values are validated against allow-lists
 * and bounded; the actor and capabilities come from the session, never from the request; what the admin may do per row is decided here. Private, no-store.
 */
export async function GET(request: Request) {
  const guard = await requireAdminApi("products.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-products-read:${guard.user.id}`, 300, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  try {
    const q = parseQuery(new URL(request.url).searchParams);
    const data = await listProducts(q, { unpublish: guard.permissions.includes("products.unpublish"), review: guard.permissions.includes("products.review") });
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("admin products list failed", (error as Error).message);
    return fail("The product list could not be loaded. Please try again.", 503);
  }
}

