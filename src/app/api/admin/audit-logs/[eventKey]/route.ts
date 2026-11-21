import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { getAuditEvent } from "@/lib/admin/auditLogs";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audit-logs/<eventKey> (capability audit.read plus the event's own domain capability). READ-ONLY. Unknown, malformed and out-of-scope event keys are the same 404, so an event the
 * administrator may not see cannot be probed. The DTO is built from an allowlist (never the raw document); related-record links appear only when that record's own permission is held.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ eventKey: string }> }) {
  const guard = await requireAdminApi("audit.read");
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-audit:${guard.user.id}`, 240, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  try {
    const data = await getAuditEvent((await params).eventKey, guard.permissions);
    return data ? NextResponse.json({ ok: true, data }, { headers: NO_STORE }) : NextResponse.json({ ok: false, message: "Event not found." }, { status: 404, headers: NO_STORE });
  } catch (error) {
    console.error("admin audit read failed", (error as Error).message);
    return fail("The event could not be loaded. Please try again.", 503);
  }
}
