import { ObjectId } from "mongodb";
import { fail } from "@/lib/auth/http";
import { supportGuard, json } from "@/lib/buyer/api";
import { listSecurityEvents } from "@/lib/security/securityEvents";
import { SECURITY_EVENT_TYPES, parseSecurityListQuery } from "@/lib/security/securityRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/buyer/security/events?limit=&before=&range=: the one security timeline of the buyer's account (sign-ins, failures, sign-outs, password changes and resets, revoked devices, alerts), newest first. */
async function handleGET(request: Request) {
  const guard = await supportGuard();
  if ("response" in guard) return guard.response;
  const query = parseSecurityListQuery(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.ok) return fail("Check the page request.", 400, query.fields);
  try {
    const page = await listSecurityEvents(new ObjectId(guard.user.id), SECURITY_EVENT_TYPES, query.value);
    return json({ ok: true, data: { events: page.events }, meta: page.meta });
  } catch (error) {
    console.error("buyer security events failed", (error as Error).message);
    return json({ ok: false, message: "Security events could not be loaded." }, 503);
  }
}

export const GET = withApiPerf("GET api/buyer/security/events", handleGET);
