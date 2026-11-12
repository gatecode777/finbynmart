import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rateLimit";
import { verifySupplierPhone } from "@/lib/supplier/securityService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

async function handlePOST(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const limit = await rateLimit(`supplier-verify-phone:${guard.user.id}`, 10, 600);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, message: "Too many verification attempts. Please wait a few minutes." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.otp !== "string") {
    return NextResponse.json(
      { ok: false, message: "Invalid verification code payload." },
      { status: 400 }
    );
  }

  const result = await verifySupplierPhone(guard.user.id, {
    otp: body.otp,
    phone: typeof body.phone === "string" ? body.phone : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: result.message });
}

export const POST = withApiPerf("POST api/supplier/security/verify-phone", handlePOST);

