import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { listCompanies } from "@/lib/admin/supplierManagement";
import { supplierCapsOf } from "@/lib/admin/supplierApi";
import { validateListState } from "@/lib/admin/supplierRules";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/suppliers: paged supplier COMPANIES (capability suppliers.read) with company counts. Filters are validated allow-lists (status, seller mapping, city, sort, search text,
 * page): an unknown value is 422. Default 20 per page (max 50), stable with the unique _id tie-break. Scope = capability (the admin model has no narrower scope). No e-mail, phone or
 * document is in a list row. `?facets=1` adds the city list (first load only).
 */
export async function GET(request: Request) {
  const guard = await requireAdminApi("suppliers.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-suppliers:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const sp = new URL(request.url).searchParams;
  const v = validateListState((k) => sp.get(k));
  if (!v.ok) return NextResponse.json({ ok: false, message: "Check the filters.", fields: v.fields }, { status: 422, headers: NO_STORE });
  try {
    return NextResponse.json({ ok: true, data: await listCompanies(v.state, supplierCapsOf(guard.permissions), Number(sp.get("limit")) || undefined, sp.get("facets") === "1") }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin suppliers list failed", (error as Error).message);
    return fail("The suppliers could not be loaded. Please try again.", 503);
  }
}
