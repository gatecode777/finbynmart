import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { getAdminQuotation } from "@/lib/admin/quotationManagement";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/quotations/<reference> : READ-ONLY detail of one current submitted quotation (capability quotations.read; the requirement link is added only with inquiries.read).
 * Unknown, malformed and draft-only references give the same 404. No draft working copy, buyer message, buyer reason, contact detail, attachment or credential is selected.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await requireAdminApi("quotations.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-quotations:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  try {
    const data = await getAdminQuotation((await params).reference, { inquiries: guard.permissions.includes("inquiries.read") });
    return data ? NextResponse.json({ ok: true, data }, { headers: NO_STORE }) : NextResponse.json({ ok: false, message: "Quotation not found." }, { status: 404, headers: NO_STORE });
  } catch (error) {
    console.error("admin quotation read failed", (error as Error).message);
    return fail("The quotation could not be loaded. Please try again.", 503);
  }
}
