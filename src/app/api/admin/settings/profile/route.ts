import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAnyAdminApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { ADMIN_CAPABILITIES } from "@/lib/admin/permissions";
import { updateDisplayName } from "@/lib/admin/settings";
import { validateProfileBody } from "@/lib/admin/settingsRules";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/settings/profile { name }: changes the SESSION administrator's display name and nothing else. The body is an allowlist of one field: an e-mail, role, permission, status, id or any
 * other key is a 422 naming it. Cross-site writes are refused first; rate limited; success is reported only after the transaction committed.
 */
export async function PATCH(request: Request) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAnyAdminApi(ADMIN_CAPABILITIES);
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-settings-write:${guard.user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const body = await readSmallJson(request, 1_000);
  if (!body) return fail("Invalid or oversized request.", 413);
  const v = validateProfileBody(body);
  if (!v.ok) return NextResponse.json({ ok: false, message: "Check the highlighted field.", fields: v.fields }, { status: 422, headers: NO_STORE });
  try {
    const r = await updateDisplayName(new ObjectId(guard.user.id), v.name);
    return r.ok ? NextResponse.json({ ok: true, message: r.changed ? "Your display name was saved." : "Nothing to save: that is already your display name.", data: { name: r.name, changed: r.changed } }, { headers: NO_STORE }) : NextResponse.json({ ok: false, message: "Account not found." }, { status: 404, headers: NO_STORE });
  } catch (error) {
    console.error("admin display name update failed", (error as Error).message);
    return fail("Your display name could not be saved. Nothing was changed. Please try again.", 503);
  }
}
