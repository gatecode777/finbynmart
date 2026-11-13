import { NextResponse } from "next/server";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { requireSupplierApi } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rateLimit";
import { isDocumentType } from "@/lib/buyer/profileRules";
import { listSupplierDocuments, saveSupplierDocument } from "@/lib/supplier/profileService";
import type { SupplierDocumentType } from "@/lib/supplier/profileRules";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const result = await listSupplierDocuments(guard.user.id);
  return NextResponse.json(
    { ok: true, data: result },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  if (isCrossSiteWrite(request)) return NextResponse.json({ ok: false, message: "This request was blocked." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard.response;

  const limit = await rateLimit(`supplier-docs:${guard.user.id}`, 20, 60);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, message: "Too many requests. Please wait." }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, message: "Invalid form submission." }, { status: 400 });

  const file = form.get("file");
  const type = String(form.get("type") ?? "");
  const expiryDate = form.get("expiryDate") ? String(form.get("expiryDate")) : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Please select a file to upload." }, { status: 400 });
  }

  if (!isDocumentType(type)) {
    return NextResponse.json({ ok: false, message: "Invalid document type selected." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await saveSupplierDocument(guard.user.id, {
    documentType: type as SupplierDocumentType,
    filename: file.name,
    bytes,
    expiryDate,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
  }

  return NextResponse.json(
    { ok: true, message: "Document uploaded successfully.", data: result.document },
    { status: 201, headers: { "Cache-Control": "private, no-store" } }
  );
}
