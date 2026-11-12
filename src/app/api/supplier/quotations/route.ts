import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimitReserved } from "@/lib/security/rateLimit";
import { parseSupplierQuery } from "@/lib/supplier/quotationRules";
import { listSupplierQuotations } from "@/lib/supplier/quotationService";
import { error, failureResponse, limit, readWrite, reply } from "@/lib/supplier/quoteHttp";
import { createDraft } from "@/lib/supplier/quoteService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/supplier/quotations?q=&status=all|drafts|submitted|accepted|rejected|expired&range=&startDate=&endDate=&dateBasis=created|sent|updated
 *   &validity=active|expiring|expired&currency=INR&sort=newest|oldest|updated|valid&page=&limit=
 * The quotations of the company the SESSION's account owns (current version of each; a companyId, supplierId or buyerId parameter is never read).
 * `data` carries the six lifetime summary numbers, the tab counts under the active search and filters, the currencies in use and the capabilities
 * (what is genuinely unavailable says why). 401 without a session, 403 for a non-supplier or an inactive company. Private, never cached.
 */
async function handleGET(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limit = await rateLimitReserved(`supplier-quotations:${guard.user.id}`, 240, 60);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const query = parseSupplierQuery(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.ok) return fail("Check the filters.", 400, query.fields);
  try {
    const page = await listSupplierQuotations(guard.context, query.value);
    return NextResponse.json(
      { ok: true, quotations: page.quotations, data: { summary: page.summary, tabCounts: page.tabCounts, currencies: page.currencies, capabilities: page.capabilities, noSellers: page.noSellers }, meta: page.meta },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("supplier quotations read failed", (error as Error).message);
    return fail("We could not load your quotations.", 503);
  }
}

export const GET = withApiPerf("GET api/supplier/quotations", handleGET);

/**
 * POST /api/supplier/quotations { inquiryReference, input? } : creates a DRAFT for one of the company's eligible inquiries (201), or returns the draft that
 * already exists for that inquiry (200, `created: false`). The seller, buyer and inquiry come from the inquiry record in the database; the supplier company
 * from the session. Any supplierKey, buyerId, status, totals or createdBy in the body is ignored. 404 for an inquiry that is not the company's, 409 when it
 * can no longer be quoted or a quotation was already submitted for it, 422 for invalid fields, 413 for a large body.
 */
async function handlePOST(request: Request) {
  const read = await readWrite(request);
  if (!read.ok) return read.response;
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-quote-write", 120, 600, true);
  if (limited) return limited;
  try {
    const result = await createDraft(guard.context, guard.user, { inquiryReference: read.body.inquiryReference, input: read.body.input });
    if (!result.ok) return failureResponse(result);
    return reply({ ok: true, message: result.created ? "Draft saved." : "A draft already exists for this inquiry.", data: { ...result.draft, created: result.created } }, result.created ? 201 : 200);
  } catch (e) {
    console.error("draft create failed", (e as Error).message);
    return error(503, "We could not save the draft. Nothing was created. Please try again.");
  }
}

export const POST = withApiPerf("POST api/supplier/quotations", handlePOST);
