import { handleQuotationAction } from "@/lib/quotations/http";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** POST /api/buyer/quotations/<reference>/reject { version, confirm: true, reason? }: the buyer rejects the current version. Other quotations are not touched; nothing is deleted. */
export const POST = withApiPerf("POST api/buyer/quotations/:reference/reject", (request: Request, context: { params: Promise<{ reference: string }> }) => handleQuotationAction(request, context.params, "reject"));
