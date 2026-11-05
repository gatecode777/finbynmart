import { fail, readSmallJson } from "@/lib/auth/http";
import { buyerGuard, json } from "@/lib/buyer/api";
import { getBuyerSettings, saveBuyerSettings } from "@/lib/buyer/settings";
import { recordProfileEvent } from "@/lib/buyer/profile";
import { validateSettings } from "@/lib/buyer/settingsRules";
import { withApiPerf } from "@/lib/perf/instrument";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

/** GET: the signed-in buyer's settings (the defaults, version 0, when they never saved). The buyer comes from the session only. */
async function handleGET() {
  const guard = await buyerGuard();
  if ("response" in guard) return guard.response;
  return json({ ok: true, data: { settings: await getBuyerSettings(guard.user.id) } });
}

/**
 * PATCH the whole settings object with the `version` the form loaded. Unknown keys (including `buyerId`) and the required
 * `account` notification category are refused; a stale version is a 409 and nothing changes.
 */
async function handlePATCH(request: Request) {
  const guard = await buyerGuard({ key: "buyer-settings-write", limit: 30, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 1_000);
  if (!body) return fail("Invalid request.");
  const checked = validateSettings(body);
  if (!checked.ok) return json({ ok: false, message: "Check the highlighted fields.", fields: checked.fields }, 400);
  const { version, ...value } = checked.value;
  const saved = await saveBuyerSettings(guard.user.id, value, version);
  if (!saved.ok) return json({ ok: false, code: "CONFLICT", message: "Your settings were changed somewhere else since you opened this page. Reload the page to see the latest and try again." }, 409);
  await recordProfileEvent(new ObjectId(guard.user.id), "SETTINGS_UPDATED", ["notifications", "dashboardRange"]);
  return json({ ok: true, message: "Your settings were saved.", data: { settings: saved.settings } });
}

export const GET = withApiPerf("GET api/buyer/settings", handleGET);
export const PATCH = withApiPerf("PATCH api/buyer/settings", handlePATCH);
