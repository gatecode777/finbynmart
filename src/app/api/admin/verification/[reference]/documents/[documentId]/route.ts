import { ObjectId } from "mongodb";
import { forbiddenResponse, requireAdminApi } from "@/lib/auth/guards";
import { fail, tooMany } from "@/lib/auth/http";
import { rateLimit } from "@/lib/security/rateLimit";
import { openEvidence } from "@/lib/verification/service";

export const dynamic = "force-dynamic";

/**
 * GET: one private evidence file of one submission (verification.documents plus verification.read), re-authorized on every request. The document must belong to that submission, the stored bytes must
 * still match the hash recorded at submission, and the access is audited before any byte is sent. Streamed through the server as an attachment (never rendered inline), never cached, no public or
 * long-lived link exists, so there is no already-issued link to revoke. Anything else (unknown reference, a document of another submission, a malformed id) is the same 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string; documentId: string }> }) {
  const guard = await requireAdminApi("verification.documents");
  if ("response" in guard) return guard.response;
  if (!guard.permissions.includes("verification.read")) return forbiddenResponse();
  const limit = await rateLimit(`admin-verification-doc:${guard.user.id}`, 60, 600);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const { reference, documentId } = await params;
  try {
    const r = await openEvidence(new ObjectId(guard.user.id), reference, documentId);
    if (!r.ok) return fail(r.message, r.status);
    return new Response(new Uint8Array(r.bytes), {
      headers: {
        "Content-Type": r.mime,
        "Content-Disposition": `attachment; filename="${r.filename.replace(/[^A-Za-z0-9._ -]/g, "_")}"`,
        "Content-Length": String(r.bytes.length),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("admin verification document failed", (error as Error).message);
    return fail("The document could not be opened. Please try again.", 503);
  }
}
