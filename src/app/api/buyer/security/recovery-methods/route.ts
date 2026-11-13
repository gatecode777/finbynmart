import { supportGuard, json } from "@/lib/buyer/api";
import { getRecoveryMethods } from "@/lib/buyer/securitySessions";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/buyer/security/recovery-methods: what can really recover the account (a confirmed email; nothing else exists today), masked. Never a code or a secret. */
async function handleGET() {
  const guard = await supportGuard();
  if ("response" in guard) return guard.response;
  try {
    const methods = await getRecoveryMethods(guard.user.id);
    return methods ? json({ ok: true, data: methods }) : json({ ok: false, message: "Not found." }, 404);
  } catch (error) {
    console.error("buyer recovery methods failed", (error as Error).message);
    return json({ ok: false, message: "Recovery information could not be loaded." }, 503);
  }
}

export const GET = withApiPerf("GET api/buyer/security/recovery-methods", handleGET);
