import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { listBuyers } from "@/lib/admin/buyerManagement";
import { validateListState } from "@/lib/admin/buyerRules";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/buyers?q=&status=&page=&limit= : paged buyer ACCOUNTS (capability buyers.read). Filters are validated: an unknown status, page or limit is a 422. Search is the buyer's name
 * (starts with) or an account reference only; no e-mail or phone search exists. Newest account first with the unique _id as tie-break; 20 per page (max 50). A row holds name, reference,
 * status and joined date only: no contact detail, token, hash or session data.
 */
export async function GET(request: Request) {
  const guard = await requireAdminApi("buyers.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-buyers:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const sp = new URL(request.url).searchParams;
  const v = validateListState((k) => sp.get(k));
  if (!v.ok) return NextResponse.json({ ok: false, message: "Check the filters.", fields: v.fields }, { status: 422, headers: NO_STORE });
  try {
    return NextResponse.json({ ok: true, data: await listBuyers(v.state, Number(sp.get("limit")) || undefined) }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin buyers list failed", (error as Error).message);
    return fail("The buyers could not be loaded. Please try again.", 503);
  }
}
