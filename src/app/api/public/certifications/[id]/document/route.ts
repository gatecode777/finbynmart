import { NextResponse } from "next/server";
import { apiError, limitedResponse } from "@/lib/certifications/publicApi";
import { getPublicCertificateDocument } from "@/lib/certifications/store";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/certifications/<id>/document[?download=1]: streams the certificate file after the record passed every
 * check (exists, approved, not deleted, supplier public, public access explicitly allowed, file readable and really a
 * PDF or image). No storage location is ever returned. Unknown, unapproved and not-shared records all get the same 404.
 */
async function handleGET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await limitedResponse(request, "public-certificate-documents", 60);
  if (limited) return limited;

  const { id } = await params;
  try {
    const result = await getPublicCertificateDocument(id);
    if (result.status === "not_found") return apiError(404, "NOT_FOUND", "That document is not available.");
    if (result.status === "unavailable") return apiError(503, "DOCUMENT_UNAVAILABLE", "This document is temporarily unavailable. Please try again later.");

    const download = new URL(request.url).searchParams.get("download") === "1";
    const fileName = `${result.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "certificate"}.${result.extension === "jpeg" ? "jpg" : result.extension}`;
    return new NextResponse(new Uint8Array(result.bytes), {
      headers: {
        "Content-Type": result.mime,
        "Content-Length": String(result.bytes.length),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        // Public, but never stored by shared caches: a record can be suspended at any time.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("certificate document failed", error);
    return apiError(500, "SERVER_ERROR", "The document could not be loaded right now. Please try again.");
  }
}

export const GET = withApiPerf("GET api/public/certifications/:id/document", handleGET);
