import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail } from "@/lib/auth/http";
import { getCategory } from "@/lib/admin/categoryManagement";
import { categoryCapsOf } from "@/lib/admin/categoryApi";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/** One category with its path, children and the impact summary of changing its activation (the internal reason needs categories.audit). The reference is the node id with "/" written as "~"; anything else is the same 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await requireAdminApi("categories.read");
  if ("response" in guard) return guard.response;
  try {
    const detail = await getCategory((await params).reference, categoryCapsOf(guard.permissions));
    if (!detail) return fail("Category not found.", 404);
    return NextResponse.json({ ok: true, data: detail }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin category detail failed", (error as Error).message);
    return fail("This category could not be loaded. Please try again.", 503);
  }
}
