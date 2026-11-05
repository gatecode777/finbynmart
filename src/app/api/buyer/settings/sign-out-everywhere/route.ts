import { ObjectId } from "mongodb";
import { bumpSessionVersion } from "@/lib/auth/users";
import { startSession } from "@/lib/auth/session";
import { buyerGuard, json } from "@/lib/buyer/api";
import { notifySignedOutEverywhere } from "@/lib/buyer/notifications";
import { recordProfileEvent } from "@/lib/buyer/profile";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST (no body): signs the buyer out of every device by raising the account's session version, then gives THIS device a
 * fresh cookie so the person stays signed in here. Cookies are stateless, so this is the only session control that exists:
 * there is no device list and nothing can be revoked one device at a time.
 */
async function handlePOST() {
  const guard = await buyerGuard({ key: "buyer-signout-everywhere", limit: 5, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const version = await bumpSessionVersion(new ObjectId(guard.user.id));
  await startSession(guard.user.id, version);
  await recordProfileEvent(new ObjectId(guard.user.id), "SIGNED_OUT_EVERYWHERE", []);
  await notifySignedOutEverywhere(guard.user.id, version);
  return json({ ok: true, message: "You were signed out of every other device. This device stays signed in." });
}

export const POST = withApiPerf("POST api/buyer/settings/sign-out-everywhere", handlePOST);
