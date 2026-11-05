import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Certificate files live in ONE private directory named by CERTIFICATE_DOCS_DIR, outside `public/`, and are served
 * only through GET /api/public/certifications/<id>/document after the record passed every access check. A record
 * stores a bare file name, never a URL or a path. There is no upload path yet (supplier submission is blocked, see
 * the Page 11 spec), so files are placed in the directory by the operator.
 */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

/** What may be served: the extension picks the type and the first bytes of the file must agree with it. */
const TYPES: Record<string, { mime: string; kind: "pdf" | "image"; magic: number[] }> = {
  pdf: { mime: "application/pdf", kind: "pdf", magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  png: { mime: "image/png", kind: "image", magic: [0x89, 0x50, 0x4e, 0x47] },
  jpg: { mime: "image/jpeg", kind: "image", magic: [0xff, 0xd8, 0xff] },
  jpeg: { mime: "image/jpeg", kind: "image", magic: [0xff, 0xd8, 0xff] },
};

const extensionOf = (reference: string) => reference.slice(reference.lastIndexOf(".") + 1).toLowerCase();

export function storageConfigured(): boolean {
  return Boolean(process.env.CERTIFICATE_DOCS_DIR?.trim());
}

/** "pdf" or "image" for a well-formed reference of an allowed type; null for anything else. */
export function documentKind(reference: string | null | undefined): "pdf" | "image" | null {
  if (!reference || !FILE_NAME.test(reference) || !reference.includes(".")) return null;
  return TYPES[extensionOf(reference)]?.kind ?? null;
}

/** The real path of a stored file, or null if the reference is malformed or would leave the directory (links included). */
async function locate(reference: string): Promise<string | null> {
  const configured = process.env.CERTIFICATE_DOCS_DIR?.trim();
  if (!configured || !documentKind(reference)) return null;
  try {
    const root = await fs.realpath(path.resolve(configured));
    const file = await fs.realpath(path.join(root, reference));
    return file.startsWith(root + path.sep) ? file : null;
  } catch {
    return null;
  }
}

/**
 * Check used by the list so a button is offered only for a file that can really be served: it is there, a regular file
 * within the size limit, and its first bytes match its extension (only the header is read).
 */
export async function documentExists(reference: string | null | undefined): Promise<boolean> {
  if (!reference) return false;
  const file = await locate(reference);
  if (!file) return false;
  let handle: fs.FileHandle | undefined;
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_DOCUMENT_BYTES) return false;
    const type = TYPES[extensionOf(reference)];
    if (!type) return false;
    handle = await fs.open(file, "r");
    const header = Buffer.alloc(type.magic.length);
    await handle.read(header, 0, header.length, 0);
    return type.magic.every((byte, index) => header[index] === byte);
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

/** The file's bytes and content type, or null when it is missing, too large or its content is not what its name claims. */
export async function readDocument(reference: string): Promise<{ bytes: Buffer; mime: string; extension: string } | null> {
  const file = await locate(reference);
  if (!file) return null;
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_DOCUMENT_BYTES) return null;
    const bytes = await fs.readFile(file);
    const extension = extensionOf(reference);
    const type = TYPES[extension];
    if (!type || !type.magic.every((byte, index) => bytes[index] === byte)) return null;
    return { bytes, mime: type.mime, extension };
  } catch {
    return null;
  }
}
