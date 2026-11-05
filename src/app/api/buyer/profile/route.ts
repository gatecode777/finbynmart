import { fail, readSmallJson } from "@/lib/auth/http";
import { buyerGuard, conflictResponse, json } from "@/lib/buyer/api";
import { getBuyerProfileOverview, getBuyerUser, updateBuyerProfile } from "@/lib/buyer/profile";
import { validatePersonalUpdate } from "@/lib/buyer/profileRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET: the signed-in buyer's profile, completion and next steps. The buyer is the session; no id is read from the request. */
async function handleGET() {
  const guard = await buyerGuard();
  if ("response" in guard) return guard.response;
  const overview = await getBuyerProfileOverview(guard.user.id);
  if (!overview) return json({ ok: false, message: "Not found." }, 404);
  return json({ ok: true, data: { profile: overview.profile, completion: overview.completion, nextSteps: overview.nextSteps } });
}

/**
 * PATCH: an explicit allowlist (name, designation, alternate phone, alternate email) plus the `version` the form loaded.
 * Role, status, verification flags, the primary email and mobile number and every id are refused, not ignored.
 * A stale version is a 409 (someone, perhaps another tab, saved first).
 */
async function handlePATCH(request: Request) {
  const guard = await buyerGuard({ key: "buyer-profile-write", limit: 30, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const body = await readSmallJson(request, 4_000);
  if (!body) return fail("Invalid request.");
  const user = await getBuyerUser(guard.user.id);
  if (!user) return json({ ok: false, message: "Not found." }, 404);
  const checked = validatePersonalUpdate(body, user.email);
  if (!checked.ok) return json({ ok: false, message: "Check the highlighted fields.", fields: checked.fields }, 400);
  const result = await updateBuyerProfile(guard.user.id, checked.value);
  if (!result.ok) return conflictResponse(result.code);
  return json({ ok: true, message: "Your details were saved.", data: { profile: result.profile } });
}

export const GET = withApiPerf("GET api/buyer/profile", handleGET);
export const PATCH = withApiPerf("PATCH api/buyer/profile", handlePATCH);
