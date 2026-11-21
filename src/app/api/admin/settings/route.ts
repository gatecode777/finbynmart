import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAnyAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { ADMIN_CAPABILITIES } from "@/lib/admin/permissions";
import { getAccount } from "@/lib/admin/settings";
import { getPreferences } from "@/lib/admin/notifications";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/settings: the SESSION administrator's own settings (any administrator account that can enter the admin portal; no particular capability is implied or granted). The account is
 * selected only by the verified session; no id parameter exists. Safe fields only: display name, sign-in e-mail, role label, the categories they may see with their personal on/off state, and
 * which security functions exist. Private, no-store; nothing is written.
 */
export async function GET() {
  const guard = await requireAnyAdminApi(ADMIN_CAPABILITIES);
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`admin-settings:${guard.user.id}`, 120, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  try {
    const admin = new ObjectId(guard.user.id);
    const account = await getAccount(admin);
    if (!account) return NextResponse.json({ ok: false, message: "Account not found." }, { status: 404, headers: NO_STORE });
    return NextResponse.json({ ok: true, data: { account, notifications: { categories: guard.permissions.includes("notifications.read") ? await getPreferences(admin, guard.permissions) : [] }, security: { passwordChange: true, passwordResetPath: "/forgot-password", sessionManagement: false, twoStep: false } } }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin settings read failed", (error as Error).message);
    return fail("Your settings could not be loaded. Please try again.", 503);
  }
}
