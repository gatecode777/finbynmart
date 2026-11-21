import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail } from "@/lib/auth/http";
import { getAdminInquiry } from "@/lib/admin/inquiryService";
import { capsOf } from "@/lib/admin/inquiryApi";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * One inquiry. Each part is behind its own capability: requirement content (inquiries.requirements), supplier responses and quotation summaries (inquiries.responses); the
 * response also carries the viewer's own capability flags and the server-computed state of every administrative action. An unknown or malformed reference is the same 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await requireAdminApi("inquiries.read");
  if ("response" in guard) return guard.response;
  try {
    const detail = await getAdminInquiry((await params).reference, capsOf(guard.permissions));
    if (!detail) return fail("Inquiry not found.", 404);
    return NextResponse.json({ ok: true, data: detail }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin inquiry detail failed", (error as Error).message);
    return fail("This inquiry could not be loaded. Please try again.", 503);
  }
}
