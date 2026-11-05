import { handleQuotationAction } from "@/lib/quotations/http";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * POST /api/buyer/quotations/<reference>/accept { version, confirm: true }: the buyer accepts the CURRENT version they were looking at.
 * Allowed only while it is open and valid, and only if no other quotation of the same inquiry is already accepted (the database
 * enforces that too). It records the decision; it creates no order and charges nothing (no order or payment module exists).
 */
export const POST = withApiPerf("POST api/buyer/quotations/:reference/accept", (request: Request, context: { params: Promise<{ reference: string }> }) => handleQuotationAction(request, context.params, "accept"));
