import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimitReserved } from "@/lib/security/rateLimit";
import { getSupplierQuotationDetail, parseVersionNumber } from "@/lib/supplier/quotationService";
import { error, failureResponse, limit, readWrite, reply } from "@/lib/supplier/quoteHttp";
import { updateDraft } from "@/lib/supplier/quoteService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/supplier/quotations/<reference>[?version=n]: one quotation of the session's company (current version unless `version` is given).
 * A reference that is unknown, malformed or another supplier's gives the same 404. A malformed `version` is a 400 (checked before any read); an unknown or foreign one is the same 404.
 */
async function handleGET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limit = await rateLimitReserved(`supplier-quotations:${guard.user.id}`, 240, 60);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const { reference } = await context.params;
  const versionText = new URL(request.url).searchParams.get("version");
  const parsed = versionText === null ? undefined : parseVersionNumber(versionText);
  if (parsed === null) return fail("Check the version.", 400, { version: "The version must be a whole number from 1." });
  const version = parsed;
  try {
    const detail = await getSupplierQuotationDetail(guard.context, reference, version);
    if (!detail) return fail("Quotation not found.", 404);
    return NextResponse.json({ ok: true, data: detail }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("supplier quotation detail failed", (error as Error).message);
    return fail("We could not load this quotation.", 503);
  }
}

export const GET = withApiPerf("GET api/supplier/quotations/:reference", handleGET);

/**
 * PATCH /api/supplier/quotations/<reference> { expectedRevision, input } : saves the company's own DRAFT. The revision the editor started from is required;
 * a stale one is a 409 (STALE_REVISION) and nothing is overwritten. A submitted, accepted, rejected, withdrawn or superseded quotation is never edited here
 * (409 NOT_A_DRAFT). Only the allow-listed input fields are read: a status, price total, supplierKey, buyerId or createdBy in the body is ignored.
 */
async function handlePATCH(request: Request, context: { params: Promise<{ reference: string }> }) {
  const read = await readWrite(request);
  if (!read.ok) return read.response;
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;
  const limited = await limit(guard.user.id, "supplier-quote-write", 120, 600, true);
  if (limited) return limited;
  const { reference } = await context.params;
  try {
    const result = await updateDraft(guard.context, guard.user, reference, { expectedRevision: read.body.expectedRevision, input: read.body.input });
    return result.ok ? reply({ ok: true, message: "Draft saved.", data: result.draft }) : failureResponse(result);
  } catch (e) {
    console.error("draft update failed", (e as Error).message);
    return error(503, "We could not save the draft. Nothing was changed. Please try again.");
  }
}

export const PATCH = withApiPerf("PATCH api/supplier/quotations/:reference", handlePATCH);
