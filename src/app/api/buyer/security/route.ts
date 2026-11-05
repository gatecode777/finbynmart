import { buyerGuard, json } from "@/lib/buyer/api";
import { getBuyerSecurity } from "@/lib/buyer/profile";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** Account security summary of the signed-in buyer: status, verification flags, last sign-in, last password change. No hashes, tokens or session data. */
async function handleGET() {
  const guard = await buyerGuard();
  if ("response" in guard) return guard.response;
  const security = await getBuyerSecurity(guard.user.id);
  return security ? json({ ok: true, data: { security } }) : json({ ok: false, message: "Not found." }, 404);
}

export const GET = withApiPerf("GET api/buyer/security", handleGET);
