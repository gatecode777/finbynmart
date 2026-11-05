import { buyerGuard, json } from "@/lib/buyer/api";
import { getBuyerProfileOverview } from "@/lib/buyer/profile";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * The four verification states (email, mobile, company, documents) kept apart, plus the next steps derived from them. It only
 * REPORTS: nothing a buyer sends can set a verification state, and there is no buyer route that decides one (reviews belong to
 * an admin process that does not exist yet, which the answer says).
 */
async function handleGET() {
  const guard = await buyerGuard();
  if ("response" in guard) return guard.response;
  const overview = await getBuyerProfileOverview(guard.user.id);
  if (!overview) return json({ ok: false, message: "Not found." }, 404);
  return json({ ok: true, data: { verification: overview.verification, nextSteps: overview.nextSteps } });
}

export const GET = withApiPerf("GET api/buyer/verification", handleGET);
