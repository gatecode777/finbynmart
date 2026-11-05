import { handleRecoveryRequest } from "@/lib/auth/recovery";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** POST { email }: emails a reset link when an eligible account exists. See lib/auth/recovery.ts for the pipeline and policy. */
export const POST = withApiPerf("POST api/auth/forgot-password", handleRecoveryRequest);
