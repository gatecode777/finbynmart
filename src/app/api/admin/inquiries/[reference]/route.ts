import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail } from "@/lib/auth/http";
import { getAdminInquiry } from "@/lib/admin/inquiryService";

export const dynamic = "force-dynamic";

/** One inquiry. Supplier responses are included only when the account also has inquiries.responses. */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await requireAdminApi("inquiries.read");
  if ("response" in guard) return guard.response;
  const detail = await getAdminInquiry((await params).reference, guard.permissions.includes("inquiries.responses"));
  if (!detail) return fail("Inquiry not found.", 404);
  return NextResponse.json({ ok: true, data: detail }, { headers: { "Cache-Control": "private, no-store" } });
}
