import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { listAdminInquiries } from "@/lib/admin/inquiryService";
import { GROUP_KEYS, type AdminStatusGroup } from "@/lib/admin/inquiryRules";
import { defaultRange, parseRange } from "@/lib/supplier/analyticsRules";

export const dynamic = "force-dynamic";

/** Paged list plus status-group counts. Capability inquiries.read, from the account record on the server. Dates are business-zone days. */
export async function GET(request: Request) {
  const guard = await requireAdminApi("inquiries.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-inquiries:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const sp = new URL(request.url).searchParams;
  const d = defaultRange();
  const parsed = parseRange(sp.get("start") ?? d.startDay, sp.get("end") ?? d.endDay);
  if (!parsed.ok) return fail(parsed.message, 422);
  const group = GROUP_KEYS.includes(sp.get("group") ?? "") ? (sp.get("group") as AdminStatusGroup) : "all";
  const data = await listAdminInquiries({ q: sp.get("q") ?? undefined, group, range: parsed.range, page: Number(sp.get("page")) || 1, limit: Number(sp.get("limit")) || undefined });
  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
}
