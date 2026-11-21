import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/guards";
import { fail } from "@/lib/auth/http";
import { getCompany } from "@/lib/admin/supplierManagement";
import { supplierCapsOf } from "@/lib/admin/supplierApi";
import { NO_STORE } from "@/lib/admin/inquiryHttp";

export const dynamic = "force-dynamic";

/** One company. Seller links need suppliers.links, restricted contact information suppliers.contacts, the internal suspension reason suppliers.audit; related links appear only with the capability of their destination. An unknown or malformed reference is the same 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const guard = await requireAdminApi("suppliers.read");
  if ("response" in guard) return guard.response;
  try {
    const detail = await getCompany((await params).reference, supplierCapsOf(guard.permissions));
    if (!detail) return fail("Company not found.", 404);
    return NextResponse.json({ ok: true, data: detail }, { headers: NO_STORE });
  } catch (error) {
    console.error("admin supplier detail failed", (error as Error).message);
    return fail("This company could not be loaded. Please try again.", 503);
  }
}
