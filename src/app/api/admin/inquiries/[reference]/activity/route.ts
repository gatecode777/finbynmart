import { NextResponse } from "next/server";
import { forbiddenResponse, requireAdminApi } from "@/lib/auth/guards";
import { fail } from "@/lib/auth/http";
import { getActivity } from "@/lib/admin/inquiryOps";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/** The restricted administrative log of one inquiry (inquiries.audit, plus inquiries.read), newest first, cursor-paged (20 per page, max 50). The buyer-visible history is part of the inquiry detail, not of this log. */
export async function GET(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await requireAdminApi("inquiries.audit");
  if ("response" in guard) return guard.response;
  if (!guard.permissions.includes("inquiries.read")) return forbiddenResponse();
  const sp = new URL(request.url).searchParams;
  try {
    const page = await getActivity((await params).reference, sp.get("cursor"), Number(sp.get("limit")) || 20);
    if (!page) return fail("Inquiry not found.", 404);
    return NextResponse.json({ ok: true, data: page }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin inquiry activity failed", (error as Error).message);
    return fail("The activity could not be loaded. Please try again.", 503);
  }
}
