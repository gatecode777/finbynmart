import { ObjectId } from "mongodb";
import { getDb, getMongoClient } from "@/lib/db/mongo";
import { invalidateApproved } from "@/lib/catalog/approvedProducts";
import { getManagementCategories } from "@/lib/catalog/categories";
import { getProductsCollection, type SupplierProductDoc } from "@/lib/supplier/productService";
import { REJECTION_REASONS } from "@/lib/supplier/productDraftRules";
import { notifySellerOwnerByCompany } from "./productReviewNotice";

const PAGE = 20;

export interface PendingRow { reference: string; name: string; category: string; company: string; revision: number; submittedAt: string }
export interface ReviewDetail extends PendingRow {
  state: "PENDING" | "APPROVED" | "REJECTED";
  snapshot: { name: string; sku: string; description: string; categoryName: string; pricingMode: string; currency: string; unitPricePaise: number | null; priceUnit: string; moq: number | null; quantityUnit: string; images: { url: string; name: string }[] };
}

let idx: Promise<unknown> | undefined;
async function col() {
  const c = await getProductsCollection();
  idx ??= c.createIndex({ "draft.review.state": 1, "draft.review.submittedAt": 1, _id: 1 }, { name: "admin_product_review_queue", partialFilterExpression: { "draft.review.state": { $exists: true } } });
  await idx;
  return c;
}

async function companyNames(ids: ObjectId[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const db = await getDb();
  const comps = await db.collection<{ _id: ObjectId; ownerUserId: ObjectId }>("supplier_companies").find({ _id: { $in: ids } }, { projection: { ownerUserId: 1 } }).toArray();
  const users = await db.collection<{ _id: ObjectId; supplier?: { businessName?: string } }>("users").find({ _id: { $in: comps.map((c) => c.ownerUserId) } }, { projection: { supplier: 1 } }).toArray();
  const byUser = new Map(users.map((u) => [u._id.toHexString(), u.supplier?.businessName ?? "Supplier"]));
  return new Map(comps.map((c) => [c._id.toHexString(), byUser.get(c.ownerUserId.toHexString()) ?? "Supplier"]));
}

const rowOf = (d: SupplierProductDoc, names: Map<string, string>): PendingRow => ({
  reference: d._id.toHexString(), name: d.name, category: d.categoryName, company: names.get(d.companyId.toHexString()) ?? "Supplier",
  revision: d.draft!.review!.submittedRevision, submittedAt: d.draft!.review!.submittedAt.toISOString(),
});

/** Oldest first, 20 per page. Only the queue of PENDING submissions; drafts that were never submitted are not visible here. */
export async function listPending(page = 1): Promise<{ items: PendingRow[]; hasMore: boolean }> {
  const docs = await (await col())
    .find({ "draft.review.state": "PENDING" }, { projection: { name: 1, categoryName: 1, companyId: 1, "draft.review.submittedRevision": 1, "draft.review.submittedAt": 1, "draft.review.state": 1 } })
    .sort({ "draft.review.submittedAt": 1, _id: 1 })
    .skip((Math.max(1, Math.min(500, page)) - 1) * PAGE)
    .limit(PAGE + 1)
    .toArray();
  const slice = docs.slice(0, PAGE);
  const names = await companyNames([...new Set(slice.map((d) => d.companyId.toHexString()))].map((h) => new ObjectId(h)));
  return { items: slice.map((d) => rowOf(d, names)), hasMore: docs.length > PAGE };
}

/** The EXACT submitted snapshot, never the live draft. */
export async function getReview(reference: string): Promise<ReviewDetail | null> {
  if (!/^[a-f0-9]{24}$/.test(reference)) return null;
  const d = await (await col()).findOne({ _id: new ObjectId(reference), "draft.review": { $exists: true } });
  if (!d?.draft?.review) return null;
  const names = await companyNames([d.companyId]);
  const s = d.draft.review.snapshot as Record<string, unknown>;
  return { ...rowOf(d, names), state: d.draft.review.state, snapshot: { name: String(s.name ?? ""), sku: String(s.sku ?? ""), description: String(s.description ?? ""), categoryName: String(s.categoryName ?? ""), pricingMode: String(s.pricingMode ?? ""), currency: String(s.currency ?? "INR"), unitPricePaise: (s.unitPricePaise as number | null) ?? null, priceUnit: String(s.priceUnit ?? ""), moq: (s.moq as number | null) ?? null, quantityUnit: String(s.quantityUnit ?? ""), images: ((s.images as { url: string; name: string }[]) ?? []).map((i) => ({ url: i.url, name: i.name })) } };
}

export type DecideInput = { decision: "APPROVE" | "REJECT"; expectedRevision: number; reasonCode?: string; internalNote?: string };
export type DecideResult = { ok: true; state: "APPROVED" | "REJECTED" } | { ok: false; status: 404 | 409 | 422; message: string };

/**
 * Approve or reject the EXACT revision that was submitted. One transaction: a conditional update (state PENDING, the submitted revision still
 * the draft's revision) plus the audit row. Approving needs the category to still be active (category activation stays admin-controlled and is
 * never changed here) and sets `publication`, the one fact public discovery may use. Approving is not supplier verification. The reviewer is
 * always the signed-in admin; a supplier can never reach this function (separate capability and routes).
 */
export async function decide(adminId: ObjectId, reference: string, input: DecideInput): Promise<DecideResult> {
  if (!/^[a-f0-9]{24}$/.test(reference)) return { ok: false, status: 404, message: "Not found." };
  if (input.decision !== "APPROVE" && input.decision !== "REJECT") return { ok: false, status: 422, message: "Choose approve or reject." };
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) return { ok: false, status: 422, message: "expectedRevision is required." };
  if (input.decision === "REJECT" && !REJECTION_REASONS.some((r) => r.code === input.reasonCode)) return { ok: false, status: 422, message: "Choose a rejection reason from the list." };
  const note = (input.internalNote ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 500);
  const _id = new ObjectId(reference);
  const c = await col();
  const cur = await c.findOne({ _id });
  if (!cur?.draft?.review) return { ok: false, status: 404, message: "Not found." };
  if (cur.draft.review.state !== "PENDING") return { ok: false, status: 409, message: "This submission was already decided or withdrawn." };
  if (cur.draft.review.submittedRevision !== input.expectedRevision || cur.draft.revision !== input.expectedRevision) return { ok: false, status: 409, message: "The product changed after you opened it. Reload and review the current submission." };
  if (cur.draft.review.submittedBy.equals(adminId)) return { ok: false, status: 409, message: "You cannot decide your own submission." };
  if (input.decision === "APPROVE" && !getManagementCategories().some((n) => n.id === cur.draft!.categoryId)) return { ok: false, status: 409, message: "The category is not active, so this product cannot be approved." };

  const client = await getMongoClient();
  const session = client.startSession();
  let out: DecideResult | undefined;
  try {
    await session.withTransaction(
      async () => {
        out = undefined;
        const now = new Date();
        const set: Record<string, unknown> = { "draft.review.state": input.decision === "APPROVE" ? "APPROVED" : "REJECTED", "draft.review.decidedAt": now, "draft.review.decidedBy": adminId, updatedAt: now };
        if (input.decision === "REJECT") { set["draft.review.reasonCode"] = input.reasonCode; if (note) set["draft.review.internalNote"] = note; }
        if (input.decision === "APPROVE") set.publication = { state: "APPROVED", revision: input.expectedRevision, approvedAt: now, approvedBy: adminId, snapshot: cur.draft!.review!.snapshot };
        const upd = await c.findOneAndUpdate({ _id, "draft.review.state": "PENDING", "draft.review.submittedRevision": input.expectedRevision, "draft.revision": input.expectedRevision }, { $set: set }, { returnDocument: "after", session });
        if (!upd) { out = { ok: false, status: 409, message: "The product changed or was decided while you were reviewing. Reload and try again." }; return; }
        await (await getDb()).collection("admin_audit_log").insertOne({ _id: new ObjectId(), action: input.decision === "APPROVE" ? "PRODUCT_APPROVED" : "PRODUCT_REJECTED", actorId: adminId, productId: _id, companyId: cur.companyId, revision: input.expectedRevision, reasonCode: input.reasonCode ?? null, at: now }, { session });
        out = { ok: true, state: input.decision === "APPROVE" ? "APPROVED" : "REJECTED" };
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } finally {
    await session.endSession();
  }
  const r = out ?? ({ ok: false, status: 409, message: "Could not record the decision." } as DecideResult);
  // the decision is committed: public readers in this process see it at once (other instances converge within the snapshot TTL)
  if (r.ok) await invalidateApproved();
  if (r.ok) await notifySellerOwnerByCompany(cur.companyId, { type: r.state === "APPROVED" ? "PRODUCT_APPROVED" : "PRODUCT_REJECTED", title: r.state === "APPROVED" ? "Product approved" : "Product needs changes", body: `${cur.name}: ${r.state === "APPROVED" ? "your submission was approved." : "your submission was not approved. Open the product to see what to change."}`, link: `/supplier/products/${reference}/edit`, dedupeKey: `product:${reference}:${input.expectedRevision}:${r.state}` });
  return r;
}
