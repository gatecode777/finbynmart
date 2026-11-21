import { createHash } from "node:crypto";
import { validateAttributes } from "@/lib/catalog/attributes";
import { ObjectId } from "mongodb";
import { deleteFromImageKit } from "@/lib/media/imagekit";
import { getManagementCategories } from "@/lib/catalog/categories";
import type { SupplierContext } from "./company";
import { getProductsCollection, type SupplierProductDoc } from "./productService";
import { getMongoClient } from "@/lib/db/mongo";
import { recordAdminEvent } from "@/lib/admin/notifications";
import { formatPaise, IMAGE_LIMITS, reasonText, type DraftImage, type Moderation, normalizeSku, parseMoq, parsePaise, reviewDraft, validateDraftShape, type DraftInput, type FieldErrors, type Review } from "./productDraftRules";

export interface DraftView {
  reference: string;
  revision: number;
  updatedAt: string;
  input: DraftInput;
  categoryName: string;
  review: Review;
  images: DraftImage[];
  /** null = never submitted. Contains only supplier-safe text. */
  moderation: Moderation | null;
}

export type DraftResult =
  | { ok: true; draft: DraftView; created?: boolean }
  | { ok: false; status: 404 | 409 | 422; message: string; fields?: FieldErrors };

/** Active categories a supplier may use (central directory). Public visibility is a separate fact and is not changed here. */
export function selectableCategories() {
  return getManagementCategories()
    .map((n) => ({ id: n.id, name: n.name, parentId: n.parentId }));
}

function categoryOf(id: string) {
  return id ? getManagementCategories().find((n) => n.id === id) : undefined;
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
    attributes: Object.fromEntries(Object.entries(d.attributes ?? {}).map(([k, v]) => [k, { value: String(v.value), unit: v.unit ?? "" }])),
  };
  return { reference: doc._id.toHexString(), revision: d.revision, updatedAt: doc.updatedAt.toISOString(), input, categoryName: doc.categoryName, review: reviewDraft(input, !!categoryOf(d.categoryId), d.images?.length ?? 0), images: d.images ?? [], moderation: d.review ? { state: d.review.state, submittedRevision: d.review.submittedRevision, submittedAt: d.review.submittedAt.toISOString(), reason: d.review.state === "REJECTED" ? (reasonText(d.review.reasonCode ?? "") ?? null) : null } : null };
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
    attributes: readAttributes(b.attributes, clean),
  };
}

/** Only plain { value, unit } string cells under short keys are read; everything else in the body is ignored (the category's set decides what is valid). */
function readAttributes(raw: unknown, clean: (v: unknown, max: number) => string): DraftInput["attributes"] {
  const out: DraftInput["attributes"] = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, cell] of Object.entries(raw as Record<string, unknown>).slice(0, 20)) {
    if (!/^[a-z][a-z0-9_-]{0,19}$/.test(k) || !cell || typeof cell !== "object") continue;
    const c = cell as Record<string, unknown>;
    out[k] = { value: clean(typeof c.value === "number" ? String(c.value) : c.value, 40), unit: clean(c.unit, 12) };
  }
  return out;
}

function validate(input: DraftInput): { fields?: FieldErrors; cat?: { id: string; name: string } } {
  const fields = validateDraftShape(input);
  const cat = categoryOf(input.categoryId);
  if (input.categoryId && !cat) fields.categoryId = "Choose an active category from the list.";
  return Object.keys(fields).length ? { fields } : { cat: cat ? { id: cat.id, name: cat.name } : undefined };
}

/** The validated, typed attributes of a draft (empty cells dropped). The input was already validated by validateDraftShape, so this never throws away an invalid one silently. */
function attributesOf(input: DraftInput) {
  const parsed = validateAttributes(input.categoryId, input.attributes, { requireRequired: false });
  return parsed.ok ? parsed.value : {};
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
      attributes: attributesOf(input),
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
    "draft.categoryId": f.draft.categoryId, "draft.pricingMode": f.draft.pricingMode, "draft.unitPricePaise": f.draft.unitPricePaise, "draft.priceUnit": f.draft.priceUnit, "draft.moq": f.draft.moq, "draft.quantityUnit": f.draft.quantityUnit, "draft.attributes": f.draft.attributes,
  };
  const update: Record<string, unknown> = { $set: set, $inc: { "draft.revision": 1 } };
  if (f.draft.skuKey) set["draft.skuKey"] = f.draft.skuKey;
  else update.$unset = { "draft.skuKey": "" };
  try {
    // one atomic conditional update: a stale revision matches nothing
    const doc = await col.findOneAndUpdate({ ...filter, "draft.revision": expectedRevision, "draft.review.state": { $ne: "PENDING" } }, update, { returnDocument: "after" });
    if (doc) return { ok: true, draft: toView(doc)! };
  } catch (e) {
    if (isDup(e)) return { ok: false, status: 409, message: "You already use this SKU on another product.", fields: { sku: "This SKU is already in use." } };
    throw e;
  }
  const current = await col.findOne(filter);
  if (current?.draft?.review?.state === "PENDING") return { ok: false, status: 409, message: "This draft is under review and cannot be edited. Withdraw the submission first." };
  return current ? { ok: false, status: 409, message: "This draft changed elsewhere. Reload to continue." } : { ok: false, status: 404, message: "Draft not found." };
}

/** Each image change is one atomic update scoped to the owned draft. Removing only unlinks it from the draft: the ImageKit file is never deleted here. */
export async function addDraftImage(ctx: SupplierContext, reference: string, image: DraftImage): Promise<DraftView | null | "FULL"> {
  const filter = ownedFilter(ctx, reference);
  if (!filter) return null;
  const col = await getProductsCollection();
  const doc = await col.findOneAndUpdate(
    { ...filter, "draft.review.state": { $ne: "PENDING" }, [`draft.images.${IMAGE_LIMITS.max - 1}`]: { $exists: false } },
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
  const doc = await col.findOneAndUpdate({ ...filter, "draft.review.state": { $ne: "PENDING" }, "draft.images": imgs }, { $set: { "draft.images": next, imageUrl: next[0]?.url ?? "", updatedAt: new Date() } }, { returnDocument: "after" });
  if (doc && action === "remove" && !(await col.countDocuments({ "draft.images.fileId": fileId }))) await deleteFromImageKit(fileId);
  return doc ? toView(doc) : toView(cur);
}

/**
 * Submit the CURRENT revision for review. The server re-validates everything (it never trusts the browser's checklist): required fields, an
 * active category, price/MOQ/unit rules and at least one image of this draft. The submitted content is copied into an immutable snapshot, the
 * draft becomes read-only until a decision or a withdrawal, and nothing becomes public. One atomic conditional update on the exact revision.
 */
export async function submitForReview(ctx: SupplierContext, actor: ObjectId, reference: string, expectedRevision: number): Promise<DraftResult> {
  const filter = ownedFilter(ctx, reference);
  if (!filter) return { ok: false, status: 404, message: "Draft not found." };
  const col = await getProductsCollection();
  const cur = await col.findOne(filter);
  if (!cur?.draft) return { ok: false, status: 404, message: "Draft not found." };
  if (cur.draft.revision !== expectedRevision) return { ok: false, status: 409, message: "This draft changed elsewhere. Reload to continue." };
  if (cur.draft.review?.state === "PENDING") return { ok: false, status: 409, message: "This revision is already under review." };
  const view = toView(cur)!;
  const checked = validate(view.input);
  if (checked.fields) return { ok: false, status: 422, message: "Please fix the highlighted fields.", fields: checked.fields };
  if (!view.review.canSubmit) return { ok: false, status: 422, message: "Complete these first: " + view.review.missing.join(", ") + "." };
  const snapshot = { name: cur.name, sku: cur.sku, description: cur.description, categoryId: cur.draft.categoryId, categoryName: cur.categoryName, pricingMode: cur.draft.pricingMode, currency: cur.draft.currency, unitPricePaise: cur.draft.unitPricePaise, priceUnit: cur.draft.priceUnit, moq: cur.draft.moq, quantityUnit: cur.draft.quantityUnit, attributes: cur.draft.attributes ?? {}, images: cur.draft.images ?? [] };
  const now = new Date();
  let doc = null as SupplierProductDoc | null;
  const session = (await getMongoClient()).startSession();
  try {
    // the PENDING state and the staff alert commit together; a lost race (no document updated) records nothing
    await session.withTransaction(async () => {
      doc = null;
      doc = await col.findOneAndUpdate(
        { ...filter, "draft.revision": expectedRevision, "draft.review.state": { $ne: "PENDING" } },
        { $set: { "draft.review": { state: "PENDING", submittedRevision: expectedRevision, submittedAt: now, submittedBy: actor, snapshot }, updatedAt: now } },
        { returnDocument: "after", session },
      );
      if (doc) await recordAdminEvent(session, { type: "PRODUCT_REVISION_SUBMITTED", sourceKey: `product:${(doc as SupplierProductDoc)._id!.toHexString()}:${expectedRevision}:${now.getTime()}`, reference: (doc as SupplierProductDoc)._id!.toHexString() }, now);
    });
  } finally {
    await session.endSession();
  }
  return doc ? { ok: true, draft: toView(doc)! } : { ok: false, status: 409, message: "This draft changed elsewhere. Reload to continue." };
}

/** Withdraw a pending submission so the draft can be edited again. Only while PENDING; a decided review is history. */
export async function withdrawReview(ctx: SupplierContext, reference: string): Promise<DraftResult> {
  const filter = ownedFilter(ctx, reference);
  if (!filter) return { ok: false, status: 404, message: "Draft not found." };
  const col = await getProductsCollection();
  const doc = await col.findOneAndUpdate({ ...filter, "draft.review.state": "PENDING" }, { $unset: { "draft.review": "" }, $set: { updatedAt: new Date() } }, { returnDocument: "after" });
  if (doc) return { ok: true, draft: toView(doc)! };
  return (await col.findOne(filter)) ? { ok: false, status: 409, message: "This draft is not under review." } : { ok: false, status: 404, message: "Draft not found." };
}
