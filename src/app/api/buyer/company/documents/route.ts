import { buyerGuard, json } from "@/lib/buyer/api";
import { listBuyerDocuments, uploadBuyerDocument } from "@/lib/buyer/profile";
import { DOCUMENT_LIMITS } from "@/lib/buyer/profileRules";
import { withApiPerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

async function handleGET() {
  const guard = await buyerGuard();
  if ("response" in guard) return guard.response;
  return json({ ok: true, data: await listBuyerDocuments(guard.user.id) });
}

/**
 * POST multipart/form-data: documentType, optional expiryDate (YYYY-MM-DD), file. The status is chosen by the server (PENDING);
 * a status, buyer id or company id in the form is never read. The size is checked from the declared length before the body is read
 * and again on the file itself, and the content must really be a PDF, JPEG or PNG.
 */
async function handlePOST(request: Request) {
  const guard = await buyerGuard({ key: "buyer-document-upload", limit: 20, windowSeconds: 600 });
  if ("response" in guard) return guard.response;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > DOCUMENT_LIMITS.maxBytes + 64 * 1024) return json({ ok: false, message: `The file is larger than ${DOCUMENT_LIMITS.maxBytes / 1024 / 1024} MB.`, fields: { file: "Too large." } }, 413);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, message: "Send the document as a form upload." }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ ok: false, message: "Choose a file to upload.", fields: { file: "Choose a file." } }, 400);
  if (file.size > DOCUMENT_LIMITS.maxBytes) return json({ ok: false, message: `The file is larger than ${DOCUMENT_LIMITS.maxBytes / 1024 / 1024} MB.`, fields: { file: "Too large." } }, 413);
  const result = await uploadBuyerDocument(guard.user.id, { documentType: form.get("documentType"), expiryDate: form.get("expiryDate") ?? undefined, filename: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
  if (result.ok) return json({ ok: true, message: "Your document was uploaded and is waiting for review.", data: { document: result.document } }, 201);
  if (result.code === "INVALID") return json({ ok: false, message: result.message, fields: { [result.field]: result.message } }, 400);
  const text = {
    NO_COMPANY: [409, "Add your company details before uploading documents."],
    STORAGE_UNAVAILABLE: [503, "Document storage is not configured on this server, so documents cannot be uploaded yet."],
    VERIFIED_LOCKED: [409, "A verified document cannot be replaced here. Contact support."],
  } as const;
  const [status, message] = text[result.code];
  return json({ ok: false, message, code: result.code }, status);
}

export const GET = withApiPerf("GET api/buyer/company/documents", handleGET);
export const POST = withApiPerf("POST api/buyer/company/documents", handlePOST);
