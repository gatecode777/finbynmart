import { NextResponse } from "next/server";
import { buyerGuard, json, PRIVATE } from "@/lib/buyer/api";
import { deleteBuyerDocument, readBuyerDocument } from "@/lib/buyer/profile";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The file of one of the buyer's own company documents, streamed after the ownership check (no signed or permanent URL exists).
 * Someone else's id, an unknown id and a missing file all answer the same 404. Never cached, never embedded elsewhere.
 */
async function handleGET(_request: Request, { params }: Ctx) {
  const guard = await buyerGuard();
  if ("response" in guard) return guard.response;
  const file = await readBuyerDocument(guard.user.id, (await params).id);
  if (!file) return json({ ok: false, message: "Document not found." }, 404);
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      ...PRIVATE,
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function handleDELETE(_request: Request, { params }: Ctx) {
  const guard = await buyerGuard({ key: "buyer-document-delete", limit: 30, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const result = await deleteBuyerDocument(guard.user.id, (await params).id);
  if (result.ok) return json({ ok: true, message: "The document was removed." });
  return result.code === "VERIFIED_LOCKED" ? json({ ok: false, message: "A verified document cannot be removed here. Contact support." }, 409) : json({ ok: false, message: "Document not found." }, 404);
}

export const GET = withApiPerf("GET api/buyer/company/documents/id", handleGET);
export const DELETE = withApiPerf("DELETE api/buyer/company/documents/id", handleDELETE);
