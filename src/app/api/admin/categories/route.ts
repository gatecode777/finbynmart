import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { listCategories } from "@/lib/admin/categoryManagement";
import { categoryCapsOf } from "@/lib/admin/categoryApi";
import { validateState } from "@/lib/admin/categoryRules";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/categories: the code-defined taxonomy with its EFFECTIVE state (capability categories.read). Filters are validated allow-lists (level, status, parent, search, page; an unknown
 * value is 422); `parent` returns one node's children (lazy hierarchy loading). Default 20 per page (max 50), in taxonomy order (the order the public site uses). Product counts are eligible
 * products WITHOUT the activation gate; nothing is queried per node. Scope = capability.
 */
export async function GET(request: Request) {
  const guard = await requireAdminApi("categories.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-categories:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const sp = new URL(request.url).searchParams;
  const v = validateState((k) => sp.get(k));
  if (!v.ok) return NextResponse.json({ ok: false, message: "Check the filters.", fields: v.fields }, { status: 422, headers: NO_STORE });
  try {
    return NextResponse.json({ ok: true, data: await listCategories(v.state, categoryCapsOf(guard.permissions), Number(sp.get("limit")) || undefined) }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin categories list failed", (error as Error).message);
    return fail("The categories could not be loaded. Please try again.", 503);
  }
}
