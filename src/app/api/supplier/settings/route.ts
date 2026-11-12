import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { rateLimit } from "@/lib/security/rateLimit";
import { getSupplierSettingsView, updateSupplierSettings } from "@/lib/supplier/settingsService";
import { CHANNELS, PREF_META } from "@/lib/supplier/settingsRules";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

/** Effective personal preferences (account-wide), their revision and what the backend can really deliver. */
export async function GET() {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const view = await getSupplierSettingsView(guard.user.id);
  return NextResponse.json({ ok: true, data: { ...view, scope: "account", capabilities: { channels: CHANNELS, preferences: PREF_META } } }, { headers: NO_STORE });
}

/** Body: expectedRevision plus preference booleans. The user is always the signed-in one; no other id is read. */
export async function PATCH(request: Request) {
  if (isCrossSiteWrite(request)) return fail("Cross-site request refused.", 403);
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limit = await rateLimit(`supplier-settings:${guard.user.id}`, 60, 60);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);

  const body = await readSmallJson(request, 2_000);
  if (!body) return fail("Invalid or oversized request.", 413);
  const { expectedRevision, ...patch } = body;
  if (typeof expectedRevision !== "number" || !Number.isInteger(expectedRevision) || expectedRevision < 0) return fail("expectedRevision is required.", 422);

  const r = await updateSupplierSettings(guard.user.id, expectedRevision, patch);
  if (!r.ok) return fail(r.message, r.status);
  return NextResponse.json({ ok: true, message: "Settings saved.", data: { ...r.view, scope: "account" } }, { headers: NO_STORE });
}
