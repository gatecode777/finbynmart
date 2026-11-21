import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { forbiddenResponse, requireAnyAdminApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { ADMIN_CAPABILITIES } from "@/lib/admin/permissions";
import { savePreferences } from "@/lib/admin/notifications";
import { validatePreferencesBody } from "@/lib/admin/settingsRules";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/settings/notifications { categories: [keys to SHOW] }: the SESSION administrator's personal inbox preference (needs notifications.read). Only categories whose capability the administrator
 * holds now may be named (anything else is a 422: a preference never grants access); categories the administrator does not hold are left as they were. Nothing is deleted or marked read; events
 * keep being recorded. Cross-site writes are refused first; success is reported only after the preference was stored.
 */
export async function PATCH(request: Request) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireAnyAdminApi(ADMIN_CAPABILITIES);
  if ("response" in guard) return guard.response;
  if (!guard.permissions.includes("notifications.read")) return forbiddenResponse();
  const limit = await rateLimit(`admin-settings-write:${guard.user.id}`, 30, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const body = await readSmallJson(request, 1_000);
  if (!body) return fail("Invalid or oversized request.", 413);
  const v = validatePreferencesBody(body);
  if (!v.ok) return NextResponse.json({ ok: false, message: "Check the request.", fields: v.fields }, { status: 422, headers: NO_STORE });
  try {
    const r = await savePreferences(new ObjectId(guard.user.id), guard.permissions, v.categories);
    return r.ok ? NextResponse.json({ ok: true, message: "Your notification preferences were saved.", data: { categories: r.categories, unreadCount: r.unreadCount } }, { headers: NO_STORE }) : NextResponse.json({ ok: false, message: "Check the request.", fields: r.fields }, { status: 422, headers: NO_STORE });
  } catch (error) {
    console.error("admin notification preferences failed", (error as Error).message);
    return fail("Your preferences could not be saved. Nothing was changed. Please try again.", 503);
  }
}
