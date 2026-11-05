import type { NextResponse } from "next/server";
import { json } from "@/lib/buyer/api";
import type { AttachmentLimits, UploadedFile } from "./ticketService";

/**
 * Reads a support write request: `multipart/form-data` with `payload` (JSON text, at most 8,000 characters) and `files`, or the same
 * payload as plain JSON. The size, count and per-file limits are enforced here before any file is read into the checks; the content
 * of each file is checked later by `checkAttachments`. Used by the ticket form and by replies, so both behave the same.
 */
export async function readSupportUpload(request: Request, limits: AttachmentLimits): Promise<{ ok: true; payload: unknown; files: UploadedFile[] } | { ok: false; response: NextResponse }> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limits.maxFiles * limits.maxBytes + 256 * 1024) return { ok: false, response: json({ ok: false, message: `The upload is too large: at most ${limits.maxFiles} files of ${limits.maxMb} MB.`, fields: { attachments: "Too large." } }, 413) };

  const files: UploadedFile[] = [];
  let payload: unknown;
  const type = request.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return { ok: false, response: json({ ok: false, message: "Send this as a form upload." }, 400) };
    }
    const raw = form.get("payload");
    try {
      payload = typeof raw === "string" && raw.length <= 8_000 ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }
    const sent = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (sent.length > limits.maxFiles) return { ok: false, response: json({ ok: false, message: `You can attach at most ${limits.maxFiles} files.`, fields: { attachments: `At most ${limits.maxFiles} files.` } }, 400) };
    for (const f of sent) {
      if (f.size > limits.maxBytes) return { ok: false, response: json({ ok: false, message: `${f.name.slice(0, 60)} is larger than ${limits.maxMb} MB.`, fields: { attachments: `Each file can be at most ${limits.maxMb} MB.` } }, 413) };
      files.push({ name: f.name, bytes: Buffer.from(await f.arrayBuffer()) });
    }
  } else {
    try {
      const text = await request.text();
      payload = text.length <= 8_000 ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, response: json({ ok: false, message: "Send the details." }, 400) };
  return { ok: true, payload, files };
}
