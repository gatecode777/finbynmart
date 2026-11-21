import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { getBuyer } from "@/lib/admin/buyerManagement";
import { buyerCapsOf } from "@/lib/admin/buyerApi";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/buyers/<id> (capability buyers.read): one buyer account. Unknown, malformed and non-buyer ids (a supplier or admin account) all give the same 404. E-mail and phone are masked
 * on the server unless the administrator has buyers.contacts; password hash, tokens, session data and documents are never selected.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi("buyers.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-buyers:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  try {
    const data = await getBuyer((await params).id, buyerCapsOf(guard.permissions));
    return data ? NextResponse.json({ ok: true, data }, { headers: NO_STORE }) : NextResponse.json({ ok: false, message: "Buyer not found." }, { status: 404, headers: NO_STORE });
  } catch (error) {
    console.error("admin buyer read failed", (error as Error).message);
    return fail("The buyer could not be loaded. Please try again.", 503);
  }
}
