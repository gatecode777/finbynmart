import "server-only";

/** Image types accepted, detected from the file's own bytes (never from the extension or the client MIME). */
export function sniffImage(b: Uint8Array): "jpg" | "png" | "webp" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

export const imagekitConfigured = () => !!(process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT);

/** Server-side upload through the ImageKit REST API (no SDK). The private key never leaves the server. */
export async function uploadToImageKit(bytes: Uint8Array, fileName: string, folder: string): Promise<{ fileId: string; url: string } | null> {
  const key = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!key) return null;
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart]), fileName);
  form.append("fileName", fileName);
  form.append("folder", folder);
  form.append("useUniqueFileName", "true");
  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
    body: form,
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const j = (await res.json().catch(() => null)) as { fileId?: string; url?: string } | null;
  const endpoint = (process.env.IMAGEKIT_URL_ENDPOINT ?? "").replace(/\/$/, "");
  // only accept a URL under our own endpoint
  return j?.fileId && j.url?.startsWith(endpoint + "/") ? { fileId: j.fileId, url: j.url } : null;
}

/** Deletes one uploaded file. Callers must first make sure nothing else references it. Returns false on any failure (never throws). */
export async function deleteFromImageKit(fileId: string): Promise<boolean> {
  const key = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!key || !/^[A-Za-z0-9]{10,40}$/.test(fileId)) return false;
  const res = await fetch(`https://api.imagekit.io/v1/files/${fileId}`, { method: "DELETE", headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  return !!res && (res.ok || res.status === 404);
}
