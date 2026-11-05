import { fail } from "@/lib/auth/http";
import { requireBuyerApi } from "@/lib/auth/guards";
import { json } from "@/lib/buyer/api";
import { parsePageQuery } from "@/lib/support/conversationRules";
import { listBuyerFiles } from "@/lib/support/conversationService";
import { TICKET_REFERENCE_PATTERN } from "@/lib/support/ticketRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/** GET /api/buyer/support/tickets/<ref>/attachments?limit=&after=: file names, sizes, who sent them and an owner-checked download link (never a storage path). */
async function handleGET(request: Request, { params }: { params: Promise<{ ticketReference: string }> }) {
  const guard = await requireBuyerApi();
  if ("response" in guard) return guard.response;
  const { ticketReference } = await params;
  if (!TICKET_REFERENCE_PATTERN.test(ticketReference)) return fail("That ticket was not found.", 404);
  const query = parsePageQuery(Object.fromEntries(new URL(request.url).searchParams.entries()), "after");
  if (!query.ok) return fail("Check the page request.", 400, query.fields);
  try {
    const page = await listBuyerFiles(guard.user.id, ticketReference, query.value);
    return page ? json({ ok: true, data: { files: page.files }, meta: page.meta }) : fail("That ticket was not found.", 404);
  } catch (error) {
    console.error("buyer ticket files read failed", (error as Error).message);
    return fail("We couldn't load the files.", 503);
  }
}

export const GET = withApiPerf("GET api/buyer/support/tickets/:ticketReference/attachments", handleGET);
