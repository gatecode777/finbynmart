import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { listAuditEvents } from "@/lib/admin/auditLogs";
import { validateQuery } from "@/lib/admin/auditRules";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audit-logs?action=&q=&from=&to=&cursor=&limit= : READ-ONLY (capability audit.read). Only events whose action the administrator may see are returned: audit.read PLUS that action's domain
 * capability, resolved on every request, so hidden events are absent from rows, the action options and the next-page cursor. The action must be in the trusted registry; the search must be a plain
 * target reference; dates are Asia/Kolkata calendar days (default last 30, at most 366, not future); unknown parameters, bad cursors and limits are a 422. Newest first by recorded time then id;
 * keyset cursor; no totals are claimed. Private, no-store. Nothing is written, and reading creates no audit event.
 */
export async function GET(request: Request) {
  const guard = await requireAdminApi("audit.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-audit:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const sp = new URL(request.url).searchParams;
  const q = validateQuery((k) => sp.get(k), sp.keys());
  if (!q.ok) return NextResponse.json({ ok: false, message: "Check the filters.", fields: q.fields }, { status: 422, headers: NO_STORE });
  try {
    return NextResponse.json({ ok: true, data: await listAuditEvents(guard.permissions, q.value) }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin audit list failed", (error as Error).message);
    return fail("The audit history could not be loaded. Please try again.", 503);
  }
}
