import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rateLimit";
import { verifySupplierEmail } from "@/lib/supplier/securityService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

async function handlePOST() {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const limit = await rateLimit(`supplier-verify-email:${guard.user.id}`, 10, 600);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, message: "Too many verification requests. Please wait a few minutes." },
      { status: 429 }
    );
  }

  const result = await verifySupplierEmail(guard.user.id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: result.message });
}

export const POST = withApiPerf("POST api/supplier/security/verify-email", handlePOST);

