import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { listStaffTickets } from "@/lib/admin/supportStaff";

export const dynamic = "force-dynamic";

/** Tickets, newest activity first, 20 per page. Capability support.manage. No requester e-mail or phone is returned. */
export async function GET(request: Request) {
  const guard = await requireAdminApi("support.manage");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-support-read:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const sp = new URL(request.url).searchParams;
  const data = await listStaffTickets({ status: sp.get("status") ?? undefined, page: Number(sp.get("page")) || 1 });
  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
}
