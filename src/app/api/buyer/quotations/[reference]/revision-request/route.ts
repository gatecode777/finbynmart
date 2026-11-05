import { handleQuotationAction } from "@/lib/quotations/http";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** POST /api/buyer/quotations/<reference>/revision-request { version, reason, message }: the buyer asks for a revision of the current version. The quotation itself is never edited. */
export const POST = withApiPerf("POST api/buyer/quotations/:reference/revision-request", (request: Request, context: { params: Promise<{ reference: string }> }) => handleQuotationAction(request, context.params, "revision"));
