import { NextResponse } from "next/server";
import { requireSupplierApi, forbiddenResponse } from "@/lib/auth/guards";
import { clean, fail, readSmallJson, tooMany } from "@/lib/auth/http";
import { isCrossSiteWrite } from "@/lib/security/sameOrigin";
import { rateLimit } from "@/lib/security/rateLimit";
import { deleteFromImageKit, imagekitConfigured, sniffImage, uploadToImageKit } from "@/lib/media/imagekit";
import { IMAGE_LIMITS } from "@/lib/supplier/productDraftRules";
import { addDraftImage, changeDraftImage, getDraft } from "@/lib/supplier/productDraftService";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
type Ctx = { params: Promise<{ reference: string }> };

async function gate(request: Request) {
  if (isCrossSiteWrite(request)) return { response: fail("Cross-site request refused.", 403) };
  const guard = await requireSupplierApi();
  if ("response" in guard) return guard;
  if (!guard.context.permissions.manageProducts) return { response: forbiddenResponse() };
  const limit = await rateLimit(`supplier-product-image:${guard.user.id}`, 40, 600);
  if (!limit.ok) return { response: tooMany(limit.retryAfterSeconds) };
  return guard;
}

/** Upload one image into the owned draft. Multipart field "file". */
export async function POST(request: Request, { params }: Ctx) {
  const g = await gate(request);
  if ("response" in g) return g.response;
  const ref = (await params).reference;
  if (!imagekitConfigured()) return fail("Image storage is not configured.", 503);
  if (Number(request.headers.get("content-length") ?? "0") > IMAGE_LIMITS.maxBytes + 100_000) return fail("Image is too large (max 5 MB).", 413);
  if (!(await getDraft(g.context, ref))) return fail("Draft not found.", 404);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Choose an image file.", 422);
  if (file.size === 0 || file.size > IMAGE_LIMITS.maxBytes) return fail("Image must be between 1 byte and 5 MB.", file.size ? 413 : 422);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return fail("Only JPG, PNG or WebP images are accepted.", 422);

  const name = clean(file.name.replace(/\.[^.]*$/, ""), 60).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "image";
  const up = await uploadToImageKit(bytes, `${name}.${kind}`, `/supplier-products/${g.context.companyId.toHexString()}`);
  if (!up) return fail("Image upload failed. Please try again.", 502);

  const res = await addDraftImage(g.context, ref, { ...up, name });
  // the draft refused it (gone or full): do not leave an orphan file in ImageKit
  if (res === null || res === "FULL") await deleteFromImageKit(up.fileId);
  if (res === null) return fail("Draft not found.", 404);
  if (res === "FULL") return fail(`A product can have at most ${IMAGE_LIMITS.max} images.`, 409);
  return NextResponse.json({ ok: true, message: "Image added.", data: res }, { status: 201, headers: NO_STORE });
}

/** { fileId, action: "cover" | "remove" } */
export async function PATCH(request: Request, { params }: Ctx) {
  const g = await gate(request);
  if ("response" in g) return g.response;
  const body = await readSmallJson(request, 2_000);
  const fileId = clean(body?.fileId, 100);
  const action = ["cover", "remove", "left", "right"].includes(String(body?.action)) ? (body!.action as "cover" | "remove" | "left" | "right") : null;
  if (!fileId || !action) return fail("fileId and action are required.", 422);
  const draft = await changeDraftImage(g.context, (await params).reference, fileId, action);
  if (!draft) return fail("Draft not found.", 404);
  return NextResponse.json({ ok: true, data: draft }, { headers: NO_STORE });
}
