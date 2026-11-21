import { NextResponse } from "next/server";
import { forbiddenResponse, requireAdminApi } from "@/lib/auth/guards";
import { fail } from "@/lib/auth/http";
import { getRecipients } from "@/lib/admin/inquiryOps";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/** Authorized recipient inspection (inquiries.recipients, plus inquiries.read): DIRECT shown from the inquiry itself, MATCHED from recipient rows, one row per company. The routing candidates are included only with inquiries.routing. */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await requireAdminApi("inquiries.recipients");
  if ("response" in guard) return guard.response;
  if (!guard.permissions.includes("inquiries.read")) return forbiddenResponse();
  try {
    const view = await getRecipients((await params).reference, { routing: guard.permissions.includes("inquiries.routing") });
    if (!view) return fail("Inquiry not found.", 404);
    return NextResponse.json({ ok: true, data: view }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin inquiry recipients failed", (error as Error).message);
    return fail("The recipients could not be loaded. Please try again.", 503);
  }
}
