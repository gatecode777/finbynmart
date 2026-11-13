import { ObjectId } from "mongodb";
import { fail } from "@/lib/auth/http";
import { supportGuard, json } from "@/lib/buyer/api";
import { listSecurityEvents } from "@/lib/security/securityEvents";
import { LOGIN_ACTIVITY_TYPES, parseSecurityListQuery } from "@/lib/security/securityRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/security/login-activity?limit=&before=&range=7d|30d|90d|all: the buyer's recorded sign-ins, failed sign-in attempts and sign-outs,
 * newest first, 20 a page (50 at most). History starts when recording began: nothing earlier is invented. No IP address, password or raw
 * User-Agent is stored or returned; the region is not recorded.
 */
async function handleGET(request: Request) {
  const guard = await supportGuard();
  if ("response" in guard) return guard.response;
  const query = parseSecurityListQuery(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.ok) return fail("Check the page request.", 400, query.fields);
  try {
    const page = await listSecurityEvents(new ObjectId(guard.user.id), LOGIN_ACTIVITY_TYPES, query.value);
    return json({ ok: true, data: { events: page.events }, meta: page.meta });
  } catch (error) {
    console.error("buyer login activity failed", (error as Error).message);
    return json({ ok: false, message: "Login activity could not be loaded." }, 503);
  }
}

export const GET = withApiPerf("GET api/buyer/security/login-activity", handleGET);
