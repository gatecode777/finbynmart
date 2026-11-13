import { NextResponse } from "next/server";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { requireSupplierApi } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rateLimit";
import { deleteSupplierDocument } from "@/lib/supplier/profileService";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isCrossSiteWrite(_request)) return NextResponse.json({ ok: false, message: "This request was blocked." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const limit = await rateLimit(`supplier-docs-del:${guard.user.id}`, 20, 60);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, message: "Too many requests. Please wait." }, { status: 429 });
  }

  const result = await deleteSupplierDocument(guard.user.id, id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
  }

  return NextResponse.json(
    { ok: true, message: "Document removed." },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
