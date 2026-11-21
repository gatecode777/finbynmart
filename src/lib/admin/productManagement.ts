import { ObjectId, type Filter, type Sort } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { getManagementCategories } from "@/lib/catalog/categories";
import { invalidateApproved } from "@/lib/catalog/approvedProducts";
import { displayAttributes, type AttrMap } from "@/lib/catalog/attributes";
import { normalizeImage } from "@/lib/catalog/publicProduct";
import { getProductsCollection, type SupplierProductDoc } from "@/lib/supplier/productService";
import { notifySellerOwnerByCompany } from "./productReviewNotice";
import { PAGE_SIZE, canUnpublishRow, deriveListing, isEffectivelyPublic, moqText, priceText, validateUnpublishReason, type ProductDetail, type ProductListQuery, type ProductListResponse, type ProductRow } from "./productList";

/**
 * Admin Product Management service. SOURCE: supplier-created products (`supplier_products`) that were submitted or published. The legacy catalogue (CSV seed) is NOT listed: it has
 * no mutable visibility mechanism and no admin identity, so it can neither be filtered here nor unpublished (the page says so). No list is ever built by concatenating sources.
 * Scope: the permission model has capabilities only (no organisational or category scope), so scope = every supplier-created product the capability allows; the capability is
 * checked by the route before any of these functions runs, and `canUnpublish`/`canReview` are re-derived here, never taken from the client.
 */
export interface Caps { unpublish: boolean; review: boolean }

const MAX_PAGE = 1000;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const HEX24 = /^[a-f0-9]{24}$/;

/** Only products an admin may see: published (or unpublished) and submitted ones. A draft that was never submitted is private to its supplier. */
const VISIBLE: Filter<SupplierProductDoc> = { $or: [{ publication: { $exists: true } }, { "draft.review": { $exists: true } }] };
const LIVE: Filter<SupplierProductDoc> = { "publication.state": "APPROVED", archivedAt: { $exists: false } };

export function buildFilter(q: ProductListQuery): Filter<SupplierProductDoc> {
  const and: Filter<SupplierProductDoc>[] = [VISIBLE];
  if (q.status === "PUBLISHED") and.push(LIVE);
  else if (q.status === "UNPUBLISHED") and.push({ "publication.state": "APPROVED", archivedAt: { $exists: true } });
  else if (q.status === "PENDING_REVIEW") and.push({ publication: { $exists: false }, "draft.review.state": "PENDING" });
  else if (q.status === "REJECTED") and.push({ publication: { $exists: false }, "draft.review.state": "REJECTED" });
  if (q.supplier && HEX24.test(q.supplier)) and.push({ companyId: new ObjectId(q.supplier) });
  else if (q.supplier) and.push({ _id: new ObjectId() }); // an invalid id matches nothing, never everything
  if (q.category) and.push({ $or: [{ "publication.snapshot.categoryId": q.category }, { publication: { $exists: false }, "draft.review.snapshot.categoryId": q.category }] });
  const term = q.q.trim();
  if (term) {
    // exact reference, exact normalised SKU, or an anchored case-insensitive name prefix (escaped: never a pattern from the client)
    const or: Filter<SupplierProductDoc>[] = [{ name: { $regex: `^${escapeRe(term)}`, $options: "i" } }, { "draft.skuKey": term.trim().replace(/\s+/g, "-").toUpperCase() }];
    if (HEX24.test(term.toLowerCase())) or.push({ _id: new ObjectId(term.toLowerCase()) });
    and.push({ $or: or });
  }
  return { $and: and };
}

export async function companyNames(ids: ObjectId[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const db = await getDb();
  const comps = await db.collection<{ _id: ObjectId; ownerUserId: ObjectId }>("supplier_companies").find({ _id: { $in: ids } }, { projection: { ownerUserId: 1 } }).toArray();
  const users = await db.collection<{ _id: ObjectId; supplier?: { businessName?: string } }>("users").find({ _id: { $in: comps.map((c) => c.ownerUserId) } }, { projection: { supplier: 1 } }).toArray();
  const byUser = new Map(users.map((u) => [u._id.toHexString(), u.supplier?.businessName ?? ""]));
  return new Map(comps.map((c) => [c._id.toHexString(), byUser.get(c.ownerUserId.toHexString()) || "Company not available"]));
}

let idx: Promise<unknown> | undefined;
async function col() {
  const c = await getProductsCollection();
  // newest first / by name with the unique _id tie-breaker; the admin set is small relative to the whole collection, so a plain index (partial filters cannot express the $or) is the documented choice
  idx ??= Promise.all([c.createIndex({ updatedAt: -1, _id: -1 }, { name: "admin_products_updated" }), c.createIndex({ name: 1, _id: 1 }, { name: "admin_products_name" }), c.createIndex({ companyId: 1, updatedAt: -1 }, { name: "admin_products_company_updated" })]).catch((e) => { idx = undefined; throw e; });
  await idx;
  return c;
}

const PROJECTION = {
  name: 1, slug: 1, companyId: 1, updatedAt: 1, categoryName: 1, archivedAt: 1, "draft.skuKey": 1, sku: 1, "draft.review.state": 1,
  "publication.state": 1, "publication.revision": 1, "publication.approvedAt": 1,
  "publication.snapshot.name": 1, "publication.snapshot.categoryName": 1, "publication.snapshot.pricingMode": 1, "publication.snapshot.unitPricePaise": 1, "publication.snapshot.priceUnit": 1, "publication.snapshot.moq": 1, "publication.snapshot.quantityUnit": 1, "publication.snapshot.images": { $slice: 1 },
  "draft.review.snapshot.name": 1, "draft.review.snapshot.categoryName": 1, "draft.review.snapshot.pricingMode": 1, "draft.review.snapshot.unitPricePaise": 1, "draft.review.snapshot.priceUnit": 1, "draft.review.snapshot.moq": 1, "draft.review.snapshot.quantityUnit": 1, "draft.review.snapshot.images": { $slice: 1 },
} as const;

type Snap = { name?: string; categoryName?: string; pricingMode?: unknown; unitPricePaise?: unknown; priceUnit?: unknown; moq?: unknown; quantityUnit?: unknown; images?: { url?: string; name?: string }[] };

function rowOf(d: SupplierProductDoc, names: Map<string, string>, caps: Caps): ProductRow | null {
  const derived = deriveListing({ publicationApproved: d.publication?.state === "APPROVED", archived: Boolean(d.archivedAt), reviewState: d.draft?.review?.state });
  if (!derived) return null;
  // the content shown is the APPROVED snapshot whenever one exists; a pending revision never replaces it
  const snap = (d.publication?.state === "APPROVED" ? d.publication.snapshot : d.draft?.review?.snapshot) as Snap | undefined;
  const image = normalizeImage(snap?.images?.[0]?.url);
  return {
    reference: d._id.toHexString(),
    name: snap?.name || d.name,
    sku: d.sku || null,
    company: names.get(d.companyId.toHexString()) ?? "Company not available",
    category: snap?.categoryName || d.categoryName || "Not provided",
    imageUrl: image?.src ?? null,
    priceText: snap ? priceText(snap) : null,
    moqText: snap ? moqText(snap) : null,
    status: derived.status,
    pendingChanges: derived.pendingChanges,
    updatedAt: d.updatedAt.toISOString(),
    actions: { unpublish: canUnpublishRow(derived.status, caps.unpublish) },
  };
}

export async function listProducts(q: ProductListQuery, caps: Caps, limit = PAGE_SIZE): Promise<ProductListResponse> {
  const c = await col();
  const filter = buildFilter(q);
  const page = Math.max(1, Math.min(MAX_PAGE, q.page));
  const lim = Math.min(50, Math.max(1, limit));
  const sort: Sort = q.sort === "name" ? { name: 1, _id: 1 } : { updatedAt: -1, _id: -1 };
  const [docs, total, supplierIds] = await Promise.all([
    c.find(filter, { projection: PROJECTION as never, ...(q.sort === "name" ? { collation: { locale: "en" } } : {}) }).sort(sort).skip((page - 1) * lim).limit(lim).toArray(),
    c.countDocuments(filter),
    c.distinct("companyId", VISIBLE),
  ]);
  const names = await companyNames([...new Set([...docs.map((d) => d.companyId.toHexString()), ...supplierIds.slice(0, 200).map((i) => i.toHexString())])].map((h) => new ObjectId(h)));
  const items = docs.map((d) => rowOf(d, names, caps)).filter((r): r is ProductRow => r !== null);
  const suppliers = supplierIds.slice(0, 200).map((i) => ({ value: i.toHexString(), label: names.get(i.toHexString()) ?? "Company not available" })).sort((a, b) => a.label.localeCompare(b.label));
  return { items, meta: { page, limit: lim, total, hasMore: page * lim < total }, facets: { categories: getManagementCategories().map((n) => ({ value: n.id, label: n.name })), suppliers } };
}

export async function getProductDetail(reference: string, caps: Caps): Promise<ProductDetail | null> {
  if (!HEX24.test(reference)) return null;
  const d = await (await col()).findOne({ _id: new ObjectId(reference), ...VISIBLE } as Filter<SupplierProductDoc>);
  if (!d) return null;
  const names = await companyNames([d.companyId]);
  const row = rowOf(d, names, caps);
  if (!row) return null;
  const approved = d.publication?.state === "APPROVED";
  const snap = (approved ? d.publication!.snapshot : d.draft?.review?.snapshot) as (Snap & { attributes?: AttrMap; categoryId?: string; images?: { url: string; name: string }[] }) | undefined;
  const images = (snap?.images ?? []).flatMap((i) => { const n = normalizeImage(i.url); return n ? [{ url: n.src, name: String(i.name ?? "").slice(0, 120) }] : []; });
  const archived = Boolean(d.archivedAt);
  const live = isEffectivelyPublic({ publicationApproved: approved, archived });
  const showPending = caps.review && row.pendingChanges && d.draft?.review;
  return {
    ...row,
    images,
    specifications: displayAttributes(String(snap?.categoryId ?? ""), snap?.attributes).map(({ label, value }) => ({ label, value })),
    approvedAt: d.publication?.approvedAt?.toISOString() ?? null,
    unpublishedAt: d.archivedAt?.toISOString() ?? null,
    revision: approved ? (d.publication!.revision ?? null) : null,
    // an actual public route, offered only while the product is public (the loader also needs an active category and company; the page says "if it is eligible")
    publicUrl: live ? `/products/${d.slug}` : null,
    visibilityNote: live ? "Public: the approved version is live (subject to its category and company being active)." : archived ? "Not public: an admin unpublished this listing. A newer approved revision does not restore it." : approved ? "Not public." : row.status === "PENDING_REVIEW" ? "Not public: waiting for a review decision." : "Not public: the submitted revision was rejected.",
    pending: showPending ? { revision: d.draft!.review!.submittedRevision, submittedAt: d.draft!.review!.submittedAt.toISOString() } : null,
    unpublishReason: caps.unpublish && d.unpublish ? d.unpublish.reason : null,
  };
}

// ---------------------------------------------------------------- unpublish
export type UnpublishResult = { ok: true; alreadyUnpublished: boolean } | { ok: false; status: 404 | 409 | 422; message: string; fields?: Record<string, string> };

export interface VisibilityEvent {
  _id: ObjectId;
  dedupeKey: string;
  type: "PRODUCT_UNPUBLISHED";
  productId: ObjectId;
  companyId: ObjectId;
  productName: string;
  revision: number;
  /** Recovery intents, written in the SAME transaction as the visibility change. DONE only after the step really happened. */
  refresh: { state: "PENDING" | "DONE"; attempts: number };
  notice: { state: "PENDING" | "DONE"; attempts: number };
  createdAt: Date;
}
let evIdx: Promise<unknown> | undefined;
export async function visibilityEvents() {
  const c = (await getDb()).collection<VisibilityEvent>("product_visibility_events");
  evIdx ??= Promise.all([c.createIndex({ dedupeKey: 1 }, { unique: true, name: "visibility_event_dedupe" }), c.createIndex({ "refresh.state": 1, "notice.state": 1, createdAt: 1 }, { name: "visibility_event_pending" })]).catch((e) => { evIdx = undefined; throw e; });
  await evIdx;
  return c;
}

/**
 * Unpublish = a public-visibility restriction, never a deletion. One transaction: a conditional update on the exact approved revision + the audit row + the recovery event.
 * A retry (same revision, already unpublished) answers accurately and creates nothing new; a stale revision or a changed lifecycle is 409. Product identity, supplier drafts,
 * review history, inquiries, quotations and orders are untouched. The supplier notice and the public refresh run AFTER the commit from the stored event (retried by the worker).
 */
export async function unpublishProduct(adminId: ObjectId, reference: string, input: { reason: unknown; expectedRevision: unknown }, now = new Date()): Promise<UnpublishResult> {
  const reasonText = typeof input.reason === "string" ? input.reason.trim().replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ") : "";
  const reasonError = validateUnpublishReason(reasonText);
  if (reasonError) return { ok: false, status: 422, message: "Check the reason.", fields: { reason: reasonError } };
  const rev = input.expectedRevision;
  if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 1) return { ok: false, status: 422, message: "Reload the product and try again.", fields: { expectedRevision: "The product revision is required." } };
  if (!HEX24.test(reference)) return { ok: false, status: 404, message: "Product not found." };
  const _id = new ObjectId(reference);
  const c = await col();
  const events = await visibilityEvents();
  const audit = (await getDb()).collection("admin_audit_log");

  const classify = async (): Promise<UnpublishResult> => {
    const cur = await c.findOne({ _id }, { projection: { publication: 1, archivedAt: 1, unpublish: 1 } });
    if (!cur?.publication) return { ok: false, status: 404, message: "Product not found." };
    if (cur.archivedAt) return cur.unpublish?.revision === rev ? { ok: true, alreadyUnpublished: true } : { ok: false, status: 409, message: "This listing was already unpublished under a different revision. Reload to see its current state." };
    return { ok: false, status: 409, message: "The product changed after you opened it. Reload and review the current live version before unpublishing." };
  };

  const first = await c.findOne({ _id }, { projection: { publication: 1, archivedAt: 1, unpublish: 1, companyId: 1, name: 1 } });
  if (!first?.publication) return { ok: false, status: 404, message: "Product not found." };
  if (first.archivedAt || first.publication.revision !== rev) return classify();

  const session = (await getMongoClient()).startSession();
  let out: UnpublishResult | undefined;
  let eventId: ObjectId | undefined;
  try {
    await session.withTransaction(
      async () => {
        out = undefined;
        eventId = undefined;
        const done = await c.updateOne({ _id, "publication.state": "APPROVED", "publication.revision": rev, archivedAt: { $exists: false } }, { $set: { archivedAt: now, unpublish: { at: now, by: adminId, reason: reasonText, revision: rev }, updatedAt: now } }, { session });
        if (done.matchedCount !== 1) { out = { ok: false, status: 409, message: "The product changed or was unpublished while you were deciding. Reload and try again." }; return; }
        await audit.insertOne({ _id: new ObjectId(), action: "PRODUCT_UNPUBLISHED", actorId: adminId, productId: _id, companyId: first.companyId, revision: rev, reason: reasonText, at: now }, { session });
        eventId = new ObjectId();
        await events.insertOne({ _id: eventId, dedupeKey: `unpublish:${reference}:${rev}`, type: "PRODUCT_UNPUBLISHED", productId: _id, companyId: first.companyId, productName: first.name, revision: rev, refresh: { state: "PENDING", attempts: 0 }, notice: { state: "PENDING", attempts: 0 }, createdAt: now }, { session });
        out = { ok: true, alreadyUnpublished: false };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } finally {
    await session.endSession();
  }
  const result = out ?? ({ ok: false, status: 409, message: "Could not record the change. Please try again." } as UnpublishResult);
  if (!result.ok) {
    // a racing admin may have unpublished the same revision first: that is an accurate success for this caller, not a conflict
    if (result.status === 409) { const again = await classify().catch(() => result); if (again.ok) return again; }
    return result;
  }
  if (eventId) await processVisibilityEvent(eventId).catch(() => undefined);
  return result;
}

/** Run the post-commit steps of one event. Each step is marked DONE only when it really happened; a failure leaves it PENDING for the worker sweep, and the restriction itself is never undone. */
export async function processVisibilityEvent(id: ObjectId): Promise<void> {
  const events = await visibilityEvents();
  const e = await events.findOne({ _id: id });
  if (!e) return;
  if (e.refresh.state === "PENDING") {
    const ok = await invalidateApproved().then(() => true, () => false);
    await events.updateOne({ _id: id }, { $set: { "refresh.state": ok ? "DONE" : "PENDING" }, $inc: { "refresh.attempts": 1 } });
  }
  if (e.notice.state === "PENDING") {
    // supplier-visible wording only: the internal reason never leaves the audit record
    const sent = await notifySellerOwnerByCompany(e.companyId, { type: "PRODUCT_UNPUBLISHED", title: "Product unpublished", body: `${e.productName}: this listing was unpublished by the marketplace team and is no longer shown publicly. Your draft and history are kept.`, link: `/supplier/products/${e.productId.toHexString()}/edit`, dedupeKey: `product-unpublished:${e.productId.toHexString()}:${e.revision}` });
    // a preference-suppressed or missing owner also returns false: after 3 tries it stops (the restriction and the audit row are what matter)
    await events.updateOne({ _id: id }, { $set: { "notice.state": sent || e.notice.attempts >= 2 ? "DONE" : "PENDING" }, $inc: { "notice.attempts": 1 } });
  }
}

/** Worker sweep: unfinished refresh or notice steps (bounded). */
export async function sweepVisibilityEvents(limit = 50): Promise<number> {
  const events = await visibilityEvents();
  const rows = await events.find({ $or: [{ "refresh.state": "PENDING" }, { "notice.state": "PENDING" }] }, { projection: { _id: 1 } }).sort({ createdAt: 1 }).limit(limit).toArray();
  for (const r of rows) await processVisibilityEvent(r._id).catch(() => undefined);
  return rows.length;
}

// ---------------------------------------------------------------- export
export const PRODUCT_EXPORT_MAX = 5000;
export async function exportProducts(q: ProductListQuery, caps: Caps): Promise<{ rows: ProductRow[]; truncated: boolean }> {
  const c = await col();
  const docs = await c.find(buildFilter(q), { projection: PROJECTION as never }).sort({ updatedAt: -1, _id: -1 }).limit(PRODUCT_EXPORT_MAX + 1).toArray();
  const names = await companyNames([...new Set(docs.map((d) => d.companyId.toHexString()))].map((h) => new ObjectId(h)));
  return { rows: docs.slice(0, PRODUCT_EXPORT_MAX).map((d) => rowOf(d, names, caps)).filter((r): r is ProductRow => r !== null), truncated: docs.length > PRODUCT_EXPORT_MAX };
}
