import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Private storage for company documents (GST, PAN, registration...). Files live in ONE directory outside `public/`, are named
 * by random bytes (the client's file name is never used on disk and is shown only as display text), and are served only by
 * GET /api/buyer/company/documents/<id> after the owner check, streamed through the server with no-store caching: there is no
 * public or long-lived URL to leak. The content must really be a PDF, JPEG or PNG (the first bytes are checked, not just the name).
 *
 * Directory: BUYER_DOCS_DIR. Outside production, when it is not set, `.data/buyer-docs` in the project (git-ignored) is used.
 * In production an unset BUYER_DOCS_DIR means storage is NOT configured and uploads are refused (503), because serverless hosts
 * have no durable local disk: a hosted private object store is needed there and is not set up yet.
 */
const SIGNATURES: { ext: "pdf" | "png" | "jpg"; mime: string; magic: number[] }[] = [
  { ext: "pdf", mime: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { ext: "png", mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: "jpg", mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
];

const REFERENCE = /^[a-f0-9]{32}\.(pdf|png|jpg)$/;

export function storageDirectory(): string | null {
  const configured = process.env.BUYER_DOCS_DIR?.trim();
  if (configured) return path.resolve(configured);
  return process.env.NODE_ENV === "production" ? null : path.join(process.cwd(), ".data", "buyer-docs");
}

export const storageConfigured = () => storageDirectory() !== null;

/** What the bytes really are, or null. */
export function detectType(bytes: Buffer): { ext: "pdf" | "png" | "jpg"; mime: string } | null {
  for (const sig of SIGNATURES) if (bytes.length > sig.magic.length && sig.magic.every((b, i) => bytes[i] === b)) return { ext: sig.ext, mime: sig.mime };
  return null;
}

/** The extension the client's file name claims, normalised (jpeg is jpg), or null. */
export function claimedExtension(filename: string): "pdf" | "png" | "jpg" | null {
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "png") return "png";
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  return null;
}

/** Display text only: no path parts, no control characters, bounded. */
export const displayFilename = (name: string) => name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim().slice(0, 120) || "document";

async function directory(): Promise<string> {
  const dir = storageDirectory();
  if (!dir) throw new Error("storage not configured");
  await fs.mkdir(dir, { recursive: true });
  return fs.realpath(dir);
}

export async function saveFile(bytes: Buffer, ext: "pdf" | "png" | "jpg"): Promise<string> {
  const root = await directory();
  const reference = `${randomBytes(16).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(root, reference), bytes, { flag: "wx" });
  return reference;
}

export async function readStored(reference: string): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!REFERENCE.test(reference) || !storageDirectory()) return null;
  try {
    const root = await directory();
    const file = path.join(root, reference);
    if (!path.resolve(file).startsWith(root + path.sep)) return null;
    const bytes = await fs.readFile(file);
    const type = detectType(bytes);
    return type && type.ext === reference.slice(-3).replace("jpeg", "jpg") ? { bytes, mime: type.mime } : null;
  } catch {
    return null;
  }
}

export async function removeStored(reference: string): Promise<void> {
  if (!REFERENCE.test(reference) || !storageDirectory()) return;
  try {
    await fs.unlink(path.join(await directory(), reference));
  } catch {
    /* already gone */
  }
}
