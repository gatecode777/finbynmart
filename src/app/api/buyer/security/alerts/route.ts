import { ObjectId } from "mongodb";
import { fail } from "@/lib/auth/http";
import { buyerGuard, json } from "@/lib/buyer/api";
import { listAlerts } from "@/lib/buyer/security";
import { parseSecurityListQuery } from "@/lib/security/securityRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/buyer/security/alerts?status=all|open&limit=&before=: the alerts raised for real events on this account, newest first (20 a page, 50 at most). */
async function handleGET(request: Request) {
  const guard = await buyerGuard();
  if ("response" in guard) return guard.response;
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const query = parseSecurityListQuery(params);
  if (!query.ok) return fail("Check the page request.", 400, query.fields);
  const status = params.status === undefined || params.status === "" ? "all" : params.status;
  if (status !== "all" && status !== "open") return fail("Check the page request.", 400, { status: "Choose all or open." });
  try {
    const page = await listAlerts(new ObjectId(guard.user.id), { status, limit: query.value.limit, before: query.value.before });
    return json({ ok: true, data: { alerts: page.alerts }, meta: page.meta });
  } catch (error) {
    console.error("buyer security alerts failed", (error as Error).message);
    return json({ ok: false, message: "Alerts could not be loaded." }, 503);
  }
}

export const GET = withApiPerf("GET api/buyer/security/alerts", handleGET);
