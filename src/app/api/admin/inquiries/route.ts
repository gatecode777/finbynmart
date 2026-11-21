import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { listAdminInquiries } from "@/lib/admin/inquiryService";
import { parseQueryParams } from "@/lib/admin/inquiryApi";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * Paged list plus counts. Capability inquiries.read, from the account record on the server. Filters are validated allow-lists (source, status group, distribution, search text, dates in
 * the business zone); an unknown value is a 422. Page size defaults to 20 (max 50), newest first with the unique _id as tie-breaker. Scope = capability (the admin model has no narrower scope).
 */
export async function GET(request: Request) {
  const guard = await requireAdminApi("inquiries.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-inquiries:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const sp = new URL(request.url).searchParams;
  const parsed = parseQueryParams((k) => sp.get(k));
  if (!parsed.ok) return NextResponse.json({ ok: false, message: parsed.message, fields: parsed.fields }, { status: 422, headers: NO_STORE });
  try {
    return NextResponse.json({ ok: true, data: await listAdminInquiries(parsed.query) }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin inquiries list failed", (error as Error).message);
    return fail("The inquiries could not be loaded. Please try again.", 503);
  }
}
