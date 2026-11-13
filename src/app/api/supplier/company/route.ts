import { NextResponse } from "next/server";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { requireSupplierApi } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rateLimit";
import { validateSupplierCompany } from "@/lib/supplier/profileRules";
import { getSupplierProfileOverview, updateSupplierCompanyProfile } from "@/lib/supplier/profileService";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const overview = await getSupplierProfileOverview(guard.user.id);
  if (!overview) {
    return NextResponse.json({ ok: false, message: "Company profile could not be loaded." }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, data: { company: overview.company, overview } },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function PATCH(request: Request) {
  if (isCrossSiteWrite(request)) return NextResponse.json({ ok: false, message: "This request was blocked." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const limit = await rateLimit(`supplier-company:${guard.user.id}`, 60, 60);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, message: "Too many requests. Please wait." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const check = validateSupplierCompany(body);
  if (!check.ok) {
    return NextResponse.json({ ok: false, message: "Please correct the highlighted errors.", fields: check.fields }, { status: 422 });
  }

  const result = await updateSupplierCompanyProfile(guard.user.id, check.value);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
  }

  return NextResponse.json(
    { ok: true, message: "Company details were saved successfully.", data: result.company },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
