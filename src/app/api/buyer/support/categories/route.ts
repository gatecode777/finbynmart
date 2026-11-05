import { NextResponse } from "next/server";
import { requireBuyerApi } from "@/lib/auth/guards";
import { attachmentLimits } from "@/lib/support/ticketService";
import { DESCRIPTION_MAX, DESCRIPTION_MIN, RELATED_TYPES, STATUS_LABEL, SUBJECT_MAX, SUBJECT_MIN, SUPPORT_CATEGORIES, TICKET_STATUSES } from "@/lib/support/ticketRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/buyer/support/categories: the one configuration of the ticket form (categories, what a ticket can be about, the field
 * limits, the attachment limits as currently configured) and the statuses for the filter. Nothing here depends on the buyer, but it
 * is behind the buyer session like the rest of the page.
 */
async function handleGET() {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const limits = attachmentLimits();
  return NextResponse.json(
    {
      ok: true,
      data: {
        categories: SUPPORT_CATEGORIES,
        relatedTypes: RELATED_TYPES,
        statuses: TICKET_STATUSES.map((s) => ({ value: s.toLowerCase(), label: STATUS_LABEL[s] })),
        limits: { subject: { min: SUBJECT_MIN, max: SUBJECT_MAX }, description: { min: DESCRIPTION_MIN, max: DESCRIPTION_MAX }, attachments: { maxFiles: limits.maxFiles, maxMb: limits.maxMb, types: limits.types } },
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiPerf("GET api/buyer/support/categories", handleGET);
