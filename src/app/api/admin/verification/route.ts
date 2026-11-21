import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { listSubmissions } from "@/lib/verification/service";
import { parseQueueState } from "@/lib/verification/rules";
import { NO_STORE } from "@/lib/verification/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/verification: the review queue (capability verification.read). One row per COMPANY: its latest submission. Filters are validated allow-lists (status, dates, search text,
 * page; an unknown value is 422). Default 20 per page (max 50), newest submission first with the unique _id tie-break. Counts ride the same response (companies or applications are stated
 * in the DTO). A row carries the submitted company name and city only: no evidence, no file, no note. Scope = capability (the admin model has no narrower scope).
 */
export async function GET(request: Request) {
  const guard = await requireAdminApi("verification.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-verification:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const sp = new URL(request.url).searchParams;
  const v = parseQueueState((k) => sp.get(k));
  if (!v.ok) return NextResponse.json({ ok: false, message: "Check the filters.", fields: v.fields }, { status: 422, headers: NO_STORE });
  try {
    return NextResponse.json({ ok: true, data: await listSubmissions(v.state, Number(sp.get("limit")) || undefined) }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin verification list failed", (error as Error).message);
    return fail("The applications could not be loaded. Please try again.", 503);
  }
}
