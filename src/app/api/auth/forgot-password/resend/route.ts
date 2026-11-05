import { handleRecoveryRequest } from "@/lib/auth/recovery";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** POST { email }: asks for another reset link. Same handler, same cooldown and limits as the first request. */
export const POST = withApiPerf("POST api/auth/forgot-password/resend", handleRecoveryRequest);
