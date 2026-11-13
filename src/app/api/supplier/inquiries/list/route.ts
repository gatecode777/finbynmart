import { NextResponse } from "next/server";
import { requireSupplierApi, forbiddenResponse } from "@/lib/auth/guards";
import { tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { listSupplierInbox } from "@/lib/supplier/inquiryListService";

export const dynamic = "force-dynamic";

/** GET /api/supplier/inquiries/list?q=&tab=&page=&limit= : the complete inbox (not the quotation picker at /api/supplier/inquiries). */
export async function GET(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  if (!guard.context.permissions.viewInquiries) return forbiddenResponse();
  const limit = await rateLimit(`supplier-inbox:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const sp = new URL(request.url).searchParams;
  const data = await listSupplierInbox(guard.context, { q: sp.get("q") ?? undefined, tab: sp.get("tab") ?? undefined, kind: sp.get("kind") ?? undefined, page: Number(sp.get("page")) || 1, limit: Number(sp.get("limit")) || undefined });
  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
}
