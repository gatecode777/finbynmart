import { NextResponse } from "next/server";
import { forbiddenResponse, requireAdminApi } from "@/lib/auth/guards";
import { fail } from "@/lib/auth/http";
import { getActivity } from "@/lib/admin/categoryManagement";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/** Administrative activity of one category's branch (categories.audit plus categories.read), newest first, cursor-paged (20 per page, max 50). */
export async function GET(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await requireAdminApi("categories.audit");
  if ("response" in guard) return guard.response;
  if (!guard.permissions.includes("categories.read")) return forbiddenResponse();
  const sp = new URL(request.url).searchParams;
  try {
    const page = await getActivity((await params).reference, sp.get("cursor"), Number(sp.get("limit")) || 20);
    if (!page) return fail("Category not found.", 404);
    return NextResponse.json({ ok: true, data: page }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin category activity failed", (error as Error).message);
    return fail("The activity could not be loaded. Please try again.", 503);
  }
}
