import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { signOutOtherSupplierDevices } from "@/lib/supplier/securityService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

async function handlePOST(request: Request) {
  if (isCrossSiteWrite(request)) {
    return NextResponse.json({ ok: false, message: "Cross-site request not permitted." }, { status: 403 });
  }

  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const limit = await rateLimit(`supplier-revoke-others:${guard.user.id}`, 5, 600);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, message: "Too many sign-out requests. Please wait a few minutes." },
      { status: 429 }
    );
  }

  const result = await signOutOtherSupplierDevices(guard.user.id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: result.count, message: result.message });
}

export const POST = withApiPerf("POST api/supplier/security/sessions/revoke-others", handlePOST);

