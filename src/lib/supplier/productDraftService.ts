import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { deleteFromImageKit } from "@/lib/media/imagekit";
import { getCategoryDirectory } from "@/lib/catalog/categories";
import type { SupplierContext } from "./company";
import { getProductsCollection, type SupplierProductDoc } from "./productService";
import { formatPaise, IMAGE_LIMITS, type DraftImage, normalizeSku, parseMoq, parsePaise, reviewDraft, validateDraftShape, type DraftInput, type FieldErrors, type Review } from "./productDraftRules";

export interface DraftView {
  reference: string;
  revision: number;
  updatedAt: string;
  input: DraftInput;
  categoryName: string;
  review: Review;
  images: DraftImage[];
}

export type DraftResult =
  | { ok: true; draft: DraftView; created?: boolean }
  | { ok: false; status: 404 | 409 | 422; message: string; fields?: FieldErrors };

/** Active categories a supplier may use (central directory). Public visibility is a separate fact and is not changed here. */
export function selectableCategories() {
  return getCategoryDirectory()
    .nodes.filter((n) => n.isActive)
    .map((n) => ({ id: n.id, name: n.name, parentId: n.parentId }));
}

function categoryOf(id: string) {
  return id ? getCategoryDirectory().nodes.find((n) => n.id === id && n.isActive) : undefined;
}

function toView(doc: SupplierProductDoc): DraftView | null {
  const d = doc.draft;
  if (!d) return null;
  const input: DraftInput = {
    name: doc.name,
    categoryId: d.categoryId,
    sku: doc.sku,
    description: doc.description,
    pricingMode: d.pricingMode,
    price: d.unitPricePaise === null ? "" : formatPaise(d.unitPricePaise),
    priceUnit: d.priceUnit,
    moq: d.moq === null ? "" : String(d.moq),
    quantityUnit: d.quantityUnit,
  };
  return { reference: doc._id.toHexString(), revision: d.revision, updatedAt: doc.updatedAt.toISOString(), input, categoryName: doc.categoryName, review: reviewDraft(input, !!categoryOf(d.categoryId), d.images?.length ?? 0), images: d.images ?? [] };
}

/** Field allow-list: anything else in the body (companyId, status, stock, moderation...) is never read. */
export function readDraftInput(b: Record<string, unknown>, clean: (v: unknown, max: number) => string, cleanMultiline: (v: unknown, max: number) => string): DraftInput {
  return {
    name: clean(b.name, 300),
    categoryId: clean(b.categoryId, 200),
    sku: clean(b.sku, 100),
    description: cleanMultiline(b.description, 5000),
    pricingMode: b.pricingMode === "ON_REQUEST" ? "ON_REQUEST" : "FIXED",
    price: clean(typeof b.price === "number" ? String(b.price) : b.price, 20),
    priceUnit: clean(b.priceUnit, 20),
    moq: clean(typeof b.moq === "number" ? String(b.moq) : b.moq, 20),
    quantityUnit: clean(b.quantityUnit, 20),
  };
}

function validate(input: DraftInput): { fields?: FieldErrors; cat?: { id: string; name: string } } {
  const fields = validateDraftShape(input);
  const cat = categoryOf(input.categoryId);
  if (input.categoryId && !cat) fields.categoryId = "Choose an active category from the list.";
  return Object.keys(fields).length ? { fields } : { cat: cat ? { id: cat.id, name: cat.name } : undefined };
}

function fieldsOf(input: DraftInput, cat?: { id: string; name: string }) {
  const sku = normalizeSku(input.sku);
  const paise = input.pricingMode === "FIXED" ? parsePaise(input.price) : null;
  return {
    name: input.name,
    sku,
    description: input.description,
    categoryName: cat?.name ?? "",
    slugBase: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80),
    draft: {
      skuKey: sku || undefined,
      categoryId: cat?.id ?? "",
      pricingMode: input.pricingMode,
      unitPricePaise: paise,
      priceUnit: input.priceUnit,
      moq: input.moq ? parseMoq(input.moq) : null,
      quantityUnit: input.quantityUnit,
    },
    paise,
  };
}

const isDup = (e: unknown, index?: string) => {
  const err = e as { code?: number; message?: string };
  return err?.code === 11000 && (!index || (err.message ?? "").includes(index));
};

export async function createDraft(ctx: SupplierContext, actor: ObjectId, input: DraftInput, idempotencyKey: string): Promise<DraftResult> {
  if (!input.name.trim()) return { ok: false, status: 422, message: "Enter a product name to save a draft.", fields: { name: "Product name is required." } };
  const v = validate(input);
  if (v.fields) return { ok: false, status: 422, message: "Please fix the highlighted fields.", fields: v.fields };
  const bodyHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const col = await getProductsCollection();
  const existing = () => col.findOne({ companyId: ctx.companyId, "draft.createdBy": actor, "draft.idempotencyKey": idempotencyKey });

  const replay = async (): Promise<DraftResult | null> => {
    const prior = await existing();
    if (!prior) return null;
    if (prior.draft?.bodyHash !== bodyHash) return { ok: false, status: 409, message: "This save key was already used with different content." };
    return { ok: true, draft: toView(prior)!, created: false };
  };
  const done = await replay();
  if (done) return done;

  const f = fieldsOf(input, v.cat);
  const _id = new ObjectId();
  const now = new Date();
  const doc: SupplierProductDoc = {
    _id,
    companyId: ctx.companyId,
    name: f.name,
    sku: f.sku,
    slug: `${f.slugBase || "product"}-${_id.toHexString().slice(-6)}`,
    categoryName: f.categoryName,
    price: f.paise === null ? 0 : f.paise / 100,
    unit: input.priceUnit || "",
    stock: 0, // never fabricated; stock enters only through the inventory workflow
    status: "DRAFT",
    imageUrl: "",
    description: f.description,
    createdAt: now,
    updatedAt: now,
    draft: { revision: 1, createdBy: actor, idempotencyKey, bodyHash, currency: "INR", ...f.draft },
  };
  try {
    await col.insertOne(doc);
  } catch (e) {
    if (isDup(e, "supplier_product_sku_per_company")) return { ok: false, status: 409, message: "You already use this SKU on another product.", fields: { sku: "This SKU is already in use." } };
    if (isDup(e)) return (await replay()) ?? { ok: false, status: 409, message: "Duplicate save." };
    throw e;
  }
  return { ok: true, draft: toView(doc)!, created: true };
}

function ownedFilter(ctx: SupplierContext, reference: string) {
  return ObjectId.isValid(reference) && reference.length === 24 ? { _id: new ObjectId(reference), companyId: ctx.companyId, "draft.revision": { $gte: 1 }, status: "DRAFT" as const } : null;
}

export async function getDraft(ctx: SupplierContext, reference: string): Promise<DraftView | null> {
  const filter = ownedFilter(ctx, reference);
  if (!filter) return null;
  const doc = await (await getProductsCollection()).findOne(filter);
  return doc ? toView(doc) : null;
}

export async function updateDraft(ctx: SupplierContext, reference: string, expectedRevision: number, input: DraftInput): Promise<DraftResult> {
  const filter = ownedFilter(ctx, reference);
  if (!filter) return { ok: false, status: 404, message: "Draft not found." };
  if (!input.name.trim()) return { ok: false, status: 422, message: "Product name is required.", fields: { name: "Product name is required." } };
  const v = validate(input);
  if (v.fields) return { ok: false, status: 422, message: "Please fix the highlighted fields.", fields: v.fields };
  const f = fieldsOf(input, v.cat);
  const col = await getProductsCollection();
  const set: Record<string, unknown> = {
    name: f.name, sku: f.sku, description: f.description, categoryName: f.categoryName, price: f.paise === null ? 0 : f.paise / 100, unit: input.priceUnit || "", updatedAt: new Date(),
    "draft.categoryId": f.draft.categoryId, "draft.pricingMode": f.draft.pricingMode, "draft.unitPricePaise": f.draft.unitPricePaise, "draft.priceUnit": f.draft.priceUnit, "draft.moq": f.draft.moq, "draft.quantityUnit": f.draft.quantityUnit,
  };
  const update: Record<string, unknown> = { $set: set, $inc: { "draft.revision": 1 } };
  if (f.draft.skuKey) set["draft.skuKey"] = f.draft.skuKey;
  else update.$unset = { "draft.skuKey": "" };
  try {
    // one atomic conditional update: a stale revision matches nothing
    const doc = await col.findOneAndUpdate({ ...filter, "draft.revision": expectedRevision }, update, { returnDocument: "after" });
    if (doc) return { ok: true, draft: toView(doc)! };
  } catch (e) {
    if (isDup(e)) return { ok: false, status: 409, message: "You already use this SKU on another product.", fields: { sku: "This SKU is already in use." } };
    throw e;
  }
  const current = await col.findOne(filter);
  return current ? { ok: false, status: 409, message: "This draft changed elsewhere. Reload to continue." } : { ok: false, status: 404, message: "Draft not found." };
}

/** Each image change is one atomic update scoped to the owned draft. Removing only unlinks it from the draft: the ImageKit file is never deleted here. */
export async function addDraftImage(ctx: SupplierContext, reference: string, image: DraftImage): Promise<DraftView | null | "FULL"> {
  const filter = ownedFilter(ctx, reference);
  if (!filter) return null;
  const col = await getProductsCollection();
  const doc = await col.findOneAndUpdate(
    { ...filter, [`draft.images.${IMAGE_LIMITS.max - 1}`]: { $exists: false } },
    [{ $set: { "draft.images": { $concatArrays: [{ $ifNull: ["$draft.images", []] }, [image]] }, imageUrl: { $ifNull: [{ $arrayElemAt: ["$draft.images.url", 0] }, image.url] }, updatedAt: new Date() } }],
    { returnDocument: "after" },
  );
  if (doc) return toView(doc);
  return (await col.findOne(filter)) ? "FULL" : null;
}

export async function changeDraftImage(ctx: SupplierContext, reference: string, fileId: string, action: "cover" | "remove" | "left" | "right"): Promise<DraftView | null> {
  const filter = ownedFilter(ctx, reference);
  if (!filter) return null;
  const col = await getProductsCollection();
  const cur = await col.findOne(filter);
  const imgs = cur?.draft?.images ?? [];
  const i = imgs.findIndex((x) => x.fileId === fileId);
  if (!cur || i < 0) return cur ? toView(cur) : null;
  let next = imgs.slice();
  if (action === "remove") next.splice(i, 1);
  else if (action === "cover") next = [imgs[i], ...imgs.filter((_, n) => n !== i)];
  else {
    const j = action === "left" ? i - 1 : i + 1;
    if (j < 0 || j >= next.length) return toView(cur);
    [next[i], next[j]] = [next[j], next[i]];
  }
  // conditional on the array we read, so a concurrent change makes this a no-op instead of overwriting it
  const doc = await col.findOneAndUpdate({ ...filter, "draft.images": imgs }, { $set: { "draft.images": next, imageUrl: next[0]?.url ?? "", updatedAt: new Date() } }, { returnDocument: "after" });
  if (doc && action === "remove" && !(await col.countDocuments({ "draft.images.fileId": fileId }))) await deleteFromImageKit(fileId);
  return doc ? toView(doc) : toView(cur);
}
