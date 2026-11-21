import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail } from "@/lib/auth/http";
import { getHistory } from "@/lib/verification/service";
import { NO_STORE } from "@/lib/verification/http";

export const dynamic = "force-dynamic";

/** The review history of the company behind one application: every submission revision and decision (verification.read); the audit events (including evidence access) need verification.audit as well. */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await requireAdminApi("verification.read");
  if ("response" in guard) return guard.response;
  try {
    const h = await getHistory((await params).reference, guard.permissions.includes("verification.audit"));
    if (!h) return fail("Application not found.", 404);
    return NextResponse.json({ ok: true, data: h }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin verification history failed", (error as Error).message);
    return fail("The history could not be loaded. Please try again.", 503);
  }
}
