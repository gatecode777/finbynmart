import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rateLimit";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { revokeSupplierSession } from "@/lib/supplier/securityService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

async function handleDELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  if (isCrossSiteWrite(request)) {
    return NextResponse.json({ ok: false, message: "Cross-site request not permitted." }, { status: 403 });
  }

  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const { id } = await props.params;
  if (!id) {
    return NextResponse.json({ ok: false, message: "Missing session ID." }, { status: 400 });
  }

  const limit = await rateLimit(`supplier-revoke-session:${guard.user.id}`, 20, 600);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, message: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }

  const result = await revokeSupplierSession(guard.user.id, id);
  if (!result.ok) {
    const status = result.code === "CURRENT_SESSION" ? 400 : result.code === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, message: result.message }, { status });
  }

  return NextResponse.json({ ok: true, message: result.message });
}

export const DELETE = withApiPerf("DELETE api/supplier/security/sessions/[id]", handleDELETE);

