import { NextResponse } from "next/server";
import { requireSupplierApi } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rateLimit";
import { validateSupplierPersonalUpdate } from "@/lib/supplier/profileRules";
import { getSupplierProfileOverview, updateSupplierPersonal } from "@/lib/supplier/profileService";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const overview = await getSupplierProfileOverview(guard.user.id);
  if (!overview) {
    return NextResponse.json({ ok: false, message: "Supplier profile could not be loaded." }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, data: overview },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function PATCH(request: Request) {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const limit = await rateLimit(`supplier-profile:${guard.user.id}`, 60, 60);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, message: "Too many requests. Please wait." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const check = validateSupplierPersonalUpdate(body, guard.user.email);
  if (!check.ok) {
    return NextResponse.json({ ok: false, message: "Please correct the highlighted errors.", fields: check.fields }, { status: 422 });
  }

  const result = await updateSupplierPersonal(guard.user.id, check.value);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
  }

  return NextResponse.json(
    { ok: true, message: "Your personal details were saved.", data: result.profile },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
