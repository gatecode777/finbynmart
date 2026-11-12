import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { getSupplierSessions } from "@/lib/supplier/securityService";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

async function handleGET() {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const data = await getSupplierSessions(guard.user.id);
  if (!data) {
    return NextResponse.json({ ok: false, message: "Could not retrieve sessions." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data });
}

export const GET = withApiPerf("GET api/supplier/security/sessions", handleGET);

