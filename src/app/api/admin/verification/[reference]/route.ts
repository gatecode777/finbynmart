import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail } from "@/lib/auth/http";
import { getSubmission } from "@/lib/verification/service";
import { verificationCapsOf } from "@/lib/verification/caps";
import { NO_STORE } from "@/lib/verification/http";

export const dynamic = "force-dynamic";

/** One submitted application: the exact revision the supplier submitted. Evidence metadata needs verification.documents, internal notes verification.notes or verification.audit. An unknown or malformed reference is the same 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await requireAdminApi("verification.read");
  if ("response" in guard) return guard.response;
  try {
    const detail = await getSubmission((await params).reference, verificationCapsOf(guard.permissions));
    if (!detail) return fail("Application not found.", 404);
    return NextResponse.json({ ok: true, data: detail }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin verification detail failed", (error as Error).message);
    return fail("This application could not be loaded. Please try again.", 503);
  }
}
